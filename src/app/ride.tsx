import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Banner } from '@/components/Banner';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ManualCommandBox } from '@/components/ManualCommandBox';
import { NoiseMeter } from '@/components/NoiseMeter';
import { ScreenContainer } from '@/components/ScreenContainer';
import { StatusPill, type PillTone } from '@/components/StatusPill';
import { useRideMode, type RideStatus } from '@/ride/useRideMode';
import { useAppContext } from '@/state/contextStore';
import { libraryStore } from '@/state/libraryStore';
import { useStore } from '@/state/observable';
import { sessionStore } from '@/state/sessionStore';
import { settingsStore } from '@/state/settingsStore';
import { describeAsrEngine, resolveAsrEngine } from '@/voice/asr';
import { colors, fontSize, spacing } from '@/theme';

const STATUS_LABEL: Record<RideStatus, string> = {
  idle: 'Idle',
  starting: 'Starting…',
  listening: 'Listening',
  processing: 'Thinking…',
  stopped: 'Stopped',
  error: 'Error',
};

const STATUS_TONE: Record<RideStatus, PillTone> = {
  idle: 'neutral',
  starting: 'warning',
  listening: 'success',
  processing: 'accent',
  stopped: 'neutral',
  error: 'danger',
};

export default function RideModeScreen() {
  const router = useRouter();
  const { state, activeDevice, microphone, start, stop, submitManualCommand } = useRideMode();
  const library = useStore(libraryStore);
  const settings = useStore(settingsStore);
  const session = useStore(sessionStore);
  const context = useAppContext();

  // Ride Mode is entered and left with this screen.
  useEffect(() => {
    void start();
    return () => stop();
  }, [start, stop]);

  const listening = state.status === 'listening' || state.status === 'processing';

  return (
    <ScreenContainer>
      <View style={styles.statusRow}>
        <StatusPill label={STATUS_LABEL[state.status]} tone={STATUS_TONE[state.status]} />
        {state.adaptiveAudioEnabled ? <StatusPill label="Adaptive audio" tone="accent" /> : null}
      </View>

      {state.status === 'listening' ? (
        <View style={styles.listening}>
          <Text style={styles.mic}>🎤</Text>
          <Text style={styles.listeningText}>Listening — just speak</Text>
        </View>
      ) : null}

      <Banner tone="error" message={state.error} />

      {session.product === 'free' ? (
        <Banner
          tone="error"
          message={
            'This Spotify account is on the Free tier. Spotify rejects playback and volume control with ' +
            'HTTP 403 for Free accounts, so no voice command can change the music. Connect a Premium account.'
          }
        />
      ) : null}

      <Card title={library.selectedPlaylistName ?? 'No playlist'}>
        <Row label="Tracks" value={`${library.trackMap?.entries.length ?? 0}`} />
        <Row label="Current track" value={context.currentTrackName ?? '—'} />
        <Row label="Playback" value={context.isPlaying ? 'Playing' : 'Paused / idle'} />
        <Row
          label="Volume"
          value={context.volumePercent !== undefined ? `${context.volumePercent}%` : 'unknown'}
        />
        <Row label="Engine" value={describeAsrEngine()} />
        <Row label="Device" value={activeDevice?.name ?? 'none active'} />
      </Card>

      <Card
        title="Microphone"
        subtitle="Live diagnostics — the frame counter must keep climbing, and the level must move when you speak."
      >
        <Row label="Permission" value={microphone.permissionDenied ? 'denied' : 'granted'} />
        <Row label="Capture" value={microphone.isActive ? 'active' : 'inactive'} />
        <Row label="Frames received" value={`${microphone.stats.frames}`} />
        <Row
          label="Level"
          value={
            microphone.stats.lastDbfs !== undefined
              ? `${microphone.stats.lastDbfs.toFixed(1)} dBFS`
              : '—'
          }
        />
        <Row
          label="Noise floor"
          value={
            microphone.stats.noiseFloorDb !== undefined
              ? `${microphone.stats.noiseFloorDb.toFixed(1)} dBFS`
              : '—'
          }
        />
        <Row label="Speech detected" value={microphone.stats.speechActive ? 'yes' : 'no'} />
        <Row
          label="Sample rate"
          value={microphone.stats.sampleRate ? `${microphone.stats.sampleRate} Hz` : '—'}
        />
        <Banner tone="error" message={microphone.error} />
      </Card>

      {state.adaptiveAudioEnabled ? (
        <Card title="Ambient noise">
          <NoiseMeter dbfs={state.ambientDbfs} zone={state.noiseZone} active={listening} />
        </Card>
      ) : null}

      <Card title="Last command">
        <Row label="Heard" value={state.lastTranscript ?? '—'} />
        <Row label="Intent" value={state.lastIntent ?? '—'} />
        <Row
          label="Confidence"
          value={state.confidence !== undefined ? state.confidence.toFixed(2) : '—'}
        />
        <Row label="Response" value={state.lastResponse ?? '—'} />
      </Card>

      {resolveAsrEngine() === 'unconfigured' ? (
        <Banner
          tone="warning"
          message={
            'Speech recognition is not set up, so nothing can be understood. Open Settings → Speech ' +
            'recognition and download the speech model (about 75 MB, once), then come back to Ride Mode.'
          }
        />
      ) : null}

      <Card
        title="Manual command (development)"
        subtitle="Not for use while riding — exists so the pipeline can be tested without ASR."
      >
        <ManualCommandBox
          onSubmit={(text) => {
            void submitManualCommand(text);
          }}
          disabled={!listening}
        />
      </Card>

      <Button
        title="Stop Ride Mode"
        variant="danger"
        onPress={() => {
          stop();
          router.back();
        }}
      />

      <Button title="Back to Home" variant="ghost" onPress={() => router.replace('/home')} />

      <Text style={styles.footnote}>
        Settings hold {settings.confidenceThreshold.toFixed(2)} confidence threshold and a{' '}
        {settings.volumeStepPercent}-point volume step. Change them before you ride.
      </Text>
    </ScreenContainer>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  statusRow: {
    flexDirection: 'row',
    gap: spacing(1),
    flexWrap: 'wrap',
  },
  listening: {
    alignItems: 'center',
    gap: spacing(0.5),
    paddingVertical: spacing(2),
  },
  mic: {
    fontSize: 44,
  },
  listeningText: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing(2),
    paddingVertical: spacing(0.5),
  },
  rowLabel: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
  },
  rowValue: {
    flex: 1,
    textAlign: 'right',
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  footnote: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    lineHeight: 16,
    textAlign: 'center',
  },
});
