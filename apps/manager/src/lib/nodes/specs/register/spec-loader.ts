/**
 * Purpose: Load JSON node specs for manager UI overlays and manager-only nodes.
 */
import type { NodeSpec } from './types';

export function loadSpecs(): NodeSpec[] {
  const modules = import.meta.glob('./**/*.json', { eager: true }) as Record<string, { default: unknown }>;
  const specs: NodeSpec[] = [];

  for (const mod of Object.values(modules)) {
    const spec = mod?.default;
    if (!spec || typeof spec !== 'object') continue;
    const type = typeof spec.type === 'string' ? spec.type.trim() : '';
    if (!type) continue;
    specs.push(spec as NodeSpec);
  }

  // Stable order for debugging/determinism.
  specs.sort((a, b) => a.type.localeCompare(b.type));
  return specs;
}
