/**
 * Purpose: Asset Service HTTP API (upload + metadata + content with Range/ETag).
 */

import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Head,
  NotFoundException,
  Patch,
  Param,
  PayloadTooLargeException,
  Post,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import type { AssetKind, AssetRecord } from './assets.types.js';
import { AssetsService } from './assets.service.js';
import { requireAssetReadAuth, requireAssetWriteAuth } from './assets.auth.js';
import { parseByteRangeHeader } from './range.js';
import { readAssetServiceConfig } from './assets.config.js';
import { getBodyString } from '../utils/request-utils.js';

const UPLOAD_TMP_DIR = path.join(os.tmpdir(), 'shugu-assets-upload');
try {
  fs.mkdirSync(UPLOAD_TMP_DIR, { recursive: true });
} catch {
  // ignore
}
const MAX_UPLOAD_BYTES = readAssetServiceConfig().maxBytes;

function normalizeEtag(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  // Handle weak etags and quoted values.
  const noWeak = trimmed.startsWith('W/') ? trimmed.slice(2).trim() : trimmed;
  const unquoted = noWeak.replace(/^"(.+)"$/, '$1');
  return unquoted || null;
}

type HeaderRequest = Pick<Request, 'header' | 'get' | 'protocol'> & { query?: unknown; body?: unknown };

type UploadFile = {
  path: string;
  mimetype?: string;
  originalname?: string;
};

function buildPublicBaseUrl(req: HeaderRequest, configuredBaseUrl: string | null): string {
  if (configuredBaseUrl) return configuredBaseUrl;
  const forwardedProto = req.header('x-forwarded-proto');
  const forwardedHost = req.header('x-forwarded-host');
  const proto = forwardedProto ? forwardedProto.split(',')[0].trim() : req.protocol;
  const host = forwardedHost ? forwardedHost.split(',')[0].trim() : req.get('host');
  return `${proto}://${host}`;
}

