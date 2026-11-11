import { calculateDapSummary } from "../model/summary";
import type { Diagram, DiagramNode, ProjectDocument } from "../model/types";

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function oitTypeLabel(node: DiagramNode): string {
  if (node.kind.type !== "OIT") return `BPMN_${node.kind.value}`;
  switch (node.kind.value) {
    case "OPERATION": return "Operación";
    case "TRANSPORT": return "Transporte";
    case "INSPECTION": return "Inspección";
    case "DELAY": return "Demora";
    case "STORAGE": return "Almacenamiento";
    case "COMBINED": return "Combinada";
  }
}

function orderedNodes(diagram: Diagram): DiagramNode[] {
  const byId = new Map(diagram.nodes.map(n => [n.id, n]));
  const incoming = new Map<string, number>();
  const outgoing = new Map<string, string[]>();
  for (const n of diagram.nodes) { incoming.set(n.id, 0); outgoing.set(n.id, []); }
  for (const e of diagram.edges) {
    if (byId.has(e.source.node_id) && byId.has(e.target.node_id)) {
      incoming.set(e.target.node_id, (incoming.get(e.target.node_id) || 0) + 1);
      outgoing.get(e.source.node_id)!.push(e.target.node_id);
    }
  }
  const result: DiagramNode[] = [];
  const seen = new Set<string>();
  const queue = diagram.nodes.filter(n => (incoming.get(n.id) || 0) === 0).map(n => n.id);
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    const node = byId.get(id);
    if (!node) continue;
    seen.add(id); result.push(node);
    for (const nxt of outgoing.get(id) || []) {
      incoming.set(nxt, (incoming.get(nxt) || 1) - 1);
      if ((incoming.get(nxt) || 0) <= 0) queue.push(nxt);
    }
  }
  for (const n of diagram.nodes) if (!seen.has(n.id)) result.push(n);
  return result;
}

function cell(type: "String" | "Number", value: unknown): string {
  if (value === null || value === undefined || value === "") return `<Cell><Data ss:Type="String"></Data></Cell>`;
  return `<Cell><Data ss:Type="${type}">${esc(value)}</Data></Cell>`;
}

export function documentToDapExcelXml(doc: ProjectDocument): string {
  const summary = calculateDapSummary(doc.diagram);
  const nodes = orderedNodes(doc.diagram).filter(n => n.kind.type !== "AUX");
  const date = new Date().toISOString().slice(0, 10);
  const method = doc.metadata.method === "TO_BE" ? "Propuesto" : "Actual";
  const rows: string[] = [];

  rows.push(`<Row><Cell ss:StyleID="title" ss:MergeAcross="5"><Data ss:Type="String">FICHA ANALÍTICA DEL PROCESO (DAP)</Data></Cell></Row>`);
  rows.push(`<Row>${cell("String","Proceso")}${cell("String", doc.metadata.name || "")}${cell("String","Notación")}${cell("String", doc.metadata.notation)}${cell("String","Método")}${cell("String", method)}</Row>`);
  rows.push(`<Row>${cell("String","Analista")}${cell("String", doc.metadata.analyst || "")}${cell("String","Fecha")}${cell("String", date)}${cell("String","")}${cell("String","")}</Row>`);
  rows.push(`<Row></Row>`);
  rows.push(`<Row ss:StyleID="header">${["N°","Descripción","Tipo de Actividad","Tiempo (s)","Distancia (m)","Recurso / Máquina"].map(h=>cell("String",h)).join("")}</Row>`);
  nodes.forEach((n, i) => {
    rows.push(`<Row>${cell("String", n.activity_number ?? String(i+1))}${cell("String", n.label||"")}${cell("String", oitTypeLabel(n))}${cell("Number", n.metrics.time_seconds ?? 0)}${cell("Number", n.metrics.distance_meters ?? 0)}${cell("String", n.resource || "")}</Row>`);
  });
  rows.push(`<Row></Row>`);
  rows.push(`<Row ss:StyleID="header">${cell("String","Resumen de Métricas")}${cell("String","Cantidad/Total")}${cell("String","")}${cell("String","")}${cell("String","")}${cell("String","")}</Row>`);
  const summaryRows: [string, number][] = [
    ["Operaciones", summary.operations],
    ["Transportes", summary.transports],
    ["Inspecciones", summary.inspections],
    ["Demoras", summary.delays],
    ["Almacenamientos", summary.storages],
    ["Tiempo total de ciclo (s)", summary.total_time_seconds],
    ["Distancia total (m)", summary.total_distance_meters],
  ];
  for (const [k,v] of summaryRows) rows.push(`<Row>${cell("String",k)}${cell("Number",v)}${cell("String","")}${cell("String","")}${cell("String","")}${cell("String","")}</Row>`);

  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal"><Alignment ss:Vertical="Bottom"/><Font ss:FontName="Calibri" ss:Size="11"/></Style>
  <Style ss:ID="title"><Font ss:Bold="1" ss:Size="14"/><Alignment ss:Horizontal="Center"/></Style>
  <Style ss:ID="header"><Font ss:Bold="1"/><Interior ss:Color="#D9EAF7" ss:Pattern="Solid"/></Style>
 </Styles>
 <Worksheet ss:Name="Ficha DAP">
  <Table ss:DefaultColumnWidth="120">
   <Column ss:Width="40"/><Column ss:Width="220"/><Column ss:Width="140"/><Column ss:Width="90"/><Column ss:Width="100"/><Column ss:Width="160"/>
   ${rows.join("\n   ")}
  </Table>
 </Worksheet>
</Workbook>`;
}

export function downloadExcel(filename: string, xml: string) {
  const blob = new Blob([xml], { type: "application/vnd.ms-excel;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}