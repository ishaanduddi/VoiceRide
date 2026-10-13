/**
 * High-level playback commands.
 *
 * The dispatcher talks to this class, never to the raw API, so that behaviours
 * like "wake an idle device before acting" and "tell Adaptive Audio about a
 * manual volume change" live in exactly one place.
 */

import { AppError, NoActiveDeviceError } from '@/utils/errors';
import { sleep } from '@/utils/async';
import { createLogger } from '@/utils/logger';

import * as playbackApi from '../api/playback';

import {
  describeTrack,
  resolveTrackNumber,
  type PlaylistTrackMap,
  type TrackEntry,
} from './playlistTrackMap';

const log = createLogger('spotify:playback');

const DEFAULT_VOLUME_PERCENT = 50;
const MIN_VOLUME_PERCENT = 0;
const MAX_VOLUME_PERCENT = 100;
/** Wait before reading the volume back, since Spotify reports it asynchronously. */
const VOLUME_VERIFY_DELAY_MS = 250;

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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export class SpotifyPlaybackController {
  constructor(private readonly deps: PlaybackControllerDeps) {}

  /** Picks any non-restricted device and transfers playback to it. */
  private async activateSomeDevice(): Promise<boolean> {
    const devices = await playbackApi.getAvailableDevices();
    const candidate =
      devices.find((device) => device.id && !device.is_restricted) ??
      devices.find((device) => device.id);
    if (!candidate?.id) return false;
    log.info(`transferring playback to "${candidate.name}"`);
    await playbackApi.transferPlayback(candidate.id, true);
    return true;
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
    await this.withDevice(() => playbackApi.next());
  }

  async previous(): Promise<void> {
    await this.withDevice(() => playbackApi.previous());
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

  private async currentVolumePercent(): Promise<number> {
    const state = await this.getState().catch(() => null);
    return (
      state?.device?.volume_percent ??
      this.deps.getKnownVolumePercent?.() ??
      DEFAULT_VOLUME_PERCENT
    );
  }

  /** Relative volume change, e.g. +5 or -5 percentage points. */
  async changeVolumeBy(delta: number, source: VolumeSource = 'voice'): Promise<VolumeChange> {
    const state = await this.getState().catch(() => null);
    const previousPercent =
      state?.device?.volume_percent ?? this.deps.getKnownVolumePercent?.() ?? DEFAULT_VOLUME_PERCENT;

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

    await this.withDevice(() => playbackApi.setVolume(target));

    /*
     * Verify it took effect. `supports_volume` is NOT reliable (Spotify reports
     * false for many phones where volume control works fine), so the result is
     * checked instead of trusted. A short pause lets Spotify report the new
     * value before it is read back.
     */
    await sleep(VOLUME_VERIFY_DELAY_MS);
    const after = await this.getState().catch(() => null);
    const reported = after?.device?.volume_percent;
    const unchanged = typeof reported === 'number' && Math.abs(reported - previousPercent) <= 2;
    if (typeof reported === 'number' && Math.abs(reported - target) > 2 && unchanged) {
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
