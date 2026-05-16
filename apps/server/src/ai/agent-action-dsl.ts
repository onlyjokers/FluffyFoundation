/**
 * Purpose: Parse and compile AI-facing action plans into scoped semantic commands.
 */

import { randomUUID } from 'node:crypto';
import type {
  SemanticCommand,
  SemanticDefinition,
  SemanticGraphSnapshot,
  SemanticGroup,
} from '@shugu/node-core';

type JsonRecord = Record<string, unknown>;

export type AgentAction =
  | { op: 'setParam'; nodeId: string; param: string; value: unknown }
  | {
      op: 'addNode';
      nodeType: string;
      id?: string;
      params?: Record<string, unknown>;
    }
  | {
      op: 'connect';
      source: { nodeId: string; port: string };
      target: { nodeId: string; port: string };
      id?: string;
    }
  | { op: 'disconnect'; connectionId: string }
  | { op: 'removeNode'; nodeId: string };

export type AgentActionPlan = {
  version: 1;
  id: string;
  summary?: string;
  actions: AgentAction[];
  requestedSkillIds?: string[];
};

export type AgentPlan = {
  id: string;
  summary?: string;
  commands: SemanticCommand[];
  requestedSkillIds?: string[];
};

export type AgentPlanParseResult =
  | { ok: true; value: AgentActionPlan | AgentPlan; source: 'parsed' | 'content' | 'extracted' }
  | { ok: false; error: string };

export type CompileResult =
  | { ok: true; commands: SemanticCommand[]; warnings: string[] }
  | { ok: false; error: string; path: string; repairOptions: string[] };

const isRecord = (value: unknown): value is JsonRecord =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const stringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.map(String).filter(Boolean) : [];

const normalizeCommandPlan = (value: unknown): AgentPlan | null => {
  if (!isRecord(value) || !Array.isArray(value.commands)) return null;
  const commands = value.commands
    .filter(isRecord)
    .filter((command) => typeof command.type === 'string') as SemanticCommand[];
  if (commands.length === 0) return null;
  return {
    id: String(value.id ?? `ai-turn:${Date.now()}`),
    summary: typeof value.summary === 'string' ? value.summary : undefined,
    commands,
    requestedSkillIds: stringArray(value.requestedSkillIds),
  };
};

const normalizeAction = (value: unknown): AgentAction | null => {
  if (!isRecord(value) || typeof value.op !== 'string') return null;
  if (value.op === 'setParam') {
    if (typeof value.nodeId !== 'string' || typeof value.param !== 'string') return null;
    return { op: 'setParam', nodeId: value.nodeId, param: value.param, value: value.value };
  }
  if (value.op === 'addNode') {
    if (typeof value.nodeType !== 'string') return null;
    return {
      op: 'addNode',
      nodeType: value.nodeType,
      id: typeof value.id === 'string' ? value.id : undefined,
      params: isRecord(value.params) ? value.params : undefined,
    };
  }
  if (value.op === 'connect') {
    if (!isRecord(value.source) || !isRecord(value.target)) return null;
    if (typeof value.source.nodeId !== 'string' || typeof value.source.port !== 'string') return null;
    if (typeof value.target.nodeId !== 'string' || typeof value.target.port !== 'string') return null;
    return {
      op: 'connect',
      source: { nodeId: value.source.nodeId, port: value.source.port },
      target: { nodeId: value.target.nodeId, port: value.target.port },
      id: typeof value.id === 'string' ? value.id : undefined,
    };
  }
  if (value.op === 'disconnect') {
    if (typeof value.connectionId !== 'string') return null;
    return { op: 'disconnect', connectionId: value.connectionId };
  }
  if (value.op === 'removeNode') {
    if (typeof value.nodeId !== 'string') return null;
    return { op: 'removeNode', nodeId: value.nodeId };
  }
  return null;
};

