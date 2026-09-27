# Store & developer-app listing copy

Reusable text for the Spotify developer app form and, later, the Google Play /
App Store listings. Keep the trademark line wherever the text is user-visible.

---

## Spotify developer app form

**App name**

```
VoiceRiders
```

**App description**

```
VoiceRiders is a hands-free, noise-adaptive voice controller for Spotify, designed for motorcycle riders. A rider picks one of their own playlists, starts Ride Mode, and controls playback entirely by voice: "next song", "pause", "play song number seven", "increase volume". The app uses on-device voice activity detection so only real speech is processed, and a context-aware NLP pipeline that recovers from speech-to-text errors caused by wind and engine noise. An optional Adaptive Audio Mode adjusts the volume as the road gets louder. Built as an academic project with React Native and the Spotify Web API using OAuth 2.0 with PKCE. Not affiliated with Spotify AB.
```

**Website**

```
https://github.com/ishaanduddi/VoiceRide
```

**Which API/SDKs are you planning to use?** → Web API

**Redirect URI** (must match byte-for-byte, no trailing slash)

```
https://voiceriders-oauth-relay.vercel.app/api/spotify-callback
```

> The app name must not contain "Spotify", and the description must not imply
> Spotify endorsement — Spotify reviews this.

---

## Google Play listing (Phase 10)

**App name** (max 30 chars)

```
VoiceRiders: Voice for Riders
```

**Short description** (max 80 chars)

```
Hands-free, noise-adaptive Spotify control for riders. Just speak.
```

**Full description** (max 4000 chars)

```
VoiceRiders is a hands-free voice controller for Spotify built for motorcycle and scooter riders.

Set up before you ride: connect your own Spotify account, choose a playlist, and start Ride Mode. After that, keep both hands on the bars and simply speak.

WHAT YOU CAN SAY
- Playback: "pause", "resume", "continue playing", "stop"
- Navigation: "next song", "skip this song", "previous song", "go back"
- Volume: "increase volume", "make it louder", "decrease volume", "turn the music down"
- Song selection: "play song number 7", "play number seven", "play the seventh one", "track 7"

Numbers are understood however you say them: digits, cardinals or ordinals.

BUILT FOR NOISY RIDES
Wind, engine and traffic noise wreck speech recognition. VoiceRiders expects that:
- Voice activity detection means only real speech is ever transcribed.
- Speech recognition runs ON THE DEVICE, so it works offline and your voice never leaves your phone.
- A context-aware NLP pipeline recovers from recognition mistakes. If the transcript comes back as "increse volum" it still turns the volume UP — and if the app is not confident, it asks you to repeat instead of guessing.
- Adaptive Audio Mode can raise the volume as the road gets louder, in small steps, without ever undoing your own volume commands.

SAFETY FIRST
VoiceRiders exists to reduce phone interaction, not to add to it. Complete setup and settings before you set off, only use voice control where it is legal and safe, and never operate the screen while riding.

WHAT IT NEEDS
- Your own Spotify account, connected with OAuth 2.0 (PKCE). VoiceRiders never sees your password and never stores a client secret.
- Spotify Premium for playback control.
- Microphone permission, used only while Ride Mode is active.

VoiceRiders is an independent academic project. It is not affiliated with, endorsed by or sponsored by Spotify AB. "Spotify" is a trademark of Spotify AB.
```

**Category** → Music & Audio

**Data safety (Play Console)** → Audio is processed on-device; no audio is uploaded
unless a cloud speech endpoint is explicitly configured. Spotify account data is
used only to control your own playback.

---

## App Store listing (Phase 10)

**Subtitle** (max 30 chars)

```
Hands-free Spotify for riders
```

**Promotional text**

```
Connect your own Spotify account, pick a playlist and control music entirely by voice — even with wind and engine noise.
```

**Keywords** (max 100 chars, comma-separated)

```
voice control,spotify,hands free,motorcycle,rider,bike,offline speech,playlist
```

**Review note for Apple** (paste into App Review Information)

```
VoiceRiders controls playback on the reviewer's own Spotify account and requires
Spotify Premium for playback commands. On first launch, connect Spotify, choose a
playlist, then open Settings and tap "Download speech model" to enable offline
voice recognition. Ride Mode requests microphone access only while it is active.
```

---

## Assets still to produce

- [ ] Replace the placeholder `assets/icon.png` (1024×1024, no transparency for iOS)
- [ ] Adaptive icon foreground/background/monochrome for Android
- [ ] Splash image
- [ ] Play Store: feature graphic (1024×500) + at least 2 phone screenshots
- [ ] App Store: 6.7" and 6.1" screenshots
- [ ] Privacy policy URL (required by both stores — can be a GitHub Pages page)
