import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ScreenContainer } from '@/components/ScreenContainer';
import { sessionStore } from '@/state/sessionStore';
import { useStore } from '@/state/observable';
import { colors, fontSize, spacing } from '@/theme';

const STEPS = [
  'Connect your own Spotify account (OAuth 2.0 + PKCE).',
  'Pick one of your playlists — VoiceRiders numbers its tracks.',
  'Start Ride Mode and keep the phone in your pocket.',
  'Speak commands like "next song" or "play song number seven".',
];

export default function WelcomeScreen() {
  const router = useRouter();
  const session = useStore(sessionStore);
  const connected = session.status === 'connected';

  return (
    <ScreenContainer>
      <View style={styles.hero}>
        <Text style={styles.logo}>VoiceRiders</Text>
        <Text style={styles.tagline}>Hands-free Spotify for riders.</Text>
      </View>

      <Card title="Set up once, then ride" subtitle="Do all of this before you start moving.">
        {STEPS.map((step, index) => (
          <View key={step} style={styles.stepRow}>
            <Text style={styles.stepNumber}>{index + 1}</Text>
            <Text style={styles.stepText}>{step}</Text>
          </View>
        ))}
      </Card>

      <Button
        title={connected ? 'Continue' : 'Connect Spotify'}
        onPress={() => router.push(connected ? '/home' : '/connect')}
      />

      <Text style={styles.safety}>
        Safety first: keep both hands on the bars. Even though VoiceRiders is voice-controlled, only use
        it where it is legal and safe to do so.
      </Text>
    </ScreenContainer>
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
    alignItems: 'flex-start',
    marginTop: spacing(0.75),
  },
  stepNumber: {
    color: colors.primary,
    fontSize: fontSize.md,
    fontWeight: '800',
    width: 18,
  },
  stepText: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  safety: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    lineHeight: 18,
    marginTop: spacing(1),
  },
});
