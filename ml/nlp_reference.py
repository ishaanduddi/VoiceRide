"""Reference implementation of VoiceRiders' text normalization + rule/fuzzy baselines.

This is a Python port of the TypeScript pipeline in ``src/nlp``. It reads the
SAME lexicon files that the app imports, so evaluation results reflect the
behaviour that ships on the phone instead of a re-implementation that drifts.

Used by:
  * ml/train_intent_classifier.py
  * ml/evaluate_intent_classifier.py
"""

from __future__ import annotations

import json
import re
from difflib import SequenceMatcher
from pathlib import Path
from typing import Optional

REPO_ROOT = Path(__file__).resolve().parent.parent
SHARED_DIR = REPO_ROOT / "src" / "nlp" / "shared"

with (SHARED_DIR / "lexicon.json").open(encoding="utf-8") as handle:
    LEXICON = json.load(handle)
with (SHARED_DIR / "intentKeywords.json").open(encoding="utf-8") as handle:
    INTENT_KEYWORDS = json.load(handle)

STOP_WORDS = set(LEXICON["stopWords"])
TOKEN_SYNONYMS: dict[str, str] = LEXICON["tokenSynonyms"]
PHRASE_REWRITES = [(re.compile(pattern), replacement) for pattern, replacement in LEXICON["phraseRewrites"]]

INTENTS: list[str] = [
    "INCREASE_VOLUME",
    "DECREASE_VOLUME",
    "PLAY",
    "PAUSE",
    "RESUME",
    "NEXT_SONG",
    "PREVIOUS_SONG",
    "PLAY_SONG",
    "STOP",
    "UNKNOWN",
]

# --------------------------------------------------------------------------- #
# Spoken numbers (mirror of src/nlp/preprocessing/numberWords.ts)
# --------------------------------------------------------------------------- #

UNITS = {
    "zero": 0, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6,
    "seven": 7, "eight": 8, "nine": 9, "ten": 10, "eleven": 11, "twelve": 12,
    "thirteen": 13, "fourteen": 14, "fifteen": 15, "sixteen": 16, "seventeen": 17,
    "eighteen": 18, "nineteen": 19,
}
TENS = {
    "twenty": 20, "thirty": 30, "forty": 40, "fifty": 50,
    "sixty": 60, "seventy": 70, "eighty": 80, "ninety": 90,
}
SCALES = {"hundred": 100, "thousand": 1000}
ORDINAL_UNITS = {
    "first": 1, "second": 2, "third": 3, "fourth": 4, "fifth": 5, "sixth": 6,
    "seventh": 7, "eighth": 8, "ninth": 9, "tenth": 10, "eleventh": 11,
    "twelfth": 12, "thirteenth": 13, "fourteenth": 14, "fifteenth": 15,
    "sixteenth": 16, "seventeenth": 17, "eighteenth": 18, "nineteenth": 19,
}
ORDINAL_TENS = {
    "twentieth": 20, "thirtieth": 30, "fortieth": 40, "fiftieth": 50,
    "sixtieth": 60, "seventieth": 70, "eightieth": 80, "ninetieth": 90,
}


def is_number_word(word: str) -> bool:
    return (
        word == "and"
        or word in UNITS
        or word in TENS
        or word in SCALES
        or word in ORDINAL_UNITS
        or word in ORDINAL_TENS
    )


def parse_number_words(words: list[str]) -> Optional[int]:
    """Parses a run of number words; ordinals terminate the run."""
    value = 0
    matched = False
    i = 0

    while i < len(words):
        word = words[i]

        if word in ORDINAL_UNITS:
            value += ORDINAL_UNITS[word]
            matched = True
            break

        if word in ORDINAL_TENS:
            value += ORDINAL_TENS[word]
            matched = True
            if i + 1 < len(words) and words[i + 1] in ORDINAL_UNITS:
                value += ORDINAL_UNITS[words[i + 1]]
            break

        if word in TENS:
            value += TENS[word]
            matched = True
            if i + 1 < len(words) and words[i + 1] in UNITS:
                value += UNITS[words[i + 1]]
            break

        if word in UNITS:
            value += UNITS[word]
            matched = True
            i += 1
            continue

        if word in SCALES:
            value = (value or 1) * SCALES[word]
            matched = True
            i += 1
            continue

        if word == "and":
            i += 1
            continue

        break

    return value if matched else None


def find_number_phrase(tokens: list[str]) -> Optional[tuple[int, int, int, str]]:
    """Returns (value, start, end, raw) for the first numeric phrase."""
    for index, token in enumerate(tokens):
        if token.isdigit():
            return (int(token), index, index + 1, token)

        if not is_number_word(token) or token == "and":
            continue

        run: list[str] = []
        cursor = index
        while cursor < len(tokens) and (is_number_word(tokens[cursor]) or tokens[cursor] == "and"):
            run.append(tokens[cursor])
            cursor += 1

        for length in range(len(run), 0, -1):
            parsed = parse_number_words(run[:length])
            if parsed is not None:
                return (parsed, index, index + length, " ".join(run[:length]))

    return None


