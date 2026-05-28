/**
 * Purpose: Nest module for persisted TTS audio asset generation.
 */
import { Module } from '@nestjs/common';
import { AssetsModule } from '../assets/assets.module.js';
import { ManagerAuthModule } from '../manager-auth/manager-auth.module.js';
import { AliyunTtsController } from './aliyun-tts.controller.js';
import { AliyunTtsService } from './aliyun-tts.service.js';
import { AliyunSttController } from './aliyun-stt.controller.js';
import { AliyunSttService } from './aliyun-stt.service.js';

@Module({
  imports: [AssetsModule, ManagerAuthModule],
  controllers: [AliyunTtsController, AliyunSttController],
  providers: [AliyunTtsService, AliyunSttService],
  exports: [AliyunTtsService, AliyunSttService],
})
export class AliyunTtsModule {}
