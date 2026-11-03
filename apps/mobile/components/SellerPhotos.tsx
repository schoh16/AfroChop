import { useCallback, useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { AuthInput, PrimaryButton } from './AuthUi';
import { marketplaceApi } from '../lib/marketplaceApi';
import { pickProfilePhoto, uploadSellerPhoto } from '../lib/profilePhoto';
import { pickSellerVideo, uploadSellerVideo, type SellerVideo } from '../lib/sellerVideo';
import { SellerVideoPlayer } from './SellerVideoPlayer';

export type SellerPhoto = { id: string; imageUrl: string; mediaType?: 'image' | 'video'; caption: string | null };

export function SellerPhotos({ apiBaseUrl, token, profileImageUrl, onProfileChanged }: {
  apiBaseUrl: string;
  token: string;
  profileImageUrl: string | null;
  onProfileChanged: (url: string) => void;
}) {
  const [photos, setPhotos] = useState<SellerPhoto[]>([]);
  const [preview, setPreview] = useState<string | null>(null);
  const [video, setVideo] = useState<SellerVideo | null>(null);
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(
    () => marketplaceApi(apiBaseUrl, token)<SellerPhoto[]>('/media/gallery'), [apiBaseUrl, token],
  );
  useEffect(() => {
    let active = true;
    load().then((items) => { if (active) setPhotos(items); })
      .catch((e: unknown) => { if (active) setError(e instanceof Error ? e.message : 'Could not load your photos.'); });
    return () => { active = false; };
  }, [load]);

  async function run(action: () => Promise<void>) {
    setBusy(true); setError(null); setNotice(null);
    try { await action(); } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your media.');
    } finally { setBusy(false); }
  }

  return <View style={s.container}>
    <Text style={s.heading}>Show customers who you are</Text>
    <Text style={s.text}>Your profile picture, showcase photos, and videos are public. Do not upload private documents or other people without permission.</Text>
    {profileImageUrl ? <Image accessibilityLabel="Your public profile picture" source={{ uri: profileImageUrl }} style={s.avatar} /> : null}
    <PrimaryButton label={profileImageUrl ? 'Change Profile Picture' : 'Add Profile Picture'} loading={busy}
      onPress={() => void run(async () => {
        const uri = await pickProfilePhoto();
        if (!uri) return;
        const result = await uploadSellerPhoto<{ profileImageUrl: string }>(apiBaseUrl, token, uri, true);
        onProfileChanged(result.profileImageUrl);
        setNotice('Your profile picture is now visible to customers.');
      })} />
    <Text style={s.heading}>Showcase Your Work</Text>
    <Text style={s.text}>Share your dishes, harvests, and produce. Videos must be MP4 or MOV, up to 60 seconds and 50 MB. No payout setup is needed to showcase your work.</Text>
    {preview ? <Image accessibilityLabel="Showcase photo preview" source={{ uri: preview }} style={s.photo} /> : null}
    <PrimaryButton label={preview ? 'Choose a Different Photo' : 'Choose a Showcase Photo'} secondary disabled={busy}
      onPress={() => void run(async () => {
        const uri = await pickProfilePhoto(false);
        if (uri) { setPreview(uri); setVideo(null); }
      })} />
    <PrimaryButton label={video ? 'Choose a Different Video' : 'Choose a Showcase Video'} secondary disabled={busy}
      onPress={() => void run(async () => {
        const selected = await pickSellerVideo();
        if (selected) { setVideo(selected); setPreview(null); }
      })} />
    {video ? <SellerVideoPlayer key={video.uri} uri={video.uri} label="Selected showcase video preview" /> : null}
    {preview || video ? <>
      <AuthInput label="Caption (optional)" value={caption} onChangeText={setCaption} maxLength={500} />
      <PrimaryButton label={video ? 'Publish Video' : 'Publish Photo'} loading={busy} onPress={() => void run(async () => {
        if (video) await uploadSellerVideo<SellerPhoto>(apiBaseUrl, token, video, caption.trim());
        else if (preview) await uploadSellerPhoto<SellerPhoto>(apiBaseUrl, token, preview, false, caption.trim());
        setPreview(null); setVideo(null); setCaption(''); setPhotos(await load());
        setNotice('Your media is now on your public profile.');
      })} />
      <PrimaryButton label="Cancel Selection" secondary disabled={busy} onPress={() => {
        setPreview(null); setVideo(null); setCaption('');
      }} />
    </> : null}
    {busy && video ? <Text accessibilityRole="alert" style={s.text}>Uploading and processing video. This may take a couple of minutes; keep the app open.</Text> : null}
    {notice ? <Text accessibilityRole="alert" style={s.text}>{notice}</Text> : null}
    {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
    <SellerGallery photos={photos} disabled={busy} onRemove={(photo) => void run(async () => {
        await marketplaceApi(apiBaseUrl, token)(`/media/gallery/${photo.id}`, { method: 'DELETE' });
        setPhotos(await load()); setNotice('Media removed. Previously cached copies may remain available.');
      })} />
  </View>;
}

export function SellerGallery({ photos, onRemove, disabled }: {
  photos: SellerPhoto[];
  onRemove?: (photo: SellerPhoto) => void;
  disabled?: boolean;
}) {
  return <View style={s.gallery}>{photos.map((photo) => <View key={photo.id} style={s.item}>
    {photo.mediaType === 'video'
      ? <SellerVideoPlayer uri={photo.imageUrl} label={photo.caption || 'Seller showcase video'} />
      : <Image source={{ uri: photo.imageUrl }} accessibilityLabel={photo.caption || 'Seller showcase photo'} style={s.photo} />}
    {photo.caption ? <Text style={s.text}>{photo.caption}</Text> : null}
    {onRemove ? <PrimaryButton label={photo.mediaType === 'video' ? 'Remove Video' : 'Remove Photo'} secondary disabled={disabled} onPress={() => onRemove(photo)} /> : null}
  </View>)}</View>;
}

const s = StyleSheet.create({
  container: { gap: 14, paddingVertical: 16 }, heading: { fontSize: 21, fontWeight: '700', color: '#185A43' },
  text: { fontSize: 16, color: '#3A2E22' }, error: { fontSize: 16, color: '#B84F30' },
  avatar: { width: 128, height: 128, borderRadius: 64, alignSelf: 'center' },
  photo: { width: '100%', height: 220, borderRadius: 16, resizeMode: 'cover' },
  gallery: { gap: 16 }, item: { gap: 8 },
});
