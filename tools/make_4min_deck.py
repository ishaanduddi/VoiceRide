"""Generate a 4-minute review deck for VoiceRiders.

Structure (5 content slides for 4 speakers, ~60 s each):
  1  Title
  2  Architecture & Tech Stack        (Speaker 1)
  3  Literature Survey                (Speaker 2)
  4  Competing Market                 (Speaker 3)
  5  Current Status + app screenshots (Speaker 4)
  6  Questions

App screenshots: put PNG/JPG files called app-1.*, app-2.*, app-3.* in the
`ppt-assets` folder next to the output file and re-run this script - they are
embedded automatically. Without them, labelled placeholders are drawn instead.

Usage: python tools/make_4min_deck.py <out.pptx>
"""
from __future__ import annotations

import sys
from pathlib import Path

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.util import Inches, Pt

BG = RGBColor(0x0B, 0x12, 0x20)
SURFACE = RGBColor(0x13, 0x1C, 0x2E)
SURFACE_ALT = RGBColor(0x1B, 0x27, 0x40)
BORDER = RGBColor(0x22, 0x30, 0x4A)
TEXT = RGBColor(0xF5, 0xF7, 0xFA)
MUTED = RGBColor(0x93, 0xA1, 0xB8)
PRIMARY = RGBColor(0x1D, 0xB9, 0x54)
ACCENT = RGBColor(0x38, 0xBD, 0xF8)
WARNING = RGBColor(0xF5, 0x9E, 0x0B)

FONT = 'Segoe UI'
SLIDE_W = 13.333
SLIDE_H = 7.5

out_path = Path(sys.argv[1])
assets_dir = out_path.parent / 'ppt-assets'
out_path.parent.mkdir(parents=True, exist_ok=True)


def blank_slide(prs: Presentation):
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    fill = slide.background.fill
    fill.solid()
    fill.fore_color.rgb = BG
    return slide


def text(
    slide,
    value: str,
    left: float,
    top: float,
    width: float,
    height: float,
    size: float = 18,
    bold: bool = False,
    color: RGBColor = TEXT,
    align=PP_ALIGN.LEFT,
    spacing: float | None = None,
    anchor=MSO_ANCHOR.TOP,
):
    box = slide.shapes.add_textbox(Inches(left), Inches(top), Inches(width), Inches(height))
    frame = box.text_frame
    frame.word_wrap = True
    frame.vertical_anchor = anchor
    paragraph = frame.paragraphs[0]
    paragraph.alignment = align
    run = paragraph.add_run()
    run.text = value
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.color.rgb = color
    run.font.name = FONT
    if spacing:
        paragraph.line_spacing = spacing
    return box


def lines(slide, items, left, top, width, height, size=13, color=TEXT, spacing=1.25, bullet='•'):
    box = slide.shapes.add_textbox(Inches(left), Inches(top), Inches(width), Inches(height))
    frame = box.text_frame
    frame.word_wrap = True
    for index, item in enumerate(items):
        paragraph = frame.paragraphs[0] if index == 0 else frame.add_paragraph()
        run = paragraph.add_run()
        run.text = f'{bullet}  {item}' if bullet else item
        run.font.size = Pt(size)
        run.font.color.rgb = color
        run.font.name = FONT
        paragraph.line_spacing = spacing
        paragraph.space_after = Pt(6)
    return box


def card(slide, left, top, width, height, fill=SURFACE):
    shape = slide.shapes.add_shape(
        MSO_SHAPE.ROUNDED_RECTANGLE, Inches(left), Inches(top), Inches(width), Inches(height)
    )
    shape.fill.solid()
    shape.fill.fore_color.rgb = fill
    shape.line.color.rgb = BORDER
    shape.line.width = Pt(1)
    shape.shadow.inherit = False
    shape.adjustments[0] = 0.04
    return shape


def header(slide, title_text: str, kicker: str, page: int):
    text(slide, title_text.upper(), 0.6, 0.35, 11.0, 0.5, size=22, bold=True, color=TEXT)
    text(slide, kicker, 0.6, 0.85, 11.5, 0.4, size=13, color=MUTED)
    text(slide, f'{page}', 12.2, 6.95, 0.6, 0.35, size=10, color=MUTED, align=PP_ALIGN.RIGHT)
    text(slide, 'VoiceRiders', 0.6, 6.95, 3.0, 0.35, size=10, color=MUTED)
    rule = slide.shapes.add_shape(
        MSO_SHAPE.RECTANGLE, Inches(0.6), Inches(1.28), Inches(12.1), Pt(1.5)
    )
    rule.fill.solid()
    rule.fill.fore_color.rgb = BORDER
    rule.line.fill.background()
    rule.shadow.inherit = False


