import type { DapSummary, Diagram } from "./types";

export function calculateDapSummary(diagram: Diagram): DapSummary {
  const summary: DapSummary = {
    operations: 0, transports: 0, inspections: 0, delays: 0, storages: 0,
    total_time_seconds: 0, total_distance_meters: 0,
  };
  for (const node of diagram.nodes) {
    if (node.kind.type !== "OIT") continue;
    const t = node.metrics.time_seconds ?? 0;
    const d = node.metrics.distance_meters ?? 0;
    summary.total_time_seconds += t;
    switch (node.kind.value) {
      case "OPERATION": summary.operations += 1; break;
      case "TRANSPORT": summary.transports += 1; summary.total_distance_meters += d; break;
      case "INSPECTION": summary.inspections += 1; break;
      case "DELAY": summary.delays += 1; break;
      case "STORAGE": summary.storages += 1; break;
      case "COMBINED": summary.operations += 1; summary.inspections += 1; break;
    }
  }
  return summary;
}