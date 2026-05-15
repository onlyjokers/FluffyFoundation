import { Module } from '@nestjs/common';
import { MessageRouterService } from './message-router.service.js';
import { SemanticModule } from '../semantic/semantic.module.js';
import { AiModule } from '../ai/ai.module.js';

@Module({
    imports: [SemanticModule, AiModule],
    providers: [MessageRouterService],
    exports: [MessageRouterService],
})
export class MessageRouterModule { }
