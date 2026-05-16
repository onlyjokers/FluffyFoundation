/**
 * Purpose: Server-owned semantic graph authority with local JSON persistence.
 */
import { Injectable } from '@nestjs/common';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  applySemanticCommand,
  createSemanticCommandBus,
  cloneGroups,
  cloneGraph,
  clonePartitions,
  registerDefaultNodeDefinitions,
  NodeRegistry,
  type GraphState,
  type SemanticActor,
  type SemanticCommand,
  type SemanticCommandResult,
  type SemanticGraphSnapshot,
  type SemanticGroup,
  type SemanticPartition,
} from '@shugu/node-core';

type PersistedSemanticGraph = {
  revision: number;
  graph: GraphState;
  groups: SemanticGroup[];
  partitions: SemanticPartition[];
};

const defaultStoragePath = join(process.cwd(), 'data', 'semantic-graph.json');
const emptyGraph: GraphState = { nodes: [], connections: [] };

@Injectable()
export class SemanticGraphAuthorityService {
  static readonly defaultStoragePath = defaultStoragePath;
  static withStoragePath(storagePath: string): SemanticGraphAuthorityService {
    const service = new SemanticGraphAuthorityService();
    service.storagePath = storagePath;
    service.persisted = service.load();
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
    this.persisted = this.load();
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
        };
        this.persist();
        return result;
      }

      this.persisted = {
        revision: result.appliedRevision,
        graph: applySemanticCommand({
          graph: cloneGraph(this.persisted.graph),
          groups: cloneGroups(this.persisted.groups),
          partitions: clonePartitions(this.persisted.partitions),
          proposals: [],
          runtimeStatus: { running: false, deployedPartitionIds: [] },
          revision: this.persisted.revision,
        }, result.command).graph,
        groups: result.snapshot.groups,
        partitions: result.snapshot.partitions,
      };
      this.persist();
    }
    return result;
  }

  private createBus() {
    return createSemanticCommandBus({
      graph: this.persisted.graph,
      groups: this.persisted.groups,
      partitions: this.persisted.partitions,
      definitions: this.registry.list(),
      runtimeStatus: { running: false, deployedPartitionIds: [] },
      permissions: [
        {
          actorId: 'cli',
          operations: ['node.add', 'node.connect', 'node.params.update', 'node.remove', 'graph.replace'],
        },
        {
          actorId: 'canvas',
          operations: ['node.add', 'node.connect', 'node.params.update', 'node.remove', 'graph.replace'],
        },
      ],
      revision: this.persisted.revision,
    });
  }

  private load(): PersistedSemanticGraph {
    if (!existsSync(this.storagePath)) {
      return { revision: 0, graph: emptyGraph, groups: [], partitions: [] };
    }

    const raw = JSON.parse(readFileSync(this.storagePath, 'utf8')) as Partial<PersistedSemanticGraph>;
    return {
      revision: Number.isFinite(raw.revision) ? Number(raw.revision) : 0,
      graph: raw.graph ?? emptyGraph,
      groups: Array.isArray(raw.groups) ? raw.groups : [],
      partitions: Array.isArray(raw.partitions) ? raw.partitions : [],
    };
  }

  private persist(): void {
    mkdirSync(dirname(this.storagePath), { recursive: true });
    const tmpPath = `${this.storagePath}.tmp`;
    writeFileSync(tmpPath, JSON.stringify(this.persisted, null, 2), 'utf8');
    renameSync(tmpPath, this.storagePath);
  }
}
