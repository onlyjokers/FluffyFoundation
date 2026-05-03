import { Module } from '@nestjs/common';
import { EventsGateway } from './events.gateway.js';
import { MessageRouterModule } from '../message-router/message-router.module.js';
import { ClientControlTransferService } from './client-control-transfer.js';

@Module({
    imports: [MessageRouterModule],
    providers: [EventsGateway, ClientControlTransferService],
})
export class EventsModule { }
