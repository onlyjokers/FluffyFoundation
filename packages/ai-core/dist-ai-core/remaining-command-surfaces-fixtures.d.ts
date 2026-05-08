/**
 * Purpose: Build deterministic FF-18 WP8 traces for remaining AI Operator semantic command API surfaces.
 */
import type { AiSemanticActor } from './deterministic-planner.js';
import type { AiRemainingCommandSurfaceCase, AiRemainingCommandSurfaceTrace } from './remaining-command-surfaces-types.js';
export type { AiRemainingCommandSurfaceCase, AiRemainingCommandSurfaceTrace, AiRollbackRevisionTrace, } from './remaining-command-surfaces-types.js';
export declare function runAiRemainingCommandSurfaceFixtures(input: {
    actor?: AiSemanticActor;
    directActor?: AiSemanticActor;
    cases: AiRemainingCommandSurfaceCase[];
}): AiRemainingCommandSurfaceTrace[];
//# sourceMappingURL=remaining-command-surfaces-fixtures.d.ts.map