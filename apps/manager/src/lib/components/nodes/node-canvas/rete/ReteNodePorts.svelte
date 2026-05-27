<!-- Purpose: Renders expanded and collapsed Rete node ports while preserving socket render events. -->
<script lang="ts">
  import Ref from 'rete-svelte-plugin/svelte/Ref.svelte';
  import type {
    ClassicScheme,
    SvelteArea2D,
  } from 'rete-svelte-plugin/svelte/presets/classic/types';
  import { hasPortValueText, type AnyRecord, type GroupFrameProxyPort } from './rete-node-helpers';

  type PortEntry = [string, AnyRecord];
  type ConnectionInfo = { sourceNodeId: string; sourcePortId: string };
  type PortValueText = {
    inputs: Record<string, string | null>;
    outputs: Record<string, string | null>;
  };

  export let data: ClassicScheme['Node'];
  export let emit: (props: SvelteArea2D<ClassicScheme>) => void;
  export let isCollapsed = false;
  export let isGroupPortNode = false;
  export let isGroupFrameNode = false;
  export let instanceType = '';
  export let inputs: PortEntry[] = [];
  export let outputs: PortEntry[] = [];
  export let activeInputs: Set<string> = new Set();
  export let activeOutputs: Set<string> = new Set();
  export let inputConnections: Record<string, ConnectionInfo[]> = {};
  export let portValueText: PortValueText = { inputs: {}, outputs: {} };
  export let groupFramePortAreaHeight = 0;
  export let groupFrameProxyPorts: GroupFrameProxyPort[] = [];
  export let portTypeFor: (side: 'input' | 'output', portId: string) => string = () => 'any';

  function any<T>(arg: T): AnyRecord {
    return arg as AnyRecord;
  }

  function emitAny(props: unknown): void {
    emit(props as SvelteArea2D<ClassicScheme>);
  }

  function shouldReserveOutputValue(portType: string): boolean {
    return portType === 'number' || portType === 'fuzzy';
  }

</script>

{#if !isCollapsed}
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
                emitAny({
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
              unmount={(ref) => emitAny({ type: 'unmount', data: { element: ref } })}
            />
            <div class="port-body">
              <div class="port-title-line">
                <div class="port-label" data-testid="input-title">{input.label || ''}</div>
                {#if hasPortValueText(portValueText.inputs[String(key)]) && (inputConnections[String(key)]?.length ?? 0) > 0}
                  <div class="port-value input" data-testid={'input-value-' + key}>
                    {portValueText.inputs[String(key)]}
                  </div>
                {:else if input.control && (inputConnections[String(key)]?.length ?? 0) === 0}
                  <Ref
                    class="port-control port-inline-input"
                    data-testid="input-control"
                    init={(element) =>
                      emitAny({
                        type: 'render',
                        data: {
                          type: 'control',
                          element,
                          payload: any(input).control,
                        },
                      })}
                    unmount={(ref) => emitAny({ type: 'unmount', data: { element: ref } })}
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
          {@const outputPortType = portTypeFor('output', String(key))}
          {@const outputValueText = portValueText.outputs[String(key)]}
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
                {#if (hasPortValueText(outputValueText) || shouldReserveOutputValue(outputPortType)) && !any(output).control}
                  <div
                    class="port-value output"
                    class:placeholder={!hasPortValueText(outputValueText)}
                    data-testid={'output-value-' + key}
                  >
                    {outputValueText ?? '--'}
                  </div>
                {/if}
                {#if any(output).control}
                  <Ref
                    class="port-control port-inline-value"
                    data-testid="output-control"
                    init={(element) =>
                      emitAny({
                        type: 'render',
                        data: {
                          type: 'control',
                          element,
                          payload: any(output).control,
                        },
                      })}
                    unmount={(ref) => emitAny({ type: 'unmount', data: { element: ref } })}
                  />
                {/if}
              </div>
            </div>
            <Ref
              class={`output-socket port-${outputPortType} ${any(output).disabled ? 'socket-disabled' : ''}`}
              data-testid="output-socket"
              data-port-id={key}
              init={(element) =>
                emitAny({
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
              unmount={(ref) => emitAny({ type: 'unmount', data: { element: ref } })}
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
            emitAny({
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
          unmount={(ref) => emitAny({ type: 'unmount', data: { element: ref } })}
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
            emitAny({
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
          unmount={(ref) => emitAny({ type: 'unmount', data: { element: ref } })}
        />
      </div>
    {/each}
  </div>
{/if}

<style>
  :global(.node.group-port-activate .ports) {
    padding: 6px 0 8px;
    gap: 6px;
  }

  :global(.node.group-port-activate .port-row) {
    padding: 0 10px;
    gap: 10px;
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

  :global(.node.group-port) .collapsed-sockets {
    pointer-events: auto;
  }

  :global(.node.group-port) .collapsed-sockets :global(.socket) {
    opacity: 1;
    pointer-events: auto;
  }

  :global(.node.group-port.group-proxy-input) .collapsed-socket,
  :global(.node.group-port.group-proxy-output) .collapsed-socket {
    top: 50%;
  }

  :global(.node.group-port.group-proxy-input) .collapsed-sockets :global(.socket),
  :global(.node.group-port.group-proxy-output) .collapsed-sockets :global(.socket) {
    opacity: 1;
    pointer-events: auto;
  }

  :global(.node.group-proxy-input.group-minimized) .collapsed-socket.output {
    display: none;
  }

  :global(.node.group-proxy-output.group-minimized) .collapsed-socket.input {
    display: none;
  }

  .ports {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px 0 6px;
  }

  :global(.node.group-frame) .ports {
    padding: 0;
    gap: 0;
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

  :global(.node.group-disabled) .port-label {
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
    justify-content: flex-end;
    min-width: 48px;
    text-align: right;
  }

  .port-value.placeholder {
    visibility: hidden;
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
</style>
