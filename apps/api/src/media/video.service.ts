import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { UploadedPhoto } from './media.service.js';

export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
export const MAX_VIDEO_SECONDS = 60;
const run = promisify(execFile);

type VideoProbe = {
  format?: { duration?: string; format_name?: string };
  streams?: { codec_type?: string; width?: number; height?: number; duration?: string }[];
};

export function validateVideoProbe(probe: VideoProbe) {
  const video = probe.streams?.find((stream) => stream.codec_type === 'video');
  const durations = [probe.format?.duration, ...((probe.streams ?? [])
    .filter((stream) => ['video', 'audio'].includes(stream.codec_type ?? ''))
    .map((stream) => stream.duration))].filter((value) => value !== undefined).map(Number);
  if (!probe.format?.format_name?.split(',').includes('mov') || !video ||
      !video.width || !video.height || !Number.isInteger(video.width) || !Number.isInteger(video.height) ||
      video.width < 2 || video.height < 2 || video.width > 4096 || video.height > 4096 ||
      video.width * video.height > 4096 * 2160 || !durations.length ||
      durations.some((duration) => !Number.isFinite(duration) || duration <= 0)) {
    throw new BadRequestException('Choose a readable MP4 or MOV video, up to 4K resolution.');
  }
  if (Math.max(...durations) > MAX_VIDEO_SECONDS) {
    throw new BadRequestException('Videos must be 60 seconds or shorter.');
  }
}

@Injectable()
export class VideoService {
  private readonly logger = new Logger(VideoService.name);
  private busy = false;

  async prepare(file: UploadedPhoto | undefined): Promise<Buffer> {
    if (!file || !file.buffer.length || file.size > MAX_VIDEO_BYTES ||
        file.buffer.length > MAX_VIDEO_BYTES || !['video/mp4', 'video/quicktime'].includes(file.mimetype)) {
      throw new BadRequestException('Choose an MP4 or MOV video up to 60 seconds and 50 MB.');
    }
    if (this.busy) throw new ServiceUnavailableException('Another video is being processed. Please try again shortly.');
    this.busy = true;
    let directory: string | undefined;
    try {
      directory = await mkdtemp(join(tmpdir(), 'afrochop-video-'));
      const input = join(directory, 'input');
      const output = join(directory, 'output.mp4');
      await writeFile(input, file.buffer);
      const probe = await run('ffprobe', [
        '-v', 'error', '-protocol_whitelist', 'file,pipe',
        '-show_entries', 'format=duration,format_name:stream=codec_type,width,height,duration',
        '-of', 'json', '-f', 'mov', input,
      ], { timeout: 15_000, maxBuffer: 1024 * 1024 });
      validateVideoProbe(JSON.parse(probe.stdout) as VideoProbe);
      await run('ffmpeg', [
        '-nostdin', '-hide_banner', '-loglevel', 'error', '-y',
        '-protocol_whitelist', 'file,pipe', '-threads', '2', '-f', 'mov', '-i', input,
        '-map', '0:v:0', '-map', '0:a:0?', '-map_metadata', '-1', '-map_chapters', '-1',
        '-filter_threads', '1',
        '-vf', "scale=w='min(1280,iw)':h='min(1280,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1",
        '-c:v', 'libx264', '-threads', '2', '-preset', 'veryfast', '-crf', '26',
        '-pix_fmt', 'yuv420p', '-r', '30', '-t', '61', '-c:a', 'aac', '-b:a', '128k',
        '-movflags', '+faststart', '-fs', String(MAX_VIDEO_BYTES + 1024 * 1024), output,
      ], { timeout: 120_000, maxBuffer: 1024 * 1024 });
      const size = (await stat(output)).size;
      if (!size || size > MAX_VIDEO_BYTES) {
        throw new BadRequestException('The processed video is too large. Choose a smaller clip (maximum 50 MB).');
      }
      const processed = await run('ffprobe', [
        '-v', 'error', '-protocol_whitelist', 'file,pipe',
        '-show_entries', 'format=duration,format_name:stream=codec_type,width,height,duration',
        '-of', 'json', '-f', 'mov', output,
      ], { timeout: 15_000, maxBuffer: 1024 * 1024 });
      validateVideoProbe(JSON.parse(processed.stdout) as VideoProbe);
      return await readFile(output);
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error('Seller video processing failed.', error instanceof Error ? error.stack : undefined);
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        throw new ServiceUnavailableException('Video processing is not installed on this API. Please contact support.');
      }
      throw new BadRequestException('This video could not be processed. Choose a readable MP4 or MOV up to 60 seconds and 50 MB.');
    } finally {
      try {
        if (directory) await rm(directory, { recursive: true, force: true });
      } finally {
        this.busy = false;
      }
    }
  }
}
