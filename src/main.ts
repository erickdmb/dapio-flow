import "./style.css";
import { resizePool, setPoolOrientation } from "./model/containers";
import { joinEdgeAt } from "./model/connections";
import { Camera } from "./canvas/camera";
import { drawBpmnPaletteIcon, hitTestEdge, hitTestNodeLabel, hitTestNode, hitTestPort, nearestPort, oitNodeSize, bpmnNodeSize, getNodeSize, renderDiagram } from "./canvas/renderer";
import { createAuxNode, nextActivityNumber, bpmnLabel, createBpmnNode, createEmptyDocument, createOitNode } from "./model/defaults";
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
import { diagramBounds } from "./export/pdf-layout";
import { downloadDiagramPdf } from "./export/pdf";
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
let draggingPoolLanes: string[] = [];
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
const paletteSections = new Map<string, boolean>();
const zoomValue = document.getElementById("zoom-value");
const inlineEditor = document.getElementById("node-label-editor") as HTMLTextAreaElement | null;
const inlineEditorWrap = document.getElementById("node-label-editor-wrap");
let editingNodeId: string | null = null;

const orientationField = document.getElementById("pool-orientation-field");
const orientationSelect = document.getElementById("pool-orientation") as HTMLSelectElement | null;
const propNumber = document.getElementById("prop-number") as HTMLInputElement | null;
const propText = document.getElementById("prop-text") as HTMLTextAreaElement | null;
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
  const nodes = orderedNodesForTable().filter(n => n.kind.type !== "AUX");
  const method = doc.metadata.method === "TO_BE" ? "Propuesto" : "Actual";
  if (analysisTbody) {
    analysisTbody.innerHTML = nodes.map((n,i)=>`<tr><td>${(n.activity_number ?? String(i+1)).replace(/</g,"&lt;")}</td><td>${method}</td><td>${(n.label||"").replace(/</g,"&lt;")}</td><td>${typeLabel(n)}</td><td>${formatDuration(n.metrics.time_seconds||0)} (${n.metrics.time_seconds||0}s)</td><td>${n.metrics.distance_meters??0} m</td><td>${(n.resource||"").replace(/</g,"&lt;")}</td></tr>`).join("") || `<tr><td colspan="7" class="muted">Sin actividades</td></tr>`;
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
  const isPool = node?.kind.type === "BPMN" && node.kind.value === "POOL";
  document.getElementById("prop-metrics")?.classList.toggle("hidden", node?.kind.type === "AUX");
  const freeText = node?.kind.type === "AUX" && node.kind.value === "TEXT";
  document.getElementById("prop-number-field")?.classList.toggle("hidden", !(node?.kind.type === "OIT" && doc.metadata.notation === "DOP"));
  document.getElementById("prop-text-field")?.classList.toggle("hidden", !freeText);
  propLabel?.parentElement?.classList.toggle("hidden", freeText);
  if (propNumber && document.activeElement !== propNumber) propNumber.value = node?.activity_number ?? "";
  if (propText && document.activeElement !== propText) propText.value = node?.label ?? "";
  orientationField?.classList.toggle("hidden", !isPool);
  if (orientationSelect && isPool) orientationSelect.value = node.orientation ?? "HORIZONTAL";
  if (node && nodeForm && noSelection) {
    nodeForm.classList.remove("hidden"); noSelection.classList.add("hidden");
    if (propLabel && document.activeElement !== propLabel) propLabel.value = node.label || "";
    if (propKind) propKind.value = node.kind.type === "OIT" ? `OIT / ${node.kind.value}` : `${node.kind.type} / ${node.kind.value}`;
    const tv = node.metrics.time_value ?? node.metrics.time_seconds ?? "";
    if (propTime && document.activeElement !== propTime) propTime.value = String(tv);
    if (propTimeUnit && document.activeElement !== propTimeUnit) propTimeUnit.value = node.metrics.time_unit || "SECONDS";
    if (propDist && document.activeElement !== propDist) propDist.value = String(node.metrics.distance_meters ?? "");
    if (propResource && document.activeElement !== propResource) propResource.value = node.resource ?? "";
  } else if (nodeForm && noSelection) { nodeForm.classList.add("hidden"); noSelection.classList.remove("hidden"); }
  const s = calculateDapSummary(doc.diagram);
  if (summaryBox) summaryBox.innerHTML = `Op: <b>${s.operations}</b> · Tr: <b>${s.transports}</b> · Insp: <b>${s.inspections}</b><br/>Dem: <b>${s.delays}</b> · Alm: <b>${s.storages}</b><br/>Tiempo total: <b>${formatDuration(s.total_time_seconds)}</b> (${s.total_time_seconds}s)<br/>Distancia: <b>${s.total_distance_meters}m</b>`;
  const v = validateDiagram(doc.diagram, doc.metadata.notation);
  if (validationBox) {
    validationBox.replaceChildren();
    for (const message of v.ok ? [`Sin incidencias (${doc.metadata.notation})`] : v.issues.map(i => `• [${i.code}] ${i.message}`)) {
      const row = document.createElement("div");
      row.className = v.ok ? "validation-ok" : "validation-err";
      row.textContent = message;
      validationBox.appendChild(row);
    }
  }
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
  if (zoomValue) zoomValue.textContent = `${(camera.scale * 100).toFixed(camera.scale < 0.1 ? 1 : 0)}%`;
  positionLabelEditor();
}

