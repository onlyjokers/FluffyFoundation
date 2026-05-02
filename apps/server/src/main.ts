import { type NestApplicationOptions } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import * as fs from 'fs';
import * as path from 'path';
import { loadOptionalEnv } from './bootstrap/load-env.js';
import {
  createHttpCorsOptions,
  validateServerSecurityConfig,
} from './bootstrap/security-policy.js';

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
    console.warn('⚠️ No SSL certificates found, falling back to HTTP (local/dev only)');
  }

  const securityConfig = {
    nodeEnv: process.env.NODE_ENV,
    managerKey: process.env.SHUGU_MANAGER_KEY,
    allowInsecureManager: process.env.SHUGU_ALLOW_INSECURE_MANAGER,
    corsOrigins: process.env.SHUGU_CORS_ORIGINS,
    hasHttps: Boolean(httpsOptions),
  };
  validateServerSecurityConfig(securityConfig);

  const appOptions: NestApplicationOptions = {
    cors: createHttpCorsOptions(securityConfig),
  };

  if (httpsOptions) {
    appOptions.httpsOptions = httpsOptions;
  }

  const { AppModule } = await import('./app.module.js');
  const app = await NestFactory.create(AppModule, appOptions);

  const port = process.env.PORT || 3001;
  const protocol = httpsOptions ? 'https' : 'http';

  const host = process.env.SHUGU_DEV_HOST || '0.0.0.0';
  await app.listen(port, host);
  console.log(`🚀 Server running on ${protocol}://localhost:${port} (host=${host})`);
  console.log(`📡 WebSocket ready for connections`);
}

bootstrap();
