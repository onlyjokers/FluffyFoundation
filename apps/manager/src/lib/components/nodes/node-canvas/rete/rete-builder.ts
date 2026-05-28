/**
 * Purpose: Build Rete nodes and apply dynamic port constraints.
 */
import { ClassicPreset, type BaseSchemes } from 'rete';
import type { AreaPlugin } from 'rete-area-plugin';
import type {
  ConfigField,
  NodeInstance,
  NodePort,
  PortType,
  Connection as EngineConnection,
} from '$lib/nodes/types';
import type { NodeRegistry } from '@shugu/node-core';
import { CUSTOM_NODE_TYPE_PREFIX } from '$lib/nodes/custom-nodes/store';
import { readCustomNodeState, writeCustomNodeState } from '$lib/nodes/custom-nodes/instance';
import {
  BooleanControl,
  ClientPickerControl,
  ClientSensorValueControl,
  AssetPickerControl,
  LocalAssetPickerControl,
  FilePickerControl,
  NoteControl,
  MidiLearnControl,
  SelectControl,
  TimeRangeControl,
  CurveControl,
} from './rete-controls';
import {
  bestMatchingPort as findBestMatchingPort,
  getPortDefForSocket as findPortDefForSocket,
  inputAllowsMultiple as doesInputAllowMultiple,
  isCompatiblePortType,
} from './rete-port-matching';
import { applyMidiMapRangeConstraintsToReteNodes } from './rete-midi-range-constraints';
import { getCmdAggregatorInputCount, getProxyPortType, shouldRenderInputPort } from './rete-node-build-options';

type ReteSocketMap = Record<string, ClassicPreset.Socket>;
type AnyAreaPlugin = AreaPlugin<BaseSchemes, unknown>;
type AnyRecord = Record<string, unknown>;
type AssetKind = 'audio' | 'image' | 'video' | 'model' | 'any';
type ControlMeta = {
  inline?: boolean;
  controlLabel?: string;
  min?: number;
  max?: number;
  step?: number;
  nodeId?: string;
  nodeType?: string;
  portId?: string;
  integer?: boolean;
};

const withControlMeta = <T extends object>(control: T, meta: ControlMeta): T => {
  Object.assign(control as unknown as AnyRecord, meta);
  return control;
};

const assetKindFromField = (field: ConfigField): AssetKind => {
  const raw = (field as unknown as AnyRecord).assetKind;
  return raw === 'audio' || raw === 'image' || raw === 'video' || raw === 'model' || raw === 'any'
    ? raw
    : 'any';
};

type ReteBuilderOptions = {
  nodeRegistry: NodeRegistry;
  nodeEngine: {
    getNode?: (nodeId: string) => NodeInstance | undefined;
    updateNodeInputValue: (nodeId: string, portId: string, value: unknown) => void;
    updateNodeConfig: (nodeId: string, config: Record<string, unknown>) => void;
  };
  sockets: ReteSocketMap;
  getNumberParamOptions: () => { path: string; label: string }[];
  sendNodeOverride: (nodeId: string, kind: 'input' | 'config', portId: string, value: unknown) => void;
  sendSemanticNodeParams?: (nodeId: string, params: Record<string, unknown>) => boolean;
  sendSemanticNodeInputs?: (nodeId: string, inputValues: Record<string, unknown>) => boolean;
  onNodeActivity?: (nodeId: string, portId: string) => void;
  getAudienceClientCount?: () => number;
  getDisplayClientCount?: () => number;
  getArduinoDeviceCount?: () => number;
  getPrinterDeviceCount?: () => number;
  onClientNodePick?: (nodeId: string, clientId: string) => void;
  onClientNodeSelectInput?: (nodeId: string, portId: 'index' | 'range', value: number) => void;
  onClientNodeRandom?: (nodeId: string, value: boolean) => void;
  isProjectionId?: (id: string) => boolean;
  commitProjectionValue?: (update: {
    nodeId: string;
    kind: 'input' | 'config';
    key: string;
    value: unknown;
  }) => boolean;
};

