import "./style.css";
import { Camera } from "./canvas/camera";
import { hitTestEdge, hitTestNode, hitTestPort, nearestPort, oitNodeSize, bpmnNodeSize, getNodeSize, renderDiagram } from "./canvas/renderer";
import { bpmnLabel, createBpmnNode, createEmptyDocument, createOitNode } from "./model/defaults";
import { calculateDapSummary } from "./model/summary";
import { validateDiagram } from "./model/validation";
import { formatDuration, syncTimeMetrics } from "./model/time";
import { createDapTemplate } from "./templates/dap";
import { paletteColor } from "./model/colors";
import type { BpmnElementType, DiagramEdge, NotationType, OitKind, ProjectDocument, TimeUnit } from "./model/types";
import { diagramToCsv, downloadCsv } from "./export/csv";
import { documentToDapExcelXml, downloadExcel } from "./export/excel";
import { documentToBpmnXml, downloadBpmn } from "./export/bpmn";
import { importBpmnFromFilePicker } from "./import/bpmn";
import { openDocument, saveDocument } from "./persistence";

const canvas = document.getElementById("diagram-canvas") as HTMLCanvasElement | null;
const statusbar = document.getElementById("statusbar");
if (!canvas) throw new Error("Canvas no encontrado");
const ctx = canvas.getContext("2d")!;

const camera = new Camera();
let doc: ProjectDocument = createEmptyDocument();
let selectedNodeId: string | null = null;
let selectedEdgeId: string | null = null;
let counter = 1;

let connectMode = false; // legacy toggle, default off (drag-to-connect preferred)
let currentEdgeKind: "SEQUENCE_FLOW" | "ASSOCIATION" | "MESSAGE_FLOW" = "SEQUENCE_FLOW";
let pendingPort: { nodeId: string; portId: string } | null = null;
let hoverPort: { nodeId: string; portId: string } | null = null;

let spaceDown = false, panning = false, draggingNode = false, dragSnapshotTaken = false;
let resizingNodeId: string | null = null;
let connectingDrag: { nodeId: string; portId: string } | null = null;
let mouseWorld: {x:number;y:number} | null = null;
let last = { x: 0, y: 0 };

const edgeKindSel = null as HTMLSelectElement | null; // moved into palette
const paletteItemsEl = document.getElementById("palette-items");
const paletteLegend = document.getElementById("palette-legend");
const startModal = document.getElementById("start-modal");
const analysisTbody = document.getElementById("analysis-tbody");
const summarySheet = document.getElementById("summary-sheet");
const analysisEl = document.getElementById("analysis");
const workspaceEl = document.querySelector(".workspace") as HTMLElement | null;
let paletteKey = "";

const propLabel = document.getElementById("prop-label") as HTMLInputElement | null;
const propKind = document.getElementById("prop-kind") as HTMLInputElement | null;
const propTime = document.getElementById("prop-time") as HTMLInputElement | null;
const propTimeUnit = document.getElementById("prop-time-unit") as HTMLSelectElement | null;
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

const undoStack: string[] = []; const redoStack: string[] = [];
function snapshot() { undoStack.push(JSON.stringify(doc)); if (undoStack.length > 120) undoStack.shift(); redoStack.length = 0; }
function restore(json: string) { doc = JSON.parse(json) as ProjectDocument; selectedNodeId = null; selectedEdgeId = null; pendingPort = null; }
function undo() { if (!undoStack.length) { requestDraw("Nada para deshacer"); return; } redoStack.push(JSON.stringify(doc)); restore(undoStack.pop()!); requestDraw("Deshacer"); }
function redo() { if (!redoStack.length) { requestDraw("Nada para rehacer"); return; } undoStack.push(JSON.stringify(doc)); restore(redoStack.pop()!); requestDraw("Rehacer"); }

let raf = 0, pendingExtra: string | undefined;
function requestDraw(extra?: string) { if (extra !== undefined) pendingExtra = extra; if (raf) return; raf = requestAnimationFrame(() => { raf = 0; const e = pendingExtra; pendingExtra = undefined; draw(e); }); }

function resize() { const c = canvas!; const p = c.parentElement!; const dpr = window.devicePixelRatio || 1; c.width = Math.floor(p.clientWidth * dpr); c.height = Math.floor(p.clientHeight * dpr); ctx.setTransform(dpr,0,0,dpr,0,0); requestDraw(); }

function syncProjectForm() {
  if (projName && document.activeElement !== projName) projName.value = doc.metadata.name || "";
  if (projNotation && document.activeElement !== projNotation) projNotation.value = doc.metadata.notation;
  if (projMethod && document.activeElement !== projMethod) projMethod.value = doc.metadata.method;
  if (projAnalyst && document.activeElement !== projAnalyst) projAnalyst.value = doc.metadata.analyst || "";
}
function orderedNodesForTable() {
  const byId = new Map(doc.diagram.nodes.map(n => [n.id, n]));
  const incoming = new Map<string, number>(); const outgoing = new Map<string, string[]>();
  for (const n of doc.diagram.nodes) { incoming.set(n.id, 0); outgoing.set(n.id, []); }
  for (const e of doc.diagram.edges) if (byId.has(e.source.node_id) && byId.has(e.target.node_id)) { incoming.set(e.target.node_id,(incoming.get(e.target.node_id)||0)+1); outgoing.get(e.source.node_id)!.push(e.target.node_id); }
  const result: typeof doc.diagram.nodes = []; const seen = new Set<string>();
  const queue = doc.diagram.nodes.filter(n => (incoming.get(n.id)||0)===0).map(n=>n.id);
  while(queue.length){ const id=queue.shift()!; if(seen.has(id)) continue; const node=byId.get(id); if(!node) continue; seen.add(id); result.push(node); for(const nxt of outgoing.get(id)||[]){ incoming.set(nxt,(incoming.get(nxt)||1)-1); if((incoming.get(nxt)||0)<=0) queue.push(nxt); } }
  for(const n of doc.diagram.nodes) if(!seen.has(n.id)) result.push(n);
  return result;
}
function typeLabel(n: any){ if(n.kind.type==="OIT") return n.kind.value; return `BPMN_${n.kind.value}`; }

