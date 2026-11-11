import type { ProjectDocument } from "./model/types";

function isTauri(): boolean {
  return typeof window !== "undefined" && ("__TAURI_INTERNALS__" in window || "__TAURI__" in window);
}

export async function saveDocument(doc: ProjectDocument): Promise<string> {
  const json = JSON.stringify(doc, null, 2);
  if (isTauri()) {
    try {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const { invoke } = await import("@tauri-apps/api/core");
      const path = await save({ filters: [{ name: "Proyecto BPMR", extensions: ["bpmr.json", "json"] }] });
      if (!path) return "Guardado cancelado";
      await invoke("save_project_cmd", { path, document: doc });
      return `Guardado en ${path}`;
    } catch {
      // fall through to download if plugin unavailable
    }
  }
  const blob = new Blob([json], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${(doc.metadata.name || "proceso").replace(/[^a-z0-9-_]+/gi, "_")}.bpmr.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  return "Archivo descargado (.bpmr.json)";
}

export async function openDocument(): Promise<{ doc?: ProjectDocument; message: string }> {
  if (isTauri()) {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const { invoke } = await import("@tauri-apps/api/core");
      const path = await open({ multiple: false, filters: [{ name: "Proyecto BPMR", extensions: ["bpmr.json", "json"] }] });
      if (!path || Array.isArray(path)) return { message: "Apertura cancelada" };
      const doc = await invoke<ProjectDocument>("load_project_cmd", { path });
      return { doc, message: `Abierto ${path}` };
    } catch {
      // fallback
    }
  }
  return new Promise((resolve) => {
    const input = document.getElementById("file-open") as HTMLInputElement | null;
    if (!input) { resolve({ message: "No se encontró selector de archivo" }); return; }
    input.value = "";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) { resolve({ message: "Apertura cancelada" }); return; }
      try {
        const text = await file.text();
        const doc = JSON.parse(text) as ProjectDocument;
        resolve({ doc, message: `Abierto ${file.name}` });
      } catch (e) {
        resolve({ message: `Error al leer archivo: ${e}` });
      }
    };
    input.click();
  });
}