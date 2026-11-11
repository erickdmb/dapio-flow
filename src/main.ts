import "./style.css";
import { Camera } from "./canvas/camera";
import { hitTestEdge, hitTestNode, hitTestPort, nodeSize, renderDiagram } from "./canvas/renderer";
import { createEmptyDocument, createOitNode } from "./model/defaults";
import { calculateDapSummary } from "./model/summary";
import { validateDiagram } from "./model/validation";
import type { DiagramEdge, NotationType, OitKind, ProjectDocument } from "./model/types";
import { diagramToCsv, downloadCsv } from "./export/csv";
import { documentToDapExcelXml, downloadExcel } from "./export/excel";
import { documentToBpmnXml, downloadBpmn } from "./export/bpmn";
import { importBpmnFromFilePicker } from "./import/bpmn";
import { openDocument, saveDocument } from "./persistence";

const canvas = document.getElementById("diagram-canvas") as HTMLCanvasElement | null;
const statusbar = document.getElementById("statusbar");
if (!canvas) throw new Error("Canvas no encontrado");
const ctx = canvas.getContext("2d");
if (!ctx) throw new Error("Contexto 2D no disponible");

const camera = new Camera();
let doc: ProjectDocument = createEmptyDocument();
let selectedNodeId: string | null = null;
let selectedEdgeId: string | null = null;
let oitCounter = 1;

let connectMode = false;
let pendingPort: { nodeId: string; portId: string } | null = null;
let hoverPort: { nodeId: string; portId: string } | null = null;

let spaceDown = false;
let panning = false;
let draggingNode = false;
let dragSnapshotTaken = false;
let last = { x: 0, y: 0 };

const connectBtn = document.getElementById("btn-connect") as HTMLButtonElement | null;
const paletteItemsEl = document.getElementById("palette-items");
const startModal = document.getElementById("start-modal");

const propLabel = document.getElementById("prop-label") as HTMLInputElement | null;
const propKind = document.getElementById("prop-kind") as HTMLInputElement | null;
const propTime = document.getElementById("prop-time") as HTMLInputElement | null;
const propDist = document.getElementById("prop-dist") as HTMLInputElement | null;
const propResource = document.getElementById("prop-resource") as HTMLInputElement | null;
const nodeForm = document.getElementById("node-form");
const noSelection = document.getElementById("no-selection");
const summaryBox = document.getElementById("summary-box");
const validationBox = document.getElementById("validation-box");
const projName = document.getElementById("proj-name") as HTMLInputElement | null;
const projNotation = document.getElementById("proj-notation") as HTMLSelectElement | null;
const projMethod = document.getElementById("proj-method") as HTMLSelectElement | null;
const projAnalyst = document.getElementById("proj-analyst") as HTMLInputElement | null;

const undoStack: string[] = [];
const redoStack: string[] = [];
function snapshot() {
  undoStack.push(JSON.stringify(doc));
  if (undoStack.length > 120) undoStack.shift();
  redoStack.length = 0;
}
function restore(json: string) {
  doc = JSON.parse(json) as ProjectDocument;
  selectedNodeId = null; selectedEdgeId = null; pendingPort = null;
}
function undo() { if (!undoStack.length) { draw("Nada para deshacer"); return; } redoStack.push(JSON.stringify(doc)); restore(undoStack.pop()!); draw("Deshacer"); }
function redo() { if (!redoStack.length) { draw("Nada para rehacer"); return; } undoStack.push(JSON.stringify(doc)); restore(redoStack.pop()!); draw("Rehacer"); }

let raf = 0;
let pendingExtra: string | undefined;
function requestDraw(extra?: string) {
  if (extra !== undefined) pendingExtra = extra;
  if (raf) return;
  raf = requestAnimationFrame(() => { raf = 0; const e = pendingExtra; pendingExtra = undefined; draw(e); });
}

