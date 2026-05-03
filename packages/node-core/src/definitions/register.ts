/**
 * Purpose: Register the default node definition catalog into a registry.
 */
import type { NodeRegistry } from '../registry.js';
import type { ClientObjectDeps } from './types.js';
import type { NodeDefinition } from '../types.js';

import {
  createClientCountNode,
  createClientObjectNode,
  createClientSensorsProcessorNode,
  createCmdAggregatorNode,
} from './nodes/client.js';
import {
  createArrayFilterNode,
  createLogicAddNode,
  createLogicAndNode,
  createLogicDivideNode,
  createLogicForNode,
  createLogicIfNode,
  createLogicMultipleNode,
  createLogicNandNode,
  createLogicNumberToBooleanNode,
  createLogicNorNode,
  createLogicNotNode,
  createLogicOrNode,
  createLogicSleepNode,
  createLogicSubtractNode,
  createLogicXorNode,
  createMathNode,
  createNumberScriptNode,
  createNumberStabilizerNode,
} from './nodes/logic.js';
import { createGroupGateNode, createGroupProxyNode } from './nodes/group.js';
import {
  createBoolNode,
  createNoteNode,
  createNumberNode,
  createShowAnythingNode,
  createStringNode,
} from './nodes/values.js';
import {
  createAudioDataNode,
  createToneDelayNode,
  createToneGranularNode,
  createToneLFONode,
  createToneOscNode,
  createTonePitchNode,
  createToneResonatorNode,
  createToneReverbNode,
} from './nodes/audio.js';
import {
  createLoadAudioAssetFromAssetsNode,
  createLoadAudioFromAssetsNode,
  createLoadAudioFromLocalNode,
  createLoadImageFromAssetsNode,
  createLoadImageFromLocalNode,
  createLoadVideoFromAssetsNode,
  createLoadVideoFromLocalNode,
} from './nodes/assets.js';
import {
  createImgFitNode,
  createImgScaleNode,
  createImgTransparencyNode,
  createImgXYOffsetNode,
} from './nodes/image.js';
import {
  createAudioOutNode,
  createEffectOutNode,
  createImageOutNode,
  createPlayMediaNode,
  createSceneOutNode,
  createVideoOutNode,
} from './nodes/player.js';
import {
  createFlashlightProcessorNode,
  createPushImageUploadNode,
  createScreenColorProcessorNode,
  createShowImageProcessorNode,
  createSynthUpdateProcessorNode,
} from './nodes/processors.js';
import {
  createSceneBackCameraNode,
  createSceneBoxNode,
  createSceneFrontCameraNode,
  createSceneMelNode,
} from './nodes/scenes.js';
import { createEffectAsciiNode, createEffectConvolutionNode } from './nodes/effects.js';
import { createAiModelRefNode } from './nodes/ai.js';

export function registerDefaultNodeDefinitions(
  registry: NodeRegistry,
  deps: ClientObjectDeps
): void {
  registry.load({ factories: createDefaultNodeDefinitionFactories(deps) });
}

function createDefaultNodeDefinitionFactories(deps: ClientObjectDeps): Array<() => NodeDefinition> {
  return [
    () => createClientObjectNode(deps),
    () => createClientCountNode(deps),
    createArrayFilterNode,
    createCmdAggregatorNode,
    createClientSensorsProcessorNode,
    createMathNode,
    createLogicAddNode,
    createLogicMultipleNode,
    createLogicSubtractNode,
    createLogicDivideNode,
    createLogicNotNode,
    createLogicAndNode,
    createLogicOrNode,
    createLogicNandNode,
    createLogicNorNode,
    createLogicXorNode,
    createLogicIfNode,
    createLogicForNode,
    createLogicSleepNode,
    createLogicNumberToBooleanNode,
    createNumberScriptNode,
    createShowAnythingNode,
    createNoteNode,
    createNumberNode,
    createStringNode,
    createBoolNode,
    createNumberStabilizerNode,
    // Internal graph structure nodes (primarily for manager UI).
    createGroupGateNode,
    createGroupProxyNode,
    // Tone.js audio nodes (client runtime overrides these definitions).
    createToneLFONode,
    createToneOscNode,
    createToneDelayNode,
    createToneResonatorNode,
    createTonePitchNode,
    createToneReverbNode,
    createToneGranularNode,
    createAudioDataNode,
    // Player helpers.
    createLoadAudioFromAssetsNode,
    createLoadAudioAssetFromAssetsNode,
    createLoadAudioFromLocalNode,
    createLoadImageFromAssetsNode,
    createLoadImageFromLocalNode,
    // Image modulation nodes
    createImgScaleNode,
    createImgFitNode,
    createImgXYOffsetNode,
    createImgTransparencyNode,
    createLoadVideoFromAssetsNode,
    createLoadVideoFromLocalNode,
    createPlayMediaNode,
    // Patch root sinks (Max/MSP style).
    createAudioOutNode,
    () => createImageOutNode(deps),
    () => createVideoOutNode(deps),
    () => createEffectOutNode(deps),
    () => createSceneOutNode(deps),
    createFlashlightProcessorNode,
    createShowImageProcessorNode,
    createPushImageUploadNode,
    createScreenColorProcessorNode,
    createSynthUpdateProcessorNode,
    // Visual scene chain
    createSceneBoxNode,
    createSceneMelNode,
    createSceneFrontCameraNode,
    createSceneBackCameraNode,
    createEffectConvolutionNode,
    createEffectAsciiNode,
    createAiModelRefNode,
  ];
}