function toContentDispositionFilename(originalName: string): string {
  const base = path.basename(originalName || '').replace(/[\r\n"]/g, '_');
  // Ensure the quoted filename value is ASCII-only to satisfy Node's header validation.
  const ascii = base.replace(/[^\x20-\x7E]/g, '_').trim();
  return ascii || 'asset';
}

function toContentDispositionFilenameStar(originalName: string): string | null {
  const base = path.basename(originalName || '').replace(/[\r\n"]/g, '_').trim();
  if (!base) return null;
  return `UTF-8''${encodeURIComponent(base)}`;
}

function buildContentDisposition(originalName: string): string {
  const fallback = toContentDispositionFilename(originalName);
  const star = toContentDispositionFilenameStar(originalName);
  if (!star) return `inline; filename="${fallback}"`;
  return `inline; filename="${fallback}"; filename*=${star}`;
}

@Controller('api/assets')
export class AssetsController {
  constructor(private readonly assets: AssetsService) {}

  @Get()
  async list(@Req() req: Request): Promise<{ assets: AssetRecord[] }> {
    requireAssetWriteAuth(req, this.assets.config.writeToken);
    return { assets: this.assets.listAssets() };
  }

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      dest: UPLOAD_TMP_DIR,
      limits: { fileSize: MAX_UPLOAD_BYTES },
    })
  )
  async upload(
    @UploadedFile() file: UploadFile | undefined,
    @Req() req: Request
  ): Promise<{ asset: AssetRecord; contentUrl: string; deduped: boolean }> {
    requireAssetWriteAuth(req, this.assets.config.writeToken);

    if (!file) throw new BadRequestException('missing file');
    const mimeType = typeof file.mimetype === 'string' ? file.mimetype : 'application/octet-stream';
    const originalName =
      getBodyString(req.body, 'originalName') ??
      (typeof file.originalname === 'string' ? file.originalname : 'asset');

    const kindRaw = getBodyString(req.body, 'kind') ?? '';
    const kind: AssetKind | null =
      kindRaw === 'audio' || kindRaw === 'image' || kindRaw === 'video' ? kindRaw : null;

    let result: { asset: AssetRecord; deduped: boolean };
    try {
      result = await this.assets.uploadFromTempFile({
        tempPath: file.path,
        mimeType,
        originalName,
        kind,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.startsWith('asset too large')) {
        throw new PayloadTooLargeException(message);
      }
      throw err;
    }

    const baseUrl = buildPublicBaseUrl(req, this.assets.config.publicBaseUrl);
    const contentUrl = `${baseUrl}/api/assets/${result.asset.id}/content`;
    return { asset: result.asset, contentUrl, deduped: result.deduped };
  }

  @Delete(':id')
  async delete(@Param('id') id: string, @Req() req: Request): Promise<{ deleted: boolean }> {
    requireAssetWriteAuth(req, this.assets.config.writeToken);
    return await this.assets.deleteAsset(id);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: unknown, @Req() req: Request): Promise<{ asset: AssetRecord }> {
    requireAssetWriteAuth(req, this.assets.config.writeToken);
    const asset = await this.assets.updateAsset(id, body ?? {});
    if (!asset) throw new NotFoundException('asset not found');
    return { asset };
  }

  @Get(':id')
  async getMeta(@Param('id') id: string, @Req() req: Request): Promise<AssetRecord> {
    requireAssetReadAuth(req, this.assets.config.readToken);
    const asset = this.assets.getAssetRecord(id);
    if (!asset) throw new NotFoundException('asset not found');
    return asset;
  }

  @Head(':id/content')
  async headContent(
    @Param('id') id: string,
    @Req() req: Request,
    @Res() res: Response
  ): Promise<void> {
    requireAssetReadAuth(req, this.assets.config.readToken);
    const info = this.assets.getContentHeaders(id);
    if (!info) throw new NotFoundException('asset not found');

    const stored = info.stored;
    const filePath = info.filePath;
    const stat = await fsp.stat(filePath).catch(() => null);
    if (!stat || !stat.isFile()) throw new NotFoundException('asset content not found');

    const etag = `"${stored.sha256}"`;
    const ifNoneMatch = normalizeEtag(req.header('if-none-match'));
    if (ifNoneMatch && ifNoneMatch === stored.sha256) {
      res.status(304);
      res.setHeader('ETag', etag);
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.end();
      return;
    }

    res.status(200);
    res.setHeader('Content-Type', stored.mimeType);
    res.setHeader('Content-Length', String(stat.size));
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('Content-Disposition', buildContentDisposition(stored.originalName));
    res.end();
  }

  @Get(':id/content')
  async getContent(
    @Param('id') id: string,
    @Req() req: Request,
    @Res() res: Response
  ): Promise<void> {
    requireAssetReadAuth(req, this.assets.config.readToken);
    const info = this.assets.getContentHeaders(id);
    if (!info) throw new NotFoundException('asset not found');

    const stored = info.stored;
    const filePath = info.filePath;
    const stat = await fsp.stat(filePath).catch(() => null);
    if (!stat || !stat.isFile()) throw new NotFoundException('asset content not found');

    const etag = `"${stored.sha256}"`;
    const ifNoneMatch = normalizeEtag(req.header('if-none-match'));
    if (ifNoneMatch && ifNoneMatch === stored.sha256) {
      res.status(304);
      res.setHeader('ETag', etag);
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.end();
      return;
    }

    const rangeHeader = req.header('range');
    const range = rangeHeader ? parseByteRangeHeader(rangeHeader, stat.size) : null;
    if (rangeHeader && !range) {
      res.status(416);
      res.setHeader('Content-Range', `bytes */${stat.size}`);
      res.end();
      return;
    }

    res.setHeader('Content-Type', stored.mimeType);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('Content-Disposition', buildContentDisposition(stored.originalName));

    if (!range) {
      res.status(200);
      res.setHeader('Content-Length', String(stat.size));
      fs.createReadStream(filePath).pipe(res);
      return;
    }

    if (range.start < 0 || range.end < 0) {
      throw new BadRequestException('invalid range');
    }

    if (range.start >= stat.size) {
      res.status(416);
      res.setHeader('Content-Range', `bytes */${stat.size}`);
      res.end();
      return;
    }

    const start = range.start;
    const end = Math.min(range.end, stat.size - 1);
    const chunkSize = end - start + 1;

    res.status(206);
    res.setHeader('Content-Length', String(chunkSize));
    res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
    fs.createReadStream(filePath, { start, end }).pipe(res);
  }
}
