# Security

VoiceRiders holds two things worth protecting: **a Spotify session** and **microphone audio**.
This document describes how they are handled and what to do before shipping.

---

## 1. Spotify: public client + PKCE, no secret

Authentication is **OAuth 2.0 Authorization Code with PKCE** (RFC 7636).

```
app                              Spotify
 │  GET /authorize
 │   response_type=code
 │   code_challenge=S256(verifier)
 │   state=<random>              ───────────►  rider signs in
 │  ◄───────────  redirect: ?code=...&state=...
 │  POST /api/token
 │   code + code_verifier        ───────────►
 │  ◄───────────  access_token + refresh_token
```

* The **client secret is never used** and is not present anywhere in the repository or the binary.
* The `code_verifier` never leaves the device; only its SHA-256 challenge is sent up front.
* `state` is verified on return to reject forged redirects.
* `expo-auth-session` performs the code exchange; see `src/spotify/auth/`.

**Search the repo to confirm:**

```bash
git grep -n "client_secret\|clientSecret"    # only doc/API-shape references, no values
```

### The relay that Spotify now requires

Because Spotify enforces HTTPS redirect URIs, `relay/api/spotify-callback.js` receives the callback
and forwards it to the app's custom scheme. It is deliberately **stateless and secret-free**:

* it performs no token exchange — the `code_verifier` never leaves the device;
* a forged request can only produce a redirect carrying arbitrary query parameters, which is useless
  without the verifier, and the app verifies `state` before using the code;
* it forwards only `code`, `state`, `error` and `error_description`, so it cannot be abused as a
  general-purpose open redirect.

## 2. Token storage

Access and refresh tokens are persisted only through `src/storage/secureStore.ts` →
`expo-secure-store`:

* **Android** — encrypted with the Android Keystore.
* **iOS** — Keychain (`kSecClassGenericPassword`).

Tokens are never written to `AsyncStorage`, never logged (`logger` only prints metadata), and never
sent anywhere except `api.spotify.com`. In-memory refresh is **single-flight** so rotated refresh
tokens cannot be raced and invalidated.

> iOS note: Keychain entries survive app uninstall (same bundle id). `disconnectSpotify()` deletes
> the token and cached profile explicitly.

## 3. `EXPO_PUBLIC_*` is not secret

Expo inlines every `EXPO_PUBLIC_*` variable into the JavaScript bundle. Therefore:

| Value | Safe in `EXPO_PUBLIC_*`? |
|-------|--------------------------|
| Spotify client ID | ✅ yes — public by design |
| Spotify client secret | ❌ never — and never needed |
| Access / refresh tokens | ❌ never — keychain only |
| Cloud ASR provider key | ❌ **no** — see below |

### Cloud speech-to-text in production

`EXPO_PUBLIC_ASR_API_KEY` is a **development convenience** for testing in Expo Go. For anything
shipped, point `EXPO_PUBLIC_ASR_ENDPOINT` at your own backend and keep the provider key on the
server:

```
phone ──(WAV, no key)──► your backend ──(provider key)──► Whisper / Google STT
                              │
                         rate limits + auth + logging live here
```

The client only ever talks to `AudioUtterance` → `fetch(endpoint)`. Swapping the URL is the entire
change.

## 4. Microphone and permissions

* `RECORD_AUDIO` / the iOS microphone usage string are requested **only when Ride Mode starts**, not
  at launch.
* The microphone stream is stopped when the Ride Mode screen unmounts and on error paths.
* VAD runs locally; **no audio leaves the device unless a cloud ASR endpoint is configured**.
  The default engine is **on-device Whisper**, so in the shipped configuration speech is never
  uploaded at all — see [`ON_DEVICE_ASR.md`](ON_DEVICE_ASR.md).
* Background recording (`enableBackgroundRecording`) is declared in `app.json` because the
  development-build stage needs it; it shows the OS-mandated recording notification on Android.
  Disable it if you do not need audio while the app is backgrounded.

## 5. Least-privilege scopes

Only the scopes in `src/config.ts` are requested (see `SPOTIFY_SETUP.md`). Do not add scopes "just in
case": each one is a permission the rider is asked to grant.

## 6. Never commit

`.gitignore` already covers these — keep it that way:

* `.env` and `.env*.local`
* Android keystores (`*.jks`, `*.keystore`), `*.p12`, `*.key`, `*.mobileprovision`
* `google-services.json`, `GoogleService-Info.plist`
* EAS credentials (stored by EAS, never in the repo)

`.env.example` documents variable **names only**, with empty values.

## 7. Production hardening checklist

- [ ] Enable **Enhanced Security / token rotation** habits: measure refresh failures in the field.
- [ ] Add certificate pinning if your threat model requires it (not enabled by default).
- [ ] Move ASR behind the backend proxy above, with per-user rate limiting.
- [ ] Review the Play Store **Data safety** and App Store **Privacy Nutrition** answers:
      "Audio is processed on-device unless cloud ASR is configured".
- [ ] Keep `ios.config.usesNonExemptEncryption: false` (already set) to avoid export-compliance prompts.
- [ ] Re-run `git grep -i "secret\|token"` before every release.

## Reporting

This is a coursework project; report issues by opening an issue on the repository rather than
through a private disclosure channel.
