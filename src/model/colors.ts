import type { DiagramNode } from "./types";

export function nodeColors(node: DiagramNode): { fill: string; stroke: string } {
  if (node.kind.type === "OIT") {
    switch (node.kind.value) {
      case "OPERATION": return { fill: "#dbeafe", stroke: "#2563eb" }; // blue
      case "INSPECTION": return { fill: "#fef3c7", stroke: "#d97706" }; // amber
      case "TRANSPORT": return { fill: "#dcfce7", stroke: "#16a34a" }; // green
      case "DELAY": return { fill: "#fee2e2", stroke: "#dc2626" }; // red
      case "STORAGE": return { fill: "#ede9fe", stroke: "#7c3aed" }; // purple
      case "COMBINED": return { fill: "#cffafe", stroke: "#0891b2" }; // cyan
    }
  }
  switch (node.kind.value) {
    case "TASK": return { fill: "#e0f2fe", stroke: "#0284c7" };
    case "START_EVENT": return { fill: "#dcfce7", stroke: "#16a34a" };
    case "END_EVENT": return { fill: "#fee2e2", stroke: "#dc2626" };
    case "EXCLUSIVE_GATEWAY": return { fill: "#fef9c3", stroke: "#ca8a04" };
    case "PARALLEL_GATEWAY": return { fill: "#f3e8ff", stroke: "#9333ea" };
    case "POOL": return { fill: "#f8fafc", stroke: "#475569" };
    case "LANE": return { fill: "#ffffff", stroke: "#64748b" };
  }
}

export function paletteColor(item: {family: string; oit?: string; bpmn?: string}): string {
  if (item.family === "OIT") {
    switch (item.oit) {
      case "OPERATION": return "#2563eb";
      case "INSPECTION": return "#d97706";
      case "TRANSPORT": return "#16a34a";
      case "DELAY": return "#dc2626";
      case "STORAGE": return "#7c3aed";
      case "COMBINED": return "#0891b2";
    }
  }
  switch (item.bpmn) {
    case "TASK": return "#0284c7";
    case "START_EVENT": return "#16a34a";
    case "END_EVENT": return "#dc2626";
    case "EXCLUSIVE_GATEWAY": return "#ca8a04";
    case "PARALLEL_GATEWAY": return "#9333ea";
    case "POOL": return "#475569";
    case "LANE": return "#64748b";
  }
  return "#334155";
}