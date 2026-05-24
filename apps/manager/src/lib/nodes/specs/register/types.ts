/**
 * Purpose: Shared types for manager JSON node spec registration.
 */
import type { ControlAction } from '@shugu/protocol';
import type { ConfigField, NodeDefinition, NodePort } from '../../types';

export type WhenOp = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte';
export type WhenSource = 'input' | 'config' | 'payload';
export type WhenCondition = { source: WhenSource; key: string; op: WhenOp; value: string | number | boolean };

export type ClampSpec = { min?: number; max?: number };

export type MidiBooleanState = {
  value: boolean;
  lastPressed: boolean;
  sourceKey: string | null;
};

export type ClientSelectionState = {
  index: number;
  range: number;
  random: boolean;
  baseRandomIds: string[];
  selectedIds: string[];
  clientsKey: string;
};

export type CommandFieldMapping =
  | { kind: 'literal'; value: unknown; when?: WhenCondition }
  | {
      kind: 'number';
      inputKey?: string;
      configKey?: string;
      default?: number;
      clamp?: ClampSpec;
      omitIfZero?: boolean;
      when?: WhenCondition;
    }
  | {
      kind: 'string';
      inputKey?: string;
      configKey?: string;
      default?: string;
      when?: WhenCondition;
    }
  | {
      kind: 'enumFromFuzzy';
      inputKey: string;
      options: string[];
      configKey?: string;
      default?: string;
      when?: WhenCondition;
    }
  | {
      kind: 'enumFromThreshold';
      inputKey: string;
      threshold: number;
      whenTrue: string;
      whenFalse: string;
      configKey?: string;
      default?: string;
      when?: WhenCondition;
    };

export type CommandRuntime = {
  kind: 'command';
  command: {
    action: ControlAction;
    /** Optional gating: when set, requires `inputs[clientInput].clientId` to be present. */
    clientInput?: string;
    output?: string; // default: 'cmd'
    payload: Record<string, CommandFieldMapping>;
  };
};

export type NodeRuntime =
  | { kind: 'client-loader' }
  | { kind: 'client-executor' }
  | { kind: 'url-session' }
  | { kind: 'url-to-qr-generator' }
  | { kind: 'gpt-image-gen' }
  | { kind: 'client-permission-filter' }
  | { kind: 'client-url-session-filter' }
  | { kind: 'display-object' }
  | { kind: 'proc-client-sensors' }
  | { kind: 'param-get' }
  | { kind: 'param-set' }
  | { kind: 'float' }
  | { kind: 'int' }
  | { kind: 'number-stabilizer' }
  | { kind: 'math' }
  | { kind: 'logic-add' }
  | { kind: 'logic-multiple' }
  | { kind: 'logic-subtract' }
  | { kind: 'logic-divide' }
  | { kind: 'logic-if' }
  | { kind: 'logic-for' }
  | { kind: 'logic-sleep' }
  | { kind: 'logic-number-to-boolean' }
  | { kind: 'number-script' }
  | { kind: 'client-count' }
  | { kind: 'array-filter' }
  | { kind: 'group-frame' }
  | { kind: 'group-activate' }
  | { kind: 'tone-osc' }
  | { kind: 'tone-delay' }
  | { kind: 'tone-resonator' }
  | { kind: 'tone-pitch' }
  | { kind: 'tone-reverb' }
  | { kind: 'tone-granular' }
  | { kind: 'play-media' }
  | { kind: 'midi-fuzzy' }
  | { kind: 'midi-boolean' }
  | { kind: 'midi-map' }
  | { kind: 'midi-select-map' }
  | { kind: 'midi-color-map' }
  | CommandRuntime;

export type NodeSpec = {
  type: string;
  label?: string;
  category?: string;
  metadata?: Partial<NodeDefinition['metadata']>;
  inputs?: NodePort[];
  outputs?: NodePort[];
  configSchema?: ConfigField[];
  runtime?: NodeRuntime;
};
