/**
 * Purpose: Nest module for Aliyun TTS proxy endpoints.
 */
import { Module } from '@nestjs/common';
import { AliyunTtsController } from './aliyun-tts.controller.js';
import { AliyunTtsService } from './aliyun-tts.service.js';

@Module({
  controllers: [AliyunTtsController],
  providers: [AliyunTtsService],
  exports: [AliyunTtsService],
})
export class AliyunTtsModule {}
