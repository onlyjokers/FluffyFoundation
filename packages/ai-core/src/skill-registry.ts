/**
 * Purpose: Select progressive-disclosure skill docs for AI runtime prompts.
 */

export type AgentSkillTriggers = {
  nodeTypes?: string[];
  commandTypes?: string[];
  eventTypes?: string[];
};

export type AgentSkillDoc = {
  id: string;
  title: string;
  summary: string;
  triggers: AgentSkillTriggers;
  content: string;
};

export type AgentSkillRef = {
  id: string;
  title: string;
  summary: string;
  triggers: AgentSkillTriggers;
  disclosure: 'summary' | 'full';
  content?: string;
};

export type AgentSkillResolveInput = {
  nodeTypes?: string[];
  commandTypes?: string[];
  eventTypes?: string[];
  requestedSkillIds?: string[];
};

export type AgentSkillRegistry = {
  list(): AgentSkillRef[];
  get(id: string): AgentSkillDoc | null;
  resolve(input: AgentSkillResolveInput): AgentSkillRef[];
};

const uniqueStrings = (values: string[] | undefined): string[] =>
  [...new Set((values ?? []).map(String).filter(Boolean))];

const hasIntersection = (left: string[] | undefined, right: Set<string>): boolean =>
  uniqueStrings(left).some((value) => right.has(value));

const cloneTriggers = (triggers: AgentSkillTriggers): AgentSkillTriggers => ({
  nodeTypes: uniqueStrings(triggers.nodeTypes),
  commandTypes: uniqueStrings(triggers.commandTypes),
  eventTypes: uniqueStrings(triggers.eventTypes),
});

const summaryRef = (skill: AgentSkillDoc): AgentSkillRef => ({
  id: skill.id,
  title: skill.title,
  summary: skill.summary,
  triggers: cloneTriggers(skill.triggers),
  disclosure: 'summary',
});

const fullRef = (skill: AgentSkillDoc): AgentSkillRef => ({
  ...summaryRef(skill),
  disclosure: 'full',
  content: skill.content,
});

export function createAgentSkillRegistry(input: { skills: AgentSkillDoc[] }): AgentSkillRegistry {
  const skills = input.skills.map((skill) => ({
    id: String(skill.id),
    title: String(skill.title),
    summary: String(skill.summary),
    triggers: cloneTriggers(skill.triggers),
    content: String(skill.content),
  }));

  const byId = new Map(skills.map((skill) => [skill.id, skill]));

  return {
    list() {
      return skills.map(summaryRef);
    },
    get(id: string) {
      return byId.get(String(id)) ?? null;
    },
    resolve(resolveInput: AgentSkillResolveInput) {
      const nodeTypes = new Set(uniqueStrings(resolveInput.nodeTypes));
      const commandTypes = new Set(uniqueStrings(resolveInput.commandTypes));
      const eventTypes = new Set(uniqueStrings(resolveInput.eventTypes));
      const requestedSkillIds = new Set(uniqueStrings(resolveInput.requestedSkillIds));

      return skills
        .filter((skill) => {
          if (requestedSkillIds.has(skill.id)) return true;
          return (
            hasIntersection(skill.triggers.nodeTypes, nodeTypes) ||
            hasIntersection(skill.triggers.commandTypes, commandTypes) ||
            hasIntersection(skill.triggers.eventTypes, eventTypes)
          );
        })
        .map((skill) => (requestedSkillIds.has(skill.id) ? fullRef(skill) : summaryRef(skill)));
    },
  };
}
