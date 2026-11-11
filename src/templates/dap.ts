import type { ProjectDocument } from "../model/types";
import { createOitNode } from "../model/defaults";

export function createDapTemplate(): ProjectDocument {
  const doc: ProjectDocument = {
    schema_version: "0.1.0",
    metadata: {
      name: "Plantilla DAP - Ficha Analítica",
      notation: "DAP",
      method: "AS_IS",
      analyst: null,
      created_at: null,
      updated_at: null,
    },
    diagram: { id: crypto.randomUUID(), nodes: [], edges: [] },
  };
  const steps: Array<[any, string, number, number, number, number]> = [
    ["OPERATION", "Recepción de material", 120, 220, 30, 0],
    ["TRANSPORT", "Traslado a inspección", 260, 220, 5, 15],
    ["INSPECTION", "Inspección de calidad", 400, 220, 20, 0],
    ["DELAY", "Espera en cola", 540, 220, 10, 0],
    ["OPERATION", "Procesamiento", 680, 220, 45, 0],
    ["STORAGE", "Almacenamiento temporal", 820, 220, 60, 0],
  ];
  let prevId: string | null = null;
  steps.forEach((s, i) => {
    const n = createOitNode(s[0], s[2], s[3], i + 1);
    n.label = s[1];
    n.metrics.time_value = s[4]; n.metrics.time_unit = "MINUTES"; n.metrics.time_seconds = s[4] * 60;
    n.metrics.distance_meters = s[5];
    doc.diagram.nodes.push(n);
    if (prevId) {
      doc.diagram.edges.push({ id: crypto.randomUUID(), source: { node_id: prevId, port_id: "e" }, target: { node_id: n.id, port_id: "w" }, label: null, kind: "SEQUENCE_FLOW" });
    }
    prevId = n.id;
  });
  return doc;
}