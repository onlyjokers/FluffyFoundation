/**
 * Purpose: Nest module wiring for the OpenAI-compatible image generation endpoint.
 */
import { Module } from '@nestjs/common';
import { AssetsModule } from '../assets/assets.module.js';
import { AssetsService } from '../assets/assets.service.js';
import { OpenAiImageController } from './openai-image.controller.js';
import { OpenAiImageService } from './openai-image.service.js';

@Module({
  imports: [AssetsModule],
  controllers: [OpenAiImageController],
  providers: [
    {
      provide: OpenAiImageService,
      useFactory: (assets: AssetsService) => new OpenAiImageService(assets),
      inject: [AssetsService],
    },
  ],
})
export class OpenAiImageModule {}
