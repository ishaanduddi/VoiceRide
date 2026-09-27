# VoiceRiders

**Hands-free, noise-adaptive voice control for Spotify — built for motorcycle riders.**

VoiceRiders lets you connect your own Spotify account, pick a playlist, start **Ride Mode**, and
control music entirely by voice. It is designed for the worst possible listening conditions:
wind, engine noise, traffic and a phone tucked inside a jacket.

> This is not "voice control for Spotify" with a keyword list. The interesting part is what happens
> when speech recognition gets it *wrong* and the app still does the right thing.

---

## What makes it different

| # | Feature | Where it lives |
|---|---------|----------------|
| 1 | Hands-free voice control (no wake word) | `src/voice`, `src/ride` |
| 2 | Voice Activity Detection so ASR only runs on real speech | `src/voice/vad/energyVad.ts` |
| 3 | Context-aware NLP (uses what is playing/selected) | `src/nlp/context` |
| 4 | Fuzzy recovery from ASR errors (typos, phonetics) | `src/nlp/fuzzyMatcher` |
| 5 | Entity extraction for "play song number seven" | `src/nlp/entityExtractor` |
| 6 | Confidence-based resolution — refuses to guess | `src/nlp/confidence` |
| 7 | Adaptive Audio Mode (noise-aware volume) | `src/adaptiveAudio` |
| 8 | Real ML intent classifier, trained + evaluated | `ml/`, `src/nlp/intentClassifier` |
| 9 | Mobile-first, rider-oriented UI | `src/app`, `src/components` |
| 10 | PKCE-only Spotify auth, secure token storage | `src/spotify/auth`, `src/storage` |
| 11 | On-device Whisper: offline, private ASR + command biasing | `src/voice/asr/whisper` |
| 12 | An HTTPS OAuth relay, because Spotify now rejects custom schemes | `relay/` |

---

## Status by development phase

| Phase | Scope | Status |
|-------|-------|--------|
| 1 | Expo project, UI, Spotify OAuth + PKCE, connection | ✅ implemented |
| 2 | Fetch playlists, select, fetch tracks, number them | ✅ implemented |
| 3 | Playback: play / pause / resume / next / previous / volume | ✅ implemented |
| 4 | Microphone, VAD, ASR abstraction, command parsing | ✅ implemented |
| 5 | NLP: intent classification, entity extraction, number normalization | ✅ implemented |
| 6 | Context-aware fuzzy resolution, ASR-error recovery, confidence scoring | ✅ implemented |
| 7 | Ride Mode, hands-free operation | ✅ implemented |
| 8 | Adaptive Audio Mode (estimation, smoothing, hysteresis) | ✅ implemented |
| 9 | Development build + Android/iOS device testing | ⏳ APK path ready & documented — needs an EAS build + a phone; on-device Whisper already wired in |
| 10 | Optimization, production builds, Play Store / App Store | ⏳ see `docs/ROADMAP.md` |

Everything ships as **source + configuration**; the only unavailable parts are the ones that
physically require a development build, a device, or a store account.

---

## Quick start

### 1. Install

```bash
npm install
```

### 2. Configure

```bash
cp .env.example .env      # Windows: copy .env.example .env
```

Set at minimum:

```env
EXPO_PUBLIC_SPOTIFY_CLIENT_ID=your_public_client_id
EXPO_PUBLIC_SPOTIFY_REDIRECT_URI=https://your-relay.vercel.app/api/spotify-callback
```

The second value is not optional in practice: **Spotify requires an HTTPS redirect URI and rejects
custom app schemes**, so the callback goes through the tiny relay in [`relay/`](relay/README.md)
(one `npx vercel deploy --prod`). Full walkthrough: [`docs/SPOTIFY_SETUP.md`](docs/SPOTIFY_SETUP.md).

> Never put a Spotify **client secret** anywhere in this project. PKCE means there isn't one.

### 3. Run

```bash
npx expo start          # then scan the QR code with Expo Go (UI + Spotify work here)
```

Expo Go is enough for onboarding, playlists and playback. For continuous microphone capture and
production builds you need a **development build** (`docs/ROADMAP.md`, Stage 2).

### 4. (Optional) Train the NLP model

The repository ships a trained `model.json`. To retrain and re-evaluate:

```bash
pip install -r ml/requirements.txt
npm run ml:train       # writes src/nlp/intentClassifier/model.json
npm run ml:eval-intent # accuracy / P / R / F1 / confusion matrix + baseline comparison
npm run ml:wer         # Word Error Rate per noise environment
```

