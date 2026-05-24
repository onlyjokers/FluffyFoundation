/**
 * Purpose: Nest module wiring for Asset Service (controller + service).
 */

import { Module, OnModuleInit } from '@nestjs/common';
import { AssetsController } from './assets.controller.js';
import { AudioDropBoxService } from './audio-dropbox.service.js';
import { AssetsService } from './assets.service.js';
import { ManagerAuthModule } from '../manager-auth/manager-auth.module.js';

@Module({
  imports: [ManagerAuthModule],
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
  }
}
