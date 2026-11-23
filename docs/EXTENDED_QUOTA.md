# Getting more than 5 testers

Spotify's **Development Mode** caps the app at **5 authorised users**. Premium is
required on top of that, and the app owner keeps access even when removed from the
list — so your own account is not a useful test of the cap.

Two things run in parallel.

---

## Track A — rotate 5 testers at a time (works today)

1. Keep a simple sheet: `name | Spotify email | Premium? | phone | OS | headset | batch | added | feedback done`.
2. Add **5** accounts in *Dashboard → User Management*.
3. Give them **3–4 days** and ask for the feedback form + 3 commands.
4. Remove that batch, add the next 5. Keep the emails in a queue.

Use a **separate short waitlist form** (not the feedback form) so you are not
chasing people who never install:

| Question | Type |
|---|---|
| Name | short answer |
| Email you can be reached at | short answer |
| Spotify account email | short answer, required |
| Spotify plan | Premium / Free / Not sure |
| Phone model + Android version | short answer |
| Headset (Bluetooth / wired / speaker) | multiple choice |
| Can you test within the next 3 days? | Yes / No |
| Anything else | paragraph |

Free-plan accounts cannot test playback — filter them out of the queue instead of
spending a slot.

---

## Track B — apply for Extended Quota Mode (the real unlock)

Extended Quota removes the 5-user cap (Premium is still required). Apply from the
Spotify Developer Dashboard on the app page: **Request Extension / Extended
Quota**.

### Checklist

- [ ] App is complete and works without hand-holding (it is).
- [ ] **Privacy policy URL** — publish `docs/PRIVACY.md`. Easiest: GitHub Pages
      for the repo, or the raw GitHub URL. A rendered page is better than a blob.
- [ ] **Website / GitHub repo** URL.
- [ ] **Redirect URI** matches the app exactly:
      `https://voiceriders-oauth-relay.vercel.app/api/spotify-callback`
- [ ] **2–3 screenshots** (Ride Mode, Settings, the volume card).
- [ ] **Short demo video** (30–60 s) showing the voice commands working.
- [ ] A clear, non-commercial description.

### Draft answers

**App name:** VoiceRiders

**Description:** VoiceRiders is a hands-free Spotify controller for motorcycle
riders. The rider says "play believer", "next song", "pause" or "set volume to
70", and the app performs the action through the Spotify Web API. Speech
recognition runs on the device (Whisper), so commands work offline and no audio
is uploaded. It is a student project, free, with no ads or in-app purchases.

**How the app uses Spotify data:** OAuth 2.0 with PKCE; scopes are playlist read,
playback read/modify and profile/email. Tokens are stored only in the phone's
encrypted storage; there is no backend and no data sharing. The app only changes
playback state; it never modifies the user's library.

**Commercial use:** No. Course project / personal project, free to use.

**Who are the testers:** Students and riders in India, testing on Android phones
with Bluetooth or wired headsets.

**Additional notes:** The app requests no Spotify client secret; the public client
ID ships in the app. It uses the relay only to bounce the HTTPS redirect back into
the app scheme `voiceriders://`.

### What to expect

- Review usually takes **1–6 weeks**; it can be rejected with a short reason.
- Fix the reason and re-apply. The most common asks are a real privacy-policy
  page, a working redirect URI, and a demo that clearly shows the app functioning.
- Once approved, any Premium account can connect — no email list, no batches.

---

## While waiting

Keep rotating 5 at a time, and keep the feedback form in the invites. Even 15–20
tested users across batches is enough material for a course report: ratings,
device spread, top complaints, and a few quotes.
