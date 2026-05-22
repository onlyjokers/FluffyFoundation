import { Parameter, normalizePath } from './parameter';
import type { ParameterOptions, ParameterSnapshot } from './types';

type AnyParameter = Parameter<any>;

/**
 * Singleton registry that holds every parameter as a "single source of truth".
 */
export class ParameterRegistry {
  private static _instance: ParameterRegistry;
  private parameters = new Map<string, AnyParameter>();
  private subscribers = new Set<() => void>();

  static get instance(): ParameterRegistry {
    if (!this._instance) {
      this._instance = new ParameterRegistry();
    }
    return this._instance;
  }

  subscribe(listener: () => void): () => void {
    this.subscribers.add(listener);
    return () => this.subscribers.delete(listener);
  }

  private notify(): void {
    this.subscribers.forEach((listener) => {
      try {
        listener();
      } catch (err) {
        console.warn('[ParameterRegistry] subscriber error', err);
      }
    });
  }

  register<T>(options: ParameterOptions<T>): Parameter<T> {
    const path = normalizePath(options.path);
    const existing = this.parameters.get(path);
    // Reuse existing parameter to preserve references (crucial for Node Graph/Listeners)
    if (existing) {
      // If it was offline, bring it back
      const wasOffline = existing.isOffline;
      existing.setOffline(false);
      if (wasOffline) {
        this.notify();
      }
      return existing as unknown as Parameter<T>;
    }

    const param = new Parameter<T>({ ...options, path });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.parameters.set(path, param);
    this.notify();
    return param;
  }

  get<T>(path: string): Parameter<T> | undefined {
    return this.parameters.get(normalizePath(path)) as Parameter<T> | undefined;
  }

  has(path: string): boolean {
    return this.parameters.has(normalizePath(path));
  }

  /**
   * Mark parameters under a prefix as offline (Soft Delete).
   * Do NOT remove them from the map.
   */
  markOffline(prefix: string): void {
    let changed = false;
    this.list(prefix).forEach((p) => {
      if (!p.isOffline) {
        p.setOffline(true);
        changed = true;
      }
    });
    if (changed) {
      this.notify();
    }
  }
  
  /**
   * Mark parameters under a prefix as online.
   */
  markOnline(prefix: string): void {
    let changed = false;
    this.list(prefix).forEach((p) => {
      if (p.isOffline) {
        p.setOffline(false);
        changed = true;
      }
    });
    if (changed) {
      this.notify();
    }
  }

  /**
   * Hard delete - only use if you really mean it (e.g. app reset)
   */
  remove(path: string): boolean {
    const deleted = this.parameters.delete(normalizePath(path));
    if (deleted) {
      this.notify();
    }
    return deleted;
  }

  /**
   * List parameters under a prefix (e.g., "client/1")
   */
  list(prefix?: string): AnyParameter[] {
    if (!prefix) return Array.from(this.parameters.values());
    const normalized = normalizePath(prefix);
    const withSlash = normalized.endsWith('/') ? normalized : `${normalized}/`;
    return Array.from(this.parameters.entries())
      .filter(([key]) => key === normalized || key.startsWith(withSlash))
      .map(([, param]) => param);
  }

  /**
   * Convenience snapshot for UI/debugging
   */
  snapshot(prefix?: string): ParameterSnapshot[] {
    return this.list(prefix).map((p) => p.snapshot());
  }

  clear(): void {
    if (this.parameters.size === 0) return;
    this.parameters.clear();
    this.notify();
  }
}

export const parameterRegistry = ParameterRegistry.instance;
