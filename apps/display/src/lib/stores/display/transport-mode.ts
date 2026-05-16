/**
 * Purpose: Pure Display transport mode policy for server presence alongside local pairing.
 */

export type DisplayTransportDecision = 'uninitialized' | 'pending' | 'local' | 'server';

export function shouldConnectDisplayServerPresence(decision: DisplayTransportDecision): boolean {
  return decision === 'pending' || decision === 'local' || decision === 'server';
}
