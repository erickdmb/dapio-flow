import { Camera } from "./camera";
import type { BpmnElementType, Diagram, DiagramEdge, DiagramNode, OitKind, Port } from "../model/types";
import { nodeColors } from "../model/colors";

export function oitNodeSize(kind: OitKind): { w: number; h: number } {
  switch (kind) {
    case "OPERATION": return { w: 40, h: 40 };
    case "TRANSPORT": return { w: 45, h: 25 };
    case "INSPECTION": return { w: 36, h: 36 };
    case "DELAY": return { w: 40, h: 40 };
    case "STORAGE": return { w: 40, h: 35 };
    case "COMBINED": return { w: 40, h: 40 };
  }
}
export function bpmnNodeSize(kind: BpmnElementType): { w: number; h: number } {
  switch (kind) {
    case "TASK": return { w: 90, h: 50 };
    case "START_EVENT": return { w: 36, h: 36 };
    case "END_EVENT": return { w: 36, h: 36 };
    case "EXCLUSIVE_GATEWAY": return { w: 44, h: 44 };
    case "PARALLEL_GATEWAY": return { w: 44, h: 44 };
    case "POOL": return { w: 600, h: 220 };
    case "LANE": return { w: 560, h: 120 };
  }
}
export function nodeSize(kind: OitKind): { w: number; h: number } { return oitNodeSize(kind); }
export function getNodeSize(node: DiagramNode): { w: number; h: number } {
  if (node.size?.width && node.size?.height) return { w: node.size.width, h: node.size.height };
  return node.kind.type === "OIT" ? oitNodeSize(node.kind.value) : bpmnNodeSize(node.kind.value);
}

export function portWorldPosition(node: DiagramNode, portId: string): { x: number; y: number } | null {
  const { w, h } = getNodeSize(node);
  switch (portId) {
    case "n": return { x: node.position.x, y: node.position.y - h / 2 };
    case "s": return { x: node.position.x, y: node.position.y + h / 2 };
    case "e": return { x: node.position.x + w / 2, y: node.position.y };
    case "w": return { x: node.position.x - w / 2, y: node.position.y };
    default: return null;
  }
}

function drawOit(ctx: CanvasRenderingContext2D, kind: OitKind, selected: boolean, fill = "#fff", stroke = "#1f2937") {
  const { w, h } = oitNodeSize(kind);
  ctx.fillStyle = fill;
  ctx.strokeStyle = selected ? "#2563eb" : stroke;
  ctx.lineWidth = selected ? 2.5 : 2;
  switch (kind) {
    case "OPERATION": ctx.beginPath(); ctx.arc(0, 0, w / 2, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); break;
    case "INSPECTION": ctx.beginPath(); ctx.rect(-w / 2, -h / 2, w, h); ctx.fill(); ctx.stroke(); break;
    case "DELAY":
      ctx.beginPath(); ctx.moveTo(-w / 2, -h / 2); ctx.lineTo(-w / 2, h / 2);
      ctx.arc(-w / 2, 0, h / 2, Math.PI / 2, -Math.PI / 2, true); ctx.closePath(); ctx.fill(); ctx.stroke(); break;
    case "STORAGE":
      ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(-w / 2, -h / 2); ctx.lineTo(w / 2, -h / 2);
      ctx.closePath(); ctx.fill(); ctx.stroke(); break;
    case "COMBINED":
      ctx.beginPath(); ctx.rect(-w / 2, -h / 2, w, h); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, w / 2 - 2, 0, Math.PI * 2); ctx.stroke(); break;
    case "TRANSPORT":
      ctx.beginPath(); ctx.moveTo(-w / 2, -h / 2); ctx.lineTo(w / 2 - 10, -h / 2);
      ctx.lineTo(w / 2, 0); ctx.lineTo(w / 2 - 10, h / 2); ctx.lineTo(-w / 2, h / 2);
      ctx.closePath(); ctx.fill(); ctx.stroke(); break;
  }
}