export type ReteBuilder = {
  nodeLabel: (node: NodeInstance) => string;
  socketFor: (type?: string) => ClassicPreset.Socket;
  buildReteNode: (instance: NodeInstance) => ClassicPreset.Node;
  applyMidiMapRangeConstraints: (
    state: { nodes: NodeInstance[]; connections: EngineConnection[] },
    areaPlugin: AnyAreaPlugin | null | undefined,
    nodeMap: Map<string, ClassicPreset.Node>
  ) => Promise<void>;
  isCompatible: (sourceType: PortType, targetType: PortType) => boolean;
  getPortDefForSocket: (socket: { nodeId: string; side: 'input' | 'output'; key: string }) => NodePort | null;
  bestMatchingPort: (
    ports: NodePort[],
    requiredType: PortType,
    portSide: 'input' | 'output'
  ) => NodePort | null;
  inputAllowsMultiple: (nodeId: string, inputKey: string) => boolean;
};

export function createReteBuilder(opts: ReteBuilderOptions): ReteBuilder {
  const { nodeRegistry, nodeEngine, sockets, sendNodeOverride, getNumberParamOptions } = opts;

  const createLastCommittedTracker = <T>(initial: T) => {
    let lastValue = initial;
    return {
      shouldSkip: (value: T) => value === lastValue,
      accept: (value: T) => {
        lastValue = value;
      },
    };
  };

  const notifyNodeActivity = (nodeId: string, portId: string) => {
    opts.onNodeActivity?.(nodeId, portId);
  };
  const commitUserInputValue = (nodeId: string, portId: string, value: unknown) => {
    nodeEngine.updateNodeInputValue(nodeId, portId, value);
    opts.sendSemanticNodeInputs?.(nodeId, { [portId]: value });
    sendNodeOverride(nodeId, 'input', portId, value);
    notifyNodeActivity(nodeId, portId);
  };
  const commitUserConfigValue = (nodeId: string, key: string, value: unknown) => {
    nodeEngine.updateNodeConfig(nodeId, { [key]: value });
    opts.sendSemanticNodeParams?.(nodeId, { [key]: value });
    sendNodeOverride(nodeId, 'config', key, value);
    notifyNodeActivity(nodeId, key);
  };

  const nodeLabel = (node: NodeInstance): string => {
    if (node.type === 'client-loader') {
      const onlineCount = Math.max(0, Math.floor(Number(opts.getAudienceClientCount?.() ?? 0)));
      return `Client Loader: ${onlineCount} online`;
    }
    if (node.type === 'group-frame') {
      const raw = (node.config as Record<string, unknown>)?.name;
      const name = typeof raw === 'string' && raw.trim() ? raw.trim() : raw ? String(raw) : 'Group';
      return name;
    }
    return nodeRegistry.get(node.type)?.label ?? node.type;
  };

  const socketFor = (type?: string) => {
    if (type && type in sockets) return sockets[type as keyof typeof sockets];
    return sockets.any;
  };

  const buildReteNode = (instance: NodeInstance): ClassicPreset.Node => {
    const def = nodeRegistry.get(instance.type);
    const node = new ClassicPreset.Node(nodeLabel(instance));
    (node as ClassicPreset.Node & { type?: string }).type = instance.type;
    (node as ClassicPreset.Node & { config?: Record<string, unknown> }).config = { ...(instance.config ?? {}) };
    const isEditorProjection = Boolean((instance.config as Record<string, unknown> | undefined)?.editorProjection);
    const commitInputValue = (portId: string, value: unknown): boolean => {
      if (isEditorProjection) {
        const accepted = opts.commitProjectionValue?.({
          nodeId: instance.id,
          kind: 'input',
          key: portId,
          value,
        });
        if (accepted) notifyNodeActivity(instance.id, portId);
        return accepted === true;
      }
      commitUserInputValue(instance.id, portId, value);
      return true;
    };
    const commitConfigValue = (key: string, value: unknown): boolean => {
      if (isEditorProjection) {
        const accepted = opts.commitProjectionValue?.({
          nodeId: instance.id,
          kind: 'config',
          key,
          value,
        });
        if (accepted) notifyNodeActivity(instance.id, key);
        return accepted === true;
      }
      commitUserConfigValue(instance.id, key, value);
      return true;
    };
    const configFields = def?.configSchema ?? [];
    const configFieldByKey = new Map<string, ConfigField>();
    for (const field of configFields) configFieldByKey.set(field.key, field);
    const inputControlKeys = new Set<string>();
    node.id = instance.id;

    const proxyPortType = getProxyPortType(instance);
    const cmdAggInputCount = getCmdAggregatorInputCount(instance);

    for (const input of def?.inputs ?? []) {
      if (!shouldRenderInputPort(input, cmdAggInputCount)) continue;
      // Allow users to attempt multiple links; NodeEngine enforces the global rule that each input
      // port can only be connected once (and shows the error message on violation).
      const inp = new ClassicPreset.Input(
        socketFor(proxyPortType ?? input.type),
        input.label ?? input.id,
        true
      );

      const hasDefault = input.defaultValue !== undefined;
      const isPrimitive =
        input.type === 'number' || input.type === 'string' || input.type === 'boolean' || input.type === 'pulse';
      const isSink = input.kind === 'sink';
      const configField = configFieldByKey.get(input.id);
      const isSelectConfig = configField?.type === 'select';
      const configValue = instance.config?.[input.id];
      const current = instance.inputValues?.[input.id];
      const derivedDefault = hasDefault ? input.defaultValue : configField?.defaultValue;
      const isSelectableTargetNode =
        instance.type === 'client-loader' ||
        instance.type === 'display-object' ||
        instance.type === 'arduino-object' ||
        instance.type === 'printer-object';
      const forceInlineInput =
        isSelectableTargetNode && (input.id === 'index' || input.id === 'range' || input.id === 'random');
      const hasInitial =
        forceInlineInput || current !== undefined || configValue !== undefined || derivedDefault !== undefined;
      if (hasInitial && isPrimitive && !isSink && !isSelectConfig) {
        if (input.type === 'number') {
          const min =
            typeof input.min === 'number'
              ? input.min
              : typeof configField?.min === 'number'
                ? configField.min
                : undefined;
          const max =
            isSelectableTargetNode && (input.id === 'index' || input.id === 'range')
              ? (() => {
                  const raw =
                    instance.type === 'display-object'
                      ? opts.getDisplayClientCount?.()
                      : instance.type === 'arduino-object'
                        ? opts.getArduinoDeviceCount?.()
                        : instance.type === 'printer-object'
                          ? opts.getPrinterDeviceCount?.()
                          : opts.getAudienceClientCount?.();
                  const count = Math.floor(Number(raw));
                  return Number.isFinite(count) && count > 0 ? count : undefined;
                })()
              : typeof input.max === 'number'
              ? input.max
              : typeof configField?.max === 'number'
                ? configField.max
                : undefined;
          const step =
            typeof input.step === 'number'
              ? input.step
              : typeof configField?.step === 'number'
                ? configField.step
                : undefined;

          const initial =
            typeof current === 'number'
              ? current
              : typeof configValue === 'number'
                ? configValue
                : forceInlineInput
                  ? 1
                  : Number(derivedDefault ?? 0);

          const clamp = (value: number) => {
            let next = value;
            if (typeof min === 'number' && Number.isFinite(min)) next = Math.max(min, next);
            if (typeof max === 'number' && Number.isFinite(max)) next = Math.min(max, next);
            return next;
          };

          inp.addControl(
            (() => {
              let lastValue = clamp(initial);
              const control = new ClassicPreset.InputControl('number', {
                initial: lastValue,
                change: (value) => {
                  const next = typeof value === 'number' ? clamp(value) : value;
                  if (next === lastValue) return;
                  const accepted = commitInputValue(input.id, next);
                  if (!accepted) return;
                  if (typeof next === 'number') lastValue = next;
                  if (
                    !isEditorProjection &&
                    isSelectableTargetNode &&
                    (input.id === 'index' || input.id === 'range') &&
                    typeof next === 'number'
                  ) {
                    opts.onClientNodeSelectInput?.(instance.id, input.id, next);
                  }
                },
              });
              withControlMeta(control, {
                inline: true,
                min,
                max,
                step,
                nodeId: instance.id,
                nodeType: instance.type,
                portId: input.id,
              });
              if (isSelectableTargetNode && (input.id === 'index' || input.id === 'range')) {
                withControlMeta(control, { integer: true });
              }
              return control;
            })()
          );

          if (
            !isEditorProjection &&
            configField &&
            instance.config?.[input.id] === undefined &&
            configField.defaultValue !== undefined
          ) {
            nodeEngine.updateNodeConfig(instance.id, { [input.id]: clamp(initial) });
          }
        } else if (input.type === 'string') {
          const initial =
            typeof current === 'string'
              ? current
              : typeof configValue === 'string'
                ? configValue
                : String(derivedDefault ?? '');
          let lastValue = initial;
          const control = new ClassicPreset.InputControl('text', {
            initial,
            change: (value) => {
              if (value === lastValue) return;
              const accepted = commitInputValue(input.id, value);
              if (accepted) lastValue = value;
            },
          });
          withControlMeta(control, { inline: true });
          inp.addControl(control);
        } else if (input.type === 'boolean' || input.type === 'pulse') {
          const initial =
            typeof current === 'boolean'
              ? current
              : typeof configValue === 'boolean'
                ? configValue
                : forceInlineInput
                  ? false
                  : Boolean(derivedDefault);
          let lastValue = initial;
          const control = new BooleanControl({
            label: input.label,
            initial,
            change: (value) => {
              const isCustomGate =
                String(instance.type).startsWith(CUSTOM_NODE_TYPE_PREFIX) && input.id === 'gate';
              if (!isCustomGate && value === lastValue) return;
              const accepted = commitInputValue(input.id, value);
              if (!accepted) return;
              lastValue = value;
              if (!isEditorProjection && isSelectableTargetNode && input.id === 'random') {
                opts.onClientNodeRandom?.(instance.id, value);
              }
              if (!isEditorProjection && isCustomGate) {
                const state = readCustomNodeState(instance.config ?? {});
                if (state) {
                  const nextConfig = writeCustomNodeState(instance.config ?? {}, {
                    ...state,
                    manualGate: Boolean(value),
                  });
                  nodeEngine.updateNodeConfig(instance.id, nextConfig);
                  opts.sendSemanticNodeParams?.(instance.id, nextConfig);
                  notifyNodeActivity(instance.id, 'gate');
                }
              }
            },
          });
          if (input.buttonLabel || input.type === 'pulse') {
            control.button = true;
            control.buttonLabel = input.buttonLabel ?? input.label;
          } else if (instance.type === 'url-session' && input.id === 'trigger') {
            control.button = true;
            control.buttonLabel = 'New URL';
          }
          withControlMeta(control, { inline: true });
          inp.addControl(control);
        }
        inp.showControl = true;
        inputControlKeys.add(input.id);
      }

      if (!isSink && input.type === 'color') {
        const initial =
          typeof current === 'string'
            ? String(current)
            : typeof instance.config?.[input.id] === 'string'
              ? String(instance.config[input.id])
              : String(derivedDefault ?? '#ffffff');
        const tracker = createLastCommittedTracker(initial);
        inp.addControl(
          (() => {
            const control = new ClassicPreset.InputControl('text', {
              initial,
              change: (value) => {
                if (tracker.shouldSkip(value)) return;
                const accepted = commitInputValue(input.id, value);
                if (accepted) tracker.accept(value);
              },
            });
            withControlMeta(control, { inline: true });
            return control;
          })()
        );
        inp.showControl = true;
        inputControlKeys.add(input.id);
      }

      if (!isSink && configField?.type === 'select') {
        const initial =
          typeof current === 'string'
            ? String(current)
            : typeof instance.config?.[input.id] === 'string'
              ? String(instance.config[input.id])
              : String(configField.defaultValue ?? '');
        let lastValue = initial;
        const control = new SelectControl({
          initial,
          options: configField.options ?? [],
          change: (value) => {
            if (value === lastValue) return;
            const accepted = commitInputValue(input.id, value);
            if (accepted) lastValue = value;
          },
        });
        withControlMeta(control, { inline: true });
        inp.addControl(control);
        inp.showControl = true;
        inputControlKeys.add(input.id);

        if (
          !isEditorProjection &&
          instance.config?.[input.id] === undefined &&
          configField.defaultValue !== undefined
        ) {
          nodeEngine.updateNodeConfig(instance.id, { [input.id]: initial });
        }
      }

      node.addInput(input.id, inp);
    }

    for (const output of def?.outputs ?? []) {
      const out = new ClassicPreset.Output(socketFor(proxyPortType ?? output.type), output.label ?? output.id);
      if (instance.type === 'proc-client-sensors') {
        (out as unknown as AnyRecord).control = new ClientSensorValueControl({ nodeId: instance.id, portId: output.id });
      }
      node.addOutput(output.id, out);
    }

    const configDefaultPatch: Record<string, unknown> = {};
    for (const field of def?.configSchema ?? []) {
      if (inputControlKeys.has(field.key)) continue;
      if (instance.config?.[field.key] !== undefined || field.defaultValue === undefined) continue;
      configDefaultPatch[field.key] = field.defaultValue;
    }
    if (!isEditorProjection && Object.keys(configDefaultPatch).length > 0) {
      nodeEngine.updateNodeConfig(instance.id, configDefaultPatch);
    }

    for (const field of def?.configSchema ?? []) {
      if (inputControlKeys.has(field.key)) continue;
      const key = field.key;
      const current = instance.config?.[key] ?? field.defaultValue;
      if (field.type === 'select') {
        let lastValue = String(current ?? '');
        node.addControl(
          key,
          new SelectControl({
            label: field.label,
            initial: lastValue,
            options: field.options ?? [],
            change: (value) => {
              if (value === lastValue) return;
              const accepted = commitConfigValue(key, value);
              if (accepted) lastValue = value;
            },
          })
        );
      } else if (field.type === 'boolean') {
        const initial = (() => {
          const coerceBoolean = (value: unknown): boolean | null => {
            if (typeof value === 'boolean') return value;
            if (typeof value === 'number' && Number.isFinite(value)) return value >= 0.5;
            if (typeof value === 'string') {
              const s = value.trim().toLowerCase();
              if (s === 'true' || s === '1' || s === 'yes' || s === 'on') return true;
              if (s === 'false' || s === '0' || s === 'no' || s === 'off') return false;
            }
            return null;
          };

          const fromCurrent = coerceBoolean(current);
          if (fromCurrent !== null) return fromCurrent;

          const fallback = coerceBoolean(field.defaultValue);
          if (fallback !== null) return fallback;
          return false;
        })();

        let lastValue = initial;
        node.addControl(
          key,
          new BooleanControl({
            label: field.label,
            initial,
            change: (value) => {
              const next = Boolean(value);
              if (next === lastValue) return;
              const accepted = commitConfigValue(key, next);
              if (accepted) lastValue = next;
            },
          })
        );
      } else if (field.type === 'number') {
        const clamp = (value: number) => {
          let next = value;
          const min = typeof field.min === 'number' ? field.min : undefined;
          const max = typeof field.max === 'number' ? field.max : undefined;
          if (typeof min === 'number' && Number.isFinite(min)) next = Math.max(min, next);
          if (typeof max === 'number' && Number.isFinite(max)) next = Math.min(max, next);
          return next;
        };
        let lastValue = clamp(Number(current ?? 0));

        const control = new ClassicPreset.InputControl('number', {
          initial: lastValue,
          change: (value) => {
            const next = typeof value === 'number' ? clamp(value) : value;
            if (next === lastValue) return;
            const accepted = commitConfigValue(key, next);
            if (accepted && typeof next === 'number') lastValue = next;
          },
        });
        withControlMeta(control, {
          controlLabel: field.label,
          min: field.min,
          max: field.max,
          step: field.step,
        });
        node.addControl(key, control);
      } else if (field.type === 'client-picker') {
        const tracker = createLastCommittedTracker(String(current ?? ''));
        const control = new ClientPickerControl({
          label: field.label,
          initial: String(current ?? ''),
          change: (value) => {
            if (tracker.shouldSkip(value)) return;
            const accepted = commitConfigValue(key, value);
            if (!accepted) return;
            tracker.accept(value);
            if (!isEditorProjection && instance.type === 'client-loader') {
              opts.onClientNodePick?.(instance.id, value);
            }
          },
        });
        withControlMeta(control, { nodeId: instance.id, nodeType: instance.type });
        node.addControl(key, control);
      } else if (field.type === 'asset-picker') {
        const tracker = createLastCommittedTracker(String(current ?? ''));
        const control = new AssetPickerControl({
          label: field.label,
          initial: String(current ?? ''),
          assetKind: assetKindFromField(field),
          change: (value) => {
            if (tracker.shouldSkip(value)) return;
            const accepted = commitConfigValue(key, value);
            if (accepted) tracker.accept(value);
          },
        });
        node.addControl(key, control);
      } else if (field.type === 'local-asset-picker') {
        const tracker = createLastCommittedTracker(String(current ?? ''));
        const control = new LocalAssetPickerControl({
          label: field.label,
          initial: String(current ?? ''),
          assetKind: assetKindFromField(field),
          change: (value) => {
            if (tracker.shouldSkip(value)) return;
            const accepted = commitConfigValue(key, value);
            if (accepted) tracker.accept(value);
          },
        });
        node.addControl(key, control);
      } else if (field.type === 'param-path') {
        const tracker = createLastCommittedTracker(String(current ?? ''));
        node.addControl(
          key,
          new SelectControl({
            label: field.label,
            placeholder: 'Select parameter…',
            initial: String(current ?? ''),
            options: getNumberParamOptions().map((p) => ({
              value: p.path,
              label: `${p.label} (${p.path})`,
            })),
            change: (value) => {
              if (tracker.shouldSkip(value)) return;
              const accepted = commitConfigValue(key, value);
              if (accepted) tracker.accept(value);
            },
          })
        );
      } else if (field.type === 'file') {
        const tracker = createLastCommittedTracker(typeof current === 'string' ? current : '');
        node.addControl(
          key,
          new FilePickerControl({
            label: field.label,
            initial: typeof current === 'string' ? current : '',
            accept: field.accept,
            buttonLabel: field.buttonLabel,
            change: (value) => {
              if (tracker.shouldSkip(value)) return;
              const accepted = commitConfigValue(key, value);
              if (accepted) tracker.accept(value);
            },
          })
        );
      } else if (field.type === 'midi-source') {
        node.addControl(key, new MidiLearnControl({ nodeId: instance.id, label: field.label }));
      } else if (field.type === 'time-range') {
        const raw = current as Record<string, unknown>;
        const startSec =
          typeof raw?.startSec === 'number' && Number.isFinite(raw.startSec) ? raw.startSec : 0;
        const endSec = typeof raw?.endSec === 'number' && Number.isFinite(raw.endSec) ? raw.endSec : -1;

        const control = new TimeRangeControl({
          label: field.label,
          initial: { startSec, endSec, cursorSec: typeof raw?.cursorSec === 'number' ? raw.cursorSec : -1 },
          min: field.min,
          max: field.max,
          step: field.step,
          change: (value) => {
            // Special: asset timeline controls are UI helpers which update input ports (so they are connectable/modulatable).
            const timelineNodeTypes = new Set([
              'load-audio-from-assets',
              'load-video-from-assets',
              'load-audio-from-local',
              'load-video-from-local',
            ]);
            if (timelineNodeTypes.has(instance.type)) {
              const valueRecord = value as Record<string, unknown>;
              const nextStart = typeof valueRecord?.startSec === 'number' ? valueRecord.startSec : 0;
              const nextEnd = typeof valueRecord?.endSec === 'number' ? valueRecord.endSec : -1;
              const nextCursor = valueRecord?.cursorSec;

              commitInputValue('startSec', nextStart);
              commitInputValue('endSec', nextEnd);

              if (typeof nextCursor === 'number' && Number.isFinite(nextCursor)) {
                commitInputValue('cursorSec', nextCursor);
              }

              // Keep config in sync for persistence/debugging (not used by runtime).
              if (isEditorProjection) commitConfigValue(key, value);
              else nodeEngine.updateNodeConfig(instance.id, { [key]: value });
              return;
            }

            commitConfigValue(key, value);
          },
        });
        control.nodeId = instance.id;
        control.nodeType = instance.type;
        control.configKey = key;
        node.addControl(key, control);
      } else if (field.type === 'curve') {
        const rawCurve = current;
        // Cubic bezier: [x1, y1, x2, y2]
        const initial: [number, number, number, number] = Array.isArray(rawCurve) && rawCurve.length === 4
          ? rawCurve as [number, number, number, number]
          : [0.25, 0.1, 0.25, 1.0];
        const curveControl = new CurveControl({
          label: field.label,
          initial,
          nodeId: instance.id,
          change: (value) => {
            commitConfigValue(key, value);
          },
        });
        withControlMeta(curveControl, { nodeId: instance.id, nodeType: instance.type });
        node.addControl(key, curveControl);
      } else if ((instance.type === 'note' || instance.type === 'ai-note') && key === 'text') {
        const tracker = createLastCommittedTracker(typeof current === 'string' ? current : String(current ?? ''));
        const noteControl = new NoteControl({
          placeholder: instance.type === 'ai-note' ? 'Type an AI hint…' : 'Type a note…',
          initial: typeof current === 'string' ? current : String(current ?? ''),
          change: (value) => {
            if (tracker.shouldSkip(value)) return;
            const accepted = commitConfigValue(key, value);
            if (accepted) tracker.accept(value);
          },
        });
        noteControl.nodeId = instance.id;
        node.addControl(key, noteControl);
      } else {
        const tracker = createLastCommittedTracker(String(current ?? ''));
        const control = new ClassicPreset.InputControl('text', {
          initial: String(current ?? ''),
          change: (value) => {
            if (tracker.shouldSkip(value)) return;
            const accepted = commitConfigValue(key, value);
            if (accepted) tracker.accept(value);
          },
        });
        withControlMeta(control, { controlLabel: field.label });
        node.addControl(key, control);
      }
    }

    (node as unknown as AnyRecord).position = [instance.position.x, instance.position.y];
    return node;
  };

  const applyMidiMapRangeConstraints = async (
    state: { nodes: NodeInstance[]; connections: EngineConnection[] },
    areaPlugin: AnyAreaPlugin | null | undefined,
    nodeMap: Map<string, ClassicPreset.Node>
  ) => {
    await applyMidiMapRangeConstraintsToReteNodes(
      {
        nodeRegistry,
        updateNodeConfig: nodeEngine.updateNodeConfig,
      },
      state,
      areaPlugin,
      nodeMap
    );
  };

  const isCompatible = isCompatiblePortType;

  const getEngineNode = (nodeId: string): NodeInstance | undefined => nodeEngine.getNode?.(nodeId);

  const getPortDefForSocket = (socket: { nodeId: string; side: 'input' | 'output'; key: string }): NodePort | null => {
    if (opts.isProjectionId?.(String(socket.nodeId ?? ''))) return null;
    return findPortDefForSocket(nodeRegistry, getEngineNode, socket);
  };

  const bestMatchingPort = (
    ports: NodePort[],
    requiredType: PortType,
    portSide: 'input' | 'output'
  ): NodePort | null => {
    return findBestMatchingPort(ports, requiredType, portSide);
  };

  const inputAllowsMultiple = (nodeId: string, inputKey: string): boolean => {
    if (opts.isProjectionId?.(String(nodeId ?? ''))) return false;
    return doesInputAllowMultiple(nodeRegistry, getEngineNode, nodeId, inputKey);
  };

  return {
    nodeLabel,
    socketFor,
    buildReteNode,
    applyMidiMapRangeConstraints,
    isCompatible,
    getPortDefForSocket,
    bestMatchingPort,
    inputAllowsMultiple,
  };
}
