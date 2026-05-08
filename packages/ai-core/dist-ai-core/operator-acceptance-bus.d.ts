/**
 * Purpose: Fixture snapshot and command bus helpers for FF-18 operator acceptance traces.
 */
import type { AiSemanticActor, AiSemanticCommand } from './deterministic-planner.js';
import type { OperatorBus, OperatorNode, OperatorSnapshot } from './operator-acceptance-types.js';
export declare const actor: AiSemanticActor;
export declare const definition: (input: {
    type: string;
    description: string;
    params: Array<Record<string, unknown>>;
    capabilities?: string[];
}) => Record<string, unknown>;
export declare const snapshotFor: (input: {
    revision: number;
    nodes: OperatorNode[];
    definitions: Array<Record<string, unknown>>;
    capabilities: string[];
    proposals?: Array<Record<string, unknown>>;
}) => OperatorSnapshot;
export declare const createOperatorBus: (initialSnapshot: OperatorSnapshot, policy?: (input: {
    actor: AiSemanticActor;
    command: AiSemanticCommand;
    dryRun: boolean;
}) => {
    allowed: boolean;
    reason?: string;
}) => OperatorBus;
//# sourceMappingURL=operator-acceptance-bus.d.ts.map