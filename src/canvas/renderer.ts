import { Camera } from "./camera";
import type { Diagram, DiagramEdge, DiagramNode, OitKind, Port } from "../model/types";

export function nodeSize(kind: OitKind): { w: number; h: number } {
  switch (kind) {
    case "OPERATION": return { w: 40, h: 40 };
    case "TRANSPORT": return { w: 45, h: 25 };
    case "INSPECTION": return { w: 36, h: 36 };
    case "DELAY": return { w: 40, h: 40 };
    case "STORAGE": return { w: 40, h: 35 };
    case "COMBINED": return { w: 40, h: 40 };
  }
}

export function portWorldPosition(node: DiagramNode, portId: string): { x: number; y: number } | null {
  if (node.kind.type !== "OIT") {
    const w = 60, h = 40;
    switch (portId) {
      case "n": return { x: node.position.x, y: node.position.y - h / 2 };
      case "s": return { x: node.position.x, y: node.position.y + h / 2 };
      case "e": return { x: node.position.x + w / 2, y: node.position.y };
      case "w": return { x: node.position.x - w / 2, y: node.position.y };
      default: return null;
    }
  }
  const { w, h } = nodeSize(node.kind.value);
  switch (portId) {
    case "n": return { x: node.position.x, y: node.position.y - h / 2 };
    case "s": return { x: node.position.x, y: node.position.y + h / 2 };
    case "e": return { x: node.position.x + w / 2, y: node.position.y };
    case "w": return { x: node.position.x - w / 2, y: node.position.y };
    default: return null;
  }
}

function drawOit(ctx: CanvasRenderingContext2D, kind: OitKind, x: number, y: number, selected: boolean) {
  const { w, h } = nodeSize(kind);
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = selected ? "#2563eb" : "#222";
  ctx.lineWidth = selected ? 2.5 : 1.5;
  switch (kind) {
    case "OPERATION":
      ctx.beginPath(); ctx.arc(0, 0, w / 2, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); break;
    case "INSPECTION":
      ctx.beginPath(); ctx.rect(-w / 2, -h / 2, w, h); ctx.fill(); ctx.stroke(); break;
    case "DELAY":
      ctx.beginPath();
      ctx.moveTo(-w / 2, -h / 2); ctx.lineTo(-w / 2, h / 2);
      ctx.arc(-w / 2, 0, h / 2, Math.PI / 2, -Math.PI / 2, true);
      ctx.closePath(); ctx.fill(); ctx.stroke(); break;
    case "STORAGE":
      ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(-w / 2, -h / 2); ctx.lineTo(w / 2, -h / 2);
      ctx.closePath(); ctx.fill(); ctx.stroke(); break;
    case "COMBINED":
      ctx.beginPath(); ctx.rect(-w / 2, -h / 2, w, h); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, w / 2 - 2, 0, Math.PI * 2); ctx.stroke(); break;
    case "TRANSPORT":
      ctx.beginPath();
      ctx.moveTo(-w / 2, -h / 2); ctx.lineTo(w / 2 - 10, -h / 2);
      ctx.lineTo(w / 2, 0); ctx.lineTo(w / 2 - 10, h / 2); ctx.lineTo(-w / 2, h / 2);
      ctx.closePath(); ctx.fill(); ctx.stroke(); break;
  }
  ctx.restore();
}

function orthogonalPath(a: {x:number;y:number}, b: {x:number;y:number}, fromPort: string, toPort: string): {x:number;y:number}[] {
  const midX = (a.x + b.x) / 2;
  const midY = (a.y + b.y) / 2;
  const horiz = (p: string) => p === "e" || p === "w";
  if (horiz(fromPort) && horiz(toPort)) {
    return [a, { x: midX, y: a.y }, { x: midX, y: b.y }, b];
  }
  if (!horiz(fromPort) && !horiz(toPort)) {
    return [a, { x: a.x, y: midY }, { x: b.x, y: midY }, b];
  }
  if (horiz(fromPort)) {
    return [a, { x: b.x, y: a.y }, b];
  }
  return [a, { x: a.x, y: b.y }, b];
}

function drawRoundedPolyline(ctx: CanvasRenderingContext2D, pts: {x:number;y:number}[], r: number) {
  if (pts.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1], cur = pts[i], next = pts[i + 1];
    const v1x = cur.x - prev.x, v1y = cur.y - prev.y;
    const v2x = next.x - cur.x, v2y = next.y - cur.y;
    const len1 = Math.hypot(v1x, v1y), len2 = Math.hypot(v2x, v2y);
    const rr = Math.min(r, len1 / 2, len2 / 2);
    if (rr > 0) {
      ctx.lineTo(cur.x - (v1x / len1) * rr, cur.y - (v1y / len1) * rr);
      ctx.quadraticCurveTo(cur.x, cur.y, cur.x + (v2x / len2) * rr, cur.y + (v2y / len2) * rr);
    } else {
      ctx.lineTo(cur.x, cur.y);
    }
  }
  ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
}

function drawArrowHead(ctx: CanvasRenderingContext2D, from: {x:number;y:number}, to: {x:number;y:number}, size: number) {
  const ang = Math.atan2(to.y - from.y, to.x - from.x);
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - size * Math.cos(ang - Math.PI / 7), to.y - size * Math.sin(ang - Math.PI / 7));
  ctx.lineTo(to.x - size * Math.cos(ang + Math.PI / 7), to.y - size * Math.sin(ang + Math.PI / 7));
  ctx.closePath();
  ctx.fill();
}

