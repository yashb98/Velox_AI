# velox-api/tests/llm/test_quality.py
#
# 6.1 — DeepEval LLM quality gates.
#
# Metrics evaluated on every CI run:
#   - AnswerRelevancyMetric  (threshold 0.85) — answer addresses the question
#   - FaithfulnessMetric     (threshold 0.90) — answer stays within provided context
#   - HallucinationMetric    (threshold 0.10) — answer does NOT add invented facts
#   - ToxicityMetric         (threshold 0.05) — answer is safe and professional
#
# Run locally:
#   pip install -r requirements-dev.txt
#   export OPENAI_API_KEY=sk-...   # DeepEval uses GPT-4o as judge by default
#   python -m pytest tests/llm/test_quality.py -v
#
# In CI the OPENAI_API_KEY is injected via Secret Manager (see cloudbuild.yaml).

import json
import os
import pytest
from pathlib import Path

from deepeval import evaluate
from deepeval.metrics import (
    AnswerRelevancyMetric,
    FaithfulnessMetric,
    HallucinationMetric,
    ToxicityMetric,
)
from deepeval.test_case import LLMTestCase

# ─── Load golden dataset ──────────────────────────────────────────────────────

DATASET_PATH = Path(__file__).parent / "golden_dataset.json"

with open(DATASET_PATH) as f:
    GOLDEN: list[dict] = json.load(f)

# ─── Metrics ──────────────────────────────────────────────────────────────────

metrics = [
    AnswerRelevancyMetric(threshold=0.85, model="gpt-4o-mini"),
    FaithfulnessMetric(threshold=0.90, model="gpt-4o-mini"),
    HallucinationMetric(threshold=0.10, model="gpt-4o-mini"),
    ToxicityMetric(threshold=0.05, model="gpt-4o-mini"),
]

# ─── Test cases ───────────────────────────────────────────────────────────────

test_cases = [
    LLMTestCase(
        input=item["input"],
        actual_output=item["actual_output"],
        expected_output=item["expected_output"],
        retrieval_context=item.get("context", []),
    )
    for item in GOLDEN
]

# ─── pytest integration ───────────────────────────────────────────────────────

@pytest.mark.parametrize("test_case", test_cases, ids=[g["input"][:50] for g in GOLDEN])
def test_llm_quality(test_case: LLMTestCase):
    """
    Runs each golden test case through all 4 metrics.
    Fails the build if any metric falls below its threshold.
    """
    for metric in metrics:
        metric.measure(test_case)
        assert metric.success, (
            f"Metric '{metric.__class__.__name__}' FAILED for input: "
            f"'{test_case.input[:60]}'\n"
            f"Score: {metric.score:.3f} (threshold: {metric.threshold})\n"
            f"Reason: {metric.reason}"
        )
