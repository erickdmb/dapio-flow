import type { BpmnElementType, DiagramNode, OitKind, Port, ProjectDocument } from "./types";

export function defaultPorts(): Port[] {
  return [
    { id: "n", side: "NORTH" },
    { id: "s", side: "SOUTH" },
    { id: "e", side: "EAST" },
    { id: "w", side: "WEST" },
  ];
}

export function oitLabel(kind: OitKind): string {
  switch (kind) {
    case "OPERATION": return "Operación";
    case "TRANSPORT": return "Transporte";
    case "INSPECTION": return "Inspección";
    case "DELAY": return "Demora";
    case "STORAGE": return "Almacenamiento";
    case "COMBINED": return "Combinada";
  }
}

export function bpmnLabel(kind: BpmnElementType): string {
  switch (kind) {
    case "TASK": return "Tarea";
    case "START_EVENT": return "Inicio";
    case "END_EVENT": return "Fin";
    case "EXCLUSIVE_GATEWAY": return "Compuerta exclusiva";
    case "PARALLEL_GATEWAY": return "Compuerta paralela";
  }
}

export function createEmptyDocument(): ProjectDocument {
  return {
    schema_version: "0.1.0",
    metadata: {
      name: "Nuevo proceso",
      notation: "DAP",
      method: "AS_IS",
      analyst: null,
      created_at: null,
      updated_at: null,
    },
    diagram: { id: crypto.randomUUID(), nodes: [], edges: [] },
  };
}

export function createOitNode(kind: OitKind, x: number, y: number, index: number): DiagramNode {
  const baseTime = kind === "TRANSPORT" ? 30 : kind === "DELAY" || kind === "STORAGE" ? 60 : 20;
  const baseDist = kind === "TRANSPORT" ? 10 : 0;
  return {
    id: crypto.randomUUID(),
    kind: { type: "OIT", value: kind },
    label: `${oitLabel(kind)} ${index}`,
    position: { x, y },
    size: null,
    metrics: { time_seconds: baseTime, distance_meters: baseDist, cost: 0 },
    resource: null,
    ports: defaultPorts(),
  };
}

export function createBpmnNode(kind: BpmnElementType, x: number, y: number, index: number): DiagramNode {
  return {
    id: crypto.randomUUID(),
    kind: { type: "BPMN", value: kind },
    label: `${bpmnLabel(kind)} ${index}`,
    position: { x, y },
    size: null,
    metrics: { time_seconds: kind === "TASK" ? 20 : null, distance_meters: null, cost: null },
    resource: null,
    ports: defaultPorts(),
  };
}