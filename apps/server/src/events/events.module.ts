import { Module } from '@nestjs/common';
import { EventsGateway } from './events.gateway.js';
import { MessageRouterModule } from '../message-router/message-router.module.js';
import { ClientControlTransferService } from './client-control-transfer.js';
import { ClientRegistryModule } from '../client-registry/client-registry.module.js';
import { ClientRegistryService } from '../client-registry/client-registry.service.js';

const clientControlTransferProvider = {
  provide: ClientControlTransferService,
  useFactory: (clientRegistry: ClientRegistryService) =>
    new ClientControlTransferService(clientRegistry),
  inject: [ClientRegistryService],
};

@Module({
  imports: [MessageRouterModule, ClientRegistryModule],
  providers: [EventsGateway, clientControlTransferProvider],
})
export class EventsModule { }
