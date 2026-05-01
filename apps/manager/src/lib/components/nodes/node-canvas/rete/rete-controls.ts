/**
 * Purpose: Custom Rete control models used by the node canvas renderer.
 */
import { ClassicPreset } from 'rete';

export type SelectOption = { value: string; label: string };

export class SelectControl extends ClassicPreset.Control {
  controlType = 'select' as const;
  label?: string;
  placeholder?: string;
  options: SelectOption[];
  value: string;
  readonly: boolean;
  private onChange?: (value: string) => void;

  constructor(opts: {
    label?: string;
    placeholder?: string;
    initial?: string;
    options?: SelectOption[];
    readonly?: boolean;
    change?: (value: string) => void;
  }) {
    super();
    this.label = opts.label;
    this.placeholder = opts.placeholder;
    this.options = opts.options ?? [];
    this.value = opts.initial ?? '';
    this.readonly = Boolean(opts.readonly);
    this.onChange = opts.change;
  }

  setOptions(options: SelectOption[]): void {
    this.options = options;
  }

  setValue(value: string): void {
    if (this.readonly) return;
    this.value = value;
    this.onChange?.(value);
  }
}

export class BooleanControl extends ClassicPreset.Control {
  controlType = 'boolean' as const;
  label?: string;
  // Optional UI affordance: render as a momentary button instead of a toggle.
  button?: boolean;
  buttonLabel?: string;
  value: boolean;
  readonly: boolean;
  private onChange?: (value: boolean) => void;

  constructor(opts: {
    label?: string;
    initial?: boolean;
    readonly?: boolean;
    change?: (v: boolean) => void;
  }) {
    super();
    this.label = opts.label;
    this.value = Boolean(opts.initial);
    this.readonly = Boolean(opts.readonly);
    this.onChange = opts.change;
  }

  setValue(value: boolean): void {
    if (this.readonly) return;
    this.value = Boolean(value);
    this.onChange?.(this.value);
  }
}

export class ClientPickerControl extends ClassicPreset.Control {
  controlType = 'client-picker' as const;
  label?: string;
  value: string;
  readonly: boolean;
  private onChange?: (value: string) => void;

  constructor(opts: {
    label?: string;
    initial?: string;
    readonly?: boolean;
    change?: (value: string) => void;
  }) {
    super();
    this.label = opts.label;
    this.value = opts.initial ?? '';
    this.readonly = Boolean(opts.readonly);
    this.onChange = opts.change;
  }

  setValue(value: string): void {
    if (this.readonly) return;
    this.value = value;
    this.onChange?.(value);
  }
}

export class AssetPickerControl extends ClassicPreset.Control {
  controlType = 'asset-picker' as const;
  label?: string;
  value: string;
  assetKind: 'audio' | 'image' | 'video' | 'model' | 'any';
  readonly: boolean;
  private onChange?: (value: string) => void;

  constructor(opts: {
    label?: string;
    initial?: string;
    assetKind?: 'audio' | 'image' | 'video' | 'model' | 'any';
    readonly?: boolean;
    change?: (value: string) => void;
  }) {
    super();
    this.label = opts.label;
    this.value = opts.initial ?? '';
    this.assetKind = opts.assetKind ?? 'any';
    this.readonly = Boolean(opts.readonly);
    this.onChange = opts.change;
  }

  setValue(value: string): void {
    if (this.readonly) return;
    this.value = value;
    this.onChange?.(value);
  }
}

export class LocalAssetPickerControl extends ClassicPreset.Control {
  controlType = 'local-asset-picker' as const;
  label?: string;
  value: string;
  assetKind: 'audio' | 'image' | 'video' | 'model' | 'any';
  readonly: boolean;
  private onChange?: (value: string) => void;

  constructor(opts: {
    label?: string;
    initial?: string;
    assetKind?: 'audio' | 'image' | 'video' | 'model' | 'any';
    readonly?: boolean;
    change?: (value: string) => void;
  }) {
    super();
    this.label = opts.label;
    this.value = opts.initial ?? '';
    this.assetKind = opts.assetKind ?? 'any';
    this.readonly = Boolean(opts.readonly);
    this.onChange = opts.change;
  }

  setValue(value: string): void {
    if (this.readonly) return;
    this.value = value;
    this.onChange?.(value);
  }
}

