/** Subset of the Spotify Web API objects that VoiceRiders actually uses. */

export interface SpotifyImage {
  url: string;
  height: number | null;
  width: number | null;
}

export interface SpotifyArtist {
  id: string;
  name: string;
}

export interface SpotifyAlbum {
  id: string;
  name: string;
  images: SpotifyImage[];
}

export interface SpotifyTrack {
  id: string | null;
  name: string;
  uri: string;
  duration_ms: number;
  is_playable?: boolean;
  artists: SpotifyArtist[];
  album: SpotifyAlbum;
}

export interface SpotifyPlaylist {
  id: string;
  name: string;
  description: string | null;
  uri: string;
  images: SpotifyImage[];
  owner?: { display_name?: string; id?: string };
  /** Current item-count field. */
  items?: { total: number };
  /** @deprecated Spotify reports 0 here; use `items.total` (see playlistTrackCount). */
  tracks?: { total: number };
  collaborative?: boolean;
}

export interface SpotifyPaging<T> {
  href: string;
  limit: number;
  next: string | null;
  offset: number;
  total: number;
  items: T[];
}

/** A raw entry from a playlist items response (may wrap a null/episode item). */
export interface PlaylistTrackItem {
  added_at?: string;
  is_local?: boolean;
  /** Current field name on `/playlists/{id}/items`. */
  item?: SpotifyTrack | null;
  /** Deprecated alias still returned by the old `/tracks` endpoint. */
  track?: SpotifyTrack | null;
}

export interface SpotifyUserProfile {
  id: string;
  display_name: string | null;
  email?: string;
  product?: 'free' | 'premium' | 'open';
  images?: SpotifyImage[];
  country?: string;
}

export interface SpotifyDevice {
  id: string | null;
  is_active: boolean;
  is_private_session: boolean;
  is_restricted: boolean;
  name: string;
  type: string;
  volume_percent: number | null;
}

export interface SpotifyPlaybackState {
  device: SpotifyDevice | null;
  repeat_state: 'off' | 'track' | 'context';
  shuffle_state: boolean;
  is_playing: boolean;
  progress_ms: number | null;
  item: SpotifyTrack | null;
}