---

## Install on your phone (APK — no store account)

You do **not** need Google Play ($25) or an Apple Developer account ($99) to *use* VoiceRiders on your
own phone. EAS builds a standalone APK you can sideload. The `preview` profile in `eas.json` is already
configured for exactly this (`distribution: internal`, `buildType: apk`, no dev-client launcher).

```bash
# 1. free Expo account, once
npx eas-cli@latest login
npx eas-cli@latest init          # links this repo to an EAS project (writes extra.eas.projectId)

# 2. give the build the public config it needs (see note below)
#    eas.json -> build.preview.env   OR   use eas env:create

# 3. build the APK
npx eas-cli@latest build --profile preview --platform android
```

EAS prints a progress URL and, at the end, a **download link / QR code** for the `.apk`. Open it on the
phone and allow "install from unknown sources".

> **Why step 2 matters:** `.env` is git-ignored, so it is *not* uploaded to the build. Build-time
> `EXPO_PUBLIC_*` values must come from EAS. Either add them to `eas.json`:
>
> ```json
> "preview": {
>   "distribution": "internal",
>   "android": { "buildType": "apk" },
>   "env": {
>     "EXPO_PUBLIC_SPOTIFY_CLIENT_ID": "your_client_id",
>     "EXPO_PUBLIC_SPOTIFY_REDIRECT_URI": "https://your-relay.vercel.app/api/spotify-callback"
>   }
> }
> ```
>
> or with `npx eas-cli@latest env:create --name EXPO_PUBLIC_SPOTIFY_CLIENT_ID --value <id> --environment preview --visibility plain`
> (the client id is public, so `plain` is correct — never mark a real secret as `plain`).

After installing:

1. Deploy the OAuth relay once (`relay/`) and register its URL with Spotify — see
   [`docs/SPOTIFY_SETUP.md`](docs/SPOTIFY_SETUP.md). The APK returns via `voiceriders://spotify-callback`.
2. **Settings → Speech recognition → Download speech model** (~75 MB, one time) to enable offline voice
   control.
3. Add each tester's Spotify account under **User management** in the Spotify dashboard (up to 25).

`npx eas-cli@latest build --profile development --platform android` produces a second APK that *does*
load JS from your dev server — useful while iterating, not for daily riding.

---

## Environment variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `EXPO_PUBLIC_SPOTIFY_CLIENT_ID` | yes | Public Spotify client id (not a secret) |
| `EXPO_PUBLIC_SPOTIFY_REDIRECT_URI` | yes | HTTPS relay URL registered with Spotify (custom schemes are rejected) |
| `EXPO_PUBLIC_SPOTIFY_APP_RETURN_URI` | no | Where the relay returns into the app; defaults to `voiceriders://spotify-callback` |
| `EXPO_PUBLIC_SPOTIFY_MARKET` | no | ISO-3166 market code, e.g. `IN` |
| `EXPO_PUBLIC_ASR_PROVIDER` | no | `auto` (default) · `on-device` · `cloud` · `off` |
| `EXPO_PUBLIC_WHISPER_MODEL_URL` | no | GGML model to download; defaults to whisper.cpp `tiny.en` |
| `EXPO_PUBLIC_WHISPER_MODEL_FILENAME` | no | Local filename for the model |
| `EXPO_PUBLIC_WHISPER_USE_GPU` | no | `true` (default) lets whisper.cpp use GPU/NPU |
| `EXPO_PUBLIC_WHISPER_MAX_THREADS` | no | CPU threads for on-device decoding (default 4) |
| `EXPO_PUBLIC_ASR_ENDPOINT` | no | Cloud STT for development; blank = cloud disabled |
| `EXPO_PUBLIC_ASR_API_KEY` | no | **Not a secret** — see `docs/SECURITY.md` |
| `EXPO_PUBLIC_ASR_MODEL` | no | Model hint sent to your ASR endpoint |

Anything prefixed `EXPO_PUBLIC_` is inlined into the shipped bundle. Treat it as public.

## Speech recognition

Two interchangeable engines sit behind one `AsrProvider` interface:

* **On-device Whisper** (`whisper.cpp` via `whisper.rn`) — offline, private, no API key, no per-request
  cost. Needs a **development build** and a one-time model download (**Settings → Speech recognition**).
  Default when the model is present.
* **Cloud endpoint** — POST each utterance as a WAV, read `{ text }`. Works in Expo Go; needs your own
  endpoint. The API key belongs on your server, not in the bundle.

