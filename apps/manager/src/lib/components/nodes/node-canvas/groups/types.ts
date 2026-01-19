export type NodeGroup = {
  id: string;
  parentId: string | null;
  name: string;
  nodeIds: string[];
  disabled: boolean;
  minimized: boolean;
  managerId: string | null;
  transferable: boolean;
  runtimeActive?: boolean;
};
