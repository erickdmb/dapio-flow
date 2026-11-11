import type { Diagram, NotationType } from "./types";

export interface Issue { code: string; message: string; node_id?: string | null; edge_id?: string | null }
export interface ValidationResult { ok: boolean; issues: Issue[] }

export function validateDiagram(diagram: Diagram, notation: NotationType): ValidationResult {
  const issues: Issue[] = [];
  const nodeIds = new Set<string>();
  const portsByNode = new Map<string, Set<string>>();
  for (const n of diagram.nodes) {
    if (nodeIds.has(n.id)) issues.push({ code: "DUPLICATE_NODE_ID", message: `ID duplicado: ${n.id}`, node_id: n.id });
    nodeIds.add(n.id);
    portsByNode.set(n.id, new Set((n.ports || []).map(p => p.id)));
    if (notation === "DOP" && n.kind.type === "OIT" && ["TRANSPORT","DELAY","STORAGE"].includes(n.kind.value)) {
      issues.push({ code: "DOP_INVALID_OIT_NODE", message: "DOP no permite Transporte, Demora o Almacenamiento", node_id: n.id });
    }
    const t = n.metrics.time_seconds ?? 0, d = n.metrics.distance_meters ?? 0, c = n.metrics.cost ?? 0;
    if (t < 0 || d < 0 || c < 0) issues.push({ code: "NEGATIVE_METRIC", message: "Métricas negativas no permitidas", node_id: n.id });
  }
  const adj = new Map<string, string[]>();
  for (const id of nodeIds) adj.set(id, []);
  for (const e of diagram.edges) {
    if (!nodeIds.has(e.source.node_id) || !nodeIds.has(e.target.node_id)) {
      issues.push({ code: "DANGLING_EDGE", message: "Arista con nodo inexistente", edge_id: e.id }); continue;
    }
    const sp = portsByNode.get(e.source.node_id); const tp = portsByNode.get(e.target.node_id);
    if (sp && sp.size && !sp.has(e.source.port_id)) issues.push({ code: "INVALID_SOURCE_PORT", message: "Puerto origen inválido", edge_id: e.id, node_id: e.source.node_id });
    if (tp && tp.size && !tp.has(e.target.port_id)) issues.push({ code: "INVALID_TARGET_PORT", message: "Puerto destino inválido", edge_id: e.id, node_id: e.target.node_id });
    adj.get(e.source.node_id)!.push(e.target.node_id);
  }
  if (diagram.nodes.length > 1) {
    const connected = new Set<string>();
    for (const e of diagram.edges) { connected.add(e.source.node_id); connected.add(e.target.node_id); }
    for (const n of diagram.nodes) if (!connected.has(n.id)) issues.push({ code: "ORPHAN_NODE", message: `Nodo huérfano: ${n.label}`, node_id: n.id });
  }
  // cycle detection
  const color = new Map<string, number>(); // 0 unvisited,1 visiting,2 done
  for (const id of nodeIds) color.set(id, 0);
  let hasCycle = false;
  const dfs = (u: string) => {
    color.set(u, 1);
    for (const v of adj.get(u) || []) {
      if (color.get(v) === 1) { hasCycle = true; return; }
      if (color.get(v) === 0) dfs(v);
      if (hasCycle) return;
    }
    color.set(u, 2);
  };
  for (const id of nodeIds) if (color.get(id) === 0) dfs(id);
  if ((notation === "DOP" || notation === "DAP") && hasCycle) {
    issues.push({ code: "CYCLIC_FLOW", message: "Se detectó un ciclo en el flujo DOP/DAP" });
  }
  return { ok: issues.length === 0, issues };
}