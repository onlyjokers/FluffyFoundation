<script lang="ts">
  import { onMount } from 'svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Slider from '$lib/components/ui/Slider.svelte';

  export let serverUrl: string;

  type SelectedGeoLocation = {
    lat: number;
    lng: number;
    accuracyM?: number;
    timestamp?: number;
  };

  type GeoControlPersisted = {
    location: SelectedGeoLocation | null;
    rangeM: number;
    address?: string | null;
  };

  // New feature: allow the manager to pick a reference location + radius for geo-based effects.
  const STORAGE_KEY = 'shugu-manager-geo-control-v1';

  let selectedLocation: SelectedGeoLocation | null = null;
  let selectedAddress: string | null = null;
  let rangeM = 100;

  let isLocating = false;
  let errorMessage: string | null = null;
  let restored = false;

  let isResolvingAddress = false;
  let addressError: string | null = null;
  let lastReverseKey = '';
  let reverseAbort: AbortController | null = null;

  let isSyncingFence = false;
  let fenceSyncError: string | null = null;
  let fenceSyncTimer: ReturnType<typeof setTimeout> | null = null;
  let fenceAbort: AbortController | null = null;
  let lastFenceSyncKey = '';

  const geolocationOptions: PositionOptions = {
    enableHighAccuracy: true,
    timeout: 10_000,
    maximumAge: 5_000,
  };

  onMount(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<GeoControlPersisted>;
      if (parsed && typeof parsed === 'object') {
        if (typeof parsed.rangeM === 'number' && Number.isFinite(parsed.rangeM)) {
          rangeM = parsed.rangeM;
        }
        if (parsed.location && typeof parsed.location === 'object') {
          const loc = parsed.location as Record<string, unknown>;
          const lat = typeof loc.lat === 'number' ? loc.lat : NaN;
          const lng = typeof loc.lng === 'number' ? loc.lng : NaN;
          if (
            typeof lat === 'number' &&
            typeof lng === 'number' &&
            Number.isFinite(lat) &&
            Number.isFinite(lng)
          ) {
            selectedLocation = { lat, lng };
          }
        }
        if (typeof parsed.address === 'string' && parsed.address.trim()) {
          selectedAddress = parsed.address.trim();
        }
      }
    } catch (error) {
      console.warn('[GeoControl] Failed to restore state from localStorage', error);
    } finally {
      restored = true;
    }
  });

  $: if (restored) {
    try {
      const payload: GeoControlPersisted = {
        location: selectedLocation,
        rangeM,
        address: selectedAddress,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (error) {
      console.warn('[GeoControl] Failed to persist state to localStorage', error);
    }
  }

  $: if (selectedLocation) {
    const reverseKey = `${selectedLocation.lat.toFixed(6)},${selectedLocation.lng.toFixed(6)}`;
    if (reverseKey !== lastReverseKey || !selectedAddress) {
      lastReverseKey = reverseKey;
      void resolveAddress(selectedLocation);
    }
  } else {
    lastReverseKey = '';
    selectedAddress = null;
    addressError = null;
    reverseAbort?.abort();
    reverseAbort = null;
  }

  $: if (restored) {
    scheduleFenceSync(serverUrl, selectedLocation, rangeM, selectedAddress);
  }

  function formatLocationLabel(location: SelectedGeoLocation | null): string {
    if (!location) return '选择地理位置 (lat,lng)';
    return `📍 ${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}`;
  }

  function parseLatLngInput(value: string): { lat: number; lng: number } | null {
    const parts = value
      .trim()
      .split(/[,\s]+/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length < 2) return null;

    const lat = Number(parts[0]);
    const lng = Number(parts[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (lat < -90 || lat > 90) return null;
    if (lng < -180 || lng > 180) return null;
    return { lat, lng };
  }

  function handleSelectLocation(): void {
    errorMessage = null;
    const current = selectedLocation ? `${selectedLocation.lat}, ${selectedLocation.lng}` : '';
    const input = window.prompt('请输入纬度, 经度 (例如: 39.9042, 116.4074)', current);
    if (!input) return;

    const parsed = parseLatLngInput(input);
    if (!parsed) {
      errorMessage = '格式错误：请输入 "lat,lng"，并确保 lat∈[-90,90] 且 lng∈[-180,180]';
      return;
    }

    selectedLocation = { lat: parsed.lat, lng: parsed.lng };
    selectedAddress = null;
  }

  function requestCurrentPosition(): Promise<GeolocationPosition> {
    if (!('geolocation' in navigator) || !navigator.geolocation) {
      return Promise.reject(new Error('当前浏览器不支持 Geolocation API'));
    }
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, geolocationOptions);
    });
  }

  function formatGeolocationError(error: unknown): string {
    if (typeof error !== 'object' || !error) return String(error);
    const maybe = error as Partial<GeolocationPositionError>;
    if (typeof maybe.code === 'number') {
      switch (maybe.code) {
        case 1:
          return '获取位置被拒绝 (PERMISSION_DENIED)';
        case 2:
          return '无法获取位置 (POSITION_UNAVAILABLE)';
        case 3:
          return '获取位置超时 (TIMEOUT)';
        default:
          return maybe.message ?? '获取位置失败';
      }
    }
    return (error as { message?: string }).message ?? String(error);
  }

  async function resolveAddress(location: SelectedGeoLocation): Promise<void> {
    addressError = null;
    if (!serverUrl) return;

    reverseAbort?.abort();
    reverseAbort = new AbortController();

    isResolvingAddress = true;
    try {
      const origin = new URL(serverUrl).origin;
      const url = new URL('/geo/reverse', origin);
      url.searchParams.set('lat', String(location.lat));
      url.searchParams.set('lng', String(location.lng));
      url.searchParams.set('lang', 'zh-CN');
      url.searchParams.set('zoom', '18');

      const response = await fetch(url.toString(), {
        method: 'GET',
        signal: reverseAbort.signal,
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(body || response.statusText);
      }
      const json = (await response.json()) as {
        formattedAddress?: string;
        displayName?: string;
      };
      selectedAddress = (json.formattedAddress || json.displayName || '').trim() || null;
    } catch (error) {
      const err = error as { name?: string; message?: string };
      if (err?.name === 'AbortError') return;
      addressError = err?.message ?? String(error);
    } finally {
      isResolvingAddress = false;
    }
  }

  function scheduleFenceSync(
    nextServerUrl: string,
    location: SelectedGeoLocation | null,
    nextRangeM: number,
    address: string | null
  ): void {
    fenceSyncError = null;
    if (!nextServerUrl) return;
    if (!location) return;

    const key = `${nextServerUrl}|${location.lat.toFixed(6)},${location.lng.toFixed(6)}|${Math.round(
      nextRangeM
    )}|${address ?? ''}`;
    if (key === lastFenceSyncKey) return;

    if (fenceSyncTimer) clearTimeout(fenceSyncTimer);
    fenceSyncTimer = setTimeout(() => {
      void syncFenceToServer(nextServerUrl, location, nextRangeM, address, key);
    }, 300);
  }

  async function syncFenceToServer(
    nextServerUrl: string,
    location: SelectedGeoLocation,
    nextRangeM: number,
    address: string | null,
    key: string
  ): Promise<void> {
    if (!nextServerUrl) return;

    fenceAbort?.abort();
    fenceAbort = new AbortController();

    isSyncingFence = true;
    fenceSyncError = null;

    try {
      const origin = new URL(nextServerUrl).origin;
      const url = new URL('/geo/fence', origin);
      const payload = {
        center: { lat: location.lat, lng: location.lng },
        rangeM: nextRangeM,
        address,
      };

      const response = await fetch(url.toString(), {
        method: 'POST',
        signal: fenceAbort.signal,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(body || response.statusText);
      }

      lastFenceSyncKey = key;
    } catch (error) {
      const err = error as { name?: string; message?: string };
      if (err?.name === 'AbortError') return;
      fenceSyncError = err?.message ?? String(error);
    } finally {
      isSyncingFence = false;
    }
  }

  async function handleGetCurrentLocation(): Promise<void> {
    errorMessage = null;
    isLocating = true;
    try {
      const position = await requestCurrentPosition();
      selectedLocation = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracyM: position.coords.accuracy,
        timestamp: position.timestamp,
      };
      selectedAddress = null;
    } catch (error) {
      errorMessage = formatGeolocationError(error);
    } finally {
      isLocating = false;
    }
  }
</script>

<Card title="📍 地理位置">
  <div class="control-group">
    <Button variant="secondary" fullWidth on:click={handleSelectLocation}>
      <div class="location-label">
        <div class="address">
          {#if selectedAddress}
            {selectedAddress}
          {:else}
            {formatLocationLabel(selectedLocation)}
          {/if}
        </div>
        {#if selectedLocation}
          <div class="coords">{selectedLocation.lat.toFixed(6)}, {selectedLocation.lng.toFixed(6)}</div>
        {/if}
      </div>
    </Button>

    <Slider label="范围" min={1} max={2000} step={10} suffix=" m" bind:value={rangeM} />

    <Button variant="primary" fullWidth disabled={isLocating} on:click={handleGetCurrentLocation}>
      {isLocating ? '正在获取位置…' : '获取现在的位置 (Manager)'}
    </Button>

    {#if selectedLocation?.accuracyM}
      <p class="meta">精度：±{Math.round(selectedLocation.accuracyM)} m</p>
    {/if}
    {#if selectedAddress}
      <p class="address-full">{selectedAddress}</p>
    {/if}
    {#if selectedLocation && isSyncingFence}
      <p class="meta">正在同步演出位置到服务器…</p>
    {/if}
    {#if fenceSyncError}
      <p class="error">同步到服务器失败：{fenceSyncError}</p>
    {/if}
    {#if selectedLocation && isResolvingAddress}
      <p class="meta">正在解析地址…</p>
    {/if}
    {#if addressError}
      <p class="error">地址解析失败：{addressError}</p>
    {/if}
    {#if errorMessage}
      <p class="error">{errorMessage}</p>
    {/if}
  </div>
</Card>

<style>
  .control-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .location-label {
    display: flex;
    flex-direction: column;
    gap: 2px;
    text-align: left;
    width: 100%;
    min-width: 0;
  }

  .address {
    font-size: var(--text-sm);
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .coords {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--text-muted);
  }

  .address-full {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--text-secondary);
    word-break: break-word;
  }

  .meta {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--text-muted);
  }

  .error {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--color-error);
  }
</style>
