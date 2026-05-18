<!--
Purpose: Full-screen Display visual scene layer driven by visualScenes control payloads.
-->

<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import {
    BoxScene,
    DefaultSceneManager,
    FctTrackScene,
    MelSpectrogramScene,
    sceneIdsFromLayer,
    type VisualContext,
  } from '@shugu/visual-plugins';
  import type { FctTrackSceneLayerItem, VisualSceneLayerItem } from '@shugu/protocol';

  export let scenes: VisualSceneLayerItem[] = [];

  let container: HTMLElement;
  let manager: DefaultSceneManager | null = null;
  let fctTrackScene: FctTrackScene | null = null;
  let animationFrame: number | null = null;
  let lastTime = 0;
  const context: VisualContext = {};

  onMount(() => {
    manager = new DefaultSceneManager(container);
    manager.register(new BoxScene());
    manager.register(new MelSpectrogramScene());
    fctTrackScene = new FctTrackScene();
    manager.register(fctTrackScene);

    lastTime = performance.now();
    animate(lastTime);
  });

  onDestroy(() => {
    if (animationFrame) cancelAnimationFrame(animationFrame);
    manager?.destroy();
    manager = null;
    fctTrackScene = null;
  });

  $: if (manager) {
    applySceneLayer(scenes);
  }

  function animate(now: number): void {
    const dt = Math.max(0, (now - lastTime) / 1000);
    lastTime = now;
    manager?.update(dt, context);
    animationFrame = requestAnimationFrame(animate);
  }

  function applySceneLayer(nextScenes: VisualSceneLayerItem[] | unknown[]): void {
    if (!manager) return;
    const list = Array.isArray(nextScenes) ? nextScenes : [];
    const fctConfig = [...list]
      .reverse()
      .find((item): item is FctTrackSceneLayerItem =>
        Boolean(item) && typeof item === 'object' && (item as { type?: unknown }).type === 'fctTrack'
      );
    if (fctConfig) {
      fctTrackScene?.configure(fctConfig);
    }

    const desiredIds = sceneIdsFromLayer(list);
    const desired = new Set(desiredIds);
    for (const scene of manager.getActiveScenes()) {
      if (!desired.has(scene.id)) {
        manager.setSceneEnabled(scene.id, false);
      }
    }
    for (const sceneId of desiredIds) {
      manager.setSceneEnabled(sceneId, true);
    }
  }
</script>

<div class="display-visual-scenes" bind:this={container}></div>

<style>
  .display-visual-scenes {
    position: fixed;
    inset: 0;
    z-index: 0;
    overflow: hidden;
    pointer-events: none;
  }

  :global(.display-visual-scenes .shugu-scene-canvas) {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }
</style>
