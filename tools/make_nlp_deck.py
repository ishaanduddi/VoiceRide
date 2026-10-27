"""Generate the NLP-focused VoiceRiders deck.

Eleven slides for four speakers (~1 minute each), covering the parts of the app
where NLP actually does the work:

   1  Title                          (Name 1-4 placeholders)
   2  Why this is an NLP problem
   3  Pipeline at a glance
   4  Task 1 - Speech to text (on-device Whisper)
   5  Task 2 - Normalisation + intent classification
   6  Task 3 - Entity extraction (song + artist)
   7  Task 4 - Confidence: act or stay silent
   8  Task 5 - Context and song selection
   9  Task 6 - Noise rejection is an NLP problem too
  10  Results and honest limits
  11  Questions

Everything reflects the app as it behaves today: no wake word, no yes/no
questions, songs by name, phone volume via hardware steps.

Usage: python tools/make_nlp_deck.py <out.pptx>
"""
from __future__ import annotations

import sys
from pathlib import Path

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
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
MONO = 'Consolas'
SLIDE_W = 13.333
SLIDE_H = 7.5

out_path = Path(sys.argv[1])
out_path.parent.mkdir(parents=True, exist_ok=True)


def blank_slide(prs: Presentation):
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    fill = slide.background.fill
    fill.solid()
    fill.fore_color.rgb = BG
    return slide


def text(slide, value, left, top, width, height, size=18, bold=False,
         color=TEXT, align=PP_ALIGN.LEFT, spacing=None, anchor=MSO_ANCHOR.TOP,
         font=FONT):
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
    run.font.name = font
    if spacing:
        paragraph.line_spacing = spacing
    return box


def lines(slide, items, left, top, width, height, size=13, color=TEXT,
          spacing=1.2, bullet='•'):
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


def card(slide, left, top, width, height, fill=SURFACE, line=BORDER):
    shape = slide.shapes.add_shape(
        MSO_SHAPE.ROUNDED_RECTANGLE, Inches(left), Inches(top), Inches(width), Inches(height)
    )
    shape.fill.solid()
    shape.fill.fore_color.rgb = fill
    shape.line.color.rgb = line
    shape.line.width = Pt(1)
    shape.shadow.inherit = False
    shape.adjustments[0] = 0.04
    return shape


def chip(slide, value, left, top, width, height, color=PRIMARY):
    shape = slide.shapes.add_shape(
        MSO_SHAPE.ROUNDED_RECTANGLE, Inches(left), Inches(top), Inches(width), Inches(height)
    )
    shape.fill.solid()
    shape.fill.fore_color.rgb = color
    shape.line.fill.background()
    shape.shadow.inherit = False
    shape.text_frame.word_wrap = False
    paragraph = shape.text_frame.paragraphs[0]
    paragraph.alignment = PP_ALIGN.CENTER
    run = paragraph.add_run()
    run.text = value
    run.font.size = Pt(10)
    run.font.bold = True
    run.font.color.rgb = BG
    run.font.name = FONT
    return shape


def header(slide, title_text, kicker, page):
    text(slide, title_text.upper(), 0.6, 0.32, 11.6, 0.5, size=21, bold=True)
    text(slide, kicker, 0.6, 0.82, 11.9, 0.4, size=12.5, color=MUTED)
    text(slide, f'{page}', 12.2, 7.0, 0.6, 0.3, size=10, color=MUTED, align=PP_ALIGN.RIGHT)
    text(slide, 'VoiceRiders · NLP', 0.6, 7.0, 4.0, 0.3, size=10, color=MUTED)
    rule = slide.shapes.add_shape(
        MSO_SHAPE.RECTANGLE, Inches(0.6), Inches(1.28), Inches(12.1), Inches(0.02)
    )
    rule.fill.solid()
    rule.fill.fore_color.rgb = BORDER
    rule.line.fill.background()


