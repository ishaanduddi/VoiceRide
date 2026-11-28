import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Banner } from '@/components/Banner';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ManualCommandBox } from '@/components/ManualCommandBox';
import { ModelDownloadCard } from '@/components/ModelDownloadCard';
import { NoiseMeter } from '@/components/NoiseMeter';
import { ScreenContainer } from '@/components/ScreenContainer';
import { StatusPill, type PillTone } from '@/components/StatusPill';
import {
  adjustDeviceVolume,
  getVolumeDiagnostics,
  isDeviceVolumeAvailable,
  type VolumeDiagnostics,
  type VolumeStepResult,
} from '@/audio/deviceVolume';
import { useRideMode, type RideStatus } from '@/ride/useRideMode';
import { contextManager, useAppContext } from '@/state/contextStore';
import { libraryStore } from '@/state/libraryStore';
import { useStore } from '@/state/observable';
import { sessionStore } from '@/state/sessionStore';
import { settingsStore } from '@/state/settingsStore';
import { describeAsrEngine, isModelReady, modelStore, resolveAsrEngine } from '@/voice/asr';
import {
  getBackgroundStatus,
  requestBatteryExemption,
  type BackgroundStatus,
} from '@/voice/background/backgroundListening';
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
  const model = useStore(modelStore);
  const background = useBackgroundStatus();
  const modelReady = model.state === 'ready' || isModelReady();

  // Ride Mode is entered and left with this screen. Without the speech model
  // there is nothing to listen with, so the microphone is not started at all.
  useEffect(() => {
    if (!modelReady) return undefined;
    void start();
    return () => stop();
  }, [modelReady, start, stop]);

  const listening = state.status === 'listening' || state.status === 'processing';
  const [micBusy, setMicBusy] = useState(false);

  /**
   * Re-enumerates the inputs. Useful when the headset was connected after Ride
   * Mode started, or after enabling "Call audio" for a Bluetooth headset.
   */
  const restartMicrophone = async (): Promise<void> => {
    setMicBusy(true);
    try {
      microphone.stop();
      await microphone.start();
    } finally {
      setMicBusy(false);
    }
  };

  if (!modelReady) {
    return (
      <ScreenContainer>
        <Text style={styles.setupTitle}>One-time setup</Text>
        <Text style={styles.setupBody}>
          Ride Mode needs the speech model before it can understand commands. Download it once here,
          then start the ride.
        </Text>
        <ModelDownloadCard />
        <Button title="Back to Home" variant="ghost" onPress={() => router.replace('/home')} />
      </ScreenContainer>
    );
  }

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

      <Card
        title={library.selectedPlaylistName ?? 'No playlist selected'}
        subtitle="A playlist is optional — say “play believer” to play any song on Spotify."
      >
        <Row label="Playlist tracks" value={`${library.trackMap?.entries.length ?? 0}`} />
        <Row label="Current track" value={context.currentTrackName ?? '—'} />
        <Row label="Playback" value={context.isPlaying ? 'Playing' : 'Paused / idle'} />
        <Row
          label="Volume"
          value={
            context.volumePercent !== undefined
              ? `${context.volumePercent}% (phone media volume)`
              : 'unknown'
          }
        />
        <Row label="Engine" value={describeAsrEngine()} />
        <Row label="Device" value={activeDevice?.name ?? 'none active'} />
        <Row
          label="Volume control"
          value={isDeviceVolumeAvailable ? 'phone hardware steps' : 'Spotify API (fallback)'}
        />
        <Row
          label="Screen off"
          value={
            background.serviceRunning
              ? 'keeps listening'
              : state.background
                ? 'service NOT running'
                : 'stops when the screen locks'
          }
        />
      </Card>

      <VolumeCard />

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
        <Row
          label="Speech detected"
          value={microphone.stats.speechActive ? 'yes' : 'no'}
        />
        <Row
          label="Microphone"
          value={microphone.stats.inputName ?? 'platform default'}
        />
        <Button
          title="Re-detect microphone"
          variant="secondary"
          loading={micBusy}
          onPress={() => void restartMicrophone()}
        />
        <Text style={styles.footnote}>
          Connected a headset after starting? Tap to re-scan. For a Bluetooth headset mic on
          vivo/iQOO, first enable “Call audio” for that headset in the Bluetooth settings.
        </Text>
        <Row
          label="Background service"
          value={
            !background.supported
              ? 'not supported'
              : background.serviceRunning
                ? 'running'
                : 'not running'
          }
        />
        <Row
          label="Battery exemption"
          value={background.batteryOptimised ? 'not granted' : 'granted'}
        />
        {background.batteryOptimised ? (
          <>
            <Button
              title="Allow background running"
              variant="secondary"
              onPress={requestBatteryExemption}
            />
            <Text style={styles.footnote}>
              Android can freeze voice processing with the screen off until VoiceRiders is exempt
              from battery optimisation.
            </Text>
          </>
        ) : null}
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
        <Row label="Decision" value={state.decision ?? '—'} />
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
        Settings hold the {settings.confidenceThreshold.toFixed(2)} confidence threshold. Change it
        before you ride.
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

