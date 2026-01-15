<!-- Purpose: Render loop frames with deploy/stop controls and status. -->
<script lang="ts">
  // @ts-nocheck
  import Button from '$lib/components/ui/Button.svelte';

  type LoopModel = {
    id: string;
    requiredCapabilities?: string[];
  };
  type LoopFrame = { loop: LoopModel; left: number; top: number; width: number; height: number };
  type ExecutorStatus = { running?: boolean; lastEvent?: string; lastError?: string };

  export let frames: LoopFrame[] = [];
  export let areaTransform: { k: number; tx: number; ty: number } | null = null;
  export let deployedLoopIds: Set<string> = new Set();
  export let getLoopClientId: (loop: LoopModel) => string = () => '';
  export let executorStatusByClient: Map<string, ExecutorStatus> = new Map();
  export let showExecutorLogs = false;
  export let logsClientId = '';
  export let isRunning = false;

  export let onToggleLogs: (loop: LoopModel) => void = () => undefined;
  export let onStop: (loop: LoopModel) => void = () => undefined;
  export let onDeploy: (loop: LoopModel) => void = () => undefined;
  export let isLoopDeploying: (loopId: string) => boolean = () => false;
  export let loopHasDisabledNodes: (loop: LoopModel) => boolean = () => false;
  export let onHeaderPointerDown: (loopId: string, event: PointerEvent) => void = () => undefined;

  let k = 1;
  let tx = 0;
  let ty = 0;

  $: k = Number(areaTransform?.k ?? 1) || 1;
  $: tx = Number(areaTransform?.tx ?? 0) || 0;
  $: ty = Number(areaTransform?.ty ?? 0) || 0;

  $: isCompact = k < 0.75;
</script>

{#if frames.length > 0}
  <div class="loop-frame-layer" style="transform: translate({tx}px, {ty}px) scale({k}); transform-origin: 0 0;">
    {#each frames as frame (frame.loop.id)}
      {@const loop = frame.loop}
      {@const deployed = deployedLoopIds.has(loop.id)}
      {@const clientId = getLoopClientId(loop)}
      {@const status = clientId ? executorStatusByClient.get(clientId) : undefined}
      <div
        class="loop-frame {deployed ? 'deployed' : ''}"
        style="left: {frame.left}px; top: {frame.top}px; width: {frame.width}px; height: {frame.height}px;"
      >
        <div
          class="loop-frame-header"
          on:pointerdown|stopPropagation={(event) => onHeaderPointerDown(String(loop.id), event)}
        >
          <div class="loop-frame-meta">
            <span class="loop-frame-caps">
              {#if loop.requiredCapabilities?.length}
                caps: {loop.requiredCapabilities.join(', ')}
              {:else}
                caps: none
              {/if}
            </span>

            <span class="executor-meta">
              Remote:
              {#if status}
                <span class="executor-badge {status.running ? 'running' : 'stopped'}">
                  {status.running ? 'running' : 'stopped'}
                </span>
                <span class="executor-event">{status.lastEvent}</span>
                {#if status.lastError}
                  <span class="executor-error" title={status.lastError}>⚠</span>
                {/if}
              {:else}
                <span class="executor-badge unknown">unknown</span>
              {/if}
            </span>
          </div>

          {#if !isCompact}
            <div class="loop-frame-actions">
              <Button
                variant="ghost"
                size="sm"
                disabled={!clientId}
                on:click={() => onToggleLogs(loop)}
              >
                {showExecutorLogs && logsClientId === clientId ? '✕ Logs' : 'Logs'}
              </Button>

              {#if deployed}
                <Button variant="primary" size="sm" disabled={!clientId} on:click={() => onStop(loop)}>
                  Stop Loop
                </Button>
              {:else}
                <Button
                  variant="primary"
                  size="sm"
                  disabled={!isRunning || isLoopDeploying(loop.id) || loopHasDisabledNodes(loop)}
                  on:click={() => onDeploy(loop)}
                >
                  {isLoopDeploying(loop.id) ? '… Deploying' : 'Deploy'}
                </Button>
              {/if}
            </div>
          {/if}
        </div>
      </div>
    {/each}
  </div>
{/if}

<style>
  .loop-frame-layer {
    position: absolute;
    inset: 0;
    z-index: 6;
    pointer-events: none;
  }

  .loop-frame {
    position: absolute;
    border-radius: 26px;
    border: 2px solid rgba(236, 72, 153, 0.7);
    background: rgba(236, 72, 153, 0.03);
    box-shadow:
      0 0 0 1px rgba(236, 72, 153, 0.18),
      0 18px 64px rgba(236, 72, 153, 0.08);
    pointer-events: none;
  }

  .loop-frame.deployed {
    border-color: rgba(20, 184, 166, 0.75);
    background: rgba(20, 184, 166, 0.03);
    box-shadow:
      0 0 0 1px rgba(20, 184, 166, 0.18),
      0 18px 64px rgba(20, 184, 166, 0.08);
  }

  .loop-frame-header {
    position: absolute;
    top: 12px;
    left: 18px;
    right: 18px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    pointer-events: auto;
    cursor: grab;
    user-select: none;
    -webkit-user-select: none;
    touch-action: none;
  }

  .loop-frame-header:active,
  .loop-frame-header:active *,
  .loop-frame-header *:active {
    cursor: grabbing;
  }

  .loop-frame-meta {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .loop-frame-caps {
    display: inline-flex;
    align-items: center;
    height: 22px;
    padding: 0 10px;
    border-radius: 999px;
    font-size: 11px;
    color: rgba(255, 255, 255, 0.7);
    background: rgba(2, 6, 23, 0.45);
    border: 1px solid rgba(255, 255, 255, 0.12);
    backdrop-filter: blur(12px);
    white-space: nowrap;
  }

  .loop-frame-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    pointer-events: auto;
  }

  .loop-frame-actions :global(.btn) {
    border-radius: 999px;
  }

  .executor-meta {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: rgba(255, 255, 255, 0.65);
    white-space: nowrap;
    max-width: 260px;
  }

  .executor-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 18px;
    padding: 0 8px;
    border-radius: 999px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.2px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(2, 6, 23, 0.35);
    color: rgba(255, 255, 255, 0.82);
  }

  .executor-badge.running {
    border-color: rgba(20, 184, 166, 0.55);
    background: rgba(20, 184, 166, 0.16);
    color: rgba(153, 246, 228, 0.95);
  }

  .executor-badge.stopped {
    border-color: rgba(251, 146, 60, 0.5);
    background: rgba(251, 146, 60, 0.16);
    color: rgba(254, 215, 170, 0.95);
  }

  .executor-badge.unknown {
    border-color: rgba(148, 163, 184, 0.4);
    background: rgba(148, 163, 184, 0.14);
    color: rgba(226, 232, 240, 0.9);
  }

  .executor-event {
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .executor-error {
    color: rgba(248, 113, 113, 0.95);
    font-size: 12px;
    line-height: 1;
    cursor: help;
  }
</style>
