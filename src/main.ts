import "./style.css";
import { Camera } from "./canvas/camera";
import { hitTestEdge, hitTestNode, hitTestPort, renderDiagram } from "./canvas/renderer";
import { createEmptyDocument, createOitNode } from "./model/defaults";
import { calculateDapSummary } from "./model/summary";
import { validateDiagram } from "./model/validation";
import type { DiagramEdge, OitKind, ProjectDocument } from "./model/types";
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

const undoStack: string[] = [];
const redoStack: string[] = [];
function snapshot() {
  undoStack.push(JSON.stringify(doc));
  if (undoStack.length > 100) undoStack.shift();
  redoStack.length = 0;
}
function restore(json: string) {
  doc = JSON.parse(json) as ProjectDocument;
  selectedNodeId = null; selectedEdgeId = null; pendingPort = null;
}
function undo() {
  if (!undoStack.length) { draw("Nada para deshacer"); return; }
  redoStack.push(JSON.stringify(doc));
  restore(undoStack.pop()!);
  draw("Deshacer");
}
function redo() {
  if (!redoStack.length) { draw("Nada para rehacer"); return; }
  undoStack.push(JSON.stringify(doc));
  restore(redoStack.pop()!);
  draw("Rehacer");
}

let connectMode = false;
let pendingPort: { nodeId: string; portId: string } | null = null;
let hoverPort: { nodeId: string; portId: string } | null = null;

let spaceDown = false;
let panning = false;
let draggingNode = false;
let dragStarted = false;
let dragSnapshotTaken = false;
let last = { x: 0, y: 0 };

const connectBtn = document.getElementById("btn-connect") as HTMLButtonElement | null;

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

