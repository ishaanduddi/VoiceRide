import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Banner } from '@/components/Banner';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ScreenContainer } from '@/components/ScreenContainer';
import { isSpotifyConfigured, spotifyConfig } from '@/config';
import { getSpotifyRedirectUri } from '@/spotify/auth/spotifyAuth';
import { loadPlaylists } from '@/state/libraryStore';
import { useStore } from '@/state/observable';
import { connectSpotifyAccount, sessionStore } from '@/state/sessionStore';
import { toUserMessage } from '@/utils/errors';
import { colors, fontSize, spacing } from '@/theme';

export default function ConnectScreen() {
  const router = useRouter();
  const session = useStore(sessionStore);
  const [error, setError] = useState<string | undefined>(undefined);

  const configured = isSpotifyConfigured();
  const busy = session.status === 'connecting';

  const handleConnect = async () => {
    setError(undefined);
    try {
      await connectSpotifyAccount();
      await loadPlaylists(true).catch(() => undefined);
      router.replace('/home');
    } catch (connectError) {
      setError(toUserMessage(connectError));
    }
  };

  return (
    <ScreenContainer>
      <Card
        title="Connect your Spotify account"
        subtitle="VoiceRiders never sees your password and never stores a client secret."
      >
        <Text style={styles.body}>
          You sign in on Spotify's own website. VoiceRiders only receives a temporary access token,
          stored in your phone's secure keychain.
        </Text>
      </Card>

      {!configured ? (
        <Banner
          tone="warning"
          message={
            'No Spotify client id found. Create an app at developer.spotify.com/dashboard, then set ' +
            'EXPO_PUBLIC_SPOTIFY_CLIENT_ID in your .env file and restart Expo.'
          }
        />
      ) : null}

      <Card title="Add this Redirect URI in the Spotify dashboard">
        <Text selectable style={styles.mono}>
          {getSpotifyRedirectUri()}
        </Text>
        <Text style={styles.note}>
          Scopes requested: {spotifyConfig.scopes.join(', ')}
        </Text>
      </Card>

      <Banner tone="error" message={error ?? session.error} />

      <Button
        title={session.status === 'connected' ? 'Reconnect Spotify' : 'Connect Spotify'}
        onPress={handleConnect}
        loading={busy}
        disabled={!configured}
      />

      {session.status === 'connected' ? (
        <Button title="Continue to Home" variant="secondary" onPress={() => router.replace('/home')} />
      ) : null}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  body: {
    color: colors.text,
    fontSize: fontSize.sm,
    lineHeight: 20,
    marginTop: spacing(0.5),
  },
  mono: {
    color: colors.accent,
    fontSize: fontSize.sm,
    marginTop: spacing(0.5),
  },
  note: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginTop: spacing(0.5),
  },
});
