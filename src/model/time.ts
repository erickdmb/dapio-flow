import type { Metrics, TimeUnit } from "./types";

export function toSeconds(value: number | null | undefined, unit: TimeUnit | null | undefined): number | null {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  const u = unit || "SECONDS";
  if (u === "MINUTES") return value * 60;
  if (u === "HOURS") return value * 3600;
  return value;
}

export function syncTimeMetrics(metrics: Metrics): Metrics {
  const secs = toSeconds(metrics.time_value ?? metrics.time_seconds ?? null, metrics.time_unit || "SECONDS");
  return { ...metrics, time_seconds: secs };
}

export function formatDuration(seconds: number): string {
  if (!isFinite(seconds)) return "0s";
  if (seconds >= 3600) {
    const h = Math.floor(seconds / 3600);
    const m = Math.round((seconds % 3600) / 60);
    return m ? `${h}h ${m}m` : `${h}h`;
  }
  if (seconds >= 60) {
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return s ? `${m}m ${s}s` : `${m}m`;
  }
  return `${Math.round(seconds)}s`;
}