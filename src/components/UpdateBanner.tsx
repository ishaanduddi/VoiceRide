import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { colors, fontSize, radius, spacing } from '@/theme';
import { useAppUpdates } from '@/updates/useAppUpdates';

/**
 * In-app update notice, shown on the home screen.
 *
 * Two cases:
 *  - an EAS Update (JavaScript) has been downloaded and is waiting for a restart
 *  - a newer APK exists on GitHub Releases (native change)
 *
 * Renders nothing when the app is current.
 */
export function UpdateBanner() {
  const updates = useAppUpdates();

  if (updates.otaPending) {
    return (
      <View style={styles.banner}>
        <Text style={styles.title}>Update ready</Text>
        <Text style={styles.body}>
          A new version has been downloaded. Restart to apply it — it will also apply automatically
          next time the app starts.
        </Text>
        <Button title="Restart now" onPress={() => void updates.applyOtaUpdate()} />
      </View>
    );
  }

  if (updates.release && updates.releaseIsNewer) {
    return (
      <View style={styles.banner}>
        <Text style={styles.title}>VoiceRiders {updates.release.tag} is available</Text>
        <Text style={styles.body}>
          Download the new APK and install it over this app. Your settings and Spotify connection
          are kept.
        </Text>
        <Button
          title={`Download ${updates.release.tag}`}
          onPress={() => void updates.downloadApk()}
        />
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  banner: {
    borderLeftWidth: 3,
    borderColor: colors.accent,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
    padding: spacing(1.5),
    gap: spacing(1),
  },
  title: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  body: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
});