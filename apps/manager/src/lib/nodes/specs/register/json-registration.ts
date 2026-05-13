/**
 * Purpose: Apply JSON overlays and register manager-only node specs.
 */
import { nodeRegistry } from '../../registry';
import { asRecord } from './helpers';
import { createDefinition } from './definition-factory';
import { loadSpecs } from './spec-loader';
import type { NodeRuntime, NodeSpec } from './types';

export function registerJsonSpecs(): void {
  for (const spec of loadSpecs()) {
    try {
      const type = String(spec.type ?? '');
      if (!type) continue;

      const existing = nodeRegistry.get(type);
      if (existing) {
        nodeRegistry.load({ overlays: [spec] });
        continue;
      }

      // Manager-only node (not in node-core): still defined via JSON runtime.kind (backward-compatible path).
      const runtimeRecord = asRecord(spec.runtime);
      if (!runtimeRecord || typeof runtimeRecord.kind !== 'string') {
        console.warn('[node-specs] missing runtime.kind for manager-only spec:', type);
        continue;
      }
      if (!spec.label || !spec.category) {
        console.warn('[node-specs] missing label/category for manager-only spec:', type);
        continue;
      }

      nodeRegistry.register(createDefinition(spec as NodeSpec & { runtime: NodeRuntime }));
    } catch (err) {
      console.warn('[node-specs] failed to register', spec?.type, err);
    }
  }
}