function drawBpmn(ctx: CanvasRenderingContext2D, kind: BpmnElementType, selected: boolean, fill = "#fff", stroke = "#1f2937", custom?: {w:number;h:number;label?:string}) {
  const { w, h } = custom ? {w: custom.w, h: custom.h} : bpmnNodeSize(kind);
  ctx.fillStyle = fill;
  ctx.strokeStyle = selected ? "#2563eb" : stroke;
  ctx.lineWidth = selected ? 2.5 : 2;
  switch (kind) {
    case "TASK": {
      const r = 8;
      ctx.beginPath();
      ctx.moveTo(-w/2+r, -h/2); ctx.lineTo(w/2-r, -h/2); ctx.quadraticCurveTo(w/2, -h/2, w/2, -h/2+r);
      ctx.lineTo(w/2, h/2-r); ctx.quadraticCurveTo(w/2, h/2, w/2-r, h/2);
      ctx.lineTo(-w/2+r, h/2); ctx.quadraticCurveTo(-w/2, h/2, -w/2, h/2-r);
      ctx.lineTo(-w/2, -h/2+r); ctx.quadraticCurveTo(-w/2, -h/2, -w/2+r, -h/2);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      break;
    }
    case "START_EVENT":
      ctx.beginPath(); ctx.arc(0,0,w/2,0,Math.PI*2); ctx.fill(); ctx.stroke(); break;
    case "END_EVENT":
      ctx.beginPath(); ctx.arc(0,0,w/2,0,Math.PI*2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(0,0,w/2-4,0,Math.PI*2); ctx.lineWidth = selected ? 2.5 : 3; ctx.stroke(); break;
    case "EXCLUSIVE_GATEWAY":
    case "PARALLEL_GATEWAY":
      ctx.beginPath(); ctx.moveTo(0,-h/2); ctx.lineTo(w/2,0); ctx.lineTo(0,h/2); ctx.lineTo(-w/2,0); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.lineWidth = 2; ctx.strokeStyle = selected ? "#2563eb" : stroke;
      if (kind === "EXCLUSIVE_GATEWAY") { ctx.beginPath(); ctx.moveTo(-7,-7); ctx.lineTo(7,7); ctx.moveTo(7,-7); ctx.lineTo(-7,7); ctx.stroke(); }
      else { ctx.beginPath(); ctx.moveTo(0,-9); ctx.lineTo(0,9); ctx.moveTo(-9,0); ctx.lineTo(9,0); ctx.stroke(); }
      break;
    case "POOL":
    case "LANE": {
      ctx.fillStyle = kind === "POOL" ? (fill || "#f8fafc") : (fill || "#ffffff");
      ctx.strokeStyle = selected ? "#2563eb" : stroke;
      ctx.lineWidth = selected ? 2.5 : 1.5;
      ctx.beginPath(); ctx.rect(-w/2, -h/2, w, h); ctx.fill(); ctx.stroke();
      // header band
      const headerW = 28;
      ctx.beginPath(); ctx.rect(-w/2, -h/2, headerW, h); ctx.fillStyle = kind === "POOL" ? "#e2e8f0" : "#f1f5f9"; ctx.fill(); ctx.stroke();
      ctx.save(); ctx.translate(-w/2 + headerW/2, 0); ctx.rotate(-Math.PI/2);
      ctx.fillStyle = "#334155"; ctx.font = "12px Inter, system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText((custom?.label || (kind === "POOL" ? "Pool" : "Carril")).slice(0, 30), 0, 0);
      ctx.restore();
      break;
    }
  }
}

function orthogonalPath(a: {x:number;y:number}, b: {x:number;y:number}, fromPort: string, toPort: string): {x:number;y:number}[] {
  const midX = (a.x + b.x) / 2, midY = (a.y + b.y) / 2;
  const horiz = (p: string) => p === "e" || p === "w";
  if (horiz(fromPort) && horiz(toPort)) return [a, { x: midX, y: a.y }, { x: midX, y: b.y }, b];
  if (!horiz(fromPort) && !horiz(toPort)) return [a, { x: a.x, y: midY }, { x: b.x, y: midY }, b];
  if (horiz(fromPort)) return [a, { x: b.x, y: a.y }, b];
  return [a, { x: a.x, y: b.y }, b];
}
function drawRoundedPolyline(ctx: CanvasRenderingContext2D, pts: {x:number;y:number}[], r: number) {
  if (pts.length < 2) return;
  ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1], cur = pts[i], next = pts[i + 1];
    const v1x = cur.x - prev.x, v1y = cur.y - prev.y, v2x = next.x - cur.x, v2y = next.y - cur.y;
    const len1 = Math.hypot(v1x, v1y), len2 = Math.hypot(v2x, v2y);
    const rr = Math.min(r, len1 / 2, len2 / 2);
    if (rr > 0) {
      ctx.lineTo(cur.x - (v1x / len1) * rr, cur.y - (v1y / len1) * rr);
      ctx.quadraticCurveTo(cur.x, cur.y, cur.x + (v2x / len2) * rr, cur.y + (v2y / len2) * rr);
    } else ctx.lineTo(cur.x, cur.y);
  }
  ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
}
function drawArrowHead(ctx: CanvasRenderingContext2D, from: {x:number;y:number}, to: {x:number;y:number}, size: number) {
  const ang = Math.atan2(to.y - from.y, to.x - from.x);
  ctx.beginPath(); ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - size * Math.cos(ang - Math.PI / 7), to.y - size * Math.sin(ang - Math.PI / 7));
  ctx.lineTo(to.x - size * Math.cos(ang + Math.PI / 7), to.y - size * Math.sin(ang + Math.PI / 7));
  ctx.closePath(); ctx.fill();
}
function inferPortFromPoint(p: {x:number;y:number}, from: {x:number;y:number}): string {
  const dx = p.x - from.x, dy = p.y - from.y;
  if (Math.abs(dx) > Math.abs(dy)) return dx >= 0 ? "e" : "w";
  return dy >= 0 ? "s" : "n";
}