function renderAnalysis() {
  const show = doc.metadata.notation === "DAP" || doc.metadata.notation === "DOP";
  analysisEl?.classList.toggle("hidden", !show);
  workspaceEl?.classList.toggle("no-analysis", !show);
  if (!show) return;
  const nodes = orderedNodesForTable();
  const method = doc.metadata.method === "TO_BE" ? "Propuesto" : "Actual";
  if (analysisTbody) {
    analysisTbody.innerHTML = nodes.map((n,i)=>`<tr><td>${i+1}</td><td>${method}</td><td>${(n.label||"").replace(/</g,"&lt;")}</td><td>${typeLabel(n)}</td><td>${formatDuration(n.metrics.time_seconds||0)} (${n.metrics.time_seconds||0}s)</td><td>${n.metrics.distance_meters??0} m</td><td>${(n.resource||"").replace(/</g,"&lt;")}</td></tr>`).join("") || `<tr><td colspan="7" class="muted">Sin actividades</td></tr>`;
  }
  const s = calculateDapSummary(doc.diagram);
  if (summarySheet) {
    summarySheet.innerHTML = `<strong>Hoja resumen (${doc.metadata.notation})</strong><br/>
      Método: <b>${method}</b> · Proceso: <b>${(doc.metadata.name||"").replace(/</g,"&lt;")}</b><br/><br/>
      <table style="width:100%; font-size:12px; border-collapse:collapse;">
        <tr><td>Operaciones</td><td><b>${s.operations}</b></td></tr>
        <tr><td>Transportes</td><td><b>${s.transports}</b></td></tr>
        <tr><td>Inspecciones</td><td><b>${s.inspections}</b></td></tr>
        <tr><td>Demoras</td><td><b>${s.delays}</b></td></tr>
        <tr><td>Almacenamientos</td><td><b>${s.storages}</b></td></tr>
        <tr><td>Tiempo total</td><td><b>${formatDuration(s.total_time_seconds)}</b></td></tr>
        <tr><td>Distancia total</td><td><b>${s.total_distance_meters} m</b></td></tr>
      </table>`;
  }
}

function syncPanel() {
  syncProjectForm();
  const node = selectedNodeId ? doc.diagram.nodes.find(n => n.id === selectedNodeId) : null;
  if (node && nodeForm && noSelection) {
    nodeForm.classList.remove("hidden"); noSelection.classList.add("hidden");
    if (propLabel && document.activeElement !== propLabel) propLabel.value = node.label || "";
    if (propKind) propKind.value = node.kind.type === "OIT" ? `OIT / ${node.kind.value}` : `BPMN / ${node.kind.value}`;
    const tv = node.metrics.time_value ?? node.metrics.time_seconds ?? "";
    if (propTime && document.activeElement !== propTime) propTime.value = String(tv);
    if (propTimeUnit && document.activeElement !== propTimeUnit) propTimeUnit.value = node.metrics.time_unit || "SECONDS";
    if (propDist && document.activeElement !== propDist) propDist.value = String(node.metrics.distance_meters ?? "");
    if (propResource && document.activeElement !== propResource) propResource.value = node.resource ?? "";
  } else if (nodeForm && noSelection) { nodeForm.classList.add("hidden"); noSelection.classList.remove("hidden"); }
  const s = calculateDapSummary(doc.diagram);
  if (summaryBox) summaryBox.innerHTML = `Op: <b>${s.operations}</b> · Tr: <b>${s.transports}</b> · Insp: <b>${s.inspections}</b><br/>Dem: <b>${s.delays}</b> · Alm: <b>${s.storages}</b><br/>Tiempo total: <b>${formatDuration(s.total_time_seconds)}</b> (${s.total_time_seconds}s)<br/>Distancia: <b>${s.total_distance_meters}m</b>`;
  const v = validateDiagram(doc.diagram, doc.metadata.notation);
  if (validationBox) validationBox.innerHTML = v.ok ? `<div class="validation-ok">Sin incidencias (${doc.metadata.notation})</div>` : v.issues.map(i=>`<div class="validation-err">• [${i.code}] ${i.message}</div>`).join("");
  renderAnalysis();
}
function updateStatus(extra?: string) {
  const s = calculateDapSummary(doc.diagram);
  const sel = selectedNodeId ? " · Nodo" : selectedEdgeId ? " · Conector" : "";
  const mode = (connectMode || connectingDrag) ? " · Conectando (arrastra entre puertos)" : "";
  const msg = extra ? ` · ${extra}` : "";
  if (statusbar) statusbar.textContent = `DAPIO-FLOW | ${doc.metadata.name} (${doc.metadata.notation}) | N:${doc.diagram.nodes.length} E:${doc.diagram.edges.length} | Tiempo total: ${formatDuration(s.total_time_seconds)}${sel}${mode}${msg}`;
}
function draw(extra?: string) {
  const p = canvas!.parentElement!;
  renderDiagram(ctx, p.clientWidth, p.clientHeight, camera, doc.diagram, selectedNodeId, selectedEdgeId, pendingPort || connectingDrag, hoverPort, connectMode || !!connectingDrag, connectingDrag ? mouseWorld : null);
  syncPanel(); renderPalette(); updateStatus(extra);
}

