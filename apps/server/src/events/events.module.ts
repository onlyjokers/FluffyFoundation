import { Module } from '@nestjs/common';
import { EventsGateway } from './events.gateway.js';
import { MessageRouterModule } from '../message-router/message-router.module.js';
import { ControlPlaneModule } from '../control-plane/control-plane.module.js';

@Module({
  imports: [MessageRouterModule, ControlPlaneModule],
  providers: [EventsGateway],
})
export class EventsModule {}
