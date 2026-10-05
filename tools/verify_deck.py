"""Apply accuracy corrections to the VoiceRiders deck.

Keeps the exact same slides and slide numbers — only text inside existing
shapes is changed, so no shape, layout, order or page number is touched.

Usage: python tools/verify_deck.py <file.pptx>
A backup is written next to the file before saving.
"""
from __future__ import annotations

import shutil
import sys
from pathlib import Path

from pptx import Presentation

path = Path(sys.argv[1])
backup = path.with_name(f"{path.stem}.BACKUP{path.suffix}")

# Edits are keyed by 1-based slide number so a phrase on one slide is never
# accidentally rewritten on another.
EDITS: dict[int, list[tuple[str, str]]] = {
    # Slide 4 - Key features
    4: [
        # Spotify only exposes playlists the user owns or collaborates on.
        ("Access playlists", "Access your own playlists"),
    ],
    # Slide 5 - NLP contribution
    5: [
        # Confidence scoring is the project's headline mechanism; surface it.
        ("Context Understanding", "Context + Confidence"),
        (
            "Intent  =  PLAY_SONG          Entity  =  7",
            "Intent  =  PLAY_SONG      Entity  =  7      Confidence  =  0.94",
        ),
    ],
    # Slide 7 - Technology stack (several entries did not match the build)
    7: [
        ("Android Studio", "React Native + Expo"),
        ("Kotlin", "TypeScript"),
        ("Python", "Python (training)"),
        ("Scikit-Learn", "Scikit-Learn (TF-IDF + LR)"),
        ("Transformers (Future Enhancement)", "TypeScript inference on device"),
        ("Android Speech Recognizer", "Whisper.cpp (on-device)"),
        ("Spotify OAuth Authentication", "Spotify OAuth 2.0 (PKCE)"),
        ("FastAPI", "OAuth relay (serverless)"),
        ("SQLite", "Secure OS storage"),
        ("GitHub", "GitHub + Expo EAS"),
    ],
    # Slide 8 - System architecture
    8: [
        ("Microphone", "Microphone + VAD"),
        ("Speech-to-Text", "Speech-to-Text (Whisper)"),
        ("Speech is converted to text.", "VAD finds speech; Whisper transcribes it."),
        (
            "NLP identifies the intent and extracts required entities.",
            "NLP classifies intent and extracts the song number.",
        ),
        (
            "Command Dispatcher maps the request to a Spotify action.",
            "Context and confidence are checked before dispatch.",
        ),
    ],
}


def replace_in_paragraph(paragraph, old: str, new: str) -> bool:
    """Replaces text while preserving the paragraph's run formatting."""
    full = "".join(run.text for run in paragraph.runs)
    if full.strip() != old:
        return False

    runs = paragraph.runs
    if len(runs) == 1:
        runs[0].text = new
        return True

    # Multiple runs: put everything in the first, blank the rest (keeps styling).
    runs[0].text = new
    for run in runs[1:]:
        run.text = ""
    return True


def main() -> int:
    prs = Presentation(str(path))
    slides = list(prs.slides)
    print(f"slides: {len(slides)}")

    missing: list[tuple[int, str]] = []
    applied: list[tuple[int, str, str]] = []

    for slide_no, edits in sorted(EDITS.items()):
        if slide_no > len(slides):
            missing.append((slide_no, "<slide does not exist>"))
            continue
        slide = slides[slide_no - 1]

        for old, new in edits:
            hit = False
            for shape in slide.shapes:
                if not shape.has_text_frame:
                    continue
                for paragraph in shape.text_frame.paragraphs:
                    if replace_in_paragraph(paragraph, old, new):
                        hit = True
                        applied.append((slide_no, old, new))
            if not hit:
                missing.append((slide_no, old))

    if missing:
        print("\n!! NOT FOUND (nothing changed for these):")
        for slide_no, old in missing:
            print(f"   slide {slide_no}: {old!r}")
        print("\nAborting without saving so the deck is left untouched.")
        return 1

    shutil.copy2(path, backup)
    prs.save(str(path))

    print(f"\nbackup: {backup}")
    print(f"saved:  {path}")
    print(f"\napplied {len(applied)} edits:")
    for slide_no, old, new in applied:
        print(f"  slide {slide_no}: {old!r}\n            -> {new!r}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
