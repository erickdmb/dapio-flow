import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { load } from './support/load-ts.mjs';

const html = await readFile('index.html', 'utf8');
const dom = new JSDOM(html, { url: 'http://localhost:5173/' });
const { window } = dom;
const { document } = window;
Object.assign(globalThis, { window, document });
const frames = [];
globalThis.requestAnimationFrame = callback => { frames.push(callback); return frames.length; };
const draws = [];
const context = new Proxy({}, { get: (target, key) => key in target ? target[key] : key === 'measureText' ? text => ({ width: String(text).length * 6 }) : (...args) => { if (key === 'fillText') draws.push(args); } });
window.HTMLCanvasElement.prototype.getContext = () => context;
const canvas = document.getElementById('diagram-canvas');
Object.defineProperties(canvas.parentElement, { clientWidth: { value: 1000 }, clientHeight: { value: 700 } });
canvas.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: 1000, bottom: 700, width: 1000, height: 700 });
const style = document.createElement('style'); style.textContent = await readFile('src/style.css', 'utf8'); document.head.appendChild(style);
const errors = [];
window.addEventListener('error', event => { errors.push(event.error?.message ?? event.message); event.preventDefault(); });
afterEach(() => assert.deepEqual(errors, []));
await import(await load('src/main.ts'));
function flush() { for (let i = 0; frames.length && i < 10; i++) for (const cb of frames.splice(0)) cb(0); }
function click(id) { const element = document.getElementById(id); element.focus(); element.click(); flush(); }
function fresh() { click('btn-new'); document.querySelector('[data-type="BPMN"]').click(); flush(); }
function addTask() { document.querySelector('[aria-label="Agregar Tarea usuario"]').dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true })); flush(); }
function editTask() { canvas.dispatchEvent(new window.MouseEvent('dblclick', { clientX: 500, clientY: 350, bubbles: true })); flush(); }
flush();

test('zoom toolbar changes the real UI percentage and reset restores 100%', () => {
  fresh(); click('zoom-in'); assert.equal(document.getElementById('zoom-value').textContent, '120%');
  click('zoom-out'); assert.equal(document.getElementById('zoom-value').textContent, '100%');
  click('zoom-in'); click('zoom-reset'); assert.equal(document.getElementById('zoom-value').textContent, '100%');
  assert.deepEqual(errors, []);
});
test('fit button works with empty and populated diagrams and palette categories are present', () => {
  fresh(); click('zoom-fit'); addTask(); click('zoom-fit');
  assert.ok(Number.parseFloat(document.getElementById('zoom-value').textContent) > 0);
  const headings = [...document.querySelectorAll('.pal-section summary')].map(el => el.textContent);
  for (const heading of ['Actividades', 'Eventos', 'Compuertas', 'Contenedores', 'Datos y anotaciones']) assert.ok(headings.some(text => text.includes(heading)));
  assert.deepEqual(errors, []);
});
test('double click opens editor, Ctrl+Enter commits, Escape cancels and undo restores label', () => {
  fresh(); addTask(); editTask();
  const editor = document.getElementById('node-label-editor');
  assert.equal(document.activeElement, editor);
  assert.equal(window.getComputedStyle(editor.parentElement).display === 'none', false);
  editor.value = 'Revisar documento';
  editor.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true })); flush();
  assert.equal(document.getElementById('prop-label').value, 'Revisar documento');
  editTask(); editor.value = 'Cambio cancelado';
  editor.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); flush();
  assert.equal(document.getElementById('prop-label').value, 'Revisar documento');
  click('m-undo');
  canvas.dispatchEvent(new window.MouseEvent('mousedown', { clientX: 500, clientY: 350, bubbles: true }));
  window.dispatchEvent(new window.MouseEvent('mouseup', { clientX: 500, clientY: 350, bubbles: true })); flush();
  assert.match(document.getElementById('prop-label').value, /Tarea de usuario/);
  assert.deepEqual(errors, []);
});
test('hidden property fields stay hidden when a normal BPMN task is selected', () => {
  fresh(); addTask();
  assert.equal(window.getComputedStyle(document.getElementById('pool-orientation-field')).display, 'none');
  assert.equal(window.getComputedStyle(document.getElementById('prop-number-field')).display, 'none');
  assert.equal(window.getComputedStyle(document.getElementById('prop-text-field')).display, 'none');
});


