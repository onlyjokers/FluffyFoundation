/**
 * Purpose: Verify the persistent AI orchestrator turns environment events into scoped semantic commands.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { createAgentSkillRegistry } from '@shugu/ai-core';

import { AiOrchestratorService } from './ai-orchestrator.service.js';

const skillRegistry = createAgentSkillRegistry({
  skills: [
    {
      id: 'node.display-breathing',
      title: 'Display Breathing Node',
      summary: 'Controls display breathing visuals through bounded params.',
      triggers: {
        nodeTypes: ['display-breathing'],
        commandTypes: ['node.params.update'],
        eventTypes: ['client.joined', 'client.text.final'],
      },
      content: 'Full display breathing guidance.',
    },
    {
      id: 'command.node-add',
      title: 'Scoped Node Add',
      summary: 'Explains scoped node.add in an AI Space sandbox.',
      triggers: {
        commandTypes: ['node.add'],
        eventTypes: ['client.joined'],
      },
      content: 'Full scoped node.add guidance.',
    },
  ],
});

test('orchestrator emits semantic commands for joined and text events through the authority bus', async () => {
  const dispatches: Array<{
    actor: { id: string; role: string };
    command: Record<string, unknown>;
    dryRun?: boolean;
  }> = [];
  const authority = {
    getSnapshot: () => ({
      revision: 11,
      nodes: [
        {
          id: 'display:breath',
          type: 'display-breathing',
          params: { intensity: 0.3, breathRate: 1 },
          inputValues: {},
          outputValues: {},
        },
      ],
      definitions: [
        {
          type: 'display-breathing',
          label: 'Display Breathing',
          category: 'Effects',
          ports: { inputs: [], outputs: [] },
          params: [],
          aiSummary: {
            type: 'display-breathing',
            label: 'Display Breathing',
            version: '1.0.0',
            category: 'Effects',
            description: 'Controls a display breathing visual.',
            platforms: ['display'],
            sideEffects: 'remote-control',
            permissions: ['control:send'],
            ports: { inputs: [], outputs: [] },
            params: [],
            compatibility: [],
            examples: [],
            risks: [],
            repairHints: [],
          },
        },
      ],
      connections: [],
      groups: [
        {
          id: 'ai-space:agent',
          parentId: null,
          kind: 'ai-space',
          name: 'Agent Space',
          nodeIds: ['display:breath'],
          disabled: false,
          surface: 'internal',
          visibility: { defaultAccess: 'visible-readonly' },
          agentPolicy: {
            enabled: true,
            allowedActorIds: ['ai-orchestrator'],
            allowedCommands: ['node.add', 'node.params.update'],
            targetScope: { nodeIds: ['display:breath'], allowNewNodes: true },
            budgets: { maxNodes: 3, maxConnections: 2, maxParamsPerCommand: 2 },
          },
          agentInterface: {
            publicInputs: [{ id: 'prompt', type: 'string', label: 'Prompt' }],
            publicOutputs: [{ id: 'effect', type: 'string', label: 'Effect' }],
            exposedNodeIds: ['display:breath'],
            callableCommands: ['node.add', 'node.params.update'],
            eventBindings: ['client.joined', 'client.text.final'],
          },
        },
      ],
      partitions: [],
      runtimeStatus: { running: false, deployedPartitionIds: [] },
      deviceCapabilities: [],
      errors: [],
      permissions: [],
      proposals: [],
    }),
    dispatch: (input: {
      actor: { id: string; role: string };
      command: Record<string, unknown>;
      dryRun?: boolean;
    }) => {
      dispatches.push(input);
      return {
        ok: true,
        command: input.command,
        dryRun: Boolean(input.dryRun),
        previousRevision: 11,
        appliedRevision: 12,
        rollbackToken: 'rollback:11',
        audit: {
          id: 'audit:11',
          actor: { ...input.actor },
          command: input.command,
          dryRun: Boolean(input.dryRun),
          lifecycle: ['dry-run', 'policy', 'apply', 'audit', 'history', 'rollback-token'],
          policy: { allowed: true },
          previousRevision: 11,
          appliedRevision: 12,
          rollbackToken: 'rollback:11',
          createdAt: '1970-01-01T00:00:00.000Z',
        },
        snapshot: authority.getSnapshot(),
      };
    },
  };

  const prompts: string[] = [];
  const chatClient = {
    describeConfig: () => ({
      baseUrl: 'https://code.b886.top/v1',
      model: 'gpt-5.5',
      apiKey: '[REDACTED]',
      supportsJsonSchema: true,
      timeoutMs: 30_000,
    }),
    completeJson: async (input: { messages: Array<{ content: string }> }) => {
      const { messages } = input;
      const prompt = messages.map((message) => message.content).join('\n');
      prompts.push(prompt);
      if (prompt.includes('"type":"client.joined"')) {
        return {
          raw: { ok: true },
          content:
            '{"id":"turn:join","summary":"welcome","commands":[{"type":"node.add","scopeGroupId":"ai-space:agent","node":{"id":"agent:greeting","type":"display-breathing","position":{"x":20,"y":0},"config":{"intensity":0.5,"breathRate":1.2},"inputValues":{},"outputValues":{}}}]}',
          parsed: {
            id: 'turn:join',
            summary: 'welcome',
            commands: [
              {
                type: 'node.add',
                scopeGroupId: 'ai-space:agent',
                node: {
                  id: 'agent:greeting',
                  type: 'display-breathing',
                  position: { x: 20, y: 0 },
                  config: { intensity: 0.5, breathRate: 1.2 },
                  inputValues: {},
                  outputValues: {},
                },
              },
            ],
          },
          request: { url: 'https://code.b886.top/v1/chat/completions', body: {} },
        };
      }

      return {
        raw: { ok: true },
        content:
          '{"id":"turn:text","summary":"adjust","commands":[{"type":"node.params.update","scopeGroupId":"ai-space:agent","nodeId":"display:breath","params":{"intensity":0.7}}]}',
        parsed: {
          id: 'turn:text',
          summary: 'adjust',
          commands: [
            {
              type: 'node.params.update',
              scopeGroupId: 'ai-space:agent',
              nodeId: 'display:breath',
              params: { intensity: 0.7 },
            },
          ],
        },
        request: { url: 'https://code.b886.top/v1/chat/completions', body: {} },
      };
    },
  };

  const orchestrator = new AiOrchestratorService(
    authority as never,
    chatClient as never,
    skillRegistry
  );

  const joined = await orchestrator.handleEnvironmentEvent({
    type: 'client.joined',
    clientId: 'client-1',
    groupId: 'ai-space:agent',
    message: 'hello',
  });
  assert.equal(joined.turns[0]?.plan?.commands.length, 1);
  assert.equal(dispatches.length, 2);
  assert.equal(dispatches[0].command.type, 'node.add');
  assert.equal(dispatches[0].dryRun, true);
  assert.equal(dispatches[0].command.scopeGroupId, 'ai-space:agent');
  assert.deepEqual(
    (dispatches[0].command as { node: { position: { x: number; y: number } } }).node.position,
    { x: 0, y: 0 }
  );
  assert.equal(dispatches[1].command.type, 'node.add');
  assert.equal(dispatches[1].dryRun, false);

  const text = await orchestrator.handleEnvironmentEvent({
    type: 'client.text.final',
    clientId: 'client-1',
    groupId: 'ai-space:agent',
    text: 'make it warmer',
  });
  assert.equal(text.turns[0]?.plan?.commands[0]?.type, 'node.params.update');
  assert.equal(dispatches.length, 4);
  assert.equal(dispatches[2].command.type, 'node.params.update');
  assert.equal(dispatches[2].dryRun, true);
  assert.equal(dispatches[3].command.type, 'node.params.update');
  assert.equal(dispatches[3].dryRun, false);
  assert.equal(dispatches[3].command.scopeGroupId, 'ai-space:agent');
  assert.equal(
    prompts.some((prompt) => prompt.includes('Display Breathing Node')),
    true
  );
  assert.equal(
    prompts.some((prompt) => prompt.includes('client.joined')),
    true
  );
  assert.equal(
    prompts.some((prompt) => prompt.includes('client.text.final')),
    true
  );
});

test('orchestrator orders prompt messages for provider prefix caching and logs prompt fingerprints', async () => {
  const authority = {
    getSnapshot: () => ({
      revision: 21,
      nodes: [
        {
          id: 'display:text',
          type: 'display-text',
          params: { value: 'hello' },
          inputValues: {},
          outputValues: {},
        },
      ],
      definitions: [
        {
          type: 'display-text',
          label: 'Display Text',
          category: 'Display',
          ports: { inputs: [], outputs: [] },
          params: [{ id: 'value', type: 'string', defaultValue: '' }],
          aiSummary: {
            type: 'display-text',
            label: 'Display Text',
            version: '1.0.0',
            category: 'Display',
            description: 'Writes text to display endpoints.',
            platforms: ['display', 'client'],
            sideEffects: 'remote-control',
            permissions: ['control:send'],
            ports: { inputs: [], outputs: [] },
            params: [{ id: 'value', type: 'string', defaultValue: '' }],
            compatibility: [],
            examples: [],
            risks: [],
            repairHints: [],
          },
        },
      ],
      connections: [],
      groups: [
        {
          id: 'ai-space:cache',
          parentId: null,
          kind: 'ai-space',
          name: 'Cache Space',
          nodeIds: ['display:text'],
          disabled: false,
          surface: 'internal',
          visibility: { defaultAccess: 'visible-readonly' },
          agentPolicy: {
            enabled: true,
            allowedActorIds: ['ai-orchestrator'],
            allowedCommands: ['node.params.update'],
            targetScope: { nodeIds: ['display:text'], allowNewNodes: false },
            budgets: { maxNodes: 2, maxConnections: 1, maxParamsPerCommand: 2 },
          },
          agentInterface: {
            publicInputs: [{ id: 'speech', type: 'string', label: 'Speech text' }],
            publicOutputs: [{ id: 'display', type: 'string', label: 'Display response' }],
            exposedNodeIds: ['display:text'],
            callableCommands: ['node.params.update'],
            eventBindings: ['client.text.final'],
          },
        },
      ],
      partitions: [],
      runtimeStatus: { running: false, deployedPartitionIds: [] },
      deviceCapabilities: [],
      errors: [],
      permissions: [],
      proposals: [],
    }),
    dispatch: (input: { command: Record<string, unknown>; dryRun?: boolean }) => ({
      ok: true,
      command: input.command,
      dryRun: Boolean(input.dryRun),
      previousRevision: 21,
      appliedRevision: 22,
      rollbackToken: 'rollback:21',
      audit: { id: 'audit:21', command: input.command, dryRun: Boolean(input.dryRun) },
      snapshot: authority.getSnapshot(),
    }),
  };

  const capturedMessages: Array<{ role: string; content: string }> = [];
  const debugRecords: Array<Record<string, unknown>> = [];
  const chatClient = {
    describeConfig: () => ({
      baseUrl: 'https://code.b886.top/v1',
      model: 'gpt-5.5',
      apiKey: '[REDACTED]',
      supportsJsonSchema: true,
      timeoutMs: 30_000,
    }),
    completeJson: async (input: { messages: Array<{ role: string; content: string }> }) => {
      capturedMessages.push(...input.messages);
      return {
        raw: { ok: true },
        content:
          '{"id":"turn:cache","summary":"reply","commands":[{"type":"node.params.update","scopeGroupId":"ai-space:cache","nodeId":"display:text","params":{"value":"你好"}}]}',
        parsed: {
          id: 'turn:cache',
          summary: 'reply',
          commands: [
            {
              type: 'node.params.update',
              scopeGroupId: 'ai-space:cache',
              nodeId: 'display:text',
              params: { value: '你好' },
            },
          ],
        },
        request: { url: 'https://code.b886.top/v1/chat/completions', body: {} },
      };
    },
  };

  const orchestrator = new AiOrchestratorService(
    authority as never,
    chatClient as never,
    skillRegistry,
    { write: (record: Record<string, unknown>) => debugRecords.push(record) },
  );

  await orchestrator.handleEnvironmentEvent({
    type: 'client.text.final',
    clientId: 'client-1',
    groupId: 'ai-space:cache',
    text: '你好',
  });

  assert.equal(capturedMessages[0]?.role, 'system');
  assert.ok(capturedMessages.length >= 6);
  assert.match(capturedMessages[1]?.content ?? '', /AI_ORCHESTRATOR_PROTOCOL_V1/);

  const requestLog = debugRecords.find((record) => record.kind === 'ai.turn.request') as
    | { promptMessages?: Array<{ id?: string; sha256?: string; chars?: number }> }
    | undefined;
  assert.ok(requestLog);
  const messageById = new Map(
    requestLog.promptMessages?.map((message, index) => [message.id, capturedMessages[index]]) ?? []
  );
  assert.match(messageById.get('capabilityManifest')?.content ?? '', /"kind":"capabilityManifest"/);
  assert.match(messageById.get('skills')?.content ?? '', /"kind":"skills"/);
  assert.match(messageById.get('targetSpace')?.content ?? '', /"kind":"targetSpace"/);
  assert.match(messageById.get('event')?.content ?? '', /"kind":"event"/);
  assert.match(messageById.get('event')?.content ?? '', /"text":"你好"/);
  assert.equal(messageById.get('system')?.content.includes('"text":"你好"'), false);
  assert.deepEqual(
    requestLog.promptMessages?.map((message) => message.id),
    [
      'system',
      'protocol',
      'authorityRules',
      'targetSpace',
      'event',
      'currentTaskContext',
      'snapshot',
      'capabilityManifest',
      'skills',
      'aiNotesAndCustomNodeHints',
      'durableMemory',
      'memory'
    ]
  );
  assert.equal(requestLog.promptMessages?.some((message) => message.id === 'compressionNotice'), false);
  assert.match(requestLog.promptMessages?.find((message) => message.id === 'event')?.sha256 ?? '', /^[a-f0-9]{64}$/);
  assert.equal(typeof requestLog.promptMessages?.find((message) => message.id === 'event')?.chars, 'number');
});

test('orchestrator supports client UI and vision idle events and skips apply when superseded', async () => {
  const dispatches: Array<{ command: Record<string, unknown>; dryRun?: boolean }> = [];
  const prompts: string[] = [];
  const authority = {
    getSnapshot: () => ({
      revision: 24,
      nodes: [
        {
          id: 'display:text',
          type: 'proc-display-text',
          params: { text: 'idle' },
          inputValues: {},
          outputValues: {},
        },
      ],
      definitions: [],
      connections: [],
      groups: [
        {
          id: 'ai-space:agent',
          parentId: null,
          kind: 'ai-space',
          name: 'Agent Space',
          nodeIds: ['display:text'],
          disabled: false,
          agentPolicy: {
            enabled: true,
            allowedActorIds: ['ai-orchestrator'],
            allowedCommands: ['node.params.update'],
            targetScope: { nodeIds: ['display:text'], allowNewNodes: false },
          },
          agentInterface: {
            exposedNodeIds: ['display:text'],
            callableCommands: ['node.params.update'],
            eventBindings: ['client.ui.interaction', 'vision.idle'],
          },
        },
      ],
      partitions: [],
      runtimeStatus: { running: false, deployedPartitionIds: [] },
      deviceCapabilities: [],
      errors: [],
      permissions: [],
      proposals: [],
    }),
    dispatch: (input: { command: Record<string, unknown>; dryRun?: boolean }) => {
      dispatches.push(input);
      return {
        ok: true,
        command: input.command,
        dryRun: Boolean(input.dryRun),
        previousRevision: 24,
        appliedRevision: 25,
        rollbackToken: 'rollback:24',
        audit: { id: 'audit:24', command: input.command, dryRun: Boolean(input.dryRun) },
        snapshot: authority.getSnapshot(),
      };
    },
  };
  const chatClient = {
    describeConfig: () => ({
      baseUrl: 'https://code.b886.top/v1',
      model: 'gpt-5.5',
      apiKey: '[REDACTED]',
      supportsJsonSchema: true,
      timeoutMs: 30_000,
    }),
    completeJson: async (input: { messages: Array<{ content: string }> }) => {
      prompts.push(input.messages.map((message) => message.content).join('\n'));
      return {
        raw: { ok: true },
        content:
          '{"id":"turn:ui","commands":[{"type":"node.params.update","scopeGroupId":"ai-space:agent","nodeId":"display:text","params":{"text":"updated"}}]}',
        parsed: {
          id: 'turn:ui',
          commands: [
            {
              type: 'node.params.update',
              scopeGroupId: 'ai-space:agent',
              nodeId: 'display:text',
              params: { text: 'updated' },
            },
          ],
        },
        request: { url: 'https://code.b886.top/v1/chat/completions', body: {} },
      };
    },
  };
  const orchestrator = new AiOrchestratorService(authority as never, chatClient as never, skillRegistry);

  const superseded = await orchestrator.handleEnvironmentEvent(
    {
      type: 'client.ui.interaction',
      clientId: 'client-1',
      nodeId: 'button-1',
      uiKind: 'button',
      pressed: true,
    },
    { isSuperseded: () => true }
  );

  assert.equal(superseded.turns[0]?.plan, null);
  assert.deepEqual(dispatches.map((entry) => entry.dryRun), [true]);

  await orchestrator.handleEnvironmentEvent({
    type: 'vision.idle',
    clientId: 'client-1',
    image: {
      dataUrl: 'data:image/webp;base64,abc',
      mime: 'image/webp',
      width: 100,
      height: 60,
      createdAt: 123,
    },
  });

  assert.equal(dispatches.some((entry) => entry.dryRun === false), true);
  assert.equal(prompts.some((prompt) => prompt.includes('client.ui.interaction')), true);
  assert.equal(prompts.some((prompt) => prompt.includes('vision.idle')), true);
  assert.equal(prompts.some((prompt) => prompt.includes('data:image/webp;base64,abc')), true);
});

test('orchestrator targets only enabled AI spaces whose interface binds the incoming event', async () => {
  const dispatches: Array<{
    actor: { id: string; role: string };
    command: Record<string, unknown>;
    dryRun?: boolean;
  }> = [];
  const prompts: string[] = [];
  const authority = {
    getSnapshot: () => ({
      revision: 12,
      nodes: [
        {
          id: 'display:breath',
          type: 'display-breathing',
          params: { intensity: 0.3, breathRate: 1 },
          inputValues: {},
          outputValues: {},
        },
      ],
      definitions: [],
      connections: [],
      groups: [
        {
          id: 'ai-space:enabled',
          parentId: null,
          kind: 'ai-space',
          name: 'Enabled AI Space',
          nodeIds: ['display:breath'],
          disabled: false,
          surface: 'internal',
          visibility: { defaultAccess: 'visible-readonly' },
          agentPolicy: {
            enabled: true,
            allowedActorIds: ['ai-orchestrator'],
            allowedCommands: ['node.params.update'],
            targetScope: { nodeIds: ['display:breath'], allowNewNodes: true },
            budgets: { maxNodes: 3, maxConnections: 2, maxParamsPerCommand: 2 },
          },
          agentInterface: {
            publicInputs: [{ id: 'prompt', type: 'string', label: 'Prompt' }],
            publicOutputs: [{ id: 'effect', type: 'string', label: 'Effect' }],
            exposedNodeIds: ['display:breath'],
            callableCommands: ['node.params.update'],
            eventBindings: ['client.joined'],
          },
        },
        {
          id: 'group:ordinary',
          parentId: null,
          kind: 'group',
          name: 'Ordinary Group',
          nodeIds: ['display:breath'],
          disabled: false,
          surface: 'internal',
          visibility: { defaultAccess: 'visible-readonly' },
          agentPolicy: {
            enabled: true,
            allowedActorIds: ['ai-orchestrator'],
            allowedCommands: ['node.params.update'],
            targetScope: { nodeIds: ['display:breath'], allowNewNodes: true },
            budgets: { maxNodes: 3, maxConnections: 2, maxParamsPerCommand: 2 },
          },
          agentInterface: {
            publicInputs: [{ id: 'prompt', type: 'string', label: 'Prompt' }],
            publicOutputs: [{ id: 'effect', type: 'string', label: 'Effect' }],
            exposedNodeIds: ['display:breath'],
            callableCommands: ['node.params.update'],
            eventBindings: ['client.joined'],
          },
        },
        {
          id: 'ai-space:disabled',
          parentId: null,
          kind: 'ai-space',
          name: 'Disabled AI Space',
          nodeIds: ['display:breath'],
          disabled: false,
          surface: 'internal',
          visibility: { defaultAccess: 'visible-readonly' },
          agentPolicy: {
            enabled: false,
            allowedActorIds: ['ai-orchestrator'],
            allowedCommands: ['node.params.update'],
            targetScope: { nodeIds: ['display:breath'], allowNewNodes: true },
            budgets: { maxNodes: 3, maxConnections: 2, maxParamsPerCommand: 2 },
          },
          agentInterface: {
            publicInputs: [{ id: 'prompt', type: 'string', label: 'Prompt' }],
            publicOutputs: [{ id: 'effect', type: 'string', label: 'Effect' }],
            exposedNodeIds: ['display:breath'],
            callableCommands: ['node.params.update'],
            eventBindings: ['client.joined'],
          },
        },
      ],
      partitions: [],
      runtimeStatus: { running: false, deployedPartitionIds: [] },
      deviceCapabilities: [],
      errors: [],
      permissions: [],
      proposals: [],
    }),
    dispatch: (input: {
      actor: { id: string; role: string };
      command: Record<string, unknown>;
      dryRun?: boolean;
    }) => {
      dispatches.push(input);
      return {
        ok: true,
        command: input.command,
        dryRun: Boolean(input.dryRun),
        previousRevision: 12,
        appliedRevision: 13,
        rollbackToken: 'rollback:12',
        audit: {
          id: 'audit:12',
          actor: { ...input.actor },
          command: input.command,
          dryRun: Boolean(input.dryRun),
          lifecycle: ['dry-run', 'policy', 'apply', 'audit', 'history', 'rollback-token'],
          policy: { allowed: true },
          previousRevision: 12,
          appliedRevision: 13,
          rollbackToken: 'rollback:12',
          createdAt: '1970-01-01T00:00:00.000Z',
        },
        snapshot: authority.getSnapshot(),
      };
    },
  };

  const chatClient = {
    describeConfig: () => ({
      baseUrl: 'https://code.b886.top/v1',
      model: 'gpt-5.5',
      apiKey: '[REDACTED]',
      supportsJsonSchema: true,
      timeoutMs: 30_000,
    }),
    completeJson: async (input: { messages: Array<{ content: string }> }) => {
      prompts.push(input.messages.map((message) => message.content).join('\n'));
      return {
        raw: { ok: true },
        content:
          '{"id":"turn:join","summary":"welcome","commands":[{"type":"node.params.update","scopeGroupId":"ai-space:enabled","nodeId":"display:breath","params":{"intensity":0.5}}]}',
        parsed: {
          id: 'turn:join',
          summary: 'welcome',
          commands: [
            {
              type: 'node.params.update',
              scopeGroupId: 'ai-space:enabled',
              nodeId: 'display:breath',
              params: { intensity: 0.5 },
            },
          ],
        },
        request: { url: 'https://code.b886.top/v1/chat/completions', body: {} },
      };
    },
  };

  const orchestrator = new AiOrchestratorService(
    authority as never,
    chatClient as never,
    skillRegistry
  );

  const result = await orchestrator.handleEnvironmentEvent({
    type: 'client.joined',
    clientId: 'client-1',
    groupId: 'group:not-the-target',
    message: 'hello',
  });

  assert.equal(prompts.length, 1);
  assert.equal(prompts[0].includes('"targetSpaceId":"ai-space:enabled"'), true);
  assert.equal(prompts[0].includes('group:ordinary'), false);
  assert.equal(prompts[0].includes('ai-space:disabled'), false);
  assert.equal(result.turns.length, 1);
  assert.equal(result.turns[0]?.targetSpaceId, 'ai-space:enabled');
  assert.equal(dispatches.length, 2);
  assert.equal(dispatches[0].dryRun, true);
  assert.equal(dispatches[1].dryRun, false);
});

test('orchestrator stays silent when no AI space binds the event', async () => {
  const dispatches: Array<{
    actor: { id: string; role: string };
    command: Record<string, unknown>;
    dryRun?: boolean;
  }> = [];
  const prompts: string[] = [];
  const authority = {
    getSnapshot: () => ({
      revision: 13,
      nodes: [],
      definitions: [],
      connections: [],
      groups: [
        {
          id: 'ai-space:enabled',
          parentId: null,
          kind: 'ai-space',
          name: 'Enabled AI Space',
          nodeIds: [],
          disabled: false,
          surface: 'internal',
          visibility: { defaultAccess: 'visible-readonly' },
          agentPolicy: {
            enabled: true,
            allowedActorIds: ['ai-orchestrator'],
            allowedCommands: ['node.params.update'],
            targetScope: { nodeIds: [], allowNewNodes: true },
            budgets: { maxNodes: 3, maxConnections: 2, maxParamsPerCommand: 2 },
          },
          agentInterface: {
            publicInputs: [{ id: 'prompt', type: 'string', label: 'Prompt' }],
            publicOutputs: [{ id: 'effect', type: 'string', label: 'Effect' }],
            exposedNodeIds: [],
            callableCommands: ['node.params.update'],
            eventBindings: ['client.joined'],
          },
        },
      ],
      partitions: [],
      runtimeStatus: { running: false, deployedPartitionIds: [] },
      deviceCapabilities: [],
      errors: [],
      permissions: [],
      proposals: [],
    }),
    dispatch: (input: {
      actor: { id: string; role: string };
      command: Record<string, unknown>;
      dryRun?: boolean;
    }) => {
      dispatches.push(input);
      return {
        ok: true,
        command: input.command,
        dryRun: Boolean(input.dryRun),
        previousRevision: 13,
        appliedRevision: 14,
        rollbackToken: 'rollback:13',
        audit: {
          id: 'audit:13',
          actor: { ...input.actor },
          command: input.command,
          dryRun: Boolean(input.dryRun),
          lifecycle: ['dry-run', 'policy', 'apply', 'audit', 'history', 'rollback-token'],
          policy: { allowed: true },
          previousRevision: 13,
          appliedRevision: 14,
          rollbackToken: 'rollback:13',
          createdAt: '1970-01-01T00:00:00.000Z',
        },
        snapshot: authority.getSnapshot(),
      };
    },
  };

  const chatClient = {
    describeConfig: () => ({
      baseUrl: 'https://code.b886.top/v1',
      model: 'gpt-5.5',
      apiKey: '[REDACTED]',
      supportsJsonSchema: true,
      timeoutMs: 30_000,
    }),
    completeJson: async () => {
      prompts.push('called');
      return {
        raw: { ok: true },
        content: '',
        parsed: null,
        request: { url: 'https://code.b886.top/v1/chat/completions', body: {} },
      };
    },
  };

  const orchestrator = new AiOrchestratorService(
    authority as never,
    chatClient as never,
    skillRegistry
  );

  const result = await orchestrator.handleEnvironmentEvent({
    type: 'display.ready',
    displayId: 'display-1',
  });

  assert.equal(prompts.length, 0);
  assert.equal(dispatches.length, 0);
  assert.equal(result.turns.length, 0);
});

test('orchestrator compiles action DSL with manifest context, driver-node param updates, and hard delete', async () => {
  const dispatches: Array<{
    actor: { id: string; role: string };
    command: Record<string, unknown>;
    dryRun?: boolean;
  }> = [];
  const prompts: string[] = [];
  const authority = {
    getSnapshot: () => ({
      revision: 21,
      nodes: [
        {
          id: 'value:frequency',
          type: 'number',
          params: { value: 2 },
          inputValues: {},
          outputValues: {},
        },
        {
          id: 'client:flashlight',
          type: 'proc-flashlight',
          params: { active: true, mode: 'blink', frequencyHz: 2 },
          inputValues: {},
          outputValues: {},
        },
        {
          id: 'note:remove-me',
          type: 'note',
          params: { text: 'obsolete' },
          inputValues: {},
          outputValues: {},
        },
      ],
      definitions: [
        {
          type: 'number',
          label: 'Number',
          category: 'Values',
          ports: {
            inputs: [{ id: 'value', label: 'Value', type: 'number' }],
            outputs: [{ id: 'value', label: 'Value', type: 'number' }],
          },
          params: [{ key: 'value', label: 'Value', type: 'number', defaultValue: 0, min: 0, max: 30 }],
          aiSummary: {
            type: 'number',
            label: 'Number',
            version: '1.0.0',
            category: 'Values',
            description: 'Editable numeric constant.',
            platforms: ['manager', 'client'],
            sideEffects: 'none',
            permissions: [],
            ports: { inputs: [], outputs: [{ id: 'value', type: 'number' }] },
            params: [{ key: 'value', type: 'number', default: 0, min: 0, max: 30 }],
            compatibility: [],
            examples: [],
            risks: [],
            repairHints: [],
          },
        },
        {
          type: 'proc-flashlight',
          label: 'Flashlight',
          category: 'Processors',
          ports: {
            inputs: [
              { id: 'active', label: 'Active', type: 'boolean' },
              { id: 'frequencyHz', label: 'Freq', type: 'number' },
            ],
            outputs: [{ id: 'cmd', label: 'Cmd', type: 'command' }],
          },
          params: [
            { key: 'active', label: 'Active', type: 'boolean', defaultValue: true },
            { key: 'frequencyHz', label: 'Frequency', type: 'number', defaultValue: 2, min: 0, max: 30 },
          ],
          aiSummary: {
            type: 'proc-flashlight',
            label: 'Flashlight',
            version: '1.0.0',
            category: 'Processors',
            description: 'Controls client flashlight.',
            platforms: ['client'],
            sideEffects: 'remote-control',
            permissions: ['control:send'],
            ports: {
              inputs: [
                { id: 'active', type: 'boolean' },
                { id: 'frequencyHz', type: 'number', min: 0, max: 30 },
              ],
              outputs: [{ id: 'cmd', type: 'command' }],
            },
            params: [
              { key: 'active', type: 'boolean', default: true },
              { key: 'frequencyHz', type: 'number', default: 2, min: 0, max: 30 },
            ],
            compatibility: [],
            examples: [],
            risks: [],
            repairHints: ['Use active=false to turn the flashlight off.'],
          },
        },
        {
          type: 'note',
          label: 'Note',
          category: 'Other',
          ports: { inputs: [], outputs: [] },
          params: [{ key: 'text', label: 'Text', type: 'string', defaultValue: '' }],
        },
      ],
      connections: [
        {
          id: 'conn:frequency',
          sourceNodeId: 'value:frequency',
          sourcePortId: 'value',
          targetNodeId: 'client:flashlight',
          targetPortId: 'frequencyHz',
        },
      ],
      groups: [
        {
          id: 'ai-space:agent',
          parentId: null,
          kind: 'ai-space',
          name: 'Agent Space',
          nodeIds: ['value:frequency', 'client:flashlight', 'note:remove-me'],
          disabled: false,
          agentPolicy: {
            enabled: true,
            allowedActorIds: ['ai-orchestrator'],
            allowedCommands: ['node.params.update', 'node.remove'],
            targetScope: {
              nodeIds: ['value:frequency', 'client:flashlight', 'note:remove-me'],
              allowNewNodes: false,
            },
          },
          agentInterface: {
            exposedNodeIds: ['value:frequency', 'client:flashlight', 'note:remove-me'],
            callableCommands: ['node.params.update', 'node.remove'],
            eventBindings: ['client.text.final'],
          },
        },
      ],
      partitions: [],
      runtimeStatus: { running: false, deployedPartitionIds: [] },
      deviceCapabilities: [],
      errors: [],
      permissions: [],
      proposals: [],
    }),
    dispatch: (input: {
      actor: { id: string; role: string };
      command: Record<string, unknown>;
      dryRun?: boolean;
    }) => {
      dispatches.push(input);
      return {
        ok: true,
        command: input.command,
        dryRun: Boolean(input.dryRun),
        previousRevision: 21,
        appliedRevision: 22,
        rollbackToken: 'rollback:21',
        audit: {
          id: 'audit:21',
          actor: { ...input.actor },
          command: input.command,
          dryRun: Boolean(input.dryRun),
          lifecycle: ['dry-run', 'policy', 'apply', 'audit', 'history', 'rollback-token'],
          policy: { allowed: true },
          previousRevision: 21,
          appliedRevision: 22,
          rollbackToken: 'rollback:21',
          createdAt: '1970-01-01T00:00:00.000Z',
        },
        snapshot: authority.getSnapshot(),
      };
    },
  };
  const chatClient = {
    describeConfig: () => ({
      baseUrl: 'https://code.b886.top/v1',
      model: 'gpt-5.5',
      apiKey: '[REDACTED]',
      supportsJsonSchema: true,
      timeoutMs: 30_000,
    }),
    completeJson: async (input: { messages: Array<{ content: string }> }) => {
      prompts.push(input.messages.map((message) => message.content).join('\n'));
      return {
        raw: { ok: true },
        content: [
          'I will return JSON.',
          '{"version":1,"id":"turn:dsl","summary":"adjust","actions":[',
          '{"op":"setParam","nodeId":"client:flashlight","param":"frequencyHz","value":100},',
          '{"op":"setParam","nodeId":"client:flashlight","param":"active","value":false},',
          '{"op":"removeNode","nodeId":"note:remove-me"}',
          ']}',
        ].join('\n'),
        parsed: null,
        request: { url: 'https://code.b886.top/v1/chat/completions', body: {} },
      };
    },
  };

  const orchestrator = new AiOrchestratorService(
    authority as never,
    chatClient as never,
    skillRegistry
  );

  const result = await orchestrator.handleEnvironmentEvent({
    type: 'client.text.final',
    clientId: 'client-1',
    groupId: 'ai-space:agent',
    text: '请把闪光频率设为 100，然后关闭 flashlight 并删除旧 note',
  });

  assert.equal(result.turns[0]?.plan?.commands.length, 3);
  assert.equal(prompts[0].includes('"capabilityManifest"'), true);
  assert.equal(prompts[0].includes('"position"'), false);
  assert.deepEqual(dispatches.map((item) => [item.command.type, item.dryRun]), [
    ['node.params.update', true],
    ['node.params.update', true],
    ['node.remove', true],
    ['node.params.update', false],
    ['node.params.update', false],
    ['node.remove', false],
  ]);
  assert.deepEqual(dispatches[0].command, {
    type: 'node.params.update',
    scopeGroupId: 'ai-space:agent',
    nodeId: 'value:frequency',
    params: { value: 100 },
  });
  assert.deepEqual(dispatches[1].command, {
    type: 'node.params.update',
    scopeGroupId: 'ai-space:agent',
    nodeId: 'client:flashlight',
    params: { active: false },
  });
  assert.deepEqual(dispatches[2].command, {
    type: 'node.remove',
    scopeGroupId: 'ai-space:agent',
    nodeId: 'note:remove-me',
  });
});

test('orchestrator repairs invalid JSON/action output with validation feedback before applying', async () => {
  const dispatches: Array<{
    actor: { id: string; role: string };
    command: Record<string, unknown>;
    dryRun?: boolean;
  }> = [];
  const prompts: string[] = [];
  const loggerRecords: Record<string, unknown>[] = [];
  const authority = {
    getSnapshot: () => ({
      revision: 31,
      nodes: [
        {
          id: 'client:flashlight',
          type: 'proc-flashlight',
          params: { active: true },
          inputValues: {},
          outputValues: {},
        },
      ],
      definitions: [
        {
          type: 'proc-flashlight',
          label: 'Flashlight',
          category: 'Processors',
          ports: { inputs: [], outputs: [] },
          params: [{ key: 'active', label: 'Active', type: 'boolean', defaultValue: true }],
        },
      ],
      connections: [],
      groups: [
        {
          id: 'ai-space:agent',
          parentId: null,
          kind: 'ai-space',
          name: 'Agent Space',
          nodeIds: ['client:flashlight'],
          disabled: false,
          agentPolicy: {
            enabled: true,
            allowedActorIds: ['ai-orchestrator'],
            allowedCommands: ['node.params.update'],
            targetScope: { nodeIds: ['client:flashlight'], allowNewNodes: false },
          },
          agentInterface: {
            exposedNodeIds: ['client:flashlight'],
            callableCommands: ['node.params.update'],
            eventBindings: ['client.text.final'],
          },
        },
      ],
      partitions: [],
      runtimeStatus: { running: false, deployedPartitionIds: [] },
      deviceCapabilities: [],
      errors: [],
      permissions: [],
      proposals: [],
    }),
    dispatch: (input: {
      actor: { id: string; role: string };
      command: Record<string, unknown>;
      dryRun?: boolean;
    }) => {
      dispatches.push(input);
      const ok = input.command.type === 'node.params.update';
      return ok
        ? {
            ok: true,
            command: input.command,
            dryRun: Boolean(input.dryRun),
            previousRevision: 31,
            appliedRevision: 32,
            rollbackToken: 'rollback:31',
            audit: {
              id: 'audit:31',
              actor: { ...input.actor },
              command: input.command,
              dryRun: Boolean(input.dryRun),
              lifecycle: ['dry-run', 'policy', 'apply', 'audit', 'history', 'rollback-token'],
              policy: { allowed: true },
              previousRevision: 31,
              appliedRevision: 32,
              rollbackToken: 'rollback:31',
              createdAt: '1970-01-01T00:00:00.000Z',
            },
            snapshot: authority.getSnapshot(),
          }
        : {
            ok: false,
            command: input.command,
            dryRun: Boolean(input.dryRun),
            stage: 'dry-run',
            message: 'Unsupported action.',
            validationErrors: [
              {
                code: 'GRAPH.UNSUPPORTED',
                path: 'actions.0.op',
                severity: 'error',
                message: 'Unsupported action.',
                repairOptions: ['Use setParam.'],
              },
            ],
            previousRevision: 31,
            appliedRevision: 31,
            snapshot: authority.getSnapshot(),
          };
    },
  };
  const responses = [
    {
      content: '{"version":1,"id":"turn:bad","actions":[{"op":"unsupported","nodeId":"client:flashlight"}]}',
      parsed: null,
    },
    {
      content: '{"version":1,"id":"turn:repaired","actions":[{"op":"setParam","nodeId":"client:flashlight","param":"active","value":false}]}',
      parsed: null,
    },
  ];
  const chatClient = {
    describeConfig: () => ({
      baseUrl: 'https://code.b886.top/v1',
      model: 'gpt-5.5',
      apiKey: '[REDACTED]',
      supportsJsonSchema: true,
      timeoutMs: 30_000,
    }),
    completeJson: async (input: { messages: Array<{ content: string }> }) => {
      prompts.push(input.messages.map((message) => message.content).join('\n'));
      const response = responses.shift();
      assert.ok(response);
      return {
        raw: { ok: true },
        content: response.content,
        parsed: response.parsed,
        request: { url: 'https://code.b886.top/v1/chat/completions', body: {} },
      };
    },
  };

  const orchestrator = new AiOrchestratorService(
    authority as never,
    chatClient as never,
    skillRegistry,
    { write: (record) => loggerRecords.push(record) }
  );

  const result = await orchestrator.handleEnvironmentEvent({
    type: 'client.text.final',
    clientId: 'client-1',
    text: '关闭 flashlight',
  });

  assert.equal(prompts.length, 2);
  assert.equal(prompts[1].includes('repair'), true);
  assert.equal(result.turns[0]?.plan?.id, 'turn:repaired');
  assert.deepEqual(dispatches.map((item) => [item.command.type, item.dryRun]), [
    ['node.params.update', true],
    ['node.params.update', false],
  ]);
  assert.equal(loggerRecords.some((record) => record.kind === 'ai.turn.repair.request'), true);
});

test('orchestrator repairs natural-language-plus-json output instead of using flashlight regex fallback', async () => {
  const dispatches: Array<{ command: Record<string, unknown>; dryRun?: boolean }> = [];
  const prompts: string[] = [];
  const authority = {
    getSnapshot: () => ({
      revision: 41,
      nodes: [
        {
          id: 'client:flashlight',
          type: 'proc-flashlight',
          params: { frequencyHz: 2 },
          inputValues: {},
          outputValues: {},
        },
      ],
      definitions: [],
      connections: [],
      groups: [
        {
          id: 'ai-space:agent',
          parentId: null,
          kind: 'ai-space',
          name: 'Agent Space',
          nodeIds: ['client:flashlight'],
          disabled: false,
          agentPolicy: {
            enabled: true,
            allowedActorIds: ['ai-orchestrator'],
            allowedCommands: ['node.params.update'],
            targetScope: { nodeIds: ['client:flashlight'], allowNewNodes: false },
          },
          agentInterface: {
            exposedNodeIds: ['client:flashlight'],
            callableCommands: ['node.params.update'],
            eventBindings: ['client.text.final'],
          },
        },
      ],
      partitions: [],
      runtimeStatus: { running: false, deployedPartitionIds: [] },
      deviceCapabilities: [],
      errors: [],
      permissions: [],
      proposals: [],
    }),
    dispatch: (input: { command: Record<string, unknown>; dryRun?: boolean }) => {
      dispatches.push(input);
      return {
        ok: true,
        command: input.command,
        dryRun: Boolean(input.dryRun),
        previousRevision: 41,
        appliedRevision: 41,
        rollbackToken: 'rollback:41',
        snapshot: authority.getSnapshot(),
      };
    },
  };
  const chatClient = {
    describeConfig: () => ({
      baseUrl: 'https://code.b886.top/v1',
      model: 'gpt-5.5',
      apiKey: '[REDACTED]',
      supportsJsonSchema: true,
      timeoutMs: 30_000,
    }),
    completeJson: async (input: { messages: Array<{ content: string }> }) => {
      prompts.push(input.messages.map((message) => message.content).join('\n'));
      if (prompts.length === 1) {
        return {
          raw: { ok: true },
          content:
            'I think this should change flashlight speed. {"version":1,"id":"turn:base","actions":[{"op":"unsupported","nodeId":"client:flashlight"}]}',
          parsed: null,
          request: { url: 'https://code.b886.top/v1/chat/completions', body: {} },
        };
      }
      return {
        raw: { ok: true },
        content:
          '{"version":1,"id":"turn:fixed","actions":[{"op":"setParam","nodeId":"client:flashlight","param":"frequencyHz","value":100}]}',
        parsed: null,
        request: { url: 'https://code.b886.top/v1/chat/completions', body: {} },
      };
    },
  };

  const orchestrator = new AiOrchestratorService(
    authority as never,
    chatClient as never,
    skillRegistry
  );

  const result = await orchestrator.handleEnvironmentEvent({
    type: 'client.text.final',
    clientId: 'client-1',
    text: '请把闪光频率调整为 100',
  });

  assert.equal(prompts.length, 2);
  assert.equal(result.turns[0]?.plan?.id, 'turn:fixed');
  assert.deepEqual(dispatches.map((item) => [item.command.type, item.dryRun]), [
    ['node.params.update', true],
    ['node.params.update', false],
  ]);
});

test('orchestrator stops repair after max attempts and does not apply invalid commands', async () => {
  const previousMaxAttempts = process.env.SHUGU_AI_REPAIR_MAX_ATTEMPTS;
  process.env.SHUGU_AI_REPAIR_MAX_ATTEMPTS = '1';
  const dispatches: Array<{ command: Record<string, unknown>; dryRun?: boolean }> = [];
  const authority = {
    getSnapshot: () => ({
      revision: 41,
      nodes: [
        {
          id: 'display:text',
          type: 'proc-display-text',
          params: { text: 'idle' },
          inputValues: {},
          outputValues: {},
        },
      ],
      definitions: [],
      connections: [],
      groups: [
        {
          id: 'ai-space:agent',
          parentId: null,
          kind: 'ai-space',
          name: 'Agent Space',
          nodeIds: ['display:text'],
          disabled: false,
          agentPolicy: {
            enabled: true,
            allowedActorIds: ['ai-orchestrator'],
            allowedCommands: ['node.params.update'],
            targetScope: { nodeIds: ['display:text'], allowNewNodes: false },
          },
          agentInterface: {
            exposedNodeIds: ['display:text'],
            callableCommands: ['node.params.update'],
            eventBindings: ['client.text.final'],
          },
        },
      ],
      partitions: [],
      runtimeStatus: { running: false, deployedPartitionIds: [] },
      deviceCapabilities: [],
      errors: [],
      permissions: [],
      proposals: [],
    }),
    dispatch: (input: { command: Record<string, unknown>; dryRun?: boolean }) => {
      dispatches.push(input);
      return {
        ok: false,
        command: input.command,
        dryRun: Boolean(input.dryRun),
        stage: 'dry-run',
        message: 'Target node not found.',
        validationErrors: [
          {
            code: 'GRAPH.NODE_NOT_FOUND',
            path: 'nodeId',
            severity: 'error',
            message: 'Target node not found.',
            repairOptions: ['Choose an existing scoped node id.'],
          },
        ],
        previousRevision: 41,
        appliedRevision: 41,
        snapshot: authority.getSnapshot(),
      };
    },
  };
  const chatClient = {
    describeConfig: () => ({
      baseUrl: 'https://code.b886.top/v1',
      model: 'gpt-5.5',
      apiKey: '[REDACTED]',
      supportsJsonSchema: true,
      timeoutMs: 30_000,
    }),
    completeJson: async () => ({
      raw: { ok: true },
      content: JSON.stringify({
        version: 1,
        id: 'turn:bad',
        actions: [{ op: 'setParam', nodeId: 'display:text', param: 'text', value: 'bad' }],
      }),
      parsed: {
        version: 1,
        id: 'turn:bad',
        actions: [{ op: 'setParam', nodeId: 'display:text', param: 'text', value: 'bad' }],
      },
      request: { url: 'https://code.b886.top/v1/chat/completions', body: {} },
    }),
  };

  try {
    const orchestrator = new AiOrchestratorService(
      authority as never,
      chatClient as never,
      skillRegistry
    );
    const result = await orchestrator.handleEnvironmentEvent({
      type: 'client.text.final',
      clientId: 'client-1',
      text: 'update',
    });

    assert.equal(result.turns[0]?.plan, null);
    assert.deepEqual(dispatches.map((item) => item.dryRun), [true, true]);
    assert.equal(dispatches.some((item) => item.dryRun === false), false);
  } finally {
    if (previousMaxAttempts === undefined) delete process.env.SHUGU_AI_REPAIR_MAX_ATTEMPTS;
    else process.env.SHUGU_AI_REPAIR_MAX_ATTEMPTS = previousMaxAttempts;
  }
});

test('orchestrator includes bounded per-space conversation memory in later turns', async () => {
  const prompts: string[] = [];
  const authority = {
    getSnapshot: () => ({
      revision: 51,
      nodes: [
        {
          id: 'display:text',
          type: 'proc-display-text',
          params: { text: 'idle' },
          inputValues: {},
          outputValues: {},
        },
      ],
      definitions: [],
      connections: [],
      groups: [
        {
          id: 'ai-space:agent',
          parentId: null,
          kind: 'ai-space',
          name: 'Agent Space',
          nodeIds: ['display:text'],
          disabled: false,
          agentPolicy: {
            enabled: true,
            allowedActorIds: ['ai-orchestrator'],
            allowedCommands: ['node.params.update'],
            targetScope: { nodeIds: ['display:text'], allowNewNodes: false },
          },
          agentInterface: {
            exposedNodeIds: ['display:text'],
            callableCommands: ['node.params.update'],
            eventBindings: ['client.text.final'],
          },
        },
      ],
      partitions: [],
      runtimeStatus: { running: false, deployedPartitionIds: [] },
      deviceCapabilities: [],
      errors: [],
      permissions: [],
      proposals: [],
    }),
    dispatch: (input: { command: Record<string, unknown>; dryRun?: boolean }) => ({
      ok: true,
      command: input.command,
      dryRun: Boolean(input.dryRun),
      previousRevision: 51,
      appliedRevision: 52,
      rollbackToken: 'rollback:51',
      snapshot: authority.getSnapshot(),
    }),
  };
  const chatClient = {
    describeConfig: () => ({
      baseUrl: 'https://code.b886.top/v1',
      model: 'gpt-5.5',
      apiKey: '[REDACTED]',
      supportsJsonSchema: true,
      timeoutMs: 30_000,
    }),
    completeJson: async (input: { messages: Array<{ content: string }> }) => {
      prompts.push(input.messages.map((message) => message.content).join('\n'));
      const text = prompts.length === 1 ? '你好，我在' : '继续刚才的问候';
      return {
        raw: { ok: true },
        content: JSON.stringify({
          version: 1,
          id: `turn:${prompts.length}`,
          summary: prompts.length === 1 ? 'first greeting' : 'follow-up greeting',
          actions: [{ op: 'setParam', nodeId: 'display:text', param: 'text', value: text }],
        }),
        parsed: {
          version: 1,
          id: `turn:${prompts.length}`,
          summary: prompts.length === 1 ? 'first greeting' : 'follow-up greeting',
          actions: [{ op: 'setParam', nodeId: 'display:text', param: 'text', value: text }],
        },
        request: { url: 'https://code.b886.top/v1/chat/completions', body: {} },
      };
    },
  };

  const orchestrator = new AiOrchestratorService(
    authority as never,
    chatClient as never,
    skillRegistry
  );

  await orchestrator.handleEnvironmentEvent({
    type: 'client.text.final',
    clientId: 'client-1',
    text: '你好',
  });
  await orchestrator.handleEnvironmentEvent({
    type: 'client.text.final',
    clientId: 'client-1',
    text: '继续',
  });

  assert.equal(prompts.length, 2);
  assert.equal(prompts[0].includes('"memory"'), true);
  assert.equal(prompts[1].includes('"first greeting"'), true);
  assert.equal(prompts[1].includes('"maxTurns"'), true);
});

test('orchestrator keeps capability manifest available when many node definitions exist', async () => {
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
  const authority = {
    getSnapshot: () => ({
      revision: 61,
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
      groups: [
        {
          id: 'ai-space:large',
          parentId: null,
          kind: 'ai-space',
          name: 'Large Space',
          nodeIds: ['scene'],
          disabled: false,
          agentPolicy: {
            enabled: true,
            allowedActorIds: ['ai-orchestrator'],
            allowedCommands: ['node.add', 'node.params.update'],
            targetScope: { nodeIds: ['scene'], allowNewNodes: true },
            budgets: { maxNodes: 16, maxConnections: 20, maxParamsPerCommand: 8 },
          },
          agentInterface: {
            exposedNodeIds: ['scene'],
            callableCommands: ['node.add', 'node.params.update'],
            eventBindings: ['client.text.final'],
          },
        },
      ],
      partitions: [],
      runtimeStatus: { running: false, deployedPartitionIds: [] },
      deviceCapabilities: [],
      errors: [],
      permissions: [],
      proposals: [],
    }),
    dispatch: (input: { command: Record<string, unknown>; dryRun?: boolean }) => ({
      ok: true,
      command: input.command,
      dryRun: Boolean(input.dryRun),
      previousRevision: 61,
      appliedRevision: 62,
      rollbackToken: 'rollback:61',
      snapshot: authority.getSnapshot(),
    }),
  };
  const prompts: string[] = [];
  const debugRecords: Array<Record<string, unknown>> = [];
  const chatClient = {
    describeConfig: () => ({
      baseUrl: 'https://code.b886.top/v1',
      model: 'gpt-5.5',
      apiKey: '[REDACTED]',
      supportsJsonSchema: true,
      timeoutMs: 30_000,
    }),
    completeJson: async (input: { messages: Array<{ content: string }> }) => {
      prompts.push(input.messages.map((message) => message.content).join('\n'));
      return {
        raw: { ok: true },
        content: JSON.stringify({
          version: 1,
          id: 'turn:large',
          summary: 'adjust scene',
          actions: [{ op: 'setParam', nodeId: 'scene', param: 'sensitivity', value: 3 }],
        }),
        parsed: {
          version: 1,
          id: 'turn:large',
          summary: 'adjust scene',
          actions: [{ op: 'setParam', nodeId: 'scene', param: 'sensitivity', value: 3 }],
        },
        request: { url: 'https://code.b886.top/v1/chat/completions', body: {} },
      };
    },
  };

  const orchestrator = new AiOrchestratorService(
    authority as never,
    chatClient as never,
    skillRegistry,
    { write: (record: Record<string, unknown>) => debugRecords.push(record) }
  );

  await orchestrator.handleEnvironmentEvent({
    type: 'client.text.final',
    clientId: 'client-1',
    text: '提高敏感度',
  });

  const requestLog = debugRecords.find((record) => record.kind === 'ai.turn.request') as
    | { promptBudget?: { dropped?: Array<{ id: string }> } }
    | undefined;
  assert.ok(requestLog);
  assert.equal(
    requestLog.promptBudget?.dropped?.some((item) => item.id === 'capabilityManifest'),
    false
  );
  assert.match(prompts[0], /"kind":"capabilityManifest"/);
  assert.match(prompts[0], /"type":"scene-fct-track"/);
  assert.match(prompts[0], /"key":"sensitivity"/);
  assert.equal(prompts[0].includes('"param-19"'), false);
});
