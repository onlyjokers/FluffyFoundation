/**
 * Purpose: Data-only types for Phase 2.5 "Nodelization / Custom Nodes".
 *
 * These types are persisted in the project snapshot (localStorage) and can be
 * exported/imported cross-project as `*.shugu-node.json`.
 */
import type { GraphState, PortType } from '$lib/nodes/types';

export type CustomNodePortSide = 'input' | 'output';

export type CustomNodePortBinding = {
  /** Internal (template) nodeId this port proxies. */
  nodeId: string;
  /** Internal portId on the bound node. */
  portId: string;
};

export type CustomNodePort = {
  /** Stable identifier used for external port id + migration. */
  portKey: string;
  side: CustomNodePortSide;
  /** Display label (defaults to internal port label, but can be overridden). */
  label: string;
  type: PortType;
  /** Whether the port is manually pinned (kept even when unconnected). */
  pinned: boolean;
  /** UI placement for expanded frame edge ports (relative y, in px). */
  y: number;
  binding: CustomNodePortBinding;
};

export type CustomNodeDefinition = {
  definitionId: string;
  /** One-layer naming: definitionName. */
  name: string;
  /**
   * Template graph: internal nodes + connections (positions are relative to the
   * expanded frame origin).
   *
   * Node configs/inputValues represent the definition defaults for *new* instances.
   */
  template: GraphState;
  ports: CustomNodePort[];
};
