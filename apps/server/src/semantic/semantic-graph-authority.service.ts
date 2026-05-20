/**
 * Purpose: Server-owned semantic graph authority with local JSON persistence.
 */
import { Injectable } from '@nestjs/common';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applySemanticCommand,
  cloneAgentCapabilities,
  cloneCustomDefinitions,
  createCustomNodeDefinitionNode,
  createSemanticCommandBus,
  cloneGroups,
  cloneGraph,
  clonePartitions,
  registerDefaultNodeDefinitions,
  NodeRegistry,
  type GraphState,
  type AgentCapabilitySettings,
  type CustomNodeDefinition,
  type SemanticActor,
  type SemanticCommand,
  type SemanticCommandResult,
  type SemanticGraphSnapshot,
  type SemanticGroup,
  type SemanticPartition,
} from '@shugu/node-core';
import { createArduinoUnoNodeDefinitions } from '@shugu/arduino-uno-plugin';

type PersistedSemanticGraph = {
  revision: number;
  graph: GraphState;
  groups: SemanticGroup[];
  partitions: SemanticPartition[];
  customDefinitions: CustomNodeDefinition[];
  agentCapabilities: AgentCapabilitySettings;
};

const defaultStoragePath = fileURLToPath(new URL('../../data/semantic-graph.json', import.meta.url));
const emptyGraph: GraphState = { nodes: [], connections: [] };

@Injectable()
export class SemanticGraphAuthorityService {
  static readonly defaultStoragePath = defaultStoragePath;
  static withStoragePath(storagePath: string): SemanticGraphAuthorityService {
    const service = new SemanticGraphAuthorityService();
    service.storagePath = storagePath;
    service.persisted = service.load();
    service.syncCustomNodeRegistry();
    return service;
  }

  private storagePath: string;
  private readonly registry = new NodeRegistry();
  private persisted: PersistedSemanticGraph;

  constructor() {
    this.storagePath = defaultStoragePath;
    registerDefaultNodeDefinitions(this.registry, {
      getClientId: () => null,
      getAllClientIds: () => [],
      getSelectedClientIds: () => [],
      getSensorForClientId: () => null,
      getImageForClientId: () => null,
      executeCommand: () => undefined,
      executeCommandForClientId: () => undefined,
    });
    for (const definition of createArduinoUnoNodeDefinitions()) {
      this.registry.register(definition);
    }
    this.persisted = this.load();
    this.syncCustomNodeRegistry();
  }

  getSnapshot(): SemanticGraphSnapshot {
    return this.createBus().getSnapshot();
  }

  getHistory() {
    return this.createBus().getHistory();
  }

  dispatch(input: {
    actor: SemanticActor;
    command: SemanticCommand;
    dryRun?: boolean;
  }): SemanticCommandResult {
    const bus = this.createBus();
    const result = bus.dispatch(input);
    if (result.ok && !input.dryRun && result.command.type !== 'graph.snapshot') {
      if (result.command.type === 'graph.replace') {
        this.persisted = {
          revision: result.appliedRevision,
          graph: result.command.graph,
          groups: result.command.groups ?? [],
          partitions: result.command.partitions ?? [],
          customDefinitions: cloneCustomDefinitions(this.persisted.customDefinitions),
          agentCapabilities: cloneAgentCapabilities(this.persisted.agentCapabilities),
        };
        this.syncCustomNodeRegistry();
        this.persist();
        return result;
      }

      this.persisted = {
        revision: result.appliedRevision,
        graph: applySemanticCommand({
          graph: cloneGraph(this.persisted.graph),
          groups: cloneGroups(this.persisted.groups),
          partitions: clonePartitions(this.persisted.partitions),
          customDefinitions: cloneCustomDefinitions(this.persisted.customDefinitions),
          agentCapabilities: cloneAgentCapabilities(this.persisted.agentCapabilities),
          proposals: [],
          runtimeStatus: { running: false, deployedPartitionIds: [] },
          revision: this.persisted.revision,
        }, result.command).graph,
        groups: result.snapshot.groups,
        partitions: result.snapshot.partitions,
        customDefinitions: cloneCustomDefinitions(result.snapshot.customDefinitions),
        agentCapabilities: cloneAgentCapabilities(result.snapshot.agentCapabilities),
      };
      if (
        result.command.type === 'definition.custom.upsert' ||
        result.command.type === 'definition.custom.remove'
      ) {
        this.syncCustomNodeRegistry();
      }
      this.persist();
    }
    return result;
  }

  private createBus() {
    return createSemanticCommandBus({
      graph: this.persisted.graph,
      groups: this.persisted.groups,
      partitions: this.persisted.partitions,
      customDefinitions: this.persisted.customDefinitions,
      agentCapabilities: this.persisted.agentCapabilities,
      definitions: this.registry.list(),
      runtimeStatus: { running: false, deployedPartitionIds: [] },
      permissions: [
        {
          actorId: 'cli',
          operations: ['node.add', 'node.connect', 'node.disconnect', 'node.params.update', 'node.inputs.update', 'node.remove', 'graph.replace'],
        },
        {
          actorId: 'canvas',
          operations: ['node.add', 'node.connect', 'node.disconnect', 'node.params.update', 'node.inputs.update', 'node.remove', 'graph.replace'],
        },
      ],
      revision: this.persisted.revision,
    });
  }

  private load(): PersistedSemanticGraph {
    if (!existsSync(this.storagePath)) {
      return {
        revision: 0,
        graph: emptyGraph,
        groups: [],
        partitions: [],
        customDefinitions: [],
        agentCapabilities: { version: 1, nodes: [] },
      };
    }

    const raw = JSON.parse(readFileSync(this.storagePath, 'utf8')) as Partial<PersistedSemanticGraph>;
    return {
      revision: Number.isFinite(raw.revision) ? Number(raw.revision) : 0,
      graph: raw.graph ?? emptyGraph,
      groups: Array.isArray(raw.groups) ? raw.groups : [],
      partitions: Array.isArray(raw.partitions) ? raw.partitions : [],
      customDefinitions: cloneCustomDefinitions(
        Array.isArray(raw.customDefinitions) ? raw.customDefinitions : []
      ),
      agentCapabilities: cloneAgentCapabilities(raw.agentCapabilities),
    };
  }

  private syncCustomNodeRegistry(): void {
    for (const definition of this.registry.list()) {
      if (definition.type.startsWith('custom:')) this.registry.unregister(definition.type);
    }
    for (const definition of this.persisted.customDefinitions) {
      if (!definition.definitionId) continue;
      this.registry.register(createCustomNodeDefinitionNode(definition, this.registry.list()));
    }
  }

  private persist(): void {
    mkdirSync(dirname(this.storagePath), { recursive: true });
    const tmpPath = `${this.storagePath}.tmp`;
    writeFileSync(tmpPath, JSON.stringify(this.persisted, null, 2), 'utf8');
    renameSync(tmpPath, this.storagePath);
  }
}
