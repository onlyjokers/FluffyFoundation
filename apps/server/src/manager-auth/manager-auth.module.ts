/**
 * Purpose: Nest module for Manager login and session authorization.
 */
import { Module } from '@nestjs/common';
import { ManagerAuthController } from './manager-auth.controller.js';
import { ManagerAuthService } from './manager-auth.service.js';

@Module({
  controllers: [ManagerAuthController],
  providers: [ManagerAuthService],
  exports: [ManagerAuthService],
})
export class ManagerAuthModule {}
