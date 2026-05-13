<!-- Purpose: Renders Display-local and server-local media controls for Rete nodes. -->
<script lang="ts">
  import { displayBridgeState } from '$lib/display/display-bridge';
  import {
    buildDisplayFileRef,
    isDisplayFileRef,
    localDisplayMediaStore,
    parseDisplayFileId,
  } from '$lib/stores/local-display-media';
  import { localMediaStore, type LocalMediaKind } from '$lib/stores/local-media';

  type AnyRecord = Record<string, unknown>;

  export let data: AnyRecord;
  export let isInline = false;
  export let hasLabel = false;

  let didRefreshLocalMedia = false;
  let isLocalDisplayConnected = false;
  $: isLocalDisplayConnected = $displayBridgeState?.status === 'connected';

  function buildLocalMediaOptions(kind: string): { value: string; label: string }[] {
    const list = ($localMediaStore?.files ?? []) as AnyRecord[];
    const k = kind && typeof kind === 'string' ? kind : 'any';
    const filtered = k === 'any' ? list : list.filter((f) => String(f?.kind ?? '') === k);
    return filtered.map((f) => ({
      value: String(f?.path ?? ''),
      label: String(f?.label ?? f?.path ?? ''),
    }));
  }

  function inferLocalKindFromPath(filePath: string): LocalMediaKind | null {
    const lower = filePath.toLowerCase();
    if (/\.(mp3|wav|ogg|m4a|aac|flac|aif|aiff|opus)$/.test(lower)) return 'audio';
    if (/\.(png|jpe?g|gif|webp|bmp|svg)$/.test(lower)) return 'image';
    if (/\.(mp4|webm|mov|m4v)$/.test(lower)) return 'video';
    return null;
  }

  const localAssetKindFromControl = (
    kindRaw: unknown,
    fallbackPath: string
  ): LocalMediaKind | null => {
    const normalized = typeof kindRaw === 'string' ? kindRaw.trim().toLowerCase() : '';
    if (normalized === 'audio' || normalized === 'image' || normalized === 'video') {
      return normalized;
    }
    return inferLocalKindFromPath(fallbackPath);
  };

  let localAssetDraft = '';
  let localAssetDraftDirty = false;
  let localAssetError: string | null = null;
  let localAssetValidating = false;
  let localAssetPickerKind: LocalMediaKind | null = null;
  let localAssetSource: 'display' | 'server' = 'display';
  let localAssetSourceInitialized = false;
  let localAssetSourcePinned = false;
  let displayLocalError: string | null = null;
  let displayLocalFileInput: HTMLInputElement | null = null;
  let lastServerLocalAssetPath = '';
  let lastDisplayFileRef = '';

  $: {
    const current = typeof data?.value === 'string' ? String(data.value) : '';
    const currentTrimmed = current.trim();
    localAssetPickerKind = localAssetKindFromControl(data?.assetKind, '') ?? null;

    if (isDisplayFileRef(currentTrimmed)) lastDisplayFileRef = currentTrimmed;
    else if (currentTrimmed) lastServerLocalAssetPath = currentTrimmed;

    if (!localAssetSourceInitialized) {
      if (isDisplayFileRef(currentTrimmed)) localAssetSource = 'display';
      else if (currentTrimmed) localAssetSource = 'server';
      else localAssetSource = isLocalDisplayConnected ? 'display' : 'server';
      localAssetSourceInitialized = true;
    } else if (!localAssetSourcePinned) {
      if (isDisplayFileRef(currentTrimmed) && localAssetSource !== 'display') {
        localAssetSource = 'display';
      } else if (
        currentTrimmed &&
        !isDisplayFileRef(currentTrimmed) &&
        localAssetSource !== 'server'
      ) {
        localAssetSource = 'server';
      }
    }

    if (!localAssetDraftDirty) {
      localAssetDraft = isDisplayFileRef(currentTrimmed) ? '' : currentTrimmed;
    }
  }

  $: if (localAssetSourceInitialized) {
    if (localAssetSource === 'server') {
      if (!didRefreshLocalMedia) {
        didRefreshLocalMedia = true;
        void localMediaStore.refresh();
      }
    } else {
      didRefreshLocalMedia = false;
    }
  } else {
    didRefreshLocalMedia = false;
  }

  function buildDisplayLocalMediaOptions(kind: string): { value: string; label: string }[] {
    const list = ($localDisplayMediaStore?.files ?? []) as AnyRecord[];
    const k = kind && typeof kind === 'string' ? kind : 'any';
    const filtered = k === 'any' ? list : list.filter((f) => String(f?.kind ?? '') === k);
    return filtered.map((f) => {
      const id = String(f?.id ?? '');
      const name = String(f?.name ?? id);
      const sizeBytes = typeof f?.sizeBytes === 'number' ? f.sizeBytes : 0;
      const sizeMb = sizeBytes > 0 ? Math.round((sizeBytes / (1024 * 1024)) * 100) / 100 : 0;
      const sizeLabel = sizeMb > 0 ? ` (${sizeMb} MB)` : '';
      return {
        value: buildDisplayFileRef(id),
        label: `${name}${sizeLabel}`,
      };
    });
  }

  function acceptForLocalKind(kind: LocalMediaKind | null): string {
    if (kind === 'audio') return 'audio/*';
    if (kind === 'image') return 'image/*';
    if (kind === 'video') return 'video/*';
    return '';
  }

  const switchLocalAssetSource = (next: 'display' | 'server') => {
    if (data?.readonly) return;
    localAssetSource = next;
    localAssetSourcePinned = true;
    displayLocalError = null;
    localAssetError = null;

    const current = typeof data?.value === 'string' ? String(data.value).trim() : '';
    if (isDisplayFileRef(current)) lastDisplayFileRef = current;
    else if (current) lastServerLocalAssetPath = current;

    if (next === 'display') {
      localAssetDraftDirty = false;
      localAssetDraft = lastServerLocalAssetPath;
      if (!isDisplayFileRef(current)) data?.setValue?.(lastDisplayFileRef || '');
      return;
    }

    localAssetDraftDirty = false;
    localAssetDraft = lastServerLocalAssetPath;
    if (isDisplayFileRef(current) || !current) data?.setValue?.(lastServerLocalAssetPath || '');
  };

  const openDisplayLocalFilePicker = () => {
    if (data?.readonly) return;
    displayLocalError = null;
    displayLocalFileInput?.click();
  };

  const changeDisplayLocalSelect = (event: Event) => {
    const target = event.target as HTMLSelectElement;
    displayLocalError = null;
    localAssetError = null;
    localAssetDraftDirty = false;
    localAssetDraft = '';
    localAssetSource = 'display';
    localAssetSourcePinned = true;
    data?.setValue?.(target.value);
  };

  const onDisplayLocalFileChange = (event: Event) => {
    if (data?.readonly) return;
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0] ?? null;
    target.value = '';
    if (!file) return;

    const fallbackKind = inferLocalKindFromPath(file.name);
    const kind = localAssetKindFromControl(data?.assetKind, file.name) ?? fallbackKind;
    if (!kind) {
      displayLocalError = 'Unsupported file type for this node.';
      return;
    }

    const entry = localDisplayMediaStore.registerFile(file, kind);
    displayLocalError = null;
    localAssetError = null;
    localAssetDraftDirty = false;
    localAssetDraft = '';
    localAssetSource = 'display';
    localAssetSourcePinned = true;
    data?.setValue?.(buildDisplayFileRef(entry.id));
  };

  const changeLocalAssetSelect = (event: Event) => {
    const target = event.target as HTMLSelectElement;
    const next = target.value;
    localAssetDraftDirty = false;
    localAssetDraft = next;
    localAssetError = null;
    localAssetSource = 'server';
    localAssetSourcePinned = true;
    data?.setValue?.(next);
  };

  const onLocalAssetDraftInput = (event: Event) => {
    const target = event.target as HTMLInputElement;
    localAssetDraftDirty = true;
    localAssetDraft = target.value;
    localAssetError = null;
  };

  const validateLocalAssetDraft = async () => {
    if (data?.readonly) return;
    const draft = localAssetDraft.trim();
    if (!draft) {
      localAssetDraftDirty = false;
      localAssetError = null;
      localAssetSourcePinned = true;
      localAssetSource = 'server';
      data?.setValue?.('');
      return;
    }

    const kind = localAssetKindFromControl(data?.assetKind, draft);
    if (!kind) {
      localAssetError = 'Unsupported file type for this node.';
      return;
    }

    localAssetValidating = true;
    localAssetError = null;
    try {
      const validated = await localMediaStore.validatePath(draft, kind);
      if (!validated?.path) throw new Error('Invalid path');
      localAssetDraftDirty = false;
      localAssetDraft = validated.path;
      localAssetSourcePinned = true;
      localAssetSource = 'server';
      data?.setValue?.(validated.path);
    } catch (err) {
      localAssetError = err instanceof Error ? err.message : String(err);
    } finally {
      localAssetValidating = false;
    }
  };

  const onLocalAssetDraftKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    void validateLocalAssetDraft();
  };

  const onLocalAssetDraftBlur = () => {
    void validateLocalAssetDraft();
  };

  function displayLocalSelectedName(value: unknown): string {
    const raw = typeof value === 'string' ? value.trim() : '';
    const id = parseDisplayFileId(raw);
    if (!id) return '';
    const entry = localDisplayMediaStore.getFileById(id);
    return entry ? entry.name : '';
  }
