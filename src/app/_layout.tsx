import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { bootstrapApp } from '@/services/bootstrap';
import { colors, fontSize } from '@/theme';

export default function RootLayout() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    void bootstrapApp().finally(() => {
      if (mounted) setReady(true);
    });
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />

      {/*
        The navigator is ALWAYS mounted, even while bootstrapping.
        Previously this layout returned a plain <View> until `ready`, which
        crashed the app when a deep link (the OAuth callback) cold-started it:
        Expo Router tries to resolve the incoming URL immediately, and there was
        no mounted navigator to resolve it into. Loading is now an overlay.
      */}
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerTitleStyle: { fontWeight: '700' },
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="connect" options={{ title: 'Connect Spotify' }} />
        <Stack.Screen name="home" options={{ title: 'VoiceRiders' }} />
        <Stack.Screen name="playlists" options={{ title: 'Choose a playlist' }} />
        <Stack.Screen name="playlist/[id]" options={{ title: 'Playlist' }} />
        <Stack.Screen
          name="ride"
          options={{
            title: 'Ride Mode',
            // No accidental back-swipe out of Ride Mode.
            headerBackVisible: false,
            gestureEnabled: false,
          }}
        />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
        <Stack.Screen
          name="spotify-callback"
          options={{
            // The OAuth deep-link landing page; the user should never navigate here.
            headerShown: false,
            gestureEnabled: false,
          }}
        />
      </Stack>

      {!ready ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.loadingText}>VoiceRiders</Text>
        </View>
      ) : null}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    backgroundColor: colors.background,
  },
  loadingText: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '700',
  },
});
