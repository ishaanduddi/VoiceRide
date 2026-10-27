/**
 * High-level playback commands.
 *
 * The dispatcher talks to this class, never to the raw API, so that behaviours
 * like "wake an idle device before acting" and "tell Adaptive Audio about a
 * manual volume change" live in exactly one place.
 */

import {
  getDeviceVolumePercent,
  isDeviceVolumeAvailable,
  setDeviceVolumePercent,
  stepDeviceVolumePercent,
} from '@/audio/deviceVolume';
import { sleep } from '@/utils/async';
import { AppError, NoActiveDeviceError, SpotifyApiError } from '@/utils/errors';
import { createLogger } from '@/utils/logger';

import * as playbackApi from '../api/playback';
import type { PlayRequest } from '../api/playback';
import { searchTracks } from '../api/search';
import type { SpotifyDevice, SpotifyTrack } from '../types';

import {
  describeTrack,
  resolveTrackNumber,
  type PlaylistTrackMap,
  type TrackEntry,
} from './playlistTrackMap';
import { describeTrack as describeSpotifyTrack, pickBestTrack } from './trackSelection';

const log = createLogger('spotify:playback');

const DEFAULT_VOLUME_PERCENT = 50;
const MIN_VOLUME_PERCENT = 0;
const MAX_VOLUME_PERCENT = 100;
/** Wait before reading the volume back, since Spotify reports it asynchronously. */
const VOLUME_VERIFY_DELAY_MS = 250;
/** Extra pause before retrying a volume change some devices drop. */
const VOLUME_RETRY_DELAY_MS = 600;
/** How long Spotify needs before a started track shows up as playing. */
const PLAY_VERIFY_DELAY_MS = 500;
/** How many times the playback state is re-read before giving up. */
const PLAY_VERIFY_ATTEMPTS = 4;
/** Pause after moving playback to another device before starting a track on it. */
const TRANSFER_SETTLE_MS = 450;

/** Case/punctuation-insensitive title, for "is this the track I asked for". */
function normaliseTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export type VolumeSource = 'voice' | 'programmatic' | 'adaptive';

export interface PlaybackControllerDeps {
  /** Playlist currently loaded in the app (the command target). */
  getTarget: () => PlaylistTrackMap | null;
  /**
   * Fired after a successful volume change. Adaptive Audio Mode uses this to
   * treat a manual/voice change as the new baseline instead of fighting it.
   */
  onVolumeChanged?: (volumePercent: number, source: VolumeSource) => void;
  /**
   * Last volume we know about. Used when Spotify omits `volume_percent`, so a
   * relative command is not computed from a made-up default.
   */
  getKnownVolumePercent?: () => number | undefined;
}

export interface VolumeChange {
  previousPercent: number;
  volumePercent: number;
  appliedDelta: number;
}

