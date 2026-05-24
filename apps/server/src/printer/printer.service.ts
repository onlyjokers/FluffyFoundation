/**
 * Purpose: CUPS-backed printer discovery and print job submission service.
 */
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { execFile } from 'node:child_process';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';
import type { PrintPayload } from '@shugu/printer-plugin';
import { AssetsService } from '../assets/assets.service.js';
import { LocalMediaService } from '../local-media/local-media.service.js';

const execFileAsync = promisify(execFile);

export type PrinterInfo = {
  id: string;
  name: string;
  isDefault: boolean;
  status: string;
};

export type PrinterCommandRunner = (
  command: string,
  args: string[]
) => Promise<{ stdout: string; stderr: string }>;

type PrinterServiceOptions = {
  tempDir?: string;
  assets?: Pick<AssetsService, 'getContentHeaders'>;
  localMedia?: Pick<LocalMediaService, 'validatePath'>;
};

const defaultRunner: PrinterCommandRunner = async (command, args) => {
  const { stdout, stderr } = await execFileAsync(command, args, { shell: false });
  return { stdout: String(stdout ?? ''), stderr: String(stderr ?? '') };
};

function normalizePrinterName(raw: string): string {
  return raw.trim().replace(/^["']|["']$/g, '');
}

function parseDefaultPrinter(output: string): string | null {
  let found: string | null = null;
  for (const line of output.split(/\r?\n/g)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const english = trimmed.match(/^system default destination:\s*(.+)$/i);
    if (english) {
      found = normalizePrinterName(english[1] ?? '');
      continue;
    }
    const chinese = trimmed.match(/^系统默认目的位置[:：]\s*(.+)$/);
    if (chinese) found = normalizePrinterName(chinese[1] ?? '');
  }
  return found;
}

export function parseLpstatPrinters(output: string): PrinterInfo[] {
  const defaultPrinter = parseDefaultPrinter(output);
  const printers: PrinterInfo[] = [];
  const seen = new Set<string>();

  for (const line of output.split(/\r?\n/g)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const english = trimmed.match(/^printer\s+(\S+)\s+(.+)$/i);
    const chinese = trimmed.match(/^打印机\s+(\S+)\s+(.+)$/);
    const match = english ?? chinese;
    if (!match) continue;
    const id = normalizePrinterName(match[1] ?? '');
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const statusText = String(match[2] ?? '').toLowerCase();
    const status = statusText.includes('idle') || statusText.includes('闲置') ? 'idle' : 'unknown';
    printers.push({
      id,
      name: id,
      isDefault: defaultPrinter === id,
      status,
    });
  }

  return printers;
}

function extensionForMime(mime: string): string {
  const normalized = mime.toLowerCase();
  if (normalized === 'image/jpeg') return '.jpg';
  if (normalized === 'image/webp') return '.webp';
  if (normalized === 'image/gif') return '.gif';
  if (normalized === 'image/svg+xml') return '.svg';
  return '.png';
}

@Injectable()
export class PrinterService {
  private readonly tempDir: string;

  constructor(
    private readonly runner: PrinterCommandRunner = defaultRunner,
    private readonly options: PrinterServiceOptions = {}
  ) {
    this.tempDir = options.tempDir ?? path.join(os.tmpdir(), 'shugu-printer');
  }

  async listPrinters(): Promise<PrinterInfo[]> {
    const result = await this.runner('lpstat', ['-p', '-d']);
    return parseLpstatPrinters(result.stdout);
  }

  async submitPrintJob(input: { printerId: string; payload: PrintPayload }): Promise<{ jobId: string | null }> {
    const printerId = String(input.printerId ?? '').trim();
    if (!printerId) throw new BadRequestException('missing printerId');
    const printers = await this.listPrinters();
    if (!printers.some((printer) => printer.id === printerId)) {
      throw new NotFoundException(`unknown printer: ${printerId}`);
    }

    const filePath =
      input.payload.kind === 'text'
        ? await this.writeTextPayload(input.payload.text)
        : await this.resolveImageRef(input.payload.image);

    const result = await this.runner('lp', ['-d', printerId, filePath]);
    const jobId = result.stdout.match(/request id is\s+(\S+)/i)?.[1] ?? null;
    return { jobId };
  }

  async resolveImageRef(ref: string): Promise<string> {
    const trimmed = String(ref ?? '').trim();
    if (!trimmed) throw new BadRequestException('missing image ref');

    if (trimmed.startsWith('data:image/')) {
      const match = trimmed.match(/^data:(image\/[^;,]+);base64,(.+)$/);
      if (!match) throw new BadRequestException('unsupported data image ref');
      const mime = match[1] ?? 'image/png';
      const data = match[2] ?? '';
      const filePath = await this.tempPath(extensionForMime(mime));
      await fsp.writeFile(filePath, Buffer.from(data, 'base64'));
      return filePath;
    }

    if (trimmed.startsWith('localfile:')) {
      const withoutPrefix = trimmed.slice('localfile:'.length);
      const noHash = withoutPrefix.split('#')[0] ?? '';
      const filePath = noHash.split('?')[0] ?? '';
      if (!filePath) throw new BadRequestException('missing local file path');
      if (this.options.localMedia) {
        const validated = await this.options.localMedia.validatePath(filePath, 'image');
        return validated.realPath;
      }
      return filePath;
    }

    if (trimmed.startsWith('asset:')) {
      const assetId = trimmed.slice('asset:'.length).trim().split(/[?#]/)[0] ?? '';
      if (!assetId) throw new BadRequestException('missing asset id');
      const content = this.options.assets?.getContentHeaders(assetId) ?? null;
      if (!content) throw new NotFoundException(`asset not found: ${assetId}`);
      return content.filePath;
    }

    throw new BadRequestException('unsupported image ref');
  }

  private async writeTextPayload(text: string): Promise<string> {
    const filePath = await this.tempPath('.txt');
    await fsp.writeFile(filePath, String(text ?? ''), 'utf8');
    return filePath;
  }

  private async tempPath(ext: string): Promise<string> {
    await fsp.mkdir(this.tempDir, { recursive: true });
    return path.join(
      this.tempDir,
      `shugu-print-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}${ext}`
    );
  }
}
