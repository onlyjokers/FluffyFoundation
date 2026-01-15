/**
 * Node Graph Type Definitions (Manager)
 *
 * Manager uses the shared node-core types, plus a small amount of manager-only metadata.
 */

export type {
  ConfigField,
  Connection,
  GraphChange,
  GraphState,
  GraphValidationResult,
  NodeDefinition,
  NodeInstance,
  NodePort,
  PortKind,
  PortType,
  ProcessContext,
} from '@shugu/node-core';

export type NodeMode = 'REMOTE' | 'MODULATION';