function setConnectMode(on: boolean) { connectMode = on; pendingPort = null; requestDraw(); }
// connector type selected from palette section
function next() { return counter++; }

type PaletteItem = { id: string; label: string; family: "OIT"|"BPMN"; oit?: OitKind; bpmn?: BpmnElementType; notations: NotationType[]; };
const paletteDefs: PaletteItem[] = [
  { id:"op", label:"Operación", family:"OIT", oit:"OPERATION", notations:["DAP","DOP"] },
  { id:"insp", label:"Inspección", family:"OIT", oit:"INSPECTION", notations:["DAP","DOP"] },
  { id:"tr", label:"Transporte", family:"OIT", oit:"TRANSPORT", notations:["DAP"] },
  { id:"de", label:"Demora", family:"OIT", oit:"DELAY", notations:["DAP"] },
  { id:"al", label:"Almacenamiento", family:"OIT", oit:"STORAGE", notations:["DAP"] },
  { id:"co", label:"Combinada", family:"OIT", oit:"COMBINED", notations:["DAP"] },
  { id:"task", label:"Tarea", family:"BPMN", bpmn:"TASK", notations:["BPMN"] },
  { id:"utask", label:"Tarea usuario", family:"BPMN", bpmn:"USER_TASK", notations:["BPMN"] },
  { id:"stask", label:"Tarea servicio", family:"BPMN", bpmn:"SERVICE_TASK", notations:["BPMN"] },
  { id:"start", label:"Inicio", family:"BPMN", bpmn:"START_EVENT", notations:["BPMN"] },
  { id:"ievent", label:"Evento intermedio", family:"BPMN", bpmn:"INTERMEDIATE_EVENT", notations:["BPMN"] },
  { id:"end", label:"Fin", family:"BPMN", bpmn:"END_EVENT", notations:["BPMN"] },
  { id:"xgw", label:"Compuerta XOR", family:"BPMN", bpmn:"EXCLUSIVE_GATEWAY", notations:["BPMN"] },
  { id:"pgw", label:"Compuerta AND", family:"BPMN", bpmn:"PARALLEL_GATEWAY", notations:["BPMN"] },
  { id:"ogw", label:"Compuerta OR", family:"BPMN", bpmn:"INCLUSIVE_GATEWAY", notations:["BPMN"] },
  { id:"note", label:"Anotación", family:"BPMN", bpmn:"TEXT_ANNOTATION", notations:["BPMN"] },
  { id:"data", label:"Objeto de datos", family:"BPMN", bpmn:"DATA_OBJECT", notations:["BPMN"] },
  { id:"pool", label:"Pool", family:"BPMN", bpmn:"POOL", notations:["BPMN"] },
  { id:"lane", label:"Carril", family:"BPMN", bpmn:"LANE", notations:["BPMN"] },
];

function allowedForNotation(item: PaletteItem, notation: NotationType) {
  if (notation === "DAP") return item.family === "OIT"; // DAP completo OIT
  if (notation === "DOP") return item.family === "OIT" && (item.oit === "OPERATION" || item.oit === "INSPECTION" || item.oit === "COMBINED");
  if (notation === "BPMN") return item.family === "BPMN";
  return false;
}

function addNodeFromPalette(item: PaletteItem, worldX: number, worldY: number) {
  if (!allowedForNotation(item, doc.metadata.notation)) { requestDraw("Elemento no permitido en esta notación"); return; }
  const snap = (v:number)=>Math.round(v/20)*20;
  let x = snap(worldX), y = snap(worldY);

  // BPMN rule: lanes must be inside a pool (auto-grow)
  if (doc.metadata.notation === "BPMN" && item.family === "BPMN" && item.bpmn === "LANE") {
    const pools = doc.diagram.nodes.filter(n => n.kind.type === "BPMN" && n.kind.value === "POOL");
    if (pools.length === 0) { requestDraw("Regla BPMN: primero agrega un Pool para colocar carriles dentro"); return; }
    let pool = pools.find(p => { const pw=p.size?.width??600, ph=p.size?.height??220; return Math.abs(x-p.position.x)<=pw/2 && Math.abs(y-p.position.y)<=ph/2; }) || pools[0];
    snapshot();
    const node = createBpmnNode("LANE", pool.position.x, pool.position.y, next());
    doc.diagram.nodes.push(node); selectedNodeId = node.id; selectedEdgeId = null;
    layoutPoolLanes(pool.id);
    requestDraw();
    return;
  }

  snapshot();
  const node = item.family === "OIT" && item.oit
    ? createOitNode(item.oit, snap(worldX), snap(worldY), next())
    : createBpmnNode(item.bpmn!, snap(worldX), snap(worldY), next());
  if ((doc.metadata.notation === "DAP" || doc.metadata.notation === "DOP") && node.metrics.time_seconds == null) {
    node.metrics.time_seconds = 20; node.metrics.time_value = 20; node.metrics.time_unit = "SECONDS";
  }
  // if placing inside a BPMN pool, grow pool to fit
  if (doc.metadata.notation === "BPMN" && node.kind.type === "BPMN" && node.kind.value === "POOL") {
    // pool added
  }
  doc.diagram.nodes.push(node); selectedNodeId = node.id; selectedEdgeId = null;
  // auto-grow pool if element placed inside any pool
  if (doc.metadata.notation === "BPMN") {
    const pools = doc.diagram.nodes.filter(n => n.kind.type==='BPMN' && n.kind.value==='POOL');
    for (const p of pools) {
      const pw=p.size?.width??600, ph=p.size?.height??220;
      if (Math.abs(node.position.x-p.position.x) < pw/2 && Math.abs(node.position.y-p.position.y) < ph/2) {
        // ensure pool tall enough below lowest content
        const bottom = node.position.y + (node.size?.height??50)/2;
        const pBottom = p.position.y + ph/2;
        if (bottom > pBottom - 20) { p.size = {width: pw, height: ph + (bottom - (pBottom - 20)) + 40}; }
      }
    }
  }
  requestDraw();
}

