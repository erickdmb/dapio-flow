use bpm_core::model::{
    Diagram, Edge, Endpoint, Metrics, Node, NodeKind, NotationType, OitKind, Port, PortSide, Position,
};
use bpm_core::{calculate_dap_summary, validate_diagram};

fn port(id: &str, side: PortSide) -> Port {
    Port { id: id.to_string(), side }
}

fn oit_node(id: &str, kind: OitKind, time: f64, dist: f64) -> Node {
    Node {
        id: id.to_string(),
        kind: NodeKind::Oit(kind),
        label: id.to_string(),
        position: Position { x: 0.0, y: 0.0 },
        size: None,
        metrics: Metrics { time_seconds: Some(time), distance_meters: Some(dist), cost: None },
        resource: None,
        ports: vec![port("n", PortSide::North), port("s", PortSide::South), port("e", PortSide::East), port("w", PortSide::West)],
    }
}

#[test]
fn dap_summary_counts_combined_and_totals() {
    let diagram = Diagram {
        id: "d1".into(),
        nodes: vec![
            oit_node("n1", OitKind::Operation, 10.0, 0.0),
            oit_node("n2", OitKind::Transport, 5.0, 12.0),
            oit_node("n3", OitKind::Inspection, 7.0, 0.0),
            oit_node("n4", OitKind::Combined, 8.0, 0.0),
        ],
        edges: vec![],
    };
    let s = calculate_dap_summary(&diagram);
    assert_eq!(s.operations, 2); // op + combined
    assert_eq!(s.inspections, 2); // insp + combined
    assert_eq!(s.transports, 1);
    assert_eq!(s.total_time_seconds, 30.0);
    assert_eq!(s.total_distance_meters, 12.0);
}

#[test]
fn dop_rejects_transport_delay_storage() {
    let diagram = Diagram {
        id: "d1".into(),
        nodes: vec![oit_node("n1", OitKind::Transport, 1.0, 1.0)],
        edges: vec![],
    };
    let r = validate_diagram(&diagram, &NotationType::Dop);
    assert!(!r.ok);
    assert!(r.issues.iter().any(|i| i.code == "DOP_INVALID_OIT_NODE"));
}

#[test]
fn detects_cycle_in_linear_flow() {
    let n1 = oit_node("n1", OitKind::Operation, 1.0, 0.0);
    let n2 = oit_node("n2", OitKind::Inspection, 1.0, 0.0);
    let diagram = Diagram {
        id: "d1".into(),
        nodes: vec![n1, n2],
        edges: vec![
            Edge { id: "e1".into(), source: Endpoint { node_id: "n1".into(), port_id: "e".into() }, target: Endpoint { node_id: "n2".into(), port_id: "w".into() }, label: None, kind: bpm_core::model::EdgeKind::SequenceFlow },
            Edge { id: "e2".into(), source: Endpoint { node_id: "n2".into(), port_id: "e".into() }, target: Endpoint { node_id: "n1".into(), port_id: "w".into() }, label: None, kind: bpm_core::model::EdgeKind::SequenceFlow },
        ],
    };
    let r = validate_diagram(&diagram, &NotationType::Dap);
    assert!(r.issues.iter().any(|i| i.code == "CYCLIC_FLOW"));
}