// Purpose: Prepare Manager Node Manager rows and semantic capability commands for AI node access.
import type {
  AgentCapabilityNodeSource,
  CustomNodeDefinition,
  SemanticCommand,
  SemanticDefinition,
  SemanticGraphSnapshot,
} from '@shugu/node-core';

export type AgentCapabilityRow = {
  type: string;
  label: string;
  category: string;
  source: AgentCapabilityNodeSource;
  enabled: boolean;
  manifestVisible: boolean;
  usedCount: number;
  aiNotes?: string;
  disabledReason?: string;
  updatedAt?: string;
  definition: SemanticDefinition;
  customDefinition?: CustomNodeDefinition;
};

export type AgentCapabilityManagerSummary = {
  total: number;
  enabled: number;
  disabled: number;
  custom: number;
  builtin: number;
  plugin: number;
  categories: Array<{ category: string; count: number; enabled: number }>;
};

export type AgentCapabilitySourceFilter = 'all' | AgentCapabilityNodeSource;
export type AgentCapabilityStatusFilter = 'all' | 'enabled' | 'disabled';
export type AgentCapabilityFilterInput = {
  query: string;
  sourceFilter: AgentCapabilitySourceFilter;
  statusFilter: AgentCapabilityStatusFilter;
  categoryFilter: string;
};

export type AgentCapabilityRowAction = {
  id: 'toggle-ai' | 'edit-custom' | 'delete-custom';
  label: string;
};

const SOURCE_ORDER: Record<AgentCapabilityNodeSource, number> = {
  custom: 0,
  builtin: 1,
  plugin: 2,
};

const CUSTOM_PREFIX = 'custom:';
const PLUGIN_PREFIX = 'plugin:';

function inferNodeSource(
  definition: SemanticDefinition,
  customDefinitionByType: Map<string, CustomNodeDefinition>
): AgentCapabilityNodeSource {
  if (definition.type.startsWith(CUSTOM_PREFIX) || customDefinitionByType.has(definition.type)) {
    return 'custom';
  }
  if (definition.type.startsWith(PLUGIN_PREFIX) || definition.category.toLowerCase() === 'plugin') {
    return 'plugin';
  }
  return 'builtin';
}

function customType(definition: CustomNodeDefinition): string {
  return `${CUSTOM_PREFIX}${definition.definitionId}`;
}

export function buildAgentCapabilityRows(snapshot: SemanticGraphSnapshot): AgentCapabilityRow[] {
  const customDefinitionByType = new Map(
    (snapshot.customDefinitions ?? []).map((definition) => [customType(definition), definition])
  );
  const capabilityByType = new Map(
    (snapshot.agentCapabilities?.nodes ?? []).map((setting) => [String(setting.nodeType), setting])
  );
  const usedCountByType = new Map<string, number>();
  for (const node of snapshot.nodes ?? []) {
    const type = String(node.type ?? '');
    if (!type) continue;
    usedCountByType.set(type, (usedCountByType.get(type) ?? 0) + 1);
  }

  return (snapshot.definitions ?? [])
    .map((definition) => {
      const capability = capabilityByType.get(definition.type);
      const source = capability?.source ?? inferNodeSource(definition, customDefinitionByType);
      const enabled = capability ? capability.enabled !== false : true;
      return {
        type: definition.type,
        label: definition.label,
        category: definition.category,
        source,
        enabled,
        manifestVisible: enabled,
        usedCount: usedCountByType.get(definition.type) ?? 0,
        ...(capability?.aiNotes ? { aiNotes: capability.aiNotes } : {}),
        ...(capability?.disabledReason ? { disabledReason: capability.disabledReason } : {}),
        ...(capability?.updatedAt ? { updatedAt: capability.updatedAt } : {}),
        definition,
        ...(customDefinitionByType.get(definition.type)
          ? { customDefinition: customDefinitionByType.get(definition.type) }
          : {}),
      } satisfies AgentCapabilityRow;
    })
    .sort((left, right) => {
      const bySource = SOURCE_ORDER[left.source] - SOURCE_ORDER[right.source];
      if (bySource !== 0) return bySource;
      return left.label.localeCompare(right.label);
    });
}

