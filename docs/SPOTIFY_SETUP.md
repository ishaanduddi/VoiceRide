# Spotify setup

VoiceRiders authenticates with **OAuth 2.0 Authorization Code + PKCE**. That means:

* you need a Spotify **Client ID** (public),
* you must **never** use or commit a **Client Secret**,
* each rider connects their **own** account.

---

## 1. Create the Spotify application

1. Sign in at <https://developer.spotify.com/dashboard> with the account that will own the app.
2. **Create app**. Any name/description; for "Redirect URI" put a placeholder for now.
3. Under **Which API/SDKs are you planning to use?** select **Web API**.
4. Open the app → **Settings** and copy the **Client ID**.

## 2. Register the Redirect URI (exactly)

The Connect screen in the app *prints the exact redirect URI it will use*. Copy it from there into
**Settings → Redirect URIs** and press **Add**. A trailing slash or a different scheme/host will make
Spotify return `INVALID_CLIENT: Invalid redirect URI`, so copy/paste rather than retype.

| Environment | Redirect URI | Notes |
|-------------|--------------|-------|
| Development build / production | `voiceriders://spotify-callback` | Matches `scheme: "voiceriders"` in `app.json` |
| Expo Go (dev only) | `exp://<your-lan-ip>:8081/--/spotify-callback` | Varies per machine; copy from the Connect screen |

If your Expo Go URI keeps changing, either register each one or develop the OAuth flow in a
development build (recommended — see [`ROADMAP.md`](ROADMAP.md)).

## 3. Configure the app

```bash
cp .env.example .env     # Windows: copy .env.example .env
```

```env
EXPO_PUBLIC_SPOTIFY_CLIENT_ID=the_client_id_you_copied
EXPO_PUBLIC_SPOTIFY_MARKET=IN        # optional
```

Restart Expo after editing `.env` (env vars are inlined at bundle time).

## 4. Add your group members as test users

While the app is in **Development Mode** it can only be used by accounts you explicitly allow:

**Dashboard → your app → Settings → User Management → Add user** (email + display name of the
Spotify account). Development Mode allows up to **25 users**. A person who is not on that list sees
an error during authorization, no matter how correct the code is.

## 5. Scopes requested

VoiceRiders asks for the minimum needed:

```
playlist-read-private          read the user's playlists
playlist-read-collaborative    read shared playlists
user-read-private              profile (display name, product tier)
user-read-email                account identity
user-read-playback-state       current track / volume / device
user-modify-playback-state     play, pause, skip, volume
user-read-currently-playing    current track
```

## 6. Spotify Premium

Playback **control** (play/pause/skip/volume) requires a **Premium** account. With a free account,
read endpoints work but `/me/player/*` mutations return `403`. The app surfaces this as
*"Spotify Premium is required for playback control."*

---

## Troubleshooting

| Symptom | Cause / fix |
|---------|-------------|
| `INVALID_CLIENT: Invalid redirect URI` | The redirect URI is not registered **byte-for-byte**. Copy it from the Connect screen. |
| `INVALID_CLIENT: Invalid client` | `EXPO_PUBLIC_SPOTIFY_CLIENT_ID` is empty or wrong, or Expo was not restarted after editing `.env`. |
| Authorization says the user is not allowed | Add the Spotify account under **User Management** (Development Mode). |
| `403 Player command failed: Premium required` | Use a Premium account, or keep to read-only testing. |
| `404` / `NO_ACTIVE_DEVICE` | Open the Spotify app, connect a device (phone/PC), press play once so a device becomes "active", then retry. VoiceRiders will try to wake a device automatically. |
| `429 Too Many Requests` | Spotify rate limit; wait a moment. Tokens refresh automatically. |
| Token expired mid-ride | Handled: `authService` refreshes once and retries the request. If the refresh token itself is revoked, the app asks you to reconnect. |
| Sign-in works but the app does not come back | The deep-link scheme is missing. `app.json` must contain `"scheme": "voiceriders"`; changing it requires a rebuild. |

## Why there is no `.env` `CLIENT_SECRET`

A secret inside a mobile binary is not secret — anyone can extract it from the APK/IPA. PKCE exists
precisely so a *public* client can authenticate without one. See [`SECURITY.md`](SECURITY.md).

## Why not "Spotify Soloist"?

The project intentionally uses the **Spotify Web API** with a standard PKCE flow. No third-party
Spotify SDK/wrapper is used, as required by the brief.
