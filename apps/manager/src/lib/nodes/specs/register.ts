/**
 * Purpose: Manager JSON node spec registration entrypoint.
 *
 * Node runtime behavior and the authoritative port/config schema live in @shugu/node-core.
 * JSON files under this folder act as a UI overlay layer and may define manager-only nodes.
 */
import { registerDefaultRuntimeNodes } from './register/default-runtime';
import { registerFallbackAssetNodes } from './register/fallback-assets';
import { registerJsonSpecs } from './register/json-registration';

registerDefaultRuntimeNodes();
registerFallbackAssetNodes();
registerJsonSpecs();

export type { NodeSpec } from './register/types';