export function renderDiagram(
  ctx: CanvasRenderingContext2D,
  cssW: number,
  cssH: number,
  camera: Camera,
  diagram: Diagram,
  selectedNodeId: string | null,
  selectedEdgeId: string | null,
  pending?: { nodeId: string; portId: string } | null,
  hoverPort?: { nodeId: string; portId: string } | null
) {
  ctx.clearRect(0, 0, cssW, cssH);
  const topLeft = camera.screenToWorld(0, 0);
  const bottomRight = camera.screenToWorld(cssW, cssH);
  const grid = 20;
  const startX = Math.floor(topLeft.x / grid) * grid;
  const startY = Math.floor(topLeft.y / grid) * grid;
  ctx.save();
  ctx.strokeStyle = "#eaeaea";
  ctx.lineWidth = 1 / camera.scale;
  for (let x = startX; x <= bottomRight.x; x += grid) {
    const s = camera.worldToScreen(x, 0);
    ctx.beginPath(); ctx.moveTo(s.x, 0); ctx.lineTo(s.x, cssH); ctx.stroke();
  }
  for (let y = startY; y <= bottomRight.y; y += grid) {
    const s = camera.worldToScreen(0, y);
    ctx.beginPath(); ctx.moveTo(0, s.y); ctx.lineTo(cssW, s.y); ctx.stroke();
  }
  ctx.restore();

  // edges
  const nodeById = new Map(diagram.nodes.map(n => [n.id, n]));
  for (const edge of diagram.edges) {
    const sn = nodeById.get(edge.source.node_id);
    const tn = nodeById.get(edge.target.node_id);
    if (!sn || !tn) continue;
    const a = portWorldPosition(sn, edge.source.port_id);
    const b = portWorldPosition(tn, edge.target.port_id);
    if (!a || !b) continue;
    const pts = orthogonalPath(a, b, edge.source.port_id, edge.target.port_id).map(p => camera.worldToScreen(p.x, p.y));
    ctx.save();
    ctx.strokeStyle = edge.id === selectedEdgeId ? "#2563eb" : "#555";
    ctx.fillStyle = edge.id === selectedEdgeId ? "#2563eb" : "#555";
    ctx.lineWidth = edge.id === selectedEdgeId ? 2.5 : 1.5;
    drawRoundedPolyline(ctx, pts, 8);
    ctx.stroke();
    if (pts.length >= 2) drawArrowHead(ctx, pts[pts.length - 2], pts[pts.length - 1], 9);
    ctx.restore();
  }

  // nodes
  for (const node of diagram.nodes) {
    const s = camera.worldToScreen(node.position.x, node.position.y);
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.scale(camera.scale, camera.scale);
    if (node.kind.type === "OIT") {
      drawOit(ctx, node.kind.value, 0, 0, node.id === selectedNodeId);
    } else {
      ctx.fillStyle = "#fff"; ctx.strokeStyle = node.id === selectedNodeId ? "#2563eb" : "#222";
      ctx.strokeRect(-30, -20, 60, 40);
    }
    ctx.restore();
    ctx.fillStyle = "#333";
    ctx.font = `12px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(node.label, s.x, s.y + (node.kind.type === "OIT" ? nodeSize(node.kind.value).h / 2 + 14 : 34) * camera.scale);

    // ports hints when connecting/pending/hover
    if (node.kind.type === "OIT") {
      for (const p of node.ports) {
        const pw = portWorldPosition(node, p.id);
        if (!pw) continue;
        const ps = camera.worldToScreen(pw.x, pw.y);
        const isPending = pending?.nodeId === node.id && pending.portId === p.id;
        const isHover = hoverPort?.nodeId === node.id && hoverPort.portId === p.id;
        if (pending || hoverPort) {
          ctx.beginPath();
          ctx.arc(ps.x, ps.y, isPending || isHover ? 5 : 3.5, 0, Math.PI * 2);
          ctx.fillStyle = isPending ? "#2563eb" : isHover ? "#16a34a" : "#94a3b8";
          ctx.fill();
        }
      }
    }
  }
}

export function hitTestNode(diagram: Diagram, wx: number, wy: number): DiagramNode | null {
  for (let i = diagram.nodes.length - 1; i >= 0; i--) {
    const n = diagram.nodes[i];
    if (n.kind.type !== "OIT") continue;
    const { w, h } = nodeSize(n.kind.value);
    const pad = 4;
    if (wx >= n.position.x - w / 2 - pad && wx <= n.position.x + w / 2 + pad &&
        wy >= n.position.y - h / 2 - pad && wy <= n.position.y + h / 2 + pad) return n;
  }
  return null;
}

export function hitTestPort(node: DiagramNode, wx: number, wy: number, radius = 8): Port | null {
  for (const p of node.ports) {
    const pw = portWorldPosition(node, p.id);
    if (!pw) continue;
    if (Math.hypot(wx - pw.x, wy - pw.y) <= radius) return p;
  }
  return null;
}

function distToSegment(px:number,py:number,ax:number,ay:number,bx:number,by:number) {
  const abx = bx-ax, aby = by-ay, apx = px-ax, apy = py-ay;
  const ab2 = abx*abx + aby*aby || 1;
  let t = (apx*abx + apy*aby) / ab2; t = Math.max(0, Math.min(1, t));
  const cx = ax + abx*t, cy = ay + aby*t;
  return Math.hypot(px-cx, py-cy);
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
    for (let j = 0; j < pts.length - 1; j++) {
      if (distToSegment(wx, wy, pts[j].x, pts[j].y, pts[j+1].x, pts[j+1].y) <= tol) return e;
    }
  }
  return null;
}