function drawPaletteIcon(ic: CanvasRenderingContext2D, item: PaletteItem) {
  const color = paletteColor(item);
  ic.clearRect(0,0,48,36); ic.save(); ic.translate(24,18); ic.scale(0.7,0.7); ic.strokeStyle=color; ic.fillStyle=color + "22"; ic.lineWidth=2;
  if (item.family==="OIT" && item.oit) {
    const {w,h}=oitNodeSize(item.oit);
    switch(item.oit){case "OPERATION": ic.beginPath(); ic.arc(0,0,w/2,0,Math.PI*2); ic.fill(); ic.stroke(); break; case "INSPECTION": ic.beginPath(); ic.rect(-w/2,-h/2,w,h); ic.fill(); ic.stroke(); break; case "DELAY": ic.beginPath(); ic.moveTo(-w/2,-h/2); ic.lineTo(-w/2,h/2); ic.arc(-w/2,0,h/2,Math.PI/2,-Math.PI/2,true); ic.closePath(); ic.fill(); ic.stroke(); break; case "STORAGE": ic.beginPath(); ic.moveTo(0,h/2); ic.lineTo(-w/2,-h/2); ic.lineTo(w/2,-h/2); ic.closePath(); ic.fill(); ic.stroke(); break; case "COMBINED": ic.beginPath(); ic.rect(-w/2,-h/2,w,h); ic.fill(); ic.stroke(); ic.beginPath(); ic.arc(0,0,w/2-2,0,Math.PI*2); ic.stroke(); break; case "TRANSPORT": ic.beginPath(); ic.moveTo(-w/2,-h/2); ic.lineTo(w/2-10,-h/2); ic.lineTo(w/2,0); ic.lineTo(w/2-10,h/2); ic.lineTo(-w/2,h/2); ic.closePath(); ic.fill(); ic.stroke(); break;}
  } else if (item.bpmn) {
    const sz = bpmnNodeSize(item.bpmn);
    const w = (item.bpmn === "POOL" || item.bpmn === "LANE") ? 40 : (item.bpmn === "TEXT_ANNOTATION" ? 38 : sz.w);
    const h = (item.bpmn === "POOL" || item.bpmn === "LANE") ? 26 : (item.bpmn === "TEXT_ANNOTATION" ? 24 : sz.h);
    switch(item.bpmn){
      case "TASK": case "USER_TASK": case "SERVICE_TASK": {const r=8; ic.beginPath(); ic.moveTo(-w/2+r,-h/2); ic.lineTo(w/2-r,-h/2); ic.quadraticCurveTo(w/2,-h/2,w/2,-h/2+r); ic.lineTo(w/2,h/2-r); ic.quadraticCurveTo(w/2,h/2,w/2-r,h/2); ic.lineTo(-w/2+r,h/2); ic.quadraticCurveTo(-w/2,h/2,-w/2,h/2-r); ic.lineTo(-w/2,-h/2+r); ic.quadraticCurveTo(-w/2,-h/2,-w/2+r,-h/2); ic.closePath(); ic.fill(); ic.stroke(); break;}
      case "START_EVENT": case "INTERMEDIATE_EVENT": ic.beginPath(); ic.arc(0,0,sz.w/2,0,Math.PI*2); ic.fill(); ic.stroke(); if(item.bpmn==="INTERMEDIATE_EVENT"){ic.beginPath(); ic.arc(0,0,sz.w/2-4,0,Math.PI*2); ic.stroke();} break;
      case "END_EVENT": ic.beginPath(); ic.arc(0,0,sz.w/2,0,Math.PI*2); ic.fill(); ic.stroke(); ic.beginPath(); ic.arc(0,0,sz.w/2-4,0,Math.PI*2); ic.stroke(); break;
      case "EXCLUSIVE_GATEWAY": case "PARALLEL_GATEWAY": case "INCLUSIVE_GATEWAY": ic.beginPath(); ic.moveTo(0,-sz.h/2); ic.lineTo(sz.w/2,0); ic.lineTo(0,sz.h/2); ic.lineTo(-sz.w/2,0); ic.closePath(); ic.fill(); ic.stroke(); ic.lineWidth=2; if(item.bpmn==="EXCLUSIVE_GATEWAY"){ic.beginPath();ic.moveTo(-6,-6);ic.lineTo(6,6);ic.moveTo(6,-6);ic.lineTo(-6,6);ic.stroke();} else if(item.bpmn==="PARALLEL_GATEWAY"){ic.beginPath();ic.moveTo(0,-8);ic.lineTo(0,8);ic.moveTo(-8,0);ic.lineTo(8,0);ic.stroke();} else {ic.beginPath(); ic.arc(0,0,6,0,Math.PI*2); ic.stroke();} break;
      case "TEXT_ANNOTATION": ic.beginPath(); ic.moveTo(-w/2,-h/2); ic.lineTo(-w/2+10,-h/2); ic.moveTo(-w/2,-h/2); ic.lineTo(-w/2,h/2); ic.moveTo(-w/2,h/2); ic.lineTo(-w/2+10,h/2); ic.stroke(); break;
      case "DATA_OBJECT": ic.beginPath(); ic.moveTo(-10,-14); ic.lineTo(4,-14); ic.lineTo(10,-8); ic.lineTo(10,14); ic.lineTo(-10,14); ic.closePath(); ic.fill(); ic.stroke(); break;
      case "POOL": case "LANE": ic.beginPath(); ic.rect(-w/2,-h/2,w,h); ic.fill(); ic.stroke(); ic.beginPath(); ic.rect(-w/2,-h/2,8,h); ic.fillStyle=color+"55"; ic.fill(); ic.stroke(); break;
    }
  }
  ic.restore();
}