The engine factory picks automatically (`auto`), and both paths are detailed in
[`docs/ON_DEVICE_ASR.md`](docs/ON_DEVICE_ASR.md). Command biasing seeds Whisper's decoder with the
command vocabulary, which matters a lot for short, noisy utterances.

---

## How to use it

1. **Connect Spotify** — OAuth 2.0 Authorization Code + PKCE against your own account.
2. **Choose a playlist** — VoiceRiders numbers the playable tracks (`1..N`) and keeps a local
   `number → trackId` map.
3. **Start Ride Mode** — microphone + VAD start, the screen shows only what a rider needs.
4. **Speak.** No wake word.

| You say | Intent | Action |
|---------|--------|--------|
| "pause" / "pause the music" / "stop" | `PAUSE`, `STOP` | pause playback |
| "resume" / "continue playing" / "play" | `RESUME`, `PLAY` | resume playback |
| "next song" / "skip this song" / "play the next track" | `NEXT_SONG` | skip forward |
| "previous song" / "go back" | `PREVIOUS_SONG` | skip back |
| "increase volume" / "make it louder" / "turn the music up" | `INCREASE_VOLUME` | volume + step |
| "decrease volume" / "make it quieter" / "turn the music down" | `DECREASE_VOLUME` | volume − step |
| "play song number 7" / "play number seven" / "play the seventh one" / "track 7" | `PLAY_SONG` | jump to track 7 |
| anything else | `UNKNOWN` | *"Sorry, I didn't catch that."* |

Numbers are understood as digits, cardinals and ordinals — `7`, `seven`, `seventh`,
`number seven`, `song number seven`, `track 7`, `the seventh one` all resolve to `song_number = 7`.

---

## The interesting bit: "increase" vs "decrease"

Road noise corrupts speech, and the two volume commands are 90% similar as strings. Naive fuzzy
matching would happily turn:

```
ASR:  "decrese volum"
      -> closest vocabulary word -> "decrease volume"     (lucky)
ASR:  "increse volum"
      -> closest vocabulary word -> "decrease volume"     (wrong, and loud)
```

So fuzzy similarity is **never** allowed to decide on its own. The final confidence blends four
independent signals:

```
confidence = 0.45 * intent_confidence      (ML + rules fused)
           + 0.25 * fuzzy_similarity
           + 0.20 * asr_confidence
           + 0.10 * context_score
```

…then applies an explicit penalty when the top two candidates are a known **confusable pair**
(`INCREASE_VOLUME`/`DECREASE_VOLUME`, `NEXT_SONG`/`PREVIOUS_SONG`, `PLAY`/`PAUSE`, …) and the
margin is under `0.12`. Below the execute threshold the app asks you to repeat instead of guessing.

Walkthrough with the confidence arithmetic: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## Machine learning results

Dataset: `ml/data/commands.jsonl`, **187 utterances / 10 intents**, including deliberate
ASR-corruption variants. Held-out test split: **57 utterances** (stratified, seed 42).

| Approach | Accuracy | Macro F1 |
|----------|---------:|---------:|
| Exact / rule-based matching | 0.842 | 0.788 |
| Fuzzy matching only | 0.842 | 0.788 |
| ML only (TF-IDF + Logistic Regression) | 0.754 | 0.751 |
| **Hybrid ML + rules — what ships in the app** | **0.860** | **0.865** |

Full precision/recall/F1 per intent and the confusion matrices are regenerated by
`npm run ml:eval-intent` into `ml/metrics/intent_metrics.json`.

On-device inference is a handful of dot products: the exported `model.json` carries the vocabulary,
IDF vector and coefficients, and `classifier.ts` reproduces sklearn's transform exactly
(unigrams + adjacent bigrams, IDF weighting, L2 norm) — so the phone behaves like the evaluation.

### ASR robustness (Word Error Rate)

| Environment | WER | Command still recovered |
|-------------|----:|------------------------:|
| Quiet | 0.000 | 100% |
| Music playing | 0.000 | 100% |
| Wind | 0.517 | 100% |
| Engine | 0.667 | 100% |
| Traffic | 0.417 | 100% |
| **Overall** | **0.320** | **100%** |

The point: transcripts can be *two-thirds wrong* and the command is still understood, because
normalization + fuzzy matching + context reconstruct the intent. Methodology and how to extend the
dataset: [`docs/EVALUATION.md`](docs/EVALUATION.md).

---

## Project structure

