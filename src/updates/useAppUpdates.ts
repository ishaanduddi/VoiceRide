/**
 * App updates without a store.
 *
 * Two channels, because they solve different problems:
 *
 *  1. **EAS Update (OTA)** — JavaScript/asset changes are downloaded by the app
 *     itself and applied on the next launch (or immediately with "Restart to
 *     apply"). No reinstall, no APK.
 *  2. **GitHub Releases** — native changes (a new module, a permission, a font)
 *     cannot be delivered over the air, so the app checks the latest release and
 *     offers its APK for download.
 *
 * The installed version comes from `app.json`, so a release tag like `v1.0.1`
 * is directly comparable.
 */

import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { useCallback, useEffect, useState } from 'react';
import { Linking } from 'react-native';

/** Where the APK releases live. */
const GITHUB_REPO = 'ishaanduddi/VoiceRide';
const LATEST_RELEASE_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;

/** GitHub allows 60 anonymous requests per hour; cache for 5 minutes. */
const RELEASE_CACHE_MS = 5 * 60 * 1000;
let cachedRelease: { release?: ReleaseInfo; at: number } | undefined;

export interface ReleaseInfo {
  tag: string;
  pageUrl: string;
  apkUrl?: string;
  publishedAt?: string;
}

export interface AppUpdates {
  installedVersion: string;
  installedBuild?: string;
  otaEnabled: boolean;
  otaAvailable: boolean;
  otaPending: boolean;
  otaChecking: boolean;
  otaError?: string;
  release?: ReleaseInfo;
  releaseIsNewer: boolean;
  releaseChecking: boolean;
  releaseError?: string;
  checkForUpdates: () => Promise<void>;
  applyOtaUpdate: () => Promise<void>;
  downloadApk: () => Promise<void>;
}

/** "v1.2.3" -> [1, 2, 3], so tags and app versions compare numerically. */
function versionParts(value: string): number[] {
  return value
    .replace(/^v/i, '')
    .split(/[.+-]/)
    .map((part) => Number.parseInt(part, 10))
    .filter((part) => Number.isFinite(part));
}

/** True when `candidate` is a later version than `current`. */
export function isNewerVersion(candidate: string, current: string): boolean {
  const left = versionParts(candidate);
  const right = versionParts(current);
  const length = Math.max(left.length, right.length);

  for (let index = 0; index < length; index += 1) {
    const a = left[index] ?? 0;
    const b = right[index] ?? 0;
    if (a !== b) return a > b;
  }

  return false;
}

interface GithubRelease {
  tag_name?: string;
  html_url?: string;
  published_at?: string;
  assets?: { name?: string; browser_download_url?: string }[];
}

export function useAppUpdates(): AppUpdates {
  const updates = Updates.useUpdates();

  const [release, setRelease] = useState<ReleaseInfo | undefined>(undefined);
  const [releaseChecking, setReleaseChecking] = useState(false);
  const [releaseError, setReleaseError] = useState<string | undefined>(undefined);
  const [otaChecking, setOtaChecking] = useState(false);
  const [otaError, setOtaError] = useState<string | undefined>(undefined);

  const installedVersion = Constants.expoConfig?.version ?? '0.0.0';
  const installedBuild = Constants.nativeBuildVersion ?? undefined;

  const fetchLatestRelease = useCallback(async (force = false) => {
    if (!force && cachedRelease && Date.now() - cachedRelease.at < RELEASE_CACHE_MS) {
      setRelease(cachedRelease.release);
      setReleaseChecking(false);
      return;
    }

    setReleaseChecking(true);
    setReleaseError(undefined);

    try {
      const response = await fetch(LATEST_RELEASE_URL, {
        headers: { Accept: 'application/vnd.github+json' },
      });
      if (!response.ok) throw new Error(`GitHub answered ${response.status}`);

      const json = (await response.json()) as GithubRelease;
      if (!json.tag_name || !json.html_url) throw new Error('No release published yet');

      const next: ReleaseInfo = {
        tag: json.tag_name,
        pageUrl: json.html_url,
        apkUrl: json.assets?.find((asset) => asset.name?.toLowerCase().endsWith('.apk'))
          ?.browser_download_url,
        publishedAt: json.published_at,
      };

      cachedRelease = { release: next, at: Date.now() };
      setRelease(next);
    } catch (error) {
      setReleaseError(
        error instanceof Error ? error.message : 'Could not reach the release page',
      );
    } finally {
      setReleaseChecking(false);
    }
  }, []);

  useEffect(() => {
    // Deferred so the first render paints before the network state changes.
    const timer = setTimeout(() => void fetchLatestRelease(), 0);
    return () => clearTimeout(timer);
  }, [fetchLatestRelease]);

  /** Downloads a pending OTA bundle (it is applied on the next launch). */
  const checkForUpdates = useCallback(async () => {
    setOtaError(undefined);

    if (Updates.isEnabled) {
      setOtaChecking(true);
      try {
        const result = await Updates.checkForUpdateAsync();
        if (result.isAvailable) await Updates.fetchUpdateAsync();
      } catch (error) {
        setOtaError(error instanceof Error ? error.message : 'Update check failed');
      } finally {
        setOtaChecking(false);
      }
    }

    await fetchLatestRelease(true);
  }, [fetchLatestRelease]);

  const applyOtaUpdate = useCallback(async () => {
    if (Updates.isEnabled) await Updates.reloadAsync();
  }, []);

  const downloadApk = useCallback(async () => {
    if (!release) return;
    // Prefer the APK asset, so the browser downloads directly instead of
    // opening the release page.
    await Linking.openURL(release.apkUrl ?? release.pageUrl);
  }, [release]);

  return {
    installedVersion,
    installedBuild,
    otaEnabled: Updates.isEnabled,
    otaAvailable: updates.isUpdateAvailable,
    otaPending: updates.isUpdatePending,
    otaChecking: otaChecking || updates.isChecking || updates.isDownloading,
    otaError: otaError ?? updates.checkError?.message,
    release,
    releaseIsNewer: release ? isNewerVersion(release.tag, installedVersion) : false,
    releaseChecking,
    releaseError,
    checkForUpdates,
    applyOtaUpdate,
    downloadApk,
  };
}