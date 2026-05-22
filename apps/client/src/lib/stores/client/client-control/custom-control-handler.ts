/**
 * Purpose: Execute custom client-control payloads that do not belong to core action families.
 */
import { handleClientControlTransferPayload } from '../client-transfer-handler';
import { handlePushImageUpload, type PushImageUploadPayload } from '../client-screenshot';
import type { ClientControlDeps } from './types';
import type { ControlPayload } from '@shugu/protocol';

const isControlPayload = (payload: unknown): payload is ControlPayload =>
  payload !== null && typeof payload === 'object';

export function executeCustomControl(deps: ClientControlDeps, action: string, payload: unknown): boolean {
  switch (action) {
    case 'clientControlTransfer':
      if (isControlPayload(payload)) {
        handleClientControlTransferPayload(payload);
      }
      return true;
    case 'custom': {
      const raw = payload as Partial<PushImageUploadPayload> | null;
      if (raw && typeof raw === 'object' && raw.kind === 'push-image-upload') {
        console.info('[Client] push-image-upload requested', {
          seq: typeof raw.seq === 'number' && Number.isFinite(raw.seq) ? raw.seq : null,
          speed: typeof raw.speed === 'number' && Number.isFinite(raw.speed) ? raw.speed : null,
          format: typeof raw.format === 'string' ? raw.format : null,
          quality: typeof raw.quality === 'number' && Number.isFinite(raw.quality) ? raw.quality : null,
          maxWidth: typeof raw.maxWidth === 'number' && Number.isFinite(raw.maxWidth) ? raw.maxWidth : null,
        });
        void handlePushImageUpload(deps.getSDK(), raw as PushImageUploadPayload);
        return true;
      }
      console.log('[Client] Unknown custom payload:', payload);
      return true;
    }
    default:
      return false;
  }
}
