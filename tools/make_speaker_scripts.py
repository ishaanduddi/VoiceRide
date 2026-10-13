"""Generate the 4-speaker script document for the VoiceRiders review.

Four speakers, ~60 seconds each, matching the four slides of the 4-minute deck.

Usage: python tools/make_speaker_scripts.py <out.docx>
"""
from __future__ import annotations

import sys
from pathlib import Path

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Pt, RGBColor, Inches

out_path = Path(sys.argv[1])
out_path.parent.mkdir(parents=True, exist_ok=True)

ACCENT = RGBColor(0x14, 0x8C, 0x3E)
MUTED = RGBColor(0x55, 0x5F, 0x70)

doc = Document()

# page + base style
for section in doc.sections:
    section.top_margin = Inches(0.7)
    section.bottom_margin = Inches(0.7)
    section.left_margin = Inches(0.8)
    section.right_margin = Inches(0.8)

normal = doc.styles['Normal']
normal.font.name = 'Calibri'
normal.font.size = Pt(11)
normal.paragraph_format.space_after = Pt(6)


def heading(value: str, size: int = 15, color: RGBColor = ACCENT, space_before: int = 10):
    paragraph = doc.add_paragraph()
    paragraph.paragraph_format.space_before = Pt(space_before)
    paragraph.paragraph_format.space_after = Pt(4)
    run = paragraph.add_run(value)
    run.bold = True
    run.font.size = Pt(size)
    run.font.color.rgb = color
    return paragraph


def body(value: str, italic: bool = False, color: RGBColor | None = None, size: int = 11):
    paragraph = doc.add_paragraph()
    run = paragraph.add_run(value)
    run.italic = italic
    run.font.size = Pt(size)
    if color is not None:
        run.font.color.rgb = color
    return paragraph


def bullet(value: str):
    paragraph = doc.add_paragraph(style='List Bullet')
    paragraph.paragraph_format.space_after = Pt(2)
    paragraph.add_run(value).font.size = Pt(10.5)
    return paragraph


# ------------------------------------------------------------------ title
title = doc.add_paragraph()
title.alignment = WD_ALIGN_PARAGRAPH.CENTER
run = title.add_run('VoiceRiders — 4-Minute Review')
run.bold = True
run.font.size = Pt(22)

subtitle = doc.add_paragraph()
subtitle.alignment = WD_ALIGN_PARAGRAPH.CENTER
run = subtitle.add_run('Speaker scripts · Team NeuroVoices · 4 speakers × 60 seconds')
run.font.size = Pt(11)
run.font.color.rgb = MUTED

# ------------------------------------------------------------------ timing
heading('Running order and timing', 13)
timing = doc.add_table(rows=5, cols=4)
timing.style = 'Light Grid Accent 1'
headers = ['Time', 'Speaker', 'Slide', 'Section']
rows = [
    ['0:00 – 1:00', 'Ishaan Balakrishna Duddi', 'Slide 2', 'Architecture & Tech Stack'],
    ['1:00 – 2:00', 'MD Thejas', 'Slide 3', 'Literature Survey'],
    ['2:00 – 3:00', 'Jai Abhinav', 'Slide 4', 'Competing Market'],
    ['3:00 – 4:00', 'Praveen Raj', 'Slide 5', 'Current Status'],
]
for index, value in enumerate(headers):
    cell = timing.cell(0, index)
    cell.text = value
    for paragraph in cell.paragraphs:
        for run_ in paragraph.runs:
            run_.bold = True
for r, row in enumerate(rows, start=1):
    for c, value in enumerate(row):
        timing.cell(r, c).text = value

body('')
body(
    'Each speaker advances the deck to their own slide at the start of their minute. '
    'Total: 4 minutes, then questions.',
    italic=True,
    color=MUTED,
)

# ------------------------------------------------------------------ scripts
heading('Speaker 1 — Ishaan — Architecture & Tech Stack (Slide 2)', 14)
body('Slide on screen: Architecture & Tech Stack.  Time: 60 seconds.', italic=True, color=MUTED)
heading('Say this:', 11, ACCENT, 6)
body(
    '"Good morning. I\'m Ishaan, and I\'ll explain how one spoken word becomes music playback.\n\n'
    'The rider speaks. Voice activity detection decides whether that was speech or just road noise, '
    'so wind and silence are never processed. Only real speech reaches Whisper, a speech recognition '
    'model that runs on the phone itself — no internet, no API key.\n\n'
    'The text then enters our NLP pipeline. Normalisation turns the word \'seven\' into the number 7. '
    'A machine-learning intent classifier, fused with a rule baseline, decides what the rider meant. '
    'Entity extraction pulls out the song number. Fuzzy matching repairs words damaged by noise. '
    'Context decides whether \'play\' means start or resume. Then a confidence gate decides whether to '
    'act at all — and only then does the dispatcher call the Spotify API.\n\n'
    'Our stack is React Native and Expo in TypeScript, whisper.cpp for offline speech recognition, and '
    'scikit-learn in Python for training the model."'
)
heading('Key points if asked', 11, ACCENT, 8)
bullet('Speech recognition and NLP both run on the phone — no server and no API key.')
bullet('The confidence gate is what stops the app from acting on a bad transcript.')
bullet('Adaptive Audio is a second branch: ambient noise raises the volume in small steps.')

