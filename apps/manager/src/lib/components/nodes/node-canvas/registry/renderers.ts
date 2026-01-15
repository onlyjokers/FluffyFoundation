// Purpose: Central registry for Rete renderer components used by the node canvas.
import ReteNode from '../rete/ReteNode.svelte';
import ReteControl from '../rete/ReteControl.svelte';
import ReteConnection from '../rete/ReteConnection.svelte';

export const reteRenderers = {
  node: () => ReteNode,
  connection: () => ReteConnection,
  control: () => ReteControl,
};
