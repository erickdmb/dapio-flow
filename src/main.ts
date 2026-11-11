import "./style.css";
import { Camera } from "./canvas/camera";
import { hitTestNode, renderDiagram } from "./canvas/renderer";
import { createEmptyDocument, createOitNode } from "./model/defaults";
import { calculateDapSummary } from "./model/summary";
import type { OitKind } from "./model/types";

const canvas = document.getElementById("diagram-canvas") as HTMLCanvasElement | null;
const statusbar = document.getElementById("statusbar");
if (!canvas) throw new Error("Canvas no encontrado");
const ctx = canvas.getContext("2d");
if (!ctx) throw new Error("Contexto 2D no disponible");

const camera = new Camera();
const doc = createEmptyDocument();
let selectedId: string | null = null;
let oitCounter = 1;

let spaceDown = false;
let panning = false;
let draggingNode = false;
let last = { x: 0, y: 0 };

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
  const sel = selectedId ? " · Selección activa" : "";
  if (statusbar) {
    statusbar.textContent = `Nodos: ${doc.diagram.nodes.length} | Op:${s.operations} Tr:${s.transports} Insp:${s.inspections} Dem:${s.delays} Alm:${s.storages} | Tiempo: ${s.total_time_seconds}s | Dist: ${s.total_distance_meters}m${sel}`;
  }
}

function draw() {
  const parent = canvas.parentElement!;
  renderDiagram(ctx, parent.clientWidth, parent.clientHeight, camera, doc.diagram, selectedId);
  updateStatus();
}

function addOit(kind: OitKind) {
  const parent = canvas.parentElement!;
  const center = camera.screenToWorld(parent.clientWidth / 2, parent.clientHeight / 2);
  const snap = (v: number) => Math.round(v / 20) * 20;
  const node = createOitNode(kind, snap(center.x), snap(center.y), oitCounter++);
  doc.diagram.nodes.push(node);
  selectedId = node.id;
  draw();
}

document.querySelectorAll<HTMLButtonElement>("[data-add]").forEach((btn) => {
  btn.addEventListener("click", () => addOit(btn.dataset.add as OitKind));
});
document.getElementById("btn-delete")?.addEventListener("click", () => {
  if (!selectedId) return;
  doc.diagram.nodes = doc.diagram.nodes.filter((n) => n.id !== selectedId);
  doc.diagram.edges = doc.diagram.edges.filter((e) => e.source.node_id !== selectedId && e.target.node_id !== selectedId);
  selectedId = null;
  draw();
});
document.getElementById("btn-reset-view")?.addEventListener("click", () => {
  camera.x = 40; camera.y = 40; camera.scale = 1; draw();
});

window.addEventListener("keydown", (e) => {
  if (e.code === "Space") spaceDown = true;
  if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag !== "INPUT" && tag !== "TEXTAREA") {
      doc.diagram.nodes = doc.diagram.nodes.filter((n) => n.id !== selectedId);
      selectedId = null; draw();
    }
  }
});
window.addEventListener("keyup", (e) => { if (e.code === "Space") spaceDown = false; });

canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  camera.zoomAt(e.clientX - rect.left, e.clientY - rect.top, e.deltaY);
  draw();
}, { passive: false });

canvas.addEventListener("mousedown", (e) => {
  const rect = canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;
  last = { x: e.clientX, y: e.clientY };
  if (e.button === 1 || (e.button === 0 && spaceDown)) {
    panning = true; canvas.style.cursor = "grabbing"; return;
  }
  if (e.button === 0) {
    const w = camera.screenToWorld(sx, sy);
    const hit = hitTestNode(doc.diagram, w.x, w.y);
    if (hit) {
      selectedId = hit.id;
      draggingNode = true;
      // bring to front
      doc.diagram.nodes = doc.diagram.nodes.filter((n) => n.id !== hit.id).concat(hit);
    } else {
      selectedId = null;
    }
    draw();
  }
});

window.addEventListener("mousemove", (e) => {
  if (panning) {
    camera.pan(e.clientX - last.x, e.clientY - last.y);
    last = { x: e.clientX, y: e.clientY };
    draw();
  } else if (draggingNode && selectedId) {
    const node = doc.diagram.nodes.find((n) => n.id === selectedId);
    if (node) {
      const dx = (e.clientX - last.x) / camera.scale;
      const dy = (e.clientY - last.y) / camera.scale;
      node.position.x += dx; node.position.y += dy;
      last = { x: e.clientX, y: e.clientY };
      draw();
    }
  }
});

window.addEventListener("mouseup", () => {
  if (draggingNode && selectedId) {
    const node = doc.diagram.nodes.find((n) => n.id === selectedId);
    if (node) { // snap
      node.position.x = Math.round(node.position.x / 20) * 20;
      node.position.y = Math.round(node.position.y / 20) * 20;
    }
  }
  panning = false; draggingNode = false; canvas.style.cursor = "default"; draw();
});

window.addEventListener("resize", resize);
camera.x = 40; camera.y = 40;
resize();