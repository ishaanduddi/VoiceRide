import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, spacing } from '@/theme';

export interface ScreenContainerProps {
  children: ReactNode;
  /** Wrap the content in a ScrollView (default true). */
  scroll?: boolean;
  /** Rendered below the content, pinned to the bottom. */
  footer?: ReactNode;
}

export function ScreenContainer({ children, scroll = true, footer }: ScreenContainerProps) {
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.content, styles.flex]}>{children}</View>
      )}
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  content: {
    padding: spacing(2),
    gap: spacing(2),
  },
  footer: {
    paddingHorizontal: spacing(2),
    paddingBottom: spacing(2),
  },
});
