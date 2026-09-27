# Roadmap — Phases 9 and 10

Phases 1–8 are implemented in this repository. What remains requires a development build, a physical
device, or a store account.

---

## Phase 9 — Development build and device testing

### 9.1 Why a development build is needed

Expo Go contains only Expo's bundled native modules and cannot run a custom native runtime. A
development build gives the app its own binary (with `expo-dev-client`) so that:

* continuous microphone capture runs with the app backgrounded (`enableBackgroundRecording`);
* the Android foreground service + persistent notification required for background audio exist;
* `voiceriders://spotify-callback` is a real deep link (OAuth returns reliably);
* a native VAD / on-device ASR module can be added later.

`app.json` already declares the microphone permission, background recording/playback and the
required Android permissions; `eas.json` already defines the `development`, `preview` and
`production` profiles. Per this repository's `AGENTS.md`, **never hand-edit `ios/` or `android/`** —
they are generated (CNG); configure native behaviour through `app.json` and config plugins.

### 9.2 Build and install

```bash
npx eas-cli@latest login
npx eas-cli@latest build --profile development --platform android
# install the resulting APK, then:
npx expo start --dev-client
```

iOS requires an Apple Developer account for device builds; `--platform ios` with an internal
distribution profile is the usual route.

### 9.3 Device test plan

| # | Test | Pass criterion |
|---|------|----------------|
| 1 | Connect Spotify on a **second** account (not the app owner's) | Authorization succeeds after adding the user in the dashboard |
| 2 | Select a 50+ track playlist | All tracks numbered contiguously; unplayable locals hidden without shifting numbers |
| 3 | "play song number 7" | Track 7 starts; response names the track |
| 4 | "play song number 500" | *"That playlist has only N songs."* (not a crash, not a guess) |
| 5 | "increse volum" (deliberate mispronunciation) | Volume increases, or the app asks to repeat — **never** decreases |
| 6 | Pause, then say "play" | Resumes (context maps `PLAY` → `RESUME`) |
| 7 | Ride with Adaptive Audio on | Volume rises in noisy zones, falls back quietly; never oscillates |
| 8 | Say "increase volume", then ride into noise | Manual step is preserved as the new baseline |
| 9 | Screen locked / app backgrounded | Audio continues; microphone policy behaves as configured |
| 10 | No Spotify device open | Clear "no active device" message, or automatic device wake |

### 9.4 Optional native upgrades

* **VAD** — swap `EnergyVad` for WebRTC VAD or Silero VAD behind the same
  `process(frame, durationMs)` interface (see `docs/ARCHITECTURE.md` §5).
* **On-device ASR** — implement `AsrProvider` with `whisper.rn` / `whisper.cpp` (and a quantised
  tiny/base model) for offline, private, zero-network recognition. The `AsrProvider` interface was
  designed for this: PCM in, `{ text, confidence }` out.
* **Companion app** for route/navigation intents (out of scope for this brief).

---

## Phase 10 — Optimization, security, production release

### 10.1 Optimization backlog

- [ ] Profile a 30-minute ride: CPU, RAM, battery (`docs/EVALUATION.md` §4).
- [ ] If a native ASR model is added, load/unload it around utterances rather than keeping it resident.
- [ ] Cache playlist/track metadata with a TTL so app start is instant on poor signal.
- [ ] Add an offline queue for playback commands issued while connectivity drops.
- [ ] Reduce `MAX_UTTERANCE_MS` if latency dominates; raise it if commands get clipped.

### 10.2 Security

Follow the checklist in [`SECURITY.md`](SECURITY.md#7-production-hardening-checklist). The
highest-impact item is moving cloud ASR behind a backend proxy so no provider key ships in the app.

### 10.3 Production builds

```bash
npx eas-cli@latest build --profile production --platform android
npx eas-cli@latest build --profile production --platform ios
npx eas-cli@latest submit --platform android --profile production
npx eas-cli@latest submit --platform ios --profile production
```

Before submitting:

1. Replace the placeholder icons/splash in `assets/` with real artwork.
2. Confirm `version` / `android.versionCode` / `ios.buildNumber` via `autoIncrement` (already in `eas.json`).
3. Set the production Spotify redirect URI to `voiceriders://spotify-callback` and, if you publish a
   web build, register the HTTPS origin too.
4. Prepare store metadata (see below).

### 10.4 Store submission notes

| Item | Android (Play) | iOS (App Store) |
|------|----------------|-----------------|
| Microphone | Declare `RECORD_AUDIO`; justify it as the core feature | `NSMicrophoneUsageDescription` is set by the `expo-audio` plugin |
| Background audio | Foreground service + notification declared | `UIBackgroundModes: audio` declared |
| Privacy | Data-safety form: audio processed on-device unless a cloud ASR endpoint is configured | Privacy nutrition labels: same statement |
| Encryption | n/a | `usesNonExemptEncryption: false` already set |
| Review note | — | Tell reviewers that playback requires a **Premium** Spotify account and that Spotify is a third-party service |
| Trademark | Do not imply Spotify endorsement; the app name/marketing must not use Spotify branding as if official | same |

### 10.5 Known limitations

* Playback control requires Spotify **Premium**.
* App-owner's Spotify app is in Development Mode: up to 25 allow-listed users until the dashboard
  quota extension is approved.
* Song selection is positional ("number 7"), not by title/artist — that is a deliberate design choice
  for hands-free use, and a natural next feature is a title/artist matcher on top of the same
  fuzzy-matching primitives.
* Adaptive Audio thresholds are calibrated per device; ship sensible defaults and let riders pick a
  profile.
* Voice TTS confirmations can be masked by wind; the app vibrates as a second channel
  (`settings.hapticsEnabled`).
