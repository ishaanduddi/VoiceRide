import { StyleSheet, Switch, Text, View } from 'react-native';

import { colors, fontSize, spacing } from '@/theme';

export interface SettingToggleProps {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}

export function SettingToggle({ label, description, value, onValueChange }: SettingToggleProps) {
  return (
    <View style={styles.row}>
      <View style={styles.info}>
        <Text style={styles.label}>{label}</Text>
        {description ? <Text style={styles.description}>{description}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: colors.surfaceAlt, true: colors.primaryDark }}
        thumbColor={value ? colors.primary : '#B6C2D4'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(1.5),
  },
  info: {
    flex: 1,
    gap: 2,
  },
  label: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  description: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    lineHeight: 16,
  },
});
