<!-- Purpose: Custom Rete node renderer for the node canvas. -->
<script lang="ts">
  import Ref from 'rete-svelte-plugin/svelte/Ref.svelte';
  import type {
    ClassicScheme,
    SvelteArea2D,
  } from 'rete-svelte-plugin/svelte/presets/classic/types';
  import { onDestroy, tick } from 'svelte';
  import { nodeEngine, nodeRegistry } from '$lib/nodes';
  import { readCustomNodeState } from '$lib/nodes/custom-nodes/instance';
  import type { NodeInstance } from '$lib/nodes/types';

  type NodeExtraData = {
    width?: number;
    height?: number;
    localLoop?: boolean;
    deployedLoop?: boolean;
    deployedPatch?: boolean;
    stopped?: boolean;
    groupDisabled?: boolean;
    groupSelected?: boolean;
  };
  type AnyRecord = Record<string, unknown>;

  function sortByIndex<K, I extends undefined | { index?: number }>(entries: [K, I][]) {
    entries.sort((a, b) => ((a[1] && a[1].index) || 0) - ((b[1] && b[1].index) || 0));
    return entries as [K, Exclude<I, undefined>][];
  }

  export let data: ClassicScheme['Node'] & NodeExtraData;
  export let emit: (props: SvelteArea2D<ClassicScheme>) => void;

  let nodeEl: HTMLDivElement | null = null;
  let customNodeState = null;

  // Feature: Node minimize/collapse UI (manager-only visual state).
  // Collapsing only affects layout/visibility; graph execution + connections remain intact.
  const toggleCollapsed = (event: Event) => {
    event.stopPropagation();
    // Important: derive next state from `data.collapsed` to avoid Svelte reactive cycles.
    const next = !(data as AnyRecord)?.collapsed;
    (data as AnyRecord).collapsed = next;
  };

  $: isCollapsed = isGroupPortNode ? true : Boolean((data as AnyRecord)?.collapsed);

  $: inputs = sortByIndex(Object.entries(data.inputs));
  $: controls = sortByIndex(Object.entries(data.controls));
  $: outputs = sortByIndex(Object.entries(data.outputs));

  function any<T>(arg: T): T {
    return arg;
  }

  // MIDI activity highlight state (set by NodeCanvas).
  $: isActive = Boolean((data as AnyRecord).active);
  $: activeInputs = new Set<string>((((data as AnyRecord).activeInputs ?? []) as string[]).map(String));
  $: activeOutputs = new Set<string>((((data as AnyRecord).activeOutputs ?? []) as string[]).map(String));
  $: isDeployedPatch = Boolean((data as AnyRecord).deployedPatch);
  $: isStopped = Boolean((data as AnyRecord).stopped);
  $: isGroupDisabled = Boolean((data as AnyRecord).groupDisabled);
  $: isGroupSelected = Boolean((data as AnyRecord).groupSelected);
  $: isGroupMinimized = Boolean((data as AnyRecord).groupMinimized);
  $: isHidden = Boolean((data as AnyRecord).hidden);

  // Live Port Values
  // Values are derived from NodeEngine runtime outputs and graph connections.
  // This enables "MIDI → mapping → processor" pipelines to show numbers at each port.
  const graphStateStore = nodeEngine.graphState;
  const tickTimeStore = nodeEngine.tickTime;

  type ConnectionInfo = { sourceNodeId: string; sourcePortId: string };
  type OutputConnectionInfo = { targetNodeId: string; targetPortId: string };

  let nodeId = '';
  $: nodeId = String(data?.id ?? '');

  $: instanceType = String(nodeEngine.getNode(nodeId)?.type ?? '');
  $: isCmdAggregator = instanceType === 'cmd-aggregator';
  $: isGroupPortNode = ['group-activate', 'group-gate', 'group-proxy'].includes(instanceType);
  $: isGroupFrameNode = instanceType === 'group-frame';
  $: proxyDirection =
    instanceType === 'group-proxy' ? String((nodeEngine.getNode(nodeId)?.config as AnyRecord)?.direction ?? 'output') : '';

  $: {
    // Keep in sync with runtime config changes (e.g. Uncouple promotes child → mother).
    $graphStateStore;
    customNodeState = readCustomNodeState(nodeEngine.getNode(nodeId)?.config ?? {});
  }
  $: isCustomNode = Boolean(customNodeState);
  $: customRole = customNodeState?.role ?? null;

  let groupFrameDisabled = false;
  $: groupFrameDisabled = (() => {
    if (!isGroupFrameNode) return false;
    const instance = nodeEngine.getNode(nodeId) as AnyRecord;
    return Boolean(instance?.config?.disabled);
  })();

  const cmdAggregatorMaxInputs = (): number => {
    const def = nodeRegistry.get('cmd-aggregator');
    if (!def) return 0;
    return def.inputs.reduce((best, port) => {
      const match = /^in(\d+)$/.exec(String(port.id));
      if (!match) return best;
      const idx = Number(match[1]);
      if (!Number.isFinite(idx) || idx <= 0) return best;
      return Math.max(best, idx);
    }, 0);
  };

  $: cmdAggregatorCurrentInputs = (Array.isArray(inputs) ? inputs : []).filter(([key]) =>
    /^in\d+$/.test(String(key))
  ).length;
  $: cmdAggregatorMax = cmdAggregatorMaxInputs();

  // Cmd Aggregator dynamic inputs: manage `inCount` and clean up connections when shrinking.
  const cmdAggregatorCurrentMaxIndex = (entries: [string, unknown][]): number => {
    const list = Array.isArray(entries) ? entries : [];
    return list.reduce((best, [key]) => {
      const match = /^in(\d+)$/.exec(String(key));
      if (!match) return best;
      const idx = Number(match[1]);
      if (!Number.isFinite(idx) || idx <= 0) return best;
      return Math.max(best, idx);
    }, 0);
  };

  $: cmdAggregatorMaxIndex = cmdAggregatorCurrentMaxIndex(inputs);

  const addCmdAggregatorInput = (event: Event) => {
    event.stopPropagation();
    if (!nodeId) return;
    if (!isCmdAggregator) return;
    if (cmdAggregatorMax <= 0) return;

    const next = Math.min(cmdAggregatorMax, Math.max(1, cmdAggregatorCurrentInputs) + 1);
    if (next === cmdAggregatorCurrentInputs) return;
    nodeEngine.updateNodeConfig(nodeId, { inCount: next });
  };

  const removeCmdAggregatorInput = (event: Event) => {
    event.stopPropagation();
    if (!nodeId) return;
    if (!isCmdAggregator) return;
    if (cmdAggregatorMaxIndex <= 1) return;

    const next = Math.max(1, cmdAggregatorMaxIndex - 1);
    const removedPorts = new Set<string>();
    for (let i = next + 1; i <= cmdAggregatorMaxIndex; i += 1) {
      removedPorts.add(`in${i}`);
    }

    for (const c of $graphStateStore.connections ?? []) {
      if (String(c.targetNodeId) !== nodeId) continue;
      const targetPortId = String((c as AnyRecord).targetPortId ?? '');
      if (!removedPorts.has(targetPortId)) continue;
      const id = String((c as AnyRecord).id ?? '');
      if (!id) continue;
      nodeEngine.removeConnection(id);
    }

    nodeEngine.updateNodeConfig(nodeId, { inCount: next });
  };

  const toggleGroupMinimized = () => {
    const instance = nodeEngine.getNode(nodeId) as AnyRecord;
    const raw = instance?.config?.groupId;
    const groupId = typeof raw === 'string' ? raw : raw ? String(raw) : '';
    if (!groupId) return;
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('shugu:toggle-group-minimized', { detail: { groupId } }));
  };

  const toggleGroupDisabled = () => {
    const instance = nodeEngine.getNode(nodeId) as AnyRecord;
    const raw = instance?.config?.groupId;
    const groupId = typeof raw === 'string' ? raw : raw ? String(raw) : '';
    if (!groupId) return;
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('shugu:toggle-group-disabled', { detail: { groupId } }));
  };

  const requestCustomUncouple = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!nodeId) return;
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('shugu:custom-node-uncouple', { detail: { nodeId } }));
  };

  const requestCustomExpand = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!nodeId) return;
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('shugu:custom-node-expand', { detail: { nodeId } }));
  };


  let inputConnections: Record<string, ConnectionInfo[]> = {};
  $: if (nodeId) {
    const byInput: Record<string, ConnectionInfo[]> = {};
    for (const c of $graphStateStore.connections ?? []) {
      if (String(c.targetNodeId) !== nodeId) continue;
      const key = String(c.targetPortId ?? '');
      if (!key) continue;
      (byInput[key] ??= []).push({
        sourceNodeId: String(c.sourceNodeId),
        sourcePortId: String(c.sourcePortId),
      });
    }
    inputConnections = byInput;
  } else {
    inputConnections = {};
  }

  let outputConnections: Record<string, OutputConnectionInfo[]> = {};
  $: if (nodeId) {
    const byOutput: Record<string, OutputConnectionInfo[]> = {};
    for (const c of $graphStateStore.connections ?? []) {
      if (String(c.sourceNodeId) !== nodeId) continue;
      const key = String(c.sourcePortId ?? '');
      if (!key) continue;
      (byOutput[key] ??= []).push({
        targetNodeId: String(c.targetNodeId),
        targetPortId: String(c.targetPortId),
      });
    }
    outputConnections = byOutput;
  } else {
    outputConnections = {};
  }

  function formatNumber(value: number, maxDecimals = 3): string {
    if (!Number.isFinite(value)) return '--';
    const fixed = value.toFixed(maxDecimals);
    return fixed.replace(/\.?0+$/, '');
  }

  function formatPortValue(portType: string, value: unknown): string | null {
    // Always show numeric ports (even when null), since these are the common "MIDI pipe" signals.
    if (portType === 'number' || portType === 'fuzzy') {
      if (typeof value !== 'number') return '--';
      return formatNumber(value, portType === 'fuzzy' ? 3 : 3);
    }

    if (value === null || value === undefined) return null;

    if (portType === 'boolean')
      return typeof value === 'boolean' ? (value ? 'true' : 'false') : null;
    if (portType === 'string' || portType === 'asset') return typeof value === 'string' ? value : null;
    if (portType === 'color') return typeof value === 'string' ? value : null;
    if (portType === 'client' && typeof value === 'object' && value) {
      const clientId = (value as AnyRecord).clientId;
      return clientId ? String(clientId) : null;
    }

    return null;
  }

  function portTypeFor(side: 'input' | 'output', portId: string): string {
    const instance = nodeEngine.getNode(nodeId);
    if (!instance) return 'any';
    if (instance.type === 'group-proxy') {
      const raw = (instance.config as AnyRecord)?.portType;
      return typeof raw === 'string' && raw ? raw : raw ? String(raw) : 'any';
    }
    const def = nodeRegistry.get(instance.type);
    if (!def) return 'any';
    const ports = side === 'input' ? def.inputs : def.outputs;
    const port = ports?.find((p) => p.id === portId);
    return String(port?.type ?? 'any');
  }

  type GroupFrameProxyPort = {
    id: string;
    direction: 'input' | 'output';
    portType: string;
    centerY: number;
    label: string;
  };

  let groupFrameProxyPorts: GroupFrameProxyPort[] = [];
  let groupFramePortAreaHeight = 0;

  $: if (isGroupFrameNode && nodeId) {
    const instance = nodeEngine.getNode(nodeId) as AnyRecord;
    const rawGroupId = instance?.config?.groupId;
    const groupId = typeof rawGroupId === 'string' ? rawGroupId : rawGroupId ? String(rawGroupId) : '';
    const groupTop = Number(instance?.position?.y ?? 0);
    const proxyHalfHeight = 10;

    const nodeById = new Map(
      ($graphStateStore.nodes ?? []).map((n: NodeInstance) => [String(n.id), n] as const)
    );
    const connections = Array.isArray($graphStateStore.connections) ? $graphStateStore.connections : [];

    const incomingToProxy = new Map<string, AnyRecord>();
    const outgoingFromProxy = new Map<string, AnyRecord[]>();
    for (const c of connections) {
      const targetId = String((c as AnyRecord).targetNodeId ?? '');
      const sourceId = String((c as AnyRecord).sourceNodeId ?? '');
      const targetPortId = String((c as AnyRecord).targetPortId ?? '');
      const sourcePortId = String((c as AnyRecord).sourcePortId ?? '');
      if (!targetId || !sourceId || !targetPortId || !sourcePortId) continue;

      const targetNode = nodeById.get(targetId);
      const sourceNode = nodeById.get(sourceId);

      if (String((targetNode as AnyRecord)?.type ?? '') === 'group-proxy' && targetPortId === 'in') {
        incomingToProxy.set(targetId, c);
      }
      if (String((sourceNode as AnyRecord)?.type ?? '') === 'group-proxy' && sourcePortId === 'out') {
        const list = outgoingFromProxy.get(sourceId) ?? [];
        list.push(c);
        outgoingFromProxy.set(sourceId, list);
      }
    }

    const portLabelFor = (nodeId: string, side: 'input' | 'output', portId: string): string => {
      const node = nodeById.get(String(nodeId));
      if (!node) return String(portId);
      const def = nodeRegistry.get(String((node as AnyRecord).type ?? ''));
      const ports = side === 'input' ? def?.inputs : def?.outputs;
      const port = (ports ?? []).find((p: AnyRecord) => String(p.id) === String(portId)) ?? null;
      return String((port as AnyRecord)?.label ?? (port as AnyRecord)?.id ?? portId);
    };

    const validPortTypes = new Set([
      'number',
      'boolean',
      'string',
      'asset',
      'color',
      'audio',
      'image',
      'video',
      'scene',
      'effect',
      'client',
      'command',
      'fuzzy',
      'array',
      'any',
    ]);

    const resolveProxyPortType = (node: AnyRecord): string => {
      const raw = node?.config?.portType;
      const t = typeof raw === 'string' ? raw : raw ? String(raw) : '';
      return validPortTypes.has(t) ? t : 'any';
    };

    const ports: GroupFrameProxyPort[] = [];

    for (const node of $graphStateStore.nodes ?? []) {
      if (String((node as AnyRecord).type ?? '') !== 'group-proxy') continue;
      const proxyId = String((node as AnyRecord).id ?? '');
      if (!proxyId) continue;
      const proxyGroupId = String(((node as AnyRecord).config as AnyRecord)?.groupId ?? '');
      if (!proxyGroupId || proxyGroupId !== groupId) continue;

      const direction =
        String(((node as AnyRecord).config as AnyRecord)?.direction ?? 'output') === 'input' ? 'input' : 'output';
      const portType = resolveProxyPortType(node);
      const centerY = Number((node as AnyRecord).position?.y ?? 0) + proxyHalfHeight;

      let label = '';
      if (direction === 'input') {
        const internal = outgoingFromProxy.get(proxyId) ?? [];
        const first = internal[0] ?? null;
        if (first) {
          label = portLabelFor(
            String((first as AnyRecord).targetNodeId),
            'input',
            String((first as AnyRecord).targetPortId)
          );
        }
      } else {
        const internal = incomingToProxy.get(proxyId) ?? null;
        if (internal) {
          label = portLabelFor(
            String((internal as AnyRecord).sourceNodeId),
            'output',
            String((internal as AnyRecord).sourcePortId)
          );
        }
      }
      if (!label) label = portType;

      ports.push({
        id: proxyId,
        direction,
        portType,
        centerY: Number.isFinite(groupTop) ? centerY - groupTop : centerY,
        label,
      });
    }

    ports.sort((a, b) => a.centerY - b.centerY || a.id.localeCompare(b.id));
    groupFrameProxyPorts = ports;

    const inputCount = ports.filter((p) => p.direction === 'input').length;
    const outputCount = ports.length - inputCount;
    const rowCount = Math.max(1, Math.max(inputCount, outputCount));

    const rowHeight = 28;
    const bottomPad = 12;
    groupFramePortAreaHeight = rowCount * rowHeight + bottomPad;
  } else {
    groupFrameProxyPorts = [];
    groupFramePortAreaHeight = 0;
  }

  function effectiveInputValue(portId: string): unknown {
    const instance = nodeEngine.getNode(nodeId);
    if (!instance) return undefined;

    const conns = inputConnections[portId] ?? [];
    if (conns.length === 0) {
      const def = nodeRegistry.get(instance.type);
      const port = def?.inputs?.find((p) => p.id === portId);

      const stored = instance.inputValues?.[portId];
      if (stored !== undefined) return stored;
      if (port?.defaultValue !== undefined) return port.defaultValue;

      // Many nodes (especially processors) treat config fields as fallback values for unconnected inputs.
      const fromConfig = (instance.config as AnyRecord)?.[portId];
      if (fromConfig !== undefined) return fromConfig;
      return undefined;
    }

    // Multi-connection sink inputs show a compact list preview.
    if (conns.length > 1) {
      return conns.map((c) => nodeEngine.getNode(c.sourceNodeId)?.outputValues?.[c.sourcePortId]);
    }

    const conn = conns[0];
    return nodeEngine.getNode(conn.sourceNodeId)?.outputValues?.[conn.sourcePortId];
  }

  function effectiveOutputValue(portId: string): unknown {
    const instance = nodeEngine.getNode(nodeId);
    if (!instance) return undefined;
    return instance.outputValues?.[portId];
  }

  type BypassPorts = { inId: string; outId: string; portType: string };

  function inferBypassPorts(type: string): BypassPorts | null {
    if (!type) return null;
    const def = nodeRegistry.get(type);
    if (!def) return null;

    const inPort = def.inputs.find((p) => String(p.id) === 'in') ?? null;
    const outPort = def.outputs.find((p) => String(p.id) === 'out') ?? null;
    if (inPort && outPort && String(inPort.type) === String(outPort.type)) {
      if (inPort.type === 'command' || inPort.type === 'client') return null;
      return { inId: 'in', outId: 'out', portType: String(inPort.type) };
    }

    if (def.inputs.length === 1 && def.outputs.length === 1) {
      const onlyIn = def.inputs[0];
      const onlyOut = def.outputs[0];
      if (String(onlyIn.type) === String(onlyOut.type)) {
        if (onlyIn.type === 'command' || onlyIn.type === 'client') return null;
        return {
          inId: String(onlyIn.id),
          outId: String(onlyOut.id),
          portType: String(onlyIn.type),
        };
      }
    }

    const sinkInputs = def.inputs.filter((p) => p.kind === 'sink');
    const sinkOutputs = def.outputs.filter((p) => p.kind === 'sink');
    if (sinkInputs.length === 1 && sinkOutputs.length === 1) {
      const onlyIn = sinkInputs[0];
      const onlyOut = sinkOutputs[0];
      if (String(onlyIn.type) === String(onlyOut.type)) {
        if (onlyIn.type === 'command' || onlyIn.type === 'client') return null;
        return {
          inId: String(onlyIn.id),
          outId: String(onlyOut.id),
          portType: String(onlyIn.type),
        };
      }
    }

    return null;
  }

  let bypassPorts: BypassPorts | null = null;
  $: bypassPorts = (() => {
    const instance = nodeEngine.getNode(nodeId);
    if (!instance) return null;
    return inferBypassPorts(String(instance.type));
  })();

  let bypassWirePath: string | null = null;
  let bypassWireSize: { w: number; h: number } | null = null;
  let bypassWireRaf: number | null = null;
  let bypassWireActive = false;
  $: bypassWireActive =
    Boolean(isGroupDisabled) &&
    Boolean(bypassPorts) &&
    (isActive ||
      activeInputs.has(bypassPorts?.inId ?? '') ||
      activeOutputs.has(bypassPorts?.outId ?? ''));

  const cancelBypassWire = () => {
    if (bypassWireRaf) cancelAnimationFrame(bypassWireRaf);
    bypassWireRaf = null;
  };

  const updateBypassWire = async () => {
    cancelBypassWire();
    bypassWirePath = null;
    bypassWireSize = null;

    if (!nodeEl || !bypassPorts || !isGroupDisabled) return;
    const inId = bypassPorts.inId;
    const outId = bypassPorts.outId;

    if ((inputConnections[inId]?.length ?? 0) === 0) return;
    if ((outputConnections[outId]?.length ?? 0) === 0) return;
    if (portTypeFor('input', inId) !== portTypeFor('output', outId)) return;

    await tick();
    if (!nodeEl) return;

    const inSocket = nodeEl.querySelector(
      `.input-socket[data-port-id="${inId}"]`
    ) as HTMLElement | null;
    const outSocket = nodeEl.querySelector(
      `.output-socket[data-port-id="${outId}"]`
    ) as HTMLElement | null;
    if (!inSocket || !outSocket) return;

    const nodeRect = nodeEl.getBoundingClientRect();
    const inRect = inSocket.getBoundingClientRect();
    const outRect = outSocket.getBoundingClientRect();

    const w = nodeEl.offsetWidth;
    const h = nodeEl.offsetHeight;
    if (w <= 0 || h <= 0) return;

    const scaleX = nodeRect.width > 0 ? nodeRect.width / w : 1;
    const scaleY = nodeRect.height > 0 ? nodeRect.height / h : 1;

    const x1 = (inRect.left + inRect.width / 2 - nodeRect.left) / scaleX;
    const y1 = (inRect.top + inRect.height / 2 - nodeRect.top) / scaleY;
    const x2 = (outRect.left + outRect.width / 2 - nodeRect.left) / scaleX;
    const y2 = (outRect.top + outRect.height / 2 - nodeRect.top) / scaleY;

    const dx = Math.max(26, Math.abs(x2 - x1) * 0.42);
    bypassWirePath = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
    bypassWireSize = { w, h };
  };

  $: {
    const shouldShow =
      Boolean(nodeEl) &&
      Boolean(isGroupDisabled) &&
      Boolean(bypassPorts) &&
      (inputConnections[bypassPorts?.inId ?? '']?.length ?? 0) > 0 &&
      (outputConnections[bypassPorts?.outId ?? '']?.length ?? 0) > 0;

    if (!shouldShow) {
      cancelBypassWire();
      bypassWirePath = null;
      bypassWireSize = null;
    } else {
      cancelBypassWire();
      bypassWireRaf = requestAnimationFrame(() => {
        bypassWireRaf = null;
        void updateBypassWire();
      });
    }
  }

  onDestroy(() => {
    cancelBypassWire();
  });

  type PortValueText = {
    inputs: Record<string, string | null>;
    outputs: Record<string, string | null>;
  };
  let portValueText: PortValueText = { inputs: {}, outputs: {} };

  $: if (nodeId) {
    if (Boolean((data as AnyRecord).deployedLoop) || isDeployedPatch) {
      portValueText = { inputs: {}, outputs: {} };
    } else {
      // Depend on tickTimeStore to refresh live values (MIDI/sensors/etc).
      const _tick = $tickTimeStore;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      void _tick;

      const nextInputs: Record<string, string | null> = {};
      for (const [key] of inputs) {
        const type = portTypeFor('input', String(key));
        const val = effectiveInputValue(String(key));
        const formatted = formatPortValue(type, val);
        if (formatted !== null) nextInputs[String(key)] = formatted;
      }

      const nextOutputs: Record<string, string | null> = {};
      for (const [key] of outputs) {
        const type = portTypeFor('output', String(key));
        const val = effectiveOutputValue(String(key));
        const formatted = formatPortValue(type, val);
        if (formatted !== null) nextOutputs[String(key)] = formatted;
      }

      portValueText = { inputs: nextInputs, outputs: nextOutputs };
    }
  } else {
    portValueText = { inputs: {}, outputs: {} };
  }
