import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import { fetch as expoFetch } from 'expo/fetch';
import { Platform } from 'react-native';
import { getAccessToken } from './session';

const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
export type SellerVideo = { uri: string; mimeType: string; file?: globalThis.File };

export async function pickSellerVideo(): Promise<SellerVideo | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['videos'],
    allowsEditing: false,
  });
  if (result.canceled) return null;
  return sellerVideoFromAsset(result.assets[0]);
}

export async function pickShowcaseVideos(): Promise<SellerVideo[]> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['videos'],
    allowsMultipleSelection: true,
    selectionLimit: 3,
    orderedSelection: true,
    allowsEditing: false,
  });
  if (result.canceled) return [];
  if (result.assets.length > 3) throw new Error('Choose up to 3 videos at a time.');
  return result.assets.map(sellerVideoFromAsset);
}

function sellerVideoFromAsset(asset: ImagePicker.ImagePickerAsset): SellerVideo {
  if (asset.duration != null && asset.duration > 60_000) {
    throw new Error('Choose a video that is 60 seconds or shorter.');
  }
  if (asset.fileSize != null && asset.fileSize > MAX_VIDEO_BYTES) {
    throw new Error('Choose a smaller video (maximum 50 MB).');
  }
  const mimeType = asset.mimeType || (/\.mov(?:$|\?)/i.test(asset.fileName || asset.uri) ? 'video/quicktime' : 'video/mp4');
  if (!['video/mp4', 'video/quicktime'].includes(mimeType)) {
    throw new Error('Choose an MP4 or MOV video.');
  }
  return { uri: asset.uri, mimeType, file: asset.file };
}

export async function uploadSellerVideo<T>(
  apiBaseUrl: string, _token: string, video: SellerVideo, caption?: string,
): Promise<T> {
  const form = new FormData();
  const file = Platform.OS === 'web'
    ? video.file ?? await (await fetch(video.uri)).blob()
    : new File(video.uri);
  if (!file.size || file.size > MAX_VIDEO_BYTES) {
    throw new Error('Choose a non-empty video up to 50 MB.');
  }
  // The explicit filename preserves the selected container type on Android content URIs.
  form.append('file', file, video.mimeType === 'video/quicktime' ? 'video.mov' : 'video.mp4');
  if (caption) form.append('caption', caption);
  const response = await expoFetch(`${apiBaseUrl}/media/gallery/video`, {
    method: 'POST', headers: { Authorization: `Bearer ${await getAccessToken()}` }, body: form,
  });
  const text = await response.text();
  let result;
  try { result = JSON.parse(text); }
  catch { throw new Error(`Video upload failed (${response.status}). Please try again.`); }
  if (!response.ok) {
    throw new Error(Array.isArray(result.message) ? result.message.join(' ') : result.message ?? `Video upload failed (${response.status}).`);
  }
  return result;
}
