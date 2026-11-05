import { describe, expect, it, vi } from 'vitest';
import { publishShowcaseItems } from './showcaseUpload';

describe('showcase batch publishing', () => {
  it('uploads sequentially and commits each result before starting the next upload', async () => {
    const events: string[] = [];
    let active = 0;
    await publishShowcaseItems(['photo', 'video', 'photo2'], async (item) => {
      expect(active).toBe(0);
      active += 1;
      events.push(`upload:${item}`);
      await Promise.resolve();
      active -= 1;
      return `saved:${item}`;
    }, (item, result) => events.push(`${item}:${result}`));
    expect(events).toEqual([
      'upload:photo', 'photo:saved:photo',
      'upload:video', 'video:saved:video',
      'upload:photo2', 'photo2:saved:photo2',
    ]);
  });

  it('keeps successful posts committed and stops at the failed item so only remaining items are retried', async () => {
    let pending = ['first', 'second', 'third'];
    const published: string[] = [];
    const commit = (item: string, result: string) => {
      published.unshift(result);
      pending = pending.filter((draft) => draft !== item);
    };
    const upload = vi.fn(async (item: string) => {
      if (item === 'second') throw new Error('Storage unavailable');
      return item;
    });
    await expect(publishShowcaseItems(pending, upload, commit)).rejects.toThrow('Storage unavailable');
    expect(published).toEqual(['first']);
    expect(pending).toEqual(['second', 'third']);
    expect(upload.mock.calls).toEqual([['first'], ['second']]);
    await publishShowcaseItems(pending, async (item) => item, commit);
    expect(published).toEqual(['third', 'second', 'first']);
    expect(pending).toEqual([]);
  });

  it('does not commit or drop a selection when the first upload fails', async () => {
    const commit = vi.fn();
    await expect(publishShowcaseItems(['photo'], async () => {
      throw new Error('Upload limit reached');
    }, commit)).rejects.toThrow('Upload limit reached');
    expect(commit).not.toHaveBeenCalled();
  });
});
