/**
 * Box scene - A 3D box that responds to orientation and audio
 */

import * as THREE from 'three';
import type { VisualScene, VisualContext } from './types.js';
import {
    clampOpacity,
    normalizeVisualAudioSource,
    selectVisualAudioFeatures,
    type VisualAudioSource,
} from './audio-source.js';

type BoxColor = THREE.ColorRepresentation;
type NormalizedBoxSceneOptions = Omit<Required<BoxSceneOptions>, 'showBackground'> & {
    showBackground: number;
};

export interface BoxSceneOptions {
    /** Box color (CSS color or hex number) */
    color?: BoxColor;
    /** Background color (CSS color or hex number) */
    backgroundColor?: BoxColor;
    /** Enable wireframe mode */
    wireframe?: boolean;
    /** Base box size */
    baseSize?: number;
    /** Audio reactivity strength */
    audioReactivity?: number;
    /** Fill the scene background instead of rendering transparent. */
    showBackground?: number | boolean;
    /** Audio source used for audio-reactive scale/color. */
    audioSource?: VisualAudioSource;
}

export class BoxScene implements VisualScene {
    readonly id = 'box-scene';

    private container: HTMLElement | null = null;
    private scene: THREE.Scene | null = null;
    private camera: THREE.PerspectiveCamera | null = null;
    private renderer: THREE.WebGLRenderer | null = null;
    private box: THREE.Mesh | null = null;
    private options: NormalizedBoxSceneOptions;

    private targetScale = 1;
    private targetQuat = new THREE.Quaternion();
    private animationId: number | null = null;