def table(slide, rows, left, top, width, col_ratios, font_size=10.5,
          row_height=0.32, header_fill=SURFACE_ALT):
    cols = len(col_ratios)
    shape = slide.shapes.add_table(len(rows), cols, Inches(left), Inches(top),
                                   Inches(width), Inches(row_height * len(rows)))
    tbl = shape.table
    for index, ratio in enumerate(col_ratios):
        tbl.columns[index].width = Inches(width * ratio)
    for r, row in enumerate(rows):
        tbl.rows[r].height = Inches(row_height)
        for c, value in enumerate(row):
            cell = tbl.cell(r, c)
            cell.fill.solid()
            cell.fill.fore_color.rgb = header_fill if r == 0 else SURFACE
            cell.margin_left = Inches(0.08)
            cell.margin_right = Inches(0.06)
            cell.margin_top = Inches(0.03)
            cell.margin_bottom = Inches(0.03)
            paragraph = cell.text_frame.paragraphs[0]
            run = paragraph.add_run()
            run.text = str(value)
            run.font.size = Pt(font_size)
            run.font.bold = r == 0
            run.font.color.rgb = TEXT if r == 0 else RGBColor(0xD7, 0xDF, 0xEA)
            run.font.name = FONT
    return tbl


prs = Presentation()
prs.slide_width = Inches(SLIDE_W)
prs.slide_height = Inches(SLIDE_H)

# ---------------------------------------------------------------- 1. title
slide = blank_slide(prs)
band = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0), Inches(0), Inches(0.18), Inches(SLIDE_H))
band.fill.solid()
band.fill.fore_color.rgb = PRIMARY
band.line.fill.background()

text(slide, 'NATURAL LANGUAGE PROCESSING · COURSE PROJECT', 0.9, 1.35, 11.5, 0.4,
     size=13, bold=True, color=ACCENT)
text(slide, 'THE NLP INSIDE\nVOICERIDERS', 0.9, 1.85, 11.6, 1.9, size=46, bold=True, spacing=0.95)
text(slide,
     'Understanding a rider’s voice on a moving motorcycle — offline, in one shot, '
     'with no wake word.',
     0.9, 3.95, 10.6, 0.9, size=17, color=MUTED, spacing=1.25)

card(slide, 0.9, 5.05, 6.1, 1.05, SURFACE_ALT)
text(slide, 'Name 1   ·   Name 2   ·   Name 3   ·   Name 4', 1.15, 5.35, 5.7, 0.5,
     size=16, bold=True)

text(slide, 'App: Expo / React Native · Spotify Web API · whisper.cpp on the phone',
     0.9, 6.35, 10.5, 0.35, size=12, color=MUTED)
text(slide, 'github.com/ishaanduddi/VoiceRide', 0.9, 6.72, 6.0, 0.35, size=11, color=PRIMARY)

# ------------------------------------------------- 2. why this is an NLP problem
slide = blank_slide(prs)
header(slide, 'Why this is an NLP problem',
       'The same sentence is easy on a sofa and hard at 60 km/h', 2)

cards = [
    ('ONE SHOT', 'No wake word, no confirmation question.\nA single 2–4 s utterance must be understood — or deliberately ignored.'),
    ('DAMAGED WORDS', 'Engine, wind and helmet mics mangle phonemes:\n“volum”, “beleiver”, “nex song”.'),
    ('OPPOSITES', '“increase volume” and “decrease volume” are ~90% identical as strings,\nbut doing the opposite is the worst failure.'),
]
for index, (title_text, body) in enumerate(cards):
    left = 0.6 + index * 4.1
    card(slide, left, 1.6, 3.85, 2.45)
    chip(slide, f'0{index + 1}', left + 0.28, 1.82, 0.55, 0.34,
         color=[PRIMARY, ACCENT, WARNING][index])
    text(slide, title_text, left + 0.95, 1.85, 2.7, 0.35, size=13, bold=True)
    text(slide, body, left + 0.3, 2.35, 3.3, 1.5, size=12, color=MUTED, spacing=1.3)

