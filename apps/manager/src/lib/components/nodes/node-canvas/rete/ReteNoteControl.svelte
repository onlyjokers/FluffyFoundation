<!-- Purpose: Renders markdown note controls for Rete nodes. -->
<script lang="ts">
  type NoteViewMode = 'edit' | 'preview' | 'split';

  export let data: Record<string, any>;
  export let isInline = false;
  export let hasLabel = false;
  export let noteViewMode: NoteViewMode = 'edit';
  export let noteHtml = '';
  export let setNoteViewMode: (mode: NoteViewMode) => void;
  export let changeNote: (event: Event) => void;
</script>

<div class="control-field note-field {isInline ? 'inline' : ''}">
  {#if hasLabel}
    <div class="control-label">{data.label}</div>
  {/if}
  <div class="note-toolbar" on:pointerdown|stopPropagation>
    <button
      type="button"
      class="note-tab {noteViewMode === 'edit' ? 'active' : ''}"
      on:click|stopPropagation={() => setNoteViewMode('edit')}
    >
      Edit
    </button>
    <button
      type="button"
      class="note-tab {noteViewMode === 'preview' ? 'active' : ''}"
      on:click|stopPropagation={() => setNoteViewMode('preview')}
    >
      Preview
    </button>
    <button
      type="button"
      class="note-tab {noteViewMode === 'split' ? 'active' : ''}"
      on:click|stopPropagation={() => setNoteViewMode('split')}
    >
      Split
    </button>
  </div>

  {#if noteViewMode === 'preview'}
    <div class="note-preview" on:pointerdown|stopPropagation on:wheel|stopPropagation>
      {@html noteHtml}
    </div>
  {:else if noteViewMode === 'split'}
    <textarea
      class="control-input note-textarea {isInline ? 'inline' : ''}"
      value={data.value}
      placeholder={data.placeholder ?? ''}
      readonly={data.readonly}
      disabled={data.readonly}
      rows="6"
      on:pointerdown|stopPropagation
      on:input={changeNote}
    />
    <div class="note-preview" on:pointerdown|stopPropagation on:wheel|stopPropagation>
      {@html noteHtml}
    </div>
  {:else}
    <textarea
      class="control-input note-textarea {isInline ? 'inline' : ''}"
      value={data.value}
      placeholder={data.placeholder ?? ''}
      readonly={data.readonly}
      disabled={data.readonly}
      rows="6"
      on:pointerdown|stopPropagation
      on:input={changeNote}
    />
  {/if}
</div>

<style>
  .control-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 6px 10px;
  }

  .control-field.inline {
    flex-direction: row;
    align-items: center;
    justify-content: flex-end;
    gap: 0;
    padding: 0;
  }

  .control-label {
    font-size: 11px;
    letter-spacing: 0.2px;
    color: rgba(255, 255, 255, 0.72);
  }

  .control-input {
    width: 100%;
    box-sizing: border-box;
    border-radius: 10px;
    padding: 6px 10px;
    background: rgba(2, 6, 23, 0.45);
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: rgba(255, 255, 255, 0.92);
    outline: none;
    font-size: 12px;
  }

  .control-input.inline {
    width: 110px;
    padding: 5px 8px;
  }

  .control-input:focus {
    border-color: rgba(99, 102, 241, 0.7);
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.18);
  }

  .control-input:disabled,
  .control-input[readonly] {
    background: rgba(2, 6, 23, 0.22);
    border-color: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.58);
    cursor: not-allowed;
  }

  .control-input:disabled:focus,
  .control-input[readonly]:focus {
    border-color: rgba(255, 255, 255, 0.12);
    box-shadow: none;
  }

  .note-field {
    padding-bottom: 10px;
  }

  .note-textarea {
    min-height: 110px;
    resize: vertical;
    font-family: inherit;
    line-height: 1.4;
    white-space: pre-wrap;
  }

  .note-toolbar {
    display: flex;
    gap: 6px;
    margin-bottom: 8px;
  }

  .note-tab {
    border-radius: 999px;
    padding: 6px 10px;
    background: rgba(2, 6, 23, 0.32);
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: rgba(255, 255, 255, 0.78);
    font-size: 11px;
    cursor: pointer;
  }

  .note-tab:hover {
    border-color: rgba(99, 102, 241, 0.7);
  }

  .note-tab.active {
    background: rgba(99, 102, 241, 0.18);
    border-color: rgba(99, 102, 241, 0.35);
    color: rgba(255, 255, 255, 0.92);
  }

  .note-preview {
    width: 100%;
    box-sizing: border-box;
    border-radius: 10px;
    padding: 8px 10px;
    background: rgba(2, 6, 23, 0.28);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.9);
    font-size: 12px;
    overflow: auto;
    max-height: 260px;
  }

  .note-preview :global(p) {
    margin: 0 0 10px;
  }

  .note-preview :global(p:last-child) {
    margin-bottom: 0;
  }

  .note-preview :global(h1) {
    font-size: 16px;
    margin: 10px 0 8px;
  }

  .note-preview :global(h2) {
    font-size: 14px;
    margin: 10px 0 8px;
  }

  .note-preview :global(h3),
  .note-preview :global(h4),
  .note-preview :global(h5),
  .note-preview :global(h6) {
    font-size: 13px;
    margin: 10px 0 8px;
  }

  .note-preview :global(ul),
  .note-preview :global(ol) {
    margin: 0 0 10px;
    padding-left: 18px;
  }

  .note-preview :global(li) {
    margin: 4px 0;
  }

  .note-preview :global(a) {
    color: rgba(129, 140, 248, 0.95);
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .note-preview :global(code) {
    font-family:
      ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New',
      monospace;
    font-size: 11px;
    background: rgba(2, 6, 23, 0.55);
    border: 1px solid rgba(255, 255, 255, 0.12);
    padding: 1px 6px;
    border-radius: 8px;
  }

  .note-preview :global(pre) {
    margin: 0 0 10px;
    padding: 10px;
    background: rgba(2, 6, 23, 0.55);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 10px;
    overflow: auto;
  }

  .note-preview :global(pre code) {
    background: transparent;
    border: none;
    padding: 0;
    white-space: pre;
    display: block;
  }

  .note-preview :global(blockquote) {
    margin: 0 0 10px;
    padding-left: 10px;
    border-left: 2px solid rgba(99, 102, 241, 0.55);
    color: rgba(255, 255, 255, 0.82);
  }

  .note-preview :global(hr) {
    border: none;
    height: 1px;
    background: rgba(255, 255, 255, 0.14);
    margin: 10px 0;
  }
</style>
