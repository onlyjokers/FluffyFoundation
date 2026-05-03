/**
 * Purpose: Root-only authoring domain store exports for graph editing and project persistence.
 */
import { nodeEngine } from '$lib/nodes';
import { loadLocalProject, saveLocalProject, startAutoSave, stopAutoSave } from '$lib/project/projectManager';
import { publishGroups } from './group-controls';
import { nodeGroupsState } from '$lib/project/nodeGraphUiState';
import type { NodeGroup } from '$lib/components/nodes/node-canvas/controllers/group-controller';

export const rootNodeEngine = nodeEngine;
export { loadLocalProject, saveLocalProject, startAutoSave, stopAutoSave };

export function publishRootGroups(): void {
  let groupsSnapshot: NodeGroup[] = [];
  const unsubscribe = nodeGroupsState.subscribe((groups) => {
    groupsSnapshot = groups;
  });
  unsubscribe();
  publishGroups(
    groupsSnapshot.map((group) => ({
      id: String(group?.id ?? ''),
      name: String(group?.name ?? group?.id ?? ''),
      description: 'Published from Root authoring',
    }))
  );
}
