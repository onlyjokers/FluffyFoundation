/**
 * Purpose: Pure NodePickerOverlay change helpers that keep local UI state and parent controller state in sync.
 */

export type PickerOverlayChangeHandlers = {
  onQueryChange?: (value: string) => void;
  onSelectedCategoryChange?: (value: string) => void;
};

export function updatePickerQuery(value: string, handlers: PickerOverlayChangeHandlers = {}): string {
  handlers.onQueryChange?.(value);
  return value;
}

export function updatePickerCategory(value: string, handlers: PickerOverlayChangeHandlers = {}): string {
  handlers.onSelectedCategoryChange?.(value);
  return value;
}