heading('Speaker 2 — Thejas — Literature Survey (Slide 3)', 14)
body('Slide on screen: Literature Survey.  Time: 60 seconds.', italic=True, color=MUTED)
heading('Say this:', 11, ACCENT, 6)
body(
    '"I\'m Thejas, covering the related work and the gap we found.\n\n'
    'For speech recognition, Whisper — published in 2022 — showed that large-scale training gives '
    'robust transcription. We run it on the device using whisper.cpp. For detecting speech, WebRTC VAD '
    'and Silero VAD are the standard choices; we use a lighter energy-based detector because it costs '
    'almost nothing per audio frame.\n\n'
    'For noise, classical spectral subtraction cleans the audio before recognition. The problem is that '
    'it needs a reliable estimate of the noise, and a moving motorcycle never gives you one. So instead '
    'of cleaning the audio, we accept noisy transcripts and recover the command afterwards.\n\n'
    'For intent classification, TF-IDF with logistic regression — from Salton and Buckley — is proven '
    'and small enough to run on a phone. Levenshtein and Jaro-Winkler similarity repair words damaged '
    'by noise. And PKCE from RFC 7636 lets a mobile app authenticate with no client secret.\n\n'
    'The gap: none of this work targets riders."'
)

heading('Speaker 3 — Jai — Competing Market (Slide 4)', 14)
body('Slide on screen: Competing Market.  Time: 60 seconds.', italic=True, color=MUTED)
heading('Say this:', 11, ACCENT, 6)
body(
    '"I\'m Jai, and this is where VoiceRiders sits compared to what already exists.\n\n'
    'Siri and Google Assistant are general-purpose. They need a wake word, they are not tuned for wind '
    'or engine noise, and they cannot play a track by its number in a playlist.\n\n'
    'Spotify\'s own in-app voice control also needs the app open and a wake word, and it is built around '
    'search rather than playback control while riding.\n\n'
    'Android Auto and car head units solve this very well — but for cars. They need a head unit and a '
    'screen, which a motorcycle does not have.\n\n'
    'Bluetooth media buttons are genuinely hands-free, but all they can do is next, previous and volume. '
    'You cannot say \'play song number seven\'.\n\n'
    'So the combination we built — no wake word, noise-aware behaviour, song-number navigation, and '
    'confidence-gated recovery from bad transcripts — is not available today in one product. '
    'That is our contribution."'
)

heading('Speaker 4 — Praveen — Current Status (Slide 5)', 14)
body('Slide on screen: Current Status with app screenshots.  Time: 60 seconds.', italic=True, color=MUTED)
heading('Say this:', 11, ACCENT, 6)
body(
    '"I\'m Praveen, and this is what actually runs today.\n\n'
    'We have a working Android app. The rider logs into their own Spotify account using OAuth with '
    'PKCE — no client secret is ever stored. Playlists load with real track counts, and every track is '
    'numbered, so \'play song number seven\' resolves to the correct track.\n\n'
    'Playback control works: play, pause, resume, next, previous and volume.\n\n'
    'Ride Mode runs the whole pipeline on the device — voice activity detection, then Whisper, then our '
    'NLP pipeline and the confidence gate, and finally the Spotify API. Adaptive Audio raises the volume '
    'in small steps as the background noise increases, without undoing a manual volume command. We also '
    'added on-device diagnostics so the microphone, the Spotify device and the engine state are visible '
    'on the phone.\n\n'
    'Three honest limits: Spotify is in Development Mode, so it can only read playlists you own; '
    'playing through the phone speaker needs headphones because there is no echo cancellation; and app '
    'volume depends on which Spotify device is active.\n\n'
    'Thank you — we are happy to take questions."'
)

# ------------------------------------------------------------------ tips
heading('Delivery tips', 13)
bullet('Do not read the slides. Each script above is written to be spoken, not displayed.')
bullet('One speaker, one slide — advance when your minute starts.')
bullet('Point at the pipeline diagram on slide 2 while explaining the stages.')
bullet('If you run over, drop the last sentence of your script; every script survives losing one line.')
bullet('The single sentence to remember, if there is time for nothing else: the app recognises a command '
       'even when the transcript is wrong, and it asks you to repeat instead of guessing.')
bullet('Rehearse once with a timer. 60 seconds is roughly 140 spoken words — the scripts are sized for that.')

doc.save(str(out_path))
print(f'saved {out_path}')
