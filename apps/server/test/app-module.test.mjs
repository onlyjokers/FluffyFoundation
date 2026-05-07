/**
 * Purpose: Regression test that the built Nest AppModule can create an application context.
 */
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { NestFactory } from '@nestjs/core';

import { AppModule } from '../dist-out/app.module.js';

test('AppModule creates an application context without provider resolution errors', async () => {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
    abortOnError: false,
  });

  try {
    assert.ok(app);
  } finally {
    await app.close();
  }
});
