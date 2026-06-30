import assert from 'node:assert/strict';
import { createKnowledgeSourceRegistry } from './knowledge/sourceRegistry.js';
import { runKnowledgeOrchestrator } from './knowledge/knowledgeOrchestrator.js';
import { createProjectMemoryKnowledgeSource } from './knowledge/sources/projectMemorySource.js';

const registry = createKnowledgeSourceRegistry([createProjectMemoryKnowledgeSource()]);
const result = await runKnowledgeOrchestrator({}, registry, {
  query: 'Que dit le projet ?',
  sources: ['project_memory'],
  projectContext: { projectId: 'p', memory: 'Le projet utilise un Knowledge Orchestrator.' }
});
assert.match(result.contextBlock, /Knowledge Orchestrator/);
