/**
 * Purpose: Pure printer bridge planning from Manager node graph state to print jobs.
 */
import {
  PRINT_IMAGE_NODE_TYPE,
  PRINT_TEXT_NODE_TYPE,
  PRINTER_OBJECT_NODE_TYPE,
  buildPrintImagePayload,
  buildPrintTextPayload,
  type PrintPayload,
} from '@shugu/printer-plugin';

import type { Connection, GraphState, NodeInstance } from '$lib/nodes/types';

export type PrinterBridgeError = {
  nodeId: string;
  message: string;
};

export type PrinterRoute = {
  printerId: string;
  payload: PrintPayload;
};

export type PrinterBridgePrinted = {
  signature: string;
};

export type PrinterBridgeJob = {
  printerId: string;
  payload: PrintPayload;
};

export type ResolvePrinterTargetsInput = {
  graph: Pick<GraphState, 'nodes' | 'connections'>;
  nodeId: string;
  printerIdsInOrder: () => string[];
  getComputedInputs: (nodeId: string) => Record<string, unknown> | null | undefined;
};

export type CollectPrinterRoutesInput = {
  graph: Pick<GraphState, 'nodes' | 'connections'>;
  getComputedInputs: (nodeId: string) => Record<string, unknown> | null | undefined;
  printerIdsInOrder: () => string[];
};

function nodeById(graph: Pick<GraphState, 'nodes'>): Map<string, NodeInstance> {
  return new Map((graph.nodes ?? []).map((node) => [String(node.id), node]));
}

function incomingTo(graph: Pick<GraphState, 'connections'>, nodeId: string, portId: string): Connection[] {
  return (graph.connections ?? []).filter(
    (connection) =>
      String(connection.targetNodeId ?? '') === nodeId &&
      String(connection.targetPortId ?? '') === portId
  );
}

function nodeInputs(node: NodeInstance, computed: Record<string, unknown> | null | undefined): Record<string, unknown> {
  return { ...(node.inputValues ?? {}), ...(computed ?? {}) };
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function hashStringDjb2(value: string): number {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) + hash + value.charCodeAt(i)) >>> 0;
  }
  return hash >>> 0;
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === 'string' ? Number(value) : Number(value);
  if (!Number.isFinite(n)) return fallback;
  const next = Math.floor(n);
  return Math.max(min, Math.min(max, next));
}

function coerceBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value >= 0.5 : false;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return false;
    if (normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'y') return true;
    if (normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === 'n') return false;
    return true;
  }
  return false;
}

function buildStablePrinterOrder(nodeId: string, ids: string[]): string[] {
  const keyed = ids.map((id) => ({ id, score: hashStringDjb2(`${nodeId}|${id}`) }));
  keyed.sort((a, b) => a.score - b.score || a.id.localeCompare(b.id));
  return keyed.map((entry) => entry.id);
}

function hasInputValue(node: NodeInstance, portId: 'index' | 'range' | 'random'): boolean {
  return hasOwn(node.inputValues ?? {}, portId);
}

function buildPayloadFromNode(
  node: NodeInstance,
  getComputedInputs: CollectPrinterRoutesInput['getComputedInputs']
): PrintPayload | null {
  const values = nodeInputs(node, getComputedInputs(String(node.id)));
  if (node.type === PRINT_TEXT_NODE_TYPE) {
    const payload = buildPrintTextPayload({ nodeId: node.id, text: values.text });
    return payload.text ? payload : null;
  }
  if (node.type === PRINT_IMAGE_NODE_TYPE) {
    const payload = buildPrintImagePayload({ nodeId: node.id, image: values.image });
    return payload.image ? payload : null;
  }
  return null;
}

export function resolvePrinterTargets(input: ResolvePrinterTargetsInput): { explicit: boolean; ids: string[] } {
  const printerIds = input.printerIdsInOrder().map(String).filter(Boolean);
  if (printerIds.length === 0) return { explicit: false, ids: [] };

  const node = nodeById(input.graph).get(input.nodeId);
  if (!node || node.type !== PRINTER_OBJECT_NODE_TYPE) {
    return { explicit: false, ids: printerIds };
  }

  const computed = input.getComputedInputs(input.nodeId) ?? null;
  const isPortConnected = (portId: 'index' | 'range' | 'random'): boolean =>
    incomingTo(input.graph, input.nodeId, portId).length > 0;
  const hasComputedInput = (portId: 'index' | 'range' | 'random'): boolean =>
    Boolean(computed && hasOwn(computed, portId));
  const hasExplicitRoutingInput = (['index', 'range', 'random'] as const).some(
    (portId) => isPortConnected(portId) || hasComputedInput(portId) || hasInputValue(node, portId)
  );

  if (!hasExplicitRoutingInput) return { explicit: false, ids: printerIds };

  const getEffectiveInput = (portId: 'index' | 'range' | 'random'): unknown => {
    if (isPortConnected(portId) && computed && hasOwn(computed, portId)) return computed[portId];
    return node.inputValues?.[portId];
  };

  const total = printerIds.length;
  const random = coerceBoolean(getEffectiveInput('random'));
  const ordered = random ? buildStablePrinterOrder(input.nodeId, printerIds) : printerIds;
  const index = clampInt(getEffectiveInput('index'), 1, 1, total);
  const range = clampInt(getEffectiveInput('range'), 1, 1, total);
  const ids: string[] = [];
  const start = index - 1;
  for (let i = 0; i < range; i += 1) ids.push(ordered[(start + i) % total]);
  return { explicit: true, ids };
}

export function collectPrinterRoutes(input: CollectPrinterRoutesInput): {
  routes: PrinterRoute[];
  errors: PrinterBridgeError[];
} {
  const nodesById = nodeById(input.graph);
  const routes: PrinterRoute[] = [];
  const errors: PrinterBridgeError[] = [];

  for (const printer of input.graph.nodes ?? []) {
    if (printer.type !== PRINTER_OBJECT_NODE_TYPE) continue;

    const payloads: PrintPayload[] = [];
    for (const connection of incomingTo(input.graph, String(printer.id), 'in')) {
      const source = nodesById.get(String(connection.sourceNodeId ?? ''));
      if (!source || (source.type !== PRINT_TEXT_NODE_TYPE && source.type !== PRINT_IMAGE_NODE_TYPE)) continue;
      try {
        const payload = buildPayloadFromNode(source, input.getComputedInputs);
        if (payload) payloads.push(payload);
      } catch (error) {
        errors.push({
          nodeId: String(source.id),
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (payloads.length === 0) continue;

    const resolved = resolvePrinterTargets({
      graph: input.graph,
      nodeId: String(printer.id),
      printerIdsInOrder: input.printerIdsInOrder,
      getComputedInputs: input.getComputedInputs,
    });

    for (const printerId of resolved.ids) {
      for (const payload of payloads) routes.push({ printerId, payload });
    }
  }

  return { routes, errors };
}

export function diffPrinterBridgeJobs(
  previousPrinted: ReadonlyMap<string, PrinterBridgePrinted>,
  routes: PrinterRoute[]
): { jobs: PrinterBridgeJob[]; nextPrinted: Map<string, PrinterBridgePrinted> } {
  const jobs: PrinterBridgeJob[] = [];
  const nextPrinted = new Map(previousPrinted);

  for (const route of routes) {
    const key = `${route.printerId}:${route.payload.nodeId}`;
    const previous = previousPrinted.get(key);
    nextPrinted.set(key, { signature: route.payload.signature });
    if (!previous || previous.signature !== route.payload.signature) {
      jobs.push({ printerId: route.printerId, payload: route.payload });
    }
  }

  return { jobs, nextPrinted };
}
