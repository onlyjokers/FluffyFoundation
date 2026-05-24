/**
 * Purpose: Regression coverage for printer bridge routing and print-job dedupe planning.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { GraphState } from '$lib/nodes/types';
import {
  collectPrinterRoutes,
  diffPrinterBridgeJobs,
  resolvePrinterTargets,
} from './bridge-core';

test('resolvePrinterTargets supports index range random and clamps to available printers', () => {
  const graph: GraphState = {
    nodes: [
      {
        id: 'printer-1',
        type: 'printer-object',
        position: { x: 0, y: 0 },
        config: {},
        inputValues: { index: 99, range: 99, random: false },
        outputValues: {},
      },
      {
        id: 'printer-2',
        type: 'printer-object',
        position: { x: 0, y: 0 },
        config: {},
        inputValues: { index: 2, range: 2, random: true },
        outputValues: {},
      },
    ],
    connections: [],
  };

  assert.deepEqual(
    resolvePrinterTargets({
      graph,
      nodeId: 'printer-1',
      printerIdsInOrder: () => ['printer-a', 'printer-b', 'printer-c'],
      getComputedInputs: () => null,
    }),
    { explicit: true, ids: ['printer-c', 'printer-a', 'printer-b'] }
  );
  assert.deepEqual(
    resolvePrinterTargets({
      graph,
      nodeId: 'printer-2',
      printerIdsInOrder: () => ['printer-a', 'printer-b', 'printer-c'],
      getComputedInputs: () => null,
    }),
    { explicit: true, ids: ['printer-b', 'printer-c'] }
  );
});

test('collectPrinterRoutes emits print payloads routed directly to Printer object', () => {
  const result = collectPrinterRoutes({
    graph: {
      nodes: [
        {
          id: 'text-1',
          type: 'plugin:printer:print-text',
          position: { x: 0, y: 0 },
          config: {},
          inputValues: { text: 'Ticket 1' },
          outputValues: {},
        },
        {
          id: 'printer-1',
          type: 'printer-object',
          position: { x: 0, y: 0 },
          config: {},
          inputValues: { index: 2, range: 2, random: false },
          outputValues: {},
        },
      ],
      connections: [
        {
          id: 'c1',
          sourceNodeId: 'text-1',
          sourcePortId: 'print',
          targetNodeId: 'printer-1',
          targetPortId: 'in',
        },
      ],
    },
    getComputedInputs: () => null,
    printerIdsInOrder: () => ['printer-a', 'printer-b', 'printer-c'],
  });

  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.routes, [
    {
      printerId: 'printer-b',
      payload: {
        target: 'printer',
        kind: 'text',
        nodeId: 'text-1',
        text: 'Ticket 1',
        signature: 'text:text-1:Ticket 1',
      },
    },
    {
      printerId: 'printer-c',
      payload: {
        target: 'printer',
        kind: 'text',
        nodeId: 'text-1',
        text: 'Ticket 1',
        signature: 'text:text-1:Ticket 1',
      },
    },
  ]);
});

test('collectPrinterRoutes uses computed inputs before inline node values', () => {
  const result = collectPrinterRoutes({
    graph: {
      nodes: [
        {
          id: 'image-1',
          type: 'plugin:printer:print-image',
          position: { x: 0, y: 0 },
          config: {},
          inputValues: { image: 'asset:old' },
          outputValues: {},
        },
        {
          id: 'printer-1',
          type: 'printer-object',
          position: { x: 0, y: 0 },
          config: {},
          inputValues: {},
          outputValues: {},
        },
      ],
      connections: [
        {
          id: 'c1',
          sourceNodeId: 'image-1',
          sourcePortId: 'print',
          targetNodeId: 'printer-1',
          targetPortId: 'in',
        },
      ],
    },
    getComputedInputs: (nodeId) => (nodeId === 'image-1' ? { image: 'asset:new' } : null),
    printerIdsInOrder: () => ['printer-a'],
  });

  assert.deepEqual(result.errors, []);
  assert.equal(result.routes[0]?.payload.kind, 'image');
  assert.equal(result.routes[0]?.payload.kind === 'image' ? result.routes[0].payload.image : '', 'asset:new');
});

test('diffPrinterBridgeJobs prints changed content once and dedupes repeated graph ticks', () => {
  const first = diffPrinterBridgeJobs(new Map(), [
    {
      printerId: 'printer-a',
      payload: {
        target: 'printer',
        kind: 'text',
        nodeId: 'text-1',
        text: 'Ticket 1',
        signature: 'text:text-1:Ticket 1',
      },
    },
  ]);
  assert.deepEqual(first.jobs.map((job) => [job.printerId, job.payload.signature]), [
    ['printer-a', 'text:text-1:Ticket 1'],
  ]);

  const unchanged = diffPrinterBridgeJobs(first.nextPrinted, [
    {
      printerId: 'printer-a',
      payload: {
        target: 'printer',
        kind: 'text',
        nodeId: 'text-1',
        text: 'Ticket 1',
        signature: 'text:text-1:Ticket 1',
      },
    },
  ]);
  assert.deepEqual(unchanged.jobs, []);

  const changed = diffPrinterBridgeJobs(first.nextPrinted, [
    {
      printerId: 'printer-a',
      payload: {
        target: 'printer',
        kind: 'text',
        nodeId: 'text-1',
        text: 'Ticket 2',
        signature: 'text:text-1:Ticket 2',
      },
    },
  ]);
  assert.deepEqual(changed.jobs.map((job) => job.payload.signature), ['text:text-1:Ticket 2']);
});
