/**
 * Purpose: Nest module wiring for Asset Service (controller + service).
 */

import { Module, OnModuleInit } from '@nestjs/common';
import { AssetsController } from './assets.controller.js';
import { AudioDropBoxService } from './audio-dropbox.service.js';
import { AssetsService } from './assets.service.js';

@Module({
  controllers: [AssetsController],
  providers: [AssetsService, AudioDropBoxService],
  exports: [AssetsService, AudioDropBoxService],
})
export class AssetsModule implements OnModuleInit {
  constructor(
    private readonly assets: AssetsService,
    private readonly audioDropBox: AudioDropBoxService
  ) {}

  async onModuleInit(): Promise<void> {
    await this.assets.init();
    await this.audioDropBox.init();
    if (!this.assets.config.writeToken) {
      console.warn('[asset-service] ASSET_WRITE_TOKEN not configured; write endpoints will return 503');
    }
  }
}