function resize() {
  const parent = canvas.parentElement!;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(parent.clientWidth * dpr);
  canvas.height = Math.floor(parent.clientHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  requestDraw();
}

function syncProjectForm() {
  if (projName && document.activeElement !== projName) projName.value = doc.metadata.name || "";
  if (projNotation && document.activeElement !== projNotation) projNotation.value = doc.metadata.notation;
  if (projMethod && document.activeElement !== projMethod) projMethod.value = doc.metadata.method;
  if (projAnalyst && document.activeElement !== projAnalyst) projAnalyst.value = doc.metadata.analyst || "";
}

function syncPanel() {
  syncProjectForm();
  const node = selectedNodeId ? doc.diagram.nodes.find(n => n.id === selectedNodeId) : null;
  if (node && nodeForm && noSelection) {
    nodeForm.classList.remove("hidden");
    noSelection.classList.add("hidden");
    if (propLabel && document.activeElement !== propLabel) propLabel.value = node.label || "";
    if (propKind) propKind.value = node.kind.type === "OIT" ? node.kind.value : node.kind.value;
    if (propTime && document.activeElement !== propTime) propTime.value = String(node.metrics.time_seconds ?? "");
    if (propDist && document.activeElement !== propDist) propDist.value = String(node.metrics.distance_meters ?? "");
    if (propResource && document.activeElement !== propResource) propResource.value = node.resource ?? "";
  } else if (nodeForm && noSelection) {
    nodeForm.classList.add("hidden");
    noSelection.classList.remove("hidden");
  }
  const s = calculateDapSummary(doc.diagram);
  if (summaryBox) summaryBox.innerHTML = `Op: <b>${s.operations}</b> · Tr: <b>${s.transports}</b> · Insp: <b>${s.inspections}</b><br/>Dem: <b>${s.delays}</b> · Alm: <b>${s.storages}</b><br/>Tiempo: <b>${s.total_time_seconds}s</b><br/>Distancia: <b>${s.total_distance_meters}m</b>`;
  const v = validateDiagram(doc.diagram, doc.metadata.notation);
  if (validationBox) {
    validationBox.innerHTML = v.ok
      ? `<div class="validation-ok">Sin incidencias (${doc.metadata.notation})</div>`
      : v.issues.map(i => `<div class="validation-err">• [${i.code}] ${i.message}</div>`).join("");
  }
}

function updateStatus(extra?: string) {
  const s = calculateDapSummary(doc.diagram);
  const sel = selectedNodeId ? " · Nodo seleccionado" : selectedEdgeId ? " · Conector seleccionado" : "";
  const mode = connectMode ? (pendingPort ? " · Conectar: puerto destino" : " · Conectar: puerto origen") : "";
  const msg = extra ? ` · ${extra}` : "";
  if (statusbar) statusbar.textContent = `${doc.metadata.name} (${doc.metadata.notation}) | Nodos: ${doc.diagram.nodes.length} | Aristas: ${doc.diagram.edges.length} | Op:${s.operations} Tr:${s.transports} Insp:${s.inspections} Dem:${s.delays} Alm:${s.storages} | T:${s.total_time_seconds}s D:${s.total_distance_meters}m${sel}${mode}${msg}`;
}

function draw(extra?: string) {
  const parent = canvas.parentElement!;
  renderDiagram(ctx, parent.clientWidth, parent.clientHeight, camera, doc.diagram, selectedNodeId, selectedEdgeId, pendingPort, hoverPort);
  syncPanel();
  renderPalette();
  updateStatus(extra);
}

function setConnectMode(on: boolean) {
  connectMode = on; pendingPort = null;
  if (connectBtn) connectBtn.classList.toggle("active", on);
  requestDraw();
}

function nextCounter() { const n = doc.diagram.nodes.length + oitCounter; oitCounter += 1; return n; }

function addOitAt(kind: OitKind, worldX: number, worldY: number) {
  snapshot();
  const snap = (v: number) => Math.round(v / 20) * 20;
  const node = createOitNode(kind, snap(worldX), snap(worldY), nextCounter());
  doc.diagram.nodes.push(node);
  selectedNodeId = node.id; selectedEdgeId = null;
  requestDraw();
}

function deleteSelection() {
  if (!selectedNodeId && !selectedEdgeId) return;
  snapshot();
  if (selectedNodeId) {
    doc.diagram.nodes = doc.diagram.nodes.filter((n) => n.id !== selectedNodeId);
    doc.diagram.edges = doc.diagram.edges.filter((e) => e.source.node_id !== selectedNodeId && e.target.node_id !== selectedNodeId);
    selectedNodeId = null;
  } else if (selectedEdgeId) {
    doc.diagram.edges = doc.diagram.edges.filter((e) => e.id !== selectedEdgeId);
    selectedEdgeId = null;
  }
  requestDraw();
}

const paletteDefs: Array<{kind: OitKind, label: string, notations: NotationType[]}> = [
  { kind: "OPERATION", label: "Operación", notations: ["DAP","DOP","BPMN"] },
  { kind: "INSPECTION", label: "Inspección", notations: ["DAP","DOP","BPMN"] },
  { kind: "TRANSPORT", label: "Transporte", notations: ["DAP"] },
  { kind: "DELAY", label: "Demora", notations: ["DAP"] },
  { kind: "STORAGE", label: "Almacenamiento", notations: ["DAP"] },
  { kind: "COMBINED", label: "Combinada", notations: ["DAP"] },
];

function renderPalette() {
  if (!paletteItemsEl) return;
  paletteItemsEl.innerHTML = "";
  for (const def of paletteDefs) {
    const allowed = def.notations.includes(doc.metadata.notation);
    const item = document.createElement("div");
    item.className = "palette-item" + (allowed ? "" : " disabled");
    item.draggable = allowed;
    const icon = document.createElement("canvas");
    icon.width = 48; icon.height = 36;
    const ictx = icon.getContext("2d");
    if (ictx) {
      ictx.translate(24,18);
      ictx.strokeStyle = "#222"; ictx.fillStyle = "#fff"; ictx.lineWidth = 1.5;
      // simple glyphs
      const {w,h} = nodeSize(def.kind);
      const sx = 0.7, sy = 0.7;
      ictx.scale(sx,sy);
      switch(def.kind){
        case "OPERATION": ictx.beginPath(); ictx.arc(0,0,w/2,0,Math.PI*2); ictx.fill(); ictx.stroke(); break;
        case "INSPECTION": ictx.beginPath(); ictx.rect(-w/2,-h/2,w,h); ictx.fill(); ictx.stroke(); break;
        case "DELAY": ictx.beginPath(); ictx.moveTo(-w/2,-h/2); ictx.lineTo(-w/2,h/2); ictx.arc(-w/2,0,h/2,Math.PI/2,-Math.PI/2,true); ictx.closePath(); ictx.fill(); ictx.stroke(); break;
        case "STORAGE": ictx.beginPath(); ictx.moveTo(0,h/2); ictx.lineTo(-w/2,-h/2); ictx.lineTo(w/2,-h/2); ictx.closePath(); ictx.fill(); ictx.stroke(); break;
        case "COMBINED": ictx.beginPath(); ictx.rect(-w/2,-h/2,w,h); ictx.fill(); ictx.stroke(); ictx.beginPath(); ictx.arc(0,0,w/2-2,0,Math.PI*2); ictx.stroke(); break;
        case "TRANSPORT": ictx.beginPath(); ictx.moveTo(-w/2,-h/2); ictx.lineTo(w/2-10,-h/2); ictx.lineTo(w/2,0); ictx.lineTo(w/2-10,h/2); ictx.lineTo(-w/2,h/2); ictx.closePath(); ictx.fill(); ictx.stroke(); break;
      }
    }
    const label = document.createElement("span"); label.textContent = def.label;
    item.appendChild(icon); item.appendChild(label);
    if (allowed) {
      item.addEventListener("dragstart", (ev) => { ev.dataTransfer?.setData("application/x-oit-kind", def.kind); });
      item.addEventListener("dblclick", () => {
        const c = canvas!.parentElement!;
        const p = camera.screenToWorld(c.clientWidth/2, c.clientHeight/2);
        addOitAt(def.kind, p.x, p.y);
      });
    }
    paletteItemsEl.appendChild(item);
  }
}

canvas.addEventListener("dragover", (e) => { e.preventDefault(); });
canvas.addEventListener("drop", (e) => {
  e.preventDefault();
  const kind = e.dataTransfer?.getData("application/x-oit-kind") as OitKind | undefined;
  if (!kind) return;
  const rect = canvas.getBoundingClientRect();
  const w = camera.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
  addOitAt(kind, w.x, w.y);
});

function showStartModal(show: boolean) { if (!startModal) return; startModal.classList.toggle("hidden", !show); }
document.querySelectorAll<HTMLButtonElement>(".type-card").forEach(btn => {
  btn.addEventListener("click", () => {
    const t = btn.dataset.type as NotationType;
    snapshot();
    doc.metadata.notation = t;
    showStartModal(false);
    requestDraw(`Nuevo diagrama ${t}`);
  });
});
document.getElementById("btn-new")?.addEventListener("click", () => showStartModal(true));

connectBtn?.addEventListener("click", () => setConnectMode(!connectMode));
document.getElementById("btn-delete")?.addEventListener("click", deleteSelection);
document.getElementById("btn-reset-view")?.addEventListener("click", () => { camera.x = 60; camera.y = 60; camera.scale = 1; requestDraw(); });

document.getElementById("btn-save")?.addEventListener("click", async () => { const msg = await saveDocument(doc); requestDraw(msg); });
document.getElementById("btn-open")?.addEventListener("click", async () => {
  const res = await openDocument();
  if (res.doc && res.doc.diagram) { snapshot(); doc = res.doc; selectedNodeId = null; selectedEdgeId = null; pendingPort = null; oitCounter = 1; }
  requestDraw(res.message);
});
document.getElementById("btn-import-bpmn")?.addEventListener("click", async () => {
  const res = await importBpmnFromFilePicker();
  if (res.doc && res.doc.diagram) { snapshot(); doc = res.doc; selectedNodeId = null; selectedEdgeId = null; pendingPort = null; oitCounter = 1; }
  requestDraw(res.message);
});
document.getElementById("btn-export-csv")?.addEventListener("click", () => {
  const name = `${(doc.metadata.name || "proceso").replace(/[^a-z0-9-_]+/gi, "_")}_dap.csv`;
  downloadCsv(name, diagramToCsv(doc.diagram)); requestDraw("CSV exportado");
});
document.getElementById("btn-export-xls")?.addEventListener("click", () => {
  const name = `${(doc.metadata.name || "proceso").replace(/[^a-z0-9-_]+/gi, "_")}_ficha_dap.xls`;
  downloadExcel(name, documentToDapExcelXml(doc)); requestDraw("Ficha DAP exportada");
});
document.getElementById("btn-export-bpmn")?.addEventListener("click", () => {
  const name = `${(doc.metadata.name || "proceso").replace(/[^a-z0-9-_]+/gi, "_")}.bpmn`;
  downloadBpmn(name, documentToBpmnXml(doc)); requestDraw("BPMN 2.0 exportado");
});

window.addEventListener("keydown", (e) => {
  if (e.code === "Space") spaceDown = true;
  if (e.key === "Escape") setConnectMode(false);
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === "z" && !e.shiftKey) { e.preventDefault(); undo(); return; }
  if (mod && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) { e.preventDefault(); redo(); return; }
  if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); saveDocument(doc).then((msg) => requestDraw(msg)); }
  if (e.key === "Delete" || e.key === "Backspace") {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag !== "INPUT" && tag !== "TEXTAREA" && tag !== "SELECT") deleteSelection();
  }
});
window.addEventListener("keyup", (e) => { if (e.code === "Space") spaceDown = false; });

