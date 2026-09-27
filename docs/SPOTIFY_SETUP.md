# Spotify setup

VoiceRiders authenticates with **OAuth 2.0 Authorization Code + PKCE**. That means:

* you need a Spotify **Client ID** (public),
* you must **never** use or commit a **Client Secret**,
* each rider connects their **own** account,
* and — because of a 2025 Spotify policy change — you need a **tiny HTTPS relay** (provided).

---

## 0. Read this first: Spotify now requires an HTTPS redirect URI

Spotify's redirect-URI rules changed and are enforced:

> "Use HTTPS for your redirect URI, unless you are using a loopback address…
> `localhost` is not allowed."
> — <https://developer.spotify.com/documentation/web-api/concepts/redirect_uri>
> Enforcement began **9 April 2025** for new apps; all clients must migrate by **November 2025**.

A phone app cannot listen on a public HTTPS URL, so the redirect cannot come straight to the app:

| Candidate redirect URI | Verdict |
|------------------------|---------|
| `voiceriders://spotify-callback` (custom app scheme) | ❌ rejected by Spotify |
| `exp://192.168.x.x:8081/--/spotify-callback` (Expo Go) | ❌ rejected by Spotify |
| `http://127.0.0.1:PORT` (loopback) | ⚠️ allowed, but only works on the same machine — useless on a phone |
| **`https://<your-relay>/api/spotify-callback`** | ✅ **use this** |

So the flow gains one hop:

```
Spotify ──► https://<your-relay>/api/spotify-callback?code=…&state=…
                 │   register THIS in the Spotify dashboard
                 └──► voiceriders://spotify-callback?code=…&state=…
                          │   the app is reopened here
                          └──► code + PKCE verifier → tokens
```

`relay/` contains the endpoint (Vercel/Netlify-compatible) and its README.

---

## 1. Create the Spotify application

1. Sign in at <https://developer.spotify.com/dashboard> with the account that will own the app.
2. **Create app**. For "Redirect URI" put the relay URL from step 2 below (you can edit it later).
3. Under **Which API/SDKs are you planning to use?** select **Web API**.
4. Open the app → **Settings** and copy the **Client ID**.

## 2. Deploy the relay

```bash
cd relay
npx vercel deploy --prod
```

Set the environment variable `APP_REDIRECT_URI=voiceriders://spotify-callback` in the Vercel
project. Your redirect URI is then:

```
https://<your-project>.vercel.app/api/spotify-callback
```

Local development option:

```bash
node relay/local-server.js          # http://localhost:8787
npx localtunnel --port 8787         # gives you an HTTPS URL
```

Full details, a `curl` verification step, and the no-relay (App Links / Universal Links)
alternative: [`../relay/README.md`](../relay/README.md).

## 3. Register the redirect URI (exactly)

In the Spotify dashboard → your app → **Settings** → **Redirect URIs**, add the relay URL and press
**Add**. It must match **byte-for-byte** (a trailing slash or a different host produces
`INVALID_CLIENT: Invalid redirect URI`). The Connect screen in the app also displays the URL it will
send, so you can copy it from there.

## 4. Configure the app

```bash
cp .env.example .env     # Windows: copy .env.example .env
```

```env
EXPO_PUBLIC_SPOTIFY_CLIENT_ID=the_client_id_you_copied
EXPO_PUBLIC_SPOTIFY_REDIRECT_URI=https://your-project.vercel.app/api/spotify-callback
# Expo Go only (URI changes per machine); leave blank for dev builds:
# EXPO_PUBLIC_SPOTIFY_APP_RETURN_URI=exp://192.168.1.20:8081/--/spotify-callback
EXPO_PUBLIC_SPOTIFY_MARKET=IN
```

Restart Expo after editing `.env` (values are inlined at bundle time). The Connect button stays
disabled until both the client id and the redirect URI are set, and it explains what is missing.

## 5. Add your group members as test users

While the app is in **Development Mode** it only works for allow-listed accounts:

