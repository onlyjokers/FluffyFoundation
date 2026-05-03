import { Controller, Get } from '@nestjs/common';
import { ClientRegistryService } from './client-registry/client-registry.service.js';
import { AssetsService } from './assets/assets.service.js';
import { createControlPlaneSnapshot } from './bootstrap/control-plane-snapshot.js';
import { createStateStrategyConfigFromEnv, createStateStrategyStatus } from './bootstrap/state-strategy.js';

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
            stateStrategy: createStateStrategyStatus(createStateStrategyConfigFromEnv()),
            assets: assetHealth,
        };
    }

    @Get('clients')
    getClients() {
        const clients = this.clientRegistry.getAllClients();
        return {
            clients,
            managers: this.clientRegistry.getAllManagers(),
            stateStrategy: createStateStrategyStatus(createStateStrategyConfigFromEnv()),
            controlPlane: createControlPlaneSnapshot(
                clients,
                this.clientRegistry.getAllGroupOwnershipEntries()
            ),
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
