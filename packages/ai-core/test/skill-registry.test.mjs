/**
 * Purpose: Verify progressive-disclosure skill selection for the AI orchestrator context.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createAgentSkillRegistry } from '../dist-ai-core/index.js';

const skills = [
  {
    id: 'node.display-breathing',
    title: 'Display Breathing Node',
    summary: 'Controls display breathing visuals through bounded intensity and breathRate params.',
    triggers: {
      nodeTypes: ['display-breathing'],
      commandTypes: ['node.params.update'],
      eventTypes: ['display.ready'],
    },
    content: 'Full display breathing node guidance with param ranges and repair hints.',
  },
  {
    id: 'command.node-add',
    title: 'Scoped Node Add',
    summary: 'Explains how scoped node.add works inside an AI Group sandbox.',
    triggers: {
      commandTypes: ['node.add'],
      eventTypes: ['client.joined'],
    },
    content: 'Full scoped node.add guidance.',
  },
  {
    id: 'node.video-player',
    title: 'Video Player Node',
    summary: 'Unrelated video playback guidance.',
    triggers: {
      nodeTypes: ['video-player'],
      commandTypes: ['runtime.override.set'],
    },
    content: 'Full video player guidance.',
  },
];

test('AgentSkillRegistry selects only skills matching current node, command, or event context', () => {
  const registry = createAgentSkillRegistry({ skills });

  const refs = registry.resolve({
    nodeTypes: ['display-breathing'],
    commandTypes: ['node.params.update'],
    eventTypes: ['display.ready'],
  });

  assert.deepEqual(refs.map((ref) => ref.id), ['node.display-breathing']);
  assert.equal(refs[0].title, 'Display Breathing Node');
  assert.equal(refs[0].summary.includes('bounded intensity'), true);
  assert.equal('content' in refs[0], false);
});

test('AgentSkillRegistry progressively discloses full content only for requested skill ids', () => {
  const registry = createAgentSkillRegistry({ skills });

  const refs = registry.resolve({
    nodeTypes: ['display-breathing'],
    commandTypes: ['node.params.update', 'node.add'],
    eventTypes: ['client.joined'],
    requestedSkillIds: ['command.node-add'],
  });

  assert.deepEqual(refs.map((ref) => ref.id), ['node.display-breathing', 'command.node-add']);
  assert.equal('content' in refs[0], false);
  assert.equal(refs[1].content, 'Full scoped node.add guidance.');
  assert.equal(refs[1].disclosure, 'full');
});
