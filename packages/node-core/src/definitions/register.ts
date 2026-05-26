/**
 * Purpose: Register the default node definition catalog into a registry.
 */
import type { NodeRegistry } from '../registry.js';
import type { ClientObjectDeps } from './types.js';
import type { NodeDefinition } from '../types.js';

import {
  createClientCountNode,
  createClientButtonNode,
  createClientExecutorNode,
  createClientInputBoxNode,
  createClientLoaderNode,
  createClientUrlSessionFilterNode,
  createClientPermissionFilterNode,
  createUrlSessionNode,
  createDisplayObjectNode,
  createClientSensorsProcessorNode,
  createCmdAggregatorNode,
} from './nodes/client.js';
import {
  createArrayFilterNode,
  createBooleanToPulseNode,
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
  createPulseToBooleanNode,
} from './nodes/logic.js';
import { createGroupGateNode, createGroupProxyNode } from './nodes/group.js';
import {
  createBooleanVariableNode,
  createBoolNode,
  createFloatNode,
  createGetBooleanVariableNode,
  createIntNode,
  createNoteNode,
  createNumberVariableNode,
  createSetBooleanVariableNode,
  createShowAnythingNode,
  createStringNode,
  createStringVariableNode,
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
  createGenerateTtsAudioAssetNode,
  createGptImageGenNode,
  createLoadAudioAssetFromAssetsNode,
  createLoadAudioFromAssetsNode,
  createLoadAudioFromLocalNode,
  createLoadImageFromAssetsNode,
  createLoadImageFromLocalNode,
  createReferenceAudioFromDropBoxNode,
  createLoadVideoFromAssetsNode,
  createLoadVideoFromLocalNode,
  createUploadAudioToDropBoxNode,
} from './nodes/assets.js';
import {
  createImgFitNode,
  createImgScaleNode,
  createImgTransparencyNode,
  createImgXYOffsetNode,
  createUrlToQrGeneratorNode,
} from './nodes/image.js';
import {
  createAudioOutNode,
  createEffectOutNode,
  createImageOutNode,
  createPlayMediaNode,
  createSceneOutNode,
  createUiOutNode,
  createVideoOutNode,
} from './nodes/player.js';
import {
  createDisplayTextProcessorNode,
  createFlashlightProcessorNode,
  createPushImageUploadNode,
  createScreenColorProcessorNode,
  createShowImageProcessorNode,
  createSynthUpdateProcessorNode,
} from './nodes/processors.js';
import {
  createSceneBackCameraNode,
  createSceneBoxNode,
  createSceneFctTrackNode,
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
    () => createClientLoaderNode(deps),
    () => createClientExecutorNode(deps),
    () => createClientButtonNode(deps),
    () => createClientInputBoxNode(deps),
    () => createUrlSessionNode(),
    createDisplayObjectNode,
    () => createClientCountNode(deps),
    () => createClientPermissionFilterNode(deps),
    () => createClientUrlSessionFilterNode(deps),
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
    createBooleanToPulseNode,
    createPulseToBooleanNode,
    createNumberScriptNode,
    createShowAnythingNode,
    createNoteNode,
    createIntNode,
    createFloatNode,
    createStringNode,
    createBoolNode,
    createSetBooleanVariableNode,
    createGetBooleanVariableNode,
    createBooleanVariableNode,
    createNumberVariableNode,
    createStringVariableNode,
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
    () => createGenerateTtsAudioAssetNode(deps),
    () => createUploadAudioToDropBoxNode(deps),
    () => createReferenceAudioFromDropBoxNode(deps),
    createLoadAudioFromLocalNode,
    createLoadImageFromAssetsNode,
    createLoadImageFromLocalNode,
    () => createGptImageGenNode(deps),
    // Image modulation nodes
    createUrlToQrGeneratorNode,
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
    () => createUiOutNode(deps),
    createFlashlightProcessorNode,
    createShowImageProcessorNode,
    createDisplayTextProcessorNode,
    createPushImageUploadNode,
    createScreenColorProcessorNode,
    createSynthUpdateProcessorNode,
    // Visual scene chain
    createSceneBoxNode,
    createSceneMelNode,
    createSceneFctTrackNode,
    createSceneFrontCameraNode,
    createSceneBackCameraNode,
    createEffectConvolutionNode,
    createEffectAsciiNode,
    createAiModelRefNode,
  ];
}