card(slide, 0.6, 4.3, 12.1, 1.05, SURFACE_ALT)
text(slide,
     'So the job is not “transcribe”. It is: turn a noisy 3-second clip into one of ten actions, '
     'and know when to do nothing at all.',
     0.95, 4.62, 11.5, 0.5, size=14, bold=True)

text(slide, 'Constraints that shaped every design choice below:', 0.6, 5.65, 9.0, 0.35,
     size=12, bold=True)
lines(slide, [
    'Everything runs offline on the phone — no cloud ASR, no API key, no audio leaving the device.',
    'A wrong action is worse than a missed one, so the pipeline is allowed to stay silent.',
    'The rider cannot look at the screen, so there is no “try again” loop.',
], 0.6, 6.0, 12.0, 0.9, size=11.5, color=MUTED)

# ------------------------------------------------------ 3. pipeline at a glance
slide = blank_slide(prs)
header(slide, 'Pipeline at a glance', 'From microphone to Spotify in seven steps — five of them NLP', 3)

steps = [
    ('VAD + gates', 'energy VAD,\nSNR / length limits'),
    ('ASR', 'whisper.cpp\nbase.en, on-device'),
    ('Normalise', 'case, punctuation,\nrewrites, synonyms'),
    ('Intent', 'TF-IDF + logistic\nregression ⊕ rules'),
    ('Entities', 'song title,\nartist'),
    ('Confidence', 'weighted fusion,\nambiguity penalty'),
    ('Action', 'Spotify Web API\n+ spoken reply'),
]
box_w = 1.55
gap = 0.19
start = 0.62
for index, (title_text, caption) in enumerate(steps):
    left = start + index * (box_w + gap)
    card(slide, left, 1.62, box_w, 1.55)
    chip(slide, str(index + 1), left + 0.12, 1.74, 0.34, 0.3,
         color=PRIMARY if index < 2 else ACCENT)
    text(slide, title_text, left + 0.12, 2.1, box_w - 0.2, 0.3, size=11, bold=True)
    text(slide, caption, left + 0.12, 2.42, box_w - 0.2, 0.7, size=8.5, color=MUTED, spacing=1.15)
    if index < len(steps) - 1:
        text(slide, '›', left + box_w - 0.02, 2.1, 0.24, 0.4, size=18, bold=True, color=MUTED)

card(slide, 0.62, 3.5, 12.1, 1.5, SURFACE_ALT)
text(slide, 'Pure TypeScript from step 3 onwards', 0.9, 3.72, 6.0, 0.35, size=13, bold=True)
text(slide,
     'Only the ASR step is native. Normalisation, classification, entity extraction and confidence '
     'are dependency-free functions, so they run identically in the app, in unit tests and in the '
     'Python evaluation harness (ml/).',
     0.9, 4.08, 11.5, 0.8, size=11.5, color=MUTED, spacing=1.25)

rows = [
    ['Stage', 'Input', 'Output', 'Where'],
    ['Normalise', '“Turn the music UP, please”', 'increase volume', 'nlp/preprocessing'],
    ['Intent', 'increase volume', 'INCREASE_VOLUME 0.93', 'nlp/intentClassifier'],
    ['Entities', 'play believer by imagine dragons', 'believer / imagine dragons', 'nlp/entityExtractor'],
    ['Confidence', 'all signals', 'execute · reject', 'nlp/confidence'],
]
table(slide, rows, 0.62, 5.25, 12.1, [0.16, 0.33, 0.30, 0.21], font_size=10.5, row_height=0.33)

# ------------------------------------------------------------------ 4. ASR
slide = blank_slide(prs)
header(slide, 'Task 1 · Speech to text, on the phone',
       'Whisper (whisper.cpp base.en) — no cloud round trip, no audio leaves the device', 4)

