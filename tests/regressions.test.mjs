import assert from 'node:assert/strict';
import test from 'node:test';

import { load } from './support/load-ts.mjs';
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

const { resizePool } = await import(await load('src/model/containers.ts'));
const { renderDiagram, hitTestNode } = await import(await load('src/canvas/renderer.ts'));
const { Camera } = await import(await load('src/canvas/camera.ts'));
test('selected pools stay behind lanes and lanes remain selectable', () => {
  const pool = createBpmnNode('POOL', 0, 0, 1);
  const lane = createBpmnNode('LANE', 15, 0, 2);
  const diagram = { nodes: [lane, pool], edges: [] };
  const labels = [];
  const ctx = new Proxy({}, { get: (_, key) => key === 'fillText' ? text => labels.push(text) : () => {} });
  renderDiagram(ctx, 100, 100, new Camera(), diagram, pool.id, null);
  assert.deepEqual(labels, [pool.label, lane.label]);
  assert.equal(hitTestNode(diagram, 15, 0)?.id, lane.id);
  assert.equal(hitTestNode(diagram, -290, 0)?.id, pool.id);
});
test('pool grows and shrinks with lanes while keeping its top-left fixed', () => {
  const pool = createBpmnNode('POOL', 0, 0, 1);
  const lanes = [createBpmnNode('LANE', 15, -60, 2), createBpmnNode('LANE', 15, 60, 3)];
  for (const [width, height] of [[900, 500], [300, 160], [600, 320]]) {
    resizePool(pool, lanes, width, height);
    assert.equal(pool.position.x - pool.size.width / 2, -300);
    assert.equal(pool.position.y - pool.size.height / 2, -110);
    assert.equal(pool.size.height, height);
    assert.equal(lanes[0].size.width, width - 30);
    assert.equal(lanes[0].position.y - lanes[0].size.height / 2, -110);
    assert.equal(lanes[1].position.y + lanes[1].size.height / 2, -110 + height);
    assert.equal(lanes[0].position.y + lanes[0].size.height / 2, lanes[1].position.y - lanes[1].size.height / 2);
    assert.ok(lanes.every(l => l.size.height >= 80));
  }
});

const { setPoolOrientation } = await import(await load('src/model/containers.ts'));
const { centeredPdfLayout, diagramBounds } = await import(await load('src/export/pdf-layout.ts'));
test('vertical pool transposes lanes and activities and survives resizing and JSON', () => {
  const pool = createBpmnNode('POOL', 100, 200, 1);
  const lanes = [createBpmnNode('LANE', 115, 150, 2), createBpmnNode('LANE', 115, 250, 3)];
  const task = createBpmnNode('TASK', 250, 150, 4);
  resizePool(pool, lanes, 600, 240);
  const before = JSON.parse(JSON.stringify([pool, ...lanes, task]));
  setPoolOrientation(pool, [...lanes, task], 'VERTICAL');
  assert.equal(pool.size.width, 240);
  assert.equal(pool.size.height, 600);
  assert.equal(lanes[0].size.height, 570);
  assert.ok(lanes[0].position.x < lanes[1].position.x);
  assert.equal(task.position.x, before[0].position.x + before[3].position.y - before[0].position.y);
  assert.equal(JSON.parse(JSON.stringify(pool)).orientation, 'VERTICAL');
  setPoolOrientation(pool, [...lanes, task], 'HORIZONTAL');
  assert.deepEqual([pool, ...lanes, task].map(n => n.position), before.map(n => n.position));
  setPoolOrientation(pool, [...lanes, task], 'VERTICAL');
  resizePool(pool, lanes, 400, 800);
  assert.equal(lanes[0].size.height, 770);
  assert.equal(lanes[0].position.y - lanes[0].size.height / 2, pool.position.y - pool.size.height / 2 + 30);
  assert.equal(lanes[1].position.x + lanes[1].size.width / 2, pool.position.x + pool.size.width / 2);
  const doc = createEmptyDocument(); doc.diagram.nodes = [pool, ...lanes, task];
  assert.equal((documentToBpmnXml(doc).match(/isHorizontal="false"/g) || []).length, 3);
});
test('PDF layout centers wide and tall diagrams with matching opposite margins', () => {
  for (const [w, h] of [[1000, 200], [200, 1000], [400, 400]]) {
    const page = centeredPdfLayout(w, h);
    assert.ok(Math.abs(page.x - (page.pageWidth - page.x - page.width)) < 1e-8);
    assert.ok(Math.abs(page.y - (page.pageHeight - page.y - page.height)) < 1e-8);
    assert.ok(page.x >= 36 - 1e-8 && page.y >= 36 - 1e-8);
    assert.ok(Math.abs(page.width / page.height - w / h) < 1e-8);
  }
});
test('PDF includes off-screen nodes and long labels, independent of viewport', () => {
  const task = createOitNode('OPERATION', -1000, 5000, 1);
  const bounds = diagramBounds({ nodes: [task], edges: [] }, () => 1000);
  assert.ok(bounds.x < -1500);
  assert.ok(bounds.x + bounds.width > -500);
  assert.ok(bounds.y + bounds.height > 5000 + 50);
  assert.throws(() => diagramBounds({ nodes: [], edges: [] }, () => 0));
});

