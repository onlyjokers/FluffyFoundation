import { Controller, Get } from '@nestjs/common';
import { ClientRegistryService } from './client-registry/client-registry.service.js';
import { AssetsService } from './assets/assets.service.js';

@Controller()
export class AppController {
    constructor(
        private readonly clientRegistry: ClientRegistryService,
        private readonly assets: AssetsService
    ) { }

    @Get('health')
    async health() {
        const assetHealth = await this.assets
            .healthCheck()
            .catch((err) => ({ ok: false, error: err instanceof Error ? err.message : String(err) }));
        return {
            status: assetHealth?.ok ? 'ok' : 'degraded',
            timestamp: Date.now(),
            uptime: process.uptime(),
            assets: assetHealth,
        };
    }

    @Get('clients')
    getClients() {
        return {
            clients: this.clientRegistry.getAllClients(),
            managers: this.clientRegistry.getAllManagers(),
            count: {
                clients: this.clientRegistry.getClientCount(),
                managers: this.clientRegistry.getManagerCount(),
            },
        };
    }

    @Get('time')
    getServerTime() {
        return {
            serverTimestamp: Date.now(),
        };
    }
}
