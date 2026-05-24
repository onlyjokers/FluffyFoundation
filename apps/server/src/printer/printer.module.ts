/**
 * Purpose: Nest module wiring for local CUPS printer support.
 */
import { Module } from '@nestjs/common';
import { AssetsModule } from '../assets/assets.module.js';
import { LocalMediaModule } from '../local-media/local-media.module.js';
import { AssetsService } from '../assets/assets.service.js';
import { LocalMediaService } from '../local-media/local-media.service.js';
import { PrinterController } from './printer.controller.js';
import { PrinterService } from './printer.service.js';

@Module({
  imports: [AssetsModule, LocalMediaModule],
  controllers: [PrinterController],
  providers: [
    {
      provide: PrinterService,
      useFactory: (assets: AssetsService, localMedia: LocalMediaService) =>
        new PrinterService(undefined, { assets, localMedia }),
      inject: [AssetsService, LocalMediaService],
    },
  ],
  exports: [PrinterService],
})
export class PrinterModule {}
