"""Research-only HTTP adapter for Kai's Qwen2.5-VL ScienceQA LoRA.

The model and checkpoint stay in the separate VLM project. This process only
loads them and exposes a bounded multiple-choice visual-observation endpoint.
"""

from __future__ import annotations

import argparse
import base64
import binascii
import hmac
import importlib
import io
import json
import os
import re
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

MAX_REQUEST_BYTES = 768 * 1024
MAX_IMAGE_BYTES = 512 * 1024
VALID_MIME_TYPES = {"image/png", "image/jpeg", "image/webp"}
VALID_LABELS = ("A", "B", "C", "D")


class RequestError(ValueError):
    def __init__(self, status: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.code = code


def parse_choice_label(text: str) -> str | None:
    normalized = " ".join(text.strip().upper().split())
    direct = re.fullmatch(r"\(?([A-D])\)?[.。]?", normalized)
    if direct:
        return direct.group(1)
    matches = sorted(set(re.findall(r"(?:答案|ANSWER)(?:\s+IS|是|为)?\s*[:：]?\s*\(?([A-D])\)?", normalized)))
    return matches[0] if len(matches) == 1 else None


def validate_observation_request(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise RequestError(400, "INVALID_REQUEST", "Request body must be a JSON object")
    image = value.get("image")
    if not isinstance(image, dict) or image.get("mimeType") not in VALID_MIME_TYPES:
        raise RequestError(400, "INVALID_IMAGE", "A PNG, JPEG or WebP image is required")
    encoded = image.get("base64")
    if not isinstance(encoded, str):
        raise RequestError(400, "INVALID_IMAGE", "Image base64 is required")
    try:
        image_bytes = base64.b64decode(encoded, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise RequestError(400, "INVALID_IMAGE", "Image base64 is invalid") from exc
    if not image_bytes or len(image_bytes) > MAX_IMAGE_BYTES:
        raise RequestError(413, "IMAGE_TOO_LARGE", "Image must be between 1 byte and 512KB")
    question = value.get("question")
    if not isinstance(question, str) or not 10 <= len(question) <= 300:
        raise RequestError(400, "INVALID_QUESTION", "Question length must be between 10 and 300")
    choices = value.get("choices")
    if not isinstance(choices, list) or len(choices) != 4:
        raise RequestError(400, "INVALID_CHOICES", "Exactly four choices are required")
    normalized_choices = []
    for index, choice in enumerate(choices):
        if not isinstance(choice, dict) or choice.get("label") != VALID_LABELS[index]:
            raise RequestError(400, "INVALID_CHOICES", "Choices must be ordered A through D")
        text = choice.get("text")
        if not isinstance(text, str) or not 1 <= len(text) <= 500:
            raise RequestError(400, "INVALID_CHOICES", "Choice text length is invalid")
        normalized_choices.append({"label": VALID_LABELS[index], "text": text})
    return {
        "mime_type": image["mimeType"],
        "image_bytes": image_bytes,
        "question": question,
        "choices": normalized_choices,
    }


class QwenScienceQaEngine:
    def __init__(self, project_path: Path, config_path: Path, checkpoint_path: Path) -> None:
        if not project_path.is_dir():
            raise RuntimeError(f"VLM project not found: {project_path}")
        if not config_path.is_file():
            raise RuntimeError(f"VLM config not found: {config_path}")
        if not (checkpoint_path / "adapter_model.safetensors").is_file():
            raise RuntimeError(f"VLM adapter not found: {checkpoint_path}")
        sys.path.insert(0, str(project_path / "src"))
        config_module = importlib.import_module("vlm_sft.config")
        modeling_module = importlib.import_module("vlm_sft.modeling")
        runtime_module = importlib.import_module("vlm_sft.runtime")
        self._torch = importlib.import_module("torch")
        self._image_module = importlib.import_module("PIL.Image")
        self.config = config_module.load_config(config_path)
        self.device = runtime_module.resolve_device(self.config["device"])
        self.processor = modeling_module.build_processor(self.config)
        self.model, _ = modeling_module.build_model(
            self.config,
            self.device,
            checkpoint=checkpoint_path,
            trainable=False,
        )
        self.model.eval()
        self.checkpoint = str(checkpoint_path)
        self.model_name = f'{self.config["model_id"]} + {checkpoint_path.parent.parent.name}'
        self._lock = threading.Lock()

    def observe(self, request: dict[str, Any]) -> dict[str, Any]:
        image = self._image_module.open(io.BytesIO(request["image_bytes"])).convert("RGB")
        choice_text = "\n".join(f'{choice["label"]}. {choice["text"]}' for choice in request["choices"])
        prompt = f'{request["question"]}\n{choice_text}\n只输出 A、B、C 或 D。'
        messages = [{
            "role": "user",
            "content": [
                {"type": "image", "image": image},
                {"type": "text", "text": prompt},
            ],
        }]
        rendered = self.processor.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
        inputs = self.processor(text=[rendered], images=[image], padding=True, return_tensors="pt")
        tensors = {key: value.to(self.device) for key, value in inputs.items() if hasattr(value, "to")}
        started_at = time.perf_counter()
        with self._lock, self._torch.no_grad():
            generated = self.model.generate(
                **tensors,
                do_sample=False,
                max_new_tokens=8,
                pad_token_id=self.processor.tokenizer.pad_token_id,
                eos_token_id=self.processor.tokenizer.eos_token_id,
            )
        new_tokens = generated[0, tensors["input_ids"].shape[1]:]
        raw_text = self.processor.tokenizer.decode(new_tokens, skip_special_tokens=True).strip()
        label = parse_choice_label(raw_text)
        input_tokens = int(tensors["attention_mask"].sum().item()) if "attention_mask" in tensors else int(tensors["input_ids"].shape[1])
        output_tokens = int(new_tokens.shape[0])
        return {
            "label": label,
            "rawText": raw_text[:500],
            "model": self.model_name,
            "checkpoint": self.checkpoint,
            "latencyMs": round((time.perf_counter() - started_at) * 1000),
            "usage": {
                "inputTokens": input_tokens,
                "outputTokens": output_tokens,
            },
        }


class VlmHandler(BaseHTTPRequestHandler):
    server_version = "KaiVlmResearchBridge/1.0"

    def log_message(self, format_string: str, *args: object) -> None:
        print(f"{self.address_string()} - {format_string % args}", file=sys.stderr)

    def _json(self, status: int, payload: dict[str, Any]) -> None:
        encoded = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json; charset=utf-8")
        self.send_header("content-length", str(len(encoded)))
        self.send_header("cache-control", "no-store")
        self.send_header("x-content-type-options", "nosniff")
        self.end_headers()
        self.wfile.write(encoded)

    def _authorized(self) -> bool:
        expected = getattr(self.server, "api_key", None)
        if not expected:
            return True
        supplied = self.headers.get("authorization", "")
        return hmac.compare_digest(supplied, f"Bearer {expected}")

    def do_GET(self) -> None:
        if self.path != "/health":
            return self._json(404, {"ok": False, "error": {"code": "NOT_FOUND"}})
        if not self._authorized():
            return self._json(401, {"ok": False, "error": {"code": "UNAUTHORIZED"}})
        engine = getattr(self.server, "engine")
        self._json(200, {
            "ok": True,
            "ready": True,
            "service": "kai-vlm-research-bridge",
            "model": engine.model_name,
            "researchOnly": True,
        })

    def do_POST(self) -> None:
        if self.path != "/v1/observe":
            return self._json(404, {"ok": False, "error": {"code": "NOT_FOUND"}})
        if not self._authorized():
            return self._json(401, {"ok": False, "error": {"code": "UNAUTHORIZED"}})
        try:
            length = int(self.headers.get("content-length", "0"))
            if length < 1 or length > MAX_REQUEST_BYTES:
                raise RequestError(413, "REQUEST_TOO_LARGE", "Request exceeds 768KB")
            payload = json.loads(self.rfile.read(length))
            request = validate_observation_request(payload)
            result = getattr(self.server, "engine").observe(request)
            if result["label"] is None:
                raise RequestError(422, "UNPARSEABLE_OUTPUT", "Model did not return one A-D label")
            self._json(200, {"ok": True, "result": result})
        except RequestError as exc:
            self._json(exc.status, {"ok": False, "error": {"code": exc.code, "message": str(exc)}})
        except (json.JSONDecodeError, UnicodeDecodeError):
            self._json(400, {"ok": False, "error": {"code": "INVALID_JSON"}})
        except Exception as exc:  # preserve the boundary without leaking internals
            print(f"inference failure: {type(exc).__name__}: {exc}", file=sys.stderr)
            self._json(500, {"ok": False, "error": {"code": "INFERENCE_FAILED"}})


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Serve Kai's ScienceQA VLM as a bounded research observer")
    parser.add_argument("--project", default=os.environ.get("KAI_VLM_PROJECT_PATH"))
    parser.add_argument("--config", default=os.environ.get("KAI_VLM_CONFIG"))
    parser.add_argument("--checkpoint", default=os.environ.get("KAI_VLM_CHECKPOINT"))
    parser.add_argument("--host", default=os.environ.get("KAI_VLM_HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("KAI_VLM_PORT", "4420")))
    parser.add_argument("--api-key", default=os.environ.get("KAI_VLM_API_KEY"))
    parser.add_argument("--acknowledge-research-only", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if not args.acknowledge_research_only:
        raise SystemExit("Refusing to start: pass --acknowledge-research-only after reviewing the ScienceQA/model licenses")
    if not args.project or not args.config or not args.checkpoint:
        raise SystemExit("--project, --config and --checkpoint are required")
    if args.host not in {"127.0.0.1", "::1", "localhost"} and not args.api_key:
        raise SystemExit("KAI_VLM_API_KEY is required for a non-loopback bind")
    engine = QwenScienceQaEngine(Path(args.project).resolve(), Path(args.config).resolve(), Path(args.checkpoint).resolve())
    server = ThreadingHTTPServer((args.host, args.port), VlmHandler)
    server.engine = engine  # type: ignore[attr-defined]
    server.api_key = args.api_key  # type: ignore[attr-defined]
    print(f"KAI VLM research bridge listening on http://{args.host}:{args.port}")
    print(f"Model: {engine.model_name}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
