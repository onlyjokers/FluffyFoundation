/**
 * Purpose: Public exports for shared visual post-processing effects.
 */

export type { VisualEffect } from '@shugu/protocol';
export type { VisualEffectPipeline, VisualEffectRenderParams } from './pipeline.js';
export { createVisualEffectPipeline, resetVisualEffectPipeline, renderVisualEffects } from './pipeline.js';
export { applyConvolution3x3, resolveConvolutionKernel, applyConvolutionEffect } from './convolution.js';
export type { ConvolutionPreset, Convolution3x3Params, ConvolutionEffectRuntime } from './convolution.js';
export { applyAsciiEffect, drawAsciiBorder, getAsciiGridSize } from './ascii.js';
export type { AsciiEffectRuntime, AsciiEffectResult, AsciiGridSize } from './ascii.js';
