import { Module } from '@nestjs/common';

import { ControlPlaneService } from './control-plane.service.js';

@Module({
  providers: [ControlPlaneService],
  exports: [ControlPlaneService],
})
export class ControlPlaneModule {}