const { createAuxNode, createOitNode, nextActivityNumber } = await import(await load('src/model/defaults.ts'));
const { joinEdgeAt } = await import(await load('src/model/connections.ts'));
const { calculateDapSummary } = await import(await load('src/model/summary.ts'));
const { validateDiagram } = await import(await load('src/model/validation.ts'));
const { diagramToCsv } = await import(await load('src/export/csv.ts'));
const { documentToDapExcelXml } = await import(await load('src/export/excel.ts'));
test('DOP numbers are independent for operations and inspections and survive editing/saving', () => {
  const operation = createOitNode('OPERATION', 0, 0, 1);
  operation.activity_number = '1';
  const inspection = createOitNode('INSPECTION', 0, 100, 2);
  inspection.activity_number = '1';
  const nodes = [operation, inspection];
  assert.equal(nextActivityNumber(nodes, 'OPERATION'), '2');
  assert.equal(nextActivityNumber(nodes, 'INSPECTION'), '2');
  operation.activity_number = '12';
  const text = createAuxNode('TEXT', 100, 100); text.label = 'Material A\nEntrada';
  const doc = createEmptyDocument(); doc.metadata.notation = 'DOP'; doc.diagram.nodes = [...nodes, text];
  const saved = JSON.parse(JSON.stringify(doc));
  assert.equal(saved.diagram.nodes[0].activity_number, '12');
  assert.equal(saved.diagram.nodes[2].label, 'Material A\nEntrada');
  assert.ok(diagramToCsv(doc.diagram).includes('12,Operación'));
  assert.ok(!diagramToCsv(doc.diagram).includes('Material A'));
  assert.ok(documentToDapExcelXml(doc).includes('>12</Data>'));
  assert.equal(calculateDapSummary(doc.diagram).operations, 1);
  assert.ok(!validateDiagram(doc.diagram, 'DOP').issues.some(i => i.node_id === text.id));
});
test('joining a branch to a connector preserves both ends and creates one shared junction', () => {
  const source = createOitNode('OPERATION', 0, 0, 1);
  const target = createOitNode('INSPECTION', 0, 200, 2);
  const branch = createOitNode('OPERATION', -200, 100, 3);
  const edge = { id: 'original', kind: 'SEQUENCE_FLOW', label: 'Flujo original', source: { node_id: source.id, port_id: 's' }, target: { node_id: target.id, port_id: 'n' } };
  const diagram = { nodes: [source, target, branch], edges: [edge] };
  const before = JSON.stringify(diagram);
  const junction = joinEdgeAt(diagram, edge, 3, 100);
  assert.deepEqual(junction.position, { x: 0, y: 100 });
  assert.equal(edge.source.node_id, source.id);
  assert.equal(edge.target.node_id, junction.id);
  const tail = diagram.edges[1];
  assert.equal(tail.source.node_id, junction.id);
  assert.equal(tail.target.node_id, target.id);
  assert.equal(edge.label, 'Flujo original');
  assert.equal(tail.label, null);
  diagram.edges.push({ id: 'branch', kind: 'SEQUENCE_FLOW', source: { node_id: branch.id, port_id: 'e' }, target: { node_id: junction.id, port_id: 'w' } });
  assert.equal(validateDiagram(diagram, 'DOP').ok, true);
  assert.equal(calculateDapSummary(diagram).operations, 2);
  assert.equal(calculateDapSummary(diagram).inspections, 1);
  const restored = JSON.parse(before);
  assert.equal(restored.edges.length, 1);
  assert.equal(restored.nodes.length, 3);
});
test('DOP renders the number inside the symbol and multiline text without a process symbol', () => {
  const operation = createOitNode('OPERATION', 0, 0, 1); operation.activity_number = '7';
  const text = createAuxNode('TEXT', 150, 0); text.label = 'Materia prima\nComponente A';
  const drawn = [];
  const ctx = new Proxy({}, { get: (_, key) => key === 'fillText' ? (...args) => drawn.push(args) : () => {} });
  renderDiagram(ctx, 500, 500, new Camera(), { nodes: [operation, text], edges: [] }, null, null);
  assert.ok(drawn.some(([label, x, y]) => label === '7' && x === 0 && y === 0));
  assert.ok(drawn.some(([label]) => label === 'Materia prima'));
  assert.ok(drawn.some(([label]) => label === 'Componente A'));
});

