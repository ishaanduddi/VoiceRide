# Troubleshooting

## Getting logs from the app

### A released APK (no console) — `adb logcat`

This needs **no Android Studio**. `adb` ships in a small standalone zip.

1. **Phone:** Settings → About phone → tap **Build number** 7 times → back → **System → Developer options** → enable **USB debugging**.
2. **PC:** download *SDK Platform Tools* from <https://developer.android.com/tools/releases/platform-tools>, unzip to `C:\platform-tools`.
3. Connect the phone by USB and accept **Allow USB debugging** on the device.

```powershell
cd C:\platform-tools
.\adb.exe devices                       # should list your device as "device"
.\adb.exe logcat -c                     # clear the buffer

# --- now reproduce the problem on the phone ---

.\adb.exe logcat -d -b crash | Select-Object -Last 80        # native/JS crash buffer
.\adb.exe logcat -d | Select-String -Pattern "VoiceRiders|FATAL|AndroidRuntime|ReactNativeJS|RNWhisper" |
    Select-Object -Last 100                                  # app + runtime lines
```

Send the output rather than a description — it names the failing component and line.

### Reading a JavaScript crash

A React Native JS crash appears twice: as an `AndroidRuntime` fatal exception, and in the
`am_crash` event. The useful parts are the message, the `at <Component>` frames and the final
`stack:` lines, which name the function that actually threw:

```
E/AndroidRuntime: FATAL EXCEPTION: mqt_v_native
E/AndroidRuntime: com.facebook.react.common.JavascriptException: TypeError: Cannot read property 'state' of undefined
E/AndroidRuntime:     at HomeScreen (address at index.android.bundle:1:1043188)   <- which screen
E/AndroidRuntime: getState@1:987748                                              <- which function
E/AndroidRuntime: useSyncExternalStore@1:532012
E/AndroidRuntime: useAppContext@1:986849
```

(`index.android.bundle:1:NNNN` offsets are not source lines; the **names** are what identify the code.)

### A development build — Metro streams the logs

Development builds print JS logs, including full stack traces, to the terminal that
runs Metro, and show errors as a red box on the device.

```bash
npx eas-cli@latest build --profile development --platform android
npx expo start --dev-client
```

### No PC at all

Android's **Developer options → Take bug report** produces a zip whose
`bugreport-*.txt` contains logcat. Search it for `VoiceRiders` or `FATAL`.

In-app: the root layout wraps every screen in an `ErrorBoundary`, so a React
render error is displayed as readable text on the device — screenshot it.

---

## Known failures

| Symptom | Cause | Fix |
|---|---|---|
| App closes / blank screen with `Cannot read property 'X' of undefined` | A **class method passed unbound** to a hook (`useSyncExternalStore` calls `getSnapshot`/`subscribe` as bare functions) | Declare `getState`/`setState`/`subscribe` as **arrow-function class properties**, never prototype methods |
| 403 when selecting a playlist; every playlist shows "0 tracks" | Spotify only exposes a playlist's items to its **owner or collaborators**, so playlists owned by others always 403. Separately, the count field was renamed `tracks.total` → `items.total` | Use a playlist **you created or collaborate on** (the app now marks the rest as unavailable and shows real counts) |
| Commands not understood while music plays through the phone **speaker** | The microphone hears the playback, so the rider's voice is competing with the music and there is no hardware echo cancellation available to the app | Use **headphones or a Bluetooth/helmet intercom** (which is also the realistic riding setup). The app now also ignores steady loud audio and stays silent for noise instead of prompting |
| Volume commands recognised but nothing happens | With the default 0.72 threshold, the `INCREASE_VOLUME` / `DECREASE_VOLUME` ambiguity penalty pushed correct commands below the execute threshold, so the dispatcher never ran | Fixed: default threshold is now **0.60**, the ambiguity penalty is milder (0.85) and only applies when the runner-up is a real contender. Confirm with Settings → Command recognition |
| `FATAL EXCEPTION` right after navigating to a screen | A render-time exception; the `at <Component>` frame names the screen | Read the JS stack (see below) and fix that component |
| "No Spotify client id found" / Connect disabled | `EXPO_PUBLIC_SPOTIFY_CLIENT_ID` missing from the **build** | `.env` is not uploaded to EAS; set it in `eas.json` → `build.<profile>.env` or `eas env:create`. Note `.env` must be read **statically** — see `src/config.ts` |
| "Not configured" under *Redirect URI* | `EXPO_PUBLIC_SPOTIFY_REDIRECT_URI` missing from the build | Same as above |
| Browser: `INVALID_CLIENT: Invalid redirect URI` | Redirect URI not registered, or not byte-identical | Copy the value the Connect screen prints into Spotify → Settings → Redirect URIs (no trailing slash) |
| Browser: user not allowed | Spotify app in Development Mode | Dashboard → User management → add the account (max 25) |
| App closes / no route after sign-in | Deep link returned to the app | Ensure `scheme: "voiceriders"` in `app.json` and that `/spotify-callback` exists |
| `Provider request failed with HTTP 400` | Spotify rejected the **token exchange** | The app now prints Spotify's own reason (`invalid_grant`, …). `invalid_grant` = code reused/expired or verifier mismatch |
| `403 Player command failed: Premium required` | Free Spotify account | Playback control needs Premium |
| `404` / no active device | Nothing playing in Spotify | Open Spotify, press play once; VoiceRiders also tries to wake a device |
| "On-device speech recognition needs a development build" | `whisper.rn` is native | Expo Go cannot load it; use a dev/preview APK |
| Speech model download fails | Network or URL | Settings shows the error; the default `ggml-tiny.en.bin` URL is correct and needs ~75 MB |

---

## Verifying the OAuth relay

The relay must answer with a `location:` pointing at the app scheme:

```cmd
curl.exe -si "https://voiceriders-oauth-relay.vercel.app/api/spotify-callback?code=test&state=abc" | findstr /I location
:: location: voiceriders://spotify-callback?code=test&state=abc
```

You can also confirm the **client id + redirect URI pair** are valid without the app — Spotify
returns its login page (not an error) for a well-formed authorize request:

```
https://accounts.spotify.com/authorize?response_type=code
  &client_id=<CLIENT_ID>
  &redirect_uri=<URL-ENCODED-RELAY-URL>
  &scope=user-read-private
  &state=test
  &code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM
  &code_challenge_method=S256
```

If that shows a login page, the credentials and redirect URI are fine and the problem
is inside the app's token exchange.

---

## Checks before reporting a problem

```powershell
npm run typecheck        # TypeScript
npx expo lint            # ESLint
npx expo export --platform android --output-dir .expo-export-check   # bundling
```

To confirm build-time environment variables actually made it into the bundle:

```powershell
node -e "const fs=require('fs');const d='.expo-export-check/_expo/static/js/android';const f=fs.readdirSync(d)[0];const s=fs.readFileSync(d+'/'+f,'latin1');console.log(s.includes('<expected value>')?'FOUND':'MISSING')"
```