function setConnectMode(on: boolean) { connectMode = on; pendingPort = null; requestDraw(); }
// connector type selected from palette section
function next() { return counter++; }

type PaletteItem = { id: string; label: string; family: "OIT"|"BPMN"|"AUX"; aux?: "TEXT"|"JUNCTION"; oit?: OitKind; bpmn?: BpmnElementType; notations: NotationType[]; };
const paletteDefs: PaletteItem[] = [
  { id:"dop-text", label:"Texto libre", family:"AUX", aux:"TEXT", notations:["DOP"] },
  { id:"dop-join", label:"Unión de líneas", family:"AUX", aux:"JUNCTION", notations:["DOP"] },
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
  if (item.family === "AUX") return item.notations.includes(notation);
  if (notation === "DAP") return item.family === "OIT"; // DAP completo OIT
  if (notation === "DOP") return item.family === "OIT" && (item.oit === "OPERATION" || item.oit === "INSPECTION" || item.oit === "COMBINED");
  if (notation === "BPMN") return item.family === "BPMN";
  return false;
}

function addNodeFromPalette(item: PaletteItem, worldX: number, worldY: number) {
  if (!allowedForNotation(item, doc.metadata.notation)) { requestDraw("Elemento no permitido en esta notación"); return; }
  const snap = (v:number)=>Math.round(v/20)*20;
  let x = snap(worldX), y = snap(worldY);

  if (item.family === "AUX" && item.aux) {
    snapshot();
    const edge = item.aux === "JUNCTION" ? hitTestEdge(doc.diagram, worldX, worldY, 8 / camera.scale) : null;
    const node = edge ? joinEdgeAt(doc.diagram, edge, worldX, worldY) : createAuxNode(item.aux, x, y);
    if (node) {
      if (!edge) doc.diagram.nodes.push(node);
      selectedNodeId = node.id; selectedEdgeId = null;
    }
    requestDraw();
    return;
  }

  // BPMN rule: lanes must be inside a pool (auto-grow)
  if (doc.metadata.notation === "BPMN" && item.family === "BPMN" && item.bpmn === "LANE") {
    const pools = doc.diagram.nodes.filter(n => n.kind.type === "BPMN" && n.kind.value === "POOL");
    if (pools.length === 0) { requestDraw("Regla BPMN: primero agrega un Pool para colocar carriles dentro"); return; }
    let pool = pools.find(p => { const pw=p.size?.width??600, ph=p.size?.height??220; return Math.abs(x-p.position.x)<=pw/2 && Math.abs(y-p.position.y)<=ph/2; }) || pools[0];
    snapshot();
    // create inside pool content area; layoutPoolLanes will size/stack
    const node = createBpmnNode("LANE", pool.position.x + (pool.orientation === "VERTICAL" ? 0 : 15), pool.position.y + (pool.orientation === "VERTICAL" ? 15 : 0), next());
    if (pool.orientation === "VERTICAL") {
      node.orientation = "VERTICAL";
      node.size = { width: 120, height: (pool.size?.height ?? 600) - 30 };
    }
    doc.diagram.nodes.push(node); selectedNodeId = node.id; selectedEdgeId = null;
    layoutPoolLanes(pool.id);
    requestDraw();
    return;
  }

  snapshot();
  const node = item.family === "OIT" && item.oit
    ? createOitNode(item.oit, snap(worldX), snap(worldY), next())
    : createBpmnNode(item.bpmn!, snap(worldX), snap(worldY), next());
  if (doc.metadata.notation === "DOP" && node.kind.type === "OIT") {
    node.activity_number = nextActivityNumber(doc.diagram.nodes, node.kind.value);
  }
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
  ic.clearRect(0,0,64,44);
  if (item.bpmn) { drawBpmnPaletteIcon(ic, item.bpmn, color); return; }
  ic.save(); ic.translate(32,22); ic.scale(0.7,0.7); ic.strokeStyle=color; ic.fillStyle=color + "22"; ic.lineWidth=2;
  if (item.family === "AUX") {
    if (item.aux === "TEXT") { ic.fillStyle = color; ic.font = "bold 25px sans-serif"; ic.textAlign = "center"; ic.fillText("T", 0, 8); }
    else { ic.beginPath(); ic.moveTo(-20,0); ic.lineTo(20,0); ic.moveTo(0,-16); ic.lineTo(0,0); ic.stroke(); ic.beginPath(); ic.arc(0,0,4,0,Math.PI*2); ic.fillStyle=color; ic.fill(); }
  } else if (item.family==="OIT" && item.oit) {
    const {w,h}=oitNodeSize(item.oit);
    switch(item.oit){case "OPERATION": ic.beginPath(); ic.arc(0,0,w/2,0,Math.PI*2); ic.fill(); ic.stroke(); break; case "INSPECTION": ic.beginPath(); ic.rect(-w/2,-h/2,w,h); ic.fill(); ic.stroke(); break; case "DELAY": ic.beginPath(); ic.moveTo(-w/2,-h/2); ic.lineTo(-w/2,h/2); ic.arc(-w/2,0,h/2,Math.PI/2,-Math.PI/2,true); ic.closePath(); ic.fill(); ic.stroke(); break; case "STORAGE": ic.beginPath(); ic.moveTo(0,h/2); ic.lineTo(-w/2,-h/2); ic.lineTo(w/2,-h/2); ic.closePath(); ic.fill(); ic.stroke(); break; case "COMBINED": ic.beginPath(); ic.rect(-w/2,-h/2,w,h); ic.fill(); ic.stroke(); ic.beginPath(); ic.arc(0,0,w/2-2,0,Math.PI*2); ic.stroke(); break; case "TRANSPORT": ic.beginPath(); ic.moveTo(-w/2,-h/2); ic.lineTo(w/2-10,-h/2); ic.lineTo(w/2,0); ic.lineTo(w/2-10,h/2); ic.lineTo(-w/2,h/2); ic.closePath(); ic.fill(); ic.stroke(); break;}
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
  }).sort((a,b)=>pool.orientation === "VERTICAL" ? a.position.x - b.position.x : a.position.y - b.position.y);
}
function layoutPoolLanes(poolId: string) {
  const pool = doc.diagram.nodes.find(n => n.id === poolId);
  if (!pool || pool.kind.type!=='BPMN' || pool.kind.value!=='POOL') return;
  const lanes = lanesInPool(poolId);
  if (!lanes.length) return;
  const vertical = pool.orientation === "VERTICAL";
  const extent = lanes.reduce((sum, lane) => sum + Math.max(80, vertical ? lane.size?.width ?? 120 : lane.size?.height ?? 120), 0);
  const width = vertical ? Math.max(pool.size?.width ?? 220, extent) : pool.size?.width ?? 600;
  const height = vertical ? pool.size?.height ?? 600 : Math.max(pool.size?.height ?? 220, extent);
  resizePool(pool, lanes, width, height);
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
  csec.open = paletteSections.get(`${doc.metadata.notation}:Conectores`) ?? true;
  csec.addEventListener("toggle", () => paletteSections.set(`${doc.metadata.notation}:Conectores`, csec.open));
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
    const g = def.family === "OIT" ? "Símbolos OIT / ASME" : def.family === "AUX" ? "Texto y uniones"
      : ["TASK", "USER_TASK", "SERVICE_TASK"].includes(def.bpmn!) ? "Actividades"
      : ["START_EVENT", "INTERMEDIATE_EVENT", "END_EVENT"].includes(def.bpmn!) ? "Eventos"
      : ["EXCLUSIVE_GATEWAY", "PARALLEL_GATEWAY", "INCLUSIVE_GATEWAY"].includes(def.bpmn!) ? "Compuertas"
      : ["POOL", "LANE"].includes(def.bpmn!) ? "Contenedores" : "Datos y anotaciones";
    if (!groups.has(g)) groups.set(g, []); groups.get(g)!.push(def);
  }
  for (const [gname, items] of groups) {
    const section = document.createElement("details"); section.className = "pal-section"; section.open = true;
    const sectionKey = `${doc.metadata.notation}:${gname}`;
    section.open = paletteSections.get(sectionKey) ?? true;
    section.addEventListener("toggle", () => paletteSections.set(sectionKey, section.open));
    const sum = document.createElement("summary"); sum.innerHTML = `<span>${gname}</span><span>☰</span>`;
    const grid = document.createElement("div"); grid.className = "pal-grid";
    for (const def of items) {
      const item = document.createElement("div"); item.className = "palette-item"; item.draggable = true;
      item.style.borderColor = paletteColor(def);
      item.title = `${def.label}: arrastra al lienzo o pulsa Enter para agregar`;
      item.setAttribute("role", "button"); item.tabIndex = 0;
      item.setAttribute("aria-label", `Agregar ${def.label}`);
      const icon = document.createElement("canvas");
      const dpr = window.devicePixelRatio || 1;
      icon.width = Math.round(64 * dpr); icon.height = Math.round(44 * dpr);
      icon.setAttribute("aria-hidden", "true");
      const ictx = icon.getContext("2d");
      if (ictx) { ictx.setTransform(dpr, 0, 0, dpr, 0, 0); drawPaletteIcon(ictx, def); }
      const label = document.createElement("span"); label.textContent = def.label; item.appendChild(icon); item.appendChild(label);
      item.addEventListener("dragstart", ev => ev.dataTransfer?.setData("application/x-palette-id", def.id));
      const addAtCenter = () => { const c=canvas!.parentElement!; const p=camera.screenToWorld(c.clientWidth/2,c.clientHeight/2); addNodeFromPalette(def,p.x,p.y); };
      item.addEventListener("dblclick", addAtCenter);
      item.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); addAtCenter(); } });
      grid.appendChild(item);
    }
    section.appendChild(sum); section.appendChild(grid); paletteItemsEl.appendChild(section);
  }
  if (paletteLegend) paletteLegend.textContent = doc.metadata.notation === "DOP" ? "Edita el número en Propiedades. Para unir líneas, suelta un conector o un punto de unión sobre otra línea." : `Notación ${doc.metadata.notation}: arrastra elementos; conecta desde puertos o manejador interno.`;
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
async function doExportPdf() {
  if (!doc.diagram.nodes.length) { requestDraw("Agrega elementos antes de exportar el PDF"); return; }
  try { await downloadDiagramPdf(doc); requestDraw("PDF exportado"); }
  catch (error) { requestDraw(`No se pudo exportar el PDF: ${error instanceof Error ? error.message : String(error)}`); }
}
function doExportBpmn(){ downloadBpmn(`${(doc.metadata.name||"proceso").replace(/[^a-z0-9-_]+/gi,"_")}.bpmn`, documentToBpmnXml(doc)); requestDraw("BPMN exportado"); }

