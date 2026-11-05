import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Platform } from 'react-native';
import { File } from 'expo-file-system';
import { fetch as expoFetch } from 'expo/fetch';
import { getAccessToken } from './session';

export async function pickProfilePhoto(profile = true): Promise<string | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: profile,
    aspect: [1, 1],
    quality: 1,
  });
  if (result.canceled) return null;
  return prepareSellerPhoto(result.assets[0], profile);
}

export async function pickShowcasePhotos(): Promise<ImagePicker.ImagePickerAsset[]> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    selectionLimit: 10,
    orderedSelection: true,
    allowsEditing: false,
    quality: 1,
  });
  if (result.canceled) return [];
  if (result.assets.length > 10) throw new Error('Choose up to 10 photos at a time.');
  return result.assets;
}

export async function prepareSellerPhoto(asset: ImagePicker.ImagePickerAsset, profile = false): Promise<string> {
  const side = Math.min(asset.width, asset.height);
  const context = ImageManipulator.manipulate(asset.uri);
  if (profile) context.crop({
    originX: Math.floor((asset.width - side) / 2),
    originY: Math.floor((asset.height - side) / 2),
    width: side, height: side,
  }).resize({ width: 640, height: 640 });
  else context.resize(asset.width >= asset.height ? { width: Math.min(asset.width, 1600) } : { height: Math.min(asset.height, 1600) });
  try {
    const image = await context.renderAsync();
    try {
      const saved = await image.saveAsync({ compress: 0.75, format: SaveFormat.JPEG });
      return saved.uri;
    } finally { image.release(); }
  } finally { context.release(); }
}

export async function uploadSellerPhoto<T>(
  apiBaseUrl: string, _token: string, uri: string, profile: boolean, caption?: string,
): Promise<T> {
  const form = new FormData();
  if (Platform.OS === 'web') {
    const blob = await (await fetch(uri)).blob();
    if (blob.size > 2 * 1024 * 1024) throw new Error('Choose a smaller photo (maximum 2 MB).');
    form.append('file', blob, 'photo.jpg');
  } else {
    const file = new File(uri);
    if (file.size > 2 * 1024 * 1024) throw new Error('Choose a smaller photo (maximum 2 MB).');
    form.append('file', file);
  }
  if (caption) form.append('caption', caption);
  const response = await expoFetch(`${apiBaseUrl}/media/${profile ? 'profile-photo' : 'gallery'}`, {
    method: 'POST', headers: { Authorization: `Bearer ${await getAccessToken()}` }, body: form,
  });
  const result = await response.json();
  if (!response.ok) throw new Error(Array.isArray(result.message) ? result.message.join(' ') : result.message ?? `Photo upload failed (${response.status}).`);
  return result;
}

export function uploadProfilePhoto(apiBaseUrl: string, token: string, uri: string) {
  return uploadSellerPhoto<{ profileImageUrl: string }>(apiBaseUrl, token, uri, true);
}
