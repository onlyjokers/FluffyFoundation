/**
 * Purpose: In-memory deterministic command bus used by FF-18 golden scenario fixtures.
 */
import type { AiSemanticActor } from './deterministic-planner.js';
import type { FixtureBus, FixtureDefinition, FixtureNode, FixtureSnapshot } from './golden-scenario-types.js';
export declare const baseSnapshot: (input: {
    revision: number;
    nodes: FixtureNode[];
    definitions: FixtureDefinition[];
    deviceCapabilities: Array<Record<string, unknown>>;
    runtimeTarget: string;
}) => FixtureSnapshot;
export declare const createFixtureBus: (initialSnapshot: FixtureSnapshot) => FixtureBus;
export type { AiSemanticActor };
//# sourceMappingURL=golden-scenario-bus.d.ts.map