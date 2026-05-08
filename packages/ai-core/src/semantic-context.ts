/**
 * Purpose: Package AI-readable semantic context without Canvas/UI layout noise or sensitive local data.
 */

const UI_NOISE_KEYS = new Set([
  'position',
  'x',
  'y',
  'selected',
  'collapsed',
  'minimized',
  'color',
  'hover',
  'hovered',
  'viewport',
  'viewportZoom',
  'zoom',
  'pan',
  'panel',
  'layout',
]);

const SECRET_KEY_PATTERN = /(secret|token|password|credential|auth|managerKey|apiKey|accessKey|privateKey)/i;
const SECRET_VALUE_PATTERN =
  /(?:bearer\s+[\w.-]+|sk-(?:live|test)-[\w.-]+|(?:secret|token|key|password|credential|auth|managerKey)\s*(?:[:=]\s*)?[\w.-]*\d[\w.-]*)/i;
const PRIVATE_PATH_PATTERN = /(?:^|["'\s])(?:\/Users\/|\/private\/|\/Volumes\/|[A-Za-z]:\\)/;

export type AiContextRedaction = {
  kind: 'secret' | 'private-path' | 'ui-noise';
  path: string;
};

export type AiContextRedactionMetadata = {
  count: number;
  redactions: AiContextRedaction[];
};

export type AiValidationReport = {
  code: string;
  path: string;
  severity: 'error' | 'warning';
  message: string;
  machineReason?: string;
  repairOptions: string[];
};

export type AiDryRunSummary = {
  ok: boolean;
  commandType: string;
  validationErrors: AiValidationReport[];
};

export type AiPolicyContext = {
  mode: 'proposal-only' | 'dry-run-only' | 'auto-execute-disabled';
  deniedOperations: string[];
  approvalRequired: string[];
};

export type AiSemanticContextInput = {
  snapshot: Record<string, unknown>;
  actor: { id: string; role: string };
  policy?: Partial<AiPolicyContext>;
  validationReports?: AiValidationReport[];
  dryRunResults?: AiDryRunSummary[];
};

export type AiSemanticContext = {
  revision: number;
  actor: { id: string; role: string };
  nodes: Array<Record<string, unknown>>;
  connections: unknown[];
  groups: Array<Record<string, unknown>>;
  partitions: Array<Record<string, unknown>>;
  runtimeStatus: Record<string, unknown>;
  deviceCapabilities: unknown[];
  errors: unknown[];
  permissions: Array<Record<string, unknown>>;
  registry: Array<Record<string, unknown>>;
  proposals: Array<Record<string, unknown>>;
  policy: AiPolicyContext;
  validationReports: AiValidationReport[];
  dryRunResults: AiDryRunSummary[];
  rollbackMetadataRefs: string[];
  redactions: AiContextRedactionMetadata;
};

type RedactionAccumulator = { redactions: AiContextRedaction[] };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const redactionMetadata = (accumulator: RedactionAccumulator): AiContextRedactionMetadata => ({
  count: accumulator.redactions.length,
  redactions: accumulator.redactions,
});

const mark = (accumulator: RedactionAccumulator, kind: AiContextRedaction['kind'], _path: string) => {
  accumulator.redactions.push({ kind, path: `[${kind}]` });
};

const isUiNoiseKey = (key: string): boolean => UI_NOISE_KEYS.has(key);

const redactedScalar = (
  key: string,
  value: unknown,
  path: string,
  accumulator: RedactionAccumulator
): unknown => {
  if (SECRET_KEY_PATTERN.test(key)) {
    mark(accumulator, 'secret', path);
    return '[REDACTED:secret]';
  }
  if (typeof value === 'string' && SECRET_VALUE_PATTERN.test(value)) {
    mark(accumulator, 'secret', path);
    return '[REDACTED:secret]';
  }
  if (typeof value === 'string' && PRIVATE_PATH_PATTERN.test(value)) {
    mark(accumulator, 'private-path', path);
    return '[REDACTED:private-path]';
  }
  return value;
};

const redact = (value: unknown, path: string, accumulator: RedactionAccumulator): unknown => {
  if (Array.isArray(value)) {
    return value.map((item, index) => redact(item, `${path}.${index}`, accumulator));
  }
  if (!isRecord(value)) {
    const key = path.split('.').at(-1) ?? '';
    return redactedScalar(key, value, path, accumulator);
  }

  const output: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value)) {
    const childPath = path ? `${path}.${key}` : key;
    if (isUiNoiseKey(key)) {
      mark(accumulator, 'ui-noise', childPath);
      continue;
    }
    if (SECRET_KEY_PATTERN.test(key)) {
      output[key] = redactedScalar(key, raw, childPath, accumulator);
      continue;
    }
    if (typeof raw === 'string' && SECRET_VALUE_PATTERN.test(raw)) {
      output[key] = redactedScalar(key, raw, childPath, accumulator);
      continue;
    }
    if (typeof raw === 'string' && PRIVATE_PATH_PATTERN.test(raw)) {
      output[key] = redactedScalar(key, raw, childPath, accumulator);
      continue;
    }
    output[key] = redact(raw, childPath, accumulator);
  }
  return output;
};

