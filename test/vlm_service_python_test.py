import base64
import importlib.util
import unittest
from pathlib import Path

MODULE_PATH = Path(__file__).parents[1] / "services" / "vlm_service.py"
SPEC = importlib.util.spec_from_file_location("kai_vlm_service", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


class VlmServiceContractTest(unittest.TestCase):
    def test_choice_parser_is_strict(self):
        self.assertEqual(MODULE.parse_choice_label("A"), "A")
        self.assertEqual(MODULE.parse_choice_label("答案是 C。"), "C")
        self.assertEqual(MODULE.parse_choice_label("The answer is D."), "D")
        self.assertIsNone(MODULE.parse_choice_label("A or B"))
        self.assertIsNone(MODULE.parse_choice_label("I cannot tell"))

    def test_request_validation_accepts_bounded_image_and_ordered_choices(self):
        request = MODULE.validate_observation_request({
            "image": {"mimeType": "image/png", "base64": base64.b64encode(b"png").decode()},
            "question": "Which description matches this farm image?",
            "choices": [{"label": label, "text": f"choice {label}"} for label in "ABCD"],
        })
        self.assertEqual(request["image_bytes"], b"png")
        self.assertEqual(len(request["choices"]), 4)

    def test_request_validation_rejects_prompt_and_image_abuse(self):
        with self.assertRaises(MODULE.RequestError):
            MODULE.validate_observation_request({})
        with self.assertRaises(MODULE.RequestError):
            MODULE.validate_observation_request({
                "image": {"mimeType": "image/svg+xml", "base64": "PHN2Zy8+"},
                "question": "Which description matches this farm image?",
                "choices": [{"label": label, "text": label} for label in "ABCD"],
            })


if __name__ == "__main__":
    unittest.main()
