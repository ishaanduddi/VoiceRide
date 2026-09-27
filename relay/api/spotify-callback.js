/**
 * VoiceRiders OAuth relay — Vercel / Netlify compatible serverless function.
 *
 * WHY THIS EXISTS
 * ---------------
 * Spotify now enforces HTTPS redirect URIs (custom app schemes such as
 * `voiceriders://spotify-callback` are rejected, and `localhost` is not
 * allowed). A mobile app therefore cannot receive the OAuth callback directly.
 *
 * This endpoint is the HTTPS address you register with Spotify. It receives
 * `?code=...&state=...` and immediately bounces the user back into the app via
 * the app's custom scheme, where the code is exchanged using the PKCE verifier
 * that never left the device.
 *
 * SECURITY
 * --------
 * This is a stateless forwarder. It holds no secrets and performs no token
 * exchange. An attacker who hits it only produces a redirect to the custom
 * scheme with arbitrary query parameters — which is harmless, because:
 *   - the PKCE `code_verifier` is only known to the device, so a stolen or
 *     injected `code` cannot be exchanged, and
 *   - the app verifies `state` before using the code.
 */

const DEFAULT_APP_REDIRECT = 'voiceriders://spotify-callback';

function buildTarget(appRedirect, url) {
  const target = new URL(appRedirect);
  for (const key of ['code', 'state', 'error', 'error_description']) {
    const value = url.searchParams.get(key);
    if (value) target.searchParams.set(key, value);
  }
  return target.toString();
}

function htmlPage(title, message) {
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>body{font-family:system-ui,-apple-system,sans-serif;background:#0B1220;color:#F5F7FA;
display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center}
main{padding:24px}h1{font-size:20px}p{color:#93A1B8;line-height:1.5}</style></head>
<body><main><h1>${title}</h1><p>${message}</p></main></body></html>`;
}

module.exports = function handler(req, res) {
  const host = req.headers.host || 'localhost';
  const url = new URL(req.url || '/', `https://${host}`);
  const appRedirect = process.env.APP_REDIRECT_URI || DEFAULT_APP_REDIRECT;

  // Nothing to forward (e.g. someone opened the URL in a browser).
  if (!url.searchParams.get('code') && !url.searchParams.get('error')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(htmlPage('VoiceRiders', 'This is the Spotify sign-in relay. Open the VoiceRiders app to connect your account.'));
    return;
  }

  const location = buildTarget(appRedirect, url);

  // 302 into the app's custom scheme. The OS hands control back to the app.
  res.writeHead(302, { Location: location, 'Cache-Control': 'no-store' });
  res.end();
};

module.exports.buildTarget = buildTarget;
