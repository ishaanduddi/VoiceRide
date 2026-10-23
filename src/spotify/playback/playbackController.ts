/**
 * High-level playback commands.
 *
 * The dispatcher talks to this class, never to the raw API, so that behaviours
 * like "wake an idle device before acting" and "tell Adaptive Audio about a
 * manual volume change" live in exactly one place.
 */

import { AppError, NoActiveDeviceError, SpotifyApiError } from '@/utils/errors';
import { sleep } from '@/utils/async';
import { createLogger } from '@/utils/logger';

import * as playbackApi from '../api/playback';
import { searchTracks } from '../api/search';

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
   * A device we are allowed to control. Prefers the active one, then the phone
   * itself, and excludes devices Spotify marks as restricted.
   */
  private async usableDeviceId(): Promise<string | undefined> {
    try {
      const devices = await playbackApi.getAvailableDevices();
      const usable = devices.filter((device) => device.id && !device.is_restricted);
      const active = usable.find((device) => device.is_active);
      if (active?.id) return active.id ?? undefined;

      const phone = usable.find((device) => /phone|smartphone/i.test(device.type));
      return (phone ?? usable[0])?.id ?? undefined;
    } catch (error) {
      log.debug('could not list devices for volume targeting', error);
      return undefined;
    }
  }

  /**
   * Moves playback to a non-restricted device, so a volume command has somewhere
   * to land. Returns the device id, or undefined if there is nothing usable.
   */
  private async activateUsableDevice(): Promise<string | undefined> {
    try {
      const devices = await playbackApi.getAvailableDevices();
      const usable = devices.filter((device) => device.id && !device.is_restricted);
      const phone = usable.find((device) => /phone|smartphone/i.test(device.type));
      const chosen = phone ?? usable.find((device) => !device.is_active) ?? usable[0];
      if (!chosen?.id) return undefined;

      // play: false — a volume command must not start playback.
      await playbackApi.transferPlayback(chosen.id, false);
      log.info(`moved playback to "${chosen.name}" to make volume controllable`);
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

    await this.withDevice(() => playbackApi.play({ uris: [chosen.uri] }));

    return {
      name: chosen.name,
      artists: (chosen.artists ?? []).map((entry) => entry.name).join(', '),
      uri: chosen.uri,
    };
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

    /*
     * Name the device explicitly. Without it Spotify applies the command to the
     * active device, and if that one is restricted it answers
     * "Player command failed: Restriction violated" even though another device
     * (usually the phone) would accept it.
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