document.getElementById("btn-new")?.addEventListener("click",()=>showStartModal(true));
document.getElementById("btn-open")?.addEventListener("click",doOpen);
document.getElementById("btn-save")?.addEventListener("click",doSave);
function toggleProperties(open: boolean) {
  document.querySelector(".workspace-area")?.classList.toggle("panel-visible", open);
  document.getElementById("btn-properties")?.setAttribute("aria-expanded", String(open));
}
document.getElementById("btn-properties")?.addEventListener("click", () => toggleProperties(!document.querySelector(".workspace-area")?.classList.contains("panel-visible")));
document.getElementById("panel-close")?.addEventListener("click", () => toggleProperties(false));
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
function fitDiagram() {
  finishLabelEdit(true);
  const viewport = canvas!.parentElement!;
  if (!doc.diagram.nodes.length) { camera.x = viewport.clientWidth / 2; camera.y = viewport.clientHeight / 2; camera.scale = 1; requestDraw(); return; }
  ctx.save();
  const bounds = diagramBounds(doc.diagram, (text, fontSize = 12) => { ctx.font = `${fontSize}px Inter, system-ui, sans-serif`; return ctx.measureText(text).width; });
  ctx.restore();
  camera.fitBounds(bounds, viewport.clientWidth, viewport.clientHeight);
  requestDraw();
}
function zoomCanvas(factor: number, reset = false) {
  const p = canvas!.parentElement!;
  camera.setScaleAt(p.clientWidth / 2, p.clientHeight / 2, reset ? 1 : camera.scale * factor);
  requestDraw();
}
bind('m-center', fitDiagram);
bind('zoom-fit', fitDiagram); bind('zoom-in', () => zoomCanvas(1.2)); bind('zoom-out', () => zoomCanvas(1 / 1.2)); bind('zoom-reset', () => zoomCanvas(1, true));
bind('m-export-pdf',doExportPdf); bind('m-export-csv',doExportCsv); bind('m-export-xls',doExportXls); bind('m-export-bpmn',doExportBpmn);

