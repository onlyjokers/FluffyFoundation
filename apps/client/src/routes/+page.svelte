<script lang="ts">
  import '@shugu/ui-kit/styles';
  import { onMount, onDestroy } from 'svelte';
  import {
    initialize,
    requestPermissions,
    disconnect,
    connectToServer,
    disconnectFromServer,
    getSDK,
    permissions,
    enableAudio,
    startEarlyPreload,
  } from '$lib/stores/client';
  import StartScreen from '$lib/components/StartScreen.svelte';
  import VisualCanvas from '$lib/components/VisualCanvas.svelte';
  import PermissionWarning from '$lib/components/PermissionWarning.svelte';
  import GeoGateOverlay from '$lib/components/GeoGateOverlay.svelte';
  import { toneAudioEngine } from '@shugu/multimedia-core';

  let hasStarted = false;
  let serverUrl = 'https://localhost:3001';
  let e2eSensorTimer: ReturnType<typeof setInterval> | null = null;

  type GeoFenceConfig = {
    center: { lat: number; lng: number };
    rangeM: number;
    address?: string | null;
    updatedAt: number;
  };

  let startupConfigError: string | null = null;

  let gateState: 'idle' | 'checking' | 'blocked' | 'error' = 'idle';
  let gateTitle = '';
  let gateMessage = '';
  let gateDetails: { targetAddress?: string | null; distanceM?: number; rangeM?: number } = {};

  // Temporary bypass: allow entering the client without geolocation checks.
  const BYPASS_GEO_GATE = true;

  let retryCooldownS = 0;
  let retryCooldownTimer: ReturnType<typeof setInterval> | null = null;
  let gateInFlight: Promise<void> | null = null;

  const wheelListenerOptions: AddEventListenerOptions = { passive: false };

  type StandaloneNavigator = Navigator & { standalone?: boolean };
  type FullscreenRequestElement = Element & {
    requestFullscreen?: () => Promise<void> | void;
    webkitRequestFullscreen?: () => Promise<void> | void;
    webkitRequestFullScreen?: () => Promise<void> | void;
    webkitEnterFullscreen?: () => Promise<void> | void;
  };
  type WindowE2E = Window & { __SHUGU_E2E?: boolean };

  const asRecord = (value: unknown): Record<string, unknown> | null =>
    value && typeof value === 'object' ? (value as Record<string, unknown>) : null;

  function canScrollHorizontally(element: Element | null, deltaX: number): boolean {
    let current: Element | null = element;

    while (current && current !== document.documentElement) {
      if (current instanceof HTMLElement) {
        const style = window.getComputedStyle(current);
        const overflowX = style.overflowX;
        const isScrollable =
          overflowX === 'auto' || overflowX === 'scroll' || overflowX === 'overlay';

        if (isScrollable && current.scrollWidth > current.clientWidth) {
          const maxScrollLeft = current.scrollWidth - current.clientWidth;
          if (deltaX < 0 && current.scrollLeft > 0) return true;
          if (deltaX > 0 && current.scrollLeft < maxScrollLeft) return true;
        }
      }

      current = current.parentElement;
    }

    return false;
  }

  function handleWheelNavigationGuard(event: WheelEvent): void {
    if (!event.cancelable) return;

    // Trackpad pinch-to-zoom on Chrome comes through as wheel+ctrlKey; don't interfere.
    if (event.ctrlKey) return;

    const deltaX = event.deltaX ?? 0;
    const deltaY = event.deltaY ?? 0;

    // Only guard against primarily-horizontal gestures (these tend to trigger back/forward).
    if (Math.abs(deltaX) <= Math.abs(deltaY) || deltaX === 0) return;

    const target = event.target instanceof Element ? event.target : null;
    if (canScrollHorizontally(target, deltaX)) return;

    event.preventDefault();
  }

  /**
   * Best-effort fullscreen entry. iOS Safari only recently supports the API; we probe multiple
   * element targets and vendor-prefixed methods. Tries on load and again on the Enter click.
   */
  function tryFullscreen(context: 'auto' | 'click'): void {
    // If already standalone (PWA), nothing to do
    if (typeof navigator !== 'undefined' && (navigator as StandaloneNavigator).standalone) return;

    const candidates = [document.documentElement, document.body].filter(Boolean);

    let request: (() => Promise<void> | void) | null = null;

    for (const el of candidates) {
      const anyEl = el as FullscreenRequestElement;
      const fn =
        anyEl.requestFullscreen?.bind(el) ??
        anyEl.webkitRequestFullscreen?.bind(el) ??
        anyEl.webkitRequestFullScreen?.bind(el) ??
        anyEl.webkitEnterFullscreen?.bind(el);

      if (typeof fn === 'function') {
        request = fn;
        break;
      }
    }

    if (!request) {
      console.warn(`[Fullscreen] API unavailable (${context})`);
      return;
    }

    if (document.fullscreenElement) return;

    Promise.resolve(request()).catch((error) => {
      console.warn(`[Fullscreen] ${context} request failed`, error);
    });
  }

  onMount(() => {
    window.addEventListener('wheel', handleWheelNavigationGuard, wheelListenerOptions);
    // Try immediately (may be ignored without gesture but cheap to attempt)
    tryFullscreen('auto');
    // Preload Tone.js early so `toneAudioEngine.start()` can run inside a user gesture later.
    void toneAudioEngine.ensureLoaded().catch(() => undefined);

    // Get server URL from query params or localStorage
    const params = new URLSearchParams(window.location.search);
    const urlParam = params.get('server');
    const assetReadTokenParam = params.get('assetReadToken') ?? params.get('asset_read_token');
    const e2e = params.get('e2e') === '1';
    const isAccessingViaIP =
      window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';

    if (urlParam) {
      serverUrl = urlParam;
    } else {
      const savedUrl = localStorage.getItem('shugu-server-url');

      // If accessing via IP but saved URL is localhost, ignore the saved URL
      // Also ignore if saved URL is http but we want https
      const savedIsLocalhost =
        savedUrl && (savedUrl.includes('localhost') || savedUrl.includes('127.0.0.1'));
      const savedIsHttp = savedUrl && savedUrl.startsWith('http:');

      // If we are on IP, we definitely want HTTPS IP
      // If we are on localhost, we definitely want HTTPS localhost
      // Basically always prefer auto-detected HTTPS unless user manually set a complex URL

      if (savedUrl && !savedIsHttp && !(isAccessingViaIP && savedIsLocalhost)) {
        serverUrl = savedUrl;
      } else {
        // Default to current hostname (localhost or IP) with HTTPS
        // If running on standard HTTPS port (443), assume we are proxied and use the origin
        if (window.location.protocol === 'https:' && window.location.port === '') {
          serverUrl = window.location.origin;
        } else {
          serverUrl = `https://${window.location.hostname}:3001`;
        }
      }
    }

    // Optional provisioning: allow setting the asset read token via query param (no UI exposure).
    if (assetReadTokenParam && assetReadTokenParam.trim()) {
      try {
        localStorage.setItem('shugu-asset-read-token', assetReadTokenParam.trim());
      } catch {
        // ignore
      }
    }

    // Start asset preloading immediately (before Enter is clicked).
    startEarlyPreload(serverUrl);

    // Preload geo-fence config early (HTTP only; no websocket connection).
    void refreshGeoFenceConfig();

    if (e2e) {
      (window as WindowE2E).__SHUGU_E2E = true;
      permissions.set({
        microphone: 'denied',
        motion: 'granted',
        camera: 'denied',
        wakeLock: 'denied',
        geolocation: 'granted',
      });
      hasStarted = true;
      gateState = 'idle';
      initialize({ serverUrl }, { autoConnect: true });

      // Feed synthetic sensors so node-executor loops have live inputs in desktop e2e runs.
      e2eSensorTimer = setInterval(() => {
        const sdk = getSDK();
        if (!sdk) return;
        const t = Date.now() / 250;
        sdk.sendSensorData('accel', {
          x: Math.sin(t) * 2,
          y: Math.cos(t) * 2,
          z: 0,
          includesGravity: false,
        });
      }, 120);
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);
    handleVisibilityChange();

    return () => {
      window.removeEventListener('wheel', handleWheelNavigationGuard, wheelListenerOptions);
    };
  });

  onDestroy(() => {
    disconnect();
    if (e2eSensorTimer) {
      clearInterval(e2eSensorTimer);
      e2eSensorTimer = null;
    }
    if (retryCooldownTimer) clearInterval(retryCooldownTimer);
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
    }
  });

  function handlePageHide(): void {
    disconnectFromServer();
  }

  function handleVisibilityChange(): void {
    if (typeof document === 'undefined') return;

    const visible = document.visibilityState === 'visible';
    if (!visible) {
      // Treat background/lock-screen as offline so managers see the client as disconnected.
      disconnectFromServer();
      return;
    }

    // Reconnect when visible again (only after Start gate passed).
    if (hasStarted) {
      connectToServer();
    }
  }

  function startRetryCooldown(seconds = 3): void {
    if (retryCooldownTimer) clearInterval(retryCooldownTimer);
    retryCooldownS = seconds;
    retryCooldownTimer = setInterval(() => {
      retryCooldownS = Math.max(0, retryCooldownS - 1);
      if (retryCooldownS === 0 && retryCooldownTimer) {
        clearInterval(retryCooldownTimer);
        retryCooldownTimer = null;
      }
    }, 1000);
  }

  function getServerOrigin(url: string): string | null {
    try {
      return new URL(url).origin;
    } catch (error) {
      console.warn('[Client] Invalid serverUrl', error);
      return null;
    }
  }

  async function refreshGeoFenceConfig(): Promise<{ fence: GeoFenceConfig | null } | null> {
    startupConfigError = null;
    const origin = getServerOrigin(serverUrl);
    if (!origin) {
      startupConfigError = 'Invalid serverUrl';
      return null;
    }

    try {
      const url = new URL('/geo/fence', origin);
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(body || response.statusText);
      }

      const json = (await response.json()) as { fence?: GeoFenceConfig | null };
      return { fence: json?.fence ?? null };
    } catch (error) {
      startupConfigError = error instanceof Error ? error.message : String(error);
      return null;
    }
  }

  function haversineDistanceM(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const r = 6371_000; // meters
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return r * c;
  }

  function requestGeolocationOnce(options: PositionOptions): Promise<GeolocationPosition> {
    if (!('geolocation' in navigator) || !navigator.geolocation) {
      return Promise.reject(new Error('Geolocation API is not supported'));
    }
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, options);
    });
  }

  function isGeolocationPositionError(error: unknown): error is GeolocationPositionError {
    const record = asRecord(error);
    return (
      Boolean(record) &&
      'code' in record &&
      typeof record.code === 'number'
    );
  }

  function classifyGeolocationError(error: unknown): 'denied' | 'unavailable' | 'unsupported' {
    if (typeof isSecureContext === 'boolean' && !isSecureContext) return 'unsupported';
    if (!('geolocation' in navigator) || !navigator.geolocation) return 'unsupported';
    if (isGeolocationPositionError(error)) return error.code === 1 ? 'denied' : 'unavailable';
    return 'unavailable';
  }

  function formatGeolocationError(error: unknown): string {
    if (isGeolocationPositionError(error)) {
      const codeLabel =
        error.code === 1
          ? 'PERMISSION_DENIED'
          : error.code === 2
            ? 'POSITION_UNAVAILABLE'
            : 'TIMEOUT';
      return `${codeLabel}: ${error.message || '(no message)'}`;
    }
    if (error instanceof Error) return error.message;
    return String(error);
  }

  async function reverseGeocode(origin: string, lat: number, lng: number): Promise<string | null> {
    const url = new URL('/geo/reverse', origin);
    url.searchParams.set('lat', String(lat));
    url.searchParams.set('lng', String(lng));
    url.searchParams.set('lang', 'zh-CN');
    url.searchParams.set('zoom', '18');

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(body || response.statusText);
    }
    const json = (await response.json()) as { formattedAddress?: string; displayName?: string };
    const address = (json.formattedAddress || json.displayName || '').trim();
    return address || null;
  }

  function formatMeters(value: number): string {
    const m = Math.max(0, Math.round(value));
    if (m < 1000) return `${m}m`;
    return `${(m / 1000).toFixed(2)}km`;
  }

  async function runGeoGate(): Promise<void> {
    gateState = 'checking';
    gateTitle = '正在检查位置…';
    gateMessage = '请稍候';
    gateDetails = {};

    // Ensure no websocket connection until the geo-fence check passes.
    disconnect();
    initialize({ serverUrl }, { autoConnect: false });

    try {
      await requestPermissions();
    } catch (error) {
      console.error('[Client] Permission request failed', error);
    }

    const origin = getServerOrigin(serverUrl);
    if (!origin) {
      disconnect();
      gateState = 'error';
      gateTitle = '无法启动';
      gateMessage = '服务器地址错误，请检查 server 参数或本地配置';
      return;
    }

    const fenceResponse = await refreshGeoFenceConfig();
    if (!fenceResponse && startupConfigError) {
      disconnect();
      gateState = 'error';
      gateTitle = '无法启动';
      gateMessage = `无法获取启动配置：${startupConfigError}`;
      return;
    }

    const fence = fenceResponse?.fence ?? null;

    if (BYPASS_GEO_GATE) {
      permissions.update((p) => ({ ...p, geolocation: 'granted' }));
      gateState = 'idle';
      hasStarted = true;
      if (document.visibilityState === 'visible') connectToServer();
      return;
    }

    if (!fence) {
      // If no fence is configured, allow start (no gating).
      gateState = 'idle';
      hasStarted = true;
      if (document.visibilityState === 'visible') connectToServer();
      return;
    }

    try {
      const position = await requestGeolocationOnce({
        enableHighAccuracy: true,
        timeout: 25_000,
        maximumAge: 5_000,
      }).catch(async (error) => {
        const status = classifyGeolocationError(error);
        if (status === 'denied' || status === 'unsupported') throw error;
        return requestGeolocationOnce({
          enableHighAccuracy: false,
          timeout: 35_000,
          maximumAge: 30_000,
        });
      });

      permissions.update((p) => ({ ...p, geolocation: 'granted' }));

      const { latitude, longitude, accuracy } = position.coords;
      const addressPromise = reverseGeocode(origin, latitude, longitude)
        .then((address) => {
          console.info('[Client] Geolocation acquired', {
            latitude,
            longitude,
            accuracy,
            address,
            timestamp: position.timestamp,
          });
          return address;
        })
        .catch((error) => {
          console.warn('[Client] Reverse geocode failed', error);
          console.info('[Client] Geolocation acquired', {
            latitude,
            longitude,
            accuracy,
            address: null,
            timestamp: position.timestamp,
          });
          return null;
        });

      const distanceM = haversineDistanceM(latitude, longitude, fence.center.lat, fence.center.lng);
      gateDetails = { targetAddress: fence.address ?? null, distanceM, rangeM: fence.rangeM };

      if (distanceM > fence.rangeM) {
        // Do not connect to server/manager when outside the fence.
        void addressPromise;
        disconnect();
        gateState = 'blocked';
        gateTitle = '请前往演出位置启动';
        gateMessage = `当前距离演出位置约 ${formatMeters(distanceM)}，允许范围 ${formatMeters(fence.rangeM)}`;
        return;
      }

      gateState = 'idle';
      hasStarted = true;
      if (document.visibilityState === 'visible') connectToServer();
      void addressPromise;
    } catch (error) {
      const status = classifyGeolocationError(error);
      permissions.update((p) => ({ ...p, geolocation: status }));

      disconnect();
      gateState = 'error';
      gateTitle = '无法获取位置';
      gateMessage = status === 'denied' ? '请开启定位权限后重试' : formatGeolocationError(error);
    }
  }

  async function handleStart() {
    // Save server URL
    localStorage.setItem('shugu-server-url', serverUrl);

    // Request fullscreen while the click gesture is still active to maximize success.
    tryFullscreen('click');

    if (BYPASS_GEO_GATE) {
      // Kick off permission prompts within the same user gesture.
      if (!getSDK()) {
        initialize({ serverUrl }, { autoConnect: false });
      }
      const permissionsPromise = requestPermissions().catch((error) => {
        console.warn('[Client] Permission request failed', error);
      });
      const audioPromise = enableAudio().catch((error) => {
        console.warn('[Client] Tone audio enable failed', error);
      });

      permissions.update((p) => ({ ...p, geolocation: 'granted' }));
      gateState = 'idle';
      gateTitle = '';
      gateMessage = '';
      gateDetails = {};
      hasStarted = true;
      if (document.visibilityState === 'visible') connectToServer();
      await Promise.allSettled([permissionsPromise, audioPromise]);
      return;
    }

    try {
      await enableAudio();
    } catch (error) {
      console.warn('[Client] Tone audio enable failed', error);
    }

    if (gateInFlight) return;
    gateInFlight = runGeoGate().finally(() => {
      gateInFlight = null;
    });
    await gateInFlight;
  }

  async function handleRetry() {
    if (retryCooldownS > 0) return;
    startRetryCooldown(3);
    if (gateInFlight) return;
    gateInFlight = runGeoGate().finally(() => {
      gateInFlight = null;
    });
    await gateInFlight;
  }
</script>

<svelte:head>
  <title>Fluffy Foundation</title>
  <meta name="theme-color" content="#0a0a0f" />
</svelte:head>

<div class="app">
  {#if !hasStarted}
    <StartScreen on:start={handleStart} />
    {#if gateState !== 'idle'}
      <GeoGateOverlay
        mode={gateState === 'checking' ? 'checking' : gateState === 'blocked' ? 'blocked' : 'error'}
        title={gateTitle}
        message={gateMessage}
        details={gateDetails}
        {retryCooldownS}
        retryDisabled={gateState === 'checking' || retryCooldownS > 0}
        on:retry={handleRetry}
      />
    {/if}
  {:else}
    <VisualCanvas />
    <PermissionWarning />
  {/if}
</div>

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    overflow: hidden;
    touch-action: none;
    -webkit-overflow-scrolling: none;
  }

  .app {
    width: 100vw;
    height: 100vh;
    overflow: hidden;
    background: #0a0a0f;
  }
</style>
