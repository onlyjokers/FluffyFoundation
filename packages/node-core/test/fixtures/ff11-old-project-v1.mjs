// Purpose: deterministic FF-11 migration fixture for a legacy graph/project document.

export const oldProjectV1 = {
  version: 1,
  graph: {
    nodes: [
      {
        id: 'source',
        type: 'number',
        x: 12,
        y: 34,
        config: { value: 3 },
      },
      {
        id: 'math',
        type: 'math',
        x: 72,
        y: 34,
        config: { operation: '+' },
      },
    ],
    edges: [
      {
        id: 'edge-1',
        from: { node: 'source', port: 'value' },
        to: { node: 'math', port: 'a' },
      },
    ],
  },
  groups: [
    {
      id: 'group-a',
      name: 'Legacy Group',
      nodes: ['source'],
    },
  ],
};
