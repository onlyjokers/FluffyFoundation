import { Module } from '@nestjs/common';
import { EventsGateway } from './events.gateway.js';
import { MessageRouterModule } from '../message-router/message-router.module.js';
import { ClientRegistryModule } from '../client-registry/client-registry.module.js';
import { AiModule } from '../ai/ai.module.js';
import { ManagerAuthModule } from '../manager-auth/manager-auth.module.js';

@Module({
  imports: [MessageRouterModule, ClientRegistryModule, AiModule, ManagerAuthModule],
  providers: [EventsGateway],
})
export class EventsModule { }
