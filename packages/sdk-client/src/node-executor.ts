import { PROTOCOL_VERSION, type PluginControlMessage } from '@shugu/protocol';
import type { ClientSDK } from './client-sdk.js';
import { applyGraphChanges, type GraphChange, NodeRegistry, NodeRuntime } from '@shugu/node-core';
import { registerDefaultNodeDefinitions, type NodeCommand } from './node-definitions.js';
import type { GraphState } from './node-types.js';
import { registerToneClientDefinitions, type ToneAdapterHandle } from './tone-adapter.js';
import { getBrowserAudioContextCtor } from './browser/audio-context.js';
import { extractOverrides } from './node-executor-overrides.js';

export type NodeExecutorDeployPayload = {
  graph: Pick<GraphState, 'nodes' | 'connections'>;
  meta: {
    loopId: string;
    requiredCapabilities?: string[];
    tickIntervalMs?: number;
    protocolVersion?: number;
    executorVersion?: string;
  };
};

export type NodeExecutorStatus = {
  running: boolean;
  loopId: string | null;
  lastError: string | null;
};

export type NodeExecutorOptions = {
  /**
   * Optional gate for safety/UX. If provided and returns false, deploy/start will be rejected.
   */
  isEnabled?: () => boolean;
  /**
   * Safety limits (Task 6 will tighten these further).
   */
  canRunCapability?: (capability: string) => boolean;
  /**
   * Optional asset resolver for URL-like inputs (e.g. `asset:<id>` -> https://.../content?token=...).
   * When provided, Tone nodes (load-audio-from-assets/granular) will resolve before loading.
   */
  resolveAssetRef?: (ref: string) => string;
  /**
   * Optional priority fetch function from MultimediaCore.
   * Audio loading will use this to check cache and prioritize downloads.
   */
  prioritizeFetch?: (url: string) => Promise<Response>;
  limits?: {
    maxNodes?: number;
    minTickIntervalMs?: number;
    maxTickIntervalMs?: number;
    maxTickDurationMs?: number;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

export class NodeExecutor {
  private registry = new NodeRegistry();
  private runtime: NodeRuntime;
  private toneAdapter: ToneAdapterHandle | null = null;
  private loopId: string | null = null;
  private lastError: string | null = null;
  private running = false;
  private consecutiveSlowTicks = 0;
  private recentTickDurationsMs: number[] = [];

  private options: {
    isEnabled: () => boolean;
    canRunCapability: (capability: string) => boolean;
    limits: {
      maxNodes: number;
      minTickIntervalMs: number;
      maxTickIntervalMs: number;
      maxTickDurationMs: number;
    };
  };

  constructor(
    private sdk: ClientSDK,
    private executeCommand: (cmd: NodeCommand) => void,
    options?: NodeExecutorOptions
  ) {
    const defaultCanRunCapability = (capability: string) => {
      if (capability === 'sensors') {
        return (
          typeof window !== 'undefined' &&
          ('DeviceMotionEvent' in window || 'DeviceOrientationEvent' in window)
        );
      }
      if (capability === 'flashlight') {
        return typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);
      }
      if (capability === 'screen') {
        return typeof document !== 'undefined';
      }
      if (capability === 'sound') {
        return typeof window !== 'undefined' && Boolean(getBrowserAudioContextCtor(window));
      }
      if (capability === 'visual') return true;
      return true;
    };

    this.options = {
      isEnabled: options?.isEnabled ?? (() => true),
      canRunCapability: options?.canRunCapability ?? defaultCanRunCapability,
      limits: {
        maxNodes: options?.limits?.maxNodes ?? 80,
        // Default to ~30 FPS on mobile to avoid excessive power/thermal usage.
        minTickIntervalMs: options?.limits?.minTickIntervalMs ?? 33,
        maxTickIntervalMs: options?.limits?.maxTickIntervalMs ?? 250,
        maxTickDurationMs: options?.limits?.maxTickDurationMs ?? 120,
      },
    };

    registerDefaultNodeDefinitions(this.registry, {
      getClientId: () => this.sdk.getState().clientId,
      getAllClientIds: () => {
        const id = this.sdk.getState().clientId;
        return id ? [id] : [];
      },
      getSelectedClientIds: () => {
        const id = this.sdk.getState().clientId;
        return id ? [id] : [];
      },
      getLatestSensor: () => this.sdk.getLatestSensorData(),
      executeCommand: (cmd) => this.executeCommand(cmd),
    });
    // Client-only Tone.js implementations override the shared node-core definitions.
    this.toneAdapter = registerToneClientDefinitions(this.registry, {
      sdk: this.sdk,
      resolveAssetRef: options?.resolveAssetRef,
      prioritizeFetch: options?.prioritizeFetch,
    });

    this.runtime = new NodeRuntime(this.registry, {
      onTick: ({ durationMs }) => {
        const next = Number(durationMs);
        if (Number.isFinite(next) && next >= 0) {
          this.recentTickDurationsMs = [...this.recentTickDurationsMs, next].slice(-12);
        }

        if (next <= this.options.limits.maxTickDurationMs) {
          this.consecutiveSlowTicks = 0;
          return;
        }

        this.consecutiveSlowTicks += 1;
        if (this.consecutiveSlowTicks < 3) {
          console.warn('[node-executor] slow tick (transient)', {
            durationMs: next,
            consecutive: this.consecutiveSlowTicks,
          });
          return;
        }

        this.lastError = `tick exceeded budget (${next.toFixed(1)}ms) x${this.consecutiveSlowTicks}`;
        console.warn('[node-executor] stopping due to slow tick', this.lastError);
        this.runtime.stop();
        this.running = false;
        this.report('stopped', {
          loopId: this.loopId,
          reason: 'watchdog',
          watchdog: 'slow-tick',
          error: this.lastError,
          diagnostics: {
            consecutiveSlowTicks: this.consecutiveSlowTicks,
            recentTickDurationsMs: this.recentTickDurationsMs,
          },
        });
      },
      onWatchdog: (info) => {
        const message =
          typeof info?.message === 'string' && info.message ? info.message : 'watchdog triggered';
        this.lastError = message;
        this.runtime.stop();
        this.running = false;
        this.report('stopped', {
          loopId: this.loopId,
          reason: 'watchdog',
          watchdog: typeof info?.reason === 'string' ? info.reason : 'unknown',
          error: message,
          diagnostics: {
            ...((info?.diagnostics ?? {}) as Record<string, unknown>),
            recentTickDurationsMs: this.recentTickDurationsMs,
          },
        });
      },
    });
  }

  getStatus(): NodeExecutorStatus {
    return { running: this.running, loopId: this.loopId, lastError: this.lastError };
  }

  destroy(): void {
    this.runtime.stop();
    this.runtime.clear();
    this.clearToneNodes();
    this.loopId = null;
    this.running = false;
    this.lastError = null;
    this.report('destroyed', {});
  }

  handlePluginControl(message: PluginControlMessage): void {
    if (message.pluginId !== 'node-executor') return;
    try {
      if (message.command === 'deploy') {
        this.deploy(message.payload);
        return;
      }
      if (message.command === 'graph-changes') {
        const payloadRecord = isRecord(message.payload) ? message.payload : {};
        const raw = payloadRecord.changes;
        const changes = Array.isArray(raw) ? (raw as GraphChange[]) : [];
        this.applyGraphChanges(changes);
        return;
      }
      if (message.command === 'start') {
        this.start(message.payload);
        return;
      }
      if (message.command === 'stop') {
        this.stop(message.payload);
        return;
      }
      if (message.command === 'remove') {
        this.remove(message.payload);
        return;
      }
      if (message.command === 'override-set') {
        this.applyOverrides(message.payload);
        return;
      }
      if (message.command === 'override-remove') {
        this.removeOverrides(message.payload);
        return;
      }
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      console.error('[node-executor] command failed', message.command, err);
      this.report('error', { command: message.command, error: this.lastError });
    }
  }

  applyGraphChanges(changes: GraphChange[]): void {
    if (!changes.length) return;
    const prev = this.runtime.exportGraph();
    const next = applyGraphChanges(prev, changes);
    if (next.nodes.length > this.options.limits.maxNodes) {
      throw new Error(`graph too large (${next.nodes.length} nodes > ${this.options.limits.maxNodes})`);
    }

    const toneNodeIds = new Set(
      next.nodes
        .filter((node) =>
          [
            'load-audio-from-assets',
            'load-audio-from-local',
            'tone-osc',
            'audio-data',
            'tone-delay',
            'tone-resonator',
            'tone-pitch',
            'tone-reverb',
            'tone-granular',
            'tone-lfo',
          ].includes(node.type)
        )
        .map((node) => node.id)
    );
    this.toneAdapter?.syncActiveNodes(toneNodeIds, next.nodes, next.connections);
    this.runtime.loadGraph(next);
  }

  private deploy(payload: unknown): void {
    if (!this.options.isEnabled()) {
      throw new Error('node-executor is disabled on this client');
    }
    const parsed = this.parseDeployPayload(payload);

    const nodeCount = parsed.graph.nodes.length;
    if (nodeCount > this.options.limits.maxNodes) {
      throw new Error(`graph too large (${nodeCount} nodes > ${this.options.limits.maxNodes})`);
    }

    const required = parsed.meta.requiredCapabilities ?? [];
    const missing = required.filter((cap) => !this.options.canRunCapability(cap));
    if (missing.length > 0) {
      const error = `missing required capabilities: ${missing.join(', ')}`;
      this.report('rejected', {
        loopId: parsed.meta.loopId,
        requiredCapabilities: required,
        missingCapabilities: missing,
        error,
      });
      throw new Error(error);
    }

    const tickIntervalMs = Number(parsed.meta.tickIntervalMs ?? 33);
    const clampedTick = Math.max(
      this.options.limits.minTickIntervalMs,
      Math.min(this.options.limits.maxTickIntervalMs, Math.floor(tickIntervalMs))
    );

    if (
      typeof parsed.meta.protocolVersion === 'number' &&
      parsed.meta.protocolVersion !== PROTOCOL_VERSION
    ) {
      console.warn(
        `[node-executor] protocol mismatch (payload=${parsed.meta.protocolVersion}, client=${PROTOCOL_VERSION})`
      );
    }

    // Best-effort: ensure the deployed graph targets this client.
    const selfClientId = this.sdk.getState().clientId;
    const clientNodes = parsed.graph.nodes.filter((n) => n.type === 'client-object');
    const configuredClientId =
      typeof clientNodes[0]?.config?.clientId === 'string'
        ? String(clientNodes[0]?.config?.clientId)
        : '';
    if (selfClientId && configuredClientId && selfClientId !== configuredClientId) {
      throw new Error(
        `graph clientId mismatch (payload=${configuredClientId}, self=${selfClientId})`
      );
    }

    // Only keep Tone instances for audio nodes present in the next graph.
    const toneNodeIds = new Set(
      parsed.graph.nodes
        .filter((node) =>
          [
            'load-audio-from-assets',
            'load-audio-from-local',
            'tone-osc',
            'audio-data',
            'tone-delay',
            'tone-resonator',
            'tone-pitch',
            'tone-reverb',
            'tone-granular',
            'tone-lfo',
          ].includes(node.type)
        )
        .map((node) => node.id)
    );
    this.toneAdapter?.syncActiveNodes(toneNodeIds, parsed.graph.nodes, parsed.graph.connections);

    this.runtime.stop();
    this.runtime.clear();
    this.runtime.setTickIntervalMs(clampedTick);
    this.runtime.loadGraph(parsed.graph);

    this.loopId = parsed.meta.loopId;
    this.lastError = null;
    this.runtime.start();
    this.running = true;

    console.log('[node-executor] deployed', {
      loopId: this.loopId,
      tickIntervalMs: clampedTick,
      requiredCapabilities: parsed.meta.requiredCapabilities ?? [],
    });

    this.report('deployed', {
      loopId: this.loopId,
      tickIntervalMs: clampedTick,
      requiredCapabilities: parsed.meta.requiredCapabilities ?? [],
    });
  }

  private start(payload: unknown): void {
    if (!this.options.isEnabled()) {
      throw new Error('node-executor is disabled on this client');
    }
    const loopId = this.readLoopId(payload);
    if (loopId && this.loopId && loopId !== this.loopId) return;
    this.runtime.start();
    this.running = true;
    this.report('started', { loopId: this.loopId });
  }

  private stop(payload: unknown): void {
    const loopId = this.readLoopId(payload);
    if (loopId && this.loopId && loopId !== this.loopId) return;
    this.runtime.stop();
    this.running = false;
    this.report('stopped', { loopId: this.loopId });
  }

  private remove(payload: unknown): void {
    const loopId = this.readLoopId(payload);
    if (loopId && this.loopId && loopId !== this.loopId) return;
    this.runtime.stop();
    this.runtime.clear();
    this.runtime.clearOverrides();
    this.clearToneNodes();
    this.loopId = null;
    this.running = false;
    this.lastError = null;
    this.report('removed', { loopId });
  }

  private applyOverrides(payload: unknown): void {
    if (!isRecord(payload)) return;
    const loopId = this.readLoopId(payload);
    if (loopId && this.loopId && loopId !== this.loopId) return;
    for (const item of extractOverrides(payload)) {
      this.runtime.applyOverride(item.nodeId, item.kind, item.key, item.value, item.ttlMs);
    }
  }

  private removeOverrides(payload: unknown): void {
    if (!isRecord(payload)) return;
    const loopId = this.readLoopId(payload);
    if (loopId && this.loopId && loopId !== this.loopId) return;
    for (const item of extractOverrides(payload)) {
      this.runtime.removeOverride(item.nodeId, item.kind, item.key);
    }
  }

  private readLoopId(payload: unknown): string | null {
    if (!isRecord(payload)) return null;
    return typeof payload.loopId === 'string' ? payload.loopId : null;
  }

  private parseDeployPayload(payload: unknown): NodeExecutorDeployPayload {
    if (!isRecord(payload)) throw new Error('invalid payload');
    const graph = payload.graph;
    const meta = payload.meta;
    if (!isRecord(graph) || !isRecord(meta))
      throw new Error('invalid payload (missing graph/meta)');
    if (!Array.isArray(graph.nodes) || !Array.isArray(graph.connections)) {
      throw new Error('invalid payload (graph.nodes/graph.connections)');
    }
    const loopId = typeof meta.loopId === 'string' ? meta.loopId : '';
    if (!loopId) throw new Error('invalid payload (meta.loopId)');
    return {
      graph: graph as Pick<GraphState, 'nodes' | 'connections'>,
      meta: meta as NodeExecutorDeployPayload['meta'],
    };
  }

  private report(event: string, payload: Record<string, unknown>): void {
    try {
      this.sdk.sendSensorData(
        'custom',
        { kind: 'node-executor', event, ...payload },
        { trackLatest: false }
      );
    } catch {
      // ignore
    }
  }

  private clearToneNodes(): void {
    this.toneAdapter?.disposeAll();
  }
}
