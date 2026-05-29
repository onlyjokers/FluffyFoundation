/**
 * Purpose: Verify the AI Agent runtime serializes triggers and keeps only the newest pending work.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { AiAgentRuntimeService, type AiAgentTrigger } from './ai-agent-runtime.service.js';

const waitFor = async (condition: () => boolean): Promise<void> => {
  const deadline = Date.now() + 500;
  while (Date.now() < deadline) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.equal(condition(), true);
};

const trigger = (id: string, text = id): AiAgentTrigger => ({
  id,
  source: 'user',
  priority: 'user',
  event: { type: 'client.text.final', clientId: 'client-1', text },
  createdAt: Date.now(),
});

test('AI runtime runs one trigger at a time and keeps only the newest pending trigger', async () => {
  const started: string[] = [];
  const completed: string[] = [];
  const releases = new Map<string, () => void>();
  const runtime = new AiAgentRuntimeService({
    orchestrator: {
      handleEnvironmentEvent: async (event) => {
        const id = event.type === 'client.text.final' ? event.text : event.type;
        started.push(id);
        await new Promise<void>((resolve) => releases.set(id, resolve));
        completed.push(id);
        return { event, turns: [] };
      },
    },
    broadcastSemanticSnapshot: () => undefined,
    now: () => Date.now(),
    autoStartIdle: false,
  });

  runtime.enqueue(trigger('first'));
  await waitFor(() => started.includes('first'));
  runtime.enqueue(trigger('second'));
  runtime.enqueue(trigger('third'));

  assert.deepEqual(started, ['first']);
  releases.get('first')?.();
  await waitFor(() => started.includes('third'));
  assert.deepEqual(started, ['first', 'third']);
  assert.equal(started.includes('second'), false);
  releases.get('third')?.();
  await waitFor(() => completed.includes('third'));
});

test('AI runtime ignores superseded active results before broadcasting snapshots', async () => {
  const snapshots: unknown[] = [];
  const releases = new Map<string, () => void>();
  const runtime = new AiAgentRuntimeService({
    orchestrator: {
      handleEnvironmentEvent: async (event, context) => {
        const id = event.type === 'client.text.final' ? event.text : event.type;
        await new Promise<void>((resolve) => releases.set(id, resolve));
        if (context?.isSuperseded?.()) return { event, turns: [] };
        return {
          event,
          turns: [
            {
              targetSpaceId: 'ai-space:agent',
              plan: null,
              skills: [],
              dispatchResults: [
                {
                  ok: true,
                  command: { type: 'graph.snapshot' },
                  dryRun: false,
                  previousRevision: 1,
                  appliedRevision: 2,
                  rollbackToken: 'rollback:1',
                  audit: { id: `audit:${id}` } as never,
                  snapshot: {
                    revision: id,
                    nodes: [],
                    definitions: [],
                    connections: [],
                    groups: [],
                    partitions: [],
                    runtimeStatus: { running: false, deployedPartitionIds: [] },
                    deviceCapabilities: [],
                    errors: [],
                    permissions: [],
                  } as never,
                },
              ],
            },
          ],
        };
      },
    },
    broadcastSemanticSnapshot: (snapshot) => snapshots.push(snapshot),
    now: () => Date.now(),
    autoStartIdle: false,
  });

  runtime.enqueue(trigger('old'));
  await waitFor(() => releases.has('old'));
  runtime.enqueue(trigger('new'));
  releases.get('old')?.();
  await waitFor(() => releases.has('new'));
  releases.get('new')?.();
  await waitFor(() => snapshots.length === 1);

  assert.deepEqual(snapshots.map((snapshot) => (snapshot as { revision?: string }).revision), ['new']);
});

test('AI runtime idle tick requests one screenshot and enqueues a vision idle trigger', async () => {
  const enqueuedEvents: string[] = [];
  const controlMessages: Array<{ target: unknown; payload: unknown }> = [];
  const nowValues = [10_000, 10_000, 30_000, 30_000];
  const runtime = new AiAgentRuntimeService({
    orchestrator: {
      handleEnvironmentEvent: async (event) => {
        enqueuedEvents.push(event.type);
        return { event, turns: [] };
      },
    },
    broadcastSemanticSnapshot: () => undefined,
    getOnlineClients: () => [{ clientId: 'client-1', group: 'client:client-1' }],
    hasVisionIdleSpace: () => true,
    sendClientControl: (target, payload) => {
      controlMessages.push({ target, payload });
    },
    now: () => nowValues.shift() ?? 30_000,
    idleIntervalMs: 10_000,
    idleQuietMs: 15_000,
    visionCaptureTimeoutMs: 50,
    autoStartIdle: false,
  });

  runtime.markUserActivity();
  await runtime.runIdleTickForTest();
  assert.equal(controlMessages.length, 0);

  const capture = runtime.runIdleTickForTest();
  await waitFor(() => controlMessages.length === 1);
  runtime.handleClientScreenshot({
    clientId: 'client-1',
    dataUrl: 'data:image/webp;base64,abc',
    mime: 'image/webp',
    width: 100,
    height: 60,
    createdAt: 30_001,
  });
  await capture;
  await waitFor(() => enqueuedEvents.includes('vision.idle'));

  assert.deepEqual(controlMessages[0]?.target, { mode: 'clientIds', ids: ['client-1'] });
  assert.equal(
    (controlMessages[0]?.payload as { kind?: string }).kind,
    'push-image-upload'
  );
});
