import type { Diagram, DiagramNode } from "../model/types";

function escapeCsv(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function oitTypeLabel(node: DiagramNode): string {
  if (node.kind.type === "OIT") return node.kind.value;
  return `BPMN_${node.kind.value}`;
}

function orderedNodes(diagram: Diagram): DiagramNode[] {
  const byId = new Map(diagram.nodes.map(n => [n.id, n]));
  const incoming = new Map<string, number>();
  const outgoing = new Map<string, string[]>();
  for (const n of diagram.nodes) { incoming.set(n.id, 0); outgoing.set(n.id, []); }
  for (const e of diagram.edges) {
    if (byId.has(e.source.node_id) && byId.has(e.target.node_id)) {
      incoming.set(e.target.node_id, (incoming.get(e.target.node_id) || 0) + 1);
      outgoing.get(e.source.node_id)!.push(e.target.node_id);
    }
  }
  // Kahn-like walk for linear sequences; fallback append remaining
  const result: DiagramNode[] = [];
  const seen = new Set<string>();
  const queue = diagram.nodes.filter(n => (incoming.get(n.id) || 0) === 0).map(n => n.id);
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    const node = byId.get(id);
    if (!node) continue;
    seen.add(id); result.push(node);
    for (const nxt of outgoing.get(id) || []) {
      incoming.set(nxt, (incoming.get(nxt) || 1) - 1);
      if ((incoming.get(nxt) || 0) <= 0) queue.push(nxt);
    }
  }
  for (const n of diagram.nodes) if (!seen.has(n.id)) result.push(n);
  return result;
}

export function diagramToCsv(diagram: Diagram): string {
  const header = ["Numero_Secuencia","Nombre_Actividad","Tipo_Actividad_OIT","Tiempo_Segundos","Distancia_Metros","Recurso_Asignado"];
  const rows = [header.join(",")];
  const nodes = orderedNodes(diagram);
  nodes.forEach((n, i) => {
    const row = [
      String(i + 1),
      n.label || "",
      oitTypeLabel(n),
      n.metrics.time_seconds ?? "",
      n.metrics.distance_meters ?? "",
      n.resource ?? "",
    ].map(v => escapeCsv(String(v)));
    rows.push(row.join(","));
  });
  return "\uFEFF" + rows.join("\r\n"); // BOM + UTF-8 friendly for Excel
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}