/**
 * Purpose: Build Rete nodes and apply dynamic port constraints.
 */
import { get } from 'svelte/store';
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
import { audienceClients } from '$lib/stores/manager';
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
  onNodeActivity?: (nodeId: string, portId: string) => void;
  onClientNodePick?: (nodeId: string, clientId: string) => void;
  onClientNodeSelectInput?: (nodeId: string, portId: 'index' | 'range', value: number) => void;
  onClientNodeRandom?: (nodeId: string, value: boolean) => void;
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

  const notifyNodeActivity = (nodeId: string, portId: string) => {
    opts.onNodeActivity?.(nodeId, portId);
  };

  const nodeLabel = (node: NodeInstance): string => {
    if (node.type === 'client-object') {
      const onlineCount = get(audienceClients).length;
      return `Client: ${onlineCount} online`;
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
      const isPrimitive = input.type === 'number' || input.type === 'string' || input.type === 'boolean';
      const isSink = input.kind === 'sink';
      const configField = configFieldByKey.get(input.id);
      const isSelectConfig = configField?.type === 'select';
      const configValue = instance.config?.[input.id];
      const current = instance.inputValues?.[input.id];
      const derivedDefault = hasDefault ? input.defaultValue : configField?.defaultValue;
      const forceInlineInput =
        instance.type === 'client-object' && (input.id === 'index' || input.id === 'range' || input.id === 'random');
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
            typeof input.max === 'number'
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
              const control = new ClassicPreset.InputControl('number', {
                initial: clamp(initial),
                change: (value) => {
                  const next = typeof value === 'number' ? clamp(value) : value;
                  nodeEngine.updateNodeInputValue(instance.id, input.id, next);
                  sendNodeOverride(instance.id, 'input', input.id, next);
                  notifyNodeActivity(instance.id, input.id);
                  if (
                    instance.type === 'client-object' &&
                    (input.id === 'index' || input.id === 'range') &&
                    typeof next === 'number'
                  ) {
                    opts.onClientNodeSelectInput?.(instance.id, input.id, next);
                  }
                },
              });
              control.inline = true;
              control.min = min;
              control.max = max;
              control.step = step;
              control.nodeId = instance.id;
              control.nodeType = instance.type;
              control.portId = input.id;
              if (instance.type === 'client-object' && (input.id === 'index' || input.id === 'range')) {
                control.integer = true;
              }
              return control;
            })()
          );

          if (configField && instance.config?.[input.id] === undefined && configField.defaultValue !== undefined) {
            nodeEngine.updateNodeConfig(instance.id, { [input.id]: clamp(initial) });
          }
        } else if (input.type === 'string') {
          const initial =
            typeof current === 'string'
              ? current
              : typeof configValue === 'string'
                ? configValue
                : String(derivedDefault ?? '');
          const control = new ClassicPreset.InputControl('text', {
            initial,
            change: (value) => {
              nodeEngine.updateNodeInputValue(instance.id, input.id, value);
              sendNodeOverride(instance.id, 'input', input.id, value);
              notifyNodeActivity(instance.id, input.id);
            },
          });
          control.inline = true;
          inp.addControl(control);
        } else if (input.type === 'boolean') {
          const initial =
            typeof current === 'boolean'
              ? current
              : typeof configValue === 'boolean'
                ? configValue
                : forceInlineInput
                  ? false
                  : Boolean(derivedDefault);
          const control = new BooleanControl({
            initial,
            change: (value) => {
              nodeEngine.updateNodeInputValue(instance.id, input.id, value);
              sendNodeOverride(instance.id, 'input', input.id, value);
              notifyNodeActivity(instance.id, input.id);
              if (instance.type === 'client-object' && input.id === 'random') {
                opts.onClientNodeRandom?.(instance.id, value);
              }
              if (String(instance.type).startsWith(CUSTOM_NODE_TYPE_PREFIX) && input.id === 'gate') {
                const state = readCustomNodeState(instance.config ?? {});
                if (state) {
                  nodeEngine.updateNodeConfig(
                    instance.id,
                    writeCustomNodeState(instance.config ?? {}, { ...state, manualGate: Boolean(value) })
                  );
                }
              }
            },
          });
          control.inline = true;
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
        inp.addControl(
          (() => {
            const control = new ClassicPreset.InputControl('text', {
              initial,
              change: (value) => {
                nodeEngine.updateNodeInputValue(instance.id, input.id, value);
                sendNodeOverride(instance.id, 'input', input.id, value);
                notifyNodeActivity(instance.id, input.id);
              },
            });
            control.inline = true;
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
        const control = new SelectControl({
          initial,
          options: configField.options ?? [],
          change: (value) => {
            nodeEngine.updateNodeInputValue(instance.id, input.id, value);
            sendNodeOverride(instance.id, 'input', input.id, value);
            notifyNodeActivity(instance.id, input.id);
          },
        });
        control.inline = true;
        inp.addControl(control);
        inp.showControl = true;
        inputControlKeys.add(input.id);

        if (instance.config?.[input.id] === undefined && configField.defaultValue !== undefined) {
          nodeEngine.updateNodeConfig(instance.id, { [input.id]: initial });
        }
      }

      node.addInput(input.id, inp);
    }

    for (const output of def?.outputs ?? []) {
      const out = new ClassicPreset.Output(socketFor(proxyPortType ?? output.type), output.label ?? output.id);
      if (instance.type === 'proc-client-sensors') {
        out.control = new ClientSensorValueControl({ nodeId: instance.id, portId: output.id });
      }
      node.addOutput(output.id, out);
    }

    const configDefaultPatch: Record<string, unknown> = {};
    for (const field of def?.configSchema ?? []) {
      if (inputControlKeys.has(field.key)) continue;
      if (instance.config?.[field.key] !== undefined || field.defaultValue === undefined) continue;
      configDefaultPatch[field.key] = field.defaultValue;
    }
    if (Object.keys(configDefaultPatch).length > 0) {
      nodeEngine.updateNodeConfig(instance.id, configDefaultPatch);
    }

    for (const field of def?.configSchema ?? []) {
      if (inputControlKeys.has(field.key)) continue;
      const key = field.key;
      const current = instance.config?.[key] ?? field.defaultValue;
      if (field.type === 'select') {
        node.addControl(
          key,
          new SelectControl({
            label: field.label,
            initial: String(current ?? ''),
            options: field.options ?? [],
            change: (value) => {
              nodeEngine.updateNodeConfig(instance.id, { [key]: value });
              sendNodeOverride(instance.id, 'config', key, value);
              notifyNodeActivity(instance.id, key);
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

        node.addControl(
          key,
          new BooleanControl({
            label: field.label,
            initial,
            change: (value) => {
              nodeEngine.updateNodeConfig(instance.id, { [key]: value });
              sendNodeOverride(instance.id, 'config', key, value);
              notifyNodeActivity(instance.id, key);
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

        const control = new ClassicPreset.InputControl('number', {
          initial: clamp(Number(current ?? 0)),
          change: (value) => {
            const next = typeof value === 'number' ? clamp(value) : value;
            nodeEngine.updateNodeConfig(instance.id, { [key]: next });
            sendNodeOverride(instance.id, 'config', key, next);
            notifyNodeActivity(instance.id, key);
          },
        });
        control.controlLabel = field.label;
        control.min = field.min;
        control.max = field.max;
        control.step = field.step;
        node.addControl(key, control);
      } else if (field.type === 'client-picker') {
        const control = new ClientPickerControl({
          label: field.label,
          initial: String(current ?? ''),
          change: (value) => {
            nodeEngine.updateNodeConfig(instance.id, { [key]: value });
            if (instance.type === 'client-object') {
              opts.onClientNodePick?.(instance.id, value);
            }
            notifyNodeActivity(instance.id, key);
          },
        });
        control.nodeId = instance.id;
        control.nodeType = instance.type;
        node.addControl(key, control);
      } else if (field.type === 'asset-picker') {
        const assetKindRaw = (field as Record<string, unknown>).assetKind;
        const control = new AssetPickerControl({
          label: field.label,
          initial: String(current ?? ''),
          assetKind: typeof assetKindRaw === 'string' ? assetKindRaw : 'any',
          change: (value) => {
            nodeEngine.updateNodeConfig(instance.id, { [key]: value });
            sendNodeOverride(instance.id, 'config', key, value);
            notifyNodeActivity(instance.id, key);
          },
        });
        node.addControl(key, control);
      } else if (field.type === 'local-asset-picker') {
        const assetKindRaw = (field as Record<string, unknown>).assetKind;
        const control = new LocalAssetPickerControl({
          label: field.label,
          initial: String(current ?? ''),
          assetKind: typeof assetKindRaw === 'string' ? assetKindRaw : 'any',
          change: (value) => {
            nodeEngine.updateNodeConfig(instance.id, { [key]: value });
            sendNodeOverride(instance.id, 'config', key, value);
            notifyNodeActivity(instance.id, key);
          },
        });
        node.addControl(key, control);
      } else if (field.type === 'param-path') {
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
              nodeEngine.updateNodeConfig(instance.id, { [key]: value });
              sendNodeOverride(instance.id, 'config', key, value);
              notifyNodeActivity(instance.id, key);
            },
          })
        );
      } else if (field.type === 'file') {
        node.addControl(
          key,
          new FilePickerControl({
            label: field.label,
            initial: typeof current === 'string' ? current : '',
            accept: field.accept,
            buttonLabel: field.buttonLabel,
            change: (value) => {
              nodeEngine.updateNodeConfig(instance.id, { [key]: value });
              sendNodeOverride(instance.id, 'config', key, value);
              notifyNodeActivity(instance.id, key);
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

              nodeEngine.updateNodeInputValue(instance.id, 'startSec', nextStart);
              sendNodeOverride(instance.id, 'input', 'startSec', nextStart);
              notifyNodeActivity(instance.id, 'startSec');

              nodeEngine.updateNodeInputValue(instance.id, 'endSec', nextEnd);
              sendNodeOverride(instance.id, 'input', 'endSec', nextEnd);
              notifyNodeActivity(instance.id, 'endSec');

              if (typeof nextCursor === 'number' && Number.isFinite(nextCursor)) {
                nodeEngine.updateNodeInputValue(instance.id, 'cursorSec', nextCursor);
                sendNodeOverride(instance.id, 'input', 'cursorSec', nextCursor);
                notifyNodeActivity(instance.id, 'cursorSec');
              }

              // Keep config in sync for persistence/debugging (not used by runtime).
              nodeEngine.updateNodeConfig(instance.id, { [key]: value });
              return;
            }

            nodeEngine.updateNodeConfig(instance.id, { [key]: value });
            sendNodeOverride(instance.id, 'config', key, value);
            notifyNodeActivity(instance.id, key);
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
            nodeEngine.updateNodeConfig(instance.id, { [key]: value });
            sendNodeOverride(instance.id, 'config', key, value);
            notifyNodeActivity(instance.id, key);
          },
        });
        curveControl.nodeId = instance.id;
        curveControl.nodeType = instance.type;
        node.addControl(key, curveControl);
      } else if (instance.type === 'note' && key === 'text') {
        const noteControl = new NoteControl({
          placeholder: 'Type a note…',
          initial: typeof current === 'string' ? current : String(current ?? ''),
          change: (value) => {
            nodeEngine.updateNodeConfig(instance.id, { [key]: value });
            sendNodeOverride(instance.id, 'config', key, value);
            notifyNodeActivity(instance.id, key);
          },
        });
        noteControl.nodeId = instance.id;
        node.addControl(key, noteControl);
      } else {
        const control = new ClassicPreset.InputControl('text', {
          initial: String(current ?? ''),
          change: (value) => {
            nodeEngine.updateNodeConfig(instance.id, { [key]: value });
            sendNodeOverride(instance.id, 'config', key, value);
            notifyNodeActivity(instance.id, key);
          },
        });
        control.controlLabel = field.label;
        node.addControl(key, control);
      }
    }

    node.position = [instance.position.x, instance.position.y];
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
