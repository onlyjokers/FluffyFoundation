/**
 * Purpose: Verify CUPS printer discovery, print job submission, and image ref resolution helpers.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  PrinterService,
  parseLpstatPrinters,
  type PrinterCommandRunner,
} from './printer.service.js';
import { LocalMediaModule } from '../local-media/local-media.module.js';
import { LocalMediaService } from '../local-media/local-media.service.js';

test('parseLpstatPrinters preserves Chinese printer names and default printer', () => {
  const printers = parseLpstatPrinters(`打印机 打印机_Paperang_C1 闲置，启用时间始于 Fri May 15 22:12:40 2026
printer WanChen_QR_588 is idle. enabled since Wed May 20 23:43:34 2026
system default destination: WanChen_QR_588
系统默认目的位置：打印机_Paperang_C1
`);

  assert.deepEqual(printers, [
    { id: '打印机_Paperang_C1', name: '打印机_Paperang_C1', isDefault: true, status: 'idle' },
    { id: 'WanChen_QR_588', name: 'WanChen_QR_588', isDefault: false, status: 'idle' },
  ]);
});

test('submitPrintJob rejects unknown printer ids', async () => {
  const runner: PrinterCommandRunner = async (command) => {
    if (command === 'lpstat') {
      return { stdout: 'printer Known_Printer is idle. enabled since now\n', stderr: '' };
    }
    throw new Error(`unexpected command ${command}`);
  };
  const service = new PrinterService(runner);

  await assert.rejects(
    () =>
      service.submitPrintJob({
        printerId: 'Missing_Printer',
        payload: { target: 'printer', kind: 'text', nodeId: 'n1', text: 'hello', signature: 'sig' },
      }),
    /unknown printer/
  );
});

test('submitPrintJob invokes lp with safe args and no shell interpolation', async () => {
  const calls: Array<{ command: string; args: string[] }> = [];
  const runner: PrinterCommandRunner = async (command, args) => {
    calls.push({ command, args });
    if (command === 'lpstat') {
      return { stdout: 'printer Safe_Printer is idle. enabled since now\n', stderr: '' };
    }
    return { stdout: 'request id is Safe_Printer-42 (1 file(s))\n', stderr: '' };
  };
  const service = new PrinterService(runner);

  const result = await service.submitPrintJob({
    printerId: 'Safe_Printer',
    payload: { target: 'printer', kind: 'text', nodeId: 'n1', text: 'hello', signature: 'sig' },
  });

  assert.equal(result.jobId, 'Safe_Printer-42');
  assert.equal(calls[1]?.command, 'lp');
  assert.deepEqual(calls[1]?.args.slice(0, 2), ['-d', 'Safe_Printer']);
  assert.ok(calls[1]?.args[2]?.includes('shugu-print-'));
});

test('resolveImageRef writes data image payloads and accepts localfile refs', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'shugu-printer-test-'));
  const localPath = join(tempDir, 'image.png');
  writeFileSync(localPath, Buffer.from([1, 2, 3]));
  const service = new PrinterService(async () => ({ stdout: '', stderr: '' }), { tempDir });

  assert.equal(await service.resolveImageRef(`localfile:${localPath}?kind=image`), localPath);

  const dataPath = await service.resolveImageRef('data:image/png;base64,AQID');
  assert.ok(dataPath.startsWith(tempDir));
  assert.ok(dataPath.endsWith('.png'));
});

test('LocalMediaModule exports LocalMediaService for PrinterModule injection', () => {
  const exportsMetadata = Reflect.getMetadata('exports', LocalMediaModule) as unknown[];
  assert.ok(exportsMetadata.includes(LocalMediaService));
});
