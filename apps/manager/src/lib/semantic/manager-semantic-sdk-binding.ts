/**
 * Purpose: Bind live ManagerSDK semantic messages to the Manager semantic bridge.
 */

import type { SemanticMessage } from '@shugu/protocol';
import type { ManagerSDK } from '@shugu/sdk-manager';
import type { ManagerSemanticBridge } from './manager-semantic-bridge';

type SemanticSdk = Pick<ManagerSDK, 'onSemanticCommand' | 'sendSemanticResult'>;

export type SemanticSdkBindingTarget = SemanticSdk;

function commandFromMessage(message: SemanticMessage) {
  return message.command as Parameters<ManagerSemanticBridge['dispatch']>[0]['command'];
}

export function bindManagerSemanticSdk(input: {
  sdk: SemanticSdk;
  bridge: ManagerSemanticBridge;
}): () => void {
  return input.sdk.onSemanticCommand((message) => {
    const result = input.bridge.dispatch({
      actor: { id: message.actor, role: message.role === 'manager' ? 'operator' : 'system' },
      command: commandFromMessage(message),
      dryRun: message.dryRun,
    });

    if (result.ok) {
      input.sdk.sendSemanticResult({
        requestId: message.requestId,
        ok: true,
        result: {
          snapshot: result.snapshot,
          audit: result.audit,
        },
        warnings: result.warnings,
        snapshotRevision: result.appliedRevision,
      });
      return;
    }

    input.sdk.sendSemanticResult({
      requestId: message.requestId,
      ok: false,
      error: {
        code: result.validationErrors?.[0]?.code ?? 'SEMANTIC_COMMAND_REJECTED',
        message: result.message,
        path: result.validationErrors?.[0]?.path,
      },
      snapshotRevision: result.appliedRevision,
    });
  });
}
