# VoiceRiders — Privacy Policy

**Last updated:** 23 November 2026
**Contact:** ishaan.duddi@gmail.com

VoiceRiders is a student project that controls Spotify playback by voice. This
policy explains what the app does with your data. Short version: everything stays
on your phone, and the only outside service is Spotify itself.

## What the app stores

- **Spotify OAuth tokens** (access and refresh tokens) — stored only in Android's
  encrypted storage (`expo-secure-store`) on your device. They are used to call
  the Spotify Web API on your behalf and are never sent to the developer.
- **Your Spotify display name and account type** — read from the Spotify API to
  show "Connected" and to warn about Free accounts.
- **App settings** — playlist choice, microphone choice, volume preferences —
  stored locally on the device.
- **No account is created with the developer, and there is no VoiceRiders server
  that stores personal data.**

## Microphone and voice

- Audio is captured only while **Ride Mode** is active.
- Speech recognition runs **on the device** using Whisper (whisper.cpp). Audio is
  not uploaded anywhere by default.
- If a cloud speech endpoint is configured in a custom build, only the short
  command audio is sent to that endpoint; the default build of this app does not
  use one.
- Recordings are not retained after transcription.

## Spotify

The app uses Spotify's Web API with the scopes: read playlists, read/modify
playback, read your profile and email. It does not modify your library, follow
artists, or change your account. Spotify's own privacy policy applies to data
Spotify holds.

Authentication uses OAuth 2.0 with PKCE. There is **no client secret** in the app.

## Analytics, ads and sharing

- No analytics SDKs, no advertising, no crash-reporting service.
- No personal data is sold or shared with third parties.
- Network requests go only to `api.spotify.com`, `accounts.spotify.com`, the
  OAuth relay used for the redirect (`voiceriders-oauth-relay.vercel.app`), and
  the speech-model host when you download the model.

## Permissions

- **Microphone** — to hear commands in Ride Mode.
- **Notifications / foreground service** — to keep listening with the screen off.
- **Install from unknown sources** — only for installing the APK itself.

You can revoke any permission in Android Settings; the app then works only in the
foreground (or not at all for voice).

## Children

The app is not directed at children under 13 and requires a Spotify account.

## Changes

Any change to this policy will be published in the project repository at
https://github.com/ishaanduddi/VoiceRide.

## Contact

Questions or a data request: **ishaan.duddi@gmail.com**
