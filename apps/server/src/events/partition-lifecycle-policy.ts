/**
 * Purpose: FF-14 server-side ControlPlane validation for node-executor partition lifecycle commands.
 */
import {
  createControlPlaneActor,
  createPolicyRejectReason,
  validatePartitionLifecycleRequest,
  type ExecutionPartition,
  type MessageWithoutServerTimestamp,
  type ValidationRejectReason,
} from '@shugu/protocol';

export function validatePartitionLifecycleIngress(
  message: MessageWithoutServerTimestamp
): ValidationRejectReason | null {
  if (message.type !== 'plugin' || message.pluginId !== 'node-executor') return null;
  const commandMessage = message as MessageWithoutServerTimestamp & { actor?: string; role?: string };
  const payload = message.payload as Record<string, unknown> | undefined;
  if (!payload || payload.kind !== 'partition-lifecycle') return null;

  const role = commandMessage.role;
  if (role === 'client') {
    return createPolicyRejectReason({
      actor: commandMessage.actor ?? message.from,
      scope: 'server.ingress.control-plane',
      type: message.type,
      path: 'role',
      code: 'control-plane.capability_required',
      message: 'client/display partition lifecycle commands must use ControlPlane transfer authority',
    });
  }

  const partition = partitionFromLifecyclePayload(payload);
  if (!partition) return null;
  const validation = validatePartitionLifecycleRequest({
    operation: resolveLifecycleOperation(payload.operation, message.command),
    partition,
    actor: createControlPlaneActor({
      id: commandMessage.actor ?? message.from,
      role: role === 'root' || role === 'manager' || role === 'service' || role === 'ai' ? role : 'client',
    }),
    availableCapabilities: Array.isArray(payload.availableCapabilities)
      ? payload.availableCapabilities.map(String)
      : undefined,
    currentRevision: typeof payload.currentRevision === 'number' ? payload.currentRevision : undefined,
  });
  if (validation.ok) return null;

  const code = validation.reason.code;
  return createPolicyRejectReason({
    actor: commandMessage.actor ?? message.from,
    scope: 'server.ingress.partition-lifecycle',
    type: message.type,
    path: rejectPathForCode(code),
    code,
    message: validation.reason.message,
  });
}

function resolveLifecycleOperation(value: unknown, command: string) {
  if (value === 'deploy' || value === 'start' || value === 'stop' || value === 'remove' || value === 'redeploy') {
    return value;
  }
  if (command === 'deploy' || command === 'start' || command === 'stop' || command === 'remove') return command;
  return 'redeploy';
}

function rejectPathForCode(code: string): string {
  if (code === 'partition.capability.missing') return 'payload.partition.requiredCapabilities';
  if (code === 'partition.revision_mismatch') return 'payload.partition.boundRevision';
  if (code === 'partition.target.invalid') return 'payload.partition.targetPlatform';
  return 'role';
}

function partitionFromLifecyclePayload(payload: Record<string, unknown>): ExecutionPartition | null {
  if (payload.partition && typeof payload.partition === 'object') return payload.partition as ExecutionPartition;
  if (typeof payload.partitionId === 'string' && payload.partitionId.trim()) {
    return {
      id: payload.partitionId.trim(),
      nodeIds: [],
      targetPlatform: 'manager',
      status: 'stopped',
    };
  }
  return null;
}
