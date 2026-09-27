import { StyleSheet, Text, View } from 'react-native';

import type { NoiseZone } from '@/adaptiveAudio/config';
import { colors, fontSize, radius, spacing } from '@/theme';

export interface NoiseMeterProps {
  /** Smoothed ambient level in dBFS. */
  dbfs?: number;
  zone: NoiseZone;
  /** True while live audio is being analysed. */
  active: boolean;
}

const ZONE_LABEL: Record<NoiseZone, string> = {
  QUIET: 'Quiet',
  MODERATE: 'Moderate',
  NOISY: 'Noisy',
  VERY_NOISY: 'Very noisy',
  EXTREME: 'Extremely noisy',
};

const MIN_DBFS = -60;
const MAX_DBFS = -10;

/** Maps dBFS to a 0..1 bar width (clamped). */
function normalise(dbfs: number | undefined): number {
  if (dbfs === undefined) return 0;
  return Math.max(0, Math.min(1, (dbfs - MIN_DBFS) / (MAX_DBFS - MIN_DBFS)));
}

const ZONE_COLOR: Record<NoiseZone, string> = {
  QUIET: colors.success,
  MODERATE: colors.accent,
  NOISY: colors.warning,
  VERY_NOISY: colors.warning,
  EXTREME: colors.danger,
};

export function NoiseMeter({ dbfs, zone, active }: NoiseMeterProps) {
  const width = active ? normalise(dbfs) : 0;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.label}>Ambient noise</Text>
        <Text style={[styles.zone, { color: ZONE_COLOR[zone] }]}>{ZONE_LABEL[zone]}</Text>
      </View>
      <View style={styles.track}>
        <View
          style={[styles.fill, { width: `${Math.round(width * 100)}%`, backgroundColor: ZONE_COLOR[zone] }]}
        />
      </View>
      <Text style={styles.hint}>
        {dbfs === undefined ? 'No audio yet' : `${dbfs.toFixed(1)} dBFS (smoothed)`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing(0.75),
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  zone: {
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  track: {
    height: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: radius.pill,
  },
  hint: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
  },
});