prs = Presentation()
prs.slide_width = Inches(SLIDE_W)
prs.slide_height = Inches(SLIDE_H)

# ---------------------------------------------------------------- slide 1
slide = blank_slide(prs)
band = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0), Inches(0), Inches(SLIDE_W), Inches(0.28))
band.fill.solid()
band.fill.fore_color.rgb = PRIMARY
band.line.fill.background()
band.shadow.inherit = False

text(slide, 'NLP PROJECT · REVIEW', 0.9, 1.15, 8.0, 0.4, size=13, bold=True, color=PRIMARY)
text(slide, 'VoiceRiders', 0.9, 1.55, 11.5, 1.1, size=54, bold=True)
text(
    slide,
    'Context-Aware, Noise-Adaptive Voice Controller for Spotify',
    0.9, 2.75, 11.5, 0.5, size=18, color=MUTED,
)
text(slide, 'Team NeuroVoices · 4-minute review', 0.9, 3.45, 8.0, 0.4, size=15, color=ACCENT, bold=True)

names = [
    ('Ishaan Balakrishna Duddi', 'BL.SC.U4CSE24015', 'Architecture & Tech Stack'),
    ('MD Thejas', 'BL.SC.U4CSE24028', 'Literature Survey'),
    ('Jai Abhinav', 'BL.SC.U4CSE24033', 'Competing Market'),
    ('Praveen Raj', 'BL.SC.U4CSE24040', 'Current Status'),
]
for index, (name, roll, part) in enumerate(names):
    top = 4.05 + index * 0.62
    card(slide, 0.9, top, 7.2, 0.52, SURFACE)
    text(slide, name, 1.1, top + 0.06, 3.3, 0.4, size=14, bold=True)
    text(slide, roll, 4.4, top + 0.08, 1.9, 0.4, size=12, color=MUTED)
    text(slide, part, 6.3, top + 0.08, 1.7, 0.4, size=12, color=ACCENT)

card(slide, 8.5, 4.05, 4.2, 2.6, SURFACE_ALT)
text(slide, 'One line', 8.8, 4.2, 3.6, 0.35, size=13, bold=True, color=PRIMARY)
text(
    slide,
    'A rider picks a playlist, starts Ride Mode, and controls Spotify entirely by voice — '
    'offline speech recognition on the phone, with context and confidence deciding whether '
    'a noisy command is really a command.',
    8.8, 4.6, 3.6, 1.9, size=12.5, color=TEXT, spacing=1.3,
)

# ---------------------------------------------------------------- slide 2
slide = blank_slide(prs)
header(slide, 'Architecture & Tech Stack', 'Speaker 1 — how a spoken word becomes playback', 2)

card(slide, 0.6, 1.5, 7.4, 4.0)
text(slide, 'Pipeline', 0.9, 1.65, 3.0, 0.35, size=15, bold=True, color=PRIMARY)
lines(
    slide,
    [
        'Microphone + VAD → only real speech is captured',
        'Whisper ASR on-device → text, no network',
        'Normalise → number words become digits ("seven" → 7)',
        'Intent classification → ML (TF-IDF + Logistic Regression) fused with a rule baseline',
        'Entity extraction → song number',
        'Fuzzy match (edit distance + phonetics) → survives ASR errors',
        'Context → resolves "play" to RESUME while paused',
        'Confidence gate → 45 % intent + 25 % fuzzy + 20 % ASR + 10 % context',
        'Dispatcher → Spotify Web API',
    ],
    0.9, 2.05, 6.8, 3.3, size=12.5,
)
text(
    slide,
    'Second branch: Adaptive Audio — ambient noise → smoothing → noise zone → hysteresis → small volume steps above the rider\'s baseline.',
    0.9, 4.95, 6.8, 0.5, size=11.5, color=MUTED, spacing=1.2,
)

card(slide, 8.3, 1.5, 4.4, 4.0)
text(slide, 'Tech Stack', 8.6, 1.65, 3.0, 0.35, size=15, bold=True, color=ACCENT)
lines(
    slide,
    [
        'Mobile: React Native + Expo (TypeScript)',
        'Speech: whisper.cpp on-device + energy VAD — offline, no API key',
        'ML: scikit-learn (TF-IDF + Logistic Regression) trained in Python; weights exported to JSON and run on-device',
        'Spotify: Web API + OAuth 2.0 PKCE — no client secret stored',
        'Infra: one serverless HTTPS relay (Spotify rejects custom-scheme redirects)',
        'Storage: OS Keychain / Android Keystore',
        'Build: EAS → installable Android APK',
    ],
    8.6, 2.05, 3.9, 3.3, size=11.5,
)

