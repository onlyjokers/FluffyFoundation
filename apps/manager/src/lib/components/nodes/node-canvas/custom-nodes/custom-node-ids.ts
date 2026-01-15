// Purpose: Custom node ID materialization helpers for nested custom-node graphs.

export const materializeInternalNodeId = (customNodeId: string, internalNodeId: string): string => {
  const cid = String(customNodeId ?? '');
  const iid = String(internalNodeId ?? '');
  return `cn:${cid}:${iid}`;
};

export const isMaterializedInternalNodeId = (customNodeId: string, nodeId: string): boolean => {
  const cid = String(customNodeId ?? '');
  const id = String(nodeId ?? '');
  return Boolean(cid && id && id.startsWith(`cn:${cid}:`));
};

export const internalNodeIdFromMaterialized = (customNodeId: string, nodeId: string): string => {
  const cid = String(customNodeId ?? '');
  const id = String(nodeId ?? '');
  const prefix = `cn:${cid}:`;
  return id.startsWith(prefix) ? id.slice(prefix.length) : id;
};

export const customNodeIdFromMaterializedNodeId = (nodeId: string): string | null => {
  const id = String(nodeId ?? '');
  if (!id.startsWith('cn:')) return null;
  const rest = id.slice(3);
  // Support nested materialization where the customNodeId itself may contain ':' (e.g. nested mothers),
  // assuming the internal node id (template id) never contains ':'.
  const idx = rest.lastIndexOf(':');
  if (idx <= 0 || idx >= rest.length - 1) return null;
  return rest.slice(0, idx);
};
