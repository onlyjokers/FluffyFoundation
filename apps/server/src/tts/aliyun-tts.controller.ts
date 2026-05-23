/**
 * Purpose: HTTP endpoint for Aliyun TTS synthesis.
 */
import { Body, Controller, Post } from '@nestjs/common';
import { AliyunTtsService, type AliyunTtsRequest } from './aliyun-tts.service.js';

@Controller('api/tts')
export class AliyunTtsController {
  constructor(private readonly tts: AliyunTtsService) {}

  @Post('synthesize')
  async synthesize(@Body() body: AliyunTtsRequest): Promise<{ url: string; mimeType: string; usage: Record<string, unknown> | null }> {
    return await this.tts.synthesize(body ?? { text: '' });
  }
}
