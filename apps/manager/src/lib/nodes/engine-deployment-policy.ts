/**
 * Purpose: Manager deployment policy helpers for loop and patch graph export.
 */
import type { GraphState, NodeInstance } from './types';
import { capabilityForNodeType, hashString } from './local-loop-detection';

const LOOP_DEPLOYABLE_NODE_TYPES = new Set([
  'client-loader',
  'client-executor',
  'proc-client-sensors',
  'math',
  'ai-model-ref',
  // Gates
  'logic-not',
  'logic-and',
  'logic-or',
  'logic-nand',
  'logic-nor',
  'logic-xor',
  'tone-lfo',
  'number',
  'string',
  'bool',
  'boolean-to-pulse',
  'pulse-to-boolean',
  'set-boolean-variable',
  'get-boolean-variable',
  'independent-variable-name',
  'boolean-variable',
  'number-variable',
  'string-variable',
  'number-stabilizer',
  'proc-flashlight',
  'proc-show-image',
  'proc-play-video',
  'proc-visual-effects',
  'proc-screen-color',
  'proc-synth-update',
  'proc-scene-switch',
  'tone-osc',
  'tone-delay',
  'tone-resonator',
  'tone-pitch',
  'tone-reverb',
  'tone-granular',
  'play-media',
]);

const PATCH_ROOT_TYPES = ['audio-out', 'scene-out', 'ui-out'] as const;
const PATCH_ROOT_TYPE_SET = new Set<string>(PATCH_ROOT_TYPES);

const PATCH_DEPLOYABLE_NODE_TYPES = new Set([
  // Pure + scheduling
  'math',
  'logic-add',
  'logic-multiple',
  'logic-subtract',
  'logic-divide',
  // Gates
  'logic-not',
  'logic-and',
  'logic-or',
  'logic-nand',
  'logic-nor',
  'logic-xor',
  'logic-if',
  'logic-for',
  'logic-sleep',
  'tone-lfo',
  'number',
  'string',
  'bool',
  'boolean-to-pulse',
  'pulse-to-boolean',
  'set-boolean-variable',
  'get-boolean-variable',
  'independent-variable-name',
  'boolean-variable',
  'number-variable',
  'string-variable',
  'number-stabilizer',
  'group-gate',
  // Audio sources/effects
  'load-audio-from-assets',
  'load-audio-from-local',
  'load-image-from-assets',
  'load-image-from-local',
  'load-video-from-assets',
  'load-video-from-local',
  // Image modulation nodes
  'url-to-qr-generator',
  'img-scale',
  'img-fit',
  'img-xy-offset',
  'img-transparency',
  // Visual effects chain
  'effect-ascii',
  'effect-convolution',
  // Visual scenes chain
  'scene-box',
  'scene-mel',
  'scene-fct-track',
  'scene-front-camera',
  'scene-back-camera',
  // Client UI chain
  'client-button',
  'client-input-box',
  'tone-osc',
  'tone-delay',
  'tone-resonator',
  'tone-pitch',
  'tone-reverb',
  'tone-granular',
  'play-media',
  'proc-show-image',
  'proc-play-video',
  'proc-visual-effects',
  // Generators
  'number-script',
  // Patch root
  ...PATCH_ROOT_TYPES,
  // AI
  'ai-model-ref',
]);

export const isLoopDeployableNodeType = (type: string): boolean =>
  LOOP_DEPLOYABLE_NODE_TYPES.has(String(type));

export const patchRootTypeList = (): readonly (typeof PATCH_ROOT_TYPES)[number][] =>
  PATCH_ROOT_TYPES;

export const isPatchRootType = (type: string): boolean => PATCH_ROOT_TYPE_SET.has(String(type));

export const assertPatchDeployableNodeType = (type: string): void => {
  if (PATCH_DEPLOYABLE_NODE_TYPES.has(String(type))) return;
  const hint =
    type === 'client-loader' || type === 'client-executor'
      ? 'Client Loader and Client Executor are manager-only; screenshots/images must be routed via commands (e.g. Client Executor.Image Out -> Show Image -> Display), not deployed as a patch.'
      : '';
  throw new Error(
    hint
      ? `Patch contains non-deployable node type: ${type}. ${hint}`
      : `Patch contains non-deployable node type: ${type}`
  );
};

export const collectRequiredCapabilities = (nodes: readonly Pick<NodeInstance, 'type'>[]): string[] => {
  const caps = new Set<string>();
  for (const n of nodes) {
    const cap = capabilityForNodeType(String(n.type));
    if (cap) caps.add(cap);
  }
  return Array.from(caps);
};

export const createPatchId = (
  roots: readonly Pick<NodeInstance, 'id' | 'type'>[],
  nodes: readonly Pick<NodeInstance, 'id'>[]
): string => {
  const nodeKey = nodes
    .map((n) => String(n.id))
    .sort()
    .join(',');
  const rootList = roots
    .map((n) => `${String(n.type)}:${String(n.id)}`)
    .sort()
    .join(', ');

  return roots.length === 1
    ? `patch:${String(roots[0]?.type)}:${String(roots[0]?.id)}:${hashString(nodeKey)}`
    : `patch:multi:${hashString(rootList)}:${hashString(nodeKey)}`;
};

export const selectPatchRoots = (snapshot: GraphState): NodeInstance[] => {
  const roots = (snapshot.nodes ?? []).filter((n) => isPatchRootType(String(n.type)));
  if (roots.length === 0) {
    throw new Error(`No patch root node found (${PATCH_ROOT_TYPES.join(', ')}). Add one first.`);
  }

  const connections = snapshot.connections ?? [];
  const activeRoots = roots.filter((root) =>
    connections.some(
      (c) => String(c.sourceNodeId) === String(root.id) && String(c.sourcePortId) === 'cmd'
    )
  );

  if (roots.length === 1) return roots;
  if (activeRoots.length >= 1) return activeRoots;

  const list = roots
    .map((n) => `${String(n.type)}:${String(n.id)}`)
    .sort()
    .join(', ');
  throw new Error(
    `Multiple patch roots found (${list}). Connect Deploy on one or more roots (or delete the others).`
  );
};