    // Reused math objects to avoid allocations
    private readonly _euler = new THREE.Euler(0, 0, 0, 'YXZ');
    private readonly _q0 = new THREE.Quaternion();
    private readonly _q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)); // -PI/2 around X
    private readonly _zee = new THREE.Vector3(0, 0, 1);

    constructor(options: BoxSceneOptions = {}) {
        this.options = {
            color: options.color ?? 0x4a90d9,
            backgroundColor: options.backgroundColor ?? 0x0a0a0f,
            wireframe: options.wireframe ?? false,
            baseSize: options.baseSize ?? 1.5,
            audioReactivity: options.audioReactivity ?? 2,
            showBackground: clampOpacity(options.showBackground, 0),
            audioSource: normalizeVisualAudioSource(options.audioSource),
        };
    }

    configure(options: BoxSceneOptions = {}): void {
        const { showBackground, audioSource, ...rest } = options;
        this.options = {
            ...this.options,
            ...rest,
            showBackground: showBackground !== undefined
                ? clampOpacity(showBackground, this.options.showBackground)
                : this.options.showBackground,
            audioSource: normalizeVisualAudioSource(audioSource, this.options.audioSource),
        };
        if (this.scene) {
            this.applyBackground();
        }
        if (this.renderer) {
            this.renderer.setClearColor(this.options.backgroundColor, this.options.showBackground);
        }
        if (this.box) {
            const material = this.box.material as THREE.MeshStandardMaterial;
            material.color.set(this.options.color);
        }
    }

    mount(container: HTMLElement): void {
        this.container = container;

        // Create scene
        this.scene = new THREE.Scene();
        this.applyBackground();

        // Create camera
        const aspect = container.clientWidth / container.clientHeight;
        this.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 1000);
        this.camera.position.z = 5;

        // Create renderer with performance settings
        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            powerPreference: 'high-performance',
            alpha: true,
        });
        this.renderer.setClearColor(this.options.backgroundColor, this.options.showBackground);
        this.renderer.setSize(container.clientWidth, container.clientHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Limit for performance
        this.renderer.domElement.dataset.shuguSceneId = this.id;
        this.renderer.domElement.classList.add('shugu-scene-canvas');
        container.appendChild(this.renderer.domElement);

        // Create box
        const geometry = new THREE.BoxGeometry(
            this.options.baseSize,
            this.options.baseSize,
            this.options.baseSize
        );

        const material = new THREE.MeshStandardMaterial({
            color: this.options.color,
            wireframe: this.options.wireframe,
            metalness: 0.5,
            roughness: 0.5,
        });

        this.box = new THREE.Mesh(geometry, material);
        this.scene.add(this.box);

        // Add lights
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
        directionalLight.position.set(5, 5, 5);
        this.scene.add(directionalLight);

        const pointLight = new THREE.PointLight(0x4a90d9, 1, 10);
        pointLight.position.set(-3, 3, 3);
        this.scene.add(pointLight);

        // Handle resize
        window.addEventListener('resize', this.handleResize);
    }

    unmount(): void {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }

        window.removeEventListener('resize', this.handleResize);

        if (this.renderer && this.container) {
            this.container.removeChild(this.renderer.domElement);
            this.renderer.dispose();
        }

        if (this.box) {
            (this.box.geometry as THREE.BoxGeometry).dispose();
            (this.box.material as THREE.MeshStandardMaterial).dispose();
        }

        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.box = null;
        this.container = null;
    }

    update(dt: number, context: VisualContext): void {
        if (!this.box || !this.scene || !this.camera || !this.renderer) return;

        // Update target rotation from orientation (using quaternions for stable mapping)
        if (context.orientation) {
            const alpha = (context.orientation.alpha ?? 0) * Math.PI / 180;
            const beta = (context.orientation.beta ?? 0) * Math.PI / 180;
            const gamma = (context.orientation.gamma ?? 0) * Math.PI / 180;
            const screen = (context.orientation.screen ?? 0) * Math.PI / 180;

            this.setObjectQuaternion(this.targetQuat, alpha, beta, gamma, screen);
        }

        // Update target scale from audio
        const audioFeatures = selectVisualAudioFeatures(context, this.options.audioSource);
        if (audioFeatures) {
            const rms = audioFeatures.rms ?? 0;
            this.targetScale = 1 + rms * this.options.audioReactivity;

            // Change color based on frequency bands
            const material = this.box.material as THREE.MeshStandardMaterial;
            const low = audioFeatures.lowEnergy ?? 0;
            const high = audioFeatures.highEnergy ?? 0;

            // Shift hue based on frequency content
            const hue = 0.55 + (high - low) * 0.3; // Blue-ish base, shifts with audio
            const saturation = 0.6 + rms * 0.4;
            const lightness = 0.4 + rms * 0.2;

            material.color.setHSL(hue, saturation, lightness);

            // Pulse on beat
            if (audioFeatures.beatDetected) {
                this.targetScale = 1.5;
            }
        }

        // Smooth interpolation
        const lerpFactor = 1 - Math.pow(0.1, dt);

        // Smooth orientation using quaternion slerp to avoid gimbal issues
        this.box.quaternion.slerp(this.targetQuat, lerpFactor);

        const currentScale = this.box.scale.x;
        const newScale = currentScale + (this.targetScale - currentScale) * lerpFactor * 2;
        this.box.scale.setScalar(newScale);

        // Render
        this.renderer.render(this.scene, this.camera);
    }

    resize(width: number, height: number): void {
        if (!this.camera || !this.renderer) return;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    private handleResize = (): void => {
        if (!this.container) return;
        this.resize(this.container.clientWidth, this.container.clientHeight);
    };

    private applyBackground(): void {
        if (!this.scene) return;
        this.scene.background = this.options.showBackground >= 1
            ? new THREE.Color(this.options.backgroundColor)
            : null;
    }

    /**
     * Convert DeviceOrientation alpha/beta/gamma + screen orientation into world quaternion
     * (adapted from three.js DeviceOrientationControls)
     */
    private setObjectQuaternion(
        target: THREE.Quaternion,
        alpha: number,
        beta: number,
        gamma: number,
        orient: number
    ): void {
        this._euler.set(beta, alpha, -gamma, 'YXZ');
        target.setFromEuler(this._euler);              // device -> world
        target.multiply(this._q1);                     // adjust frame
        target.multiply(this._q0.setFromAxisAngle(this._zee, -orient)); // screen orientation
    }
}
