import { PROTOCOL_VERSION, type PluginControlMessage } from '@shugu/protocol';
import type { ClientSDK } from './client-sdk.js';
import { applyGraphChanges, type GraphChange, NodeRegistry, NodeRuntime } from '@shugu/node-core';
import { createAiRuntime, type AiRuntime } from '@shugu/ai-core';
import {
  registerDefaultNodeDefinitions,
  type ClientUiDeps,
  type NodeCommand,
} from './node-definitions.js';
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
  running: boolean; loopId: string | null; lastError: string | null;
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
  /**
   * Optional local UI bridge for ClientUI nodes. Omitted by Display and non-UI runtimes.
   */
  clientUi?: ClientUiDeps;
  /**
   * Server origin for client-side nodes that call server proxy endpoints.
   */
  serverUrl?: string;
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
  private aiRuntime: AiRuntime | null = null;
  private aiEnabled = false;
  private toneAdapter: ToneAdapterHandle | null = null;
  private loopId: string | null = null;
  private lastError: string | null = null;
  private running = false;
  private consecutiveSlowTicks = 0;
  private recentTickDurationsMs: number[] = [];
  private clientUi: ClientUiDeps | null = null;

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
    this.clientUi = options?.clientUi ?? null;

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
      clientUi: this.clientUi ?? undefined,
      audioAssets: {},
    });
    // Client-only Tone.js implementations override the shared node-core definitions.
    this.toneAdapter = registerToneClientDefinitions(this.registry, {
      sdk: this.sdk,
      resolveAssetRef: options?.resolveAssetRef,
      prioritizeFetch: options?.prioritizeFetch,
      serverUrl: options?.serverUrl,
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
        console.warn('[node-executor] slow tick watchdog warning', this.lastError);
        this.report('warning', {
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
        this.report('warning', {
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
    this.clientUi?.clearClientUi?.();
    void this.disableAiRuntime();
    this.clearToneNodes();
    this.loopId = null;
    this.running = false;
    this.lastError = null;
    this.report('destroyed', {});
  }

  stopAll(): void { this.destroy(); }

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
      console.warn('[node-executor] command warning', message.command, err);
      this.report('warning', { command: message.command, error: this.lastError });
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
            'aliyun-tts',
          ].includes(node.type)
        )
        .map((node) => node.id)
    );
    const validationRuntime = new NodeRuntime(this.registry);
    validationRuntime.loadGraph(next);
    validationRuntime.compileNow();

    this.toneAdapter?.syncActiveNodes(toneNodeIds, next.nodes, next.connections);
    this.runtime.loadGraph(next);
    this.clearRemovedClientUiNodes(prev, next);
    void this.syncAiRuntimeForGraph(next);
  }

  private clearRemovedClientUiNodes(
    prev: Pick<GraphState, 'nodes'>,
    next: Pick<GraphState, 'nodes'>
  ): void {
    if (!this.clientUi?.clearClientUiNode) return;
    const nextIds = new Set(next.nodes.map((node) => String(node.id)));
    for (const node of prev.nodes) {
      if ((node.type === 'client-button' || node.type === 'client-input-box') && !nextIds.has(String(node.id))) {
        this.clientUi.clearClientUiNode(String(node.id));
      }
    }
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
    const clientNodes = parsed.graph.nodes.filter((n) => n.type === 'client-loader');
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
            'aliyun-tts',
          ].includes(node.type)
        )
        .map((node) => node.id)
    );
    const validationRuntime = new NodeRuntime(this.registry);
    validationRuntime.loadGraph(parsed.graph);
    validationRuntime.compileNow();

    this.toneAdapter?.syncActiveNodes(toneNodeIds, parsed.graph.nodes, parsed.graph.connections);

    this.runtime.stop();
    this.runtime.clear();
    this.runtime.setTickIntervalMs(clampedTick);
    this.runtime.loadGraph(parsed.graph);

    this.loopId = parsed.meta.loopId;
    this.lastError = null;
    this.runtime.start();
    this.running = true;
    void this.syncAiRuntimeForGraph(parsed.graph);

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
    void this.syncAiRuntimeForGraph(this.runtime.exportGraph());
    this.report('started', { loopId: this.loopId });
  }

  private stop(payload: unknown): void {
    const loopId = this.readLoopId(payload);
    if (loopId && this.loopId && loopId !== this.loopId) return;
    this.runtime.stop();
    this.clientUi?.clearClientUi?.();
    void this.disableAiRuntime();
    this.running = false;
    this.report('stopped', { loopId: this.loopId });
  }

  private remove(payload: unknown): void {
    const loopId = this.readLoopId(payload);
    if (loopId && this.loopId && loopId !== this.loopId) return;
    this.runtime.stop();
    this.runtime.clear();
    this.runtime.clearOverrides();
    this.clientUi?.clearClientUi?.();
    void this.disableAiRuntime();
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

  private scanGraphForAiEnabled(graph: Pick<GraphState, 'nodes' | 'connections'>): boolean {
    const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
    if (nodes.length === 0) return false;

    const aiNodes = nodes.filter((node) => String(node.type) === 'ai-model-ref');
    if (aiNodes.length === 0) return false;

    for (const node of aiNodes) {
      const enabledRaw = (node.config as Record<string, unknown> | undefined)?.enabled;
      if (typeof enabledRaw === 'boolean') {
        if (enabledRaw) return true;
        continue;
      }
      if (typeof enabledRaw === 'number' && Number.isFinite(enabledRaw)) {
        if (enabledRaw >= 0.5) return true;
        continue;
      }
      return true;
    }

    return false;
  }

  private async syncAiRuntimeForGraph(graph: Pick<GraphState, 'nodes' | 'connections'>): Promise<void> {
    if (!this.running) {
      await this.disableAiRuntime();
      return;
    }

    const shouldEnable = this.scanGraphForAiEnabled(graph);
    if (!shouldEnable) {
      await this.disableAiRuntime();
      return;
    }

    if (!this.aiRuntime) {
      this.aiRuntime = createAiRuntime({ backend: 'noop' });
    }

    if (this.aiEnabled) return;

    this.aiEnabled = true;
    try {
      await this.aiRuntime.enable();
      this.report('ai', { status: 'enabled' });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.report('ai', { status: 'error', error: message });
    }
  }

  private async disableAiRuntime(): Promise<void> {
    if (!this.aiRuntime) {
      this.aiEnabled = false;
      return;
    }

    if (!this.aiEnabled) return;

    this.aiEnabled = false;
    try {
      await this.aiRuntime.disable();
      await this.aiRuntime.dispose();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.report('ai', { status: 'error', error: message });
    } finally {
      this.aiRuntime = null;
      this.report('ai', { status: 'disabled' });
    }
  }
}