card(slide, 0.6, 1.55, 5.9, 2.5)
text(slide, 'How it runs', 0.85, 1.75, 4.0, 0.35, size=13, bold=True)
lines(slide, [
    'VAD closes an utterance → 16 kHz mono WAV',
    'base.en model, ~140 MB, downloaded once at runtime',
    '4 threads, beam size 2, temperature 0',
    'Native inference; model file never committed',
], 0.85, 2.15, 5.4, 1.8, size=11.5)

card(slide, 6.75, 1.55, 5.95, 2.5)
text(slide, 'Command biasing prompt', 7.0, 1.75, 4.5, 0.35, size=13, bold=True)
text(slide,
     '“Voice commands for Spotify playback: play believer, play thunder, play believer by imagine '
     'dragons, next song, previous song, pause, resume, increase volume, decrease volume…”',
     7.0, 2.15, 5.45, 1.6, size=10.5, color=MUTED, spacing=1.3, font=MONO)
text(slide, 'Whisper conditions decoding on preceding text, so the command vocabulary acts as a '
            'domain prior.', 7.0, 3.45, 5.4, 0.5, size=10, color=ACCENT)

card(slide, 0.6, 4.25, 12.1, 1.05, SURFACE_ALT)
text(slide,
     'Why on-device: a cloud hop adds 0.5–2 s and needs signal — exactly what a rider does not have. '
     'Cost: the model is CPU-bound, and it reports no calibrated confidence (so the NLP layer estimates it).',
     0.9, 4.45, 11.5, 0.7, size=11.5, color=TEXT, spacing=1.25)

rows = [
    ['It hears', 'Why it happens', 'What saves it'],
    ['“next some”', 'coarticulation + wind', 'fuzzy matcher + prompt bias'],
    ['“believer by imagine dragon”', 'dropped plural', 'artist similarity, not equality'],
    ['“volum up”', 'clipped phoneme', 'Soundex + keyword similarity'],
    ['[Music] / [BLANK_AUDIO]', 'no speech at all', 'stripped → never reaches the classifier'],
]
table(slide, rows, 0.6, 5.5, 12.1, [0.30, 0.33, 0.37], font_size=10.5, row_height=0.27)

# --------------------------------------- 5. normalisation + intent classification
slide = blank_slide(prs)
header(slide, 'Task 2 · Normalise, then classify the intent',
       'Ten intents, two complementary signals, one small model on the phone', 5)

card(slide, 0.6, 1.55, 5.6, 2.9)
text(slide, 'Normalisation', 0.85, 1.72, 4.0, 0.35, size=13, bold=True)
text(slide, '“Turn the music UP, please!”', 0.85, 2.1, 5.1, 0.35, size=11.5, color=WARNING, font=MONO)
for index, step_text in enumerate([
    'lowercase · strip punctuation · drop apostrophes',
    'phrase rewrites: “make it louder” → “increase volume”',
    'tokenise → spoken numbers to digits → stop words',
    'synonyms: “song” → “track”, “tune” → “track”',
]):
    text(slide, f'{index + 1}. {step_text}', 0.85, 2.5 + index * 0.34, 5.2, 0.32,
         size=10.5, color=MUTED)
text(slide, '“increase volume”', 0.85, 3.95, 5.1, 0.4, size=14, bold=True, color=PRIMARY, font=MONO)

card(slide, 6.45, 1.55, 6.25, 2.9)
text(slide, 'Intent classification', 6.7, 1.72, 4.5, 0.35, size=13, bold=True)
lines(slide, [
    'Features: unigrams + adjacent bigrams → 296 TF-IDF columns',
    'Model: multinomial logistic regression, 10 classes',
    'Trained in Python, exported to model.json (dot products on-device)',
    'Rule signal: whole-phrase containment + fuzzy similarity, per intent',
    'Fusion: 65% model + 35% rules — rules keep rare phrasings alive',
], 6.7, 2.12, 5.8, 2.2, size=10.8)

