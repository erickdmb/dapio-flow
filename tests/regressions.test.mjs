import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import test from 'node:test';
import ts from 'typescript';

// Load application TypeScript with the same compiler used by the frontend.
const modules = new Map();
async function load(file) {
  file = resolve(file);
  if (modules.has(file)) return modules.get(file);
  let code = ts.transpileModule(await readFile(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  for (const match of [...code.matchAll(/from\s+["'](\.[^"']+)["']/g)]) {
    const dependency = await load(resolve(dirname(file), `${match[1]}.ts`));
    code = code.replace(match[0], `from "${dependency}"`);
  }
  const url = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
  modules.set(file, url);
  return url;
}
const { syncTimeMetrics } = await import(await load('src/model/time.ts'));
const { documentToBpmnXml } = await import(await load('src/export/bpmn.ts'));
const { createEmptyDocument, createBpmnNode } = await import(await load('src/model/defaults.ts'));

test('clearing a duration clears canonical seconds for every unit', () => {
  for (const time_unit of ['SECONDS', 'MINUTES', 'HOURS']) {
    assert.equal(syncTimeMetrics({ time_value: null, time_seconds: 120, time_unit }).time_seconds, null);
  }
});
test('legacy seconds are preserved and explicit values are converted once', () => {
  assert.equal(syncTimeMetrics({ time_seconds: 120, time_unit: 'MINUTES' }).time_seconds, 120);
  const metrics = syncTimeMetrics({ time_value: 2, time_unit: 'MINUTES' });
  assert.equal(metrics.time_seconds, 120);
  assert.equal(syncTimeMetrics(metrics).time_seconds, 120);
});
test('BPMN export preserves types, containers, dimensions and connector semantics', () => {
  const doc = createEmptyDocument();
  const pool = createBpmnNode('POOL', 0, 0, 1);
  pool.size = { width: 800, height: 300 };
  const lane = createBpmnNode('LANE', 15, 0, 2);
  const user = createBpmnNode('USER_TASK', -100, 0, 3);
  user.label = 'A & <B>';
  const service = createBpmnNode('SERVICE_TASK', 100, 0, 4);
  const note = createBpmnNode('TEXT_ANNOTATION', 200, 50, 5);
  const otherPool = createBpmnNode('POOL', 1000, 0, 6);
  const other = createBpmnNode('TASK', 1000, 0, 7);
  doc.diagram.nodes = [pool, lane, user, service, note, otherPool, other];
  for (const [kind, source, target] of [['SEQUENCE_FLOW', user, service], ['ASSOCIATION', user, note], ['MESSAGE_FLOW', service, other]]) {
    doc.diagram.edges.push({ id: kind, kind, source: { node_id: source.id, port_id: 'e' }, target: { node_id: target.id, port_id: 'w' } });
  }
  const xml = documentToBpmnXml(doc);
  for (const tag of ['participant', 'lane', 'userTask', 'serviceTask', 'textAnnotation', 'sequenceFlow', 'association', 'messageFlow']) {
    assert.ok(xml.includes(`<bpmn:${tag} `), tag);
  }
  assert.ok(xml.includes('width="800" height="300"'));
  assert.ok(xml.includes('A &amp; &lt;B&gt;'));
  assert.equal((xml.match(/<bpmn:sequenceFlow /g) || []).length, 1);
  assert.equal((xml.match(/<bpmn:incoming>/g) || []).length, 1);
});
