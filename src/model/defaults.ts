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
    case "USER_TASK": return "Tarea de usuario";
    case "SERVICE_TASK": return "Tarea de servicio";
    case "START_EVENT": return "Inicio";
    case "INTERMEDIATE_EVENT": return "Evento intermedio";
    case "END_EVENT": return "Fin";
    case "EXCLUSIVE_GATEWAY": return "Compuerta XOR";
    case "PARALLEL_GATEWAY": return "Compuerta AND";
    case "INCLUSIVE_GATEWAY": return "Compuerta OR";
    case "TEXT_ANNOTATION": return "Anotación";
    case "DATA_OBJECT": return "Objeto de datos";
    case "POOL": return "Pool";
    case "LANE": return "Carril";
  }
}

export function createEmptyDocument(): ProjectDocument {
  return {
    schema_version: "0.1.0-alpha.1",
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
    metrics: { time_seconds: baseTime, time_value: baseTime, time_unit: "SECONDS", distance_meters: baseDist, cost: 0 },
    resource: null,
    ports: defaultPorts(),
  };
}

export function createBpmnNode(kind: BpmnElementType, x: number, y: number, index: number): DiagramNode {
  const t = kind === "TASK" ? 20 : null;
  const isContainer = kind === "POOL" || kind === "LANE";
  const noPorts = isContainer || kind === "TEXT_ANNOTATION";
  return {
    id: crypto.randomUUID(),
    kind: { type: "BPMN", value: kind },
    label: `${bpmnLabel(kind)} ${index}`,
    position: { x, y },
    size: isContainer ? { width: kind === "POOL" ? 600 : 560, height: kind === "POOL" ? 220 : 120 } : (kind === "TEXT_ANNOTATION" ? { width: 140, height: 50 } : null),
    metrics: { time_seconds: t, time_value: t, time_unit: "SECONDS", distance_meters: null, cost: null },
    resource: null,
    ports: noPorts ? [] : defaultPorts(),
  };
}