<!-- Purpose: Renders asset upload controls for Rete file picker inputs. -->
<script lang="ts">
  export let data: Record<string, any>;
  export let isInline = false;
  export let hasLabel = false;
  export let fileInput: HTMLInputElement | null = null;
  export let fileDisplayLabel = '';
  export let fileIsUploading = false;
  export let fileUploadError: string | null = null;
  export let openFilePicker: () => void;
  export let handleFileChange: (event: Event) => void;
</script>

<div class="file-picker {isInline ? 'inline' : ''}">
  {#if hasLabel}
    <div class="control-label">{data.label}</div>
  {/if}
  <div class="file-row">
    <button
      type="button"
      class="file-btn"
      disabled={data.readonly || fileIsUploading}
      on:pointerdown|stopPropagation
      on:click|stopPropagation={openFilePicker}
    >
      {data.buttonLabel || 'Choose file'}
    </button>
    <div class="file-name">{fileDisplayLabel}</div>
  </div>
  {#if fileUploadError}
    <div class="file-error">{fileUploadError}</div>
  {/if}
  <input
    class="file-input"
    type="file"
    accept={data.accept}
    bind:this={fileInput}
    disabled={data.readonly || fileIsUploading}
    on:pointerdown|stopPropagation
    on:change={handleFileChange}
  />
</div>

<style>
  .control-label {
    font-size: 11px;
    letter-spacing: 0.2px;
    color: rgba(255, 255, 255, 0.72);
  }

  .file-picker {
    padding: 6px 10px 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .file-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .file-btn {
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(2, 6, 23, 0.5);
    color: rgba(255, 255, 255, 0.88);
    padding: 6px 10px;
    font-size: 12px;
    cursor: pointer;
  }

  .file-btn:hover {
    border-color: rgba(99, 102, 241, 0.5);
  }

  .file-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .file-name {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.62);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
  }

  .file-input {
    display: none;
  }

  .file-error {
    font-size: 11px;
    color: rgba(239, 68, 68, 0.9);
    line-height: 1.35;
    word-break: break-word;
  }
</style>
