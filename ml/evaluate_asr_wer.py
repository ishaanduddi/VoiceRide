#!/usr/bin/env python3
"""Word Error Rate (WER) evaluation for the ASR front-end.

Measures how badly motorcycle noise damages speech-to-text, per environment,
and — more usefully — how often the NLP layer still recovers the intended
command from a corrupted transcript.

Usage
-----
    python ml/evaluate_asr_wer.py

Input: ml/data/asr_samples.jsonl
    {"environment": "wind", "reference": "...", "hypothesis": "...", "intent": "..."}
"""

from __future__ import annotations

import json
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from nlp_reference import predict_fuzzy, predict_rule, tokenize  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_PATH = REPO_ROOT / "ml" / "data" / "asr_samples.jsonl"
OUT_PATH = REPO_ROOT / "ml" / "metrics" / "asr_wer.json"


def edit_distance(a: list[str], b: list[str]) -> int:
    previous = list(range(len(b) + 1))
    for i, token_a in enumerate(a, start=1):
        current = [i] + [0] * len(b)
        for j, token_b in enumerate(b, start=1):
            cost = 0 if token_a == token_b else 1
            current[j] = min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost)
        previous = current
    return previous[-1]


def word_error_rate(reference: str, hypothesis: str) -> float:
    reference_tokens = tokenize(reference)
    hypothesis_tokens = tokenize(hypothesis)
    if not reference_tokens:
        return 0.0 if not hypothesis_tokens else 1.0
    return edit_distance(reference_tokens, hypothesis_tokens) / len(reference_tokens)


def main() -> int:
    if not DATA_PATH.exists():
        raise SystemExit(f"missing dataset: {DATA_PATH}")

    rows = [
        json.loads(line)
        for line in DATA_PATH.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]

    per_environment: dict[str, list[dict]] = defaultdict(list)
    for row in rows:
        per_environment[str(row["environment"])].append(row)

    summary = {}
    print(f"{'environment':>12} {'n':>3} {'WER':>8} {'command recovery':>18}")
    print("-" * 44)

    for environment, samples in per_environment.items():
        wers = [word_error_rate(sample["reference"], sample["hypothesis"]) for sample in samples]

        recovered = 0
        for sample in samples:
            expected = sample["intent"]
            predicted_rule = predict_rule(sample["hypothesis"])
            predicted_fuzzy = predict_fuzzy(sample["hypothesis"])
            if expected in (predicted_rule, predicted_fuzzy):
                recovered += 1

        mean_wer = sum(wers) / len(wers)
        recovery = recovered / len(samples)
        summary[environment] = {
            "samples": len(samples),
            "wer": mean_wer,
            "commandRecoveryRate": recovery,
        }
        print(f"{environment:>12} {len(samples):>3} {mean_wer:>8.3f} {recovery:>17.0%}")

    overall_wer = sum(word_error_rate(row["reference"], row["hypothesis"]) for row in rows) / len(rows)
    summary["overall"] = {"samples": len(rows), "wer": overall_wer}
    print("-" * 44)
    print(f"{'overall':>12} {len(rows):>3} {overall_wer:>8.3f}")

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(f"\nWrote {OUT_PATH.relative_to(REPO_ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
