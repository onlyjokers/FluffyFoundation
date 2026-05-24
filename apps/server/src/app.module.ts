import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { EventsModule } from './events/events.module.js';
import { ClientRegistryModule } from './client-registry/client-registry.module.js';
import { MessageRouterModule } from './message-router/message-router.module.js';
import { GeoModule } from './geo/geo.module.js';
import { AssetsModule } from './assets/assets.module.js';
import { LocalMediaModule } from './local-media/local-media.module.js';
import { SemanticModule } from './semantic/semantic.module.js';
import { AiModule } from './ai/ai.module.js';
import { AliyunTtsModule } from './tts/aliyun-tts.module.js';
import { PrinterModule } from './printer/printer.module.js';
import { ManagerAuthModule } from './manager-auth/manager-auth.module.js';

@Module({
    imports: [
        EventsModule,
        ClientRegistryModule,
        MessageRouterModule,
        GeoModule,
        AssetsModule,
        LocalMediaModule,
        SemanticModule,
        AiModule,
        AliyunTtsModule,
        PrinterModule,
        ManagerAuthModule,
    ],
    controllers: [AppController],
})
export class AppModule { }
