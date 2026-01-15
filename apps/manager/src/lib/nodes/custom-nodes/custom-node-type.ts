/**
 * Purpose: Shared Custom Node type helpers without runtime dependencies.
 */
export const CUSTOM_NODE_TYPE_PREFIX = 'custom:' as const;

export function customNodeType(definitionId: string): string {
  const id = String(definitionId ?? '');
  return `${CUSTOM_NODE_TYPE_PREFIX}${id}`;
}