window.addEventListener("keydown", (e) => {
  const target = e.target as HTMLElement;
  if (target?.closest("input, textarea, select, [contenteditable=true]")) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); finishLabelEdit(true); doSave(); }
    return;
  }
  if (e.code === "Space") spaceDown = true; if (e.key === "Escape") setConnectMode(false);
  const mod=e.ctrlKey||e.metaKey; if(mod && e.key.toLowerCase()==='z' && !e.shiftKey){e.preventDefault();undo();return;} if(mod && (e.key.toLowerCase()==='y' || (e.key.toLowerCase()==='z' && e.shiftKey))){e.preventDefault();redo();return;} if(mod && e.key.toLowerCase()==='s'){e.preventDefault();doSave();}
  if (e.key === "Delete" || e.key === "Backspace") { const tag=(e.target as HTMLElement)?.tagName; if(tag!=="INPUT"&&tag!=="TEXTAREA"&&tag!=="SELECT") deleteSelection(); }
});
window.addEventListener("blur", () => {
  spaceDown = false; panning = false; draggingNode = false; dragSnapshotTaken = false;
  resizingNodeId = null; draggingPoolLanes = []; connectingDrag = null; pendingPort = null;
  canvas!.style.cursor = "default"; requestDraw();
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
    const p=hitTestPort(n,wx,wy,4.5/camera.scale); if(p) return {nodeId:n.id, portId:p.id, isHandle:false};
  }
  return null;
}
function nearestPortAtNode(nodeId:string, wx:number, wy:number){ const n=doc.diagram.nodes.find(x=>x.id===nodeId); if(!n) return null; const p=nearestPort(n,wx,wy); return p?{nodeId, portId:p.id, isHandle:false}:null; }
function positionLabelEditor() {
  if (!editingNodeId || !inlineEditorWrap) return;
  const node = doc.diagram.nodes.find(n => n.id === editingNodeId);
  if (!node) { finishLabelEdit(false); return; }
  const parent = canvas!.parentElement!, point = camera.worldToScreen(node.position.x, node.position.y);
  const width = Math.max(80, Math.min(320, Math.max(180, getNodeSize(node).w * camera.scale), parent.clientWidth - 24));
  inlineEditorWrap.style.width = `${width}px`;
  inlineEditorWrap.style.left = `${Math.max(8, Math.min(parent.clientWidth - width - 8, point.x - width / 2))}px`;
  inlineEditorWrap.style.top = `${Math.max(8, Math.min(parent.clientHeight - 130, point.y - 45))}px`;
}
function finishLabelEdit(commit: boolean) {
  if (!editingNodeId || !inlineEditor) return;
  const node = doc.diagram.nodes.find(n => n.id === editingNodeId);
  editingNodeId = null;
  inlineEditorWrap?.classList.add("hidden");
  if (commit && node && node.label !== inlineEditor.value) { snapshot(); node.label = inlineEditor.value; }
  requestDraw();
}
inlineEditor?.addEventListener("blur", () => finishLabelEdit(true));
inlineEditor?.addEventListener("keydown", e => {
  e.stopPropagation();
  if (e.key === "Escape") { e.preventDefault(); finishLabelEdit(false); canvas!.focus(); }
  else if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); finishLabelEdit(true); canvas!.focus(); }
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); finishLabelEdit(true); doSave(); }
});
canvas.addEventListener("dblclick", e => {
  const rect = canvas!.getBoundingClientRect();
  const point = camera.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
  const node = hitTestNode(doc.diagram, point.x, point.y) ?? hitTestNodeLabel(doc.diagram, point.x, point.y);
  if (!node || (node.kind.type === "AUX" && node.kind.value === "JUNCTION") || !inlineEditor) return;
  selectedNodeId = node.id; selectedEdgeId = null;
  draggingNode = false; connectingDrag = null; pendingPort = null;
  editingNodeId = node.id; inlineEditor.value = node.label;
  inlineEditorWrap?.classList.remove("hidden");
  inlineEditor.setAttribute("aria-label", `Editar nombre de ${node.label || "elemento"}`);
  positionLabelEditor(); inlineEditor.focus(); inlineEditor.select(); requestDraw();
});
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
    draggingPoolLanes = node.kind.type === "BPMN" && node.kind.value === "POOL" ? lanesInPool(node.id).map(n => n.id) : [];
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
  if (resizingNodeId) {
    const node = doc.diagram.nodes.find(n => n.id === resizingNodeId);
    if (node) {
      const size = getNodeSize(node);
      const width = size.w + (e.clientX - last.x) / camera.scale;
      const height = size.h + (e.clientY - last.y) / camera.scale;
      if (node.kind.type === "BPMN" && node.kind.value === "POOL") {
        // Capture membership before changing bounds, including when shrinking.
        resizePool(node, lanesInPool(node.id), width, height);
      } else {
        const w = Math.max(300, width), h = Math.max(120, height);
        node.position.x += (w - size.w) / 2;
        node.position.y += (h - size.h) / 2;
        node.size = { width: w, height: h };
      }
      last = { x: e.clientX, y: e.clientY };
      requestDraw();
    }
    return;
  }
  if (draggingNode && selectedNodeId) {
    const dxScreen = e.clientX - last.x, dyScreen = e.clientY - last.y;
    // A click (including tiny hand movements) must not move or snap a node.
    if (!dragSnapshotTaken && Math.hypot(dxScreen, dyScreen) < 3) return;
    const node = doc.diagram.nodes.find(n => n.id === selectedNodeId);
    if (node) {
      if (!dragSnapshotTaken) { snapshot(); dragSnapshotTaken = true; }
      const dx = dxScreen / camera.scale, dy = dyScreen / camera.scale;
      node.position.x += dx; node.position.y += dy;
      for (const id of draggingPoolLanes) {
        const lane = doc.diagram.nodes.find(n => n.id === id);
        if (lane) { lane.position.x += dx; lane.position.y += dy; }
      }
      last = { x: e.clientX, y: e.clientY };
      requestDraw();
    }
    return;
  }
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
    let joined = false;
    if (!target && doc.metadata.notation === "DOP") {
      const hit = hitTestEdge(doc.diagram, w.x, w.y, 8 / camera.scale);
      // Joining a source to its own connector would create a redundant cycle.
      if (hit && hit.source.node_id !== connectingDrag.nodeId && hit.target.node_id !== connectingDrag.nodeId) {
        snapshot(); joined = true;
        const junction = joinEdgeAt(doc.diagram, hit, w.x, w.y);
        if (junction) target = nearestPortAtNode(junction.id, w.x, w.y);
      }
    }
    if(target && (target.nodeId!==connectingDrag.nodeId || target.portId!==connectingDrag.portId)){
      if (!joined) snapshot();
      const edge:DiagramEdge={id:crypto.randomUUID(),source:{node_id:connectingDrag.nodeId,port_id:connectingDrag.portId},target:{node_id:target.nodeId,port_id:target.portId},label:null,kind:currentEdgeKind};
      doc.diagram.edges.push(edge); selectedEdgeId=edge.id; selectedNodeId=null;
    }
    connectingDrag=null; mouseWorld=null; if(!connectMode) pendingPort=null;
  }
  if(draggingNode && dragSnapshotTaken && selectedNodeId){
    const node=doc.diagram.nodes.find(n=>n.id===selectedNodeId);
    if(node){
      const sx=Math.round(node.position.x/20)*20, sy=Math.round(node.position.y/20)*20;
      const sdx=sx-node.position.x, sdy=sy-node.position.y;
      node.position.x=sx; node.position.y=sy;
      if (draggingPoolLanes.length) {
        for (const lid of draggingPoolLanes) { const ln = doc.diagram.nodes.find(n=>n.id===lid); if (ln) { ln.position.x += sdx; ln.position.y += sdy; } }
      }
    }
  }
  if (resizingNodeId) {
    const node = doc.diagram.nodes.find(n => n.id === resizingNodeId);
    if (node?.size) {
      const width = Math.round(node.size.width / 20) * 20;
      const height = Math.round(node.size.height / 20) * 20;
      if (node.kind.type === "BPMN" && node.kind.value === "POOL") resizePool(node, lanesInPool(node.id), width, height);
      else {
        node.position.x += (width - node.size.width) / 2;
        node.position.y += (height - node.size.height) / 2;
        node.size = { width, height };
      }
    }
  }
  draggingPoolLanes = [];
  panning=false; draggingNode=false; dragSnapshotTaken=false; resizingNodeId=null; canvas.style.cursor="default"; requestDraw();
});

