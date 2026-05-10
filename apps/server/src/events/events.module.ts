import { Module } from '@nestjs/common';
import { EventsGateway } from './events.gateway.js';
import { MessageRouterModule } from '../message-router/message-router.module.js';
import { ClientRegistryModule } from '../client-registry/client-registry.module.js';

@Module({
  imports: [MessageRouterModule, ClientRegistryModule],
  providers: [EventsGateway],
})
export class EventsModule { }