stat_fill = SURFACE_ALT
card(slide, 0.6, 4.55, 12.1, 1.0, stat_fill)
text(slide, '177', 0.95, 4.68, 1.4, 0.5, size=20, bold=True, color=PRIMARY)
text(slide, 'utterances', 0.95, 5.15, 1.6, 0.28, size=9.5, color=MUTED)
text(slide, '54', 2.75, 4.68, 1.2, 0.5, size=20, bold=True, color=ACCENT)
text(slide, 'held out', 2.75, 5.15, 1.4, 0.28, size=9.5, color=MUTED)
text(slide, '0.852', 4.35, 4.68, 1.8, 0.5, size=20, bold=True, color=PRIMARY)
text(slide, 'hybrid accuracy', 4.35, 5.15, 2.2, 0.28, size=9.5, color=MUTED)
text(slide, '10', 6.75, 4.68, 0.9, 0.5, size=20, bold=True, color=ACCENT)
text(slide, 'intents', 6.75, 5.15, 1.4, 0.28, size=9.5, color=MUTED)
text(slide, '0.887', 8.35, 4.68, 1.6, 0.5, size=20, bold=True, color=PRIMARY)
text(slide, 'ML macro-F1', 8.35, 5.15, 1.9, 0.28, size=9.5, color=MUTED)
text(slide, '~1 ms', 10.15, 4.68, 1.6, 0.5, size=20, bold=True, color=ACCENT)
text(slide, 'per utterance', 10.15, 5.15, 2.0, 0.28, size=9.5, color=MUTED)

rows = [
    ['Evaluation (54 held-out utterances)', 'Accuracy', 'Macro-F1', 'What it means'],
    ['Rules only', '0.852', '0.786', 'works, but brittle on unseen phrasing'],
    ['Fuzzy only', '0.852', '0.786', 'same coverage, softer matching'],
    ['Model only', '0.852', '0.887', 'best balance across classes'],
    ['Hybrid (ships)', '0.852', '0.857', 'trade a little F1 for rule coverage'],
]
table(slide, rows, 0.6, 5.7, 12.1, [0.33, 0.14, 0.14, 0.39], font_size=9.5, row_height=0.22)

# ---------------------------------------------------- 6. entity extraction
slide = blank_slide(prs)
header(slide, 'Task 3 · Extract what to play',
       'The number-navigation feature was removed: the rider names a song', 6)

rows = [
    ['Utterance (after normalisation)', 'songTitle', 'artist', 'Action'],
    ['play believer', 'believer', '—', 'search, most popular'],
    ['play song thunder', 'thunder', '—', 'filler “song” dropped'],
    ['play the song believer', 'believer', '—', 'filler on both sides'],
    ['play believer by imagine dragons', 'believer', 'imagine dragons', 'artist-pinned search'],
    ['play levitating by dua lipa', 'levitating', 'dua lipa', 'artist-pinned search'],
    ['play song number seven', '—', '—', 'rejected: numbers removed'],
    ['play music', '—', '—', 'generic title rejected'],
]
table(slide, rows, 0.6, 1.6, 12.1, [0.40, 0.20, 0.20, 0.20], font_size=10.5, row_height=0.36)

card(slide, 0.6, 4.65, 5.9, 2.2)
text(slide, 'Extraction rules', 0.85, 4.82, 4.5, 0.35, size=13, bold=True)
lines(slide, [
    'Find the last “play”, then take everything after it',
    'Strip leading/trailing “song” / “track”',
    'Split on the last “by” → title + artist',
    'Reject generic titles: music, it, something, anything',
], 0.85, 5.2, 5.35, 1.5, size=10.8)

card(slide, 6.75, 4.65, 5.95, 2.2)
text(slide, 'Why it matters for NLP', 7.0, 4.82, 4.5, 0.35, size=13, bold=True)
lines(slide, [
    'A title is free text — anything can follow “play”',
    '“by <artist>” changes the referent, not just the words',
    'Without an entity the intent cannot be actioned (confidence capped at 0.45)',
], 7.0, 5.2, 5.5, 1.5, size=10.8)

