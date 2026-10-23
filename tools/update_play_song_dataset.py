"""Replace the obsolete playlist-number PLAY_SONG examples with song-name ones.

The app now plays a song by name ("play believer", "play believer by imagine
dragons") instead of by playlist position.

Usage: python tools/update_play_song_dataset.py
"""
from __future__ import annotations

import json
from pathlib import Path

PATH = Path(__file__).resolve().parent.parent / "ml" / "data" / "commands.jsonl"

NEW_EXAMPLES = [
    "play believer",
    "play thunder",
    "play song believer",
    "play track thunder",
    "play the song believer",
    "play shape of you",
    "play blinding lights",
    "play bohemian rhapsody",
    "play believer by imagine dragons",
    "play a song by imagine dragons",
    "play levitating by dua lipa",
    "play stay by the kid laroi",
    "play song thunder",
    "play beleiver",
    "play beliver by imagine dragon",
    "play blinding light",
]

rows = [
    json.loads(line)
    for line in PATH.read_text(encoding="utf-8").splitlines()
    if line.strip()
]

kept = [row for row in rows if row.get("intent") != "PLAY_SONG"]
added = [{"text": text, "intent": "PLAY_SONG"} for text in NEW_EXAMPLES]

PATH.write_text(
    "\n".join(json.dumps(row, ensure_ascii=False) for row in kept + added) + "\n",
    encoding="utf-8",
)

print(f"removed {len(rows) - len(kept)} number-based PLAY_SONG examples")
print(f"added   {len(added)} name-based PLAY_SONG examples")
print(f"total   {len(kept) + len(added)} utterances")
