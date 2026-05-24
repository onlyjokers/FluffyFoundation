<!-- Purpose: Custom Rete node renderer for the node canvas. -->
<script lang="ts">
  import Ref from 'rete-svelte-plugin/svelte/Ref.svelte';
  import type {
    ClassicScheme,
    SvelteArea2D,
  } from 'rete-svelte-plugin/svelte/presets/classic/types';
  import { onDestroy, tick } from 'svelte';
  import { nodeEngine, nodeRegistry } from '$lib/nodes';
  import {
    readCustomNodeState,
    type CustomNodeInstanceState,
  } from '$lib/nodes/custom-nodes/instance';
  import type { NodeInstance } from '$lib/nodes/types';
  import ReteNodePorts from './ReteNodePorts.svelte';
  import ReteNodeTitle from './ReteNodeTitle.svelte';
  import {
    buildGroupFrameProxyPorts,
    formatPortValue,
    inferBypassPorts as inferBypassPortsFromDefinition,
    resolveRenderedNodeType,
    shouldUpdatePortValueText,
    sortByIndex,
    type AnyRecord,
    type BypassPorts,
    type GroupFrameProxyPort,
  } from './rete-node-helpers';

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
  type ReteNodeData = ClassicScheme['Node'] & NodeExtraData & AnyRecord;
  type PortEntry = [string, AnyRecord];
  const asRecord = (value: unknown): AnyRecord =>
    value && typeof value === 'object' ? (value as unknown as AnyRecord) : {};
  const emitAny = (props: unknown): void => {
    emit(props as SvelteArea2D<ClassicScheme>);
  };

  export let data: ReteNodeData;
  export let emit: (props: SvelteArea2D<ClassicScheme>) => void;

  let nodeEl: HTMLDivElement | null = null;
  let customNodeState: CustomNodeInstanceState | null = null;

  // Feature: Node minimize/collapse UI (manager-only visual state).
  // Collapsing only affects layout/visibility; graph execution + connections remain intact.
  const toggleCollapsed = (event: Event) => {
    event.stopPropagation();
    // Important: derive next state from `data.collapsed` to avoid Svelte reactive cycles.
    const next = !data.collapsed;
    data.collapsed = next;
  };

  $: dataRecord = asRecord(data);
  $: isCollapsed = isGroupPortNode ? true : Boolean(dataRecord.collapsed);

  $: inputs = sortByIndex(Object.entries(data.inputs)) as unknown as PortEntry[];
  $: controls = sortByIndex(Object.entries(data.controls)) as unknown as PortEntry[];
  $: outputs = sortByIndex(Object.entries(data.outputs)) as unknown as PortEntry[];

  // MIDI activity highlight state (set by NodeCanvas).
  $: isActive = Boolean(dataRecord.active);
  $: activeInputs = new Set<string>(((Array.isArray(dataRecord.activeInputs) ? dataRecord.activeInputs : []) as unknown[]).map(String));
  $: activeOutputs = new Set<string>(((Array.isArray(dataRecord.activeOutputs) ? dataRecord.activeOutputs : []) as unknown[]).map(String));
  $: isDeployedPatch = Boolean(dataRecord.deployedPatch);
  $: isStopped = Boolean(dataRecord.stopped);
  $: isGroupDisabled = Boolean(dataRecord.groupDisabled);
  $: isGroupSelected = Boolean(dataRecord.groupSelected);
  $: isGroupMinimized = Boolean(dataRecord.groupMinimized);
  $: isHidden = Boolean(dataRecord.hidden);

  // Live Port Values
  // Values are derived from NodeEngine runtime outputs and graph connections.
  // This enables "MIDI → mapping → processor" pipelines to show numbers at each port.
  const graphStateStore = nodeEngine.graphState;
  const tickTimeStore = nodeEngine.tickTime;

  type ConnectionInfo = { sourceNodeId: string; sourcePortId: string };
  type OutputConnectionInfo = { targetNodeId: string; targetPortId: string };

  let nodeId = '';
  $: nodeId = String(data?.id ?? '');

  $: instanceType = resolveRenderedNodeType(nodeEngine.getNode(nodeId)?.type, dataRecord.type);
  $: isCmdAggregator = instanceType === 'cmd-aggregator';
  $: isGroupPortNode = ['group-activate', 'group-gate', 'group-proxy'].includes(instanceType);
  $: isGroupFrameNode = instanceType === 'group-frame';
  $: proxyDirection =
    instanceType === 'group-proxy'
      ? String(
          (nodeEngine.getNode(nodeId)?.config as AnyRecord)?.direction ??
            asRecord(dataRecord.config).direction ??
            'output'
        )
      : '';

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
    const instance = asRecord(nodeEngine.getNode(nodeId));
    return Boolean(asRecord(instance.config).disabled);
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
    const instance = asRecord(nodeEngine.getNode(nodeId));
    const raw = asRecord(instance.config).groupId;
    const groupId = typeof raw === 'string' ? raw : raw ? String(raw) : '';
    if (!groupId) return;
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('shugu:toggle-group-minimized', { detail: { groupId } }));
  };

  const toggleGroupDisabled = () => {
    const instance = asRecord(nodeEngine.getNode(nodeId));
    const raw = asRecord(instance.config).groupId;
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

  let groupFrameProxyPorts: GroupFrameProxyPort[] = [];
  let groupFramePortAreaHeight = 0;

  $: if (isGroupFrameNode && nodeId) {
    const instance = asRecord(nodeEngine.getNode(nodeId));
    const rawGroupId = asRecord(instance.config).groupId;
    const groupId = typeof rawGroupId === 'string' ? rawGroupId : rawGroupId ? String(rawGroupId) : '';
    const groupTop = Number(asRecord(instance.position).y ?? 0);

    const nodeById = new Map(
      ($graphStateStore.nodes ?? []).map((n: NodeInstance) => [String(n.id), n] as const)
    );
    const connections = Array.isArray($graphStateStore.connections) ? $graphStateStore.connections : [];

    const portLabelFor = (nodeId: string, side: 'input' | 'output', portId: string): string => {
      const node = nodeById.get(String(nodeId));
      if (!node) return String(portId);
      const def = nodeRegistry.get(String(asRecord(node).type ?? ''));
      const ports = side === 'input' ? def?.inputs : def?.outputs;
      const port = (ports ?? []).find((p) => String(p.id) === String(portId)) ?? null;
      const portRecord = asRecord(port);
      return String(portRecord.label ?? portRecord.id ?? portId);
    };

    const result = buildGroupFrameProxyPorts({
      nodes: $graphStateStore.nodes ?? [],
      connections,
      groupId,
      groupTop,
      getPortLabel: portLabelFor,
    });
    groupFrameProxyPorts = result.ports;
    groupFramePortAreaHeight = result.areaHeight;
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

  function inferBypassPorts(type: string): BypassPorts | null {
    if (!type) return null;
    const def = nodeRegistry.get(type);
    return inferBypassPortsFromDefinition(def);
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

      const next = { inputs: nextInputs, outputs: nextOutputs };
      if (shouldUpdatePortValueText(portValueText, next)) portValueText = next;
    }
  } else {
    const empty = { inputs: {}, outputs: {} };
    if (shouldUpdatePortValueText(portValueText, empty)) portValueText = empty;
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

  <ReteNodeTitle
    label={data.label}
    {isCollapsed}
    {isCustomNode}
    {customRole}
    {isGroupFrameNode}
    {groupFrameDisabled}
    {toggleCollapsed}
    {toggleGroupDisabled}
    {toggleGroupMinimized}
    {requestCustomUncouple}
    {requestCustomExpand}
  />

  {#if !isCollapsed}
    {#if controls.length}
      <div class="controls">
        {#each controls as [key, control]}
          <Ref
            class="control"
            data-testid={'control-' + key}
            init={(element) =>
              emitAny({
                type: 'render',
                data: {
                  type: 'control',
                  element,
                  payload: control,
                },
              })}
            unmount={(ref) => emitAny({ type: 'unmount', data: { element: ref } })}
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

    <ReteNodePorts
      {data}
      {emit}
      {isCollapsed}
      {isGroupPortNode}
      {isGroupFrameNode}
      {instanceType}
      {inputs}
      {outputs}
      {activeInputs}
      {activeOutputs}
      {inputConnections}
      {portValueText}
      {groupFramePortAreaHeight}
      {groupFrameProxyPorts}
      {portTypeFor}
    />
  {:else}
    <ReteNodePorts
      {data}
      {emit}
      {isCollapsed}
      {isGroupPortNode}
      {isGroupFrameNode}
      {instanceType}
      {inputs}
      {outputs}
      {activeInputs}
      {activeOutputs}
      {inputConnections}
      {portValueText}
      {groupFramePortAreaHeight}
      {groupFrameProxyPorts}
      {portTypeFor}
    />
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

  .controls {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
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

  .node.local-loop {
    border-color: rgba(236, 72, 153, 0.8);
    box-shadow: 0 18px 56px rgba(236, 72, 153, 0.16);
  }

  .node.deployed-loop {
    border-color: rgba(20, 184, 166, 0.9);
    box-shadow: 0 18px 56px rgba(20, 184, 166, 0.16);
  }
</style>
