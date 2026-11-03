import { Image, StyleSheet, Text, View } from 'react-native';
import { SellerVideoPlayer } from './SellerVideoPlayer';

export function FoodMediaItem({
  uri,
  type,
  caption,
}: {
  uri: string;
  type?: 'image' | 'video';
  caption?: string | null;
}) {
  return (
    <View style={styles.container}>
      {type === 'video' ? (
        <SellerVideoPlayer uri={uri} label={caption || 'Seller food video'} />
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
