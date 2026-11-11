use serde::{Deserialize, Serialize};

use crate::model::{Diagram, NodeKind, OitKind};

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
pub struct DapSummary {
    pub operations: usize,
    pub transports: usize,
    pub inspections: usize,
    pub delays: usize,
    pub storages: usize,
    pub total_time_seconds: f64,
    pub total_distance_meters: f64,
}

pub fn calculate_dap_summary(diagram: &Diagram) -> DapSummary {
    let mut summary = DapSummary::default();

    for node in &diagram.nodes {
        if let NodeKind::Oit(oit) = &node.kind {
            match oit {
                OitKind::Operation => summary.operations += 1,
                OitKind::Transport => {
                    summary.transports += 1;
                    summary.total_distance_meters += node.metrics.distance_meters.unwrap_or(0.0);
                }
                OitKind::Inspection => summary.inspections += 1,
                OitKind::Delay => summary.delays += 1,
                OitKind::Storage => summary.storages += 1,
                OitKind::Combined => {
                    // Combined counts as operation + inspection; time is added once below.
                    summary.operations += 1;
                    summary.inspections += 1;
                }
            }

            summary.total_time_seconds += node.metrics.time_seconds.unwrap_or(0.0);
        }
    }

    summary
}