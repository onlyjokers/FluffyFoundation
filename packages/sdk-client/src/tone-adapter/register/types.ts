/**
 * Purpose: Shared Tone register module types.
 */
import type { ConfigField, NodePort } from '@shugu/node-core';

export type LoadAudioNodeOptions = {
  type: string;
  label: string;
  inputs: NodePort[];
  configSchema: ConfigField[];
  resolveBaseUrlRaw: (inputs: Record<string, unknown>, config: Record<string, unknown>) => string;
  sensorNodeType: string;
};