export function renderDiagram(
  ctx: CanvasRenderingContext2D, cssW: number, cssH: number, camera: Camera,
  diagram: Diagram, selectedNodeId: string | null, selectedEdgeId: string | null,
  pending?: { nodeId: string; portId: string } | null, hoverPort?: { nodeId: string; portId: string } | null,
  connectMode = false,
  mouseWorld?: { x: number; y: number } | null
) {
  ctx.clearRect(0, 0, cssW, cssH);
  const topLeft = camera.screenToWorld(0, 0), bottomRight = camera.screenToWorld(cssW, cssH);
  const grid = 20;
  ctx.save(); ctx.strokeStyle = "#eef1f5"; ctx.lineWidth = 1 / camera.scale;
  for (let x = Math.floor(topLeft.x / grid) * grid; x <= bottomRight.x; x += grid) {
    const s = camera.worldToScreen(x, 0); ctx.beginPath(); ctx.moveTo(s.x, 0); ctx.lineTo(s.x, cssH); ctx.stroke();
  }
  for (let y = Math.floor(topLeft.y / grid) * grid; y <= bottomRight.y; y += grid) {
    const s = camera.worldToScreen(0, y); ctx.beginPath(); ctx.moveTo(0, s.y); ctx.lineTo(cssW, s.y); ctx.stroke();
  }
  ctx.restore();

  const nodeById = new Map(diagram.nodes.map(n => [n.id, n]));
  // draw container nodes (pools/lanes) first as background
  for (const node of diagram.nodes) {
    if (!(node.kind.type === "BPMN" && (node.kind.value === "POOL" || node.kind.value === "LANE"))) continue;
    const s = camera.worldToScreen(node.position.x, node.position.y);
    const size = getNodeSize(node);
    const colors = nodeColors(node);
    ctx.save(); ctx.translate(s.x, s.y); ctx.scale(camera.scale, camera.scale);
    drawBpmn(ctx, node.kind.value, node.id === selectedNodeId, colors.fill, colors.stroke, {w:size.w,h:size.h,label:node.label});
    ctx.restore();
  }

  for (const edge of diagram.edges) {
    const sn = nodeById.get(edge.source.node_id), tn = nodeById.get(edge.target.node_id);
    if (!sn || !tn) continue;
    const a = portWorldPosition(sn, edge.source.port_id), b = portWorldPosition(tn, edge.target.port_id);
    if (!a || !b) continue;
    const pts = orthogonalPath(a, b, edge.source.port_id, edge.target.port_id).map(p => camera.worldToScreen(p.x, p.y));
    ctx.save();
    const color = edge.id === selectedEdgeId ? "#2563eb" : (edge.kind === "ASSOCIATION" ? "#6b7280" : "#64748b");
    ctx.strokeStyle = color; ctx.fillStyle = color;
    ctx.lineWidth = edge.id === selectedEdgeId ? 2.5 : 1.5;
    if (edge.kind === "ASSOCIATION") ctx.setLineDash([6,4]);
    drawRoundedPolyline(ctx, pts, 8); ctx.stroke();
    ctx.setLineDash([]);
    if (edge.kind === "SEQUENCE_FLOW" && pts.length >= 2) drawArrowHead(ctx, pts[pts.length - 2], pts[pts.length - 1], 9);
    ctx.restore();
  }

  // connection drag preview (orthogonal)
  if (pending && mouseWorld) {
    const pn = nodeById.get(pending.nodeId);
    if (pn) {
      const a = portWorldPosition(pn, pending.portId);
      if (a) {
        let b = mouseWorld;
        let toPort = inferPortFromPoint(mouseWorld, a);
        if (hoverPort && hoverPort.nodeId !== pending.nodeId) {
          const tn = nodeById.get(hoverPort.nodeId);
          const tp = tn ? portWorldPosition(tn, hoverPort.portId) : null;
          if (tp) { b = tp; toPort = hoverPort.portId; }
        }
        const pts = orthogonalPath(a, b, pending.portId, toPort).map(p => camera.worldToScreen(p.x, p.y));
        ctx.save(); ctx.strokeStyle = "#2563eb"; ctx.fillStyle = "#2563eb"; ctx.lineWidth = 2; ctx.setLineDash([6,4]);
        drawRoundedPolyline(ctx, pts, 8); ctx.stroke();
        ctx.setLineDash([]);
        if (hoverPort && hoverPort.nodeId !== pending.nodeId && pts.length >= 2) drawArrowHead(ctx, pts[pts.length - 2], pts[pts.length - 1], 8);
        ctx.restore();
      }
    }
  }

  for (const node of diagram.nodes) {
    if (node.kind.type === "BPMN" && (node.kind.value === "POOL" || node.kind.value === "LANE")) continue;
    const s = camera.worldToScreen(node.position.x, node.position.y);
    const size = getNodeSize(node);
    const colors = nodeColors(node);
    ctx.save(); ctx.translate(s.x, s.y); ctx.scale(camera.scale, camera.scale);
    if (node.kind.type === "OIT") drawOit(ctx, node.kind.value, node.id === selectedNodeId, colors.fill, colors.stroke);
    else drawBpmn(ctx, node.kind.value, node.id === selectedNodeId, colors.fill, colors.stroke);
    ctx.restore();

    ctx.fillStyle = "#111827"; ctx.font = `12px Inter, system-ui, sans-serif`; ctx.textAlign = "center";
    const labelY = s.y + (size.h / 2 + 14) * camera.scale;
    ctx.fillText(node.label || "", s.x, labelY);
    const t = node.metrics?.time_seconds;
    if (t !== null && t !== undefined) {
      ctx.fillStyle = "#2563eb"; ctx.font = `11px Inter, system-ui, sans-serif`;
      const unit = node.metrics?.time_unit;
      const val = node.metrics?.time_value ?? t;
      const ulabel = unit === "HOURS" ? "h" : unit === "MINUTES" ? "min" : "s";
      ctx.fillText(`${val} ${ulabel}`, s.x, labelY + 13);
    }

    // ports/connectors (inside/visible handles for easier connection)
    for (const p of node.ports) {
      const pw = portWorldPosition(node, p.id); if (!pw) continue;
      const ps = camera.worldToScreen(pw.x, pw.y);
      const isPending = pending?.nodeId === node.id && pending.portId === p.id;
      const isHover = hoverPort?.nodeId === node.id && hoverPort.portId === p.id;
      const selected = node.id === selectedNodeId;
      const show = connectMode || pending || isPending || isHover || selected;
      if (show) {
        ctx.beginPath(); ctx.arc(ps.x, ps.y, isPending || isHover ? 5.5 : 4, 0, Math.PI * 2);
        ctx.fillStyle = isPending ? "#2563eb" : isHover ? "#16a34a" : "#ffffff";
        ctx.strokeStyle = isPending ? "#1d4ed8" : isHover ? "#15803d" : colors.stroke;
        ctx.lineWidth = 1.5; ctx.fill(); ctx.stroke();
      }
    }
  }
}

