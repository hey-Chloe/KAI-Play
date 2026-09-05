# KAI Play VLM Integration

## What is connected

KAI Play can send a rendered 512×340 farm observation frame through its authenticated backend to Kai's separate Qwen2.5-VL-3B-Instruct + ScienceQA LoRA service. The backend builds a bounded four-choice visual consistency question from the same RPC state, randomizes the correct answer position by revision, and maps the model's selected choice back into a structured farm observation containing day, resources, six plot states, frame revision, latency and measured input/output token counts.

This is a real model-provider seam and a real raster input. It is **not** an end-to-end visual game policy: action selection comes from a deterministic hierarchical/Skill + Memory baseline or the bounded UCT-MCTS policy. The structured VLM result can now participate in execution through the explicit visual modes below. The ScienceQA adapter has not been trained or evaluated on KAI Farm screenshots, so its result remains a cross-domain observation experiment rather than strategy competence.

## Agent execution modes

- **视觉旁路 / shadow (default):** manual VLM observations are recorded and exposed for evaluation. A disagreement never changes the rule-engine action, so the original deterministic demonstration remains reproducible.
- **视觉守卫 / guard (opt-in):** every action requires a fresh VLM observation. If the model disagrees with RPC truth or the service is unavailable, KAI Play does not mutate the game state. It writes a `VLM_RPC_MISMATCH` or `VLM_UNAVAILABLE` trajectory entry, increments visual block/replan metrics, stores the conflict in episode memory, pauses continuous execution and waits for a new observation or human confirmation.

Guard mode is intentionally an execution safety gate, not proof that the VLM can plan. Continuous guard execution performs the first observation immediately, then waits 5.2 seconds between later observations to remain within the server's 12-observations-per-minute limit.

## Safety defaults

- `DOUJOY_VLM_MODE=disabled` by default.
- Browser callers never receive or send the upstream VLM API key.
- The game server accepts only PNG, JPEG, or WebP frames up to 512KB and creates the prompt itself.
- Observation calls require a KAI Play session and are limited to 12 per minute per user/address.
- A timeout, malformed output, missing model, or unavailable GPU fails closed; the rule/RPC observation remains available.
- Model weights and LoRA files stay outside this repository.

## Research-only license boundary

The selected adapter was trained on ScienceQA material recorded by the VLM project as `CC-BY-NC-SA-4.0`, and that project locks the model use to non-commercial research/evaluation. Do not enable this checkpoint for a commercial public service. Replace it with a checkpoint and dataset whose licenses permit the intended use, then run a KAI Farm domain evaluation before making production claims.

## Start the VLM service on a CUDA machine

The verified default checkpoint for this bridge is the recovered Random-1000 seed 6502 run. Set paths for the separate VLM checkout; do not copy the weights into KAI Play.

```bash
export VLM_PROJECT=/absolute/path/to/vlm-data-selection
export VLM_CONFIG="$VLM_PROJECT/artifacts/gpu_plan/qwen25vl3b_scienceqa_random1k_seed6502/config.resolved.json"
export VLM_CHECKPOINT="$VLM_PROJECT/artifacts/gpu_plan/qwen25vl3b_scienceqa_random1k_seed6502/checkpoints/step-000125"
export KAI_VLM_API_KEY='generate-a-long-random-secret'

"$VLM_PROJECT/.venv/bin/python" services/vlm_service.py \
  --project "$VLM_PROJECT" \
  --config "$VLM_CONFIG" \
  --checkpoint "$VLM_CHECKPOINT" \
  --api-key "$KAI_VLM_API_KEY" \
  --acknowledge-research-only
```

The pinned base model revision is `66285546d2b821cf421d4f5eb2576359d3770cd3`. The serving machine must have that full base checkpoint available, not only tokenizer/config metadata. The recovered training run used CUDA BF16 and Flash Attention 2; this repository does not claim real-time CPU or unsupported MPS serving.

For a non-loopback bind, the service refuses to start without an API key. Put TLS and an authenticated private network in front of it if KAI Play and the VLM run on different hosts.

## Connect KAI Play

```bash
export DOUJOY_VLM_MODE=http
export DOUJOY_VLM_URL=http://127.0.0.1:4420
export DOUJOY_VLM_TIMEOUT_MS=30000
export DOUJOY_VLM_API_KEY="$KAI_VLM_API_KEY"
npm run server
```

Start the Web server normally. There are now two integration surfaces:

- Open **KAI 农场** for the player-facing integration. If the endpoint is ready, **帮我走一步** and **开始托管** automatically require a fresh guarded VLM observation before each real farm action. If the endpoint is disabled, the panel truthfully identifies **结构化模式**.
- Open **Agent** for the complete research surface and explicit shadow/guard experiments.

In Agent Lab:

1. Wait for “VLM 在线”.
2. Select **VLM 观察一帧** to inspect the model without affecting execution.
3. Select **视觉旁路** to switch to **视觉守卫 开**.
4. Run one step or continuous execution. Each guarded action receives a fresh frame; disagreement or service failure pauses before mutation.

The frame shown in the panel is the exact raster sent to the model. The UI reports the selected structured state, RPC answer, agreement count, block count, model identity, measured token use and average latency. These metrics are session-local research telemetry, not a production SLA.

When KAI Play runs in Docker and the VLM runs on the host, `127.0.0.1` points to the container rather than the host. Configure a reachable private host address explicitly; do not expose the research service directly to the public internet.

## Frozen KAI Farm evaluation

`evals/kai-farm-vlm-v1/manifest.json` freezes six project-generated 512×340 PNG states covering empty, growing, watered, dry, ready, weed, long-horizon strawberry and final-day compositions. Every frame has a SHA-256 digest and exact RPC truth. The images are deterministic synthetic fixtures aligned with the Agent Lab observation surface; they are not real-player screenshots.

Regenerate them reproducibly:

```bash
npm run agent:vlm-fixtures
```

With KAI Play connected to a ready VLM service, run the authenticated online evaluation:

```bash
npm run agent:vlm-eval -- --url http://127.0.0.1:4310 \
  --output /tmp/kai-farm-vlm-report.json
```

The report records manifest hash, provider-reported model/checkpoint, per-frame answer, accuracy, errors, P50/P95 latency and measured input/output token totals. A report created against a mock provider proves only the runner contract. A research result requires the real checkpoint on the serving host plus preserved host/GPU/model evidence.

## Verification

```bash
npm run test
npm run verify
python3 -m unittest test/vlm_service_python_test.py
npm run agent:vlm-fixtures
```

Unit and HTTP integration tests use a deterministic fake upstream. A true checkpoint-loaded GPU run is a separate acceptance gate and must record the GPU, checkpoint hash, frame set, accuracy, latency, and failure rate.

The deterministic tests additionally prove that shadow mode preserves the original action, while guard mode preserves the complete game snapshot when the visual result conflicts or the provider is unavailable. They do not prove game-domain visual accuracy because the real checkpoint cannot be evaluated without the full base weights and a supported GPU.
