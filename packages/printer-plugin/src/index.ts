/**
 * Purpose: Printer hardware plugin, print payload builders, and node definitions.
 */
import { definePlugin, type DefinedPlugin } from '@shugu/plugin-core';
import type { NodeDefinition } from '@shugu/node-core';

export const PRINTER_PLUGIN_ID = 'printer';
export const PRINTER_OBJECT_NODE_TYPE = 'printer-object';
export const PRINT_TEXT_NODE_TYPE = 'plugin:printer:print-text';
export const PRINT_IMAGE_NODE_TYPE = 'plugin:printer:print-image';

export type PrintPayloadKind = 'text' | 'image';

export type PrintTextPayload = {
  target: 'printer';
  kind: 'text';
  nodeId: string;
  text: string;
  signature: string;
};

export type PrintImagePayload = {
  target: 'printer';
  kind: 'image';
  nodeId: string;
  image: string;
  signature: string;
};

export type PrintPayload = PrintTextPayload | PrintImagePayload;

export type PrintTextInput = {
  nodeId: string;
  text: unknown;
};

export type PrintImageInput = {
  nodeId: string;
  image: unknown;
};

const printerPermissions = ['hardware:printer', 'control:send'];

function stableSignature(kind: PrintPayloadKind, nodeId: string, content: string): string {
  return `${kind}:${nodeId}:${content}`;
}

export function buildPrintTextPayload(input: PrintTextInput): PrintTextPayload {
  const nodeId = String(input.nodeId);
  const text = typeof input.text === 'string' ? input.text.trim() : String(input.text ?? '').trim();
  return {
    target: 'printer',
    kind: 'text',
    nodeId,
    text,
    signature: stableSignature('text', nodeId, text),
  };
}

export function buildPrintImagePayload(input: PrintImageInput): PrintImagePayload {
  const nodeId = String(input.nodeId);
  const image = typeof input.image === 'string' ? input.image.trim() : String(input.image ?? '').trim();
  return {
    target: 'printer',
    kind: 'image',
    nodeId,
    image,
    signature: stableSignature('image', nodeId, image),
  };
}

export function createPrinterPlugin(): DefinedPlugin {
  return definePlugin(
    {
      id: PRINTER_PLUGIN_ID,
      version: '1.0.0',
      apiVersion: 1,
      capabilities: ['hardware.printer', 'device:printer'],
      supportedProtocolVersions: [1],
      sideEffects: ['state'],
      description: 'Prints text and image payloads through printers connected to the Manager computer.',
    },
    () => ({})
  );
}

export function createPrintTextNodeDefinition(): NodeDefinition {
  return {
    type: PRINT_TEXT_NODE_TYPE,
    label: 'Print Text',
    category: 'Printer',
    metadata: {
      version: '1.0.0',
      platformTargets: ['manager', 'server'],
      sideEffectClass: 'remote-control',
      permissions: printerPermissions,
      description: 'Converts a string input into a printer payload.',
      compatibility: [
        {
          target: 'Printer',
          rule: 'Connect Print Text output to a Printer object input to print when text changes.',
          repairHint: 'Use a Printer node as the print sink.',
        },
      ],
      examples: [
        {
          title: 'Print a label',
          summary: 'Connect a string source to Print Text, then route it to Printer.',
          inputs: { text: 'Hello printer' },
        },
      ],
      risks: ['Changing text while the graph is running can submit a real print job.'],
      repairHints: ['Connect the Manager Printer panel to at least one printer before running the graph.'],
    },
    inputs: [{ id: 'text', label: 'Text', type: 'string', defaultValue: '' }],
    outputs: [{ id: 'print', label: 'Print', type: 'print' }],
    configSchema: [],
    process: (inputs, _config, context) => {
      const payload = buildPrintTextPayload({ nodeId: context.nodeId, text: inputs.text });
      return { print: payload.text ? payload : null };
    },
  };
}

export function createPrintImageNodeDefinition(): NodeDefinition {
  return {
    type: PRINT_IMAGE_NODE_TYPE,
    label: 'Print Image',
    category: 'Printer',
    metadata: {
      version: '1.0.0',
      platformTargets: ['manager', 'server'],
      sideEffectClass: 'remote-control',
      permissions: printerPermissions,
      description: 'Converts an image reference into a printer payload.',
      compatibility: [
        {
          target: 'Printer',
          rule: 'Connect Print Image output to a Printer object input to print when the image changes.',
          repairHint: 'Use a Printer node as the print sink.',
        },
      ],
      examples: [
        {
          title: 'Print an uploaded image',
          summary: 'Load an image asset, connect it to Print Image, then route it to Printer.',
        },
      ],
      risks: ['Changing the image while the graph is running can submit a real print job.'],
      repairHints: ['Use asset: or server-local image references for predictable server-side printing.'],
    },
    inputs: [{ id: 'image', label: 'Image', type: 'image' }],
    outputs: [{ id: 'print', label: 'Print', type: 'print' }],
    configSchema: [],
    process: (inputs, _config, context) => {
      const payload = buildPrintImagePayload({ nodeId: context.nodeId, image: inputs.image });
      return { print: payload.image ? payload : null };
    },
  };
}

export function createPrinterObjectNodeDefinition(): NodeDefinition {
  return {
    type: PRINTER_OBJECT_NODE_TYPE,
    label: 'Printer',
    category: 'Objects',
    metadata: {
      version: '1.0.0',
      platformTargets: ['manager', 'server'],
      sideEffectClass: 'remote-control',
      permissions: printerPermissions,
      description: 'Routes print payloads to selected printers connected to the Manager computer.',
      compatibility: [
        {
          target: 'Print Text and Print Image',
          rule: 'Accepts print payloads from printer source nodes.',
          repairHint: 'Connect Print Text or Print Image to this Printer input.',
        },
      ],
      examples: [
        {
          title: 'Route multiple printers',
          summary: 'Set Index, Range, and Random to select connected printers.',
          inputs: { index: 1, range: 1, random: false },
        },
      ],
      risks: ['Can submit real print jobs immediately.'],
      repairHints: [
        'Use Index, Range, and Random to select among connected printers.',
        'Connect printers from Manager before running the graph.',
      ],
    },
    inputs: [
      { id: 'index', label: 'Index', type: 'number', defaultValue: 1, min: 1, step: 1 },
      { id: 'range', label: 'Range', type: 'number', defaultValue: 1, min: 1, step: 1 },
      { id: 'random', label: 'Random', type: 'boolean', defaultValue: false },
      { id: 'in', label: 'In', type: 'print', kind: 'sink' },
    ],
    outputs: [],
    configSchema: [],
    process: () => ({}),
  };
}

export function createPrinterNodeDefinitions(): NodeDefinition[] {
  return [
    createPrintTextNodeDefinition(),
    createPrintImageNodeDefinition(),
    createPrinterObjectNodeDefinition(),
  ];
}
