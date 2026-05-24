/**
 * Purpose: HTTP API for Manager-local CUPS printer discovery and print submission.
 */
import { Body, Controller, Get, Post } from '@nestjs/common';
import type { PrintPayload } from '@shugu/printer-plugin';
import { PrinterService } from './printer.service.js';

@Controller('api/printers')
export class PrinterController {
  constructor(private readonly printers: PrinterService) {}

  @Get()
  async list(): Promise<{ printers: import('./printer.service.js').PrinterInfo[] }> {
    return { printers: await this.printers.listPrinters() };
  }

  @Post('jobs')
  async submit(@Body() body: unknown): Promise<{ jobId: string | null }> {
    const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
    return await this.printers.submitPrintJob({
      printerId: String(record.printerId ?? ''),
      payload: record.payload as PrintPayload,
    });
  }
}
