// Purpose: Regression coverage for group marquee selection behavior.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { writable } from 'svelte/store';

import { createGroupMarqueeController } from './group-marquee';

function pointerEvent(type: string, patch: Partial<PointerEvent> = {}): PointerEvent {
  return {
    type,
    pointerId: 1,
    clientX: 0,
    clientY: 0,
    button: 0,
    preventDefault: () => undefined,
    stopPropagation: () => undefined,
    ...patch,
  } as PointerEvent;
}

test('marquee selection includes nodes from fully enclosed group frames', () => {
  const listeners = new Map<string, (event: PointerEvent) => void>();
  const prevWindow = globalThis.window;
  (globalThis as typeof globalThis & { window: unknown }).window = {
    addEventListener: (type: string, handler: (event: PointerEvent) => void) => {
      listeners.set(type, handler);
    },
    removeEventListener: (type: string) => {
      listeners.delete(type);
    },
  };

  try {
    let selected = new Set<string>();
    let completed = 0;
    const controller = createGroupMarqueeController({
      marqueeRect: writable(null),
      getContainer: () =>
        ({
          getBoundingClientRect: () => ({ left: 0, top: 0 }),
        }) as HTMLDivElement,
      getAdapter: () =>
        ({
          getViewportTransform: () => ({ k: 1, tx: 0, ty: 0 }),
          getNodesInRect: () => ['outside-node'],
        }) as never,
      getGroupFrames: () => [
        {
          group: { id: 'group:1', nodeIds: ['inside-a', 'inside-b'] },
          left: 20,
          top: 30,
          width: 200,
          height: 120,
        },
      ],
      setSelectedNodeIds: (ids) => {
        selected = ids;
      },
      onSelectionComplete: () => {
        completed += 1;
      },
    });

    controller.start(pointerEvent('pointerdown', { clientX: 0, clientY: 0 }));
    listeners.get('pointermove')?.(pointerEvent('pointermove', { clientX: 300, clientY: 220 }));
    listeners.get('pointerup')?.(pointerEvent('pointerup', { clientX: 300, clientY: 220 }));

    assert.deepEqual(Array.from(selected).sort(), ['inside-a', 'inside-b', 'outside-node']);
    assert.equal(completed, 1);
  } finally {
    (globalThis as typeof globalThis & { window: unknown }).window = prevWindow;
  }
});