test('editor saves on focus change and typing shortcuts do not trigger diagram undo', () => {
  fresh(); addTask(); editTask();
  const editor = document.getElementById('node-label-editor');
  editor.value = 'Nombre guardado al salir';
  document.getElementById('zoom-in').focus(); flush();
  assert.equal(document.getElementById('prop-label').value, 'Nombre guardado al salir');
  const input = document.getElementById('prop-label'); input.focus();
  input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true })); flush();
  assert.equal(input.value, 'Nombre guardado al salir');
});
test('properties drawer can be opened and closed without changing the diagram', () => {
  fresh(); addTask();
  click('btn-properties');
  assert.equal(document.getElementById('btn-properties').getAttribute('aria-expanded'), 'true');
  assert.ok(document.querySelector('.workspace-area').classList.contains('panel-visible'));
  click('panel-close');
  assert.equal(document.getElementById('btn-properties').getAttribute('aria-expanded'), 'false');
  assert.match(document.getElementById('prop-label').value, /Tarea de usuario/);
});
test('DOP external label opens editing and commits its text', () => {
  click('btn-new'); document.querySelector('[data-type="DOP"]').click(); flush();
  document.querySelector('[aria-label="Agregar Operación"]').dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true })); flush();
  // New operation is placed at world grid y=300, screen y=360.
  canvas.dispatchEvent(new window.MouseEvent('dblclick', { clientX: 500, clientY: 394, bubbles: true })); flush();
  const editor = document.getElementById('node-label-editor');
  assert.equal(document.activeElement, editor);
  editor.value = 'Cortar material';
  editor.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true })); flush();
  assert.equal(document.getElementById('prop-label').value, 'Cortar material');
});

function pointer(target, type, x, y, pointerId = 1) {
  const event = new window.MouseEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true, cancelable: true });
  Object.defineProperties(event, { pointerId: { value: pointerId }, isPrimary: { value: true } });
  target.dispatchEvent(event); flush();
}
function startNotation(notation) {
  click('btn-new'); document.querySelector(`[data-type="${notation}"]`).click(); flush();
}
test('palette elements drag onto the canvas for BPMN, DOP and DAP without DataTransfer', () => {
  for (const [notation, label] of [['BPMN', 'Tarea usuario'], ['DOP', 'Operación'], ['DAP', 'Transporte']]) {
    startNotation(notation);
    const item = document.querySelector(`[aria-label="Agregar ${label}"]`);
    assert.equal(item.draggable, false);
    pointer(item.querySelector('canvas'), 'pointerdown', -100, 200);
    pointer(window, 'pointermove', 600, 300);
    assert.ok(document.querySelector('.palette-drag-ghost'));
    pointer(window, 'pointerup', 600, 300);
    assert.ok(document.getElementById('statusbar').textContent.includes('N:1 E:0'));
    assert.equal(document.querySelector('.palette-drag-ghost'), null);
    assert.ok(!canvas.parentElement.classList.contains('palette-drop-active'));
    click('m-undo');
    assert.ok(document.getElementById('statusbar').textContent.includes('N:0 E:0'));
  }
  assert.deepEqual(errors, []);
});
test('dropping outside, pointer cancellation and Escape do not add elements', () => {
  for (const cancel of ['outside', 'pointercancel', 'escape']) {
    fresh();
    const item = document.querySelector('[aria-label="Agregar Tarea"]');
    pointer(item, 'pointerdown', -100, 200);
    pointer(window, 'pointermove', 500, 300);
    if (cancel === 'outside') pointer(window, 'pointerup', -20, 300);
    if (cancel === 'pointercancel') pointer(window, 'pointercancel', 500, 300);
    if (cancel === 'escape') window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    pointer(window, 'pointerup', 500, 300);
    assert.ok(document.getElementById('statusbar').textContent.includes('N:0 E:0'));
    assert.equal(document.querySelector('.palette-drag-ghost'), null);
  }
});
test('dragging creates a movable node at the drop point after zooming', () => {
  fresh(); click('zoom-in');
  const item = document.querySelector('[aria-label="Agregar Tarea"]');
  pointer(item, 'pointerdown', -100, 200);
  pointer(window, 'pointermove', 650, 400);
  pointer(window, 'pointerup', 650, 400);
  canvas.dispatchEvent(new window.MouseEvent('mousedown', { clientX: 900, clientY: 600, button: 0, bubbles: true }));
  window.dispatchEvent(new window.MouseEvent('mouseup', { clientX: 900, clientY: 600, button: 0, bubbles: true })); flush();
  assert.ok(!document.getElementById('no-selection').classList.contains('hidden'));
  canvas.dispatchEvent(new window.MouseEvent('mousedown', { clientX: 650, clientY: 400, button: 0, bubbles: true })); flush();
  assert.ok(document.getElementById('no-selection').classList.contains('hidden'));
  window.dispatchEvent(new window.MouseEvent('mousemove', { clientX: 750, clientY: 450, bubbles: true }));
  window.dispatchEvent(new window.MouseEvent('mouseup', { clientX: 750, clientY: 450, button: 0, bubbles: true })); flush();
  assert.ok(document.getElementById('statusbar').textContent.includes('N:1 E:0'));
});