# ---------------------------------------------------------------- slide 3
slide = blank_slide(prs)
header(slide, 'Literature Survey', 'Speaker 2 — what we build on, and what is missing', 3)

survey = [
    ('Speech recognition', 'Whisper — Radford et al., 2022', 'Robust large-scale ASR; whisper.cpp runs it on-device. No notion of music commands.'),
    ('Voice activity', 'WebRTC VAD (Google) · Silero VAD', 'Detect speech cheaply so silence never reaches ASR. We use an energy VAD — far cheaper per frame.'),
    ('Noise handling', 'Spectral subtraction — Boll, 1979', 'Denoises before recognition, but needs a reliable noise estimate — which a moving bike does not give.'),
    ('Text classification', 'TF-IDF — Salton & Buckley, 1988', 'Proven and lightweight; small enough to run on a phone without a transformer.'),
    ('Fuzzy matching', 'Levenshtein 1966 · Jaro-Winkler 1990', 'Similarity that survives speech-to-text damage ("increse volum").'),
    ('Authorization', 'RFC 7636 — PKCE, 2015', 'Lets a public mobile client authenticate with no client secret.'),
]
for index, (area, work, takeaway) in enumerate(survey):
    col = index % 3
    row = index // 3
    left = 0.6 + col * 4.13
    top = 1.55 + row * 1.85
    card(slide, left, top, 3.9, 1.66)
    text(slide, area.upper(), left + 0.22, top + 0.13, 3.4, 0.28, size=10, bold=True, color=ACCENT)
    text(slide, work, left + 0.22, top + 0.42, 3.45, 0.5, size=12.5, bold=True, spacing=1.1)
    text(slide, takeaway, left + 0.22, top + 0.92, 3.45, 0.68, size=10.5, color=MUTED, spacing=1.15)

text(
    slide,
    'Gap:  none of this work targets the rider case — no wake word, wind and engine noise, hands free. '
    'VoiceRiders joins these pieces and adds a confidence gate that refuses to guess.',
    0.6, 5.35, 12.1, 0.9, size=13, color=WARNING, spacing=1.25,
)

# ---------------------------------------------------------------- slide 4
slide = blank_slide(prs)
header(slide, 'Competing Market', 'Speaker 3 — mainstream assistants, motorbike OEM systems, and where the gap is', 4)

rows = [
    ['Option', 'Hardware needed', 'Wake word', 'Noise-aware', 'Song by number', 'Recognition in app'],
    ['Siri / Google Assistant', 'Any phone', 'Required', 'No', 'No', 'No (OS)'],
    ['Spotify in-app voice', 'Any phone', 'Required', 'No', 'No', 'No (OS)'],
    ['Android Auto / car head unit', 'Head unit + screen', 'Required', 'No', 'No', 'No (OS)'],
    ['Honda Smartphone Voice Control', 'Selected Honda + headset', 'Required', 'No', 'No', 'No (OS)'],
    ['Harley-Davidson Boom! Box', 'Touring models only', 'Required', 'No', 'No', 'No (OS)'],
    ['Cardo / Sena helmet intercoms', 'Helmet intercom', 'Required', 'No', 'No', 'No (OS)'],
    ['Bluetooth media buttons', 'Any BT headset', 'n/a', 'No', 'No', 'n/a'],
    ['VoiceRiders', 'Any phone + any headset', 'None', 'Yes', 'Yes', 'Yes (on-device)'],
]
table_shape = slide.shapes.add_table(
    len(rows), len(rows[0]), Inches(0.6), Inches(1.42), Inches(12.1), Inches(3.7)
)
table = table_shape.table
widths = [3.0, 2.5, 1.3, 1.4, 1.5, 2.4]
for index, width in enumerate(widths):
    table.columns[index].width = Inches(width)