function isCompatibleWithNotation(notation: NotationType): boolean {
  return doc.diagram.nodes.every(n => {
    if (n.kind.type === "AUX") return notation === "DOP";
    if (notation === "BPMN") return n.kind.type === "BPMN";
    if (notation === "DAP") return n.kind.type === "OIT";
    if (notation === "DOP") return n.kind.type === "OIT" && (n.kind.value === "OPERATION" || n.kind.value === "INSPECTION" || n.kind.value === "COMBINED");
    return true;
  });
}

function bindPropInputs(){
  let propTimer:any=null; const onChange=()=>{ if(!selectedNodeId) return; const node=doc.diagram.nodes.find(n=>n.id===selectedNodeId); if(!node) return; if(!propTimer) snapshot(); clearTimeout(propTimer); propTimer=setTimeout(()=>{propTimer=null;},500);
    if (node.kind.type === "AUX" && node.kind.value === "TEXT") { if (propText) node.label = propText.value; }
    else if (propLabel) node.label = propLabel.value;
    if (propNumber && node.kind.type === "OIT" && doc.metadata.notation === "DOP") node.activity_number = propNumber.value.trim() || null; if(propResource) node.resource=propResource.value||null;
    if(propTime || propTimeUnit){
      node.metrics.time_value = propTime && propTime.value!=="" ? Number(propTime.value) : null;
      node.metrics.time_unit = (propTimeUnit?.value as TimeUnit) || "SECONDS";
      node.metrics = syncTimeMetrics(node.metrics);
    }
    if(propDist) node.metrics.distance_meters = propDist.value===""?null:Number(propDist.value);
    requestDraw();
  };
  [propLabel,propText,propNumber,propResource,propTime,propDist,propTimeUnit].forEach(el=>{ el?.addEventListener("input",onChange as any); el?.addEventListener("change",()=>{propTimer=null; onChange();}); });
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
orientationSelect?.addEventListener("change", () => {
  const pool = doc.diagram.nodes.find(n => n.id === selectedNodeId);
  if (!pool || pool.kind.type !== "BPMN" || pool.kind.value !== "POOL") return;
  const size = getNodeSize(pool);
  const contents = doc.diagram.nodes.filter(n => n.id !== pool.id && Math.abs(n.position.x - pool.position.x) <= size.w/2 && Math.abs(n.position.y - pool.position.y) <= size.h/2);
  snapshot();
  setPoolOrientation(pool, contents, orientationSelect.value === "VERTICAL" ? "VERTICAL" : "HORIZONTAL");
  const ids = new Set(contents.map(n => n.id));
  const transposePort = (id: string) => ({ n: "w", w: "n", s: "e", e: "s" }[id] ?? id);
  for (const edge of doc.diagram.edges) {
    if (ids.has(edge.source.node_id)) edge.source.port_id = transposePort(edge.source.port_id);
    if (ids.has(edge.target.node_id)) edge.target.port_id = transposePort(edge.target.port_id);
  }
  requestDraw();
});
bindPropInputs(); window.addEventListener("resize",resize); camera.x=60; camera.y=60; showStartModal(true); resize();
// keep canvas bitmap matched to CSS size (prevents distortion)
if (canvas?.parentElement && "ResizeObserver" in window) {
  new ResizeObserver(() => resize()).observe(canvas.parentElement);
}
