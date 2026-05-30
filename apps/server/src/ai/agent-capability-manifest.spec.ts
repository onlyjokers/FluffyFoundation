/**
 * Purpose: Verify AI capability manifests expose createable node types without leaking disabled types or canvas layout.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { buildCapabilityManifest } from './agent-capability-manifest.js';
import { createSemanticGraphSnapshot } from '@shugu/node-core';

test('manifest includes policy-allowed createable node types even when not yet in the AI Space', () => {
  const snapshot = {
    revision: 1,
    nodes: [
      {
        id: 'message',
        type: 'string',
        params: { value: 'hello' },
        inputValues: {},
        outputValues: {},
      },
    ],
    definitions: [
      {
        type: 'string',
        label: 'String',
        category: 'Values',
        ports: { inputs: [], outputs: [{ id: 'value', type: 'string' }] },
        params: [{ key: 'value', type: 'string', defaultValue: '' }],
      },
      {
        type: 'number',
        label: 'Number',
        category: 'Values',
        ports: { inputs: [], outputs: [{ id: 'value', type: 'number' }] },
        params: [{ key: 'value', type: 'number', min: 0, max: 100, defaultValue: 1 }],
      },
      {
        type: 'network-fetch',
        label: 'Network Fetch',
        category: 'Network',
        ports: { inputs: [], outputs: [] },
        params: [],
      },
    ],
    connections: [],
    groups: [],
    runtimeStatus: { running: false, deployedPartitionIds: [] },
    deviceCapabilities: [],
    errors: [],
    permissions: [],
    proposals: [],
  };
  const targetSpace = {
    id: 'ai-space:test',
    parentId: null,
    kind: 'ai-space' as const,
    name: 'Test Space',
    nodeIds: ['message'],
    disabled: false,
    agentPolicy: {
      enabled: true,
      allowedCommands: ['node.add', 'node.params.update'],
      targetScope: {
        nodeIds: ['message'],
        allowNewNodes: true,
        allowedNodeTypes: ['string', 'number'],
        deniedNodeTypes: ['network-fetch'],
      },
    },
  };

  const manifest = buildCapabilityManifest(snapshot as never, targetSpace as never) as {
    nodeTypes: Array<{ type: string }>;
    createableNodeTypes: Array<{ type: string }>;
  };

  assert.deepEqual(
    manifest.nodeTypes.map((definition) => definition.type).sort(),
    ['string']
  );
  assert.deepEqual(
    manifest.createableNodeTypes.map((definition) => definition.type).sort(),
    ['number', 'string']
  );
});

test('manifest exposes normalized full graph permissions for legacy AI Spaces', () => {
  const snapshot = createSemanticGraphSnapshot({
    revision: 1,
    graph: {
      nodes: [
        {
          id: 'message',
          type: 'string',
          position: { x: 0, y: 0 },
          config: { value: 'hello' },
          inputValues: {},
          outputValues: {},
        },
        {
          id: 'display',
          type: 'proc-display-text',
          position: { x: 0, y: 0 },
          config: { text: 'hello' },
          inputValues: {},
          outputValues: {},
        },
      ],
      connections: [],
    },
    definitions: [
      {
        type: 'string',
        label: 'String',
        category: 'Values',
        inputs: [],
        outputs: [{ id: 'value', label: 'Value', type: 'string' }],
        configSchema: [{ key: 'value', label: 'Value', type: 'string', defaultValue: '' }],
      },
      {
        type: 'proc-display-text',
        label: 'Display Text',
        category: 'Processors',
        inputs: [],
        outputs: [{ id: 'cmd', label: 'Cmd', type: 'command' }],
        configSchema: [{ key: 'text', label: 'Text', type: 'string', defaultValue: '' }],
      },
    ],
    groups: [
      {
        id: 'ai-space:legacy',
        parentId: null,
        kind: 'ai-space',
        name: 'Legacy AI Space',
        nodeIds: ['message', 'display'],
        disabled: false,
        agentInterface: {
          exposedNodeIds: ['message'],
          callableCommands: ['node.params.update', 'node.add', 'node.connect', 'node.disconnect'],
        },
        agentPolicy: {
          enabled: true,
          allowedCommands: ['node.params.update', 'node.add', 'node.connect', 'node.disconnect'],
          targetScope: { nodeIds: ['message'], allowNewNodes: true },
        },
      },
    ],
    runtimeStatus: { running: false, deployedPartitionIds: [] },
  });
  const targetSpace = snapshot.groups[0];

  const manifest = buildCapabilityManifest(snapshot, targetSpace) as {
    allowedCommands: string[];
    nodeTypes: Array<{ type: string }>;
  };

  assert.equal(manifest.allowedCommands.includes('node.remove'), true);
  assert.deepEqual(
    manifest.nodeTypes.map((definition) => definition.type).sort(),
    ['proc-display-text', 'string']
  );
});

test('manifest hides node types disabled by agent capability settings', () => {
  const snapshot = {
    revision: 1,
    nodes: [
      {
        id: 'message',
        type: 'string',
        params: { value: 'hello' },
        inputValues: {},
        outputValues: {},
      },
      {
        id: 'count',
        type: 'number',
        params: { value: 1 },
        inputValues: {},
        outputValues: {},
      },
    ],
    definitions: [
      {
        type: 'string',
        label: 'String',
        category: 'Values',
        ports: { inputs: [], outputs: [{ id: 'value', type: 'string' }] },
        params: [{ key: 'value', type: 'string', defaultValue: '' }],
      },
      {
        type: 'number',
        label: 'Number',
        category: 'Values',
        ports: { inputs: [], outputs: [{ id: 'value', type: 'number' }] },
        params: [{ key: 'value', type: 'number', min: 0, max: 100, defaultValue: 1 }],
      },
    ],
    customDefinitions: [],
    agentCapabilities: {
      version: 1,
      nodes: [{ nodeType: 'number', enabled: false, source: 'builtin' }],
    },
    connections: [],
    groups: [],
    runtimeStatus: { running: false, deployedPartitionIds: [] },
    deviceCapabilities: [],
    errors: [],
    permissions: [],
    proposals: [],
  };
  const targetSpace = {
    id: 'ai-space:test',
    parentId: null,
    kind: 'ai-space' as const,
    name: 'Test Space',
    nodeIds: ['message', 'count'],
    disabled: false,
    agentPolicy: {
      enabled: true,
      allowedCommands: ['node.add', 'node.params.update'],
      targetScope: {
        nodeIds: ['message', 'count'],
        allowNewNodes: true,
        allowedNodeTypes: ['string', 'number'],
      },
    },
  };

  const manifest = buildCapabilityManifest(snapshot as never, targetSpace as never) as {
    nodeTypes: Array<{ type: string }>;
    createableNodeTypes: Array<{ type: string }>;
    disabledNodeTypes: Array<{ type: string; reason?: string }>;
  };

  assert.deepEqual(manifest.nodeTypes.map((definition) => definition.type), ['string']);
  assert.deepEqual(manifest.createableNodeTypes.map((definition) => definition.type), ['string']);
  assert.deepEqual(manifest.disabledNodeTypes, [{ type: 'number' }]);
});

test('manifest exposes connectable config inputs with option metadata', () => {
  const snapshot = {
    revision: 1,
    nodes: [
      {
        id: 'scene',
        type: 'scene-fct-track',
        params: { variant: 'shattered-reality' },
        inputValues: {},
        outputValues: {},
      },
    ],
    definitions: [
      {
        type: 'scene-fct-track',
        label: 'Scene FCT Track',
        category: 'Scene',
        ports: {
          inputs: [
            { id: 'in', label: 'In', type: 'scene' },
            {
              id: 'variant',
              label: 'Variant',
              type: 'string',
              defaultValue: 'shattered-reality',
              options: [
                { value: 'shattered-reality', label: 'Shattered Reality' },
                { value: 'acab', label: 'ACAB' },
              ],
            },
          ],
          outputs: [{ id: 'out', label: 'Out', type: 'scene' }],
        },
        params: [
          {
            key: 'variant',
            label: 'Variant',
            type: 'select',
            defaultValue: 'shattered-reality',
            connectable: true,
            options: [
              { value: 'shattered-reality', label: 'Shattered Reality' },
              { value: 'acab', label: 'ACAB' },
            ],
          },
        ],
      },
    ],
    customDefinitions: [],
    agentCapabilities: { version: 1, nodes: [] },
    connections: [],
    groups: [],
    runtimeStatus: { running: false, deployedPartitionIds: [] },
    deviceCapabilities: [],
    errors: [],
    permissions: [],
    proposals: [],
  };
  const targetSpace = {
    id: 'ai-space:test',
    parentId: null,
    kind: 'ai-space' as const,
    name: 'Test Space',
    nodeIds: ['scene'],
    disabled: false,
    agentPolicy: {
      enabled: true,
      allowedCommands: ['node.connect', 'node.inputs.update'],
      targetScope: { nodeIds: ['scene'] },
    },
  };

  const manifest = buildCapabilityManifest(snapshot as never, targetSpace as never) as {
    nodeTypes: Array<{ type: string; ports: { inputs: Array<Record<string, unknown>> } }>;
  };

  assert.deepEqual(
    manifest.nodeTypes[0].ports.inputs.find((input) => input.id === 'variant')?.options,
    [
      { value: 'shattered-reality', label: 'Shattered Reality' },
      { value: 'acab', label: 'ACAB' },
    ]
  );
});

test('manifest exposes custom node AI Note manual hints through the standard aiSummary', () => {
  const snapshot = {
    revision: 1,
    nodes: [
      {
        id: 'guided',
        type: 'custom:guided',
        params: {},
        inputValues: {},
        outputValues: {},
      },
    ],
    definitions: [
      {
        type: 'custom:guided',
        label: 'Guided',
        category: 'Custom',
        ports: { inputs: [], outputs: [] },
        params: [],
        aiSummary: {
          type: 'custom:guided',
          label: 'Guided',
          version: '1.0.0',
          category: 'Custom',
          description: 'Generated custom node.\n\nUse this custom node to hide shared buttons.',
          platforms: ['manager', 'client', 'display'],
          permissions: ['graph:state'],
          ports: { inputs: [], outputs: [] },
          params: [],
          compatibility: [{ target: 'custom-node-manual', rule: 'Works with Client Button.' }],
          examples: [{ title: 'Guided AI note example', summary: 'Connect Pressed to trigger.' }],
          repairHints: ['Check variable names.'],
        },
      },
    ],
    customDefinitions: [],
    agentCapabilities: { version: 1, nodes: [] },
    connections: [],
    groups: [],
    runtimeStatus: { running: false, deployedPartitionIds: [] },
    deviceCapabilities: [],
    errors: [],
    permissions: [],
    proposals: [],
  };
  const targetSpace = {
    id: 'ai-space:test',
    parentId: null,
    kind: 'ai-space' as const,
    name: 'Test Space',
    nodeIds: ['guided'],
    disabled: false,
    agentPolicy: {
      enabled: true,
      allowedCommands: ['node.params.update'],
      targetScope: { nodeIds: ['guided'] },
    },
  };

  const manifest = buildCapabilityManifest(snapshot as never, targetSpace as never) as {
    nodeTypes: Array<{
      aiSummary?: {
        description?: string;
        compatibility?: Array<{ rule: string }>;
        examples?: Array<{ summary: string }>;
        repairHints?: string[];
      };
    }>;
  };

  const summary = manifest.nodeTypes[0].aiSummary;
  assert.match(summary?.description ?? '', /hide shared buttons/);
  assert.equal(summary?.compatibility?.[0]?.rule, 'Works with Client Button.');
  assert.equal(summary?.examples?.[0]?.summary, 'Connect Pressed to trigger.');
  assert.deepEqual(summary?.repairHints, ['Check variable names.']);
});

test('manifest exposes GPT image generation ports for agent-created image chains', () => {
  const snapshot = {
    revision: 1,
    nodes: [],
    definitions: [
      {
        type: 'gpt-image-gen',
        label: 'GPT Image Gen',
        category: 'AI',
        ports: {
          inputs: [
            { id: 'prompt', label: 'Prompt', type: 'string' },
            { id: 'image', label: 'Image', type: 'image' },
            { id: 'trigger', label: 'Generate', type: 'boolean', defaultValue: false },
          ],
          outputs: [
            { id: 'image', label: 'Image', type: 'image' },
            { id: 'assetId', label: 'Asset ID', type: 'string' },
          ],
        },
        params: [
          { key: 'model', label: 'Model', type: 'string', defaultValue: 'gpt-image-2' },
          {
            key: 'quality',
            label: 'Quality',
            type: 'select',
            defaultValue: 'low',
            options: [
              { value: 'low', label: 'Low' },
              { value: 'medium', label: 'Medium' },
              { value: 'high', label: 'High' },
            ],
          },
        ],
      },
    ],
    customDefinitions: [],
    agentCapabilities: { version: 1, nodes: [] },
    connections: [],
    groups: [],
    runtimeStatus: { running: false, deployedPartitionIds: [] },
    deviceCapabilities: [],
    errors: [],
    permissions: [],
    proposals: [],
  };
  const targetSpace = {
    id: 'ai-space:image',
    parentId: null,
    kind: 'ai-space' as const,
    name: 'Image Space',
    nodeIds: [],
    disabled: false,
    agentPolicy: {
      enabled: true,
      allowedCommands: ['node.add', 'node.connect', 'node.inputs.update'],
      targetScope: {
        nodeIds: [],
        allowNewNodes: true,
        allowedNodeTypes: ['gpt-image-gen'],
      },
    },
  };

  const manifest = buildCapabilityManifest(snapshot as never, targetSpace as never) as {
    createableNodeTypes: Array<{
      type: string;
      ports: { inputs: Array<Record<string, unknown>>; outputs: Array<Record<string, unknown>> };
      params: Array<Record<string, unknown>>;
    }>;
  };

  const imageNode = manifest.createableNodeTypes[0];
  assert.equal(imageNode.type, 'gpt-image-gen');
  assert.deepEqual(
    imageNode.ports.inputs.map((input) => [input.id, input.type]),
    [
      ['prompt', 'string'],
      ['image', 'image'],
      ['trigger', 'boolean'],
    ]
  );
  assert.deepEqual(imageNode.ports.outputs.map((output) => [output.id, output.type]), [
    ['image', 'image'],
    ['assetId', 'string'],
  ]);
  assert.deepEqual(
    imageNode.params.find((param) => param.key === 'quality')?.options,
    [
      { value: 'low', label: 'Low' },
      { value: 'medium', label: 'Medium' },
      { value: 'high', label: 'High' },
    ]
  );
});

test('manifest keeps existing scoped node capabilities compact when many new node types are allowed', () => {
  const manyDefinitions = Array.from({ length: 500 }, (_, index) => ({
    type: `heavy-${index}`,
    label: `Heavy ${index}`,
    category: 'Generated',
    ports: {
      inputs: Array.from({ length: 8 }, (_item, inputIndex) => ({
        id: `input-${inputIndex}`,
        label: `Input ${inputIndex}`,
        type: 'string',
        defaultValue: 'x'.repeat(100),
      })),
      outputs: Array.from({ length: 8 }, (_item, outputIndex) => ({
        id: `output-${outputIndex}`,
        label: `Output ${outputIndex}`,
        type: 'string',
      })),
    },
    params: Array.from({ length: 20 }, (_item, paramIndex) => ({
      key: `param-${paramIndex}`,
      label: `Param ${paramIndex}`,
      type: 'string',
      defaultValue: 'x'.repeat(100),
      options: Array.from({ length: 12 }, (_option, optionIndex) => ({
        value: `option-${optionIndex}`,
        label: `Option ${optionIndex}`,
      })),
    })),
    aiSummary: {
      type: `heavy-${index}`,
      label: `Heavy ${index}`,
      version: '1.0.0',
      category: 'Generated',
      description: 'x'.repeat(300),
      platforms: ['manager', 'client', 'display'],
      permissions: [],
      ports: {},
      params: [],
      compatibility: [],
      examples: [],
      repairHints: [],
    },
  }));
  const snapshot = {
    revision: 1,
    nodes: [
      {
        id: 'scene',
        type: 'scene-fct-track',
        params: { sensitivity: 1 },
        inputValues: { sensitivity: 2 },
        outputValues: {},
      },
    ],
    definitions: [
      {
        type: 'scene-fct-track',
        label: 'Scene FCT Track',
        category: 'Scene',
        ports: {
          inputs: [{ id: 'sensitivity', label: 'Sensitivity', type: 'number' }],
          outputs: [{ id: 'out', label: 'Out', type: 'scene' }],
        },
        params: [{ key: 'sensitivity', label: 'Sensitivity', type: 'number', min: 0, max: 5 }],
        aiSummary: {
          type: 'scene-fct-track',
          label: 'Scene FCT Track',
          version: '1.0.0',
          category: 'Scene',
          description: 'Controls FCT scene sensitivity.',
          platforms: ['client'],
          permissions: [],
          ports: {},
          params: [],
          compatibility: [],
          examples: [],
          repairHints: [],
        },
      },
      ...manyDefinitions,
    ],
    customDefinitions: [],
    agentCapabilities: { version: 1, nodes: [] },
    connections: [],
    groups: [],
    runtimeStatus: { running: false, deployedPartitionIds: [] },
    deviceCapabilities: [],
    errors: [],
    permissions: [],
    proposals: [],
  };
  const targetSpace = {
    id: 'ai-space:test',
    parentId: null,
    kind: 'ai-space' as const,
    name: 'Test Space',
    nodeIds: ['scene'],
    disabled: false,
    agentPolicy: {
      enabled: true,
      allowedCommands: ['node.add', 'node.params.update'],
      targetScope: {
        nodeIds: ['scene'],
        allowNewNodes: true,
      },
    },
  };

  const manifest = buildCapabilityManifest(snapshot as never, targetSpace as never) as {
    nodeTypes: Array<{ type: string; params: Array<Record<string, unknown>> }>;
    createableNodeTypes: Array<Record<string, unknown>>;
    createableNodeTypeIndex?: Array<{ type: string; label: string; category: string }>;
  };

  assert.deepEqual(manifest.nodeTypes.map((definition) => definition.type), ['scene-fct-track']);
  assert.equal(manifest.nodeTypes[0]?.params[0]?.key, 'sensitivity');
  assert.equal(
    manifest.createableNodeTypes.every(
      (definition) => typeof definition.type === 'string' && !definition.type.startsWith('heavy-')
    ),
    true
  );
  assert.ok((manifest.createableNodeTypeIndex?.length ?? 0) < 100);
  assert.ok(JSON.stringify(manifest).length < 40_000);
});

test('manifest exposes full details for common agent-created nodes even when many new node types are allowed', () => {
  const manyDefinitions = Array.from({ length: 500 }, (_, index) => ({
    type: `heavy-${index}`,
    label: `Heavy ${index}`,
    category: 'Generated',
    ports: {
      inputs: Array.from({ length: 8 }, (_item, inputIndex) => ({
        id: `input-${inputIndex}`,
        label: `Input ${inputIndex}`,
        type: 'string',
        defaultValue: 'x'.repeat(100),
      })),
      outputs: Array.from({ length: 8 }, (_item, outputIndex) => ({
        id: `output-${outputIndex}`,
        label: `Output ${outputIndex}`,
        type: 'string',
      })),
    },
    params: Array.from({ length: 20 }, (_item, paramIndex) => ({
      key: `param-${paramIndex}`,
      label: `Param ${paramIndex}`,
      type: 'string',
      defaultValue: 'x'.repeat(100),
    })),
  }));
  const snapshot = {
    revision: 1,
    nodes: [
      {
        id: 'aggregator',
        type: 'cmd-aggregator',
        params: {},
        inputValues: {},
        outputValues: {},
      },
    ],
    definitions: [
      ...manyDefinitions,
      {
        type: 'cmd-aggregator',
        label: 'Cmd Aggregator',
        category: 'Objects',
        ports: {
          inputs: [{ id: 'in1', label: 'In 1', type: 'command' }],
          outputs: [{ id: 'cmd', label: 'Cmd', type: 'command' }],
        },
        params: [],
      },
      {
        type: 'proc-flashlight',
        label: 'Flashlight',
        category: 'Processors',
        ports: {
          inputs: [{ id: 'trigger', label: 'Trigger', type: 'boolean' }],
          outputs: [{ id: 'cmd', label: 'Cmd', type: 'command' }],
        },
        params: [{ key: 'enabled', label: 'Enabled', type: 'boolean', defaultValue: true }],
      },
    ],
    customDefinitions: [],
    agentCapabilities: { version: 1, nodes: [] },
    connections: [],
    groups: [],
    runtimeStatus: { running: false, deployedPartitionIds: [] },
    deviceCapabilities: [],
    errors: [],
    permissions: [],
    proposals: [],
  };
  const targetSpace = {
    id: 'ai-space:test',
    parentId: null,
    kind: 'ai-space' as const,
    name: 'Test Space',
    nodeIds: ['aggregator'],
    disabled: false,
    agentPolicy: {
      enabled: true,
      allowedCommands: ['node.add', 'node.connect', 'node.params.update'],
      targetScope: {
        nodeIds: ['aggregator'],
        allowNewNodes: true,
      },
    },
  };

  const manifest = buildCapabilityManifest(snapshot as never, targetSpace as never) as {
    createableNodeTypes: Array<{
      type: string;
      ports?: { inputs?: Array<Record<string, unknown>>; outputs?: Array<Record<string, unknown>> };
      params?: Array<Record<string, unknown>>;
    }>;
    createableNodeTypeIndex?: Array<{ type: string }>;
    createableNodeTypeIndexTruncated?: boolean;
  };

  const flashlight = manifest.createableNodeTypes.find((definition) => definition.type === 'proc-flashlight');
  assert.equal(flashlight?.ports?.inputs?.[0]?.id, 'trigger');
  assert.equal(flashlight?.ports?.outputs?.[0]?.id, 'cmd');
  assert.equal(flashlight?.params?.[0]?.key, 'enabled');
  assert.equal(manifest.createableNodeTypeIndex?.some((definition) => definition.type === 'proc-flashlight'), true);
  assert.equal(manifest.createableNodeTypeIndexTruncated, true);
  assert.equal(manifest.createableNodeTypeIndex?.some((definition) => definition.type === 'heavy-499'), false);
  assert.ok(JSON.stringify(manifest).length < 50_000);
});

test('manifest strips duplicated and unsafe fields from AI summaries while preserving author guidance', () => {
  const snapshot = {
    revision: 1,
    nodes: [
      {
        id: 'display-text',
        type: 'proc-display-text',
        params: {},
        inputValues: {},
        outputValues: {},
      },
    ],
    definitions: [
      {
        type: 'proc-display-text',
        label: 'Display Text',
        category: 'Processors',
        ports: {
          inputs: [{ id: 'text', label: 'Text', type: 'string' }],
          outputs: [{ id: 'cmd', label: 'Cmd', type: 'command' }],
        },
        params: [{ key: 'text', label: 'Text', type: 'string', defaultValue: '' }],
        aiSummary: {
          description: 'Shows text to the audience.',
          compatibility: [{ target: 'display-object', rule: 'Route cmd to Display.' }],
          examples: [{ prompt: 'say hi', actions: [{ op: 'setParam' }] }],
          repairHints: ['Use an existing display text node before adding one.'],
          sideEffects: ['May flash the screen.'],
          risks: ['Could spam viewers.'],
          ports: { duplicated: true },
          params: [{ duplicated: true }],
          permissions: ['network'],
        },
      },
    ],
    customDefinitions: [],
    agentCapabilities: { version: 1, nodes: [] },
    connections: [],
    groups: [],
    runtimeStatus: { running: false, deployedPartitionIds: [] },
    deviceCapabilities: [],
    errors: [],
    permissions: [],
    proposals: [],
  };
  const targetSpace = {
    id: 'ai-space:test',
    parentId: null,
    kind: 'ai-space' as const,
    name: 'Test Space',
    nodeIds: ['display-text'],
    disabled: false,
    agentPolicy: {
      enabled: true,
      allowedCommands: ['node.params.update'],
      targetScope: {
        nodeIds: ['display-text'],
        allowNewNodes: false,
      },
    },
  };

  const manifest = buildCapabilityManifest(snapshot as never, targetSpace as never) as {
    nodeTypes: Array<{ aiSummary?: Record<string, unknown>; ports?: unknown; params?: unknown }>;
  };
  const definition = manifest.nodeTypes[0];

  assert.ok(definition?.ports);
  assert.ok(definition?.params);
  assert.deepEqual(Object.keys(definition?.aiSummary ?? {}).sort(), [
    'compatibility',
    'description',
    'examples',
    'repairHints',
  ]);
});
