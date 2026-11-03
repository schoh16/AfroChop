import { Injectable, ServiceUnavailableException, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { Response } from 'express';

@Injectable()
export class VideoUploadGuard implements CanActivate {
  private busy = false;

  canActivate(context: ExecutionContext) {
    if (this.busy) {
      throw new ServiceUnavailableException('Another video is being uploaded or processed. Please try again shortly.');
    }
    this.busy = true;
    const response = context.switchToHttp().getResponse<Response>();
    const release = () => {
      response.off('finish', release);
      response.off('close', release);
      this.busy = false;
    };
    response.once('finish', release);
    response.once('close', release);
    return true;
  }
}
