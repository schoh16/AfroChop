import { useState } from 'react';
import { useEvent } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { StyleSheet, Text, View } from 'react-native';
import { PrimaryButton } from './AuthUi';

export function SellerVideoPlayer({ uri, label }: { uri: string; label: string }) {
  const [opened, setOpened] = useState(false);
  return <View style={s.container}>
    {opened ? <>
      <OpenedVideo key={uri} uri={uri} label={label} />
      <PrimaryButton label="Close Video" secondary onPress={() => setOpened(false)} />
    </> : <PrimaryButton label={`Watch Video: ${label}`} secondary onPress={() => setOpened(true)} />}
  </View>;
}

function OpenedVideo({ uri, label }: { uri: string; label: string }) {
  const player = useVideoPlayer(uri, (instance) => { instance.loop = false; });
  const { status, error } = useEvent(player, 'statusChange', { status: player.status });
  return <>
    <VideoView accessibilityLabel={label} player={player} nativeControls contentFit="contain" style={s.video} />
    {status === 'loading' ? <Text style={s.text}>Loading video...</Text> : null}
    {error ? <Text accessibilityRole="alert" style={s.error}>Video playback failed. Check your connection and reopen the video.</Text> : null}
  </>;
}

const s = StyleSheet.create({
  container: { gap: 8, width: '100%' },
  video: { width: '100%', height: 220, backgroundColor: '#1C1C1C', borderRadius: 16 },
  text: { color: '#3A2E22', fontSize: 14 },
  error: { color: '#B84F30', fontSize: 14 },
});
