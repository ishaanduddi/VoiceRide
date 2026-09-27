# VoiceRiders OAuth relay

A ~40-line HTTPS endpoint that lets a **mobile app** complete a Spotify OAuth flow.

## Why it is needed

Spotify now **requires an HTTPS redirect URI**:

> "Use HTTPS for your redirect URI, unless you are using a loopback address…
> `localhost` is not allowed."
> — <https://developer.spotify.com/documentation/web-api/concepts/redirect_uri>
> (enforced for new apps since 9 April 2025, all clients by November 2025)

That rules out the two things a phone app would normally use:

| Option | Status |
|--------|--------|
| `voiceriders://spotify-callback` (custom scheme) | ❌ rejected by Spotify |
| `exp://…` (Expo Go) | ❌ rejected by Spotify |
| `http://127.0.0.1:PORT` (loopback) | ❌ only works on the same machine, not on a phone |

So Spotify redirects to **this HTTPS endpoint**, and this endpoint immediately bounces
the user back into the app on its custom scheme:

```
Spotify  ──302──►  https://<your-relay>/api/spotify-callback?code=…&state=…
                                   │
                                   └──302──►  voiceriders://spotify-callback?code=…&state=…
                                                        │
                                          the app exchanges the code with its
                                          PKCE verifier (never left the device)
```

The relay stores nothing, has no secrets, and does not exchange tokens.

## Deploy it (free tier is fine)

> **Run these commands from the `relay/` directory, not the repository root.**
> `relay/` is a self-contained project (its own `package.json`, no dependencies);
> Vercel must treat *it* as the project root so that `api/spotify-callback.js`
> becomes the serverless function.

```bash
cd relay                      # <- from the repository root
npx vercel login              # free account, no card required
npx vercel deploy --prod
```

No environment variables are required: the handler already defaults
`APP_REDIRECT_URI` to `voiceriders://spotify-callback`, which matches the app's
`scheme` in `app.json`. Set it on Vercel only if you change that scheme.

* `api/spotify-callback.js` is the function (the `api/` folder is already laid out that way).
* Your redirect URI becomes:
  `https://<your-project>.vercel.app/api/spotify-callback`

### Netlify / Cloudflare Workers

Any HTTPS request handler works; the logic is the same 302. Netlify expects
`netlify/functions/spotify-callback.js` with `exports.handler = (event) => ({ statusCode: 302, headers: { Location } })`.

## Local development

```bash
cd relay
npm run local                # http://localhost:8787
npx localtunnel --port 8787  # or: cloudflared tunnel --url http://localhost:8787
```

Use the printed `https://…` URL as your Spotify redirect URI and in `.env`.

## Verify

```bash
curl -sI "https://<your-relay>/api/spotify-callback?code=test&state=abc" | grep -i location
# location: voiceriders://spotify-callback?code=test&state=abc
```

## Security notes

* No secrets are stored here — PKCE means there is no client secret to protect.
* A forged request can only produce a redirect with arbitrary query parameters.
  It cannot yield a usable session: the `code_verifier` stays on the device and the
  app verifies `state` before exchanging the code.
* Keep the endpoint limited to these query keys (as implemented) so it can never be
  abused as a general open redirect.

## Alternative without a relay

If you can host static files on an HTTPS domain, use **App Links** (Android) and
**Universal Links** (iOS) instead, and set `preferUniversalLinks: true` on iOS 17.4+
in `WebBrowser.openAuthSessionAsync`. That needs `assetlinks.json` /
`apple-app-site-association` plus a domain you control — more setup, no server code.
See `docs/SPOTIFY_SETUP.md`.