**Dashboard → your app → Settings → User Management → Add user** (email + display name of the
Spotify account). Development Mode allows up to **25 users**. Someone who is not on the list sees an
error during authorization no matter how correct the code is.

## 6. Playlist access (important for Development Mode)

Spotify restricts which playlists an app may read:

> "This endpoint is only accessible for playlists **owned by the current user or playlists the user is
> a collaborator of**. A **403 Forbidden** status code will be returned if the user is neither the owner
> nor a collaborator of the playlist."
> — [Get Playlist Items](https://developer.spotify.com/documentation/web-api/reference/get-playlists-items)

In practice this means **editorial playlists and playlists owned by other people cannot be used** while
the app is in Development Mode. VoiceRiders therefore shows those rows dimmed as *"Not available — you
are not the owner"* and will not let you select them.

**For testing and demos, create your own playlist** (or make an existing one collaborative) with 10–20
tracks. That also gives you a known ordering, which is what "play song number 7" needs.

Also note the playlist count field was renamed: `tracks.total` is deprecated and reports 0, while the
live value is `items.total` (`src/spotify/playlistUtils.ts` handles both).

## 7. Scopes requested

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

## 8. Spotify Premium

Playback **control** (play/pause/skip/volume) requires a **Premium** account. With a free account,
read endpoints work but `/me/player/*` mutations return `403`. The app surfaces this as
*"Spotify Premium is required for playback control."*

---

## Troubleshooting

| Symptom | Cause / fix |
|---------|-------------|
| `INVALID_CLIENT: Invalid redirect URI` | Not registered byte-for-byte, or Spotify rejected a non-HTTPS URI. Copy the value from the Connect screen. |
| `INVALID_CLIENT: Invalid client` | `EXPO_PUBLIC_SPOTIFY_CLIENT_ID` empty/wrong, or Expo not restarted after editing `.env`. |
| Connect button is disabled | Missing client id or redirect URI — the screen's banner says which. |
| Browser says "site can't be reached" after sign-in | The relay is not deployed / URL typo, or `APP_REDIRECT_URI` on the relay is wrong. Verify with the `curl` command in `relay/README.md`. |
| Sign-in succeeds but the app never reopens | The return URI does not match. In a dev build it must be `voiceriders://spotify-callback`; in Expo Go set `EXPO_PUBLIC_SPOTIFY_APP_RETURN_URI` to the printed `exp://…` URI. |
| Authorization says the user is not allowed | Add the Spotify account under **User Management** (Development Mode). |
| `403 Player command failed: Premium required` | Use a Premium account. |
| `404` / `NO_ACTIVE_DEVICE` | Open Spotify, connect a device, press play once, then retry. VoiceRiders also tries to wake a device automatically. |
| `429 Too Many Requests` | Spotify rate limit. Access tokens refresh automatically. |
| Token expires mid-ride | Handled: `authService` refreshes once and retries. If the refresh token is revoked the app asks you to reconnect. |

## Alternatives to the relay

| Approach | Trade-off |
|----------|-----------|
| **Relay endpoint** (`relay/`, recommended) | Works everywhere including Expo Go; needs a free Vercel/Netlify/Cloudflare account |
| **App Links / Universal Links** | No server code — host `assetlinks.json` + `apple-app-site-association` on an HTTPS domain you own, register that HTTPS URL, and set `preferUniversalLinks: true` (iOS 17.4+) in `WebBrowser.openAuthSessionAsync` | 
| **Existing backend** | Best for production: the same endpoint can also proxy the token exchange and centralise rate limiting |
| Loopback (`127.0.0.1`) | Only for a same-machine client; not usable on a phone |

## Why there is no `CLIENT_SECRET`

A secret inside a mobile binary is not secret — anyone can extract it from the APK/IPA. PKCE exists
precisely so a *public* client can authenticate without one. See [`SECURITY.md`](SECURITY.md).

## Why not "Spotify Soloist"?

The project intentionally uses the **Spotify Web API** with a standard PKCE flow. No third-party
Spotify SDK/wrapper is used, as required by the brief.