const normalizeActionPlan = (value: unknown): AgentActionPlan | null => {
  if (!isRecord(value) || !Array.isArray(value.actions)) return null;
  const actions = value.actions.map(normalizeAction);
  if (actions.some((action) => action === null)) return null;
  return {
    version: 1,
    id: String(value.id ?? `ai-turn:${Date.now()}`),
    summary: typeof value.summary === 'string' ? value.summary : undefined,
    actions: actions as AgentAction[],
    requestedSkillIds: stringArray(value.requestedSkillIds),
  };
};

const parseJson = (text: string): unknown | null => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

export function extractLastJsonObject(text: string): unknown | null {
  for (let end = text.length - 1; end >= 0; end -= 1) {
    if (text[end] !== '}') continue;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let start = end; start >= 0; start -= 1) {
      const ch = text[start];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (ch === '\\') {
          escaped = true;
        } else if (ch === '"') {
          inString = false;
        }
        continue;
      }
      if (ch === '"') {
        inString = true;
        continue;
      }
      if (ch === '}') depth += 1;
      if (ch === '{') depth -= 1;
      if (depth !== 0) continue;
      const candidate = text.slice(start, end + 1);
      const parsed = parseJson(candidate);
      if (parsed !== null) return parsed;
      break;
    }
  }
  return null;
}

export function parseAgentPlan(parsed: unknown, content: string): AgentPlanParseResult {
  const parsedPlan = normalizeActionPlan(parsed) ?? normalizeCommandPlan(parsed);
  if (parsedPlan) return { ok: true, value: parsedPlan, source: 'parsed' };

  const contentJson = content.trim() ? parseJson(content.trim()) : null;
  const contentPlan = normalizeActionPlan(contentJson) ?? normalizeCommandPlan(contentJson);
  if (contentPlan) return { ok: true, value: contentPlan, source: 'content' };

  const extracted = content.trim() ? extractLastJsonObject(content) : null;
  const extractedPlan = normalizeActionPlan(extracted) ?? normalizeCommandPlan(extracted);
  if (extractedPlan) return { ok: true, value: extractedPlan, source: 'extracted' };

  return { ok: false, error: 'Model output did not contain a valid AgentActionPlan or AgentCommandPlan JSON object.' };
}

const definitionForType = (definitions: SemanticDefinition[], type: string): SemanticDefinition | null =>
  definitions.find((definition) => definition.type === type) ?? null;

const nodeFor = (snapshot: SemanticGraphSnapshot, nodeId: string) =>
  snapshot.nodes.find((node) => String(node.id) === String(nodeId)) ?? null;

const scopedNodeIdsFor = (space: SemanticGroup): Set<string> =>
  new Set([
    ...space.nodeIds.map(String),
    ...(space.agentPolicy?.targetScope?.nodeIds ?? []).map(String),
  ]);

const driverForParam = (
  snapshot: SemanticGraphSnapshot,
  targetNodeId: string,
  targetPortId: string
): string | null => {
  const connection = snapshot.connections.find(
    (item) =>
      String(item.targetNodeId) === targetNodeId && String(item.targetPortId) === targetPortId
  );
  return connection ? String(connection.sourceNodeId) : null;
};

const commandWithDefaultScope = (
  command: SemanticCommand,
  targetSpaceId: string
): SemanticCommand => {
  const scoped =
    command.type.startsWith('node.') &&
    (!('scopeGroupId' in command) ||
      typeof command.scopeGroupId !== 'string' ||
      !command.scopeGroupId.trim())
      ? ({ ...command, scopeGroupId: targetSpaceId } as SemanticCommand)
      : command;

  if (scoped.type !== 'node.add') return scoped;
  return {
    ...scoped,
    node: {
      ...scoped.node,
      position: { x: 0, y: 0 },
    },
  };
};

