import { StyleSheet, Text, View } from 'react-native';

import { colors, fontSize, radius, spacing } from '@/theme';

export interface TrackRowProps {
  /** 1-based position in the playlist — this is the number you speak. */
  index: number;
  name: string;
  artists: string;
  durationMs: number;
  /** Highlight the row that matches the current playback index. */
  current?: boolean;
}

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function TrackRow({ index, name, artists, durationMs, current = false }: TrackRowProps) {
  return (
    <View style={[styles.row, current && styles.current]}>
      <Text style={[styles.index, current && styles.currentIndex]}>{index}</Text>
      <View style={styles.info}>
        <Text style={[styles.name, current && styles.currentName]} numberOfLines={1}>
          {name}
        </Text>
        <Text style={styles.artists} numberOfLines={1}>
          {artists}
        </Text>
      </View>
      <Text style={styles.duration}>{formatDuration(durationMs)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(1.5),
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing(1.75),
    paddingVertical: spacing(1.25),
  },
  current: {
    borderColor: colors.primary,
  },
  index: {
    width: 28,
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: fontSize.md,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  currentIndex: {
    color: colors.primary,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  name: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  currentName: {
    color: colors.primary,
  },
  artists: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
  },
  duration: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontVariant: ['tabular-nums'],
  },
});
