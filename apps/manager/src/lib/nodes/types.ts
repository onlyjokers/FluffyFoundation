/**
 * Node Graph Type Definitions (Manager)
 *
 * Manager uses the shared node-core types, plus a small amount of manager-only metadata.
 */

import type {
  ConfigField,
  GraphChange,
  GraphValidationResult,
  Connection as CoreConnection,
  GraphGroup,
  NodeDefinition,
  NodeInstance as CoreNodeInstance,
  NodePort,
  PortKind,
  PortType,
  ProcessContext,
} from '@shugu/node-core';

export type {
  ConfigField,
  GraphChange,
  GraphValidationResult,
  GraphGroup,
  NodeDefinition,
  NodePort,
  PortKind,
  PortType,
  ProcessContext,
};

export interface NodeInstance extends Omit<CoreNodeInstance, 'inputValues' | 'outputValues'> {
  [key: string]: unknown;
  inputValues: Record<string, unknown>;
  outputValues: Record<string, unknown>;
}

export interface Connection extends CoreConnection {
  [key: string]: unknown;
}

export interface GraphState {
  [key: string]: unknown;
  nodes: NodeInstance[];
  connections: Connection[];
  groups?: GraphGroup[];
}

export type NodeMode = 'REMOTE' | 'MODULATION';
