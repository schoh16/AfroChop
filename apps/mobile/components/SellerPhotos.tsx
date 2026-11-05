import { useCallback, useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { AuthInput, PrimaryButton } from './AuthUi';
import { marketplaceApi } from '../lib/marketplaceApi';
import { pickProfilePhoto, pickShowcasePhotos, prepareSellerPhoto, uploadSellerPhoto } from '../lib/profilePhoto';
import { pickShowcaseVideos, uploadSellerVideo, type SellerVideo } from '../lib/sellerVideo';
import type { ImagePickerAsset } from 'expo-image-picker';
import { publishShowcaseItems } from '../lib/showcaseUpload';
import { SellerVideoPlayer } from './SellerVideoPlayer';

export type SellerPhoto = { id: string; imageUrl: string; mediaType?: 'image' | 'video'; caption: string | null; createdAt?: string };
type Draft = { id: number; caption: string } & (
  { type: 'image'; asset: ImagePickerAsset } | { type: 'video'; video: SellerVideo }
);

export function SellerPhotos({ apiBaseUrl, token, profileImageUrl, onProfileChanged, isProfilePublished = true }: {
  apiBaseUrl: string;
  token: string;
  profileImageUrl: string | null;
  onProfileChanged: (url: string) => void;
  isProfilePublished?: boolean;
}) {
  const [photos, setPhotos] = useState<SellerPhoto[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [progress, setProgress] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(
    () => marketplaceApi(apiBaseUrl, token)<SellerPhoto[]>('/media/gallery'), [apiBaseUrl, token],
  );
  useEffect(() => {
    let active = true;
    load().then((items) => { if (active) setPhotos(items); })
      .catch((e: unknown) => { if (active) setError(e instanceof Error ? e.message : 'Could not load your photos.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [load]);

  async function run(action: () => Promise<void>) {
    setBusy(true); setError(null); setNotice(null);
    try { await action(); } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your media.');
    } finally { setBusy(false); setProgress(null); }
  }

  return <View style={s.container}>
    <Text style={s.heading}>Show customers who you are</Text>
    <Text style={s.text}>
      {isProfilePublished
        ? 'Your profile picture, showcase photos, and videos are public. Do not upload private documents or other people without permission.'
        : 'Your profile picture and showcase posts will appear to customers after AfroChop completes your visit and profile setup. Do not upload private documents or other people without permission.'}
    </Text>
    {profileImageUrl ? <Image accessibilityLabel="Your profile picture" source={{ uri: profileImageUrl }} style={s.avatar} /> : null}
    <PrimaryButton label={profileImageUrl ? 'Change Profile Picture' : 'Add Profile Picture'} loading={busy}
      onPress={() => void run(async () => {
        const uri = await pickProfilePhoto();
        if (!uri) return;
        const result = await uploadSellerPhoto<{ profileImageUrl: string }>(apiBaseUrl, token, uri, true);
        onProfileChanged(result.profileImageUrl);
        setNotice(isProfilePublished
          ? 'Your profile picture is now visible to customers.'
          : 'Your profile picture is saved and will be shown after your profile setup is complete.');
      })} />
    <Text style={s.heading}>Your Food & Farm Feed</Text>
    <Text style={s.text}>Tell your story through dishes, kitchen moments, harvests, and produce. Each photo or video becomes a public post with its own caption. No payout setup is needed.</Text>
    <Text style={s.text}>Select up to 10 photos or 3 videos per batch. Videos must be MP4 or MOV, up to 60 seconds and 50 MB each. Publish as many batches as you like; upload rate limits still apply.</Text>
    <PrimaryButton label="Choose Photos" secondary disabled={busy || drafts.length > 0}
      onPress={() => void run(async () => {
        const assets = await pickShowcasePhotos();
        setDrafts(assets.map((asset, id) => ({ id, type: 'image', asset, caption: '' })));
      })} />
    <PrimaryButton label="Choose Videos" secondary disabled={busy || drafts.length > 0}
      onPress={() => void run(async () => {
        const videos = await pickShowcaseVideos();
        setDrafts(videos.map((video, id) => ({ id, type: 'video', video, caption: '' })));
      })} />
    {drafts.map((draft, index) => <View key={draft.id} style={s.item}>
      <Text style={s.postLabel}>Post {index + 1} of {drafts.length}</Text>
      {draft.type === 'image'
        ? <Image accessibilityLabel={`Selected photo ${index + 1}`} source={{ uri: draft.asset.uri }} style={s.photo} />
        : <SellerVideoPlayer uri={draft.video.uri} label={`Selected video ${index + 1}`} />}
      <AuthInput label={`Caption for post ${index + 1} (optional)`} value={draft.caption}
        placeholder="What are you cooking? Share the story behind it..."
        multiline editable={!busy} maxLength={500}
        onChangeText={(caption) => setDrafts((current) => current.map((item) => item.id === draft.id ? { ...item, caption } : item))} />
      <PrimaryButton label={`Remove Selection ${index + 1}`} secondary disabled={busy}
        onPress={() => setDrafts((current) => current.filter((item) => item.id !== draft.id))} />
    </View>)}
    {drafts.length > 0 ? <>
      <PrimaryButton label={`Publish ${drafts.length} ${drafts.length === 1 ? 'Post' : 'Posts'}`} loading={busy} disabled={loading} onPress={() => void run(async () => {
        let completed = 0;
        try {
          await publishShowcaseItems(drafts, async (draft) => {
            setProgress(`Publishing post ${completed + 1} of ${drafts.length}. Keep the app open while media is processed.`);
            return draft.type === 'video'
              ? uploadSellerVideo<SellerPhoto>(apiBaseUrl, token, draft.video, draft.caption.trim())
              : uploadSellerPhoto<SellerPhoto>(apiBaseUrl, token, await prepareSellerPhoto(draft.asset), false, draft.caption.trim());
          }, (draft, published) => {
            completed += 1;
            setPhotos((current) => [published, ...current]);
            setDrafts((current) => current.filter((item) => item.id !== draft.id));
          });
          setNotice(isProfilePublished
            ? `${completed} ${completed === 1 ? 'post is' : 'posts are'} now on your public profile.`
            : `${completed} ${completed === 1 ? 'post is' : 'posts are'} saved and will appear after your profile setup is complete.`);
        } catch (e) {
          throw new Error(`${completed} of ${drafts.length} posts published. Your remaining selections are ready to retry. ${e instanceof Error ? e.message : 'Upload failed. Please try again.'}`);
        }
      })} />
      <PrimaryButton label="Clear Selections" secondary disabled={busy} onPress={() => setDrafts([])} />
    </> : null}
    {progress ? <Text accessibilityRole="alert" style={s.text}>{progress}</Text> : null}
    {notice ? <Text accessibilityRole="alert" style={s.text}>{notice}</Text> : null}
    {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
    <Text style={s.heading}>Published Posts ({photos.length})</Text>
    {loading ? <Text style={s.text}>Loading your published posts...</Text> : <SellerGallery photos={photos} disabled={busy} onRemove={(photo) => void run(async () => {
        await marketplaceApi(apiBaseUrl, token)(`/media/gallery/${photo.id}`, { method: 'DELETE' });
        setPhotos(await load()); setNotice('Media removed. Previously cached copies may remain available.');
      })} />}
  </View>;
}

export function SellerGallery({ photos, onRemove, disabled }: {
  photos: SellerPhoto[];
  onRemove?: (photo: SellerPhoto) => void;
  disabled?: boolean;
}) {
  const [visible, setVisible] = useState(12);
  return <View style={s.gallery}>
    {photos.length === 0 ? <Text style={s.text}>No posts yet. Photos and videos shared here will appear in this feed.</Text> : null}
    {photos.slice(0, visible).map((photo) => <View key={photo.id} style={s.item}>
    <View style={s.postHeader}>
      <Text style={s.postLabel}>{photo.mediaType === 'video' ? 'VIDEO' : 'PHOTO'}</Text>
      {photo.createdAt ? <Text style={s.date}>{new Date(photo.createdAt).toLocaleDateString()}</Text> : null}
    </View>
    {photo.mediaType === 'video'
      ? <SellerVideoPlayer uri={photo.imageUrl} label={photo.caption || 'Seller showcase video'} />
      : <Image source={{ uri: photo.imageUrl }} accessibilityLabel={photo.caption || 'Seller showcase photo'} style={s.photo} />}
    {photo.caption ? <Text style={s.text}>{photo.caption}</Text> : null}
    {onRemove ? <PrimaryButton label={photo.mediaType === 'video' ? 'Remove Video' : 'Remove Photo'} secondary disabled={disabled} onPress={() => onRemove(photo)} /> : null}
  </View>)}
    {photos.length > visible ? <PrimaryButton secondary label={`Show More Posts (${photos.length - visible} remaining)`}
      onPress={() => setVisible((current) => current + 12)} /> : null}
  </View>;
}

const s = StyleSheet.create({
  container: { gap: 14, paddingVertical: 16 }, heading: { fontSize: 21, fontWeight: '700', color: '#185A43' },
  text: { fontSize: 16, color: '#3A2E22' }, error: { fontSize: 16, color: '#B84F30' },
  avatar: { width: 128, height: 128, borderRadius: 64, alignSelf: 'center' },
  photo: { width: '100%', height: 220, borderRadius: 16, resizeMode: 'cover' },
  gallery: { gap: 16 }, item: { gap: 10, padding: 12, borderRadius: 18, backgroundColor: '#FFF9EF', borderWidth: 1, borderColor: '#E8DED0' },
  postHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  postLabel: { color: '#185A43', fontSize: 13, fontWeight: '700' },
  date: { color: '#756C61', fontSize: 13 },
});