```
VoiceRiders/
├── src/
│   ├── app/                 # Expo Router screens (file = route)
│   ├── components/          # reusable UI
│   ├── spotify/             # auth (PKCE) · api · playback
│   ├── voice/               # microphone · vad · asr · audioProcessing
│   ├── nlp/                 # preprocessing · intentClassifier · entityExtractor
│   │                        # · fuzzyMatcher · context · confidence · dispatcher
│   ├── adaptiveAudio/       # noise estimation · smoothing · hysteresis · volume
│   ├── state/              # observable stores (session, library, settings, context)
│   ├── services/            # composition root + bootstrap
│   ├── ride/                # Ride Mode orchestration hook
│   ├── effects/             # TTS + haptics
│   ├── storage/             # secure tokens + preferences
│   └── utils/               # logger · errors · async
├── ml/                      # Python: dataset, training, evaluation, WER
├── relay/                   # HTTPS OAuth relay Spotify now requires
├── docs/                    # architecture, setup, security, evaluation, roadmap
└── assets/
```

### Mapping to the brief's proposed layout

The brief proposed `app/screens`, `app/navigation`, `spotify/`, `voice/`, `nlp/`, … The project uses
**Expo Router**, which this repository's `AGENTS.md` mandates: routes are files under `src/app/`
and non-route code must live outside it. The domain folders are therefore siblings of `src/app/`
rather than children of it, and each proposed screen became a route:

| Brief | Actual |
|-------|--------|
| `app/screens/Welcome` | `src/app/index.tsx` |
| `app/screens/SpotifyConnection` | `src/app/connect.tsx` |
| `app/screens/Home` | `src/app/home.tsx` |
| `app/screens/PlaylistSelection` | `src/app/playlists.tsx` |
| `app/screens/PlaylistTracks` | `src/app/playlist/[id].tsx` |
| `app/screens/RideMode` | `src/app/ride.tsx` |
| `app/screens/Settings` | `src/app/settings.tsx` |
| `app/navigation` | `src/app/_layout.tsx` |
| `app/components` | `src/components/` |
| `app/services` | `src/services/` |
| `spotify/`, `voice/`, `nlp/`, `adaptiveAudio/`, `storage/`, `utils/` | identical, under `src/` |

---

## Scripts

| Command | Does |
|---------|------|
| `npm start` | Start the Expo dev server |
| `npm run android` / `npm run ios` | Start on a device/emulator |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | `expo lint` |
| `npm run doctor` | `expo-doctor` |
| `npm run ml:train` | Train + export the intent model |
| `npm run ml:eval-intent` | Metrics + confusion matrix + baseline comparison |
| `npm run ml:wer` | Word Error Rate per noise environment |

---

## Security in one paragraph

No Spotify client secret exists anywhere in this project — authentication is OAuth 2.0
Authorization Code with PKCE (RFC 7636), and access/refresh tokens are stored only in the OS
keychain via `expo-secure-store`. Each user connects their own account. Write-only API keys for
optional cloud speech-to-text are the one thing that must never be committed; `.env` is git-ignored
and `.env.example` documents the shape. Details and the production-hardening path:
[`docs/SECURITY.md`](docs/SECURITY.md).

## Safety

VoiceRiders exists to *reduce* phone interaction, not to make riding more dangerous. Complete
onboarding, playlist selection, settings and permissions **before** you set off. The manual command
box in Ride Mode is a development/testing aid and must not be used while riding. Only use
voice control where it is legal and safe to do so.

---

## Documentation

| Document | Contents |
|----------|----------|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Every layer, data flow, extension points |
| [`docs/SPOTIFY_SETUP.md`](docs/SPOTIFY_SETUP.md) | Dashboard setup, redirect URIs, troubleshooting |
| [`docs/SECURITY.md`](docs/SECURITY.md) | PKCE, token storage, secret handling |
| [`docs/EVALUATION.md`](docs/EVALUATION.md) | Datasets, metrics, how to reproduce/extend |
| [`docs/ON_DEVICE_ASR.md`](docs/ON_DEVICE_ASR.md) | Offline Whisper: dev build, models, tuning |
| [`docs/STORE_LISTING.md`](docs/STORE_LISTING.md) | Spotify app form + Play/App Store copy |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Phases 9–10: dev builds, device testing, store release |

## Contributing (group members)

`npm run typecheck` and `npm run lint` must pass before a pull request. Retrain the model only if you
change the dataset or the lexicons in `src/nlp/shared/` — and commit the regenerated
`model.json` together with the metrics, so the reported numbers always match the shipped artifact.

## License

See [`LICENSE`](LICENSE).
