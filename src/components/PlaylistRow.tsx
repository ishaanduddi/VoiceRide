import { Pressable, StyleSheet, Text, View } from 'react-native';

import { playlistTrackCount } from '@/spotify/playlistUtils';
import type { SpotifyPlaylist } from '@/spotify/types';
import { colors, fontSize, radius, spacing } from '@/theme';

export interface PlaylistRowProps {
  playlist: SpotifyPlaylist;
  selected?: boolean;
  /**
   * Spotify only exposes a playlist's items to its owner or collaborators, so
   * some playlists cannot be used at all. They are shown but not tappable.
   */
  unavailable?: boolean;
  onPress: () => void;
}

export function PlaylistRow({
  playlist,
  selected = false,
  unavailable = false,
  onPress,
}: PlaylistRowProps) {
  const count = playlistTrackCount(playlist);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: unavailable }}
      onPress={unavailable ? undefined : onPress}
      style={({ pressed }) => [
        styles.row,
        selected && styles.selected,
        unavailable && styles.unavailable,
        pressed && !unavailable ? styles.pressed : null,
      ]}
    >
      <View style={styles.info}>
        <Text style={[styles.name, unavailable && styles.dimmed]} numberOfLines={1}>
          {playlist.name}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {unavailable
            ? 'Not available — you are not the owner'
            : `${count} tracks${playlist.owner?.display_name ? ` · ${playlist.owner.display_name}` : ''}`}
        </Text>
      </View>
      {selected && !unavailable ? <Text style={styles.check}>SELECTED</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing(1),
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing(1.75),
  },
  selected: {
    borderColor: colors.primary,
  },
  unavailable: {
    opacity: 0.55,
    borderStyle: 'dashed',
  },
  pressed: {
    opacity: 0.85,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  name: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  dimmed: {
    color: colors.textMuted,
  },
  meta: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
  },
  check: {
    color: colors.primary,
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