export function hitTestNode(diagram: Diagram, wx: number, wy: number): DiagramNode | null {
  for (let i = diagram.nodes.length - 1; i >= 0; i--) {
    const n = diagram.nodes[i];
    const { w, h } = getNodeSize(n);
    const pad = 4;
    if (wx >= n.position.x - w / 2 - pad && wx <= n.position.x + w / 2 + pad &&
        wy >= n.position.y - h / 2 - pad && wy <= n.position.y + h / 2 + pad) return n;
  }
  return null;
}
export function hitTestPort(node: DiagramNode, wx: number, wy: number, radius = 10): Port | null {
  for (const p of node.ports) {
    const pw = portWorldPosition(node, p.id); if (!pw) continue;
    if (Math.hypot(wx - pw.x, wy - pw.y) <= radius) return p;
  }
  return null;
}
export function nearestPort(node: DiagramNode, wx: number, wy: number): Port | null {
  let best: Port | null = null; let bestD = Infinity;
  for (const p of node.ports) {
    const pw = portWorldPosition(node, p.id); if (!pw) continue;
    const d = Math.hypot(wx - pw.x, wy - pw.y);
    if (d < bestD) { bestD = d; best = p; }
  }
  return best;
}
function distToSegment(px:number,py:number,ax:number,ay:number,bx:number,by:number) {
  const abx = bx-ax, aby = by-ay, apx = px-ax, apy = py-ay;
  const ab2 = abx*abx + aby*aby || 1; let t = (apx*abx + apy*aby) / ab2; t = Math.max(0, Math.min(1, t));
  const cx = ax + abx*t, cy = ay + aby*t; return Math.hypot(px-cx, py-cy);
}
export function hitTestEdge(diagram: Diagram, wx: number, wy: number, tol = 6): DiagramEdge | null {
  const nodeById = new Map(diagram.nodes.map(n => [n.id, n]));
  for (let i = diagram.edges.length - 1; i >= 0; i--) {
    const e = diagram.edges[i];
    const sn = nodeById.get(e.source.node_id), tn = nodeById.get(e.target.node_id);
    if (!sn || !tn) continue;
    const a = portWorldPosition(sn, e.source.port_id), b = portWorldPosition(tn, e.target.port_id);
    if (!a || !b) continue;
    const pts = orthogonalPath(a, b, e.source.port_id, e.target.port_id);
    for (let j = 0; j < pts.length - 1; j++) if (distToSegment(wx, wy, pts[j].x, pts[j].y, pts[j+1].x, pts[j+1].y) <= tol) return e;
  }
  return null;
}