function findPortAtWorld(wx: number, wy: number) {
  for (let i = doc.diagram.nodes.length - 1; i >= 0; i--) {
    const n = doc.diagram.nodes[i];
    const p = hitTestPort(n, wx, wy, 8);
    if (p) return { nodeId: n.id, portId: p.id };
  }
  return null;
}

canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  camera.zoomAt(e.clientX - rect.left, e.clientY - rect.top, e.deltaY);
  requestDraw();
}, { passive: false });

canvas.addEventListener("mousedown", (e) => {
  const rect = canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
  last = { x: e.clientX, y: e.clientY };
  if (e.button === 1 || (e.button === 0 && spaceDown)) { panning = true; canvas.style.cursor = "grabbing"; return; }
  if (e.button !== 0) return;
  const w = camera.screenToWorld(sx, sy);
  if (connectMode) {
    const port = findPortAtWorld(w.x, w.y);
    if (port) {
      if (!pendingPort) pendingPort = port;
      else if (pendingPort.nodeId !== port.nodeId || pendingPort.portId !== port.portId) {
        snapshot();
        const edge: DiagramEdge = { id: crypto.randomUUID(), source: { node_id: pendingPort.nodeId, port_id: pendingPort.portId }, target: { node_id: port.nodeId, port_id: port.portId }, label: null, kind: "SEQUENCE_FLOW" };
        doc.diagram.edges.push(edge); selectedEdgeId = edge.id; selectedNodeId = null; pendingPort = null;
      }
    }
    requestDraw(); return;
  }
  const node = hitTestNode(doc.diagram, w.x, w.y);
  if (node) {
    selectedNodeId = node.id; selectedEdgeId = null; draggingNode = true; dragSnapshotTaken = false;
    doc.diagram.nodes = doc.diagram.nodes.filter((n) => n.id !== node.id).concat(node);
  } else {
    const edge = hitTestEdge(doc.diagram, w.x, w.y);
    if (edge) { selectedEdgeId = edge.id; selectedNodeId = null; } else { selectedNodeId = null; selectedEdgeId = null; }
  }
  requestDraw();
});

