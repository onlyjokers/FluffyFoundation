/**
 * Purpose: HTTP endpoint for OpenAI-compatible image generation into Asset Service.
 */
import { Body, Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { requireAssetWriteAuth } from '../assets/assets.auth.js';
import { AssetsService } from '../assets/assets.service.js';
import {
  OpenAiImageService,
  type OpenAiImageAssetRequest,
  type OpenAiImageAssetResult,
} from './openai-image.service.js';

@Controller('api/ai/image')
export class OpenAiImageController {
  constructor(
    private readonly images: OpenAiImageService,
    private readonly assets: AssetsService
  ) {}

  @Post('asset')
  async generateAsset(
    @Body() body: OpenAiImageAssetRequest,
    @Req() req: Request
  ): Promise<OpenAiImageAssetResult> {
    requireAssetWriteAuth(req, this.assets.config.writeToken);
    return await this.images.generateAsset(body ?? { prompt: '' });
  }
}
