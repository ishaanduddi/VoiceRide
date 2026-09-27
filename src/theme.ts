/** Rider-friendly dark theme. High contrast, large touch targets. */

export const colors = {
  background: '#0B1220',
  surface: '#131C2E',
  surfaceAlt: '#1B2740',
  border: '#22304A',
  text: '#F5F7FA',
  textMuted: '#93A1B8',
  primary: '#1DB954',
  primaryDark: '#158C3E',
  accent: '#38BDF8',
  warning: '#F59E0B',
  danger: '#EF4444',
  success: '#22C55E',
} as const;

export const spacing = (units: number): number => units * 8;

export const radius = {
  sm: 8,
  md: 12,
  lg: 20,
  pill: 999,
} as const;

export const fontSize = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 20,
  xl: 26,
  xxl: 34,
} as const;
