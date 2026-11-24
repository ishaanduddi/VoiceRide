import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Banner } from '@/components/Banner';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ScreenContainer } from '@/components/ScreenContainer';
import { SettingToggle } from '@/components/SettingToggle';
import { StatusPill, type PillTone } from '@/components/StatusPill';
import { ModelDownloadCard } from '@/components/ModelDownloadCard';
import { UpdateBanner } from '@/components/UpdateBanner';
import { useStore } from '@/state/observable';
import { libraryStore, loadPlaylists } from '@/state/libraryStore';
import { sessionStore } from '@/state/sessionStore';
import { settingsStore, updateSettings } from '@/state/settingsStore';
import { useAppContext } from '@/state/contextStore';
import { colors, fontSize, spacing } from '@/theme';
import { isModelReady, modelStore } from '@/voice/asr';

export default function HomeScreen() {
  const router = useRouter();
  const session = useStore(sessionStore);
  const library = useStore(libraryStore);
  const settings = useStore(settingsStore);
  const model = useStore(modelStore);
  const context = useAppContext();

  const connected = session.status === 'connected';
  const modelReady = model.state === 'ready' || isModelReady();
  const trackCount = library.trackMap?.entries.length ?? 0;
  // A playlist is optional now: songs are played by name.
  const canRide = connected && modelReady;

  const sessionTone: PillTone =
    session.status === 'connected' ? 'success' : session.status === 'connecting' ? 'warning' : 'neutral';
  const sessionLabel =
    session.status === 'connected'
      ? `Connected${session.displayName ? ` Â· ${session.displayName}` : ''}`
      : session.status === 'connecting'
        ? 'Connectingâ€¦'
        : 'Not connected';

  return (
    <ScreenContainer>
      <View style={styles.headerRow}>
        <StatusPill label={sessionLabel} tone={sessionTone} />
        {session.product ? <StatusPill label={session.product} tone="accent" /> : null}
      </View>

      <Banner tone="error" message={library.playlistsError ?? library.tracksError ?? session.error} />

      <UpdateBanner />

      {modelReady ? null : <ModelDownloadCard compact />}

      {session.product === 'free' ? (
        <Banner
          tone="warning"
          message={
            'This Spotify account is on the Free tier. Spotify only permits playback and volume control on ' +
            'Premium accounts, so voice commands will be rejected with HTTP 403.'
          }
        />
      ) : null}

      <Card
        title="Selected playlist"
        subtitle="Optional. You can also just say â€œplay believerâ€ â€” any song on Spotify."
      >
        <Text style={styles.playlistName}>
          {library.selectedPlaylistName ?? 'No playlist selected yet'}
        </Text>
        <Text style={styles.meta}>
          {trackCount > 0 ? `${trackCount} playable tracks` : 'Select a playlist to see its tracks'}
        </Text>
        <Button
          title={trackCount > 0 ? 'Change playlist' : 'Choose a playlist'}
          variant="secondary"
          onPress={() => router.push('/playlists')}
          disabled={!connected}
        />
      </Card>

      <Card title="Adaptive Audio Mode" subtitle="Raises the phone volume as the road gets louder.">
        <SettingToggle
          label="Enable Adaptive Audio"
          description="Uses the microphone to estimate ambient noise and adjusts the phone's media volume in small steps."
          value={settings.adaptiveAudioEnabled}
          onValueChange={(value) => void updateSettings({ adaptiveAudioEnabled: value })}
        />
      </Card>

      {context.spotifyConnected ? null : (
        <Banner tone="warning" message="Connect Spotify to enable playback commands." />
      )}

      <Button title="Start Ride Mode" onPress={() => router.push('/ride')} disabled={!canRide} />
      {canRide ? null : (
        <Text style={styles.hint}>
          {!connected
            ? 'Connect Spotify first.'
            : 'Download the speech model above to enable voice commands.'}
        </Text>
      )}

      <Button title="Settings" variant="ghost" onPress={() => router.push('/settings')} />
      <Button
        title="Reload playlists"
        variant="ghost"
        onPress={() => {
          void loadPlaylists(true).catch(() => undefined);
        }}
        disabled={!connected}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    gap: spacing(1),
    flexWrap: 'wrap',
  },
  playlistName: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '700',
    marginTop: spacing(0.5),
  },
  meta: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    marginBottom: spacing(1),
  },
  hint: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    textAlign: 'center',
  },
});

