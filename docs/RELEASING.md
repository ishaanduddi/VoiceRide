# Releasing & updating VoiceRiders (without a store)

Two independent channels, because they cover different kinds of change.

| Change | Channel | User action |
|--------|---------|-------------|
| JavaScript / assets (screens, NLP, copy, Spotify logic) | **EAS Update (OTA)** | none — applied on next launch, or "Restart to apply" |
| Native (new module, permission, icon, dependency) | **New APK on GitHub Releases** | download and install over the old app |

Settings → **App updates** shows the installed version, the latest GitHub
release, and offers both actions.

---

## One-time setup (already in this repo)

- `expo-updates` is installed.
- `app.json`:

  ```json
  "runtimeVersion": { "policy": "appVersion" },
  "updates": {
    "url": "https://u.expo.dev/8af1f7d9-43b9-42d9-be18-02e313a4869d",
    "checkAutomatically": "ON_LOAD",
    "fallbackToCacheTimeout": 0
  }
  ```

- `eas.json` → `build.preview.channel = "preview"` (and `production` for store
  builds).

**Important:** an APK built before `expo-updates` was added cannot receive OTA
updates. Install one build from this commit onwards and OTA is live.

---

## 1. Publish a JavaScript update (no reinstall)

```powershell
npx eas-cli@latest update --channel preview --environment preview --message "fix: volume step"
```

Every installed preview APK with the same runtime version downloads it on the
next launch. To force it immediately: Settings → App updates → **Check for
updates** → **Restart to apply**.

Rules:

- `runtimeVersion` follows `app.json` → `version`. **Keep `version` unchanged**
  for JS-only updates.
- **Bump `version` when native code changes** (new module, permission, etc.).
  Otherwise an OTA bundle that expects the new native code can be delivered to
  an old APK and crash.

---

## 2. Ship a native change as a new APK

```powershell
# 1. bump the version in app.json (e.g. 1.0.0 -> 1.0.1)
npx eas-cli@latest build --profile preview --platform android --non-interactive
```

Download the `.apk` from the build page, then publish it as a GitHub release:

```powershell
gh release create v1.0.1 .\voiceriders-1.0.1.apk `
  --repo ishaanduddi/VoiceRide `
  --title "VoiceRiders 1.0.1" `
  --notes "What changed in this build."
```

The in-app update card compares the release tag with `app.json`'s `version` and
shows a **Download v1.0.1 APK** button. Android will ask to allow installing
from the browser once; subsequent APKs install over the old app and keep data.

Keep the **EAS keystore** safe (`eas credentials`). Losing it means every user
must uninstall and reinstall.

---

## 3. When EAS cloud builds are unavailable (free-plan quota)

Local builds do not use the EAS build quota. Prerequisites: **JDK 17**, the
**Android SDK** (platform 36, build-tools 36.0.0, CMake 3.22.1, NDK 27.x) and the
**same keystore** as the published APK (otherwise Android refuses to install over
the old app).

```powershell
# one-time: export the EAS-managed keystore (or use eas credentials interactively)
# eas credentials -> android -> Keystore -> download

$env:JAVA_HOME   = "C:\path\to\jdk-17"
$env:ANDROID_HOME = "C:\Android"
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME

npx expo prebuild -p android --clean --no-install

cd android
.\gradlew.bat assembleRelease `
  "-Pandroid.injected.signing.store.file=C:\path\to\release.jks" `
  "-Pandroid.injected.signing.store.password=..." `
  "-Pandroid.injected.signing.key.alias=..." `
  "-Pandroid.injected.signing.key.password=..."
```

The APK is at `android/app/build/outputs/apk/release/app-release.apk`.
Publish it with `gh release create vX.Y.Z ...` as usual. Keep the keystore and
passwords out of git.

## 4. First-time installation for users

1. Open the GitHub release page and download the `.apk`.
2. Android warns about installing from an unknown source → allow it for that
   browser/file manager.
3. Install, open, connect Spotify.

Spotify Development Mode allows only **25 users** unless Extended Quota Mode is
approved, so add each tester's Spotify email under
*Dashboard → User Management*.

---

## Version checklist

- JS-only fix → `eas update --channel preview` (no APK, no version bump).
- Native fix → bump `version` → `eas build` → `gh release create` with the APK.
- Never publish an OTA update that needs a native module the installed APK does
  not have.