# --------------------------------------------------------- 7. confidence
slide = blank_slide(prs)
header(slide, 'Task 4 · Decide whether to act at all',
       'A weighted fusion of four signals, with explicit anti-confusion rules', 7)

card(slide, 0.6, 1.55, 6.1, 1.5, SURFACE_ALT)
text(slide, 'confidence = 0.45·P(intent) + 0.25·fuzzy\n+ 0.20·ASR + 0.10·context',
     0.85, 1.8, 5.7, 0.9, size=12.5, bold=True, spacing=1.35)
text(slide, 'Execute at ≥ 0.60 (Settings: 0.50 / 0.60 / 0.75). Below it: silence — there is no '
            '“did you mean?” question any more.',
     0.85, 2.55, 5.6, 0.45, size=10, color=MUTED)

card(slide, 0.6, 3.25, 6.1, 3.55)
text(slide, 'Two guards that matter', 0.85, 3.42, 4.5, 0.35, size=13, bold=True)
text(slide, '1 · Ambiguity penalty', 0.85, 3.82, 4.0, 0.3, size=11, bold=True, color=WARNING)
text(slide, 'If the top two intents are within 0.10 and form a known confusable pair '
            '(increase/decrease, next/previous, play/pause), the score is multiplied by 0.85 — '
            'a coin flip never executes.',
     0.85, 4.12, 5.5, 0.85, size=10.5, color=MUTED, spacing=1.25)
text(slide, '2 · Direction guard', 0.85, 5.02, 4.0, 0.3, size=11, bold=True, color=WARNING)
text(slide, 'An explicit “up / louder / raise” or “down / quieter / lower” overrides the classifier — '
            'doing the opposite of what was asked is the one unforgivable error.',
     0.85, 5.32, 5.5, 0.85, size=10.5, color=MUTED, spacing=1.25)

card(slide, 7.0, 1.55, 5.7, 2.4)
text(slide, 'Worked example', 7.25, 1.72, 4.5, 0.35, size=13, bold=True)
text(slide, '“increase the volume”', 7.25, 2.08, 4.9, 0.32, size=11.5, color=ACCENT, font=MONO)
text(slide,
     'P = 0.93   fuzzy = 0.88   ASR = 0.75   context = 1.00\n'
     '→ 0.45·0.93 + 0.25·0.88 + 0.20·0.75 + 0.10·1.00 = 0.90   → execute',
     7.25, 2.45, 5.1, 0.8, size=10.5, color=TEXT, spacing=1.35, font=MONO)
text(slide, 'Reported on screen with the reasons, so a wrong decision is diagnosable.',
     7.25, 3.4, 5.0, 0.4, size=9.5, color=MUTED)

card(slide, 7.0, 4.15, 5.7, 2.65)
text(slide, 'Three outcomes instead of guessing', 7.25, 4.32, 5.1, 0.35, size=13, bold=True)
for index, (label, detail, colour) in enumerate([
    ('execute', 'confident enough → do it, and say one short sentence', PRIMARY),
    ('reject, spoken', 'looked like a command but was weak → “Sorry, I didn’t catch that.”', WARNING),
    ('silence', 'confidence < 0.35 → treated as noise, nothing spoken', MUTED),
]):
    top = 4.75 + index * 0.62
    chip(slide, label, 7.25, top, 1.45, 0.32, color=colour)
    text(slide, detail, 8.85, top + 0.02, 3.7, 0.55, size=10, color=MUTED, spacing=1.15)

# ------------------------------------------------ 8. context + selection
slide = blank_slide(prs)
header(slide, 'Task 5 · Context changes the meaning',
       'The same word “play” means RESUME, PLAY or PLAY_SONG depending on state', 8)

rows = [
    ['Said', 'App state', 'Resolved intent'],
    ['“play”', 'a track is paused', 'RESUME'],
    ['“play”', 'nothing queued', 'PLAY'],
    ['“play believer”', 'anything', 'PLAY_SONG (entity present)'],
    ['“play”', 'no song named', 'rejected — song name missing'],
    ['“next song”', 'no playlist / context', 'kept, confidence lowered'],
]
table(slide, rows, 0.6, 1.6, 7.4, [0.24, 0.36, 0.40], font_size=10.5, row_height=0.36)

