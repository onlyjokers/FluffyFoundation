/**
 * Purpose: Pure client page connection lifecycle decisions shared by the Svelte route and tests.
 */

export type ClientConnectionLifecycleEvent = 'visibilitychange' | 'pagehide';
export type ClientConnectionLifecycleAction = 'connect' | 'disconnect' | 'none';

export function getClientConnectionLifecycleAction(input: {
  event: ClientConnectionLifecycleEvent;
  hasStarted: boolean;
  visibilityState: DocumentVisibilityState | 'hidden' | 'visible' | 'prerender' | 'unloaded';
}): ClientConnectionLifecycleAction {
  if (input.event === 'pagehide') return 'disconnect';
  if (input.visibilityState !== 'visible') return 'disconnect';
  if (!input.hasStarted) return 'none';
  return 'connect';
}
