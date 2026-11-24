import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ScreenContainer } from '@/components/ScreenContainer';
import { reloadAsrProvider } from '@/services/appServices';
import { useStore } from '@/state/observable';
import { sessionStore } from '@/state/sessionStore';
import { colors, fontSize, spacing } from '@/theme';
import { downloadModel, formatModelSize, isModelReady, modelStore } from '@/voice/asr';

export default function WelcomeScreen() {
  const router = useRouter();
  const session = useStore(sessionStore);
  const model = useStore(modelStore);

  const connected = session.status === 'connected';
  const modelReady = model.state === 'ready' || isModelReady();
  const downloading = model.state === 'downloading';
  const progress = Math.round(model.progress * 100);
  const readyToRide = connected && modelReady;

  const promptShown = useRef(false);

  const download = useCallback(async (): Promise<void> => {
    await downloadModel();
    await reloadAsrProvider();
  }, []);

  /*
   * First-run prompt. The model is a one-time ~140 MB download; without it the
   * rider would start Ride Mode and only then discover that voice commands
   * cannot work. The card below shows live progress after "Download now".
   */
  useEffect(() => {
    if (promptShown.current || modelReady || downloading) return;
    promptShown.current = true;

    Alert.alert(
      'One-time setup',
      'VoiceRiders needs a speech model (about 140 MB) to understand commands. Download it now and Ride Mode will be ready the first time you use it.',
      [
        { text: 'Later', style: 'cancel' },
        { text: 'Download now', onPress: () => void download() },
      ],
    );
  }, [download, downloading, modelReady]);

  return (
    <ScreenContainer>
      <View style={styles.hero}>
        <Text style={styles.logo}>VoiceRiders</Text>
        <Text style={styles.tagline}>Hands-free Spotify for riders.</Text>
      </View>

      <Card
        title="Set up once, then ride"
        subtitle="Two things before your first ride — both take a few minutes."
      >
        <SetupRow
          index={1}
          title="Connect Spotify"
          detail={
            connected
              ? `Connected${session.displayName ? ` · ${session.displayName}` : ''}`
              : 'Spotify Premium is required for playback control.'
          }
          done={connected}
          action={
            connected ? undefined : (
              <Button
                title="Connect"
                variant="secondary"
                onPress={() => router.push('/connect')}
                style={styles.rowButton}
              />
            )
          }
        />

        <SetupRow
          index={2}
          title="Download the speech model"
          detail={
            modelReady
              ? `Ready${model.sizeBytes ? ` · ${formatModelSize(model.sizeBytes)}` : ''} — works offline`
              : downloading
                ? `Downloading ${progress}% — keep the app open`
                : 'About 140 MB, one time. Without it, voice commands cannot work.'
          }
          done={modelReady}
          action={
            modelReady ? undefined : (
              <Button
                title={downloading ? `${progress}%` : 'Download'}
                variant="secondary"
                loading={downloading}
                onPress={() => void download()}
                style={styles.rowButton}
              />
            )
          }
        />

        <Text style={styles.note}>
          Wear earphones or helmet comms. With the phone speaker, the microphone hears the music
          instead of you.
        </Text>
      </Card>

      <Button
        title={
          readyToRide
            ? 'Continue'
            : !connected
              ? 'Connect Spotify'
              : downloading
                ? `Downloading… ${progress}%`
                : 'Download the speech model'
        }
        loading={downloading}
        disabled={!readyToRide}
        onPress={() => {
          if (readyToRide) {
            router.push('/home');
          } else if (!connected) {
            router.push('/connect');
          } else {
            void download();
          }
        }}
      />

      <Button
        title="Skip for now"
        variant="ghost"
        onPress={() => router.push('/home')}
      />

      <Text style={styles.safety}>
        Safety first: keep both hands on the bars. Even though VoiceRiders is voice-controlled, only
        use it where it is legal and safe to do so.
      </Text>
    </ScreenContainer>
  );
}

function SetupRow({
  index,
  title,
  detail,
  done,
  action,
}: {
  index: number;
  title: string;
  detail: string;
  done: boolean;
  action?: ReactNode;
}) {
  return (
    <View style={styles.stepRow}>
      <Text style={[styles.stepNumber, done && styles.stepDone]}>{done ? '✓' : index}</Text>
      <View style={styles.stepTextWrap}>
        <Text style={styles.stepTitle}>{title}</Text>
        <Text style={styles.stepDetail}>{detail}</Text>
      </View>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    marginTop: spacing(3),
    marginBottom: spacing(2),
    gap: spacing(0.5),
  },
  logo: {
    color: colors.text,
    fontSize: fontSize.xxl,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  tagline: {
    color: colors.textMuted,
    fontSize: fontSize.md,
  },
  stepRow: {
    flexDirection: 'row',
    gap: spacing(1.25),
    alignItems: 'center',
    marginTop: spacing(1),
  },
  stepNumber: {
    color: colors.primary,
    fontSize: fontSize.md,
    fontWeight: '800',
    width: 20,
  },
  stepDone: {
    color: colors.success,
  },
  stepTextWrap: {
    flex: 1,
    gap: 2,
  },
  stepTitle: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  stepDetail: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    lineHeight: 16,
  },
  rowButton: {
    minWidth: 96,
  },
  note: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    lineHeight: 16,
    marginTop: spacing(1),
  },
  safety: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    lineHeight: 18,
    marginTop: spacing(1),
  },
});