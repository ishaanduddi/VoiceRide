import { StyleSheet, Text, View } from 'react-native';

import { Banner } from '@/components/Banner';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ScreenContainer } from '@/components/ScreenContainer';
import { SettingToggle } from '@/components/SettingToggle';
import { isCloudAsrConfigured, isSpotifyConfigured } from '@/config';
import { applyAdaptiveAudioProfile } from '@/services/appServices';
import { useStore } from '@/state/observable';
import { settingsStore, updateSettings } from '@/state/settingsStore';
import { disconnectSpotifyAccount, sessionStore } from '@/state/sessionStore';
import { colors, fontSize, radius, spacing } from '@/theme';

const VOLUME_STEPS = [1, 5, 10];
const CONFIDENCE_OPTIONS: Array<{ label: string; value: number }> = [
  { label: 'Lenient 0.60', value: 0.6 },
  { label: 'Default 0.72', value: 0.72 },
  { label: 'Strict 0.85', value: 0.85 },
];
const PROFILES: Array<{ label: string; value: 'conservative' | 'balanced' | 'aggressive' }> = [
  { label: 'Gentle', value: 'conservative' },
  { label: 'Balanced', value: 'balanced' },
  { label: 'Strong', value: 'aggressive' },
];

export default function SettingsScreen() {
  const settings = useStore(settingsStore);
  const session = useStore(sessionStore);

  return (
    <ScreenContainer>
      <Card title="Feedback">
        <SettingToggle
          label="Spoken confirmations"
          description="Speak a short confirmation after each command."
          value={settings.confirmationSpeechEnabled}
          onValueChange={(value) => void updateSettings({ confirmationSpeechEnabled: value })}
        />
        <SettingToggle
          label="Vibration"
          description="Short buzz when a command is recognised — useful over engine noise."
          value={settings.hapticsEnabled}
          onValueChange={(value) => void updateSettings({ hapticsEnabled: value })}
        />
      </Card>

      <Card title="Command recognition" subtitle="How sure the app must be before it acts.">
        <Segmented
          options={CONFIDENCE_OPTIONS}
          selected={settings.confidenceThreshold}
          onSelect={(value) => void updateSettings({ confidenceThreshold: value })}
        />
        <Text style={styles.note}>
          Below the threshold VoiceRiders asks you to repeat instead of guessing — this is what stops
          "increase volume" from becoming "decrease volume".
        </Text>
      </Card>

      <Card title="Volume step" subtitle="Percentage points per “increase/decrease volume”.">
        <Segmented
          options={VOLUME_STEPS.map((value) => ({ label: `${value}`, value }))}
          selected={settings.volumeStepPercent}
          onSelect={(value) => void updateSettings({ volumeStepPercent: value })}
        />
      </Card>

      <Card
        title="Adaptive Audio Mode"
        subtitle="Volume changes are relative to your current volume, never absolute."
      >
        <SettingToggle
          label="Enabled"
          description="Adjust Spotify volume based on estimated ambient noise."
          value={settings.adaptiveAudioEnabled}
          onValueChange={(value) => void updateSettings({ adaptiveAudioEnabled: value })}
        />
        <Text style={styles.note}>Reaction strength</Text>
        <Segmented
          options={PROFILES}
          selected={settings.adaptiveAudioProfile}
          onSelect={(value) => {
            void updateSettings({ adaptiveAudioProfile: value });
            applyAdaptiveAudioProfile();
          }}
        />
      </Card>

      <Card title="Configuration">
        <Row label="Spotify client id" value={isSpotifyConfigured() ? 'configured' : 'missing'} />
        <Row label="Speech recognition" value={isCloudAsrConfigured() ? 'cloud endpoint set' : 'not configured'} />
        <Row label="Account" value={session.displayName ?? 'not connected'} />
      </Card>

      {session.status === 'connected' ? (
        <Button
          title="Disconnect Spotify"
          variant="danger"
          onPress={() => {
            void disconnectSpotifyAccount();
          }}
        />
      ) : (
        <Banner tone="warning" message="Spotify is not connected. Go back and connect your account." />
      )}

      <Text style={styles.footnote}>VoiceRiders · hands-free Spotify for riders</Text>
    </ScreenContainer>
  );
}

interface SegmentedProps<T extends number | string> {
  options: Array<{ label: string; value: T }>;
  selected: T;
  onSelect: (value: T) => void;
}

function Segmented<T extends number | string>({ options, selected, onSelect }: SegmentedProps<T>) {
  return (
    <View style={styles.segmented}>
      {options.map((option) => {
        const active = option.value === selected;
        return (
          <Button
            key={String(option.value)}
            title={option.label}
            variant={active ? 'primary' : 'secondary'}
            onPress={() => onSelect(option.value)}
            style={styles.segment}
          />
        );
      })}
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  segmented: {
    flexDirection: 'row',
    gap: spacing(0.75),
    marginTop: spacing(0.5),
  },
  segment: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.sm,
  },
  note: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    lineHeight: 16,
    marginTop: spacing(0.5),
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing(0.5),
  },
  rowLabel: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
  },
  rowValue: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  footnote: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    textAlign: 'center',
    marginTop: spacing(1),
  },
});
