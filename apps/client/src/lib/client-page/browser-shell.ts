/**
 * Purpose: Browser shell helpers for client page fullscreen and navigation guards.
 */
type StandaloneNavigator = Navigator & { standalone?: boolean };
type FullscreenRequestElement = Element & {
  requestFullscreen?: () => Promise<void> | void;
  webkitRequestFullscreen?: () => Promise<void> | void;
  webkitRequestFullScreen?: () => Promise<void> | void;
  webkitEnterFullscreen?: () => Promise<void> | void;
};

function canScrollHorizontally(element: Element | null, deltaX: number): boolean {
  let current: Element | null = element;

  while (current && current !== document.documentElement) {
    if (current instanceof HTMLElement) {
      const style = window.getComputedStyle(current);
      const overflowX = style.overflowX;
      const isScrollable = overflowX === 'auto' || overflowX === 'scroll' || overflowX === 'overlay';

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

export function handleWheelNavigationGuard(event: WheelEvent): void {
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
export function tryFullscreen(context: 'auto' | 'click'): void {
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
