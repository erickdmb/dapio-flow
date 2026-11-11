import type { ProjectDocument } from "../model/types";
import { Camera } from "../canvas/camera";
import { renderDiagram } from "../canvas/renderer";
import { centeredPdfLayout, diagramBounds } from "./pdf-layout";

export async function downloadDiagramPdf(doc: ProjectDocument) {
  const { jsPDF } = await import("jspdf");
  await document.fonts.ready;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo crear el gráfico");
  ctx.font = "12px Inter, system-ui, sans-serif";
  const bounds = diagramBounds(doc.diagram, (text, fontSize = 12) => { ctx.font = `${fontSize}px Inter, system-ui, sans-serif`; return ctx.measureText(text).width; });
  const resolution = Math.min(2.5, 6000 / Math.max(bounds.width, bounds.height));
  canvas.width = Math.max(1, Math.ceil(bounds.width * resolution));
  canvas.height = Math.max(1, Math.ceil(bounds.height * resolution));
  const camera = new Camera();
  // Render in world units so labels scale together with their nodes.
  ctx.setTransform(resolution, 0, 0, resolution, 0, 0);
  camera.scale = 1;
  camera.x = -bounds.x;
  camera.y = -bounds.y;
  renderDiagram(ctx, bounds.width, bounds.height, camera, doc.diagram, null, null, null, null, false, null, false);
  ctx.globalCompositeOperation = "destination-over";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, bounds.width, bounds.height);
  ctx.globalCompositeOperation = "source-over";
  const layout = centeredPdfLayout(bounds.width, bounds.height);
  const pdf = new jsPDF({ orientation: layout.landscape ? "landscape" : "portrait", unit: "pt", format: "a4" });
  pdf.setProperties({ title: doc.metadata.name || "Diagrama", creator: "DAPIO-FLOW" });
  pdf.addImage(canvas.toDataURL("image/png"), "PNG", layout.x, layout.y, layout.width, layout.height);
  pdf.save(`${(doc.metadata.name || "diagrama").replace(/[^a-z0-9-_]+/gi, "_")}.pdf`);
}