export function compileAgentPlan(input: {
  plan: AgentActionPlan | AgentPlan;
  snapshot: SemanticGraphSnapshot;
  targetSpace: SemanticGroup;
}): CompileResult {
  if ('commands' in input.plan) {
    return {
      ok: true,
      commands: input.plan.commands.map((command) =>
        commandWithDefaultScope(command, input.targetSpace.id)
      ),
      warnings: [],
    };
  }

  const scopedNodeIds = scopedNodeIdsFor(input.targetSpace);
  const commands: SemanticCommand[] = [];
  const warnings: string[] = [];

  for (const [index, action] of input.plan.actions.entries()) {
    if (action.op === 'setParam') {
      if (!scopedNodeIds.has(action.nodeId)) {
        return {
          ok: false,
          error: `Node is outside target AI Space: ${action.nodeId}`,
          path: `actions.${index}.nodeId`,
          repairOptions: ['Choose a node listed in capabilityManifest.nodes.'],
        };
      }
      const driverNodeId = driverForParam(input.snapshot, action.nodeId, action.param);
      const targetNodeId = driverNodeId ?? action.nodeId;
      commands.push({
        type: 'node.params.update',
        scopeGroupId: input.targetSpace.id,
        nodeId: targetNodeId,
        params: { [driverNodeId ? 'value' : action.param]: action.value },
      });
      if (driverNodeId) {
        warnings.push(`Param ${action.nodeId}.${action.param} is driven by ${driverNodeId}.value.`);
      }
      continue;
    }

    if (action.op === 'addNode') {
      if (input.targetSpace.agentPolicy?.targetScope?.allowNewNodes !== true) {
        return {
          ok: false,
          error: 'AI Space policy does not allow adding nodes.',
          path: `actions.${index}.op`,
          repairOptions: ['Use setParam/connect/disconnect/removeNode on existing nodes.'],
        };
      }
      const definition = definitionForType(input.snapshot.definitions, action.nodeType);
      if (!definition) {
        return {
          ok: false,
          error: `Unknown node type: ${action.nodeType}`,
          path: `actions.${index}.nodeType`,
          repairOptions: ['Choose a nodeType listed in capabilityManifest.nodeTypes.'],
        };
      }
      commands.push({
        type: 'node.add',
        scopeGroupId: input.targetSpace.id,
        node: {
          id: action.id ?? `ai:${action.nodeType}:${randomUUID()}`,
          type: action.nodeType,
          position: { x: 0, y: 0 },
          config: action.params ?? {},
          inputValues: {},
          outputValues: {},
        },
      });
      continue;
    }

    if (action.op === 'connect') {
      if (!scopedNodeIds.has(action.source.nodeId) || !scopedNodeIds.has(action.target.nodeId)) {
        return {
          ok: false,
          error: 'Connection endpoints must both be inside the target AI Space.',
          path: `actions.${index}`,
          repairOptions: ['Choose source and target nodes listed in capabilityManifest.nodes.'],
        };
      }
      commands.push({
        type: 'node.connect',
        scopeGroupId: input.targetSpace.id,
        connection: {
          id: action.id ?? `ai:conn:${randomUUID()}`,
          sourceNodeId: action.source.nodeId,
          sourcePortId: action.source.port,
          targetNodeId: action.target.nodeId,
          targetPortId: action.target.port,
        },
      });
      continue;
    }

    if (action.op === 'disconnect') {
      commands.push({
        type: 'node.disconnect',
        scopeGroupId: input.targetSpace.id,
        connectionId: action.connectionId,
      });
      continue;
    }

    if (action.op === 'removeNode') {
      if (!scopedNodeIds.has(action.nodeId) || !nodeFor(input.snapshot, action.nodeId)) {
        return {
          ok: false,
          error: `Node not found in target AI Space: ${action.nodeId}`,
          path: `actions.${index}.nodeId`,
          repairOptions: ['Choose an existing node listed in capabilityManifest.nodes.'],
        };
      }
      commands.push({ type: 'node.remove', scopeGroupId: input.targetSpace.id, nodeId: action.nodeId });
      continue;
    }

    return {
      ok: false,
      error: 'Unsupported action op.',
      path: `actions.${index}.op`,
      repairOptions: ['Use setParam, addNode, connect, disconnect, or removeNode.'],
    };
  }

  return { ok: true, commands, warnings };
}
