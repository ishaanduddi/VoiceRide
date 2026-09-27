#!/usr/bin/env python3
"""Evaluate the exported on-device intent model and compare approaches.

Runs the SAME held-out split used during training and reports, on that split:

  * accuracy / precision / recall / F1 / confusion matrix  for the ML model
  * the same metrics for three approaches side by side:
        1. exact / rule-based (keyword containment)
        2. fuzzy matching only
        3. ML (TF-IDF + Logistic Regression, as exported to the app)

The ML transform below is a port of `tfidfVector()` in
src/nlp/intentClassifier/classifier.ts and consumes the exported model.json, so
this validates the artifact that actually ships.

Usage
-----
    python ml/train_intent_classifier.py
    python ml/evaluate_intent_classifier.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix
from sklearn.model_selection import train_test_split

sys.path.insert(0, str(Path(__file__).resolve().parent))

from nlp_reference import INTENTS, normalize, predict_fuzzy, predict_rule, rule_scores, tokenize  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_PATH = REPO_ROOT / "ml" / "data" / "commands.jsonl"
MODEL_PATH = REPO_ROOT / "src" / "nlp" / "intentClassifier" / "model.json"
OUT_PATH = REPO_ROOT / "ml" / "metrics" / "intent_metrics.json"

TEST_SIZE = 0.3
SEED = 42


def load_dataset(path: Path) -> tuple[list[str], list[str]]:
    texts: list[str] = []
    labels: list[str] = []
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        row = json.loads(line)
        texts.append(str(row["text"]))
        labels.append(str(row["intent"]))
    return texts, labels


def ml_features(text: str) -> list[str]:
    """Unigrams + adjacent bigrams (mirrors ngram_range=(1, 2))."""
    words = tokenize(text.lower())
    return words + [f"{words[i]} {words[i + 1]}" for i in range(len(words) - 1)]


def transform(text: str, vocab: dict[str, int], idf: list[float]) -> np.ndarray:
    vector = np.zeros(len(idf), dtype=float)
    counts: dict[int, int] = {}
    for feature in ml_features(text):
        index = vocab.get(feature)
        if index is None:
            continue
        counts[index] = counts.get(index, 0) + 1

    for index, count in counts.items():
        vector[index] = count * idf[index]

    norm = float(np.linalg.norm(vector))
    return vector / norm if norm > 0 else vector


def softmax(logits: np.ndarray) -> np.ndarray:
    shifted = logits - np.max(logits)
    exponentials = np.exp(shifted)
    return exponentials / exponentials.sum()


class ExportedModel:
    """Loads model.json and runs inference exactly like the mobile app."""

    def __init__(self, model: dict) -> None:
        self.classes: list[str] = list(model["classes"])
        self.vocab: dict[str, int] = {str(k): int(v) for k, v in model["vocab"].items()}
        self.idf: list[float] = [float(v) for v in model["idf"]]
        self.coef = np.asarray(model["coef"], dtype=float)
        self.intercept = np.asarray(model["intercept"], dtype=float)

    def probabilities(self, text: str) -> dict[str, float]:
        vector = transform(text, self.vocab, self.idf)
        logits = self.coef @ vector + self.intercept
        probabilities = softmax(logits)
        return {name: float(value) for name, value in zip(self.classes, probabilities)}

    def predict(self, texts: list[str]) -> list[str]:
        return [self.predict_one(text) for text in texts]

    def predict_one(self, text: str) -> str:
        probabilities = self.probabilities(text)
        return max(probabilities, key=lambda key: probabilities[key])


# Fusion weights — must match ML_WEIGHT / RULE_WEIGHT in classifier.ts.
ML_WEIGHT = 0.65
RULE_WEIGHT = 0.35


def hybrid_scores(text: str, model: ExportedModel) -> dict[str, float]:
    """Reproduces classifyIntent() in src/nlp/intentClassifier/classifier.ts."""
    ml_probabilities = model.probabilities(text)
    rules = rule_scores(normalize(text)["canonicalText"])
    return {
        intent: ML_WEIGHT * ml_probabilities.get(intent, 0.0) + RULE_WEIGHT * rules.get(intent, 0.0)
        for intent in INTENTS
    }


def predict_hybrid(text: str, model: ExportedModel) -> str:
    return _argmax(hybrid_scores(text, model))


def _argmax(scores: dict[str, float], threshold: float = 0.2) -> str:
    if not scores:
        return "UNKNOWN"
    intent = max(scores, key=lambda key: scores[key])
    return intent if scores[intent] >= threshold else "UNKNOWN"


def summarise(name: str, truth: list[str], predicted: list[str], labels: list[str]) -> dict:
    accuracy = float(accuracy_score(truth, predicted))
    report = classification_report(truth, predicted, labels=labels, zero_division=0, output_dict=True)
    matrix = confusion_matrix(truth, predicted, labels=labels).tolist()

    print(f"\n=== {name} ===")
    print(f"accuracy: {accuracy:.3f}   macro-F1: {report['macro avg']['f1-score']:.3f}")
    print(classification_report(truth, predicted, labels=labels, zero_division=0))
    print("confusion matrix")
    print(f"{'':>16}" + "".join(f"{label[:7]:>9}" for label in labels))
    for label, row in zip(labels, matrix):
        print(f"{label:>16}" + "".join(f"{value:>9}" for value in row))

    return {
        "accuracy": accuracy,
        "macroF1": float(report["macro avg"]["f1-score"]),
        "weightedF1": float(report["weighted avg"]["f1-score"]),
        "perIntent": {label: report[label] for label in labels if label in report},
        "confusionMatrix": {"labels": labels, "matrix": matrix},
    }


def main() -> int:
    if not MODEL_PATH.exists():
        raise SystemExit("model.json not found — run `python ml/train_intent_classifier.py` first.")

    texts, labels = load_dataset(DATA_PATH)
    _x_train, x_test, _y_train, y_test = train_test_split(
        texts, labels, test_size=TEST_SIZE, random_state=SEED, stratify=labels
    )

    model = ExportedModel(json.loads(MODEL_PATH.read_text(encoding="utf-8")))
    present_labels = sorted(set(labels))

    baseline_exact = [predict_rule(text) for text in x_test]
    baseline_fuzzy = [predict_fuzzy(text) for text in x_test]
    ml_predictions = model.predict(x_test)
    hybrid_predictions = [predict_hybrid(text, model) for text in x_test]

    results = {
        "heldOutSize": len(x_test),
        "labels": present_labels,
        "exactRule": summarise("Exactly / rule-based matching", y_test, baseline_exact, present_labels),
        "fuzzyOnly": summarise("Fuzzy matching only", y_test, baseline_fuzzy, present_labels),
        "mlOnly": summarise("ML only (exported model.json)", y_test, ml_predictions, present_labels),
        "hybridOnDevice": summarise("Hybrid ML + rules (on-device path)", y_test, hybrid_predictions, present_labels),
        "mlOnlyFromTraining": json.loads(MODEL_PATH.read_text(encoding="utf-8")).get("metrics"),
    }

    print("\n=== Comparison (held-out accuracy) ===")
    print(f"exact/rule : {results['exactRule']['accuracy']:.3f}")
    print(f"fuzzy only : {results['fuzzyOnly']['accuracy']:.3f}")
    print(f"ML only    : {results['mlOnly']['accuracy']:.3f}")
    print(f"hybrid     : {results['hybridOnDevice']['accuracy']:.3f}   <- ships in the app")

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(results, indent=2), encoding="utf-8")
    print(f"\nWrote {OUT_PATH.relative_to(REPO_ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