function lanesInPool(poolId: string) {
  const pool = doc.diagram.nodes.find(n => n.id === poolId);
  if (!pool) return [] as any[];
  const pw = pool.size?.width ?? 600, ph = pool.size?.height ?? 220;
  const px1 = pool.position.x - pw/2, px2 = pool.position.x + pw/2, py1 = pool.position.y - ph/2, py2 = pool.position.y + ph/2;
  return doc.diagram.nodes.filter(n => n.kind.type==='BPMN' && n.kind.value==='LANE').filter(n => {
    const cx = n.position.x, cy = n.position.y;
    return cx >= px1 && cx <= px2 && cy >= py1-1 && cy <= py2+1;
  }).sort((a,b)=>a.position.y - b.position.y);
}
function layoutPoolLanes(poolId: string) {
  const pool = doc.diagram.nodes.find(n => n.id === poolId);
  if (!pool || pool.kind.type!=='BPMN' || pool.kind.value!=='POOL') return;
  const lanes = lanesInPool(poolId);
  if (!lanes.length) return;
  const pw = pool.size?.width ?? 600;
  const header = 0;
  let y = (pool.position.y - (pool.size?.height ?? 220)/2) + header;
  for (const lane of lanes) {
    const lh = Math.max(100, lane.size?.height ?? 120);
    lane.size = { width: Math.max(200, pw - 40), height: lh };
    lane.position.x = pool.position.x;
    lane.position.y = y + lh/2;
    y += lh;
  }
  const neededH = Math.max(220, (y - (pool.position.y - (pool.size?.height ?? 220)/2)) + 10);
  pool.size = { width: pw, height: neededH };
  // re-center lanes vertically relative to new pool top
  const top = pool.position.y - neededH/2;
  let yy = top;
  for (const lane of lanes) { const lh = lane.size?.height ?? 120; lane.position.y = yy + lh/2; yy += lh; }
}

function renderPalette() {
  if (!paletteItemsEl) return;
  const allowedDefs = paletteDefs.filter(d => allowedForNotation(d, doc.metadata.notation));
  const key = doc.metadata.notation + ":" + allowedDefs.map(d=>d.id).join(",") + ":" + currentEdgeKind;
  if (key === paletteKey) return;
  paletteKey = key;
  paletteItemsEl.innerHTML = "";

  // connector types inside diagram elements panel
  const csec = document.createElement("details"); csec.className = "pal-section"; csec.open = true;
  csec.innerHTML = `<summary><span>Conectores</span><span>☰</span></summary>`;
  const cpick = document.createElement("div"); cpick.className = "conn-pick";
  const connOpts: Array<{k:typeof currentEdgeKind,l:string,cls:string,show:boolean}> = [
    {k:"SEQUENCE_FLOW", l:"Secuencia", cls:"", show:true},
    {k:"ASSOCIATION", l:"Asociación", cls:"assoc", show:true},
    {k:"MESSAGE_FLOW", l:"Mensaje (BPMN)", cls:"msg", show: doc.metadata.notation === "BPMN"},
  ];
  for (const o of connOpts.filter(x=>x.show)) {
    const b = document.createElement("button"); b.className = "conn-opt" + (currentEdgeKind===o.k?" active":""); b.innerHTML = `<span class="conn-swatch ${o.cls}"></span>${o.l}`;
    b.onclick = () => { currentEdgeKind = o.k; paletteKey = ""; requestDraw(`Conector: ${o.l}`); };
    cpick.appendChild(b);
  }
  csec.appendChild(cpick); paletteItemsEl.appendChild(csec);

  const groups = new Map<string, PaletteItem[]>();
  for (const def of allowedDefs) {
    const g = def.family === "OIT" ? "Símbolos OIT / ASME" : "Elementos BPMN";
    if (!groups.has(g)) groups.set(g, []); groups.get(g)!.push(def);
  }
  for (const [gname, items] of groups) {
    const section = document.createElement("details"); section.className = "pal-section"; section.open = true;
    const sum = document.createElement("summary"); sum.innerHTML = `<span>${gname}</span><span>☰</span>`;
    const grid = document.createElement("div"); grid.className = "pal-grid";
    for (const def of items) {
      const item = document.createElement("div"); item.className = "palette-item"; item.draggable = true;
      item.style.borderColor = paletteColor(def);
      const icon = document.createElement("canvas"); icon.width=48; icon.height=36; const ictx=icon.getContext("2d"); if (ictx) drawPaletteIcon(ictx, def);
      const label = document.createElement("span"); label.textContent = def.label; item.appendChild(icon); item.appendChild(label);
      item.addEventListener("dragstart", ev => ev.dataTransfer?.setData("application/x-palette-id", def.id));
      item.addEventListener("dblclick", () => { const c=canvas!.parentElement!; const p=camera.screenToWorld(c.clientWidth/2,c.clientHeight/2); addNodeFromPalette(def,p.x,p.y); });
      grid.appendChild(item);
    }
    section.appendChild(sum); section.appendChild(grid); paletteItemsEl.appendChild(section);
  }
  if (paletteLegend) paletteLegend.textContent = `Notación ${doc.metadata.notation}: arrastra elementos; conecta desde puertos o manejador interno.`;
}
canvas.addEventListener("dragover", e => e.preventDefault());
canvas.addEventListener("drop", e => { e.preventDefault(); const id=e.dataTransfer?.getData("application/x-palette-id"); const def=paletteDefs.find(d=>d.id===id); if(!def || !allowedForNotation(def, doc.metadata.notation)) { requestDraw("Elemento no permitido en esta notación"); return; } const rect=canvas.getBoundingClientRect(); const w=camera.screenToWorld(e.clientX-rect.left,e.clientY-rect.top); addNodeFromPalette(def,w.x,w.y); });

