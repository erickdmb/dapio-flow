import "./style.css";
import { Camera } from "./canvas/camera";
import { hitTestEdge, hitTestNode, hitTestPort, renderDiagram } from "./canvas/renderer";
import { createEmptyDocument, createOitNode } from "./model/defaults";
import { calculateDapSummary } from "./model/summary";
import type { DiagramEdge, OitKind } from "./model/types";

const canvas = document.getElementById("diagram-canvas") as HTMLCanvasElement | null;
const statusbar = document.getElementById("statusbar");
if (!canvas) throw new Error("Canvas no encontrado");
const ctx = canvas.getContext("2d");
if (!ctx) throw new Error("Contexto 2D no disponible");

const camera = new Camera();
const doc = createEmptyDocument();
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

function updateStatus() {
  const s = calculateDapSummary(doc.diagram);
  const sel = selectedNodeId ? " · Nodo seleccionado" : selectedEdgeId ? " · Conector seleccionado" : "";
  const mode = connectMode ? (pendingPort ? " · Conectar: elige puerto destino" : " · Conectar: elige puerto origen") : "";
  if (statusbar) {
    statusbar.textContent = `Nodos: ${doc.diagram.nodes.length} | Aristas: ${doc.diagram.edges.length} | Op:${s.operations} Tr:${s.transports} Insp:${s.inspections} Dem:${s.delays} Alm:${s.storages} | Tiempo: ${s.total_time_seconds}s | Dist: ${s.total_distance_meters}m${sel}${mode}`;
  }
}

function draw() {
  const parent = canvas.parentElement!;
  renderDiagram(ctx, parent.clientWidth, parent.clientHeight, camera, doc.diagram, selectedNodeId, selectedEdgeId, pendingPort, hoverPort);
  updateStatus();
}

function setConnectMode(on: boolean) {
  connectMode = on;
  pendingPort = null;
  if (connectBtn) connectBtn.classList.toggle("active", on);
  draw();
}

function addOit(kind: OitKind) {
  const parent = canvas.parentElement!;
  const center = camera.screenToWorld(parent.clientWidth / 2, parent.clientHeight / 2);
  const snap = (v: number) => Math.round(v / 20) * 20;
  const node = createOitNode(kind, snap(center.x), snap(center.y), oitCounter++);
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

window.addEventListener("keydown", (e) => {
  if (e.code === "Space") spaceDown = true;
  if (e.key === "Escape") setConnectMode(false);
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

    const hitPort = findPortAtWorld(w.x, w.y);
    if (hitPort) { // start quick connect by grabbing port without mode? keep simple: prefer node/edge
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
  hoverPort = (connectMode || panning === false) ? findPortAtWorld(w.x, w.y) : null;
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