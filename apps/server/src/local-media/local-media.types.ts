/**
 * Purpose: Local Media types shared between controller and service.
 */

import type { LocalMediaKind } from './local-media.config.js';

export type LocalMediaFile = {
  path: string;
  label: string;
  kind: LocalMediaKind;
  mimeType: string;
  sizeBytes: number;
  modifiedAt: number;
  etag?: string;
};