const { drawBpmnPaletteIcon } = await import(await load('src/canvas/renderer.ts'));
test('BPMN task previews fit the palette and include distinct user and service markers', () => {
  function trace(kind) {
    const calls = [];
    const ctx = new Proxy({}, { get: (_, method) => (...args) => calls.push([method, ...args]) });
    drawBpmnPaletteIcon(ctx, kind, '#0284c7');
    return calls;
  }
  const generic = trace('TASK'), user = trace('USER_TASK'), service = trace('SERVICE_TASK');
  assert.equal(generic.filter(([method]) => method === 'arc').length, 0);
  assert.ok(user.some(([method, , , radius]) => method === 'arc' && radius === 3));
  assert.ok(service.some(([method, , , radius]) => method === 'arc' && radius === 2.5));
  assert.ok(service.filter(([method]) => method === 'lineTo').length > 30);
  // Both the rounded outline and its markers must fit the 64 x 44 preview.
  for (const calls of [generic, user, service]) {
    const stack = [];
    let state = { x: 0, y: 0, sx: 1, sy: 1 };
    const point = (x, y) => {
      assert.ok(state.x + x * state.sx >= 2 && state.x + x * state.sx <= 62);
      assert.ok(state.y + y * state.sy >= 2 && state.y + y * state.sy <= 42);
    };
    for (const [method, ...args] of calls) {
      if (method === 'save') stack.push({ ...state });
      if (method === 'restore') state = stack.pop();
      if (method === 'translate') { state.x += args[0] * state.sx; state.y += args[1] * state.sy; }
      if (method === 'scale') { state.sx *= args[0]; state.sy *= args[1]; }
      if (method === 'moveTo' || method === 'lineTo') point(...args);
      if (method === 'quadraticCurveTo') { point(args[0], args[1]); point(args[2], args[3]); }
      if (method === 'arc') { point(args[0] - args[2], args[1] - args[2]); point(args[0] + args[2], args[1] + args[2]); }
    }
  }
});

const { wrapLabel } = await import(await load('src/canvas/text.ts'));
test('task labels wrap words, split long tokens and ellipsize within their area', () => {
  const measure = text => text.length * 6;
  const lines = wrapLabel('Revisar solicitud y aprobar documento', 90, 3, measure);
  assert.ok(lines.length <= 3);
  assert.ok(lines.every(line => measure(line) <= 90));
  assert.ok(lines.at(-1).endsWith('…'));
  assert.deepEqual(wrapLabel('Primera\nSegunda', 90, 3, measure), ['Primera', 'Segunda']);
  assert.deepEqual(wrapLabel('abcdefghijkl', 24, 3, measure), ['abcd', 'efgh', 'ijkl']);
  assert.deepEqual(wrapLabel('', 90, 3, measure), []);
});
test('zoom preserves the world point at the viewport center and respects limits', () => {
  const camera = new Camera(); camera.x = 37; camera.y = -82;
  const before = camera.screenToWorld(400, 300);
  for (const scale of [2, 1, 100, 0.00001]) {
    camera.setScaleAt(400, 300, scale);
    const after = camera.screenToWorld(400, 300);
    assert.ok(Math.abs(after.x - before.x) < 1e-7);
    assert.ok(Math.abs(after.y - before.y) < 1e-7);
    assert.ok(camera.scale >= camera.minScale && camera.scale <= camera.maxScale);
  }
});
test('fit view centers off-screen diagram bounds with margins in wide and narrow viewports', () => {
  for (const [width, height] of [[1000, 600], [400, 900]]) {
    const camera = new Camera();
    const bounds = { x: -2000, y: 5000, width: 1800, height: 1000 };
    camera.fitBounds(bounds, width, height);
    const top = camera.worldToScreen(bounds.x, bounds.y);
    const bottom = camera.worldToScreen(bounds.x + bounds.width, bounds.y + bounds.height);
    assert.ok(top.x >= 48 - 1e-7 && top.y >= 48 - 1e-7);
    assert.ok(bottom.x <= width - 48 + 1e-7 && bottom.y <= height - 48 + 1e-7);
    assert.ok(Math.abs((top.x + bottom.x) / 2 - width / 2) < 1e-7);
    assert.ok(Math.abs((top.y + bottom.y) / 2 - height / 2) < 1e-7);
  }
});
test('BPMN task labels stay inside the task while OIT labels remain outside', () => {
  const drawn = [];
  const ctx = new Proxy({}, { get: (_, key) => key === 'measureText' ? text => ({ width: text.length * 6 }) : key === 'fillText' ? (...args) => drawn.push(args) : () => {} });
  const task = createBpmnNode('USER_TASK', 0, 0, 1); task.label = 'Revisar solicitud del cliente';
  renderDiagram(ctx, 500, 500, new Camera(), { nodes: [task], edges: [] }, null, null);
  assert.ok(drawn.length >= 2);
  assert.ok(drawn.every(([, x, y]) => x === 0 && y > -14 && y < 44));
  assert.ok(drawn.every(([text]) => text.length * 6 <= 124));
  const bounds = diagramBounds({ nodes: [task], edges: [] }, () => 1000);
  assert.equal(bounds.width, 144 + 24);
});
