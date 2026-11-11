import "./style.css";
import { Camera } from "./canvas/camera";
import { hitTestEdge, hitTestNode, hitTestPort, renderDiagram } from "./canvas/renderer";
import { createEmptyDocument, createOitNode } from "./model/defaults";
import { calculateDapSummary } from "./model/summary";
import type { DiagramEdge, OitKind, ProjectDocument } from "./model/types";
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
let last = { x: 0, y: 0 };

const connectBtn = document.getElementById("btn-connect") as HTMLButtonElement | null;

function resize() {
  const parent = canvas.parentElement!;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(parent.clientWidth * dpr);
  canvas.height = Math.floor(parent.clientHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  draw();
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
  const parent = canvas.parentElement!;
  const center = camera.screenToWorld(parent.clientWidth / 2, parent.clientHeight / 2);
  const snap = (v: number) => Math.round(v / 20) * 20;
  const node = createOitNode(kind, snap(center.x), snap(center.y), nextCounter());
  doc.diagram.nodes.push(node);
  selectedNodeId = node.id; selectedEdgeId = null;
  draw();
}

function deleteSelection() {
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

document.getElementById("btn-save")?.addEventListener("click", async () => {
  const msg = await saveDocument(doc);
  draw(msg);
});
document.getElementById("btn-open")?.addEventListener("click", async () => {
  const res = await openDocument();
  if (res.doc && res.doc.diagram) {
    doc = res.doc;
    selectedNodeId = null; selectedEdgeId = null; pendingPort = null; oitCounter = 1;
  }
  draw(res.message);
});

window.addEventListener("keydown", (e) => {
  if (e.code === "Space") spaceDown = true;
  if (e.key === "Escape") setConnectMode(false);
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
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
  panning = false; draggingNode = false; canvas.style.cursor = "default"; draw();
});

window.addEventListener("resize", resize);
camera.x = 40; camera.y = 40;
resize();