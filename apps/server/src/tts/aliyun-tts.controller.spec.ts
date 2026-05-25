/**
 * Purpose: Unit tests for TTS audio asset endpoint authorization.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Request } from 'express';

import { AliyunTtsController } from './aliyun-tts.controller.js';
import type { AliyunTtsService } from './aliyun-tts.service.js';
import type { AssetsService } from '../assets/assets.service.js';
import type { AudioDropBoxService } from '../assets/audio-dropbox.service.js';
import { ManagerAuthService } from '../manager-auth/manager-auth.service.js';

test('AliyunTtsController allows a Manager session to generate an audio asset without ASSET_WRITE_TOKEN', async () => {
  let called = false;
  const tts = {
    synthesizeAsset: async () => {
      called = true;
      return {
        asset: { id: 'asset-1' },
        deduped: false,
        usage: null,
      };
    },
  } as unknown as AliyunTtsService;
  const assets = {
    config: { writeToken: null },
  } as unknown as AssetsService;
  const dropBox = {
    push: async () => ({ assetId: 'asset-1', name: 'hello', createdAt: 1 }),
  } as unknown as AudioDropBoxService;
  const managerAuth = ManagerAuthService.forTest({
    env: {
      SHUGU_MANAGER_USERS: 'Eureka',
      SHUGU_MANAGER_PASSWORD: 'secret-password',
      SHUGU_MANAGER_SESSION_SECRET: 'session-secret',
    },
    now: () => 1_000,
  });
  const login = managerAuth.login({ username: 'Eureka', password: 'secret-password' });
  assert.equal(login.ok, true);
  const req = {
    header: (name: string) => (name.toLowerCase() === 'cookie' ? login.cookie : undefined),
  } as unknown as Request;

  const controller = new AliyunTtsController(tts, assets, dropBox, managerAuth);

  const result = await controller.synthesizeAsset({ text: 'hello' }, req);

  assert.equal(called, true);
  assert.equal(result.assetId, 'asset-1');
});
