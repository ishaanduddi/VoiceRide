/**
 * Persistence for an in-flight OAuth authorization.
 *
 * WHY: the PKCE `code_verifier` must survive the user leaving the app to sign in
 * with Spotify. Android (and iOS under memory pressure) can kill a backgrounded
 * app, in which case the deep-link callback COLD-STARTS the process — and an
 * in-memory verifier would be gone, making the code un-exchangeable.
 *
 * The `state` value keys the entry, and the entry is single-use so a code can
 * never be exchanged twice (the in-app browser session and the deep-link route
 * can both fire on Android).
 */

import { deleteSecure, loadJsonSecure, saveJsonSecure } from '@/storage/secureStore';

const KEY = 'voiceriders.spotify.pending-auth';

/** Abandon an authorization that was never completed. */
const MAX_AGE_MS = 10 * 60 * 1000;

export interface PendingAuth {
  state: string;
  verifier: string;
  redirectUri: string;
  createdAt: number;
}

/**
 * In-memory claim of the authorization currently being redeemed.
 *
 * Serialization matters: on Android the callback can arrive through BOTH the
 * in-app browser session and the `/spotify-callback` deep link at the same
 * moment. A read-then-clear is not atomic across `await`s, so without this claim
 * both callers would read the same pending entry and both would redeem the same
 * authorization code — the loser gets HTTP 400 `invalid_grant` from Spotify.
 */
let claimedState: string | null = null;

export async function savePendingAuth(pending: PendingAuth): Promise<void> {
  // A new attempt releases the previous claim.
  claimedState = null;
  await saveJsonSecure(KEY, pending);
}

export async function clearPendingAuth(): Promise<void> {
  await deleteSecure(KEY);
}

/** Returns the stored authorization if it is still fresh. */
export async function loadPendingAuth(): Promise<PendingAuth | null> {
  const pending = await loadJsonSecure<PendingAuth>(KEY);
  if (!pending) return null;

  if (Date.now() - pending.createdAt > MAX_AGE_MS) {
    await clearPendingAuth();
    return null;
  }
  return pending;
}

/**
 * Returns the pending authorization for `state` and clears it.
 *
 * The state must match; a mismatch returns null, so a forged or stale callback
 * cannot consume a real authorization.
 *
 * The claim is taken SYNCHRONOUSLY, before any `await`, which makes this
 * single-use even when two completion paths fire concurrently. Without it, both
 * would read the same entry and redeem the same code — the second redemption
 * fails with HTTP 400 `invalid_grant`.
 */
export async function consumePendingAuth(state: string): Promise<PendingAuth | null> {
  if (claimedState === state) return null;
  claimedState = state;

  const pending = await loadPendingAuth();
  if (!pending || pending.state !== state) return null;

  await clearPendingAuth();
  return pending;
}