function resize() {
  const parent = canvas.parentElement!;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(parent.clientWidth * dpr);
  canvas.height = Math.floor(parent.clientHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  draw();
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
  if (summaryBox) {
    summaryBox.innerHTML = `Op: <b>${s.operations}</b> · Tr: <b>${s.transports}</b> · Insp: <b>${s.inspections}</b><br/>Dem: <b>${s.delays}</b> · Alm: <b>${s.storages}</b><br/>Tiempo total: <b>${s.total_time_seconds}s</b><br/>Distancia total: <b>${s.total_distance_meters}m</b>`;
  }
  const v = validateDiagram(doc.diagram, doc.metadata.notation);
  if (validationBox) {
    if (v.ok) validationBox.innerHTML = `<div class="validation-ok">Sin incidencias (${doc.metadata.notation})</div>`;
    else validationBox.innerHTML = v.issues.map(i => `<div class="validation-err">• [${i.code}] ${i.message}</div>`).join("");
  }
}

function updateStatus(extra?: string) {
  const s = calculateDapSummary(doc.diagram);
  const sel = selectedNodeId ? " · Nodo seleccionado" : selectedEdgeId ? " · Conector seleccionado" : "";
  const mode = connectMode ? (pendingPort ? " · Conectar: elige puerto destino" : " · Conectar: elige puerto origen") : "";
  const msg = extra ? ` · ${extra}` : "";
  if (statusbar) {
    statusbar.textContent = `${doc.metadata.name} | Nodos: ${doc.diagram.nodes.length} | Aristas: ${doc.diagram.edges.length} | Op:${s.operations} Tr:${s.transports} Insp:${s.inspections} Dem:${s.delays} Alm:${s.storages} | Tiempo: ${s.total_time_seconds}s | Dist: ${s.total_distance_meters}m${sel}${mode}${msg}`;
  }
}

function draw(extra?: string) {
  const parent = canvas.parentElement!;
  renderDiagram(ctx, parent.clientWidth, parent.clientHeight, camera, doc.diagram, selectedNodeId, selectedEdgeId, pendingPort, hoverPort);
  syncPanel();
  updateStatus(extra);
}

function setConnectMode(on: boolean) {
  connectMode = on;
  pendingPort = null;
  if (connectBtn) connectBtn.classList.toggle("active", on);
  draw();
}

function nextCounter() {
  const n = doc.diagram.nodes.length + oitCounter;
  oitCounter += 1;
  return n;
}

function addOit(kind: OitKind) {
  snapshot();
  const parent = canvas.parentElement!;
  const center = camera.screenToWorld(parent.clientWidth / 2, parent.clientHeight / 2);
  const snap = (v: number) => Math.round(v / 20) * 20;
  const node = createOitNode(kind, snap(center.x), snap(center.y), nextCounter());
  doc.diagram.nodes.push(node);
  selectedNodeId = node.id; selectedEdgeId = null;
  draw();
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
  draw();
}

document.querySelectorAll<HTMLButtonElement>("[data-add]").forEach((btn) => {
  btn.addEventListener("click", () => addOit(btn.dataset.add as OitKind));
});
connectBtn?.addEventListener("click", () => setConnectMode(!connectMode));
document.getElementById("btn-delete")?.addEventListener("click", deleteSelection);
document.getElementById("btn-reset-view")?.addEventListener("click", () => { camera.x = 40; camera.y = 40; camera.scale = 1; draw(); });

function bindPropInputs() {
  let propTimer: any = null;
  const onChange = () => {
    if (!selectedNodeId) return;
    const node = doc.diagram.nodes.find(n => n.id === selectedNodeId);
    if (!node) return;
    // debounce snapshot for typing
    if (!propTimer) snapshot();
    clearTimeout(propTimer);
    propTimer = setTimeout(() => { propTimer = null; }, 500);
    if (propLabel) node.label = propLabel.value;
    if (propResource) node.resource = propResource.value || null;
    if (propTime) node.metrics.time_seconds = propTime.value === "" ? null : Number(propTime.value);
    if (propDist) node.metrics.distance_meters = propDist.value === "" ? null : Number(propDist.value);
    draw();
  };
  [propLabel, propResource, propTime, propDist].forEach(el => {
    el?.addEventListener("input", onChange);
    el?.addEventListener("change", () => { propTimer = null; });
  });

  const onProj = () => {
    snapshot();
    if (projName) doc.metadata.name = projName.value || "Nuevo proceso";
    if (projNotation) doc.metadata.notation = projNotation.value as any;
    if (projMethod) doc.metadata.method = projMethod.value as any;
    if (projAnalyst) doc.metadata.analyst = projAnalyst.value || null;
    draw();
  };
  [projName, projAnalyst].forEach(el => { el?.addEventListener("change", onProj); });
  [projNotation, projMethod].forEach(el => { el?.addEventListener("change", onProj); });
}
bindPropInputs();

document.getElementById("btn-save")?.addEventListener("click", async () => {
  const msg = await saveDocument(doc);
  draw(msg);
});
document.getElementById("btn-open")?.addEventListener("click", async () => {
  const res = await openDocument();
  if (res.doc && res.doc.diagram) {
    snapshot();
    doc = res.doc;
    selectedNodeId = null; selectedEdgeId = null; pendingPort = null; oitCounter = 1;
  }
  draw(res.message);
});
document.getElementById("btn-export-csv")?.addEventListener("click", () => {
  const csv = diagramToCsv(doc.diagram);
  const name = `${(doc.metadata.name || "proceso").replace(/[^a-z0-9-_]+/gi, "_")}_dap.csv`;
  downloadCsv(name, csv);
  draw("CSV exportado");
});
document.getElementById("btn-export-xls")?.addEventListener("click", () => {
  const xml = documentToDapExcelXml(doc);
  const name = `${(doc.metadata.name || "proceso").replace(/[^a-z0-9-_]+/gi, "_")}_ficha_dap.xls`;
  downloadExcel(name, xml);
  draw("Ficha DAP exportada (Excel)");
});
document.getElementById("btn-export-bpmn")?.addEventListener("click", () => {
  const xml = documentToBpmnXml(doc);
  const name = `${(doc.metadata.name || "proceso").replace(/[^a-z0-9-_]+/gi, "_")}.bpmn`;
  downloadBpmn(name, xml);
  draw("BPMN 2.0 exportado");
});
document.getElementById("btn-import-bpmn")?.addEventListener("click", async () => {
  const res = await importBpmnFromFilePicker();
  if (res.doc && res.doc.diagram) {
    snapshot();
    doc = res.doc;
    selectedNodeId = null; selectedEdgeId = null; pendingPort = null; oitCounter = 1;
  }
  draw(res.message);
});

window.addEventListener("keydown", (e) => {
  if (e.code === "Space") spaceDown = true;
  if (e.key === "Escape") setConnectMode(false);
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === "z" && !e.shiftKey) { e.preventDefault(); undo(); return; }
  if (mod && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) { e.preventDefault(); redo(); return; }
  if (mod && e.key.toLowerCase() === "s") {
    e.preventDefault();
    saveDocument(doc).then((msg) => draw(msg));
  }
  if ((e.key === "Delete" || e.key === "Backspace")) {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag !== "INPUT" && tag !== "TEXTAREA") deleteSelection();
  }
});
window.addEventListener("keyup", (e) => { if (e.code === "Space") spaceDown = false; });

canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  camera.zoomAt(e.clientX - rect.left, e.clientY - rect.top, e.deltaY);
  draw();
}, { passive: false });

function findPortAtWorld(wx: number, wy: number) {
  for (let i = doc.diagram.nodes.length - 1; i >= 0; i--) {
    const n = doc.diagram.nodes[i];
    const p = hitTestPort(n, wx, wy, 8);
    if (p) return { nodeId: n.id, portId: p.id };
  }
  return null;
}

canvas.addEventListener("mousedown", (e) => {
  const rect = canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left; const sy = e.clientY - rect.top;
  last = { x: e.clientX, y: e.clientY };
  if (e.button === 1 || (e.button === 0 && spaceDown)) { panning = true; canvas.style.cursor = "grabbing"; return; }
  if (e.button === 0) {
    const w = camera.screenToWorld(sx, sy);
    if (connectMode) {
      const port = findPortAtWorld(w.x, w.y);
      if (port) {
        if (!pendingPort) {
          pendingPort = port;
        } else if (pendingPort.nodeId !== port.nodeId || pendingPort.portId !== port.portId) {
          snapshot();
          const edge: DiagramEdge = {
            id: crypto.randomUUID(),
            source: { node_id: pendingPort.nodeId, port_id: pendingPort.portId },
            target: { node_id: port.nodeId, port_id: port.portId },
            label: null,
            kind: "SEQUENCE_FLOW",
          };
          doc.diagram.edges.push(edge);
          selectedEdgeId = edge.id; selectedNodeId = null;
          pendingPort = null;
        }
      }
      draw(); return;
    }

    const node = hitTestNode(doc.diagram, w.x, w.y);
    if (node) {
      selectedNodeId = node.id; selectedEdgeId = null; draggingNode = true;
      dragStarted = true; dragSnapshotTaken = false;
      doc.diagram.nodes = doc.diagram.nodes.filter((n) => n.id !== node.id).concat(node);
    } else {
      const edge = hitTestEdge(doc.diagram, w.x, w.y);
      if (edge) { selectedEdgeId = edge.id; selectedNodeId = null; }
      else { selectedNodeId = null; selectedEdgeId = null; }
    }
    draw();
  }
});

window.addEventListener("mousemove", (e) => {
  const rect = canvas.getBoundingClientRect();
  const w = camera.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
  hoverPort = findPortAtWorld(w.x, w.y);
  if (panning) {
    camera.pan(e.clientX - last.x, e.clientY - last.y);
    last = { x: e.clientX, y: e.clientY }; draw();
  } else if (draggingNode && selectedNodeId) {
    const node = doc.diagram.nodes.find((n) => n.id === selectedNodeId);
    if (node) {
      if (!dragSnapshotTaken) { snapshot(); dragSnapshotTaken = true; }
      node.position.x += (e.clientX - last.x) / camera.scale;
      node.position.y += (e.clientY - last.y) / camera.scale;
      last = { x: e.clientX, y: e.clientY }; draw();
    }
  } else if (connectMode) {
    draw();
  }
});

window.addEventListener("mouseup", () => {
  if (draggingNode && selectedNodeId) {
    const node = doc.diagram.nodes.find((n) => n.id === selectedNodeId);
    if (node) { node.position.x = Math.round(node.position.x / 20) * 20; node.position.y = Math.round(node.position.y / 20) * 20; }
  }
  panning = false; draggingNode = false; dragStarted = false; dragSnapshotTaken = false; canvas.style.cursor = "default"; draw();
});

window.addEventListener("resize", resize);
camera.x = 40; camera.y = 40;
resize();