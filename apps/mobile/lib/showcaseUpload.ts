export async function publishShowcaseItems<T, R>(
  items: readonly T[],
  upload: (item: T) => Promise<R>,
  onPublished: (item: T, result: R) => void,
): Promise<void> {
  // Commit each successful upload locally before attempting the next item.
  for (const item of items) {
    const result = await upload(item);
    onPublished(item, result);
  }
}
