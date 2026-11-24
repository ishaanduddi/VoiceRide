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
  const updateAvailable = model.updateAvailable === true;
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
        updateAvailable
          ? 'A newer speech model is available. Updating improves recognition; it replaces the installed file.'
          : ready
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

      {updateAvailable ? (
        <View style={styles.statusRow}>
          <Text style={styles.updateLabel}>New version</Text>
          <Text style={styles.updateValue}>
            {model.remoteSizeBytes ? formatModelSize(model.remoteSizeBytes) : 'available'}
          </Text>
        </View>
      ) : null}

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
          downloading
            ? `Downloading… ${progress}%`
            : updateAvailable
              ? 'Update speech model'
              : ready
                ? 'Speech model ready'
                : model.state === 'error'
                  ? 'Retry download'
                  : 'Download speech model'
        }
        variant={ready && !updateAvailable ? 'secondary' : 'primary'}
        disabled={downloading || (ready && !updateAvailable)}
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
  updateLabel: {
    color: colors.accent,
    fontSize: fontSize.sm,
  },
  updateValue: {
    color: colors.accent,
    fontSize: fontSize.sm,
    fontWeight: '700',
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