</script>

<div class="local-asset-picker {isInline ? 'inline' : ''}">
  {#if hasLabel}
    <div class="control-label">{data.label}</div>
  {/if}

  <div class="local-asset-source" on:pointerdown|stopPropagation>
    <button
      type="button"
      class="local-asset-source-btn {localAssetSource === 'display' ? 'active' : ''}"
      disabled={data.readonly}
      on:click|stopPropagation={() => switchLocalAssetSource('display')}
    >
      Display
    </button>
    <button
      type="button"
      class="local-asset-source-btn {localAssetSource === 'server' ? 'active' : ''}"
      disabled={data.readonly}
      on:click|stopPropagation={() => switchLocalAssetSource('server')}
    >
      Server
    </button>
  </div>

  {#if localAssetSource === 'display'}
    <div class="file-row">
      <button
        type="button"
        class="file-btn"
        disabled={data.readonly}
        on:pointerdown|stopPropagation
        on:click|stopPropagation={openDisplayLocalFilePicker}
      >
        Choose file
      </button>
      <div class="file-name">
        {#if isDisplayFileRef(data.value)}
          {displayLocalSelectedName(data.value) || String(data.value)}
        {:else}
          No file selected
        {/if}
      </div>
    </div>

    <input
      class="file-input"
      type="file"
      accept={acceptForLocalKind(localAssetPickerKind)}
      bind:this={displayLocalFileInput}
      disabled={data.readonly}
      on:pointerdown|stopPropagation
      on:change={onDisplayLocalFileChange}
    />

    <select
      class="control-input {isInline ? 'inline' : ''}"
      value={isDisplayFileRef(data.value) ? data.value : ''}
      disabled={data.readonly}
      on:pointerdown|stopPropagation
      on:change={changeDisplayLocalSelect}
    >
      <option value="">(picked files)</option>
      {#each buildDisplayLocalMediaOptions(String(data.assetKind ?? '')) as opt (opt.value)}
        <option value={opt.value}>{opt.label}</option>
      {/each}
    </select>

    {#if !isLocalDisplayConnected}
      <div class="local-asset-hint">
        Display is not paired. If Display is open in the same browser (same origin), local files
        can still work; otherwise click Open Display.
      </div>
    {/if}
    <div class="local-asset-hint">
      Browser security: a deployed website cannot read arbitrary paths like <code>/Users/...</code
      >. Use the file picker.
    </div>
    {#if displayLocalError}
      <div class="local-asset-error">{displayLocalError}</div>
    {/if}
  {:else}
    <select
      class="control-input {isInline ? 'inline' : ''}"
      value={typeof data.value === 'string' && !isDisplayFileRef(data.value) ? data.value : ''}
      disabled={data.readonly || localAssetValidating}
      on:pointerdown|stopPropagation
      on:change={changeLocalAssetSelect}
    >
      <option value="">(select server-local file)</option>
      {#each buildLocalMediaOptions(String(data.assetKind ?? '')) as opt (opt.value)}
        <option value={opt.value}>{opt.label}</option>
      {/each}
    </select>

    <div class="local-asset-path-row">
      <input
        class="control-input local-asset-path"
        value={localAssetDraft}
        placeholder="/Users/.../file.mp4"
        disabled={data.readonly || localAssetValidating}
        on:pointerdown|stopPropagation
        on:input={onLocalAssetDraftInput}
        on:keydown={onLocalAssetDraftKeyDown}
        on:blur={onLocalAssetDraftBlur}
      />
      <button
        type="button"
        class="local-asset-btn"
        disabled={data.readonly || localAssetValidating}
        on:pointerdown|stopPropagation
        on:click|stopPropagation={() => validateLocalAssetDraft()}
      >
        {localAssetValidating ? 'Checking…' : 'Check'}
      </button>
    </div>

    {#if $localMediaStore?.status === 'error' && $localMediaStore?.error}
      <div class="local-asset-hint">Local media list error: {$localMediaStore.error}</div>
    {/if}
    {#if localAssetError}
      <div class="local-asset-error">{localAssetError}</div>
    {/if}
  {/if}
</div>

<style>
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

  .control-input:disabled {
    background: rgba(2, 6, 23, 0.22);
    border-color: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.58);
    cursor: not-allowed;
  }

  .control-input:disabled:focus {
    border-color: rgba(255, 255, 255, 0.12);
    box-shadow: none;
  }

  .local-asset-picker {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 6px 10px 10px;
  }

  .local-asset-source {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .local-asset-source-btn {
    flex: 1;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(2, 6, 23, 0.35);
    color: rgba(255, 255, 255, 0.78);
    padding: 6px 10px;
    font-size: 12px;
    cursor: pointer;
  }

  .local-asset-source-btn.active {
    background: rgba(99, 102, 241, 0.18);
    border-color: rgba(99, 102, 241, 0.5);
    color: rgba(255, 255, 255, 0.92);
  }

  .local-asset-source-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .local-asset-path-row,
  .file-row {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .local-asset-path {
    flex: 1;
    min-width: 0;
  }

  .local-asset-btn,
  .file-btn {
    border-radius: 10px;
    padding: 6px 10px;
    background: rgba(2, 6, 23, 0.45);
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: rgba(255, 255, 255, 0.85);
    font-size: 12px;
    cursor: pointer;
    white-space: nowrap;
  }

  .local-asset-btn:hover:not(:disabled),
  .file-btn:hover:not(:disabled) {
    border-color: rgba(99, 102, 241, 0.7);
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.12);
  }

  .local-asset-btn:disabled,
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

  .local-asset-error,
  .local-asset-hint {
    font-size: 11px;
    line-height: 1.3;
    color: rgba(248, 113, 113, 0.92);
    overflow-wrap: anywhere;
  }

  .local-asset-hint {
    color: rgba(148, 163, 184, 0.8);
  }
</style>