export function createAgentCapabilityCommand(input: {
  nodeType: string;
  enabled: boolean;
  source?: AgentCapabilityNodeSource;
  aiNotes?: string;
  disabledReason?: string;
}): SemanticCommand {
  const aiNotes = input.aiNotes?.trim();
  const disabledReason = input.disabledReason?.trim();
  return {
    type: 'agent.capability.set',
    nodeType: input.nodeType,
    enabled: input.enabled,
    ...(input.source ? { source: input.source } : {}),
    ...(aiNotes ? { aiNotes } : {}),
    ...(disabledReason ? { disabledReason } : {}),
  };
}

export function getRowsForSelectedTypes(
  rows: AgentCapabilityRow[],
  selectedTypes: ReadonlySet<string>
): AgentCapabilityRow[] {
  return rows.filter((row) => selectedTypes.has(row.type));
}

export function buildBulkAgentCapabilityCommands(
  rows: AgentCapabilityRow[],
  enabled: boolean
): SemanticCommand[] {
  return rows.map((row) =>
    createAgentCapabilityCommand({
      nodeType: row.type,
      source: row.source,
      enabled,
      aiNotes: row.aiNotes,
      disabledReason: enabled ? undefined : row.disabledReason || 'Disabled in Node Manager',
    })
  );
}

export function getBulkCustomDeleteBlockers(rows: AgentCapabilityRow[]): AgentCapabilityRow[] {
  return rows.filter((row) => !row.customDefinition);
}

export function buildBulkCustomDeleteCommands(rows: AgentCapabilityRow[]): SemanticCommand[] {
  if (getBulkCustomDeleteBlockers(rows).length > 0) return [];
  return rows
    .map((row) => row.customDefinition?.definitionId)
    .filter((definitionId): definitionId is string => Boolean(definitionId))
    .map((definitionId) => ({ type: 'definition.custom.remove', definitionId }));
}

export function summarizeAgentCapabilityRows(
  rows: AgentCapabilityRow[]
): AgentCapabilityManagerSummary {
  const categories = new Map<string, { category: string; count: number; enabled: number }>();
  for (const row of rows) {
    const category = row.category || 'Other';
    const entry = categories.get(category) ?? { category, count: 0, enabled: 0 };
    entry.count += 1;
    if (row.enabled) entry.enabled += 1;
    categories.set(category, entry);
  }

  return {
    total: rows.length,
    enabled: rows.filter((row) => row.enabled).length,
    disabled: rows.filter((row) => !row.enabled).length,
    custom: rows.filter((row) => row.source === 'custom').length,
    builtin: rows.filter((row) => row.source === 'builtin').length,
    plugin: rows.filter((row) => row.source === 'plugin').length,
    categories: [...categories.values()].sort((left, right) => {
      if (right.count !== left.count) return right.count - left.count;
      return left.category.localeCompare(right.category);
    }),
  };
}

export function filterAgentCapabilityRows(
  rows: AgentCapabilityRow[],
  filters: AgentCapabilityFilterInput
): AgentCapabilityRow[] {
  const term = filters.query.trim().toLowerCase();
  return rows.filter((row) => {
    if (filters.sourceFilter !== 'all' && row.source !== filters.sourceFilter) return false;
    if (filters.statusFilter === 'enabled' && !row.enabled) return false;
    if (filters.statusFilter === 'disabled' && row.enabled) return false;
    if (filters.categoryFilter !== 'all' && row.category !== filters.categoryFilter) return false;
    if (!term) return true;
    return [
      row.type,
      row.label,
      row.category,
      row.aiNotes,
      row.disabledReason,
      row.definition.aiSummary?.description,
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(term));
  });
}

export function getAgentCapabilityRowActions(row: AgentCapabilityRow): AgentCapabilityRowAction[] {
  const actions: AgentCapabilityRowAction[] = [
    { id: 'toggle-ai', label: row.enabled ? 'Disable' : 'Enable' },
  ];
  if (row.customDefinition) {
    actions.push({ id: 'edit-custom', label: 'Edit' });
    actions.push({ id: 'delete-custom', label: 'Delete' });
  }
  return actions;
}
