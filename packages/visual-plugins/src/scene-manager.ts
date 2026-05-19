/**
 * Scene Manager - Manages visual scene switching and lifecycle
 */

import type { VisualScene, VisualContext, SceneManager } from './types.js';

export class DefaultSceneManager implements SceneManager {
    private scenes: Map<string, VisualScene> = new Map();
    private sceneFactories: Map<string, () => VisualScene> = new Map();
    private activeScenes: Set<string> = new Set();
    private activeLayerScenes: Map<string, VisualScene> = new Map();
    private container: HTMLElement | null = null;

    constructor(container: HTMLElement) {
        this.container = container;
    }

    register(scene: VisualScene): void {
        this.scenes.set(scene.id, scene);
    }

    registerFactory(sceneId: string, factory: () => VisualScene): void {
        this.sceneFactories.set(sceneId, factory);
    }

    /**
     * Enable or disable a specific scene independently.
     * Multiple scenes can be enabled simultaneously.
     */
    setSceneEnabled(sceneId: string, enabled: boolean): void {
        if (!this.container) return;

        const scene = this.scenes.get(sceneId);
        if (!scene) {
            console.warn(`[SceneManager] Scene not found: ${sceneId}`);
            return;
        }

        const wasActive = this.activeScenes.has(sceneId);

        if (enabled && !wasActive) {
            scene.mount(this.container);
            this.activeScenes.add(sceneId);
            console.log(`[SceneManager] Enabled scene: ${sceneId}`);
        } else if (!enabled && wasActive) {
            scene.unmount();
            this.activeScenes.delete(sceneId);
            console.log(`[SceneManager] Disabled scene: ${sceneId}`);
        }
    }

    getActiveScenes(): VisualScene[] {
        const baseScenes = Array.from(this.activeScenes)
            .map(id => this.scenes.get(id))
            .filter((s): s is VisualScene => s !== undefined);
        return [...baseScenes, ...this.activeLayerScenes.values()];
    }

    update(dt: number, context: VisualContext): void {
        // Update all active scenes
        for (const sceneId of this.activeScenes) {
            const scene = this.scenes.get(sceneId);
            if (scene) {
                scene.update(dt, context);
            }
        }
        for (const scene of this.activeLayerScenes.values()) {
            scene.update(dt, context);
        }
    }

    setLayerScenes(layers: Array<{ key: string; sceneId: string; options?: Record<string, unknown> }>): void {
        if (!this.container) return;
        const desired = new Set(layers.map((layer) => layer.key));

        for (const [key, scene] of this.activeLayerScenes.entries()) {
            if (!desired.has(key)) {
                scene.unmount();
                this.activeLayerScenes.delete(key);
            }
        }

        for (const layer of layers) {
            let scene = this.activeLayerScenes.get(layer.key);
            if (!scene) {
                const factory = this.sceneFactories.get(layer.sceneId);
                if (!factory) {
                    console.warn(`[SceneManager] Scene factory not found: ${layer.sceneId}`);
                    continue;
                }
                scene = factory();
                this.activeLayerScenes.set(layer.key, scene);
                scene.configure?.(layer.options ?? {});
                scene.mount(this.container);
                const matches = Array.from(
                    this.container.querySelectorAll(`[data-shugu-scene-id="${scene.id}"]`)
                ) as HTMLElement[];
                const el = matches[matches.length - 1] ?? null;
                if (el) el.dataset.shuguLayerKey = layer.key;
            } else {
                scene.configure?.(layer.options ?? {});
            }
        }
    }

    destroy(): void {
        // Unmount all active scenes
        for (const sceneId of this.activeScenes) {
            const scene = this.scenes.get(sceneId);
            if (scene) {
                scene.unmount();
            }
        }
        for (const scene of this.activeLayerScenes.values()) {
            scene.unmount();
        }
        this.activeScenes.clear();
        this.activeLayerScenes.clear();
        this.scenes.clear();
        this.sceneFactories.clear();
        this.container = null;
    }
}
