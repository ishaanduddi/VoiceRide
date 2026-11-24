import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { reloadAsrProvider } from '@/services/appServices';
import { useStore } from '@/state/observable';
import { colors, fontSize, radius, spacing } from '@/theme';
import { downloadModel, formatModelSize, modelStore } from '@/voice/asr';

export interface ModelDownloadCardProps {
  title?: string;
  /** Hide the explanatory paragraph when space is tight. */
  compact?: boolean;
}

/**
 * One-time speech-model download.
 *
 * The model is ~140 MB and is required for on-device recognition, so this card
 * is shown during setup — not hidden in Settings — and Ride Mode refuses to
 * start until it is ready.
 */
export function ModelDownloadCard({ title = 'Speech model', compact = false }: ModelDownloadCardProps) {
  const model = useStore(modelStore);

  const ready = model.state === 'ready';
  const downloading = model.state === 'downloading';
  const progress = Math.max(0, Math.min(100, Math.round(model.progress * 100)));

  const startDownload = async (): Promise<void> => {
    await downloadModel();
    // Immediately swap the ASR provider so the next command uses the model.
    await reloadAsrProvider();
  };

  return (
    <Card
      title={title}
      subtitle={
        ready
          ? 'Installed. Commands are recognised on the phone, even offline.'
          : 'One-time download, about 140 MB. Without it, voice commands cannot work.'
      }
    >
      <View style={styles.statusRow}>
        <Text style={styles.statusLabel}>Status</Text>
        <Text style={[styles.statusValue, ready && styles.ready]}>
          {ready
            ? `Ready${model.sizeBytes ? ` · ${formatModelSize(model.sizeBytes)}` : ''}`
            : downloading
              ? `Downloading ${progress}%`
              : model.state === 'error'
                ? 'Download failed'
                : 'Not downloaded'}
        </Text>
      </View>

      {downloading ? (
        <View
          style={styles.track}
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: 100, now: progress }}
        >
          <View style={[styles.fill, { width: `${progress}%` }]} />
        </View>
      ) : null}

      {model.error ? <Text style={styles.error}>{model.error}</Text> : null}

      <Button
        title={
          ready
            ? 'Speech model ready'
            : downloading
              ? `Downloading… ${progress}%`
              : model.state === 'error'
                ? 'Retry download'
                : 'Download speech model'
        }
        variant={ready ? 'secondary' : 'primary'}
        disabled={ready || downloading}
        loading={downloading}
        onPress={() => void startDownload()}
      />

      {compact ? null : (
        <Text style={styles.note}>
          Keep the app open while it downloads. Afterwards no audio leaves the phone, and recognition
          works without a connection.
        </Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing(0.5),
  },
  statusLabel: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
  },
  statusValue: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  ready: {
    color: colors.success,
  },
  track: {
    height: 6,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    backgroundColor: colors.primary,
  },
  error: {
    color: colors.danger,
    fontSize: fontSize.xs,
    lineHeight: 16,
  },
  note: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    lineHeight: 16,
  },
});