// Purpose: Allow TypeScript to import Svelte components from ui-kit.
declare module '*.svelte' {
  import type { SvelteComponentTyped } from 'svelte';

  export default class Component extends SvelteComponentTyped<Record<string, unknown>> {}
}
