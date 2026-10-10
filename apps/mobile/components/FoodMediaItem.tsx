import { useVideoPlayer, VideoView } from 'expo-video';
import { Image, StyleSheet, Text, View } from 'react-native';

export function FoodMediaItem({
  uri,
  type,
  caption,
}: {
  uri: string;
  type?: 'image' | 'video';
  caption?: string | null;
}) {
  const player = useVideoPlayer(type === 'video' ? uri : null, (videoPlayer) => {
    videoPlayer.loop = false;
  });

  return (
    <View style={styles.container}>
      {type === 'video' ? (
        <VideoView
          accessibilityLabel={caption ?? 'Chef food video'}
          contentFit="cover"
          nativeControls
          player={player}
          style={styles.media}
        />
      ) : (
        <Image
          accessibilityLabel={caption ?? 'Chef food photo'}
          source={{ uri }}
          style={styles.media}
        />
      )}
      {caption ? <Text numberOfLines={2} style={styles.caption}>{caption}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '48%', marginRight: '2%', marginBottom: 8 },
  media: { aspectRatio: 1, backgroundColor: '#E8DED0', borderRadius: 14, width: '100%' },
  caption: { color: '#3A2E22', fontSize: 11, lineHeight: 15, marginTop: 5 },
});
