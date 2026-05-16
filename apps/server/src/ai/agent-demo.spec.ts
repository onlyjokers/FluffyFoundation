/**
 * Purpose: Verify the first AI Agent demo loop from client join/text events into semantic commands.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { createAgentSkillRegistry } from '@shugu/ai-core';
import { createSensorDataMessage, type Message } from '@shugu/protocol';

import { MessageRouterService } from '../message-router/message-router.service.js';
import { AiOrchestratorService } from './ai-orchestrator.service.js';

const createDemoSnapshot = () => ({
  revision: 101,
  nodes: [
    {
      id: 'display:greeting',
      type: 'display-breathing',
      params: { intensity: 0.2, breathRate: 0.8 },
      inputValues: {},
      outputValues: {},
    },
    {
      id: 'client:pulse',
      type: 'client-pulse',
      params: { brightness: 0.1, flicker: 0 },
      inputValues: {},
      outputValues: {},
    },
  ],
  definitions: [],
  connections: [],
  groups: [
    {
      id: 'ai-space:client-1',
      parentId: null,
      kind: 'ai-space',
      name: 'Client 1 AI Space',
      nodeIds: ['display:greeting', 'client:pulse'],
      disabled: false,
      surface: 'internal',
      visibility: { defaultAccess: 'visible-readonly' },
      agentPolicy: {
        enabled: true,
        allowedActorIds: ['ai-orchestrator'],
        allowedCommands: ['node.params.update'],
        targetScope: { nodeIds: ['display:greeting', 'client:pulse'], allowNewNodes: true },
        budgets: { maxNodes: 4, maxConnections: 2, maxParamsPerCommand: 3 },
      },
      agentInterface: {
        publicInputs: [{ id: 'speech', type: 'string', label: 'Speech text' }],
        publicOutputs: [{ id: 'display', type: 'string', label: 'Display response' }],
        exposedNodeIds: ['display:greeting', 'client:pulse'],
        callableCommands: ['node.params.update'],
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
});

const skillRegistry = createAgentSkillRegistry({
  skills: [
    {
      id: 'demo.display-greeting',
      title: 'Display Greeting',
      summary: 'Say hello on Display and make the joined Client pulse.',
      triggers: {
        nodeTypes: ['display-breathing', 'client-pulse'],
        commandTypes: ['node.params.update'],
        eventTypes: ['client.joined', 'client.text.final'],
      },
      content: 'Use node.params.update inside the assigned AI Space.',
    },
  ],
});

const waitFor = async (condition: () => boolean): Promise<void> => {
  const deadline = Date.now() + 500;
  while (Date.now() < deadline) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.equal(condition(), true);
};

test('AI demo loop routes client join and text through the shared semantic layer', async () => {
  const delivered: Array<{ socketIds: string[]; message: Message }> = [];
  const dispatches: Array<{ command: Record<string, unknown>; dryRun?: boolean }> = [];
  const authority = {
    getSnapshot: createDemoSnapshot,
    dispatch: (input: { command: Record<string, unknown>; dryRun?: boolean }) => {
      dispatches.push(input);
      return {
        ok: true,
        command: input.command,
        dryRun: Boolean(input.dryRun),
        previousRevision: 101,
        appliedRevision: 102,
        rollbackToken: 'rollback:101',
        audit: { id: 'audit:101', command: input.command, dryRun: Boolean(input.dryRun) },
        snapshot: createDemoSnapshot(),
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
      const prompt = input.messages.map((message) => message.content).join('\n');
      if (prompt.includes('"type":"client.joined"')) {
        return {
          raw: null,
          content: '',
          parsed: {
            id: 'demo:join',
            summary: 'Greet traveler and pulse the phone.',
            commands: [
              {
                type: 'node.params.update',
                scopeGroupId: 'ai-space:client-1',
                nodeId: 'display:greeting',
                params: { message: '你好，旅行者', intensity: 0.7 },
              },
              {
                type: 'node.params.update',
                scopeGroupId: 'ai-space:client-1',
                nodeId: 'client:pulse',
                params: { brightness: 1, flicker: 0.5 },
              },
            ],
          },
          request: { url: 'https://code.b886.top/v1/chat/completions', body: {} },
        };
      }
      return {
        raw: null,
        content: '',
        parsed: {
          id: 'demo:text',
          summary: 'Continue the exchange.',
          commands: [
            {
              type: 'node.params.update',
              scopeGroupId: 'ai-space:client-1',
              nodeId: 'display:greeting',
              params: { message: '我听见了你的声音', intensity: 0.9 },
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
  const registry = {
    getAllClientSocketIds: () => ['socket-client-1'],
    getAllManagerSocketIds: () => ['socket-manager-1'],
    getSocketIds: (ids: string[]) => ids.map((id) => `${id}-socket`),
    getClientsByGroup: () => [
      { clientId: 'client-1', socketId: 'socket-client-1', group: 'ai-space:client-1' },
    ],
    getClient: () => ({
      clientId: 'client-1',
      socketId: 'socket-client-1',
      group: 'ai-space:client-1',
    }),
    getAllClients: () => [{ clientId: 'client-1', connected: true, group: 'ai-space:client-1' }],
    getAllGroupOwnershipEntries: () => [],
  };
  const RouterCtor = MessageRouterService as unknown as new (
    ...args: unknown[]
  ) => MessageRouterService;
  const router = new RouterCtor(registry, undefined, orchestrator);
  const server = {
    to: (socketIds: string[]) => ({
      emit: (_event: string, message: Message) => delivered.push({ socketIds, message }),
    }),
    volatile: {
      to: (socketIds: string[]) => ({
        emit: (_event: string, message: Message) => delivered.push({ socketIds, message }),
      }),
    },
  };
  router.setServer(server as never);

  router.notifyClientJoined('client-1');
  await waitFor(() => dispatches.length === 4);

  assert.deepEqual(
    dispatches.map((entry) => [entry.command.type, entry.command.nodeId, entry.dryRun]),
    [
      ['node.params.update', 'display:greeting', true],
      ['node.params.update', 'display:greeting', false],
      ['node.params.update', 'client:pulse', true],
      ['node.params.update', 'client:pulse', false],
    ]
  );
  assert.equal(
    delivered.some((entry) => (entry.message as { action?: string }).action === 'clientJoined'),
    true
  );

  router.routeMessage(
    createSensorDataMessage('client-1', 'custom', { kind: 'agent-text', text: '我想去看海' }),
    'socket-client-1'
  );
  await waitFor(() => dispatches.length === 6);

  assert.deepEqual(
    dispatches.slice(4).map((entry) => [entry.command.type, entry.command.nodeId, entry.dryRun]),
    [
      ['node.params.update', 'display:greeting', true],
      ['node.params.update', 'display:greeting', false],
    ]
  );
  assert.equal(
    delivered.some(
      (entry) =>
        entry.message.type === 'data' &&
        (entry.message as { payload?: { kind?: string; text?: string } }).payload?.kind ===
          'agent-text' &&
        (entry.message as { payload?: { kind?: string; text?: string } }).payload?.text ===
          '我想去看海'
    ),
    true
  );
});
