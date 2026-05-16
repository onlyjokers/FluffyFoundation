/**
 * Purpose: Verify AI orchestrator debug logging captures prompt, response, and dispatch evidence.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createAgentSkillRegistry } from '@shugu/ai-core';

import { AiOrchestratorService } from '../dist-out/ai/ai-orchestrator.service.js';

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
  definitions: [],
  connections: [],
  groups: [
    {
      id: 'ai-space:test',
      parentId: null,
      kind: 'ai-space',
      name: 'Test Space',
      nodeIds: ['message'],
      disabled: false,
      agentPolicy: {
        enabled: true,
        allowedActorIds: ['ai-orchestrator'],
        allowedCommands: ['node.params.update'],
        targetScope: { nodeIds: ['message'], allowNewNodes: true },
      },
      agentInterface: {
        publicInputs: [{ id: 'client_text', type: 'string', label: 'Client Text' }],
        publicOutputs: [{ id: 'message', type: 'string', label: 'Message' }],
        exposedNodeIds: ['message'],
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
};

test('AI orchestrator writes structured debug events around a successful turn', async () => {
  const events = [];
  const authority = {
    getSnapshot: () => snapshot,
    dispatch: (input) => ({
      ok: true,
      command: input.command,
      dryRun: Boolean(input.dryRun),
      previousRevision: 1,
      appliedRevision: input.dryRun ? 1 : 2,
      snapshot,
    }),
  };
  const chatClient = {
    describeConfig: () => ({
      baseUrl: 'https://example.test/v1',
      model: 'gpt-5.5',
      apiKey: '[REDACTED]',
      supportsJsonSchema: true,
      timeoutMs: 30_000,
    }),
    completeJson: async () => ({
      raw: { ok: true },
      content:
        '{"id":"turn:test","commands":[{"type":"node.params.update","nodeId":"message","params":{"value":"你好"}}]}',
      parsed: {
        id: 'turn:test',
        commands: [
          {
            type: 'node.params.update',
            nodeId: 'message',
            params: { value: '你好' },
          },
        ],
      },
      request: { url: 'https://example.test/v1/chat/completions', body: {} },
    }),
  };
  const skillRegistry = createAgentSkillRegistry({ skills: [] });
  const logger = { write: (event) => events.push(event) };
  const orchestrator = new AiOrchestratorService(
    authority,
    chatClient,
    skillRegistry,
    logger
  );

  await orchestrator.handleEnvironmentEvent({
    type: 'client.text.final',
    clientId: 'client-1',
    groupId: 'client:client-1',
    text: '你好',
  });

  const kinds = events.map((event) => event.kind);
  assert.ok(kinds.includes('ai.turn.request'));
  assert.ok(kinds.includes('ai.turn.response'));
  assert.ok(kinds.includes('ai.turn.dispatch'));
  assert.ok(kinds.includes('ai.turn.complete'));

  const request = events.find((event) => event.kind === 'ai.turn.request');
  assert.equal(request.event.text, '你好');
  assert.match(request.messages[1].content, /client\.text\.final/);

  const dispatches = events.filter((event) => event.kind === 'ai.turn.dispatch');
  assert.equal(dispatches.length, 2);
  assert.equal(dispatches[0].dryRun, true);
  assert.equal(dispatches[1].dryRun, false);
  assert.equal(dispatches[1].result.ok, true);
});

test('AI orchestrator does not use local flashlight fallback when provider returns no plan', async () => {
  const dispatches = [];
  const fallbackSnapshot = {
    ...snapshot,
    nodes: [
      {
        id: 'message',
        type: 'string',
        params: { value: 'hello' },
        inputValues: {},
        outputValues: {},
      },
      {
        id: 'displayText',
        type: 'proc-display-text',
        params: { text: 'hello' },
        inputValues: {},
        outputValues: {},
      },
      {
        id: 'rate',
        type: 'number',
        params: { value: 2 },
        inputValues: {},
        outputValues: {},
      },
      {
        id: 'flashlight',
        type: 'proc-flashlight',
        params: { active: true, mode: 'blink', frequencyHz: 2 },
        inputValues: {},
        outputValues: {},
      },
    ],
    connections: [
      {
        id: 'rate-to-flashlight',
        sourceNodeId: 'rate',
        sourcePortId: 'value',
        targetNodeId: 'flashlight',
        targetPortId: 'frequencyHz',
      },
    ],
    groups: [
      {
        ...snapshot.groups[0],
        nodeIds: ['message', 'displayText', 'rate', 'flashlight'],
        agentPolicy: {
          ...snapshot.groups[0].agentPolicy,
          targetScope: { nodeIds: ['message', 'displayText', 'rate', 'flashlight'], allowNewNodes: true },
        },
      },
    ],
  };
  const authority = {
    getSnapshot: () => fallbackSnapshot,
    dispatch: (input) => {
      dispatches.push(input);
      return {
        ok: true,
        command: input.command,
        dryRun: Boolean(input.dryRun),
        previousRevision: 1,
        appliedRevision: input.dryRun ? 1 : 2,
        snapshot: fallbackSnapshot,
      };
    },
  };
  const chatClient = {
    describeConfig: () => ({
      baseUrl: 'https://example.test/v1',
      model: 'gpt-5.5',
      apiKey: '[REDACTED]',
      supportsJsonSchema: true,
      timeoutMs: 30_000,
    }),
    completeJson: async () => ({
      raw: [{ choices: [], usage: { completion_tokens: 0 } }],
      content: '',
      parsed: null,
      request: { url: 'https://example.test/v1/chat/completions', body: {} },
    }),
  };
  const skillRegistry = createAgentSkillRegistry({ skills: [] });
  const events = [];
  const orchestrator = new AiOrchestratorService(
    authority,
    chatClient,
    skillRegistry,
    { write: (event) => events.push(event) }
  );

  const hello = await orchestrator.handleEnvironmentEvent({
    type: 'client.text.final',
    clientId: 'client-1',
    groupId: 'client:client-1',
    text: '你好',
  });

  assert.equal(hello.turns[0].plan, null);
  assert.equal(dispatches.length, 0);
  assert.equal(events.some((event) => event.kind === 'ai.turn.fallback'), false);

  dispatches.length = 0;
  const rate = await orchestrator.handleEnvironmentEvent({
    type: 'client.text.final',
    clientId: 'client-1',
    groupId: 'client:client-1',
    text: '请把闪光的频率调整为 100',
  });

  assert.equal(rate.turns[0].plan, null);
  assert.equal(dispatches.length, 0);
  assert.equal(events.some((event) => event.kind === 'ai.turn.fallback'), false);
});

test('AI orchestrator does not mirror client text when provider aborts', async () => {
  const dispatches = [];
  const authority = {
    getSnapshot: () => snapshot,
    dispatch: (input) => {
      dispatches.push(input);
      return {
        ok: true,
        command: input.command,
        dryRun: Boolean(input.dryRun),
        previousRevision: 1,
        appliedRevision: input.dryRun ? 1 : 2,
        snapshot,
      };
    },
  };
  const chatClient = {
    describeConfig: () => ({
      baseUrl: 'https://example.test/v1',
      model: 'gpt-5.5',
      apiKey: '[REDACTED]',
      supportsJsonSchema: true,
      timeoutMs: 30_000,
    }),
    completeJson: async () => {
      throw new DOMException('This operation was aborted', 'AbortError');
    },
  };
  const events = [];
  const orchestrator = new AiOrchestratorService(
    authority,
    chatClient,
    createAgentSkillRegistry({ skills: [] }),
    { write: (event) => events.push(event) }
  );

  const result = await orchestrator.handleEnvironmentEvent({
    type: 'client.text.final',
    clientId: 'client-1',
    groupId: 'client:client-1',
    text: '你好',
  });

  assert.equal(result.turns[0].plan, null);
  assert.equal(dispatches.length, 0);
  assert.equal(events.some((event) => event.kind === 'ai.turn.error'), true);
  assert.equal(events.some((event) => event.kind === 'ai.turn.fallback'), false);
});
