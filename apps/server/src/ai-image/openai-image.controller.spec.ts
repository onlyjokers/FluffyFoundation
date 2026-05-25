/**
 * Purpose: Unit tests for GPT image generation endpoint authorization.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Request } from 'express';

import { OpenAiImageController } from './openai-image.controller.js';
import type { OpenAiImageService } from './openai-image.service.js';
import type { AssetsService } from '../assets/assets.service.js';
import { ManagerAuthService } from '../manager-auth/manager-auth.service.js';

test('OpenAiImageController allows a Manager session to generate an image asset without ASSET_WRITE_TOKEN', async () => {
  let called = false;
  const images = {
    generateAsset: async () => {
      called = true;
      return {
        assetId: 'image-asset-1',
        assetRef: 'asset:image-asset-1',
        asset: { id: 'image-asset-1' },
        usage: null,
      };
    },
  } as unknown as OpenAiImageService;
  const assets = {
    config: { writeToken: null },
  } as unknown as AssetsService;
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

  const controller = new OpenAiImageController(images, assets, managerAuth);

  const result = await controller.generateAsset({ prompt: 'a glass cube' }, req);

  assert.equal(called, true);
  assert.equal(result.assetId, 'image-asset-1');
});
