import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';

import { Banner } from '@/components/Banner';
import { Button } from '@/components/Button';
import { ScreenContainer } from '@/components/ScreenContainer';
import { TrackRow } from '@/components/TrackRow';
import { libraryStore, selectPlaylist } from '@/state/libraryStore';
import { useStore } from '@/state/observable';
import { toUserMessage } from '@/utils/errors';
import { colors, fontSize, spacing } from '@/theme';

export default function PlaylistTracksScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const playlistId = typeof params.id === 'string' ? params.id : undefined;

  const library = useStore(libraryStore);
  const [error, setError] = useState<string | undefined>(undefined);
  const trackMap = library.selectedPlaylistId === playlistId ? library.trackMap : null;

  useEffect(() => {
    if (!playlistId) return;
    if (library.selectedPlaylistId === playlistId && library.trackMap) return;
    void selectPlaylist(playlistId).catch((selectError) => setError(toUserMessage(selectError)));
  }, [playlistId, library.selectedPlaylistId, library.trackMap]);

  const loading = library.tracksLoading || (!trackMap && !error);

  return (
    <ScreenContainer scroll={false}>
      <Text style={styles.title}>{library.selectedPlaylistName ?? 'Playlist'}</Text>
      <Text style={styles.meta}>
        {trackMap ? `${trackMap.entries.length} playable tracks` : 'Loading tracks…'}
      </Text>

      <Banner tone="error" message={error ?? library.tracksError} />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={trackMap?.entries ?? []}
          keyExtractor={(entry) => `${entry.spotifyPosition}-${entry.trackId}`}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            <Text style={styles.hint}>This playlist has no playable tracks.</Text>
          }
          renderItem={({ item }) => (
            <TrackRow
              index={item.displayIndex}
              name={item.name}
              artists={item.artists}
              durationMs={item.durationMs}
            />
          )}
        />
      )}

      <Button
        title="Start Ride Mode"
        onPress={() => router.push('/ride')}
        disabled={!trackMap || trackMap.entries.length === 0}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '700',
  },
  meta: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    marginBottom: spacing(1),
  },
  list: {
    paddingBottom: spacing(2),
  },
  separator: {
    height: spacing(0.75),
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    textAlign: 'center',
    paddingVertical: spacing(2),
  },
});
