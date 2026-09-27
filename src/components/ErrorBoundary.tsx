import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';

import { colors, fontSize, spacing } from '@/theme';

interface Props {
  children: ReactNode;
}

interface State {
  error?: Error;
}

/**
 * Renders any React render/runtime error as readable text on the device.
 *
 * A released APK has no console, so without this a crash is invisible — you just
 * see the app close. With it, the failure can be screenshotted and reported.
 * (Native crashes below the JS layer still need `adb logcat`.)
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = {};

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[VoiceRiders] render error', error, info.componentStack);
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Text style={styles.title}>VoiceRiders hit an error</Text>
        <Text style={styles.hint}>
          Screenshot this and send it over — the text below identifies the cause.
        </Text>
        <Text selectable style={styles.message}>
          {error.name}: {error.message}
        </Text>
        <Text selectable style={styles.stack}>
          {error.stack ?? 'no stack trace available'}
        </Text>
      </ScrollView>
    );
  }
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing(2),
    gap: spacing(1),
  },
  title: {
    color: colors.danger,
    fontSize: fontSize.lg,
    fontWeight: '700',
  },
  hint: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
  },
  message: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  stack: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
  },
});
