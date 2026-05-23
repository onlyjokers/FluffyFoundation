/**
 * Purpose: FF-03 runtime protocol validation fixtures for valid messages and structured rejection paths.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  PROTOCOL_VERSION,
  createCommandEnvelope,
  createControlMessage,
  createMediaMetaMessage,
  createPluginControlMessage,
  createSensorDataMessage,
  createSemanticMessage,
  createSemanticResultMessage,
  createSystemMessage,
  isValidMessage,
  validateMessage,
} from './index.js';

const validFixtures = [
  createControlMessage(
    createCommandEnvelope({ actor: 'manager', role: 'manager', scopeGroupId: 'stage-left' }),
    { mode: 'all' },
    'vibrate',
    { pattern: [100, 50, 100], repeat: 1 }
  ),
  createSensorDataMessage('client-1', 'gyro', { alpha: 1, beta: 2, gamma: 3 }),
  createMediaMetaMessage(
    createCommandEnvelope({ actor: 'manager', role: 'manager', scopeGroupId: 'stage-left' }),
    { mode: 'clientIds', ids: ['client-1'] },
    'video',
    '/media/demo.mp4',
    12345,
    {
      loop: true,
      volume: 0.8,
    }
  ),
  createPluginControlMessage(
    createCommandEnvelope({ actor: 'manager', role: 'manager', scopeGroupId: 'stage-left' }),
    { mode: 'group', groupId: 'stage-left' },
    'node-executor',
    'deploy',
    {
      graphId: 'main',
    }
  ),
  createSystemMessage('clientList', {
    clients: [{ clientId: 'client-1', connectedAt: 1000, selected: true }],
  }),
  createSemanticMessage({
    target: { mode: 'manager' },
    actor: 'agent-1',
    role: 'manager',
    command: {
      kind: 'node.params.update',
      nodeId: 'tone-1',
      param: 'volume',
      value: 0.5,
    },
    requestId: 'semantic-1',
  }),
  createSemanticResultMessage({
    requestId: 'semantic-1',
    ok: true,
    result: {
      snapshot: { nodes: [], connections: [] },
    },
    warnings: [
      {
        code: 'semantic.param.clamped',
        path: 'command.value',
        message: 'volume clamped to semantic bounds',
      },
    ],
    snapshotRevision: 2,
  }),
] as const;

test('validateMessage accepts current protocol fixtures for every message class', () => {
  for (const fixture of validFixtures) {
    const result = validateMessage(fixture);
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(isValidMessage(fixture), true);
  }
});

test('validateMessage accepts media and plugin messages when optional object fields are omitted', () => {
  const media = createMediaMetaMessage(
    createCommandEnvelope({ actor: 'manager', role: 'manager', scopeGroupId: 'stage-left' }),
    { mode: 'all' },
    'audio',
    '/x',
    123
  );
  const plugin = createPluginControlMessage(
    createCommandEnvelope({ actor: 'manager', role: 'manager', scopeGroupId: 'stage-left' }),
    { mode: 'all' },
    'node-executor',
    'start'
  );

  assert.equal(validateMessage(media).ok, true);
  assert.equal(isValidMessage(media), true);
  assert.equal(validateMessage(plugin).ok, true);
  assert.equal(isValidMessage(plugin), true);
});

test('validateMessage accepts client permission snapshots in client lists and updates', () => {
  const clientList = createSystemMessage('clientList', {
    clients: [
      {
        clientId: 'client-1',
        connectedAt: 1000,
        selected: true,
        permissions: {
          microphone: 'granted',
          motion: 'denied',
          camera: 'pending',
          wakeLock: 'unsupported',
          geolocation: 'unavailable',
        },
      },
    ],
  });
  const clientPermissions = createSystemMessage('clientPermissions', {
    permissions: {
      microphone: 'granted',
      motion: 'granted',
      camera: 'denied',
      wakeLock: 'pending',
      geolocation: 'unsupported',
    },
  });

  assert.equal(validateMessage(clientList).ok, true);
  assert.equal(validateMessage(clientPermissions).ok, true);
});

test('validateMessage rejects malformed client permission snapshots', () => {
  const badKey = validateMessage(
    createSystemMessage('clientPermissions', {
      permissions: { bluetooth: 'granted' } as never,
    })
  );
  const badStatus = validateMessage(
    createSystemMessage('clientList', {
      clients: [
        {
          clientId: 'client-1',
          connectedAt: 1000,
          permissions: { microphone: 'allowed' },
        },
      ],
    } as never)
  );

  assert.equal(badKey.ok, false);
  assert.equal(badStatus.ok, false);
});

test('validateMessage accepts display operation plugin commands', () => {
  const plugin = createPluginControlMessage(
    createCommandEnvelope({ actor: 'manager', role: 'manager', scopeGroupId: 'stage-left' }),
    { mode: 'group', groupId: 'stage-left' },
    'display-router',
    'display-operation',
    {
      displayIds: ['display-1'],
      operation: {
        kind: 'display-operation',
        target: { mode: 'displayId', displayId: 'display-1' },
        control: {
          action: 'showText',
          payload: { text: 'hello' },
        },
      },
    }
  );

  assert.equal(validateMessage(plugin).ok, true);
  assert.equal(isValidMessage(plugin), true);
});

test('validateMessage accepts configured FCT visual scenes', () => {
  const message = createControlMessage(
    createCommandEnvelope({ actor: 'manager', role: 'manager', scopeGroupId: 'stage-left' }),
    { mode: 'all' },
    'visualScenes',
    {
      scenes: [
        {
          type: 'fctTrack',
          variant: 'acab',
          palette: 'red-black-invert',
          sensitivity: 1.25,
          brightness: 0.85,
          contrast: 1.1,
          blend: 'over',
          audioSource: 'both',
          showBackground: 0.35,
        },
      ],
    }
  );

  assert.equal(validateMessage(message).ok, true);
  assert.equal(isValidMessage(message), true);
});

test('validateMessage accepts box scene color and camera scenes without background controls', () => {
  const message = createControlMessage(
    createCommandEnvelope({ actor: 'manager', role: 'manager', scopeGroupId: 'stage-left' }),
    { mode: 'all' },
    'visualScenes',
    {
      scenes: [
        { type: 'box', color: '#ff3366', showBackground: 0.8, audioSource: 'playback' },
        { type: 'mel', showBackground: 0.25, audioSource: 'both' },
        { type: 'frontCamera' },
      ],
    }
  );

  assert.equal(validateMessage(message).ok, true);
  assert.equal(isValidMessage(message), true);
});

test('validateMessage accepts legacy boolean background controls for visual scenes', () => {
  const message = createControlMessage(
    createCommandEnvelope({ actor: 'manager', role: 'manager', scopeGroupId: 'stage-left' }),
    { mode: 'all' },
    'visualScenes',
    {
      scenes: [
        { type: 'box', showBackground: false },
        { type: 'mel', showBackground: true },
        {
          type: 'fctTrack',
          variant: 'acab',
          palette: 'red-black',
          showBackground: false,
        },
      ],
    }
  );

  assert.equal(validateMessage(message).ok, true);
  assert.equal(isValidMessage(message), true);
});

test('validateMessage rejects camera scene background controls and malformed box colors', () => {
  const message = createControlMessage(
    createCommandEnvelope({ actor: 'manager', role: 'manager', scopeGroupId: 'stage-left' }),
    { mode: 'all' },
    'visualScenes',
    {
      scenes: [
        { type: 'box', color: '' },
        { type: 'backCamera', showBackground: true },
      ],
    }
  );

  const result = validateMessage(message);

  assert.equal(result.ok, false);
  assert.deepEqual(
    result.reasons.map((reason) => reason.path),
    ['payload.scenes[0].color', 'payload.scenes[1].showBackground']
  );
});

test('validateMessage rejects invalid FCT visual scene configuration', () => {
  const message = createControlMessage(
    createCommandEnvelope({ actor: 'manager', role: 'manager', scopeGroupId: 'stage-left' }),
    { mode: 'all' },
    'visualScenes',
    {
      scenes: [
        {
          type: 'fctTrack',
          variant: 'unknown',
          palette: 'infrared',
          sensitivity: -1,
          brightness: 3,
          contrast: Number.NaN,
          blend: 'multiply',
          audioSource: 'airplay',
          showBackground: 'yes',
        },
      ],
    }
  );

  const result = validateMessage(message);

  assert.equal(result.ok, false);
  assert.deepEqual(
    result.reasons.map((reason) => reason.path),
    [
      'payload.scenes[0].variant',
      'payload.scenes[0].palette',
      'payload.scenes[0].sensitivity',
      'payload.scenes[0].brightness',
      'payload.scenes[0].contrast',
      'payload.scenes[0].blend',
      'payload.scenes[0].audioSource',
      'payload.scenes[0].showBackground',
    ]
  );
});

test('validateMessage rejects non-system mutating commands without envelope metadata', () => {
  for (const message of [
    {
      type: 'control',
      version: PROTOCOL_VERSION,
      from: 'manager',
      target: { mode: 'all' },
      action: 'vibrate',
      payload: { pattern: [100] },
    },
    {
      type: 'plugin',
      version: PROTOCOL_VERSION,
      from: 'manager',
      target: { mode: 'all' },
      pluginId: 'node-executor',
      command: 'deploy',
      payload: {},
    },
    {
      type: 'media',
      version: PROTOCOL_VERSION,
      from: 'manager',
      target: { mode: 'all' },
      mediaType: 'audio',
      url: '/media/demo.mp3',
      executeAt: 123,
    },
  ]) {
    const result = validateMessage(message);

    assert.equal(result.ok, false);
    assert.deepEqual(
      result.reasons.map((reason) => reason.path),
      ['scopeGroupId', 'actor', 'role', 'correlationId', 'idempotencyKey']
    );
  }
});

test('validateMessage rejects ambiguous command scope aliases', () => {
  const result = validateMessage({
    ...validFixtures[0],
    scopeGroupId: 'stage-left',
    scope: { scopeGroupId: 'stage-right' },
  });

  assert.equal(result.ok, false);
  assert.equal(result.reasons[0]?.code, 'protocol.scope.ambiguous');
  assert.equal(result.reasons[0]?.path, 'scope.scopeGroupId');
});

test('validateMessage rejects unsupported protocol versions with structured compatibility metadata', () => {
  const result = validateMessage({ ...validFixtures[0], version: PROTOCOL_VERSION + 1 });

  assert.equal(result.ok, false);
  assert.equal(result.reasons[0]?.code, 'protocol.version.unsupported');
  assert.equal(result.reasons[0]?.actor, 'manager');
  assert.equal(result.reasons[0]?.scope, 'protocol.version');
  assert.equal(result.reasons[0]?.type, 'control');
  assert.equal(result.reasons[0]?.path, 'version');
  assert.equal(result.reasons[0]?.decision, 'reject');
  assert.equal(isValidMessage({ ...validFixtures[0], version: PROTOCOL_VERSION + 1 }), false);
});

test('validateMessage rejects retired client control transfer control actions', () => {
  const result = validateMessage({
    ...validFixtures[0],
    action: 'clientControlTransfer',
    payload: {
      kind: 'client-control-transfer-status',
      transferId: 'transfer-stage-left-client-1',
      groupId: 'stage-left',
      targetClientId: 'client-1',
      offeredAt: 1_000,
      expiresAt: 31_000,
      status: 'pending',
      capability: {},
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.reasons[0]?.path, 'action');
  assert.equal(result.reasons[0]?.code, 'protocol.field.invalid');
});

test('validateMessage rejects malformed control payloads with the failing field path', () => {
  const result = validateMessage({
    ...validFixtures[0],
    target: { mode: 'clientIds', ids: ['client-1', 42] },
  });

  assert.equal(result.ok, false);
  assert.deepEqual(
    result.reasons.map((reason) => reason.path),
    ['target.ids[1]']
  );
  assert.equal(result.reasons[0]?.code, 'protocol.field.invalid');
  assert.equal(result.reasons[0]?.actor, 'manager');
  assert.equal(result.reasons[0]?.scope, 'message.control.target');
  assert.equal(result.reasons[0]?.type, 'control');
});

test('validateMessage rejects malformed sensor payloads for each concrete sensor type', () => {
  const cases = [
    createSensorDataMessage('client-1', 'gyro', { alpha: 1, beta: 'bad', gamma: 3 }),
    createSensorDataMessage('client-1', 'accel', { x: 1, y: 2, z: 3, includesGravity: 'yes' }),
    createSensorDataMessage('client-1', 'orientation', { alpha: 1, beta: null, gamma: 3, absolute: 'no' }),
    createSensorDataMessage('client-1', 'mic', { volume: 'loud' }),
  ];

  for (const message of cases) {
    const result = validateMessage(message);
    assert.equal(result.ok, false);
    assert.equal(result.reasons[0]?.type, 'data');
    assert.match(result.reasons[0]?.path ?? '', /^payload\./);
    assert.equal(result.reasons[0]?.decision, 'reject');
  }
});

test('validateMessage rejects malformed media, plugin, and system messages', () => {
  const invalidMessages = [
    { ...validFixtures[2], executeAt: 'soon' },
    { ...validFixtures[3], command: 'launch' },
    { ...validFixtures[4], payload: { clients: [{ clientId: '', connectedAt: 'then' }] } },
  ];

  for (const message of invalidMessages) {
    const result = validateMessage(message);
    assert.equal(result.ok, false);
    assert.equal(result.reasons[0]?.decision, 'reject');
    assert.ok(result.reasons[0]?.path);
  }
});

test('validateMessage accepts semantic manager commands and semantic results', () => {
  const request = createSemanticMessage({
    target: { mode: 'managerId', managerId: 'manager-1' },
    actor: 'cli',
    role: 'manager',
    dryRun: true,
    command: {
      kind: 'node.create',
      nodeId: 'tone-1',
      nodeType: 'tone.granular',
      position: { x: 12, y: 24 },
    },
    requestId: 'semantic-create-1',
  });
  const result = createSemanticResultMessage({
    requestId: 'semantic-create-1',
    ok: true,
    result: { nodeId: 'tone-1' },
    snapshotRevision: 3,
  });

  assert.equal(validateMessage(request).ok, true);
  assert.equal(isValidMessage(request), true);
  assert.equal(validateMessage(result).ok, true);
  assert.equal(isValidMessage(result), true);
});

test('validateMessage accepts server-owned semantic commands and semantic snapshots', () => {
  const request = createSemanticMessage({
    target: { mode: 'server' },
    actor: 'cli',
    role: 'manager',
    command: { kind: 'graph.snapshot' },
    requestId: 'semantic-server-snapshot',
  });
  const snapshot = createSystemMessage('semanticSnapshot', {
    semanticSnapshot: {
      revision: 1,
      nodes: [],
      definitions: [],
      connections: [],
      groups: [],
      partitions: [],
      runtimeStatus: { running: false, deployedPartitionIds: [] },
      deviceCapabilities: [],
      errors: [],
      permissions: [],
    },
  });

  assert.equal(validateMessage(request).ok, true);
  assert.equal(isValidMessage(request), true);
  assert.equal(validateMessage(snapshot).ok, true);
  assert.equal(isValidMessage(snapshot), true);
});

test('validateMessage rejects malformed semantic messages with failing field paths', () => {
  const invalidMessages = [
    {
      type: 'semantic',
      version: PROTOCOL_VERSION,
      target: { mode: 'clientIds', ids: ['client-1'] },
      actor: 'cli',
      role: 'manager',
      command: { kind: 'node.create' },
      requestId: 'bad-target',
    },
    {
      type: 'semantic',
      version: PROTOCOL_VERSION,
      target: { mode: 'manager' },
      actor: 'cli',
      role: 'client',
      command: { kind: 'node.create' },
      requestId: 'bad-role',
    },
    {
      type: 'semantic-result',
      version: PROTOCOL_VERSION,
      requestId: 'bad-result',
      ok: false,
      result: {},
    },
  ];

  const results = invalidMessages.map((message) => validateMessage(message));

  const firstReasons = results.map((result) => {
    assert.equal(result.ok, false);
    return result.reasons[0];
  });

  assert.deepEqual(
    firstReasons.map((reason) => reason?.path),
    ['target.mode', 'role', 'error']
  );
  assert.deepEqual(
    firstReasons.map((reason) => reason?.code),
    ['protocol.field.invalid', 'protocol.field.invalid', 'protocol.field.required']
  );
});

test('validateMessage reports unknown message types as schema rejections', () => {
  const result = validateMessage({ type: 'telemetry', version: PROTOCOL_VERSION });

  assert.equal(result.ok, false);
  assert.equal(result.reasons[0]?.code, 'protocol.type.unsupported');
  assert.equal(result.reasons[0]?.scope, 'message.type');
  assert.equal(result.reasons[0]?.path, 'type');
  assert.equal(result.reasons[0]?.decision, 'reject');
});
