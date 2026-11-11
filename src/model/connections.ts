import { createAuxNode } from "./defaults";
import type { Diagram, DiagramEdge } from "./types";
import { closestPointOnEdge } from "../canvas/renderer";

/** Split an existing connector into two edges sharing an explicit junction node. */
export function joinEdgeAt(diagram: Diagram, edge: DiagramEdge, x: number, y: number) {
  const point = closestPointOnEdge(diagram, edge, x, y);
  if (!point) return null;
  const junction = createAuxNode("JUNCTION", point.x, point.y);
  const tail: DiagramEdge = {
    ...edge, id: crypto.randomUUID(), label: null,
    source: { node_id: junction.id, port_id: point.outgoing }, target: { ...edge.target },
  };
  edge.target = { node_id: junction.id, port_id: point.incoming };
  diagram.nodes.push(junction);
  diagram.edges.push(tail);
  return junction;
}