function showStartModal(show:boolean){ startModal?.classList.toggle("hidden", !show); }
function newDiagram(type: NotationType | "DAP_TEMPLATE") {
  snapshot();
  if (type === "DAP_TEMPLATE") doc = createDapTemplate();
  else { doc = createEmptyDocument(); doc.metadata.notation = type; }
  selectedNodeId = null; selectedEdgeId = null; pendingPort = null; connectingDrag = null; counter = 1; undoStack.length = 0; redoStack.length = 0;
  paletteKey = "";
  showStartModal(false);
  requestDraw(type === "DAP_TEMPLATE" ? "Plantilla DAP cargada" : `Nuevo ${type}`);
}
document.querySelectorAll<HTMLButtonElement>(".type-card").forEach(btn=>btn.addEventListener("click",()=>{ newDiagram(btn.dataset.type as any); }));

function deleteSelection(){ if(!selectedNodeId && !selectedEdgeId) return; snapshot(); if(selectedNodeId){ doc.diagram.nodes=doc.diagram.nodes.filter(n=>n.id!==selectedNodeId); doc.diagram.edges=doc.diagram.edges.filter(e=>e.source.node_id!==selectedNodeId && e.target.node_id!==selectedNodeId); selectedNodeId=null; } else if(selectedEdgeId){ doc.diagram.edges=doc.diagram.edges.filter(e=>e.id!==selectedEdgeId); selectedEdgeId=null; } requestDraw(); }
async function doSave(){ requestDraw(await saveDocument(doc)); }
async function doOpen(){ const res=await openDocument(); if(res.doc?.diagram){ snapshot(); doc=res.doc; selectedNodeId=null; selectedEdgeId=null; pendingPort=null; counter=1; } requestDraw(res.message); }
async function doImportBpmn(){ const res=await importBpmnFromFilePicker(); if(res.doc?.diagram){ snapshot(); doc=res.doc; selectedNodeId=null; selectedEdgeId=null; pendingPort=null; counter=1; } requestDraw(res.message); }
function doExportCsv(){ downloadCsv(`${(doc.metadata.name||"proceso").replace(/[^a-z0-9-_]+/gi,"_")}_dap.csv`, diagramToCsv(doc.diagram)); requestDraw("CSV exportado"); }
function doExportXls(){ downloadExcel(`${(doc.metadata.name||"proceso").replace(/[^a-z0-9-_]+/gi,"_")}_ficha_dap.xls`, documentToDapExcelXml(doc)); requestDraw("Excel exportado"); }
function doExportBpmn(){ downloadBpmn(`${(doc.metadata.name||"proceso").replace(/[^a-z0-9-_]+/gi,"_")}.bpmn`, documentToBpmnXml(doc)); requestDraw("BPMN exportado"); }

document.getElementById("btn-new")?.addEventListener("click",()=>showStartModal(true));
document.getElementById("btn-open")?.addEventListener("click",doOpen);
document.getElementById("btn-save")?.addEventListener("click",doSave);
// connect via drag from ports (preferred); toolbar provides connector type selection

// analysis export
document.getElementById("btn-export-analysis")?.addEventListener("click", ()=>{ doExportXls(); });

// menus
function closeMenus(){ document.querySelectorAll('.menu').forEach(m=>m.classList.remove('open')); }
document.querySelectorAll<HTMLButtonElement>('.menu-btn').forEach(btn=>btn.addEventListener('click',(e)=>{ e.stopPropagation(); const m=btn.parentElement!; const was=m.classList.contains('open'); closeMenus(); if(!was) m.classList.add('open'); }));
window.addEventListener('click',closeMenus);
const bind = (id:string, fn:()=>void)=>document.getElementById(id)?.addEventListener('click',()=>{ closeMenus(); fn(); });
bind('m-new',()=>showStartModal(true)); bind('m-template-dap',()=>newDiagram('DAP_TEMPLATE')); bind('m-open',doOpen); bind('m-save',doSave); bind('m-import-bpmn',doImportBpmn);
bind('m-undo',undo); bind('m-redo',redo); bind('m-delete',deleteSelection);
bind('m-center',()=>{ camera.x=60; camera.y=60; camera.scale=1; requestDraw(); });
bind('m-export-csv',doExportCsv); bind('m-export-xls',doExportXls); bind('m-export-bpmn',doExportBpmn);

