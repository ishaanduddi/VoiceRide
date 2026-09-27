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
import { isCloudAsrConfigured } from '@/config';
import { useRideMode, type RideStatus } from '@/ride/useRideMode';
import { useAppContext } from '@/state/contextStore';
import { libraryStore } from '@/state/libraryStore';
import { useStore } from '@/state/observable';
import { settingsStore } from '@/state/settingsStore';
import { describeAsrEngine } from '@/voice/asr';
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
  const { state, start, stop, submitManualCommand } = useRideMode();
  const library = useStore(libraryStore);
  const settings = useStore(settingsStore);
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

      <Card title={library.selectedPlaylistName ?? 'No playlist'}>
        <Row label="Tracks" value={`${library.trackMap?.entries.length ?? 0}`} />
        <Row label="Current track" value={context.currentTrackName ?? '—'} />
        <Row label="Playback" value={context.isPlaying ? 'Playing' : 'Paused / idle'} />
        <Row
          label="Volume"
          value={context.volumePercent !== undefined ? `${context.volumePercent}%` : 'unknown'}
        />
        <Row label="Engine" value={describeAsrEngine()} />
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

      {!isCloudAsrConfigured() ? (
        <Banner
          tone="warning"
          message={
            'Speech recognition is not configured, so voice commands cannot be understood yet. ' +
            'Set EXPO_PUBLIC_ASR_ENDPOINT in .env (see docs/ARCHITECTURE.md). Meanwhile you can type ' +
            'commands below to exercise the NLP pipeline.'
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
