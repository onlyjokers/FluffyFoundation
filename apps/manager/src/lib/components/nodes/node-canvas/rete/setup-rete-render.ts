// Purpose: Encapsulate Rete Svelte render preset wiring for the node canvas.
import { Presets as SveltePresets } from 'rete-svelte-plugin';
import type { LiveDOMSocketPosition } from './live-socket-position';

type RenderPlugin = {
  addPreset: (preset: unknown) => void;
};

type RendererRegistry = {
  node: () => unknown;
  connection: () => unknown;
  control: () => unknown;
};

type RenderSetupOptions = {
  render: RenderPlugin;
  requestFramesUpdate: () => void;
  socketPositionWatcher: LiveDOMSocketPosition | null;
  createSocketPositionWatcher: () => LiveDOMSocketPosition;
  renderers: RendererRegistry;
};

export const setupReteRenderPreset = (opts: RenderSetupOptions): LiveDOMSocketPosition => {
  const watcher =
    opts.socketPositionWatcher ??
    (opts.socketPositionWatcher = opts.createSocketPositionWatcher());

  opts.render.addPreset(
    SveltePresets.classic.setup({
      socketPositionWatcher: watcher,
      customize: opts.renderers,
    })
  );

  return watcher;
};
