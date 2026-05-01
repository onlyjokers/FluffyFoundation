/**
 * Shared node graph types.
 *
 * Keep this minimal and data-only so graphs can be serialized safely.
 * Manager-only UI concerns (Svelte stores, DOM interactions) must stay outside node-core.
 */

export type PortType =
  | 'number'
  | 'boolean'
  | 'string'
  | 'asset'
  | 'color'
  | 'audio'
  | 'image'
  | 'video'
  | 'scene'
  | 'effect'
  | 'client'
  | 'command'
  | 'fuzzy'
  | 'array'
  | 'any';

export type PortKind = 'data' | 'sink';

export interface NodePort {
  id: string;
  label: string;
  type: PortType;
  defaultValue?: unknown;
  /**
   * Optional numeric UI hints.
   * Platforms may choose to enforce these limits (e.g. manager clamps inputs).
   */
  min?: number;
  max?: number;
  step?: number;
  /**
   * `data` ports participate in the compute DAG.
   * `sink` ports are side-effect inputs delivered after compute.
   */
  kind?: PortKind;
}

export interface ConfigField {
  key: string;
  label: string;
  type:
    | 'string'
    | 'number'
    | 'boolean'
    | 'time-range'
    | 'select'
    | 'param-path'
    | 'midi-source'
    | 'client-picker'
    | 'asset-picker'
    | 'local-asset-picker'
    | 'file'
    | 'curve';
  defaultValue?: unknown;
  options?: { value: string; label: string }[];
  assetKind?: 'audio' | 'image' | 'video' | 'model' | 'any';
  min?: number;
  max?: number;
  step?: number;
  accept?: string;
  buttonLabel?: string;
}

export interface ProcessContext {
  nodeId: string;
  time: number;
  deltaTime: number;
}

export interface NodeDefinition {
  type: string;
  label: string;
  category: string;
  inputs: NodePort[];
  outputs: NodePort[];
  configSchema: ConfigField[];
  process: (
    inputs: Record<string, unknown>,
    config: Record<string, unknown>,
    context: ProcessContext
  ) => Record<string, unknown>;
  onSink?: (
    inputs: Record<string, unknown>,
    config: Record<string, unknown>,
    context: ProcessContext
  ) => void;
  /**
   * Optional lifecycle hook invoked when a node stops executing due to a gate closing
   * (e.g. graph stop / group gate closed). Use this to undo side-effects.
   */
  onDisable?: (
    inputs: Record<string, unknown>,
    config: Record<string, unknown>,
    context: ProcessContext
  ) => void;
}

export interface NodeInstance {
  id: string;
  type: string;
  position: { x: number; y: number };
  config: Record<string, unknown>;
  inputValues: Record<string, unknown>;
  outputValues: Record<string, unknown>;
}

export interface Connection {
  id: string;
  sourceNodeId: string;
  sourcePortId: string;
  targetNodeId: string;
  targetPortId: string;
}

export interface GraphState {
  nodes: NodeInstance[];
  connections: Connection[];
}
