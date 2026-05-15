import { Module } from '@nestjs/common';
import { MessageRouterService } from './message-router.service.js';
import { SemanticModule } from '../semantic/semantic.module.js';

@Module({
    imports: [SemanticModule],
    providers: [MessageRouterService],
    exports: [MessageRouterService],
})
export class MessageRouterModule { }
