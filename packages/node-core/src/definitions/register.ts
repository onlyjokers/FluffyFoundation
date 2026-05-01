/**
 * Purpose: Register the default node definition catalog into a registry.
 */
import type { NodeRegistry } from '../registry.js';
import type { ClientObjectDeps } from './types.js';

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
  registry.register(createClientObjectNode(deps));
  registry.register(createClientCountNode(deps));
  registry.register(createArrayFilterNode());
  registry.register(createCmdAggregatorNode());
  registry.register(createClientSensorsProcessorNode());
  registry.register(createMathNode());
  registry.register(createLogicAddNode());
  registry.register(createLogicMultipleNode());
  registry.register(createLogicSubtractNode());
  registry.register(createLogicDivideNode());
  registry.register(createLogicNotNode());
  registry.register(createLogicAndNode());
  registry.register(createLogicOrNode());
  registry.register(createLogicNandNode());
  registry.register(createLogicNorNode());
  registry.register(createLogicXorNode());
  registry.register(createLogicIfNode());
  registry.register(createLogicForNode());
  registry.register(createLogicSleepNode());
  registry.register(createLogicNumberToBooleanNode());
  registry.register(createNumberScriptNode());
  registry.register(createShowAnythingNode());
  registry.register(createNoteNode());
  registry.register(createNumberNode());
  registry.register(createStringNode());
  registry.register(createBoolNode());
  registry.register(createNumberStabilizerNode());
  // Internal graph structure nodes (primarily for manager UI).
  registry.register(createGroupGateNode());
  registry.register(createGroupProxyNode());
  // Tone.js audio nodes (client runtime overrides these definitions).
  registry.register(createToneLFONode());
  registry.register(createToneOscNode());
  registry.register(createToneDelayNode());
  registry.register(createToneResonatorNode());
  registry.register(createTonePitchNode());
  registry.register(createToneReverbNode());
  registry.register(createToneGranularNode());
  registry.register(createAudioDataNode());
  // Player helpers.
  registry.register(createLoadAudioFromAssetsNode());
  registry.register(createLoadAudioAssetFromAssetsNode());
  registry.register(createLoadAudioFromLocalNode());
  registry.register(createLoadImageFromAssetsNode());
  registry.register(createLoadImageFromLocalNode());
  // Image modulation nodes
  registry.register(createImgScaleNode());
  registry.register(createImgFitNode());
  registry.register(createImgXYOffsetNode());
  registry.register(createImgTransparencyNode());
  registry.register(createLoadVideoFromAssetsNode());
  registry.register(createLoadVideoFromLocalNode());
  registry.register(createPlayMediaNode());
  // Patch root sinks (Max/MSP style).
  registry.register(createAudioOutNode());
  registry.register(createImageOutNode(deps));
  registry.register(createVideoOutNode(deps));
  registry.register(createEffectOutNode(deps));
  registry.register(createSceneOutNode(deps));
  registry.register(createFlashlightProcessorNode());
  registry.register(createShowImageProcessorNode());
  registry.register(createPushImageUploadNode());
  registry.register(createScreenColorProcessorNode());
  registry.register(createSynthUpdateProcessorNode());
  // Visual scene chain
  registry.register(createSceneBoxNode());
  registry.register(createSceneMelNode());
  registry.register(createSceneFrontCameraNode());
  registry.register(createSceneBackCameraNode());
  registry.register(createEffectConvolutionNode());
  registry.register(createEffectAsciiNode());
  registry.register(createAiModelRefNode());
}
