import type { DiagramNode } from "./types";

/** Resize from the bottom-right corner, retaining the top-left and known lanes. */
export function resizePool(pool: DiagramNode, lanes: DiagramNode[], width: number, height: number) {
  if (pool.orientation === "VERTICAL") {
    const transpose = (node: DiagramNode): DiagramNode => ({ ...node, orientation: "HORIZONTAL",
      position: { x: node.position.y, y: node.position.x },
      size: { width: node.size?.height ?? 600, height: node.size?.width ?? 220 } });
    const proxy = transpose(pool), children = lanes.map(transpose);
    resizePool(proxy, children, height, width);
    [pool, ...lanes].forEach((node, i) => {
      const source = [proxy, ...children][i];
      node.position = { x: source.position.y, y: source.position.x };
      node.size = { width: source.size!.height, height: source.size!.width };
      node.orientation = "VERTICAL";
    });
    return;
  }
  const old = pool.size ?? { width: 600, height: 220 };
  const left = pool.position.x - old.width / 2;
  const top = pool.position.y - old.height / 2;
  width = Math.max(300, width);
  height = Math.max(120, lanes.length * 80, height);
  pool.size = { width, height };
  pool.position = { x: left + width / 2, y: top + height / 2 };
  const weights = lanes.map(l => Math.max(0, (l.size?.height ?? 120) - 80));
  const total = weights.reduce((a, b) => a + b, 0);
  let y = top;
  lanes.forEach((lane, i) => {
    const h = i === lanes.length - 1 ? top + height - y
      : 80 + (height - lanes.length * 80) * (total ? weights[i] / total : 1 / lanes.length);
    lane.orientation = "HORIZONTAL";
    lane.size = { width: width - 30, height: h };
    lane.position = { x: left + 30 + (width - 30) / 2, y: y + h / 2 };
    y += h;
  });
}

/** Transpose a pool and its contents without rotating activity labels or glyphs. */
export function setPoolOrientation(pool: DiagramNode, contents: DiagramNode[], orientation: "HORIZONTAL" | "VERTICAL") {
  if ((pool.orientation ?? "HORIZONTAL") === orientation) return;
  const center = { ...pool.position };
  for (const node of contents) {
    const dx = node.position.x - center.x, dy = node.position.y - center.y;
    node.position = { x: center.x + dy, y: center.y + dx };
    if (node.kind.type === "BPMN" && node.kind.value === "LANE") {
      const size = node.size ?? { width: 560, height: 120 };
      node.size = { width: size.height, height: size.width };
      node.orientation = orientation;
    }
  }
  const size = pool.size ?? { width: 600, height: 220 };
  pool.size = { width: size.height, height: size.width };
  pool.orientation = orientation;
}
