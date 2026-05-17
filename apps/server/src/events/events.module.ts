import { Module } from '@nestjs/common';
import { EventsGateway } from './events.gateway.js';
import { MessageRouterModule } from '../message-router/message-router.module.js';
import { ClientRegistryModule } from '../client-registry/client-registry.module.js';
import { AiModule } from '../ai/ai.module.js';

@Module({
  imports: [MessageRouterModule, ClientRegistryModule, AiModule],
  providers: [EventsGateway],
})
export class EventsModule { }