for r, row in enumerate(rows):
    for c, value in enumerate(row):
        cell = table.cell(r, c)
        cell.text = value
        cell.vertical_anchor = MSO_ANCHOR.MIDDLE
        cell.fill.solid()
        if r == 0:
            cell.fill.fore_color.rgb = SURFACE_ALT
        elif r == len(rows) - 1:
            cell.fill.fore_color.rgb = RGBColor(0x10, 0x2A, 0x1A)
        else:
            cell.fill.fore_color.rgb = SURFACE
        paragraph = cell.text_frame.paragraphs[0]
        paragraph.alignment = PP_ALIGN.LEFT if c < 2 else PP_ALIGN.CENTER
        for run in paragraph.runs:
            run.font.size = Pt(11)
            run.font.name = FONT
            run.font.bold = (r == 0 or r == len(rows) - 1)
            run.font.color.rgb = PRIMARY if r == len(rows) - 1 else (MUTED if r == 0 else TEXT)

text(
    slide,
    'The motorbike manufacturers do have voice systems — Honda\'s Smartphone Voice Control, Harley\'s Boom! Box — '
    'but they need a specific motorcycle, and they hand the actual recognition to your phone\'s assistant.',
    0.6, 5.22, 12.1, 0.6, size=11.5, color=MUTED, spacing=1.2,
)
text(
    slide,
    'The gap:  no wake word + noise-aware + song-number navigation + recognition that runs inside the app, '
    'on any phone and any bike, with no extra hardware.',
    0.6, 5.88, 12.1, 0.6, size=12.5, color=WARNING, spacing=1.2, bold=True,
)

# ---------------------------------------------------------------- slide 5
slide = blank_slide(prs)
header(slide, 'Current Status', 'Speaker 4 — what runs today, on a real phone', 5)

card(slide, 0.6, 1.5, 5.5, 4.9)
text(slide, 'Working now', 0.85, 1.65, 3.0, 0.35, size=15, bold=True, color=PRIMARY)
lines(
    slide,
    [
        'Spotify login with OAuth 2.0 + PKCE through the relay',
        'Playlists load with real track counts',
        'Numbered playlist map — "play song number 7" resolves to a track',
        'Playback control: play, pause, resume, next, previous, volume',
        'Ride Mode: VAD → on-device Whisper → NLP → confidence gate → Spotify',
        'Adaptive Audio: ambient noise raises the volume in small steps',
        'Installable Android APK built with EAS',
        'On-device diagnostics (microphone, device, engine) in Ride Mode',
    ],
    0.85, 2.05, 5.0, 3.4, size=12,
)
text(
    slide,
    'Known limits: Development Mode can only read playlists you own; speaker playback needs headphones '
    '(no echo cancellation); app volume depends on the active Spotify device.',
    0.85, 5.55, 5.0, 0.75, size=11, color=MUTED, spacing=1.2,
)

# screenshot slots
captions = ['Connect Spotify', 'Choose a playlist', 'Ride Mode']
found = []
for index in range(3):
    for ext in ('.png', '.jpg', '.jpeg'):
        candidate = assets_dir / f'app-{index + 1}{ext}'
        if candidate.exists():
            found.append(candidate)
            break
    else:
        found.append(None)

for index in range(3):
    left = 6.35 + index * 2.2
    card(slide, left, 1.5, 2.05, 4.15, SURFACE_ALT)
    image = found[index]
    if image is not None:
        slide.shapes.add_picture(str(image), Inches(left + 0.06), Inches(1.56), width=Inches(1.93))
    else:
        text(
            slide,
            f'put\napp-{index + 1}.png\nhere',
            left + 0.15, 3.1, 1.75, 1.0, size=11, color=MUTED, align=PP_ALIGN.CENTER, spacing=1.2,
        )
    text(slide, captions[index], left + 0.1, 5.72, 1.85, 0.35, size=10.5, color=ACCENT, align=PP_ALIGN.CENTER)

# ---------------------------------------------------------------- slide 6
slide = blank_slide(prs)
text(slide, 'Thank you', 0.9, 2.3, 11.5, 1.0, size=46, bold=True)
text(slide, 'Questions?', 0.9, 3.35, 11.5, 0.6, size=22, color=MUTED)
card(slide, 0.9, 4.2, 11.5, 1.5, SURFACE)
text(
    slide,
    'Code, evaluation scripts and the architecture notes are in the repository:  github.com/ishaanduddi/VoiceRide',
    1.2, 4.5, 11.0, 0.5, size=14, color=ACCENT,
)
text(
    slide,
    'Not affiliated with Spotify AB. Built with the Spotify Web API under the Spotify Developer Terms.',
    1.2, 5.0, 11.0, 0.5, size=11, color=MUTED,
)

prs.save(str(out_path))
print(f'saved {out_path} ({len(prs.slides.__iter__.__self__._sldIdLst)} slides)')
print(f'screenshots embedded: {sum(1 for f in found if f)} of 3')
print(f'screenshot folder:    {assets_dir}')
