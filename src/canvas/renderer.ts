import { Camera } from "./camera";
import type { Diagram, DiagramNode, OitKind } from "../model/types";

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

function drawOit(ctx: CanvasRenderingContext2D, kind: OitKind, x: number, y: number, selected: boolean) {
  const { w, h } = nodeSize(kind);
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = selected ? "#2563eb" : "#222";
  ctx.lineWidth = selected ? 2.5 : 1.5;

  switch (kind) {
    case "OPERATION":
      ctx.beginPath(); ctx.arc(0, 0, w / 2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      break;
    case "INSPECTION":
      ctx.beginPath(); ctx.rect(-w / 2, -h / 2, w, h); ctx.fill(); ctx.stroke();
      break;
    case "DELAY":
      ctx.beginPath();
      ctx.moveTo(-w / 2, -h / 2);
      ctx.lineTo(-w / 2, h / 2);
      ctx.arc(-w / 2, 0, h / 2, Math.PI / 2, -Math.PI / 2, true);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      break;
    case "STORAGE":
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(-w / 2, -h / 2);
      ctx.lineTo(w / 2, -h / 2);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      break;
    case "COMBINED":
      ctx.beginPath(); ctx.rect(-w / 2, -h / 2, w, h); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, w / 2 - 2, 0, Math.PI * 2); ctx.stroke();
      break;
    case "TRANSPORT":
      ctx.beginPath();
      ctx.moveTo(-w / 2, -h / 2);
      ctx.lineTo(w / 2 - 10, -h / 2);
      ctx.lineTo(w / 2, 0);
      ctx.lineTo(w / 2 - 10, h / 2);
      ctx.lineTo(-w / 2, h / 2);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      break;
  }
  ctx.restore();
}

export function renderDiagram(
  ctx: CanvasRenderingContext2D,
  cssW: number,
  cssH: number,
  camera: Camera,
  diagram: Diagram,
  selectedId: string | null
) {
  ctx.clearRect(0, 0, cssW, cssH);

  // grid in world space
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

  // nodes
  for (const node of diagram.nodes) {
    const s = camera.worldToScreen(node.position.x, node.position.y);
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.scale(camera.scale, camera.scale);
    if (node.kind.type === "OIT") {
      drawOit(ctx, node.kind.value, 0, 0, node.id === selectedId);
    } else {
      ctx.fillStyle = "#fff"; ctx.strokeStyle = node.id === selectedId ? "#2563eb" : "#222";
      ctx.strokeRect(-30, -20, 60, 40);
    }
    ctx.restore();

    // label
    ctx.fillStyle = "#333";
    ctx.font = `${12}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(node.label, s.x, s.y + (node.kind.type === "OIT" ? nodeSize(node.kind.value).h / 2 + 14 : 34) * camera.scale);
  }
}

export function hitTestNode(diagram: Diagram, wx: number, wy: number): DiagramNode | null {
  // iterate reverse for top-most
  for (let i = diagram.nodes.length - 1; i >= 0; i--) {
    const n = diagram.nodes[i];
    if (n.kind.type !== "OIT") continue;
    const { w, h } = nodeSize(n.kind.value);
    const pad = 4;
    if (wx >= n.position.x - w / 2 - pad && wx <= n.position.x + w / 2 + pad &&
        wy >= n.position.y - h / 2 - pad && wy <= n.position.y + h / 2 + pad) {
      return n;
    }
  }
  return null;
}