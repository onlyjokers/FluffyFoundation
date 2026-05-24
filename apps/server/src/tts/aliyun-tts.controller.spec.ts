/**
 * Purpose: Unit tests for Aliyun TTS asset endpoint authorization.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ServiceUnavailableException } from '@nestjs/common';
import type { Request } from 'express';

import { AliyunTtsController } from './aliyun-tts.controller.js';
import type { AliyunTtsService } from './aliyun-tts.service.js';
import type { AssetsService } from '../assets/assets.service.js';
import type { AudioDropBoxService } from '../assets/audio-dropbox.service.js';

test('AliyunTtsController requires asset write auth before generating an audio asset', async () => {
  const tts = {
    synthesizeAsset: async () => {
      throw new Error('tts should not be called without write auth');
    },
  } as unknown as AliyunTtsService;
  const assets = {
    config: { writeToken: null },
  } as unknown as AssetsService;
  const dropBox = {} as unknown as AudioDropBoxService;
  const req = {
    header: () => undefined,
  } as unknown as Request;

  const controller = new AliyunTtsController(tts, assets, dropBox);

  await assert.rejects(
    () => controller.synthesizeAsset({ text: 'hello' }, req),
    ServiceUnavailableException
  );
});
