/**
 * OAuth deep-link landing page: `voiceriders://spotify-callback?code=…&state=…`
 *
 * The relay sends the browser here after Spotify sign-in. On iOS the in-app
 * browser session usually intercepts this URL, so this screen never renders —
 * but on Android (and whenever the OS killed the app while the rider was in the
 * browser) the deep link is delivered to the app instead, and THIS is where the
 * sign-in is completed.
 *
 * Completion is single-use, so if both paths fire, only one exchange happens and
 * the other lands on a harmless "already used" message.
 */

import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { ScreenContainer } from '@/components/ScreenContainer';
import { completeSpotifyAuthorization, getConnectionState } from '@/spotify/auth/authService';
import { loadPlaylists } from '@/state/libraryStore';
import { refreshSession } from '@/state/sessionStore';
import { colors, fontSize, spacing } from '@/theme';
import { toUserMessage } from '@/utils/errors';

export default function SpotifyCallbackScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<Record<string, string | string[]>>();
  const [error, setError] = useState<string | undefined>(undefined);
  const handled = useRef(false);

  useEffect(() => {
    // Guard against re-running when `params` identity changes.
    if (handled.current) return;
    handled.current = true;

    const run = async () => {
      // Rebuild a URL so both entry points share one code path.
      const query = Object.entries(params)
        .filter(([, value]) => typeof value === 'string')
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
        .join('&');

      const redirectUrl = `${'voiceriders'}://spotify-callback?${query}`;

      try {
        await completeSpotifyAuthorization(redirectUrl);
        await refreshSession();
        await loadPlaylists(true).catch(() => undefined);
        router.replace('/home');
      } catch (completionError) {
        // If the in-app browser session won the race and completed the sign-in,
        // we are already connected — this path is redundant, not a failure.
        const connection = await getConnectionState();
        if (connection === 'connected') {
          await loadPlaylists(true).catch(() => undefined);
          router.replace('/home');
          return;
        }
        setError(toUserMessage(completionError));
      }
    };

    void run();
  }, [params, router]);

  return (
    <ScreenContainer scroll={false}>
      <View style={styles.center}>
        {error ? (
          <>
            <Text style={styles.title}>Sign-in could not be completed</Text>
            <Text style={styles.message}>{error}</Text>
            <Button title="Try again" onPress={() => router.replace('/connect')} />
            <Button title="Back to home" variant="ghost" onPress={() => router.replace('/home')} />
          </>
        ) : (
          <>
            <ActivityIndicator color={colors.primary} size="large" />
            <Text style={styles.message}>Finishing Spotify sign-in…</Text>
          </>
        )}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing(1.5),
    paddingHorizontal: spacing(2),
  },
  title: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '700',
    textAlign: 'center',
  },
  message: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    textAlign: 'center',
    lineHeight: 20,
  },
});