export class FilePickerControl extends ClassicPreset.Control {
  controlType = 'file-picker' as const;
  label?: string;
  value: string;
  accept?: string;
  buttonLabel?: string;
  readonly: boolean;
  private onChange?: (value: string) => void;

  constructor(opts: {
    label?: string;
    initial?: string;
    accept?: string;
    buttonLabel?: string;
    readonly?: boolean;
    change?: (value: string) => void;
  }) {
    super();
    this.label = opts.label;
    this.value = opts.initial ?? '';
    this.accept = opts.accept;
    this.buttonLabel = opts.buttonLabel;
    this.readonly = Boolean(opts.readonly);
    this.onChange = opts.change;
  }

  setValue(value: string): void {
    if (this.readonly) return;
    this.value = value;
    this.onChange?.(value);
  }
}

export class NoteControl extends ClassicPreset.Control {
  controlType = 'note' as const;
  label?: string;
  placeholder?: string;
  value: string;
  readonly: boolean;
  nodeId?: string;
  private onChange?: (value: string) => void;

  constructor(opts: {
    label?: string;
    placeholder?: string;
    initial?: string;
    readonly?: boolean;
    change?: (value: string) => void;
  }) {
    super();
    this.label = opts.label;
    this.placeholder = opts.placeholder;
    this.value = opts.initial ?? '';
    this.readonly = Boolean(opts.readonly);
    this.onChange = opts.change;
  }

  setValue(value: string): void {
    if (this.readonly) return;
    this.value = value;
    this.onChange?.(value);
  }
}

export type TimeRangeValue = { startSec: number; endSec: number; cursorSec?: number };

export class TimeRangeControl extends ClassicPreset.Control {
  controlType = 'time-range' as const;
  label?: string;
  value: TimeRangeValue;
  min: number;
  max?: number;
  step: number;
  readonly: boolean;
  nodeId?: string;
  nodeType?: string;
  configKey?: string;
  private onChange?: (value: TimeRangeValue) => void;

  constructor(opts: {
    label?: string;
    initial?: TimeRangeValue;
    min?: number;
    max?: number;
    step?: number;
    readonly?: boolean;
    change?: (value: TimeRangeValue) => void;
  }) {
    super();
    this.label = opts.label;
    this.value = opts.initial ?? { startSec: 0, endSec: -1 };
    this.min = typeof opts.min === 'number' && Number.isFinite(opts.min) ? opts.min : 0;
    this.max = typeof opts.max === 'number' && Number.isFinite(opts.max) ? opts.max : undefined;
    this.step = typeof opts.step === 'number' && Number.isFinite(opts.step) ? opts.step : 0.01;
    this.readonly = Boolean(opts.readonly);
    this.onChange = opts.change;
  }

  setValue(value: TimeRangeValue): void {
    if (this.readonly) return;
    this.value = value;
    this.onChange?.(value);
  }
}

export class ClientSensorValueControl extends ClassicPreset.Control {
  controlType = 'client-sensor-value' as const;
  nodeId: string;
  portId: string;

  constructor(opts: { nodeId: string; portId: string }) {
    super();
    this.nodeId = opts.nodeId;
    this.portId = opts.portId;
  }
}

export class MidiLearnControl extends ClassicPreset.Control {
  controlType = 'midi-learn' as const;
  nodeId: string;
  label?: string;

  constructor(opts: { nodeId: string; label?: string }) {
    super();
    this.nodeId = opts.nodeId;
    this.label = opts.label;
  }
}

// Cubic bezier value: [x1, y1, x2, y2] where start is (0,0) and end is (1,1)
export type BezierValue = [number, number, number, number];

export class CurveControl extends ClassicPreset.Control {
  controlType = 'curve' as const;
  label?: string;
  value: BezierValue;
  readonly: boolean;
  nodeId?: string;
  private onChange?: (value: BezierValue) => void;

  constructor(opts: {
    label?: string;
    initial?: BezierValue;
    readonly?: boolean;
    nodeId?: string;
    change?: (value: BezierValue) => void;
  }) {
    super();
    this.label = opts.label;
    this.nodeId = opts.nodeId;
    this.value = opts.initial ?? [0.25, 0.1, 0.25, 1.0];
    this.readonly = Boolean(opts.readonly);
    this.onChange = opts.change;
  }

  setValue(value: BezierValue): void {
    if (this.readonly) return;
    this.value = value;
    this.onChange?.(value);
  }
}
