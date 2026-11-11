export type NotationType = "BPMN" | "DOP" | "DAP";
export type MethodType = "AS_IS" | "TO_BE";

export type OitKind =
  | "OPERATION"
  | "TRANSPORT"
  | "INSPECTION"
  | "DELAY"
  | "STORAGE"
  | "COMBINED";

export type BpmnElementType =
  | "TASK"
  | "USER_TASK"
  | "SERVICE_TASK"
  | "START_EVENT"
  | "INTERMEDIATE_EVENT"
  | "END_EVENT"
  | "EXCLUSIVE_GATEWAY"
  | "PARALLEL_GATEWAY"
  | "INCLUSIVE_GATEWAY"
  | "TEXT_ANNOTATION"
  | "DATA_OBJECT"
  | "POOL"
  | "LANE";

export type NodeKind =
  | { type: "OIT"; value: OitKind }
  | { type: "BPMN"; value: BpmnElementType }
  | { type: "AUX"; value: "TEXT" | "JUNCTION" };

export interface Position { x: number; y: number }
export interface Size { width: number; height: number }

export type TimeUnit = "SECONDS" | "MINUTES" | "HOURS";

export interface Metrics {
  time_seconds?: number | null; // canonical
  time_value?: number | null;
  time_unit?: TimeUnit | null;
  distance_meters?: number | null;
  cost?: number | null;
}

export type PortSide = "NORTH" | "SOUTH" | "EAST" | "WEST";
export interface Port { id: string; side: PortSide }

export type PoolOrientation = "HORIZONTAL" | "VERTICAL";

export interface DiagramNode {
  activity_number?: string | null;
  orientation?: PoolOrientation;
  id: string;
  kind: NodeKind;
  label: string;
  position: Position;
  size?: Size | null;
  metrics: Metrics;
  resource?: string | null;
  ports: Port[];
}

export interface Endpoint { node_id: string; port_id: string }
export type EdgeKind = "SEQUENCE_FLOW" | "ASSOCIATION" | "MESSAGE_FLOW";

export interface DiagramEdge {
  id: string;
  source: Endpoint;
  target: Endpoint;
  label?: string | null;
  kind: EdgeKind;
}

export interface Diagram {
  id: string;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
}

export interface ProjectMetadata {
  name: string;
  notation: NotationType;
  method: MethodType;
  analyst?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface ProjectDocument {
  schema_version: string;
  metadata: ProjectMetadata;
  diagram: Diagram;
}

export interface DapSummary {
  operations: number;
  transports: number;
  inspections: number;
  delays: number;
  storages: number;
  total_time_seconds: number;
  total_distance_meters: number;
}