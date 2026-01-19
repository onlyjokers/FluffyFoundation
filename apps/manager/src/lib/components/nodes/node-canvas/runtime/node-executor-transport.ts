/**
 * Purpose: Send `node-executor` plugin control to client or Display.
 */

type AnyRecord = Record<string, unknown>;

const asRecord = (value: unknown): AnyRecord | null =>
  value && typeof value === 'object' ? (value as AnyRecord) : null;

type DisplayTransportAvailabilityLike = {
  route: string;
  hasLocalSession: boolean;
  hasLocalReady: boolean;
  hasRemoteDisplay: boolean;
};

type DisplayTransportSendOptionsLike = { forceServer?: boolean; localOnly?: boolean };

type DisplayTransportLike = {
  getAvailability: () => DisplayTransportAvailabilityLike;
  sendPlugin: (
    pluginId: string,
    command: string,
    payload?: Record<string, unknown>,
    options?: DisplayTransportSendOptionsLike
  ) => DisplayTransportAvailabilityLike;
};

type SdkLike = {
  sendPluginControl: (
    target: { mode: 'clientIds'; ids: string[] },
    pluginName: string,
    command: string,
    payload: unknown,
    scopeGroupId?: string
  ) => void;
};

export type SendNodeExecutorPluginControl = (
  targetId: string,
  command: string,
  payload: unknown
) => void;

export interface CreateNodeExecutorTransportOptions {
  displayTransport: DisplayTransportLike;
  getSDK: () => SdkLike | null;
  ensureDisplayLocalFilesRegisteredFromValue: (value: unknown) => void;
  isDisplayTarget: (clientId: string) => boolean;
  isLocalDisplayTarget: (clientId: string) => boolean;
}

export const createNodeExecutorTransport = (
  opts: CreateNodeExecutorTransportOptions
): { sendNodeExecutorPluginControl: SendNodeExecutorPluginControl } => {
  const {
    displayTransport,
    getSDK,
    ensureDisplayLocalFilesRegisteredFromValue,
    isDisplayTarget,
    isLocalDisplayTarget,
  } = opts;

  const sendNodeExecutorPluginControl: SendNodeExecutorPluginControl = (
    targetId,
    command,
    payload
  ) => {
    const id = String(targetId ?? '');
    if (!id) return;
    const payloadRecord = asRecord(payload) ?? {};

    if ((command === 'deploy' || command === 'override-set') && isDisplayTarget(id)) {
      ensureDisplayLocalFilesRegisteredFromValue(payload);
    }

    if (isLocalDisplayTarget(id)) {
      displayTransport.sendPlugin('node-executor', command, payloadRecord, { localOnly: true });
      return;
    }

    const sdk = getSDK();
    if (!sdk) return;
    sdk.sendPluginControl(
      { mode: 'clientIds', ids: [id] },
      'node-executor',
      command,
      payload,
      undefined
    );
  };

  return { sendNodeExecutorPluginControl };
};
