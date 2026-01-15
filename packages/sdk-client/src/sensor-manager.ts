/**
 * Sensor manager for collecting device motion and orientation data
 */

import type { GyroData, AccelData, OrientationData } from '@shugu/protocol';
import { getDeviceMotionEventCtor } from './browser/device-motion.js';

export type SensorCallback<T> = (data: T) => void;

export interface SensorManagerConfig {
    /** Throttle interval in ms */
    throttleMs?: number;
}

interface SensorPermissionResult {
    granted: boolean;
    error?: string;
}

/**
 * Manages device sensors with throttling and unified interface
 */
export class SensorManager {
    private config: Required<SensorManagerConfig>;
    private gyroCallbacks: Set<SensorCallback<GyroData>> = new Set();
    private accelCallbacks: Set<SensorCallback<AccelData>> = new Set();
    private orientationCallbacks: Set<SensorCallback<OrientationData>> = new Set();

    private lastGyroEmit = 0;
    private lastAccelEmit = 0;
    private lastOrientationEmit = 0;

    private isListening = false;

    constructor(config: SensorManagerConfig = {}) {
        this.config = {
            throttleMs: config.throttleMs ?? 100, // 10Hz default
        };
    }

    /**
     * Request motion sensor permissions (required on iOS 13+)
     */
    async requestPermissions(): Promise<SensorPermissionResult> {
        const deviceMotionEvent = getDeviceMotionEventCtor(
            typeof window !== 'undefined' ? window : undefined
        );
        const requestMotionPermission = deviceMotionEvent?.requestPermission;

        // iOS 13+ requires user gesture and explicit permission request.
        // Request motion once; it unlocks orientation too on Safari, so treat orientation as best-effort.
        if (typeof requestMotionPermission === 'function') {
            try {
                const motionPermission = await requestMotionPermission.call(deviceMotionEvent);

                if (motionPermission === 'granted') {
                    return { granted: true };
                }
                return {
                    granted: false,
                    error:
                        typeof motionPermission === 'string'
                            ? motionPermission
                            : 'Permission denied by user',
                };
            } catch (error) {
                return {
                    granted: false,
                    error: error instanceof Error ? error.message : 'Permission request failed',
                };
            }
        }

        // No permission API exposed. Only report granted when the APIs actually exist to avoid
        // showing success on devices that lack sensors altogether.
        if (!this.isMotionAvailable() && !this.isOrientationAvailable()) {
            return { granted: false, error: 'Motion/orientation sensors unavailable' };
        }

        return { granted: true };
    }

    /**
     * Check if device motion is available
     */
    isMotionAvailable(): boolean {
        return 'DeviceMotionEvent' in window;
    }

    /**
     * Check if device orientation is available
     */
    isOrientationAvailable(): boolean {
        return 'DeviceOrientationEvent' in window;
    }

    /**
     * Start listening to sensors
     */
    start(): void {
        if (this.isListening) return;
        this.isListening = true;

        window.addEventListener('devicemotion', this.handleDeviceMotion);
        window.addEventListener('deviceorientation', this.handleDeviceOrientation);
    }

    /**
     * Stop listening to sensors
     */
    stop(): void {
        if (!this.isListening) return;
        this.isListening = false;

        window.removeEventListener('devicemotion', this.handleDeviceMotion);
        window.removeEventListener('deviceorientation', this.handleDeviceOrientation);
    }

    /**
     * Subscribe to gyroscope data
     */
    onGyro(callback: SensorCallback<GyroData>): () => void {
        this.gyroCallbacks.add(callback);
        return () => this.gyroCallbacks.delete(callback);
    }

    /**
     * Subscribe to accelerometer data
     */
    onAccel(callback: SensorCallback<AccelData>): () => void {
        this.accelCallbacks.add(callback);
        return () => this.accelCallbacks.delete(callback);
    }

    /**
     * Subscribe to orientation data
     */
    onOrientation(callback: SensorCallback<OrientationData>): () => void {
        this.orientationCallbacks.add(callback);
        return () => this.orientationCallbacks.delete(callback);
    }

    /**
     * Set throttle interval
     */
    setThrottleMs(ms: number): void {
        this.config.throttleMs = ms;
    }

    private handleDeviceMotion = (event: DeviceMotionEvent): void => {
        const now = Date.now();

        // Handle gyroscope (rotation rate)
        if (event.rotationRate && now - this.lastGyroEmit >= this.config.throttleMs) {
            const gyroData: GyroData = {
                alpha: event.rotationRate.alpha ?? 0,
                beta: event.rotationRate.beta ?? 0,
                gamma: event.rotationRate.gamma ?? 0,
            };
            this.gyroCallbacks.forEach(cb => cb(gyroData));
            this.lastGyroEmit = now;
        }

        // Handle accelerometer
        const accel = event.accelerationIncludingGravity ?? event.acceleration;
        if (accel && now - this.lastAccelEmit >= this.config.throttleMs) {
            const accelData: AccelData = {
                x: accel.x ?? 0,
                y: accel.y ?? 0,
                z: accel.z ?? 0,
                includesGravity: !!event.accelerationIncludingGravity,
            };
            this.accelCallbacks.forEach(cb => cb(accelData));
            this.lastAccelEmit = now;
        }
    };

    private handleDeviceOrientation = (event: DeviceOrientationEvent): void => {
        const now = Date.now();
        if (now - this.lastOrientationEmit < this.config.throttleMs) return;

        const orientationData: OrientationData = {
            alpha: event.alpha,
            beta: event.beta,
            gamma: event.gamma,
            absolute: event.absolute,
        };
        this.orientationCallbacks.forEach(cb => cb(orientationData));
        this.lastOrientationEmit = now;
    };
}
