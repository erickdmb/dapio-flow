import type { Diagram } from "../model/types";
import { getNodeSize } from "../canvas/renderer";

export function diagramBounds(diagram: Diagram, measureText: (text: string, fontSize?: number) => number) {
  if (!diagram.nodes.length) throw new Error("El diagrama está vacío");
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (const node of diagram.nodes) {
    let { w, h } = getNodeSize(node);
    if (node.kind.type === "AUX" && node.kind.value === "TEXT") {
      w = Math.max(1, ...node.label.split("\n").map(line => measureText(line, 14))) + 12;
    }
    const container = node.kind.type === "AUX" || (node.kind.type === "BPMN" && ["POOL", "LANE"].includes(node.kind.value));
    const task = node.kind.type === "BPMN" && ["TASK", "USER_TASK", "SERVICE_TASK"].includes(node.kind.value);
    const halfWidth = container || task ? w / 2 : Math.max(w / 2, measureText(node.label || "") / 2);
    left = Math.min(left, node.position.x - halfWidth);
    right = Math.max(right, node.position.x + halfWidth);
    top = Math.min(top, node.position.y - h / 2);
    bottom = Math.max(bottom, node.position.y + h / 2 + (container ? 0 : task && node.metrics.time_seconds == null ? 0 : 45));
  }
  const padding = 12;
  return { x: left - padding, y: top - padding, width: right - left + 2 * padding, height: bottom - top + 2 * padding };
}

export function centeredPdfLayout(width: number, height: number) {
  const landscape = width > height;
  const pageWidth = landscape ? 841.89 : 595.28;
  const pageHeight = landscape ? 595.28 : 841.89;
  const margin = 36;
  const scale = Math.min((pageWidth - margin * 2) / width, (pageHeight - margin * 2) / height);
  const drawWidth = width * scale, drawHeight = height * scale;
  return { landscape, pageWidth, pageHeight, x: (pageWidth - drawWidth) / 2, y: (pageHeight - drawHeight) / 2, width: drawWidth, height: drawHeight };
}