# --------------------------------------------------------------------------- #
# Tokenization / normalization (mirror of src/nlp/preprocessing)
# --------------------------------------------------------------------------- #


def tokenize(text: str) -> list[str]:
    return [token for token in re.split(r"[^a-z0-9]+", text.lower()) if token]


def normalize(text: str) -> dict:
    """Mirror of normalizeCommand() in src/nlp/preprocessing/normalize.ts."""
    original = (text or "").strip()

    working = original.lower()
    working = re.sub(r"[\u2019']", "", working)
    working = re.sub(r"[^a-z0-9\s]", " ", working)
    working = re.sub(r"\s+", " ", working).strip()

    for pattern, replacement in PHRASE_REWRITES:
        working = pattern.sub(replacement, working)
    working = re.sub(r"\s+", " ", working).strip()

    raw_tokens = tokenize(working)

    tokens = raw_tokens
    number_value: Optional[int] = None
    phrase = find_number_phrase(raw_tokens)
    if phrase is not None:
        value, start, end, _raw = phrase
        number_value = value
        tokens = raw_tokens[:start] + [str(value)] + raw_tokens[end:]

    content_tokens = [token for token in tokens if token not in STOP_WORDS]
    canonical_tokens = [
        TOKEN_SYNONYMS[token] if token in TOKEN_SYNONYMS else token for token in content_tokens
    ]
    canonical_tokens = [token for token in canonical_tokens if token]

    return {
        "original": original,
        "cleaned": " ".join(tokens),
        "tokens": tokens,
        "contentTokens": content_tokens,
        "canonicalTokens": canonical_tokens,
        "canonicalText": " ".join(canonical_tokens),
        "numberValue": number_value,
    }


# --------------------------------------------------------------------------- #
# Baselines: exact/rule and fuzzy
# --------------------------------------------------------------------------- #


def _ratio(a: str, b: str) -> float:
    if a == b:
        return 1.0
    return SequenceMatcher(None, a, b).ratio()


def _best_average(source: list[str], target: list[str]) -> float:
    total = 0.0
    for token in source:
        total += max((_ratio(token, candidate) for candidate in target), default=0.0)
    return total / len(source) if source else 0.0


def phrase_similarity(a: str, b: str) -> float:
    """Token-set similarity with a length penalty (mirrors fuzzyMatcher/index.ts)."""
    tokens_a = [token for token in a.split(" ") if token]
    tokens_b = [token for token in b.split(" ") if token]
    if not tokens_a or not tokens_b:
        return 0.0
    if a == b:
        return 1.0

    symmetric = (_best_average(tokens_a, tokens_b) + _best_average(tokens_b, tokens_a)) / 2
    length_penalty = min(len(tokens_a), len(tokens_b)) / max(len(tokens_a), len(tokens_b))
    return symmetric * (0.7 + 0.3 * length_penalty)


def best_phrase_similarity(text: str, candidates: list[str]) -> float:
    return max((phrase_similarity(text, candidate) for candidate in candidates), default=0.0)


def rule_scores(canonical_text: str) -> dict[str, float]:
    """Exact/keyword baseline: containment (0.95) or fuzzy similarity.

    The containment bonus is limited to MULTI-WORD keywords: short ones such as
    "play" or "next" are substrings of longer commands ("play track 7") and
    would otherwise outrank the correct, more specific intent.
    """
    scores: dict[str, float] = {}
    for intent, keywords in INTENT_KEYWORDS.items():
        if not keywords:
            continue
        best = best_phrase_similarity(canonical_text, keywords)
        if any(
            " " in keyword and re.search(rf"(?:^| ){re.escape(keyword)}(?: |$)", canonical_text)
            for keyword in keywords
        ):
            best = max(best, 0.95)
        scores[intent] = best
    return scores


def fuzzy_scores(canonical_text: str) -> dict[str, float]:
    """Fuzzy-only baseline: NO keyword containment shortcut."""
    scores: dict[str, float] = {}
    for intent, keywords in INTENT_KEYWORDS.items():
        if not keywords:
            continue
        scores[intent] = best_phrase_similarity(canonical_text, keywords)
    return scores


def _argmax(scores: dict[str, float], threshold: float = 0.2) -> str:
    if not scores:
        return "UNKNOWN"
    intent = max(scores, key=lambda key: scores[key])
    return intent if scores[intent] >= threshold else "UNKNOWN"


def predict_rule(text: str) -> str:
    return _argmax(rule_scores(normalize(text)["canonicalText"]))


def predict_fuzzy(text: str) -> str:
    return _argmax(fuzzy_scores(normalize(text)["canonicalText"]))