window.addEventListener("keydown", (e) => {
  if (e.code === "Space") spaceDown = true; if (e.key === "Escape") setConnectMode(false);
  const mod=e.ctrlKey||e.metaKey; if(mod && e.key.toLowerCase()==='z' && !e.shiftKey){e.preventDefault();undo();return;} if(mod && (e.key.toLowerCase()==='y' || (e.key.toLowerCase()==='z' && e.shiftKey))){e.preventDefault();redo();return;} if(mod && e.key.toLowerCase()==='s'){e.preventDefault();doSave();}
  if (e.key === "Delete" || e.key === "Backspace") { const tag=(e.target as HTMLElement)?.tagName; if(tag!=="INPUT"&&tag!=="TEXTAREA"&&tag!=="SELECT") deleteSelection(); }
});
window.addEventListener("keyup", e=>{ if(e.code==="Space") spaceDown=false; });

function findPortAtWorld(wx:number,wy:number){
  // border ports and internal handle (offset) as explicit connector targets
  for(let i=doc.diagram.nodes.length-1;i>=0;i--){
    const n=doc.diagram.nodes[i];
    if (n.ports && n.ports.length) {
      const sz = getNodeSize(n);
      const hx = n.position.x + Math.min(10, sz.w/4), hy = n.position.y - Math.min(10, sz.h/4);
      // internal handle: only use for drag-to-connect in explicit connect mode to avoid blocking element move
      if (connectMode && Math.hypot(wx - hx, wy - hy) <= 7/camera.scale) { const p = nearestPort(n, wx, wy); if (p) return {nodeId:n.id, portId:p.id, isHandle:true}; }
    }
    // border ports: small target so node body remains draggable
    const p=hitTestPort(n,wx,wy,7/camera.scale); if(p) return {nodeId:n.id, portId:p.id, isHandle:false};
  }
  return null;
}
function nearestPortAtNode(nodeId:string, wx:number, wy:number){ const n=doc.diagram.nodes.find(x=>x.id===nodeId); if(!n) return null; const p=nearestPort(n,wx,wy); return p?{nodeId, portId:p.id, isHandle:false}:null; }
canvas.addEventListener("wheel", e=>{ e.preventDefault(); const r=canvas.getBoundingClientRect(); camera.zoomAt(e.clientX-r.left,e.clientY-r.top,e.deltaY); requestDraw(); }, {passive:false});
canvas.addEventListener("mousedown", e=>{
  const r=canvas.getBoundingClientRect(); const sx=e.clientX-r.left, sy=e.clientY-r.top; last={x:e.clientX,y:e.clientY};
  if(e.button===1 || (e.button===0 && spaceDown)){ panning=true; canvas.style.cursor="grabbing"; return; }
  if(e.button!==0) return; const w=camera.screenToWorld(sx,sy);

  // resize handle for selected container (BPMN pool/lane)
  if (selectedNodeId) {
    const sn = doc.diagram.nodes.find(n=>n.id===selectedNodeId);
    if (sn && sn.kind.type==='BPMN' && (sn.kind.value==='POOL'||sn.kind.value==='LANE')) {
      const sz = (sn.size?.width ? {w:sn.size.width,h:sn.size.height} : (sn.kind.value==='POOL'?{w:600,h:220}:{w:560,h:120}));
      const hx = sn.position.x + sz.w/2, hy = sn.position.y + sz.h/2;
      if (Math.abs(w.x - hx) <= 10/camera.scale && Math.abs(w.y - hy) <= 10/camera.scale) {
        resizingNodeId = sn.id; snapshot(); requestDraw(); return;
      }
    }
  }

  const node = hitTestNode(doc.diagram, w.x, w.y);
  const port = findPortAtWorld(w.x, w.y);

  // Start connection only from explicit port/internal handle
  if (port) {
    connectingDrag = port; pendingPort = port; selectedNodeId = node ? node.id : null; selectedEdgeId = null; canvas.style.cursor = "crosshair"; requestDraw(); return;
  }

  if (node) {
    selectedNodeId = node.id; selectedEdgeId = null; draggingNode = true; dragSnapshotTaken = false;
    doc.diagram.nodes = doc.diagram.nodes.filter(n=>n.id!==node.id).concat(node);
  } else {
    const edge = hitTestEdge(doc.diagram, w.x, w.y);
    if (edge) { selectedEdgeId = edge.id; selectedNodeId = null; }
    else { selectedNodeId = null; selectedEdgeId = null; }
  }
  requestDraw();
});
window.addEventListener("mousemove", e=>{
  const r=canvas.getBoundingClientRect(); const w=camera.screenToWorld(e.clientX-r.left,e.clientY-r.top);
  mouseWorld = w;
  const nh=findPortAtWorld(w.x,w.y); const hc=(nh?.nodeId!==hoverPort?.nodeId||nh?.portId!==hoverPort?.portId); hoverPort=nh;
  if(panning){ camera.pan(e.clientX-last.x,e.clientY-last.y); last={x:e.clientX,y:e.clientY}; requestDraw(); return; }
  if(connectingDrag){ requestDraw(); return; }
  if(resizingNodeId){ const node=doc.diagram.nodes.find(n=>n.id===resizingNodeId); if(node){ const sz=node.size || {width: node.kind.type==='BPMN'&&node.kind.value==='POOL'?600:560, height: node.kind.type==='BPMN'&&node.kind.value==='POOL'?220:120}; sz.width=Math.max(300, sz.width + (e.clientX-last.x)/camera.scale); sz.height=Math.max(120, sz.height + (e.clientY-last.y)/camera.scale); node.size=sz; if(node.kind.type==='BPMN' && node.kind.value==='POOL') layoutPoolLanes(node.id); last={x:e.clientX,y:e.clientY}; requestDraw(); } return; }
  if(draggingNode && selectedNodeId){ const node=doc.diagram.nodes.find(n=>n.id===selectedNodeId); if(node){ if(!dragSnapshotTaken){snapshot(); dragSnapshotTaken=true;} node.position.x+=(e.clientX-last.x)/camera.scale; node.position.y+=(e.clientY-last.y)/camera.scale; last={x:e.clientX,y:e.clientY}; requestDraw(); } return; }
  if(hc) requestDraw();
});
window.addEventListener("mouseup", e=>{
  if(connectingDrag){
    const r=canvas.getBoundingClientRect(); const w=camera.screenToWorld(e.clientX-r.left,e.clientY-r.top);
    let target=findPortAtWorld(w.x,w.y);
    if(!target){
      const tn = hitTestNode(doc.diagram,w.x,w.y);
      if(tn && tn.id !== connectingDrag.nodeId) target = nearestPortAtNode(tn.id, w.x, w.y);
    }
    if(target && (target.nodeId!==connectingDrag.nodeId || target.portId!==connectingDrag.portId)){
      snapshot();
      const edge:DiagramEdge={id:crypto.randomUUID(),source:{node_id:connectingDrag.nodeId,port_id:connectingDrag.portId},target:{node_id:target.nodeId,port_id:target.portId},label:null,kind:currentEdgeKind};
      doc.diagram.edges.push(edge); selectedEdgeId=edge.id; selectedNodeId=null;
    }
    connectingDrag=null; mouseWorld=null; if(!connectMode) pendingPort=null;
  }
  if(draggingNode && selectedNodeId){ const node=doc.diagram.nodes.find(n=>n.id===selectedNodeId); if(node){ node.position.x=Math.round(node.position.x/20)*20; node.position.y=Math.round(node.position.y/20)*20; } }
  if(resizingNodeId){ const node=doc.diagram.nodes.find(n=>n.id===resizingNodeId); if(node && node.size){ node.size.width=Math.round(node.size.width/20)*20; node.size.height=Math.round(node.size.height/20)*20; if(node.kind.type==='BPMN' && node.kind.value==='POOL') layoutPoolLanes(node.id); } }
  // snap and keep lanes inside pools / auto-layout
  if (selectedNodeId) {
    const node = doc.diagram.nodes.find(n=>n.id===selectedNodeId);
    if (node) {
      if (draggingNode) { node.position.x = Math.round(node.position.x/20)*20; node.position.y = Math.round(node.position.y/20)*20; }
      if (doc.metadata.notation==='BPMN' && node.kind.type==='BPMN' && node.kind.value==='LANE') {
        const pools = doc.diagram.nodes.filter(n=>n.kind.type==='BPMN' && n.kind.value==='POOL');
        if (pools.length) {
          const pool = pools.find(p=>{ const pw=p.size?.width??600, ph=p.size?.height??220; return Math.abs(node.position.x-p.position.x)<=pw/2 && Math.abs(node.position.y-p.position.y)<=ph/2; }) || pools[0];
          layoutPoolLanes(pool.id);
        }
      }
      if (doc.metadata.notation==='BPMN' && node.kind.type==='BPMN' && node.kind.value==='POOL') {
        layoutPoolLanes(node.id);
      }
    }
  }
  panning=false; draggingNode=false; dragSnapshotTaken=false; resizingNodeId=null; canvas.style.cursor="default"; requestDraw();
});