export function redactAiContextValue(value: unknown): {
  value: unknown;
  metadata: AiContextRedactionMetadata;
} {
  const accumulator: RedactionAccumulator = { redactions: [] };
  return {
    value: redact(value, 'context', accumulator),
    metadata: redactionMetadata(accumulator),
  };
}

const arrayFromSnapshot = <T = unknown>(snapshot: Record<string, unknown>, key: string): T[] =>
  Array.isArray(snapshot[key]) ? ([...(snapshot[key] as T[])] as T[]) : [];

const compactDefinition = (definition: Record<string, unknown>): Record<string, unknown> => ({
  type: definition.type,
  label: definition.label,
  category: definition.category,
  aiSummary: definition.aiSummary,
});

const defaultPolicy: AiPolicyContext = {
  mode: 'proposal-only',
  deniedOperations: ['read.secrets', 'mutate.live'],
  approvalRequired: ['node.params.update', 'node.connect', 'node.add'],
};

export function buildAiSemanticContext(input: AiSemanticContextInput): AiSemanticContext {
  const redacted = redactAiContextValue(input.snapshot);
  const snapshot = redacted.value as Record<string, unknown>;
  const registry = arrayFromSnapshot<Record<string, unknown>>(snapshot, 'definitions').map(compactDefinition);
  const proposals = arrayFromSnapshot<Record<string, unknown>>(snapshot, 'proposals');

  return {
    revision: Number.isFinite(snapshot.revision) ? Number(snapshot.revision) : 0,
    actor: { ...input.actor },
    nodes: arrayFromSnapshot<Record<string, unknown>>(snapshot, 'nodes'),
    connections: arrayFromSnapshot(snapshot, 'connections'),
    groups: arrayFromSnapshot<Record<string, unknown>>(snapshot, 'groups'),
    partitions: arrayFromSnapshot<Record<string, unknown>>(snapshot, 'partitions'),
    runtimeStatus: isRecord(snapshot.runtimeStatus) ? snapshot.runtimeStatus : {},
    deviceCapabilities: arrayFromSnapshot(snapshot, 'deviceCapabilities'),
    errors: arrayFromSnapshot(snapshot, 'errors'),
    permissions: arrayFromSnapshot<Record<string, unknown>>(snapshot, 'permissions'),
    registry,
    proposals,
    policy: {
      ...defaultPolicy,
      ...(input.policy ?? {}),
      deniedOperations: input.policy?.deniedOperations ?? defaultPolicy.deniedOperations,
      approvalRequired: input.policy?.approvalRequired ?? defaultPolicy.approvalRequired,
    },
    validationReports: input.validationReports ?? [],
    dryRunResults: input.dryRunResults ?? [],
    rollbackMetadataRefs: proposals
      .map((proposal) => proposal.rollbackToken ?? proposal.rollbackReference ?? proposal.rollbackRef)
      .filter((value): value is string => typeof value === 'string' && value.length > 0),
    redactions: redacted.metadata,
  };
}
