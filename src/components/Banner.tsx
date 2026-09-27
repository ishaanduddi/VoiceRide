import { StyleSheet, Text, View } from 'react-native';

import { colors, fontSize, radius, spacing } from '@/theme';

export type BannerTone = 'info' | 'error' | 'warning' | 'success';

const TONE: Record<BannerTone, { border: string; text: string }> = {
  info: { border: colors.accent, text: colors.text },
  error: { border: colors.danger, text: '#FFD9D9' },
  warning: { border: colors.warning, text: '#FFE9C7' },
  success: { border: colors.success, text: '#D6F7E2' },
};

export interface BannerProps {
  message?: string;
  tone?: BannerTone;
}

/** Compact inline message. Renders nothing when `message` is empty. */
export function Banner({ message, tone = 'info' }: BannerProps) {
  if (!message || message.trim().length === 0) return null;
  const palette = TONE[tone];

  return (
    <View style={[styles.banner, { borderColor: palette.border }]}>
      <Text style={[styles.text, { color: palette.text }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderLeftWidth: 3,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
    padding: spacing(1.5),
  },
  text: {
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
});
