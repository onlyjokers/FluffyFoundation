/**
 * Purpose: HTTP endpoint for generating persisted TTS audio assets.
 */
import { BadGatewayException, BadRequestException, Body, Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { AssetsService } from '../assets/assets.service.js';
import { AudioDropBoxService } from '../assets/audio-dropbox.service.js';
import { requireAssetWriteAuth } from '../assets/assets.auth.js';
import { ManagerAuthService } from '../manager-auth/manager-auth.service.js';
import { AliyunTtsService, type AliyunTtsRequest } from './aliyun-tts.service.js';

@Controller('api/tts')
export class AliyunTtsController {
  constructor(
    private readonly tts: AliyunTtsService,
    private readonly assets: AssetsService,
    private readonly audioDropBox: AudioDropBoxService,
    private readonly managerAuth: ManagerAuthService
  ) {}

  @Post('asset')
  async synthesizeAsset(
    @Body() body: AliyunTtsRequest & { dropBoxName?: string },
    @Req() req: Request
  ): Promise<{
    assetId: string;
    asset: import('../assets/assets.types.js').AssetRecord;
    deduped: boolean;
    dropBoxEntry: import('../assets/audio-dropbox.service.js').AudioDropBoxEntry;
    usage: Record<string, unknown> | null;
  }> {
    requireAssetWriteAuth(req, this.assets.config.writeToken, this.managerAuth);
    let result: Awaited<ReturnType<AliyunTtsService['synthesizeAsset']>>;
    try {
      result = await this.tts.synthesizeAsset(body ?? { text: '' }, this.assets);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'TTS text is required') {
        throw new BadRequestException(message);
      }
      throw new BadGatewayException(message);
    }
    const dropBoxEntry = await this.audioDropBox.push({
      assetId: result.asset.id,
      name: body?.dropBoxName ?? body?.text,
    });
    return {
      assetId: result.asset.id,
      asset: result.asset,
      deduped: result.deduped,
      dropBoxEntry,
      usage: result.usage,
    };
  }
}
