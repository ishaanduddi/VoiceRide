#!/usr/bin/env python3
"""Train the VoiceRiders intent classifier and export on-device weights.

Pipeline
--------
  ml/data/commands.jsonl
      -> TfidfVectorizer(ngram_range=(1,2), token_pattern=r"(?u)\\b\\w+\\b")
      -> LogisticRegression
      -> src/nlp/intentClassifier/model.json   (vocab + idf + coef + intercept)

The exported JSON is what `src/nlp/intentClassifier/classifier.ts` loads, and
`tfidfVector` there reproduces the vectorizer transform exactly, so the model
behaves on-device the way it behaved in evaluation.

Usage
-----
    python ml/train_intent_classifier.py

Dependencies: scikit-learn (see ml/requirements.txt).
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
from pathlib import Path

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix
from sklearn.model_selection import train_test_split

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_PATH = REPO_ROOT / "ml" / "data" / "commands.jsonl"
MODEL_PATH = REPO_ROOT / "src" / "nlp" / "intentClassifier" / "model.json"
METRICS_PATH = REPO_ROOT / "ml" / "metrics" / "train_metrics.json"

TOKEN_PATTERN = r"(?u)\b\w+\b"
NGRAM_RANGE = (1, 2)


def load_dataset(path: Path) -> tuple[list[str], list[str]]:
    texts: list[str] = []
    labels: list[str] = []

    for line_number, raw_line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError as error:
            raise SystemExit(f"{path}:{line_number}: invalid JSON ({error})") from error

        text = str(row.get("text", "")).strip()
        intent = str(row.get("intent", "")).strip()
        if not text or not intent:
            raise SystemExit(f"{path}:{line_number}: both 'text' and 'intent' are required")

        texts.append(text)
        labels.append(intent)

    return texts, labels


def main() -> int:
    parser = argparse.ArgumentParser(description="Train the VoiceRiders intent classifier")
    parser.add_argument("--test-size", type=float, default=0.3, help="held-out fraction")
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    texts, labels = load_dataset(DATA_PATH)
    print(f"Dataset: {len(texts)} utterances, {len(set(labels))} intents")

    x_train, x_test, y_train, y_test = train_test_split(
        texts,
        labels,
        test_size=args.test_size,
        random_state=args.seed,
        stratify=labels,
    )

    vectorizer = TfidfVectorizer(
        lowercase=True,
        token_pattern=TOKEN_PATTERN,
        ngram_range=NGRAM_RANGE,
        norm="l2",
        use_idf=True,
        smooth_idf=True,
        sublinear_tf=False,
    )
    x_train_vector = vectorizer.fit_transform(x_train)
    x_test_vector = vectorizer.transform(x_test)

    classifier = LogisticRegression(
        max_iter=5000,
        C=10.0,
        class_weight="balanced",
        random_state=args.seed,
    )
    classifier.fit(x_train_vector, y_train)

    predictions = classifier.predict(x_test_vector)
    accuracy = float(accuracy_score(y_test, predictions))

    intents = sorted(set(labels))
    report = classification_report(y_test, predictions, labels=intents, zero_division=0, output_dict=True)
    matrix = confusion_matrix(y_test, predictions, labels=intents).tolist()

    print(f"\nHeld-out accuracy: {accuracy:.3f}")
    print(classification_report(y_test, predictions, labels=intents, zero_division=0))
    print("Confusion matrix (rows = truth, cols = predicted)")
    print(f"{'':>16}" + "".join(f"{intent[:7]:>9}" for intent in intents))
    for intent, row in zip(intents, matrix):
        print(f"{intent:>16}" + "".join(f"{value:>9}" for value in row))

    # ------------------------------------------------------------------ #
    # Export for on-device linear inference
    # ------------------------------------------------------------------ #
    model = {
        "version": 1,
        "trainedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
        "classes": list(classifier.classes_),
        "vocab": {str(term): int(index) for term, index in vectorizer.vocabulary_.items()},
        "idf": [float(value) for value in vectorizer.idf_],
        "coef": np.asarray(classifier.coef_, dtype=float).tolist(),
        "intercept": np.asarray(classifier.intercept_, dtype=float).tolist(),
        "vectorizer": {
            "tokenPattern": TOKEN_PATTERN,
            "ngramRange": list(NGRAM_RANGE),
            "norm": "l2",
            "smoothIdf": True,
        },
        "metrics": {
            "heldOutAccuracy": accuracy,
            "macroF1": float(report["macro avg"]["f1-score"]),
            "weightedF1": float(report["weighted avg"]["f1-score"]),
            "testSize": len(x_test),
            "trainSize": len(x_train),
            "randomState": args.seed,
        },
        "note": "Generated by ml/train_intent_classifier.py. Do not edit by hand.",
    }

    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    MODEL_PATH.write_text(json.dumps(model, indent=2), encoding="utf-8")

    METRICS_PATH.parent.mkdir(parents=True, exist_ok=True)
    METRICS_PATH.write_text(
        json.dumps(
            {
                "generatedAt": model["trainedAt"],
                "accuracy": accuracy,
                "macroF1": float(report["macro avg"]["f1-score"]),
                "perIntent": {intent: report[intent] for intent in intents if intent in report},
                "confusionMatrix": {"labels": intents, "matrix": matrix},
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    print(f"\nWrote {MODEL_PATH.relative_to(REPO_ROOT)}")
    print(f"Wrote {METRICS_PATH.relative_to(REPO_ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
