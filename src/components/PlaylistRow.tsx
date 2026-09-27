import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { SpotifyPlaylist } from '@/spotify/types';
import { colors, fontSize, radius, spacing } from '@/theme';

export interface PlaylistRowProps {
  playlist: SpotifyPlaylist;
  selected?: boolean;
  onPress: () => void;
}

export function PlaylistRow({ playlist, selected = false, onPress }: PlaylistRowProps) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, selected && styles.selected, pressed && styles.pressed]}
    >
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>
          {playlist.name}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {playlist.tracks?.total ?? 0} tracks
          {playlist.owner?.display_name ? ` · ${playlist.owner.display_name}` : ''}
        </Text>
      </View>
      {selected ? <Text style={styles.check}>SELECTED</Text> : null}
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
