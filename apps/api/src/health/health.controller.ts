import { Controller, Get } from '@nestjs/common';

@Controller()
export class HealthController {
  @Get('health')
  getHealth() {
    return {
      status: 'ok',
      service: 'afrochef-api',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }
}
