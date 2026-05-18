import { type NestApplicationOptions } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import * as fs from 'fs';
import * as path from 'path';
import { loadOptionalEnv } from './bootstrap/load-env.js';
import {
  createHttpCorsOptions,
  validateServerSecurityConfig,
} from './bootstrap/security-policy.js';
import { shouldUseHttps } from './bootstrap/dev-https.js';
import {
  createStateStrategyConfigFromEnv,
  createStateStrategyStatus,
  validateServerStateStrategyConfig,
} from './bootstrap/state-strategy.js';

async function bootstrap() {
  const env = loadOptionalEnv();
  if (env.loadedFrom) {
    console.log(`[env] loaded ${env.keys.length} keys from ${env.loadedFrom}`);
  }

  // Local dev defaults to HTTP to avoid browser trust failures from self-signed certs.
  // Production still auto-enables certificates; set SHUGU_DEV_HTTPS=1 to opt into local HTTPS.
  const useHttps = shouldUseHttps({
    nodeEnv: process.env.NODE_ENV,
    devHttps: process.env.SHUGU_DEV_HTTPS,
  });
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

  if (useHttps && keyPath && certPath) {
    httpsOptions = {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath),
    };
    console.log('🔒 HTTPS enabled');
  } else if (useHttps) {
    console.warn('⚠️ HTTPS requested but no SSL certificates found, falling back to HTTP (local/dev only)');
  } else {
    console.log('ℹ️ Local dev HTTPS disabled; server using HTTP');
  }

  const securityConfig = {
    nodeEnv: process.env.NODE_ENV,
    managerKey: process.env.SHUGU_MANAGER_KEY,
    allowInsecureManager: process.env.SHUGU_ALLOW_INSECURE_MANAGER,
    corsOrigins: process.env.SHUGU_CORS_ORIGINS,
    hasHttps: Boolean(httpsOptions),
  };
  validateServerSecurityConfig(securityConfig);

  const stateStrategyConfig = createStateStrategyConfigFromEnv();
  validateServerStateStrategyConfig(stateStrategyConfig);
  console.info('[state] active server state strategy', createStateStrategyStatus(stateStrategyConfig));

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