function isCompatibleWithNotation(notation: NotationType): boolean {
  return doc.diagram.nodes.every(n => {
    if (notation === "BPMN") return n.kind.type === "BPMN";
    if (notation === "DAP") return n.kind.type === "OIT";
    if (notation === "DOP") return n.kind.type === "OIT" && (n.kind.value === "OPERATION" || n.kind.value === "INSPECTION" || n.kind.value === "COMBINED");
    return true;
  });
}

function bindPropInputs(){
  let propTimer:any=null; const onChange=()=>{ if(!selectedNodeId) return; const node=doc.diagram.nodes.find(n=>n.id===selectedNodeId); if(!node) return; if(!propTimer) snapshot(); clearTimeout(propTimer); propTimer=setTimeout(()=>{propTimer=null;},500);
    if(propLabel) node.label=propLabel.value; if(propResource) node.resource=propResource.value||null;
    if(propTime || propTimeUnit){
      node.metrics.time_value = propTime && propTime.value!=="" ? Number(propTime.value) : null;
      node.metrics.time_unit = (propTimeUnit?.value as TimeUnit) || "SECONDS";
      node.metrics = syncTimeMetrics(node.metrics);
    }
    if(propDist) node.metrics.distance_meters = propDist.value===""?null:Number(propDist.value);
    requestDraw();
  };
  [propLabel,propResource,propTime,propDist,propTimeUnit].forEach(el=>{ el?.addEventListener("input",onChange as any); el?.addEventListener("change",()=>{propTimer=null; onChange();}); });
  const onProj=()=>{ 
    snapshot();
    if (projName) doc.metadata.name = projName.value||"Nuevo proceso";
    // notation locked to prevent mixing diagram types
    if (projNotation) projNotation.value = doc.metadata.notation;
    if (projMethod) doc.metadata.method = projMethod.value as any;
    if (projAnalyst) doc.metadata.analyst = projAnalyst.value||null;
    requestDraw();
  };
  [projName,projAnalyst].forEach(el=>el?.addEventListener("change",onProj)); [projNotation,projMethod].forEach(el=>el?.addEventListener("change",onProj));
}
bindPropInputs(); window.addEventListener("resize",resize); camera.x=60; camera.y=60; showStartModal(true); resize();