window.addEventListener("mousemove", (e) => {
  const rect = canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
  const w = camera.screenToWorld(sx, sy);
  const nextHover = findPortAtWorld(w.x, w.y);
  const hoverChanged = (nextHover?.nodeId !== hoverPort?.nodeId || nextHover?.portId !== hoverPort?.portId);
  hoverPort = nextHover;
  if (panning) { camera.pan(e.clientX - last.x, e.clientY - last.y); last = { x: e.clientX, y: e.clientY }; requestDraw(); return; }
  if (draggingNode && selectedNodeId) {
    const node = doc.diagram.nodes.find((n) => n.id === selectedNodeId);
    if (node) {
      if (!dragSnapshotTaken) { snapshot(); dragSnapshotTaken = true; }
      node.position.x += (e.clientX - last.x) / camera.scale;
      node.position.y += (e.clientY - last.y) / camera.scale;
      last = { x: e.clientX, y: e.clientY }; requestDraw();
    }
    return;
  }
  if (hoverChanged || connectMode) requestDraw();
});

window.addEventListener("mouseup", () => {
  if (draggingNode && selectedNodeId) {
    const node = doc.diagram.nodes.find((n) => n.id === selectedNodeId);
    if (node) { node.position.x = Math.round(node.position.x / 20) * 20; node.position.y = Math.round(node.position.y / 20) * 20; }
  }
  panning = false; draggingNode = false; dragSnapshotTaken = false; canvas.style.cursor = "default"; requestDraw();
});