card(slide, 8.25, 1.6, 4.45, 2.16)
text(slide, 'Context score', 8.5, 1.76, 4.0, 0.32, size=12.5, bold=True)
lines(slide, [
    'Spotify connected?',
    'Is something playing?',
    'Does PLAY_SONG have a title?',
    'Playlist present for skips?',
], 8.5, 2.1, 4.0, 1.5, size=10.5)

card(slide, 0.6, 4.1, 6.1, 2.7)
text(slide, 'From entity to a real song', 0.85, 4.27, 5.0, 0.35, size=13, bold=True)
lines(slide, [
    'Spotify search with field filters: track:“believer”',
    'Rank: exact title > partial, then artist match, then popularity',
    'No artist named → most popular match (Spotify exposes popularity, not views)',
    '“by imagine dragons” → only that artist’s version',
    'Playback starts inside the playlist/album context, so “next” still works',
], 0.85, 4.65, 5.6, 2.0, size=10.5)

card(slide, 7.0, 4.1, 5.7, 2.7)
text(slide, 'Why this is NLP, not plumbing', 7.25, 4.27, 5.1, 0.35, size=13, bold=True)
text(slide,
     '“play believer” contains an intent and a named entity, but no target. Turning the name into a '
     'specific track needs similarity ranking over candidate titles and artists — the same fuzzy and '
     'phonetic machinery used for intents, applied to song metadata.',
     7.25, 4.7, 5.2, 1.4, size=10.8, color=MUTED, spacing=1.3)
text(slide, '“beleiver by imagine dragon” → Believer · Imagine Dragons',
     7.25, 6.15, 5.2, 0.4, size=10.5, color=PRIMARY, font=MONO)

# ------------------------------------------------------ 9. noise as NLP
slide = blank_slide(prs)
header(slide, 'Task 6 · Noise rejection is part of the language problem',
       'Most “misunderstandings” are not misclassification — they are audio that should never be classified', 9)

gates = [
    ('8 dB', 'peak SNR above the noise floor', 'speech from across the road is ignored, not merged'),
    ('4 dB', 'level modulation over ≥ 800 ms', 'steady music is not speech'),
    ('12', 'words maximum per command', 'a conversation is not a command'),
    ('4.5 s', 'maximum utterance', 'long noisy stretches are not stitched together'),
]
for index, (value, label, why) in enumerate(gates):
    left = 0.6 + index * 3.14
    card(slide, left, 1.6, 2.95, 1.85)
    text(slide, value, left + 0.25, 1.75, 2.4, 0.55, size=24, bold=True, color=PRIMARY)
    text(slide, label, left + 0.25, 2.28, 2.5, 0.45, size=9.5, color=TEXT, spacing=1.1)
    text(slide, why, left + 0.25, 2.72, 2.5, 0.6, size=8.5, color=MUTED, spacing=1.1)

card(slide, 0.6, 3.7, 12.1, 1.25, SURFACE_ALT)
text(slide,
     'Order matters: gate first, classify second. Once noise reaches the classifier it can be '
     'confidently wrong — “music” once became PLAY, and a distant sentence became a volume command.',
     0.9, 3.95, 11.5, 0.75, size=12, spacing=1.3)

text(slide, 'Also rejected before NLP', 0.6, 5.2, 5.0, 0.32, size=11.5, bold=True)
lines(slide, [
    '800 ms refractory window after our own spoken reply (loopback)',
    'Whisper annotations: [Music], [BLANK_AUDIO], (applause)',
    'Utterances under 200 ms (a cough, a horn)',
    'Empty transcripts after cleaning',
], 0.6, 5.55, 6.1, 1.4, size=10.5)

