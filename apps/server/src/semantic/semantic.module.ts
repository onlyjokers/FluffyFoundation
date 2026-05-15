/**
 * Purpose: Server-owned semantic graph authority module.
 */
import { Module } from '@nestjs/common';
import { SemanticGraphAuthorityService } from './semantic-graph-authority.service.js';

@Module({
  providers: [SemanticGraphAuthorityService],
  exports: [SemanticGraphAuthorityService],
})
export class SemanticModule {}
