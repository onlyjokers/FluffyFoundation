import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  PRINTER_OBJECT_NODE_TYPE,
  PRINT_IMAGE_NODE_TYPE,
  PRINT_TEXT_NODE_TYPE,
  buildPrintImagePayload,
  buildPrintTextPayload,
  createPrinterNodeDefinitions,
  createPrinterPlugin,
} from '../dist-printer-plugin-out/index.js';

test('Print Text payload trims text and uses stable signatures', () => {
  assert.deepEqual(buildPrintTextPayload({ nodeId: 'text-1', text: ' hello ' }), {
    target: 'printer',
    kind: 'text',
    nodeId: 'text-1',
    text: 'hello',
    signature: 'text:text-1:hello',
  });

  assert.equal(
    buildPrintTextPayload({ nodeId: 'text-1', text: 'hello' }).signature,
    buildPrintTextPayload({ nodeId: 'text-1', text: 'hello' }).signature
  );
  assert.notEqual(
    buildPrintTextPayload({ nodeId: 'text-1', text: 'hello' }).signature,
    buildPrintTextPayload({ nodeId: 'text-1', text: 'world' }).signature
  );
});

test('Print Image payload trims image ref and uses stable signatures', () => {
  assert.deepEqual(buildPrintImagePayload({ nodeId: 'image-1', image: ' asset:abc ' }), {
    target: 'printer',
    kind: 'image',
    nodeId: 'image-1',
    image: 'asset:abc',
    signature: 'image:image-1:asset:abc',
  });

  assert.equal(
    buildPrintImagePayload({ nodeId: 'image-1', image: 'asset:abc' }).signature,
    buildPrintImagePayload({ nodeId: 'image-1', image: 'asset:abc' }).signature
  );
  assert.notEqual(
    buildPrintImagePayload({ nodeId: 'image-1', image: 'asset:abc' }).signature,
    buildPrintImagePayload({ nodeId: 'image-1', image: 'asset:def' }).signature
  );
});

test('Printer node definitions expose print ports and manager metadata', () => {
  const definitions = createPrinterNodeDefinitions();
  assert.deepEqual(definitions.map((definition) => definition.type), [
    PRINT_TEXT_NODE_TYPE,
    PRINT_IMAGE_NODE_TYPE,
    PRINTER_OBJECT_NODE_TYPE,
  ]);

  const text = definitions.find((definition) => definition.type === PRINT_TEXT_NODE_TYPE);
  assert.equal(text.label, 'Print Text');
  assert.deepEqual(text.inputs.map((port) => [port.id, port.type]), [['text', 'string']]);
  assert.deepEqual(text.outputs.map((port) => [port.id, port.type]), [['print', 'print']]);
  assert.equal(text.process({ text: '' }, {}, { nodeId: 'text-1', time: 0, deltaTime: 0 }).print, null);
  assert.deepEqual(text.process({ text: 'Hi' }, {}, { nodeId: 'text-1', time: 0, deltaTime: 0 }), {
    print: {
      target: 'printer',
      kind: 'text',
      nodeId: 'text-1',
      text: 'Hi',
      signature: 'text:text-1:Hi',
    },
  });

  const image = definitions.find((definition) => definition.type === PRINT_IMAGE_NODE_TYPE);
  assert.equal(image.label, 'Print Image');
  assert.deepEqual(image.inputs.map((port) => [port.id, port.type]), [['image', 'image']]);
  assert.deepEqual(image.outputs.map((port) => [port.id, port.type]), [['print', 'print']]);
  assert.equal(image.process({ image: '' }, {}, { nodeId: 'image-1', time: 0, deltaTime: 0 }).print, null);

  const printer = definitions.find((definition) => definition.type === PRINTER_OBJECT_NODE_TYPE);
  assert.equal(printer.label, 'Printer');
  assert.equal(printer.category, 'Objects');
  assert.deepEqual(
    printer.inputs.map((port) => [port.id, port.type, port.kind ?? 'data']),
    [
      ['index', 'number', 'data'],
      ['range', 'number', 'data'],
      ['random', 'boolean', 'data'],
      ['in', 'print', 'sink'],
    ]
  );
  assert.deepEqual(printer.outputs, []);
  assert.deepEqual(printer.configSchema, []);
  assert.deepEqual(printer.metadata.platformTargets, ['manager', 'server']);
  assert.equal(printer.metadata.sideEffectClass, 'remote-control');
  assert.ok(printer.metadata.permissions.includes('hardware:printer'));
});

test('Printer plugin manifest declares local printer capability', () => {
  const plugin = createPrinterPlugin();
  assert.equal(plugin.manifest.id, 'printer');
  assert.ok(plugin.manifest.capabilities.includes('hardware.printer'));
  assert.ok(plugin.manifest.capabilities.includes('device:printer'));
});
