/**
 * RFC 7636 (PKCE) helpers.
 *
 * VoiceRiders is a public OAuth client: it only ever ships a Spotify **client
 * id** (not a secret) and protects the Authorization Code exchange with PKCE.
 *
 * Reference: https://datatracker.ietf.org/doc/html/rfc7636
 */

import * as Crypto from 'expo-crypto';

const BASE64URL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/**
 * URL-safe base64 without padding.
 *
 * Hermes does not guarantee `btoa`, so this is implemented directly rather
 * than relying on a global.
 */
export function bytesToBase64Url(bytes: Uint8Array): string {
  let output = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i] ?? 0;
    const b1 = bytes[i + 1] ?? 0;
    const b2 = bytes[i + 2] ?? 0;
    const triplet = (b0 << 16) | (b1 << 8) | b2;
    const remaining = bytes.length - i;

    output += BASE64URL_ALPHABET[(triplet >>> 18) & 63];
    output += BASE64URL_ALPHABET[(triplet >>> 12) & 63];
    if (remaining > 1) output += BASE64URL_ALPHABET[(triplet >>> 6) & 63];
    if (remaining > 2) output += BASE64URL_ALPHABET[triplet & 63];
  }
  return output;
}

/** Converts a standard base64 string (as returned by expo-crypto) to base64url. */
function base64ToBase64Url(base64: string): string {
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

/** Generates a high-entropy code verifier (43-128 chars, URL-safe). */
export function createCodeVerifier(byteLength = 32): string {
  return bytesToBase64Url(Crypto.getRandomBytes(byteLength));
}

/** `BASE64URL(SHA256(ASCII(verifier)))` — the S256 code challenge. */
export async function createCodeChallenge(verifier: string): Promise<string> {
  const digest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    verifier,
    { encoding: Crypto.CryptoEncoding.BASE64 },
  );
  return base64ToBase64Url(digest);
}

/** Opaque `state` value used for CSRF protection. */
export function createState(byteLength = 16): string {
  return bytesToBase64Url(Crypto.getRandomBytes(byteLength));
}
