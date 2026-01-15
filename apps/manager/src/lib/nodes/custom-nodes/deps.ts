/**
 * Purpose: Dependency graph utilities for Phase 2.5 Custom Nodes.
 *
 * We must prevent cyclic nesting:
 * - A contains A
 * - A contains B and B contains A
 *
 * Cycles would break expand/compile/flatten and are explicitly disallowed by the plan.
 */
import { readCustomNodeState } from './instance';
import type { CustomNodeDefinition } from './types';
import { asRecord } from '$lib/utils/value-guards';

export function dependenciesForDefinition(definition: CustomNodeDefinition): Set<string> {
  const deps = new Set<string>();
  const nodes = Array.isArray(definition?.template?.nodes) ? definition.template.nodes : [];

  for (const node of nodes) {
    const record = asRecord(node);
    const state = readCustomNodeState(asRecord(record.config));
    if (!state) continue;
    const id = String(state.definitionId ?? '');
    if (id) deps.add(id);
  }

  deps.delete(String(definition.definitionId ?? ''));
  return deps;
}

export function buildDependencyGraph(definitions: CustomNodeDefinition[]): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>();
  for (const def of definitions ?? []) {
    const id = String(def?.definitionId ?? '');
    if (!id) continue;
    graph.set(id, dependenciesForDefinition(def));
  }
  return graph;
}

export function definitionsInCycles(definitions: CustomNodeDefinition[]): Set<string> {
  const graph = buildDependencyGraph(definitions);
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const inCycle = new Set<string>();

  const dfs = (id: string, stack: string[]) => {
    if (visited.has(id)) return;
    if (visiting.has(id)) {
      const idx = stack.indexOf(id);
      const cycle = idx >= 0 ? stack.slice(idx) : [id];
      for (const c of cycle) inCycle.add(String(c));
      return;
    }

    visiting.add(id);
    stack.push(id);

    for (const dep of graph.get(id) ?? []) {
      if (!graph.has(dep)) continue;
      dfs(dep, stack);
    }

    stack.pop();
    visiting.delete(id);
    visited.add(id);
  };

  for (const id of graph.keys()) dfs(id, []);
  return inCycle;
}

export function wouldCreateCycle(definitions: CustomNodeDefinition[], fromId: string, toId: string): boolean {
  const from = String(fromId ?? '');
  const to = String(toId ?? '');
  if (!from || !to) return false;
  if (from === to) return true;

  const graph = buildDependencyGraph(definitions);
  const seen = new Set<string>();
  const stack = [to];

  while (stack.length > 0) {
    const current = String(stack.pop() ?? '');
    if (!current || seen.has(current)) continue;
    seen.add(current);
    if (current === from) return true;
    for (const dep of graph.get(current) ?? []) stack.push(dep);
  }

  return false;
}
