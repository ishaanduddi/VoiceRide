#!/usr/bin/env node
/**
 * Local OAuth relay for development.
 *
 * Same behaviour as relay/api/spotify-callback.js, but runs on your machine so
 * you can expose it with a tunnel and use the HTTPS URL as your Spotify redirect
 * URI while developing.
 *
 *   node relay/local-server.js
 *   npx localtunnel --port 8787      # or: cloudflared tunnel --url http://localhost:8787
 *   # register https://<tunnel-host>/spotify-callback with Spotify
 *
 * Or point a tunnel straight at this server and use the tunnel URL as
 * EXPO_PUBLIC_SPOTIFY_REDIRECT_URI.
 */

const http = require('node:http');

const PORT = Number(process.env.PORT || 8787);
const APP_REDIRECT = process.env.APP_REDIRECT_URI || 'voiceriders://spotify-callback';

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || `localhost:${PORT}`}`);

  if (!url.searchParams.get('code') && !url.searchParams.get('error')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h1>VoiceRiders relay</h1><p>Waiting for Spotify to redirect here.</p>');
    return;
  }

  const target = new URL(APP_REDIRECT);
  for (const key of ['code', 'state', 'error', 'error_description']) {
    const value = url.searchParams.get(key);
    if (value) target.searchParams.set(key, value);
  }

  console.log(`forwarding ${url.searchParams.get('error') ? 'error' : 'code'} -> ${APP_REDIRECT}`);
  res.writeHead(302, { Location: target.toString(), 'Cache-Control': 'no-store' });
  res.end();
});

server.listen(PORT, () => {
  console.log(`VoiceRiders OAuth relay listening on http://localhost:${PORT}`);
  console.log(`Forwarding to ${APP_REDIRECT}`);
  console.log('Expose it over HTTPS (localtunnel / cloudflared / ngrok) and register that URL with Spotify.');
});
