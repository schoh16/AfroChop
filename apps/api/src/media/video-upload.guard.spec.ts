import { describe, expect, it } from 'vitest';
import { EventEmitter } from 'node:events';
import type { ExecutionContext } from '@nestjs/common';
import { VideoUploadGuard } from './video-upload.guard.js';

function request() {
  const response = new EventEmitter();
  const context = { switchToHttp: () => ({ getResponse: () => response }) } as ExecutionContext;
  return { response, context };
}

describe('video upload admission limit', () => {
  it('rejects concurrent uploads before reading the second file and releases on completion', () => {
    const guard = new VideoUploadGuard();
    const first = request();
    expect(guard.canActivate(first.context)).toBe(true);
    expect(() => guard.canActivate(request().context)).toThrow('Another video');
    first.response.emit('finish');
    expect(guard.canActivate(request().context)).toBe(true);
    first.response.emit('close');
    expect(() => guard.canActivate(request().context)).toThrow('Another video');
  });

  it('releases admission when the connection closes early', () => {
    const guard = new VideoUploadGuard();
    const first = request();
    guard.canActivate(first.context);
    first.response.emit('close');
    expect(guard.canActivate(request().context)).toBe(true);
  });
});
