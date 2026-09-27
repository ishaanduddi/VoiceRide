import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';

import { Banner } from '@/components/Banner';
import { PlaylistRow } from '@/components/PlaylistRow';
import { ScreenContainer } from '@/components/ScreenContainer';
import { isPlaylistReadable } from '@/spotify/playlistUtils';
import { libraryStore, loadPlaylists, selectPlaylist } from '@/state/libraryStore';
import { useStore } from '@/state/observable';
import { toUserMessage } from '@/utils/errors';
import { colors, fontSize, spacing } from '@/theme';

export default function PlaylistsScreen() {
  const router = useRouter();
  const library = useStore(libraryStore);
  const [error, setError] = useState<string | undefined>(undefined);
  const [pendingId, setPendingId] = useState<string | undefined>(undefined);

  useEffect(() => {
    void loadPlaylists().catch((loadError) => setError(toUserMessage(loadError)));
  }, []);

  const handleSelect = async (playlistId: string) => {
    setError(undefined);
    setPendingId(playlistId);
    try {
      await selectPlaylist(playlistId);
      router.push({ pathname: '/playlist/[id]', params: { id: playlistId } });
    } catch (selectError) {
      setError(toUserMessage(selectError));
    } finally {
      setPendingId(undefined);
    }
  };

  return (
    <ScreenContainer scroll={false}>
      <Banner tone="error" message={error ?? library.playlistsError} />

      {library.unreadableCount > 0 ? (
        <Banner
          tone="warning"
          message={
            `Spotify only lets this app read playlists you own or collaborate on, so ` +
            `${library.unreadableCount} of these cannot be used. Create a playlist with your own ` +
            `songs (10-20 tracks is ideal for testing) and pick that one.`
          }
        />
      ) : null}

      {library.playlistsLoading && library.playlists.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.hint}>Loading your playlists…</Text>
        </View>
      ) : (
        <FlatList
          data={library.playlists}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            <Text style={styles.hint}>
              No playlists found. Create one in Spotify, then pull this screen open again.
            </Text>
          }
          renderItem={({ item }) => {
            const unavailable = !isPlaylistReadable(item, library.userId);
            return (
              <PlaylistRow
                playlist={item}
                selected={item.id === library.selectedPlaylistId}
                unavailable={unavailable}
                onPress={() => void handleSelect(item.id)}
              />
            );
          }}
        />
      )}

      {pendingId ? <Text style={styles.hint}>Loading tracks…</Text> : null}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingBottom: spacing(2),
  },
  separator: {
    height: spacing(1),
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing(1),
  },
  hint: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    textAlign: 'center',
    paddingVertical: spacing(2),
  },
});