</script>

  <div
    bind:this={nodeEl}
  class="node {isCollapsed ? 'collapsed' : ''} {data.selected ? 'selected' : ''} {data.localLoop
    ? 'local-loop'
    : ''} {data.deployedLoop ? 'deployed-loop' : ''} {isDeployedPatch
    ? 'deployed-patch'
    : ''} {isStopped ? 'stopped' : ''} {isActive ? 'active' : ''} {isGroupPortNode ? 'group-port' : ''} {isGroupSelected ? 'group-selected' : ''} {isGroupDisabled || (isGroupFrameNode && groupFrameDisabled) ? 'group-disabled' : ''}"
  class:hidden={isHidden}
  class:group-minimized={isGroupMinimized}
  class:group-frame={isGroupFrameNode}
  class:group-proxy-input={isGroupPortNode && instanceType === 'group-proxy' && proxyDirection === 'input'}
  class:group-proxy-output={isGroupPortNode && instanceType === 'group-proxy' && proxyDirection !== 'input'}
  style:width={Number.isFinite(data.width) ? `${data.width}px` : undefined}
  style:height={!isCollapsed && Number.isFinite(data.height) ? `${data.height}px` : undefined}
  data-testid="node"
  data-rete-node-id={data.id}
>
  {#if bypassWirePath && bypassWireSize}
    <svg
      class="bypass-wire port-{bypassPorts?.portType ?? 'any'} {bypassWireActive ? 'active' : ''}"
      viewBox={`0 0 ${bypassWireSize.w} ${bypassWireSize.h}`}
      aria-hidden="true"
    >
      <path class="bypass-wire-path" d={bypassWirePath} />
    </svg>
  {/if}

  <div class="title" data-testid="title">
    {#if isGroupFrameNode}
      <div class="group-frame-gate-slot" aria-hidden="true" />
    {:else}
      <button
        type="button"
        class="collapse-toggle"
        aria-label={isCollapsed ? 'Expand node' : 'Minimize node'}
        aria-pressed={isCollapsed}
        title={isCollapsed ? 'Expand' : 'Minimize'}
        on:pointerdown|stopPropagation|preventDefault
        on:click={(event) => toggleCollapsed(event)}
      />
    {/if}
    <span class="title-label">{data.label}</span>
    {#if isCustomNode}
      {#if customRole === 'child'}
        <button
          type="button"
          class="custom-node-uncouple"
          aria-label="Uncoupled (fork)"
          title="Uncoupled (fork into a new Custom Node)"
          on:pointerdown|stopPropagation|preventDefault
          on:click={requestCustomUncouple}
        >
          Uncoupled
        </button>
      {:else if customRole === 'mother'}
        <button
          type="button"
          class="custom-node-expand"
          aria-label="Expand node"
          title="Expand"
          on:pointerdown|stopPropagation|preventDefault
          on:click={requestCustomExpand}
        >
          Expand
        </button>
      {/if}
    {/if}
    {#if isGroupFrameNode}
      <button
        type="button"
        class="group-frame-active-toggle {groupFrameDisabled ? 'off' : 'on'}"
        aria-label={groupFrameDisabled ? 'Activate group' : 'Deactivate group'}
        aria-pressed={!groupFrameDisabled}
        title={groupFrameDisabled ? 'Activate group' : 'Deactivate group'}
        on:pointerdown|stopPropagation|preventDefault
        on:click={(event) => {
          event.preventDefault();
          event.stopPropagation();
          toggleGroupDisabled();
        }}
      >
        <span class="group-frame-active-thumb" aria-hidden="true" />
      </button>
      <button
        type="button"
        class="group-frame-expand"
        aria-label="Expand group"
        title="Expand group"
        on:pointerdown|stopPropagation|preventDefault
        on:click={(event) => {
          event.preventDefault();
          event.stopPropagation();
          toggleGroupMinimized();
        }}
      >
        Expand
      </button>
    {/if}
  </div>

  {#if !isCollapsed}
    {#if controls.length}
      <div class="controls">
        {#each controls as [key, control]}
          <Ref
            class="control"
            data-testid={'control-' + key}
            init={(element) =>
              emit({
                type: 'render',
                data: {
                  type: 'control',
                  element,
                  payload: control,
                },
              })}
            unmount={(ref) => emit({ type: 'unmount', data: { element: ref } })}
          />
        {/each}
      </div>
    {/if}

    {#if isCmdAggregator}
      <div class="cmd-aggregator-controls">
        <button
          class="cmd-aggregator-add"
          disabled={cmdAggregatorCurrentInputs >= cmdAggregatorMax}
          on:pointerdown|stopPropagation
          on:click={addCmdAggregatorInput}
        >
          Add In
        </button>
        <button
          class="cmd-aggregator-remove"
          disabled={cmdAggregatorMaxIndex <= 1}
          on:pointerdown|stopPropagation
          on:click={removeCmdAggregatorInput}
        >
          Remove In
        </button>
      </div>
    {/if}

    <div class="ports">
      {#if isGroupFrameNode}
        <div
          class="group-frame-port-space"
          style="height: {groupFramePortAreaHeight}px;"
          aria-hidden="true"
        />
      {/if}
      {#if inputs.length}
        <div class="inputs">
          {#each inputs as [key, input]}
            <div
              class="port-row input {activeInputs.has(String(key)) ? 'active' : ''}"
              data-testid={'input-' + key}
              data-rete-node-id={data.id}
              data-rete-port-side="input"
              data-rete-port-key={key}
            >
              <Ref
                class={`input-socket port-${portTypeFor('input', String(key))}`}
                data-testid="input-socket"
                data-port-id={key}
                init={(element) =>
                  emit({
                    type: 'render',
                    data: {
                      type: 'socket',
                      side: 'input',
                      key,
                      nodeId: data.id,
                      element,
                      payload: input.socket,
                    },
                  })}
                unmount={(ref) => emit({ type: 'unmount', data: { element: ref } })}
              />
              <div class="port-body">
                <div class="port-title-line">
                  <div class="port-label" data-testid="input-title">{input.label || ''}</div>
                  {#if portValueText.inputs[String(key)] && (inputConnections[String(key)]?.length ?? 0) > 0}
                    <div class="port-value input" data-testid={'input-value-' + key}>
                      {portValueText.inputs[String(key)]}
                    </div>
                  {:else if input.control && (inputConnections[String(key)]?.length ?? 0) === 0}
                    <Ref
                      class="port-control port-inline-input"
                      data-testid="input-control"
                      init={(element) =>
                        emit({
                          type: 'render',
                          data: {
                            type: 'control',
                            element,
                            payload: any(input).control,
                          },
                        })}
                      unmount={(ref) => emit({ type: 'unmount', data: { element: ref } })}
                    />
                  {/if}
                </div>
              </div>
            </div>
          {/each}
        </div>
      {/if}

      {#if outputs.length}
        <div class="outputs">
          {#each outputs as [key, output]}
            <div
              class="port-row output {activeOutputs.has(String(key)) ? 'active' : ''}"
              data-testid={'output-' + key}
              data-rete-node-id={data.id}
              data-rete-port-side="output"
              data-rete-port-key={key}
            >
              <div class="port-body">
                <div class="output-line">
                  <div class="port-label" data-testid="output-title">{output.label || ''}</div>
                  {#if portValueText.outputs[String(key)] && !any(output).control}
                    <div class="port-value output" data-testid={'output-value-' + key}>
                      {portValueText.outputs[String(key)]}
                    </div>
                  {/if}
                  {#if any(output).control}
                    <Ref
                      class="port-control port-inline-value"
                      data-testid="output-control"
                      init={(element) =>
                        emit({
                          type: 'render',
                          data: {
                            type: 'control',
                            element,
                            payload: any(output).control,
                          },
                        })}
                      unmount={(ref) => emit({ type: 'unmount', data: { element: ref } })}
                    />
                  {/if}
                </div>
              </div>
              <Ref
                class={`output-socket port-${portTypeFor('output', String(key))} ${any(output).disabled ? 'socket-disabled' : ''}`}
                data-testid="output-socket"
                data-port-id={key}
                init={(element) =>
                  emit({
                    type: 'render',
                    data: {
                      type: 'socket',
                      side: 'output',
                      key,
                      nodeId: data.id,
                      element,
                      payload: output.socket,
                    },
                  })}
                unmount={(ref) => emit({ type: 'unmount', data: { element: ref } })}
              />
            </div>
          {/each}
        </div>
      {/if}
    </div>

    {#if isGroupFrameNode && groupFrameProxyPorts.length > 0}
      <div class="group-frame-proxy-ports" aria-hidden="true">
        {#each groupFrameProxyPorts as port (port.id)}
          <div
            class="group-frame-proxy-row {port.direction}"
            style="top: {port.centerY}px;"
            title={port.label}
          >
            <div class="group-frame-proxy-label">{port.label}</div>
          </div>
        {/each}
      </div>
    {/if}
  {:else}
    <div
      class="collapsed-sockets"
      class:port-row={isGroupPortNode && instanceType === 'group-proxy'}
      class:input={isGroupPortNode && instanceType === 'group-proxy'}
      aria-hidden="true"
      data-rete-node-id={data.id}
    >
      {#each inputs as [key, input]}
        <div
          class="collapsed-socket input"
          data-rete-node-id={data.id}
          data-rete-port-side="input"
          data-rete-port-key={key}
        >
          <Ref
            class={`input-socket port-${portTypeFor('input', String(key))}`}
            data-port-id={key}
            init={(element) =>
              emit({
                type: 'render',
                data: {
                  type: 'socket',
                  side: 'input',
                  key,
                  nodeId: data.id,
                  element,
                  payload: input.socket,
                },
              })}
            unmount={(ref) => emit({ type: 'unmount', data: { element: ref } })}
          />
        </div>
      {/each}

      {#each outputs as [key, output]}
        <div
          class="collapsed-socket output"
          data-rete-node-id={data.id}
          data-rete-port-side="output"
          data-rete-port-key={key}
        >
          <Ref
            class={`output-socket port-${portTypeFor('output', String(key))} ${any(output).disabled ? 'socket-disabled' : ''}`}
            data-port-id={key}
            init={(element) =>
              emit({
                type: 'render',
                data: {
                  type: 'socket',
                  side: 'output',
                  key,
                  nodeId: data.id,
                  element,
                  payload: output.socket,
                },
              })}
            unmount={(ref) => emit({ type: 'unmount', data: { element: ref } })}
          />
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .node {
    cursor: pointer;
    user-select: none;
    line-height: initial;
    position: relative;
  }

  .node.hidden {
    display: none !important;
  }

  .node.group-port-activate {
    min-width: 148px;
    border-radius: 14px;
    border: 2px solid rgba(59, 130, 246, 0.55);
    background: rgba(59, 130, 246, 0.05);
    box-shadow:
      0 0 0 1px rgba(59, 130, 246, 0.16),
      0 18px 56px rgba(59, 130, 246, 0.08);
  }

  .node.group-port-activate .title {
    padding: 8px 10px;
    font-size: 12px;
    border-bottom: none;
    text-align: center;
  }

  .node.group-port-activate .ports {
    padding: 6px 0 8px;
    gap: 6px;
  }

  .node.group-port-activate .port-row {
    padding: 0 10px;
    gap: 10px;
  }

  .title {
    position: relative;
    z-index: 2;
    display: flex;
    align-items: center;
    gap: 8px;
    overflow: visible;
    padding: 10px 12px;
    font-weight: 700;
    letter-spacing: 0.2px;
    color: rgba(255, 255, 255, 0.92);
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .node.collapsed .title {
    border-bottom: none !important;
  }

  .collapse-toggle {
    appearance: none;
    position: relative;
    z-index: 3;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid rgba(148, 163, 184, 0.55);
    background: rgba(148, 163, 184, 0.35);
    width: 12px;
    height: 12px;
    border-radius: 999px;
    padding: 0;
    flex: 0 0 auto;
    cursor: pointer;
    box-shadow:
      0 0 0 1px rgba(0, 0, 0, 0.2),
      0 4px 10px rgba(0, 0, 0, 0.3);
  }

  .collapse-toggle:hover {
    background: rgba(148, 163, 184, 0.5);
    border-color: rgba(148, 163, 184, 0.7);
  }

  .collapse-toggle:active {
    transform: scale(0.95);
  }

  .title-label {
    min-width: 0;
    flex: 1;
    white-space: normal;
    overflow-wrap: anywhere;
    line-height: 1.15;
  }

  .node.collapsed .title-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .collapsed-sockets {
    position: absolute;
    inset: 0;
    z-index: 1;
    pointer-events: none;
  }

  .collapsed-socket {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
  }

  .collapsed-socket.input {
    left: 0;
  }

  .collapsed-socket.output {
    right: 0;
  }

  .collapsed-sockets :global(.socket) {
    opacity: 0;
    pointer-events: none;
  }

  .node.group-port .collapsed-sockets {
    pointer-events: auto;
  }

  .node.group-port .collapsed-sockets :global(.socket) {
    opacity: 1;
    pointer-events: auto;
  }

  .node.group-port.group-proxy-input .collapsed-sockets,
  .node.group-port.group-proxy-output .collapsed-sockets {
    position: relative;
    inset: auto;
    pointer-events: auto;
  }

  .node.group-port.group-proxy-input .collapsed-socket,
  .node.group-port.group-proxy-output .collapsed-socket {
    position: static;
    transform: none;
  }

  .node.group-port.group-proxy-input .collapsed-sockets :global(.socket),
  .node.group-port.group-proxy-output .collapsed-sockets :global(.socket) {
    opacity: 1;
    pointer-events: auto;
  }

  /* When the Group frame is minimized, proxies should look like normal node ports:
     only expose the external socket (no "two-dot" proxy capsule). */
  .node.group-proxy-input.group-minimized .collapsed-socket.output {
    display: none;
  }

  .node.group-proxy-output.group-minimized .collapsed-socket.input {
    display: none;
  }

  .controls {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  }

  .ports {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px 0 6px;
  }

  .node.group-frame .ports {
    padding: 0;
    gap: 0;
  }

  .group-frame-gate-slot {
    width: 14px;
    height: 14px;
    border-radius: 999px;
    flex: 0 0 auto;
    pointer-events: none;
    opacity: 0;
  }

  .group-frame-active-toggle {
    appearance: none;
    position: relative;
    width: 34px;
    height: 18px;
    border-radius: 999px;
    border: 1px solid rgba(148, 163, 184, 0.4);
    background: rgba(148, 163, 184, 0.22);
    padding: 0;
    flex: 0 0 auto;
    cursor: pointer;
    transition:
      background 160ms ease,
      border-color 160ms ease;
  }

  .group-frame-active-toggle.on {
    border-color: rgba(34, 197, 94, 0.55);
    background: rgba(34, 197, 94, 0.28);
  }

  .group-frame-active-toggle.off {
    border-color: rgba(148, 163, 184, 0.4);
    background: rgba(148, 163, 184, 0.2);
  }

  .group-frame-active-thumb {
    position: absolute;
    top: 50%;
    left: 2px;
    width: 14px;
    height: 14px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.9);
    transform: translateY(-50%);
    transition: transform 160ms ease;
  }

  .group-frame-active-toggle.on .group-frame-active-thumb {
    transform: translate(16px, -50%);
  }

  .custom-node-uncouple {
    appearance: none;
    display: inline-flex;
    align-items: center;
    height: 20px;
    padding: 0 10px;
    border-radius: 999px;
    font: inherit;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.2px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(2, 6, 23, 0.35);
    color: rgba(255, 255, 255, 0.82);
    cursor: pointer;
  }

  .custom-node-uncouple:hover {
    background: rgba(2, 6, 23, 0.52);
  }

  .custom-node-expand {
    appearance: none;
    display: inline-flex;
    align-items: center;
    height: 20px;
    padding: 0 10px;
    border-radius: 999px;
    font: inherit;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.2px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(2, 6, 23, 0.35);
    color: rgba(255, 255, 255, 0.82);
    cursor: pointer;
    flex: 0 0 auto;
  }

  .custom-node-expand:hover {
    background: rgba(2, 6, 23, 0.48);
    border-color: rgba(255, 255, 255, 0.18);
  }


  .group-frame-expand {
    appearance: none;
    display: inline-flex;
    align-items: center;
    height: 20px;
    padding: 0 10px;
    border-radius: 999px;
    font: inherit;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.2px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(2, 6, 23, 0.35);
    color: rgba(255, 255, 255, 0.82);
    cursor: pointer;
    flex: 0 0 auto;
  }

  .group-frame-expand:hover {
    background: rgba(2, 6, 23, 0.48);
    border-color: rgba(255, 255, 255, 0.18);
  }

  .group-frame-port-space {
    position: relative;
    z-index: 0;
    pointer-events: none;
  }

  .group-frame-proxy-ports {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 2;
  }

  .group-frame-proxy-row {
    position: absolute;
    transform: translateY(-50%);
    left: 0;
    right: 0;
    height: 28px;
    display: flex;
    align-items: center;
    padding: 2px 10px;
  }

  .group-frame-proxy-row.input {
    justify-content: flex-start;
    padding-left: 32px;
  }

  .group-frame-proxy-row.output {
    justify-content: flex-end;
    padding-right: 32px;
  }

  .group-frame-proxy-label {
    max-width: 60%;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.1px;
    color: rgba(255, 255, 255, 0.78);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .cmd-aggregator-controls {
    position: relative;
    z-index: 1;
    display: flex;
    justify-content: flex-start;
    gap: 8px;
    padding: 8px 10px 2px;
  }

  .cmd-aggregator-add,
  .cmd-aggregator-remove {
    font: inherit;
    font-weight: 600;
    padding: 6px 10px;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.06);
    color: rgba(255, 255, 255, 0.9);
  }

  .cmd-aggregator-add:hover:enabled {
    background: rgba(255, 255, 255, 0.1);
  }

  .cmd-aggregator-remove:hover:enabled {
    background: rgba(255, 255, 255, 0.1);
  }

  .cmd-aggregator-add:disabled,
  .cmd-aggregator-remove:disabled {
    opacity: 0.45;
  }

  .bypass-wire {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    z-index: 0;
    pointer-events: none;
  }

  .bypass-wire-path {
    fill: none;
    stroke-width: 2.25;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke: rgba(148, 163, 184, 0.85);
    opacity: 0.95;
  }

  .bypass-wire.port-audio .bypass-wire-path {
    stroke: rgba(14, 165, 233, 0.92);
  }

  .bypass-wire.port-number .bypass-wire-path {
    stroke: rgba(34, 197, 94, 0.9);
  }

  .bypass-wire.port-boolean .bypass-wire-path {
    stroke: rgba(245, 158, 11, 0.9);
  }

  .bypass-wire.port-string .bypass-wire-path {
    stroke: rgba(59, 130, 246, 0.9);
  }

  .bypass-wire.port-color .bypass-wire-path {
    stroke: rgba(236, 72, 153, 0.9);
  }

  .bypass-wire.active .bypass-wire-path {
    stroke: rgba(250, 204, 21, 0.95);
    stroke-width: 3;
    opacity: 1;
    filter: drop-shadow(0 0 12px rgba(250, 204, 21, 0.35));
  }

  .inputs,
  .outputs {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .port-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 2px 10px;
  }

  .port-row.output {
    justify-content: flex-end;
  }

  .node.active {
    outline: 2px solid rgba(250, 204, 21, 0.55);
    outline-offset: 0;
  }

  .node.group-selected {
    outline: 2px solid rgba(59, 130, 246, 0.55);
    outline-offset: 0;
  }

  .node.group-disabled {
    opacity: 0.42;
    filter: grayscale(0.78) saturate(0.35);
  }

  .node.group-disabled .title {
    color: rgba(226, 232, 240, 0.7);
  }

  .node.group-disabled .port-label {
    color: rgba(226, 232, 240, 0.55);
  }

  .port-row.active {
    background: rgba(250, 204, 21, 0.08);
    border-radius: 10px;
  }

  .port-row.active .port-label {
    color: rgba(255, 255, 255, 0.92);
  }

  .port-row.active .port-value {
    color: rgba(250, 204, 21, 0.95);
  }

  :global(.input-socket) {
    margin-left: -10px;
    flex: 0 0 auto;
  }

  :global(.output-socket) {
    margin-right: -10px;
    flex: 0 0 auto;
  }


  :global(.output-socket.socket-disabled) {
    opacity: 0.35;
    pointer-events: none;
  }

  .port-body {
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex: 1;
    min-width: 0;
  }

  .port-row.output .port-body {
    align-items: flex-end;
  }

  .port-title-line {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    min-width: 0;
  }

  .output-line {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
    width: 100%;
    min-width: 0;
  }

  .port-label {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.82);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1 1 84px;
    min-width: 0;
  }

  .port-value {
    display: inline-flex;
    align-items: center;
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 650;
    white-space: nowrap;
    flex: 0 1 auto;
    letter-spacing: 0.2px;
    max-width: 110px;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(2, 6, 23, 0.32);
    border-radius: 10px;
    padding: 4px 8px;
  }

  .port-value.input {
    color: rgba(20, 184, 166, 0.92);
  }

  .port-value.output {
    color: rgba(99, 102, 241, 0.95);
  }

  :global(.port-control) {
    flex: 0 0 auto;
  }

  :global(.port-inline-value) {
    width: auto;
    flex: 0 0 auto;
  }

  :global(.port-inline-input) {
    width: auto;
    flex: 0 0 auto;
  }

  .node.local-loop {
    border-color: rgba(236, 72, 153, 0.8);
    box-shadow: 0 18px 56px rgba(236, 72, 153, 0.16);
  }

  .node.deployed-loop {
    border-color: rgba(20, 184, 166, 0.9);
    box-shadow: 0 18px 56px rgba(20, 184, 166, 0.16);
  }
</style>
