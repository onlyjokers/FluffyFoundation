/**
 * Visual scene plugin interface
 */
export interface VisualScene {
    /** Unique scene identifier */
    id: string;

    /**
     * Mount the scene to a container element
     */
    mount(container: HTMLElement): void;

    /**
     * Unmount the scene and clean up
     */
    unmount(): void;

    /**
     * Update the scene with new data
     * @param dt Delta time in seconds
     * @param context Sensor and audio data context
     */
    update(dt: number, context: VisualContext): void;

    /**
     * Resize handler
     */
    resize?(width: number, height: number): void;

    /**
     * Optional scene-specific configuration hook.
     */
    configure?(options: unknown): void;
}

export type VisualAudioFeatures = {
    rms?: number;
    lowEnergy?: number;
    midEnergy?: number;
    highEnergy?: number;
    bpm?: number | null;
    beatDetected?: boolean;
    melBands?: number[];
    spectralCentroid?: number;
};

/**
 * Context data passed to scene update
 */
export interface VisualContext {
    /** Device orientation data */
    orientation?: {
        alpha: number | null;
        beta: number | null;
        gamma: number | null;
        /** Screen orientation angle in degrees (0/90/180/270), if available */
        screen?: number | null;
    };

    /** Audio features from plugins */
    audioFeatures?: VisualAudioFeatures;

    /** Audio features from the local microphone input. */
    microphoneAudioFeatures?: VisualAudioFeatures;

    /** Audio features from local media/audio playback. */
    playbackAudioFeatures?: VisualAudioFeatures;
}

/**
 * Scene manager for switching between visual scenes
 */
export interface SceneManager {
    /**
     * Register a scene
     */
    register(scene: VisualScene): void;

    /**
     * Register a scene factory for ordered layer rendering.
     */
    registerFactory?(sceneId: string, factory: () => VisualScene): void;

    /**
     * Enable or disable a specific scene independently
     */
    setSceneEnabled(sceneId: string, enabled: boolean): void;

  /**
   * Get all active scenes
   */
    getActiveScenes(): VisualScene[];

    /**
     * Replace ordered layer scene instances.
     */
    setLayerScenes?(layers: Array<{ key: string; sceneId: string; options?: Record<string, unknown> }>): void;

    /**
     * Update all active scenes
     */
    update(dt: number, context: VisualContext): void;

    /**
     * Destroy manager and all scenes
     */
    destroy(): void;
}