text(slide, 'The trade-off we accept', 7.0, 5.2, 5.0, 0.32, size=11.5, bold=True)
text(slide,
     'These gates occasionally drop a real command in heavy wind. That is deliberate: a missed '
     'command costs one repetition, a false command changes the music (or the volume) at the worst '
     'possible moment.',
     7.0, 5.55, 5.55, 1.4, size=10.5, color=MUTED, spacing=1.3)

# ------------------------------------------------------ 10. results + limits
slide = blank_slide(prs)
header(slide, 'What works, and what still does not',
       'Measured on 54 held-out utterances — no cherry-picking', 10)

rows = [
    ['Intent', 'Precision', 'Recall', 'F1', 'Comment'],
    ['INCREASE_VOLUME', '0.67', '0.89', '0.76', 'catches it, sometimes over-triggers'],
    ['DECREASE_VOLUME', '0.86', '0.67', '0.75', 'the hard pair — direction guard protects it'],
    ['NEXT_SONG', '0.86', '1.00', '0.92', 'strong'],
    ['PLAY_SONG', '0.83', '1.00', '0.91', 'strong (entities are distinctive)'],
    ['UNKNOWN', '1.00', '0.20', '0.33', 'noise often labelled as a real intent'],
]
table(slide, rows, 0.6, 1.6, 7.2, [0.30, 0.15, 0.13, 0.10, 0.32], font_size=9.8, row_height=0.36)

card(slide, 8.15, 1.6, 4.55, 2.3)
text(slide, 'Headline numbers', 8.4, 1.76, 4.0, 0.32, size=12.5, bold=True)
lines(slide, [
    'Hybrid accuracy 0.852 (54 held out)',
    'Model-only macro-F1 0.887',
    'Hybrid macro-F1 0.857',
    '177 training utterances, 10 intents',
], 8.4, 2.12, 4.1, 1.6, size=10.5)

text(slide, 'Honest limitations', 0.6, 4.25, 5.0, 0.32, size=12, bold=True, color=WARNING)
lines(slide, [
    'UNKNOWN recall is 0.20 — noise is the weakest class',
    'increase ↔ decrease remains the dominant confusion',
    'No calibrated ASR confidence from whisper.cpp, so it is estimated',
    'Dataset is small and written, not recorded on a bike',
], 0.6, 4.6, 6.1, 1.9, size=10.5)

text(slide, 'What we changed because of it', 7.0, 4.25, 5.5, 0.32, size=12, bold=True, color=PRIMARY)
lines(slide, [
    'Direction guard overrides the classifier on explicit up/down words',
    'Low-confidence commands are dropped instead of guessed or questioned',
    'Peak-SNR and word-count gates stop noise reaching the classifier',
    'base.en model + command-bias prompt for damaged phonemes',
], 7.0, 4.6, 5.6, 1.9, size=10.5)

card(slide, 0.6, 6.55, 12.1, 0.34, SURFACE_ALT)
text(slide, 'Next: record in-domain ride audio · calibrate confidence · small.en with quantisation',
     0.85, 6.6, 11.6, 0.28, size=9.5, color=MUTED)

# ----------------------------------------------------------------- 11. Q&A
slide = blank_slide(prs)
text(slide, 'QUESTIONS', 0.9, 2.3, 8.0, 0.9, size=40, bold=True)
text(slide,
     'Thank you — the code, the trained model and the evaluation scripts are in the repository.',
     0.9, 3.25, 11.0, 0.5, size=14, color=MUTED)
card(slide, 0.9, 4.1, 7.0, 0.95, SURFACE_ALT)
text(slide, 'Name 1   ·   Name 2   ·   Name 3   ·   Name 4', 1.15, 4.4, 6.5, 0.4, size=14, bold=True)
text(slide, 'VoiceRiders · hands-free Spotify for riders', 0.9, 5.35, 8.0, 0.35,
     size=11, color=ACCENT)

prs.save(out_path)
print(f'saved {out_path} ({len(prs.slides)} slides)')
