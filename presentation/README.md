# Presentation — VoiceRiders

Two decks live here.

## A. NLP deck (current progress)

| File | Contents |
|------|----------|
| `VoiceRiders-NLP-Presentation.pptx` | 11 slides: the NLP-heavy parts of the app as it behaves today — pipeline, on-device ASR, normalisation + intent classification, entity extraction, confidence fusion, context, noise gating, measured results |
| `VoiceRiders-NLP-Speaker-Scripts.docx` | Four 60-second scripts (Name 1–4 placeholders), a timing table, delivery notes and likely questions |

Running order:

| Time | Speaker | Slides | Section |
|------|---------|--------|---------|
| 0:00 – 1:00 | Name 1 | 1–3 | Problem framing + pipeline |
| 1:00 – 2:00 | Name 2 | 4–5 | ASR, normalisation, intent classification |
| 2:00 – 3:00 | Name 3 | 6–7 | Entity extraction, confidence guards |
| 3:00 – 4:00 | Name 4 | 8–10 | Context, song selection, noise, results |

Replace "Name 1 … Name 4" on the title slide, the closing slide and in the
scripts before presenting.

Regenerate:

```powershell
python tools/make_nlp_deck.py    "C:\ISHU\Education\Amrita\5th_Sem\NLP\VoiceRiders-NLP-Presentation.pptx"
python tools/make_nlp_scripts.py "C:\ISHU\Education\Amrita\5th_Sem\NLP\VoiceRiders-NLP-Speaker-Scripts.docx"
```

## B. 4-minute review deck

| File | Contents |
|------|----------|
| `VoiceRiders-4min.pptx` | 6 slides — title, Architecture & Tech Stack, Literature Survey, Competing Market, Current Status, Questions |
| `VoiceRiders-Speaker-Scripts.docx` | Four ~60-second scripts, a timing table, and delivery tips |

## Running order (4 speakers × 60 seconds)

| Time | Speaker | Slide | Section |
|------|---------|-------|---------|
| 0:00 – 1:00 | Ishaan Balakrishna Duddi | 2 | Architecture & Tech Stack |
| 1:00 – 2:00 | MD Thejas | 3 | Literature Survey |
| 2:00 – 3:00 | Jai Abhinav | 4 | Competing Market |
| 3:00 – 4:00 | Praveen Raj | 5 | Current Status |

Each speaker advances the deck to their own slide when their minute starts.
Then questions.

## Adding the app screenshots (slide 5)

The deck has three empty frames on slide 5. To fill them:

1. Save three screenshots and name them exactly:

   | Filename | Shot to take |
   |----------|--------------|
   | `app-1.png` | Connect Spotify screen |
   | `app-2.png` | Choose a playlist screen |
   | `app-3.png` | Ride Mode screen |

2. Put them in a folder called `ppt-assets` **next to the .pptx file**:

   ```
   C:\ISHU\Education\Amrita\5th_Sem\NLP\ppt-assets\app-1.png
                                                  app-2.png
                                                  app-3.png
   ```

3. Regenerate the deck (the pictures are embedded automatically):

   ```powershell
   cd C:\ISHU\Education\Amrita\5th_Sem\NLP\VoiceRiders
   python tools/make_4min_deck.py "C:\ISHU\Education\Amrita\5th_Sem\NLP\VoiceRiders-4min.pptx"
   ```

`.png`, `.jpg` and `.jpeg` all work. If a file is missing, that frame keeps its
placeholder text, so the deck is safe to present either way.

## Regenerating

Both pairs of files are generated, so content changes are made in the scripts:

```powershell
python tools/make_nlp_deck.py        "C:\ISHU\Education\Amrita\5th_Sem\NLP\VoiceRiders-NLP-Presentation.pptx"
python tools/make_nlp_scripts.py     "C:\ISHU\Education\Amrita\5th_Sem\NLP\VoiceRiders-NLP-Speaker-Scripts.docx"
python tools/make_4min_deck.py       "C:\ISHU\Education\Amrita\5th_Sem\NLP\VoiceRiders-4min.pptx"
python tools/make_speaker_scripts.py "C:\ISHU\Education\Amrita\5th_Sem\NLP\VoiceRiders-Speaker-Scripts.docx"
```

Requirements: `pip install python-pptx python-docx`

## Competing market slide — what is being claimed

Rows compared: Siri / Google Assistant, Spotify in-app voice, Android Auto / car head
units, **Honda Smartphone Voice Control (Honda RoadSync)**, **Harley-Davidson Boom!
Box**, **Cardo / Sena helmet intercoms**, Bluetooth media buttons, and VoiceRiders.

Two claims, phrased carefully so they hold up if challenged:

- The OEM systems are **tied to specific models** and **delegate the actual speech
  recognition to the phone's assistant** — they do not run their own model in-app.
- Only VoiceRiders does all four at once: **no wake word**, **noise-aware volume**,
  **song-number navigation**, and **in-app on-device recognition**, with **no extra
  hardware** beyond a phone and a headset.

Do **not** say the OEM systems "don't work" — they work well, on the bikes that have
them. The argument is about the combination and the hardware requirement, not quality.

## Facts used on the slides

Everything stated is implemented in this repository, so it can be defended if
asked:

- On-device speech recognition: `src/voice/asr/whisper/` (whisper.cpp via whisper.rn)
- Voice activity detection: `src/voice/vad/energyVad.ts`
- NLP pipeline: `src/nlp/` (normalisation, classifier, entities, fuzzy match, context, confidence, dispatcher)
- Trained model + evaluation harness: `ml/`
- Spotify OAuth 2.0 + PKCE, and the relay Spotify's HTTPS redirect rule requires: `src/spotify/auth/`, `relay/`
- Adaptive Audio: `src/adaptiveAudio/`
- Android build: `eas.json`

The one caveat worth remembering if a lecturer asks: Spotify's **Development
Mode** only permits reading playlists the account owns or collaborates on, and
playback/volume control requires **Premium**.
