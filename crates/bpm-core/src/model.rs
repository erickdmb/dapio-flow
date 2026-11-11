use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

pub type NodeId = String;
pub type EdgeId = String;
pub type PortId = String;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum NotationType {
    Bpmn,
    Dop,
    Dap,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum MethodType {
    AsIs,
    ToBe,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ProjectMetadata {
    pub name: String,
    pub notation: NotationType,
    pub method: MethodType,
    pub analyst: Option<String>,
    pub created_at: Option<DateTime<Utc>>,
    pub updated_at: Option<DateTime<Utc>>,
}

impl Default for NotationType {
    fn default() -> Self {
        Self::Dap
    }
}

impl Default for MethodType {
    fn default() -> Self {
        Self::AsIs
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectDocument {
    pub schema_version: String,
    pub metadata: ProjectMetadata,
    pub diagram: Diagram,
}

impl Default for ProjectDocument {
    fn default() -> Self {
        Self {
            schema_version: "0.1.0".to_string(),
            metadata: ProjectMetadata::default(),
            diagram: Diagram::default(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Diagram {
    pub id: String,
    pub nodes: Vec<Node>,
    pub edges: Vec<Edge>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Position {
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Size {
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum TimeUnit {
    Seconds,
    Minutes,
    Hours,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Metrics {
    pub time_seconds: Option<f64>,
    pub time_value: Option<f64>,
    pub time_unit: Option<TimeUnit>,
    pub distance_meters: Option<f64>,
    pub cost: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum OitKind {
    Operation,
    Transport,
    Inspection,
    Delay,
    Storage,
    Combined,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum BpmnElementType {
    Task,
    StartEvent,
    EndEvent,
    ExclusiveGateway,
    ParallelGateway,
    Pool,
    Lane,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "type", content = "value", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum NodeKind {
    Oit(OitKind),
    Bpmn(BpmnElementType),
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum PortSide {
    North,
    South,
    East,
    West,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Port {
    pub id: PortId,
    pub side: PortSide,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Node {
    pub id: NodeId,
    pub kind: NodeKind,
    pub label: String,
    pub position: Position,
    pub size: Option<Size>,
    pub metrics: Metrics,
    pub resource: Option<String>,
    pub ports: Vec<Port>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Endpoint {
    pub node_id: NodeId,
    pub port_id: PortId,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum EdgeKind {
    SequenceFlow,
    Association,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Edge {
    pub id: EdgeId,
    pub source: Endpoint,
    pub target: Endpoint,
    pub label: Option<String>,
    pub kind: EdgeKind,
}