/**
 * Volume diagnostics.
 *
 * "The volume does not change" has three very different causes, and this card
 * separates them: the phone refuses app volume changes (fixed volume or a
 * missing permission), the native call is not being used at all, or the sound is
 * on a Bluetooth headset that keeps its own volume. The test button moves the
 * stream exactly the way a voice command does, so the number proves which case
 * applies without saying anything.
 */
function VolumeCard() {
  const [diag, setDiag] = useState<VolumeDiagnostics | undefined>(undefined);
  const [lastTest, setLastTest] = useState<VolumeStepResult | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const appContext = useAppContext();
  const lastVolume = appContext.lastVolumeCommand;

  useEffect(() => {
    let alive = true;

    const check = async () => {
      const next = await getVolumeDiagnostics();
      if (alive) setDiag(next);
    };

    void check();
    const timer = setInterval(() => void check(), 2000);

    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  /**
   * Exactly the call a voice command makes (`adjustDeviceVolume`): one hardware
   * step, +1 or -1. The buttons exist so the rider can prove the hardware path
   * works without speaking.
   */
  const test = async (direction: 1 | -1) => {
    setBusy(true);
    try {
      const result = await adjustDeviceVolume(direction);
      if (result) {
        setLastTest(result);
        contextManager.setState({ volumePercent: Math.round(result.percent) });
      }
      setDiag(await getVolumeDiagnostics());
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      title="Volume"
      subtitle="This phone's media volume — the same stream the hardware volume keys change."
    >
      <Row
        label="Hardware step"
        value={diag ? `${diag.level} / ${diag.max} (${Math.round(diag.percent)}%)` : '—'}
      />
      <Row
        label="Volume API"
        value={isDeviceVolumeAvailable ? 'native (AudioManager)' : 'Spotify fallback'}
      />
      <Row
        label="Audio route"
        value={
          diag
            ? diag.isBluetooth
              ? 'Bluetooth — headset may keep its own volume'
              : 'speaker / wired'
            : '—'
        }
      />
      <Row
        label="Fixed volume"
        value={diag ? (diag.isFixedVolume ? 'YES — apps cannot change it' : 'no') : '—'}
      />
      <Row
        label="MODIFY_AUDIO_SETTINGS"
        value={diag ? (diag.hasModifyPermission ? 'granted' : 'MISSING') : '—'}
      />
      <Row
        label="Last voice command"
        value={
          lastVolume
            ? `${lastVolume.delta > 0 ? '+1' : '-1'} step · ` +
              (lastVolume.levelBefore !== undefined
                ? `step ${lastVolume.levelBefore} → ${lastVolume.levelAfter ?? '?'}`
                : `now step ${lastVolume.levelAfter ?? '?'}`) +
              (lastVolume.max ? ` of ${lastVolume.max}` : '') +
              (lastVolume.voiceRoute ? ' · voice route' : '') +
              (lastVolume.method ? ` · via ${lastVolume.method}` : '') +
              ` · ${lastVolume.outcome === 'blocked' ? 'blocked by the phone' : lastVolume.outcome}`
            : '—'
        }
      />

      <Row
        label="Last test"
        value={
          lastTest
            ? `step ${lastTest.levelBefore} → ${lastTest.levelAfter} of ${lastTest.max}` +
              (lastTest.bluetooth ? ' · Bluetooth' : '') +
              (lastTest.voiceRoute ? ' · voice route' : '') +
              (lastTest.method ? ` · via ${lastTest.method}` : '')
            : '—'
        }
      />

      <Row label="Voice trace" value={lastVolume?.trace ?? '—'} />
      <Row label="Test trace" value={lastTest?.trace ?? '—'} />

      <View style={styles.testButtons}>
        <Button
          title="Test: one step louder"
          variant="secondary"
          loading={busy}
          onPress={() => void test(1)}
        />
        <Button
          title="Test: one step quieter"
          variant="secondary"
          loading={busy}
          onPress={() => void test(-1)}
        />
      </View>

      <Text style={styles.footnote}>
        Both buttons make exactly the same call a voice command makes: one hardware volume step.
        “Last test” and “Last voice command” show the level the phone actually reached.
      </Text>
    </Card>
  );
}

/**
 * Live view of the screen-off machinery.
 *
 * A foreground service normally prevents Android from freezing the app, but
 * aggressive OEM builds (vivo/OriginOS especially) can still suspend it — which
 * looks like "the mic light is on but commands are only heard occasionally".
 * Showing the real state, and offering the battery exemption, turns that into
 * something the rider can see and fix.
 */
function useBackgroundStatus(): BackgroundStatus {
  const [status, setStatus] = useState<BackgroundStatus>({
    serviceRunning: false,
    batteryOptimised: true,
    supported: false,
  });

  useEffect(() => {
    let alive = true;

    const check = async () => {
      const next = await getBackgroundStatus();
      if (alive) setStatus(next);
    };

    void check();
    const timer = setInterval(() => void check(), 3000);

    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  return status;
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
  testButtons: {
    gap: spacing(2),
  },
  setupTitle: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: '800',
    marginTop: spacing(2),
  },
  setupBody: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
});
