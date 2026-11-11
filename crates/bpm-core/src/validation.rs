use std::collections::{HashMap, HashSet};

use petgraph::algo::is_cyclic_directed;
use petgraph::graphmap::DiGraphMap;
use serde::{Deserialize, Serialize};

use crate::model::{Diagram, NodeKind, NotationType, OitKind};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Issue {
    pub code: String,
    pub message: String,
    pub node_id: Option<String>,
    pub edge_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq)]
pub struct ValidationResult {
    pub ok: bool,
    pub issues: Vec<Issue>,
}

pub fn validate_diagram(diagram: &Diagram, notation: &NotationType) -> ValidationResult {
    let mut issues = Vec::new();

    // Unique node IDs and port existence map
    let mut node_ids = HashSet::new();
    let mut ports_by_node: HashMap<&str, HashSet<&str>> = HashMap::new();
    for node in &diagram.nodes {
        if !node_ids.insert(node.id.as_str()) {
            issues.push(Issue {
                code: "DUPLICATE_NODE_ID".into(),
                message: format!("ID de nodo duplicado: {}", node.id),
                node_id: Some(node.id.clone()),
                edge_id: None,
            });
        }
        let ports: HashSet<&str> = node.ports.iter().map(|p| p.id.as_str()).collect();
        ports_by_node.insert(node.id.as_str(), ports);

        // Notation rules
        if let NodeKind::Oit(oit) = &node.kind {
            if matches!(notation, NotationType::Dop)
                && matches!(oit, OitKind::Transport | OitKind::Delay | OitKind::Storage)
            {
                issues.push(Issue {
                    code: "DOP_INVALID_OIT_NODE".into(),
                    message: "DOP no permite nodos de Transporte, Demora o Almacenamiento".into(),
                    node_id: Some(node.id.clone()),
                    edge_id: None,
                });
            }
        }

        // Metric sanity
        if node.metrics.time_seconds.unwrap_or(0.0) < 0.0
            || node.metrics.distance_meters.unwrap_or(0.0) < 0.0
            || node.metrics.cost.unwrap_or(0.0) < 0.0
        {
            issues.push(Issue {
                code: "NEGATIVE_METRIC".into(),
                message: "Las métricas no pueden ser negativas".into(),
                node_id: Some(node.id.clone()),
                edge_id: None,
            });
        }
    }

    // Edge integrity and graph build
    let mut edge_ids = HashSet::new();
    let mut graph = DiGraphMap::<&str, ()>::new();
    for id in &node_ids {
        graph.add_node(*id);
    }

    for edge in &diagram.edges {
        if !edge_ids.insert(edge.id.as_str()) {
            issues.push(Issue {
                code: "DUPLICATE_EDGE_ID".into(),
                message: format!("ID de arista duplicado: {}", edge.id),
                node_id: None,
                edge_id: Some(edge.id.clone()),
            });
        }
        let s = edge.source.node_id.as_str();
        let t = edge.target.node_id.as_str();
        if !node_ids.contains(s) || !node_ids.contains(t) {
            issues.push(Issue {
                code: "DANGLING_EDGE".into(),
                message: "La arista referencia nodos inexistentes".into(),
                node_id: None,
                edge_id: Some(edge.id.clone()),
            });
            continue;
        }
        if let Some(ports) = ports_by_node.get(s) {
            if !ports.is_empty() && !ports.contains(edge.source.port_id.as_str()) {
                issues.push(Issue {
                    code: "INVALID_SOURCE_PORT".into(),
                    message: "Puerto de origen inválido".into(),
                    node_id: Some(edge.source.node_id.clone()),
                    edge_id: Some(edge.id.clone()),
                });
            }
        }
        if let Some(ports) = ports_by_node.get(t) {
            if !ports.is_empty() && !ports.contains(edge.target.port_id.as_str()) {
                issues.push(Issue {
                    code: "INVALID_TARGET_PORT".into(),
                    message: "Puerto de destino inválido".into(),
                    node_id: Some(edge.target.node_id.clone()),
                    edge_id: Some(edge.id.clone()),
                });
            }
        }
        graph.add_edge(s, t, ());
    }

    // Topology (basic)
    if diagram.nodes.len() > 1 {
        let connected: HashSet<&str> = diagram
            .edges
            .iter()
            .flat_map(|e| [e.source.node_id.as_str(), e.target.node_id.as_str()])
            .collect();
        for node in &diagram.nodes {
            if !connected.contains(node.id.as_str()) {
                issues.push(Issue {
                    code: "ORPHAN_NODE".into(),
                    message: "Nodo huérfano (sin conexiones)".into(),
                    node_id: Some(node.id.clone()),
                    edge_id: None,
                });
            }
        }
    }

    if matches!(notation, NotationType::Dop | NotationType::Dap) && is_cyclic_directed(&graph) {
        issues.push(Issue {
            code: "CYCLIC_FLOW".into(),
            message: "Se detectó un ciclo en un flujo DOP/DAP".into(),
            node_id: None,
            edge_id: None,
        });
    }

    ValidationResult {
        ok: issues.is_empty(),
        issues,
    }
}