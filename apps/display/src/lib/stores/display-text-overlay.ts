/**
 * Purpose: Compute Display text overlay state for operator and AI text output.
 */
import type { ShowTextPayload } from '@shugu/protocol';

export type TextOverlayState = {
  visible: boolean;
  text: string;
  color: string;
  backgroundColor: string;
  duration?: number;
};

const DEFAULT_TEXT_COLOR = '#ffffff';
const DEFAULT_TEXT_BACKGROUND = 'rgba(0, 0, 0, 0.72)';

function finitePositiveNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

export function createClearedDisplayTextOverlayState(): TextOverlayState {
  return {
    visible: false,
    text: '',
    color: DEFAULT_TEXT_COLOR,
    backgroundColor: DEFAULT_TEXT_BACKGROUND,
    duration: undefined,
  };
}

export function createDisplayTextOverlayState(payload: ShowTextPayload): TextOverlayState {
  const text = typeof payload.text === 'string' ? payload.text.trim() : '';
  if (!text) return createClearedDisplayTextOverlayState();

  const color = typeof payload.color === 'string' && payload.color.trim() ? payload.color.trim() : DEFAULT_TEXT_COLOR;
  const backgroundColor =
    typeof payload.backgroundColor === 'string' && payload.backgroundColor.trim()
      ? payload.backgroundColor.trim()
      : DEFAULT_TEXT_BACKGROUND;
  const duration = finitePositiveNumber(payload.duration);

  return {
    visible: true,
    text,
    color,
    backgroundColor,
    duration,
  };
}
