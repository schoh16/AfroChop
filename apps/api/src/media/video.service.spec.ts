import { describe, expect, it } from 'vitest';
import { MAX_VIDEO_BYTES, VideoService, validateVideoProbe } from './video.service.js';

function probe(duration = '60') {
  return {
    format: { format_name: 'mov,mp4,m4a,3gp,3g2,mj2', duration },
    streams: [{ codec_type: 'video', width: 1920, height: 1080, duration }],
  };
}

describe('video input limits', () => {
  it('accepts a video at exactly the 60 second limit', () => {
    expect(() => validateVideoProbe(probe())).not.toThrow();
  });

  it.each(['60.001', '61', '120'])('rejects duration %s seconds without truncating it', (duration) => {
    expect(() => validateVideoProbe(probe(duration))).toThrow('60 seconds');
  });

  it.each(['0', '-1', 'NaN', 'Infinity', ''])('rejects invalid duration %s', (duration) => {
    expect(() => validateVideoProbe(probe(duration))).toThrow('readable');
  });

  it('uses the longest audio/video duration rather than trusting only the container', () => {
    const data = probe('10');
    data.streams.push({ codec_type: 'audio', width: 0, height: 0, duration: '61' });
    expect(() => validateVideoProbe(data)).toThrow('60 seconds');
  });

  it('rejects audio-only, oversized frames, missing metadata and unsupported containers', () => {
    expect(() => validateVideoProbe({ format: probe().format, streams: [] })).toThrow();
    expect(() => validateVideoProbe({ ...probe(), streams: [{ codec_type: 'video', width: 8000, height: 8000 }] })).toThrow();
    expect(() => validateVideoProbe({})).toThrow();
    expect(() => validateVideoProbe({ ...probe(), format: { format_name: 'hls', duration: '30' } })).toThrow();
  });

  it('rejects empty, incorrect MIME and oversized input before launching processing', async () => {
    const service = new VideoService();
    await expect(service.prepare(undefined)).rejects.toThrow('50 MB');
    await expect(service.prepare({ buffer: Buffer.alloc(0), size: 0, mimetype: 'video/mp4' })).rejects.toThrow('50 MB');
    await expect(service.prepare({ buffer: Buffer.from('x'), size: MAX_VIDEO_BYTES + 1, mimetype: 'video/mp4' })).rejects.toThrow('50 MB');
    await expect(service.prepare({ buffer: Buffer.from('x'), size: 1, mimetype: 'text/html' })).rejects.toThrow('50 MB');
  });
});