function bindPropInputs() {
  let propTimer: any = null;
  const onChange = () => {
    if (!selectedNodeId) return;
    const node = doc.diagram.nodes.find(n => n.id === selectedNodeId);
    if (!node) return;
    if (!propTimer) snapshot();
    clearTimeout(propTimer); propTimer = setTimeout(() => { propTimer = null; }, 500);
    if (propLabel) node.label = propLabel.value;
    if (propResource) node.resource = propResource.value || null;
    if (propTime) node.metrics.time_seconds = propTime.value === "" ? null : Number(propTime.value);
    if (propDist) node.metrics.distance_meters = propDist.value === "" ? null : Number(propDist.value);
    requestDraw();
  };
  [propLabel, propResource, propTime, propDist].forEach(el => { el?.addEventListener("input", onChange); el?.addEventListener("change", () => { propTimer = null; }); });
  const onProj = () => {
    snapshot();
    if (projName) doc.metadata.name = projName.value || "Nuevo proceso";
    if (projNotation) doc.metadata.notation = projNotation.value as any;
    if (projMethod) doc.metadata.method = projMethod.value as any;
    if (projAnalyst) doc.metadata.analyst = projAnalyst.value || null;
    requestDraw();
  };
  [projName, projAnalyst].forEach(el => { el?.addEventListener("change", onProj); });
  [projNotation, projMethod].forEach(el => { el?.addEventListener("change", onProj); });
}
bindPropInputs();
window.addEventListener("resize", resize);
camera.x = 60; camera.y = 60;
renderPalette();
showStartModal(true);
resize();