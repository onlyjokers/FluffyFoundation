/**
 * Purpose: HTTP endpoints for recorded audio upload and server-side STT transcription.
 */
import {
  BadGatewayException,
  BadRequestException,
  Body,
  Controller,
  NotFoundException,
  PayloadTooLargeException,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { AssetsService } from '../assets/assets.service.js';
import { requireAssetWriteAuth } from '../assets/assets.auth.js';
import { ManagerAuthService } from '../manager-auth/manager-auth.service.js';
import { AliyunSttService } from './aliyun-stt.service.js';

const STT_UPLOAD_TMP_DIR = path.join(os.tmpdir(), 'shugu-stt-upload');
try {
  fs.mkdirSync(STT_UPLOAD_TMP_DIR, { recursive: true });
} catch {
  // ignore
}

type UploadFile = {
  path: string;
  mimetype?: string;
  originalname?: string;
};

function buildPublicBaseUrl(
  req: Pick<Request, 'header' | 'get' | 'protocol'>,
  configuredBaseUrl: string | null
): string {
  if (configuredBaseUrl) return configuredBaseUrl;
  const forwardedProto = req.header('x-forwarded-proto');
  const forwardedHost = req.header('x-forwarded-host');
  const proto = forwardedProto ? forwardedProto.split(',')[0].trim() : req.protocol;
  const host = forwardedHost ? forwardedHost.split(',')[0].trim() : req.get('host');
  return `${proto}://${host}`;
}

@Controller('api/stt')
export class AliyunSttController {
  constructor(
    private readonly stt: AliyunSttService,
    private readonly assets: AssetsService,
    private readonly managerAuth: ManagerAuthService
  ) {}

  @Post('recording-asset')
  @UseInterceptors(
    FileInterceptor('file', {
      dest: STT_UPLOAD_TMP_DIR,
    })
  )
  async uploadRecording(
    @UploadedFile() file: UploadFile | undefined,
    @Req() req: Request
  ): Promise<{
    assetId: string;
    asset: import('../assets/assets.types.js').AssetRecord;
    contentUrl: string;
    deduped: boolean;
  }> {
    requireAssetWriteAuth(req, this.assets.config.writeToken, this.managerAuth);
    if (!file) throw new BadRequestException('missing file');
    const mimeType = typeof file.mimetype === 'string' ? file.mimetype : 'audio/webm';
    try {
      const result = await this.assets.uploadFromTempFile({
        tempPath: file.path,
        mimeType,
        originalName: file.originalname || 'client-recording.webm',
        kind: 'audio',
      });
      const baseUrl = buildPublicBaseUrl(req, this.assets.config.publicBaseUrl);
      return {
        assetId: result.asset.id,
        asset: result.asset,
        contentUrl: `${baseUrl}/api/assets/${result.asset.id}/content`,
        deduped: result.deduped,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.startsWith('asset too large')) throw new PayloadTooLargeException(message);
      throw err;
    }
  }

  @Post('transcribe')
  async transcribe(
    @Body() body: { assetId?: string; model?: string },
    @Req() req: Request
  ): Promise<{ text: string; taskId: string }> {
    requireAssetWriteAuth(req, this.assets.config.writeToken, this.managerAuth);
    const assetId = String(body?.assetId ?? '').trim();
    if (!assetId) throw new BadRequestException('assetId is required');
    const asset = this.assets.getAssetRecord(assetId);
    if (!asset) throw new NotFoundException('asset not found');
    if (asset.kind !== 'audio') throw new BadRequestException('STT asset must be audio');
    const content = this.assets.getContentHeaders(assetId);
    if (!content) throw new NotFoundException('asset content not found');

    try {
      const audioBytes = await fsp.readFile(content.filePath);
      const result = await this.stt.transcribe({
        audioBytes,
        mimeType: content.stored.mimeType || asset.mimeType,
        model: body?.model,
      });
      return { text: result.text, taskId: result.taskId };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('audio bytes') || message.includes('DASHSCOPE_API_KEY')) {
        throw new BadRequestException(message);
      }
      throw new BadGatewayException(message);
    }
  }
}