/** A track that was started by name, rather than from the numbered playlist. */
export interface PlayedTrack {
  name: string;
  artists: string;
  uri: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export class SpotifyPlaybackController {
  constructor(private readonly deps: PlaybackControllerDeps) {}

  /** Devices we are allowed to control (Spotify marks some as restricted). */
  private async usableDevices(): Promise<SpotifyDevice[]> {
    try {
      const devices = await playbackApi.getAvailableDevices();
      return devices.filter((device) => device.id && !device.is_restricted);
    } catch (error) {
      log.debug('could not list Spotify devices', error);
      return [];
    }
  }

  /** Prefers the phone itself — the device a rider actually listens on. */
  private pickPhone(devices: SpotifyDevice[]): SpotifyDevice | undefined {
    const phone = devices.find((device) => /phone|smartphone|tablet/i.test(device.type));
    return phone ?? devices[0];
  }

  /** Picks any non-restricted device and transfers playback to it. */
  private async activateSomeDevice(): Promise<boolean> {
    const devices = await this.usableDevices();
    const candidate = devices.find((device) => device.is_active) ?? this.pickPhone(devices);
    if (!candidate?.id) return false;

    log.info(`transferring playback to "${candidate.name}"`);
    // play:false — waking a device for a command must not start unrelated audio.
    await playbackApi.transferPlayback(candidate.id, false);
    return true;
  }

  /**
   * A device we are allowed to control. Prefers the active one, then the phone
   * itself, and excludes devices Spotify marks as restricted.
   */
  private async usableDeviceId(): Promise<string | undefined> {
    const devices = await this.usableDevices();
    const active = devices.find((device) => device.is_active);
    if (active?.id) return active.id ?? undefined;

    return this.pickPhone(devices)?.id ?? undefined;
  }

  /**
   * Moves playback to a non-restricted device. Returns the device id, or
   * undefined if there is nothing usable.
   */
  private async activateUsableDevice(): Promise<string | undefined> {
    try {
      const devices = await this.usableDevices();
      const chosen = this.pickPhone(devices);
      if (!chosen?.id) return undefined;

      // play: false — a volume command must not start playback.
      await playbackApi.transferPlayback(chosen.id, false);
      log.info(`moved playback to "${chosen.name}"`);
      return chosen.id;
    } catch (error) {
      log.debug('could not move playback to a usable device', error);
      return undefined;
    }
  }

  /**
   * Runs a playback operation, and if Spotify reports "no active device"
   * wakes a device once and retries.
   */
  private async withDevice<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (!(error instanceof NoActiveDeviceError)) throw error;
      const activated = await this.activateSomeDevice();
      if (!activated) throw error;
      return operation();
    }
  }

  async getState() {
    return playbackApi.getPlaybackState();
  }

  async play(): Promise<void> {
    await this.withDevice(() => playbackApi.play());
  }

  async pause(): Promise<void> {
    await this.withDevice(() => playbackApi.pause());
  }

  async stop(): Promise<void> {
    await this.pause();
  }

  async next(): Promise<void> {
    await this.skipTrack('next');
  }

  async previous(): Promise<void> {
    await this.skipTrack('previous');
  }

  /**
   * Skips a track and confirms the player actually moved.
   *
   * The same failure mode as starting a song by name applies: a restricted or
   * asleep device accepts the request (HTTP 204) and nothing happens, so the
   * rider says "next song" and the track never changes. If the track is still
   * the same afterwards, playback is moved to a device Spotify will drive and
   * the skip is retried once.
   */
  private async skipTrack(direction: 'next' | 'previous'): Promise<void> {
    const send = (deviceId?: string) =>
      direction === 'next' ? playbackApi.next(deviceId) : playbackApi.previous(deviceId);

    const before = await this.getState().catch(() => null);
    const beforeUri = before?.item?.uri ?? null;

    // Naming a device is what makes the skip land on the phone even when
    // Spotify has no active device at that moment.
    const deviceId = await this.usableDeviceId();

    try {
      // withDevice wakes a device if Spotify reports none is active.
      await this.withDevice(() => send(deviceId));
    } catch (error) {
      log.warn(`${direction} request failed; will retry on the phone`, error);
    }

    if (await this.trackChanged(beforeUri)) return;

    const target = this.pickPhone(await this.usableDevices());
    if (!target?.id) {
      throw new AppError(
        'SPOTIFY_PLAYBACK_UNAVAILABLE',
        'Spotify did not change the song and there is no active device. Open the Spotify app on this ' +
          'phone, tap play once, then try again.',
      );
    }

    log.info(`${direction} did not take effect; moving playback to "${target.name}" and retrying`);
    await playbackApi
      .transferPlayback(target.id, false)
      .catch((error) => log.warn('could not move playback to the phone', error));
    await sleep(TRANSFER_SETTLE_MS);

    try {
      await send(target.id);
    } catch (error) {
      log.warn(`${direction} retry failed`, error);
    }

    if (await this.trackChanged(beforeUri)) return;

    throw new AppError(
      'SPOTIFY_PLAYBACK_UNAVAILABLE',
      `Spotify accepted "${direction === 'next' ? 'next song' : 'previous song'}" on "${target.name}" ` +
        'but the track did not change. Check that Spotify is playing and Premium is active, then try again.',
    );
  }

  /**
   * True once the player reports a different track — or the same one restarted,
   * which is what "previous" does when the track is more than a few seconds in.
   */
  private async trackChanged(beforeUri: string | null): Promise<boolean> {
    for (let attempt = 0; attempt < PLAY_VERIFY_ATTEMPTS; attempt += 1) {
      await sleep(PLAY_VERIFY_DELAY_MS);

      const state = await this.getState().catch(() => null);
      if (!state?.item) continue;

      if (!beforeUri || state.item.uri !== beforeUri) return true;
      if ((state.progress_ms ?? 0) < 2000) return true;
    }

    return false;
  }

  /** Starts a specific track of the selected playlist. */
  async playSongNumber(songNumber: number): Promise<TrackEntry> {
    const target = this.deps.getTarget();
    if (!target) throw new AppError('NO_PLAYLIST_SELECTED', 'Select a playlist first.');

    const entry = resolveTrackNumber(target, songNumber);
    log.info(`playing #${entry.displayIndex} "${describeTrack(entry)}"`);

    await this.withDevice(() =>
      playbackApi.play({
        contextUri: target.playlistUri,
        offsetPosition: entry.spotifyPosition,
        positionMs: 0,
      }),
    );

    return entry;
  }

  /**
   * Plays a song by name, e.g. "believer" or "believer by imagine dragons".
   *
   * When only a title is given the most popular matching track is chosen (see
   * trackSelection.ts), which is the nearest thing to "the version with the most
   * plays". Naming an artist restricts the choice to that artist.
   */
  async playByQuery(title: string, artist?: string): Promise<PlayedTrack> {
    const query = title.trim();
    if (!query) throw new AppError('SONG_NOT_FOUND', 'Say the name of the song you want to play.');

    const results = await searchTracks({ title: query, artist });
    const chosen = pickBestTrack(results, query, artist);

    if (!chosen || !chosen.uri) {
      throw new AppError(
        'SONG_NOT_FOUND',
        artist
          ? `I couldn't find "${query}" by ${artist} on Spotify.`
          : `I couldn't find "${query}" on Spotify.`,
      );
    }

    log.info(`search "${query}"${artist ? ` / ${artist}` : ''} -> "${describeSpotifyTrack(chosen)}"`);

    const request = this.buildPlayRequest(chosen);
    await this.startPlayback(request, chosen.uri, chosen.name);

    return {
      name: chosen.name,
      artists: (chosen.artists ?? []).map((entry) => entry.name).join(', '),
      uri: chosen.uri,
    };
  }

  /**
   * How to start a found track.
   *
   * Playing a bare `uris: [uri]` replaces the playback context with a single
   * track: Spotify's queue shows only that song ("my playlist got emptied") and
   * `next` has nowhere to go ("the song does not change"). So a real context is
   * always preferred:
   *
   *   1. the selected playlist, if the track is in it (keeps it whole)
   *   2. the track's own album
   *   3. a single URI, only when Spotify gave us no album
   */
  private buildPlayRequest(track: SpotifyTrack): PlayRequest {
    const target = this.deps.getTarget();
    const entry = target?.entries.find(
      (candidate) => candidate.trackId === track.id || candidate.uri === track.uri,
    );

    if (target && entry) {
      return {
        contextUri: target.playlistUri,
        offsetPosition: entry.spotifyPosition,
        positionMs: 0,
      };
    }

    if (track.album?.uri) {
      return { contextUri: track.album.uri, offsetUri: track.uri, positionMs: 0 };
    }

    return { uris: [track.uri], positionMs: 0 };
  }

  /**
   * Starts playback and confirms that it is actually running.
   *
   * Spotify answers 204 to `PUT /me/player/play` even when the target device is
   * not active, so an HTTP success is NOT proof of sound. Naming the device in
   * the request is what wakes it; a transfer is only used as a fallback, because
   * a transfer that Spotify does not need can leave the device in a paused state.
   */
  private async startPlayback(request: PlayRequest, uri: string, name: string): Promise<void> {
    const devices = await this.usableDevices();
    const target = this.pickPhone(devices);
    let lastError: unknown;

    const attempt = async (deviceId?: string): Promise<void> => {
      try {
        await playbackApi.play(request, deviceId);
      } catch (error) {
        lastError = error;
        log.warn(`play request failed for "${name}"`, error);
      }
    };

    await attempt(target?.id ?? undefined);
    if (await this.confirmPlaying(uri, name)) return;

    if (target?.id) {
      /*
       * The device is listed but did not accept playback. A transfer with
       * play:true registers it as the active Spotify Connect target; the track is
       * then requested again on it.
       */
      log.info(`"${name}" did not start; transferring to "${target.name}" and retrying`);
      await playbackApi
        .transferPlayback(target.id, true)
        .catch((error) => log.warn('could not transfer playback to the phone', error));
      await sleep(TRANSFER_SETTLE_MS);

      await attempt(target.id);
      if (await this.confirmPlaying(uri, name)) return;
    }

    // Last chance: let Spotify use whatever it considers active.
    await attempt();
    if (await this.confirmPlaying(uri, name)) return;

    throw new AppError(
      'SPOTIFY_PLAYBACK_UNAVAILABLE',
      this.playbackFailureMessage(name, target?.name, lastError),
    );
  }

  /** Turns the underlying failure into something a rider can act on. */
  private playbackFailureMessage(name: string, deviceName?: string, error?: unknown): string {
    const detail = error instanceof Error ? error.message : undefined;
    const where = deviceName ? ` on "${deviceName}"` : '';

    if (!deviceName) {
      return `Spotify found "${name}" but no Spotify device is available. Open the Spotify app on this ` +
        'phone, tap play once, then ask again.';
    }

    return (
      `Spotify found "${name}" but did not start it${where}.` +
      (detail ? ` Spotify said: ${detail}` : '') +
      ' If this repeats, open the Spotify app, tap play once, then ask again.'
    );
  }

  /** Re-reads the player a few times, since playback starts asynchronously. */
  private async confirmPlaying(uri: string, name: string): Promise<boolean> {
    for (let attempt = 0; attempt < PLAY_VERIFY_ATTEMPTS; attempt += 1) {
      await sleep(PLAY_VERIFY_DELAY_MS);

      const state = await this.getState().catch(() => null);
      if (!state?.is_playing || !state.item) continue;

      // Spotify sometimes relinks a track to another album, which changes the
      // URI but not the name, so both are accepted.
      if (state.item.uri === uri) return true;
      if (normaliseTitle(state.item.name) === normaliseTitle(name)) return true;
    }

    return false;
  }

  private async currentVolumePercent(): Promise<number> {
    // The phone's own volume is the one the rider hears and the one the volume
    // keys change, so it wins whenever it is available.
    const devicePercent = await getDeviceVolumePercent();
    if (devicePercent !== undefined) return devicePercent;

    const state = await this.getState().catch(() => null);
    return (
      state?.device?.volume_percent ??
      this.deps.getKnownVolumePercent?.() ??
      DEFAULT_VOLUME_PERCENT
    );
  }

  /** Relative volume change, e.g. +5 or -5 percentage points. */
  async changeVolumeBy(delta: number, source: VolumeSource = 'voice'): Promise<VolumeChange> {
    /*
     * Step in hardware units rather than percentages.
     *
     * `setVolumeAbsolute(previous + 5)` looks correct but phones only have 15-25
     * volume steps, so the rounded target often lands on the current step: the
     * reply repeats the same percentage and nothing is audible. The native
     * stepper guarantees at least one step of movement.
     */
    if (isDeviceVolumeAvailable) {
      const before = await getDeviceVolumePercent();
      const applied = await stepDeviceVolumePercent(delta);

      if (applied !== undefined) {
        const previousPercent =
          before ?? Math.max(0, Math.min(100, Math.round(applied - delta)));
        this.deps.onVolumeChanged?.(applied, source);
        return { previousPercent, volumePercent: applied, appliedDelta: applied - previousPercent };
      }
    }

    const previousPercent = await this.currentVolumePercent();
    return this.setVolumeAbsolute(previousPercent + delta, source, previousPercent);
  }

  /** Absolute volume set, used by both voice commands and Adaptive Audio. */
  async setVolumeAbsolute(
    percent: number,
    source: VolumeSource = 'programmatic',
    previousOverride?: number,
  ): Promise<VolumeChange> {
    const previousPercent = previousOverride ?? (await this.currentVolumePercent());
    const target = clamp(Math.round(percent), MIN_VOLUME_PERCENT, MAX_VOLUME_PERCENT);

    /*
     * 1. The phone's own media volume.
     *
     * This is what "turn the volume up" means to a rider: the same stream the
     * hardware volume keys control. Spotify's API has no equivalent — it only
     * changes Spotify's internal level, which this class of device refuses with
     * "Restriction violated".
     */
    if (isDeviceVolumeAvailable) {
      const applied = await setDeviceVolumePercent(target);
      if (applied !== undefined) {
        this.deps.onVolumeChanged?.(applied, source);
        return {
          previousPercent,
          volumePercent: applied,
          appliedDelta: applied - previousPercent,
        };
      }

      log.warn('the native volume module refused the request; trying the Spotify API');
    }

    /*
     * 2. Fallback for builds without the native module (Expo Go, iOS, or an APK
     *    made before it was added): Spotify's own volume, targeting a device it
     *    will actually drive.
     */
    let deviceId = await this.usableDeviceId();
    try {
      await this.withDevice(() => playbackApi.setVolume(target, deviceId));
    } catch (error) {
      if (error instanceof SpotifyApiError && error.status === 403) {
        const moved = await this.activateUsableDevice();
        if (!moved) throw error;
        deviceId = moved;
        await this.withDevice(() => playbackApi.setVolume(target, deviceId));
      } else {
        throw error;
      }
    }

    /*
     * Verify it took effect. `supports_volume` is NOT reliable (Spotify reports
     * false for many phones where volume control works fine), so the result is
     * checked instead of trusted. Some devices silently drop the first request
     * after a device switch, so it is retried once before reporting a failure.
     */
    await sleep(VOLUME_VERIFY_DELAY_MS);
    let after = await this.getState().catch(() => null);
    let reported = after?.device?.volume_percent;

    if (typeof reported === 'number' && Math.abs(reported - target) > 2) {
      log.info(`volume did not stick (${reported}% vs ${target}%), retrying once`);
      await sleep(VOLUME_RETRY_DELAY_MS);
      await this.withDevice(() => playbackApi.setVolume(target));
      await sleep(VOLUME_VERIFY_DELAY_MS);
      after = await this.getState().catch(() => null);
      reported = after?.device?.volume_percent;
    }

    if (typeof reported === 'number' && Math.abs(reported - target) > 2) {
      throw new AppError(
        'SPOTIFY_PLAYBACK_UNAVAILABLE',
        `Spotify accepted the volume change but "${after?.device?.name ?? 'the device'}" still reports ` +
          `${reported}% (asked for ${target}%), so it does not apply app volume control.`,
      );
    }

    this.deps.onVolumeChanged?.(target, source);

    return { previousPercent, volumePercent: target, appliedDelta: target - previousPercent };
  }
}

export function createPlaybackController(deps: PlaybackControllerDeps): SpotifyPlaybackController {
  return new SpotifyPlaybackController(deps);
}
