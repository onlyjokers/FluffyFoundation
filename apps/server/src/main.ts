import { type NestApplicationOptions } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import * as fs from 'fs';
import * as path from 'path';
import { loadOptionalEnv } from './bootstrap/load-env.js';

async function bootstrap() {
  const env = loadOptionalEnv();
  if (env.loadedFrom) {
    console.log(`[env] loaded ${env.keys.length} keys from ${env.loadedFrom}`);
  }

  // Check if certificates exist
  const keyCandidates = [
    path.join(process.cwd(), 'secrets/privkey.pem'),
    path.join(process.cwd(), 'secrets/key.pem'),
    path.join(process.cwd(), '../../secrets/privkey.pem'),
    path.join(process.cwd(), '../../secrets/key.pem'),
  ];
  const certCandidates = [
    path.join(process.cwd(), 'secrets/cert.pem'),
    path.join(process.cwd(), '../../secrets/cert.pem'),
  ];
  const keyPath = keyCandidates.find((p) => fs.existsSync(p));
  const certPath = certCandidates.find((p) => fs.existsSync(p));
  let httpsOptions: { key: Buffer; cert: Buffer } | undefined = undefined;

  if (keyPath && certPath) {
    httpsOptions = {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath),
    };
    console.log('🔒 HTTPS enabled');
  } else {
    console.warn('⚠️ No SSL certificates found, falling back to HTTP');
  }

  const appOptions: NestApplicationOptions = {
    cors: {
      origin: '*',
      methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
      credentials: false,
      allowedHeaders: ['Range', 'If-None-Match', 'Content-Type', 'Authorization'],
      exposedHeaders: [
        'Content-Range',
        'Accept-Ranges',
        'ETag',
        'Content-Length',
        'Content-Type',
      ],
    },
  };

  if (httpsOptions) {
    appOptions.httpsOptions = httpsOptions;
  }

  const app = await NestFactory.create(AppModule, appOptions);

  const port = process.env.PORT || 3001;
  const protocol = httpsOptions ? 'https' : 'http';

  const host = process.env.SHUGU_DEV_HOST || '0.0.0.0';
  await app.listen(port, host);
  console.log(`🚀 Server running on ${protocol}://localhost:${port} (host=${host})`);
  console.log(`📡 WebSocket ready for connections`);
}

bootstrap();
