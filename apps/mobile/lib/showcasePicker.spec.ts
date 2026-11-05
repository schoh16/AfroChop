import { beforeEach, describe, expect, it, vi } from 'vitest';
import { pickShowcasePhotos, prepareSellerPhoto } from './profilePhoto';
import { pickShowcaseVideos } from './sellerVideo';

const mocks = vi.hoisted(() => ({
  picker: vi.fn(),
  resize: vi.fn(),
  render: vi.fn(),
  save: vi.fn(),
  releaseImage: vi.fn(),
  releaseContext: vi.fn(),
}));
vi.mock('expo-image-picker', () => ({ launchImageLibraryAsync: mocks.picker }));
vi.mock('expo-image-manipulator', () => ({
  ImageManipulator: { manipulate: () => ({
    resize: mocks.resize, renderAsync: mocks.render, release: mocks.releaseContext,
  }) },
  SaveFormat: { JPEG: 'jpeg' },
}));
vi.mock('react-native', () => ({ Platform: { OS: 'web' } }));
vi.mock('expo-file-system', () => ({ File: class {} }));
vi.mock('expo/fetch', () => ({ fetch: vi.fn() }));
vi.mock('./session', () => ({ getAccessToken: vi.fn() }));

describe('showcase media selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.save.mockResolvedValue({ uri: 'optimized.jpg' });
    mocks.render.mockResolvedValue({ saveAsync: mocks.save, release: mocks.releaseImage });
  });

  it('supports selecting ten photos without cropping and preserves their selection order', async () => {
    const assets = Array.from({ length: 10 }, (_, index) => ({ uri: `photo-${index}` }));
    mocks.picker.mockResolvedValue({ canceled: false, assets });
    expect(await pickShowcasePhotos()).toEqual(assets);
    expect(mocks.picker).toHaveBeenCalledWith(expect.objectContaining({
      mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: 10,
      orderedSelection: true, allowsEditing: false,
    }));
  });

  it('enforces photo limits even on web where the native selection limit is unavailable', async () => {
    mocks.picker.mockResolvedValue({ canceled: false, assets: Array(11).fill({ uri: 'photo' }) });
    await expect(pickShowcasePhotos()).rejects.toThrow('10 photos');
  });

  it('accepts three videos including the exact duration and size limits', async () => {
    mocks.picker.mockResolvedValue({ canceled: false, assets: [
      { uri: 'one.mp4', mimeType: 'video/mp4', duration: 60_000, fileSize: 50 * 1024 * 1024 },
      { uri: 'two.mov', mimeType: 'video/quicktime' },
      { uri: 'three.mp4', mimeType: 'video/mp4' },
    ] });
    expect(await pickShowcaseVideos()).toHaveLength(3);
    expect(mocks.picker).toHaveBeenCalledWith(expect.objectContaining({ selectionLimit: 3, allowsMultipleSelection: true }));
  });

  it.each([
    [{ uri: 'video.mp4', duration: 60_001 }, '60 seconds'],
    [{ uri: 'video.mp4', fileSize: 50 * 1024 * 1024 + 1 }, '50 MB'],
    [{ uri: 'video.webm', mimeType: 'video/webm' }, 'MP4 or MOV'],
  ])('rejects invalid videos before publishing', async (asset, message) => {
    mocks.picker.mockResolvedValue({ canceled: false, assets: [asset] });
    await expect(pickShowcaseVideos()).rejects.toThrow(message);
  });

  it('rejects batches of more than three videos', async () => {
    mocks.picker.mockResolvedValue({ canceled: false, assets: Array(4).fill({ uri: 'video.mp4' }) });
    await expect(pickShowcaseVideos()).rejects.toThrow('3 videos');
  });

  it('treats canceled photo and video pickers as no selection', async () => {
    mocks.picker.mockResolvedValue({ canceled: true, assets: null });
    expect(await pickShowcasePhotos()).toEqual([]);
    expect(await pickShowcaseVideos()).toEqual([]);
  });

  it('optimizes photos individually and releases native resources', async () => {
    expect(await prepareSellerPhoto({ uri: 'original', width: 4000, height: 3000 })).toBe('optimized.jpg');
    expect(mocks.resize).toHaveBeenCalledWith({ width: 1600 });
    expect(mocks.releaseImage).toHaveBeenCalledOnce();
    expect(mocks.releaseContext).toHaveBeenCalledOnce();
  });

  it('releases native resources if saving an optimized photo fails', async () => {
    mocks.save.mockRejectedValueOnce(new Error('Out of storage'));
    await expect(prepareSellerPhoto({ uri: 'original', width: 1000, height: 2000 })).rejects.toThrow('Out of storage');
    expect(mocks.releaseImage).toHaveBeenCalledOnce();
    expect(mocks.releaseContext).toHaveBeenCalledOnce();
  });
});
