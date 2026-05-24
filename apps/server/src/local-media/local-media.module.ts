/**
 * Purpose: Nest module wiring for Local Media Service (controller + service).
 */

import { Module } from '@nestjs/common';
import { AssetsModule } from '../assets/assets.module.js';
import { ManagerAuthModule } from '../manager-auth/manager-auth.module.js';
import { LocalMediaController } from './local-media.controller.js';
import { LocalMediaService } from './local-media.service.js';

@Module({
  imports: [AssetsModule, ManagerAuthModule],
  controllers: [LocalMediaController],
  providers: [LocalMediaService],
  exports: [LocalMediaService],
})
export class LocalMediaModule {}
