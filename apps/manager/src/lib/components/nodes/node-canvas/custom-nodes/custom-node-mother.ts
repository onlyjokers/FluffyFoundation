// Purpose: Build Custom Node mother instances that can be reintroduced from Node Manager.
import type { NodeInstance } from '$lib/nodes/types';
import type { CustomNodeDefinition } from '$lib/nodes/custom-nodes/types';
import type { CustomNodeInstanceState } from '$lib/nodes/custom-nodes/instance';
import { cloneInternalGraphForNewInstance } from '$lib/nodes/custom-nodes/instance';
import { normalizeLegacyCustomNodeGraph } from '$lib/nodes/custom-nodes/legacy-migration';

export function createCustomNodeMotherInstance(input: {
  definition: CustomNodeDefinition;
  nodeId: string;
  groupId: string;
  type: string;
  position: { x: number; y: number };
  writeCustomNodeState: (
    config: Record<string, unknown>,
    state: CustomNodeInstanceState
  ) => Record<string, unknown>;
}): NodeInstance {
  const clonedTemplate = cloneInternalGraphForNewInstance(input.definition.template, input.groupId);
  const internal = normalizeLegacyCustomNodeGraph(clonedTemplate);
  const manualGate = true;

  return {
    id: input.nodeId,
    type: input.type,
    position: input.position,
    config: input.writeCustomNodeState({}, {
      definitionId: input.definition.definitionId,
      groupId: input.groupId,
      role: 'mother',
      manualGate,
      internal,
    }),
    inputValues: { gate: manualGate },
    outputValues: {},
  };
}
