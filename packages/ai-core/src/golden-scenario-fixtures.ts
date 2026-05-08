/**
 * Purpose: Build deterministic FF-18 golden scenario contract traces from existing AI semantic/runtime cores.
 */

import {
  baseSnapshot,
  createFixtureBus,
} from './golden-scenario-bus.js';
import {
  displayDefinition,
  flashlightDefinition,
} from './golden-scenario-definitions.js';
import {
  runProposal,
  traceFor,
  type Ff18GoldenScenarioTrace,
} from './golden-scenario-support.js';

export type { Ff18GoldenScenarioTrace } from './golden-scenario-support.js';

const gs12 = (): Ff18GoldenScenarioTrace => {
  const bus = createFixtureBus(
    baseSnapshot({
      revision: 30,
      runtimeTarget: 'mobile',
      definitions: [flashlightDefinition()],
      nodes: [
        {
          id: 'flashlight:rhythm',
          type: 'flashlight-rhythm',
          params: {
            rhythmHz: 4,
            tension: 0.4,
            managerKey: 'shugu_secret_12',
          },
          inputValues: { rotationVelocity: 0.91, localPath: '/Users/ziqi/gyro.json' },
          outputValues: { rhythmHz: 4, tension: 0.4 },
        },
      ],
      deviceCapabilities: [
        { deviceId: 'phone:gs12', capabilities: ['gyro.rotation', 'device.flashlight'], status: 'online' },
      ],
    })
  );
  const result = runProposal(bus, {
    id: 'gs12-gyro-flashlight',
    kind: 'gyro-flashlight-rhythm',
    targetNodeId: 'flashlight:rhythm',
    constraints: { rhythmHz: 9, tension: 0.86 },
  });

  return traceFor({
    scenarioId: 'GS-12',
    title: 'Gyro rotation drives tense flashlight rhythm',
    ...result,
    observation: {
      kind: 'output-change',
      proposalId: result.execution.proposalId,
      observed: true,
      changedTargets: ['flashlight:rhythm'],
      measuredAtRevision: result.execution.appliedRevision ?? undefined,
    },
  });
};

const gs13 = (): Ff18GoldenScenarioTrace => {
  const bus = createFixtureBus(
    baseSnapshot({
      revision: 40,
      runtimeTarget: 'display',
      definitions: [displayDefinition()],
      nodes: [
        {
          id: 'display:breath',
          type: 'display-breathing',
          params: {
            intensity: 0.32,
            breathRate: 0.9,
            managerKey: 'shugu_secret_13',
          },
          inputValues: {},
          outputValues: { intensity: 0.32, breathRate: 0.9 },
        },
      ],
      deviceCapabilities: [{ deviceId: 'display:gs13', capabilities: ['display.render'], status: 'online' }],
    })
  );
  const result = runProposal(bus, {
    id: 'gs13-display-breathing',
    kind: 'display-breathing',
    targetNodeId: 'display:breath',
    constraints: { maxIntensity: 0.68, breathRate: 0.42 },
  });

  return traceFor({
    scenarioId: 'GS-13',
    title: 'Display visual becomes breathing-like',
    ...result,
    observation: {
      kind: 'output-change',
      proposalId: result.execution.proposalId,
      observed: true,
      changedTargets: ['display:breath'],
      measuredAtRevision: result.execution.appliedRevision ?? undefined,
    },
  });
};

const gs14 = (): Ff18GoldenScenarioTrace => {
  const bus = createFixtureBus(
    baseSnapshot({
      revision: 50,
      runtimeTarget: 'display',
      definitions: [displayDefinition()],
      nodes: [
        {
          id: 'display:overflow',
          type: 'display-breathing',
          params: {
            intensity: 0.4,
            breathRate: 1,
            managerKey: 'shugu_secret_14',
          },
          inputValues: {},
          outputValues: { intensity: 0.4 },
        },
      ],
      deviceCapabilities: [{ deviceId: 'display:gs14', capabilities: ['display.render'], status: 'online' }],
    })
  );
  const result = runProposal(bus, {
    id: 'gs14-param-overflow',
    kind: 'display-breathing',
    targetNodeId: 'display:overflow',
    constraints: { maxIntensity: 1.8, breathRate: 0.5 },
  });

  return traceFor({
    scenarioId: 'GS-14',
    title: 'AI repairs structured param overflow validation error',
    ...result,
    observation: {
      kind: 'validation-error',
      proposalId: result.execution.proposalId,
      validationErrors: result.dryRun.validationErrors,
      consoleText: 'ignored noisy console text with /Users/ziqi/private/token.txt',
    },
  });
};

export function runFf18GoldenScenarioFixtures(): Ff18GoldenScenarioTrace[] {
  return [gs12(), gs13(), gs14()];
}
