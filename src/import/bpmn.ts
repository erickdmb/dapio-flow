import { defaultPorts } from "../model/defaults";
import type { BpmnElementType, Diagram, DiagramEdge, DiagramNode, OitKind, ProjectDocument } from "../model/types";

function txt(el: Element | null): string { return el?.textContent?.trim() || ""; }
function localName(el: Element): string { return el.localName || el.nodeName.split(":").pop() || ""; }

function mapBpmnType(tag: string): BpmnElementType | null {
  switch (tag) {
    case "task": case "userTask": case "serviceTask": case "manualTask": case "scriptTask": case "businessRuleTask": case "sendTask": case "receiveTask": return "TASK";
    case "startEvent": return "START_EVENT";
    case "endEvent": return "END_EVENT";
    case "exclusiveGateway": return "EXCLUSIVE_GATEWAY";
    case "parallelGateway": return "PARALLEL_GATEWAY";
    default: return null;
  }
}

export function importBpmnXml(xml: string): ProjectDocument {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, "application/xml");
  const err = doc.querySelector("parsererror");
  if (err) throw new Error("XML BPMN inválido");

  const process = Array.from(doc.getElementsByTagName("*")).find(e => localName(e) === "process");
  const nodes: DiagramNode[] = [];
  const nodeIdByBpmn = new Map<string, string>();
  const boundsByBpmn = new Map<string, {x:number;y:number;w:number;h:number}>();

  // BPMNDI bounds
  for (const shape of Array.from(doc.getElementsByTagName("*")).filter(e => localName(e) === "BPMNShape")) {
    const bpmnEl = shape.getAttribute("bpmnElement") || "";
    const b = Array.from(shape.getElementsByTagName("*")).find(e => localName(e) === "Bounds");
    if (b && bpmnEl) {
      boundsByBpmn.set(bpmnEl, {
        x: parseFloat(b.getAttribute("x") || "0"),
        y: parseFloat(b.getAttribute("y") || "0"),
        w: parseFloat(b.getAttribute("width") || "60"),
        h: parseFloat(b.getAttribute("height") || "40"),
      });
    }
  }

  if (process) {
    for (const el of Array.from(process.children)) {
      const tag = localName(el);
      const id = el.getAttribute("id");
      if (!id) continue;
      const bType = mapBpmnType(tag);
      if (!bType) continue;
      const oitAttr = el.getAttribute("oit:type") || el.getAttributeNS("http://bpm-rust/schema/oit", "type");
      const b = boundsByBpmn.get(id);
      const w = b?.w ?? 60, h = b?.h ?? 40;
      const x = b ? b.x + w/2 : 100 + nodes.length * 80;
      const y = b ? b.y + h/2 : 120;
      const newId = crypto.randomUUID();
      nodeIdByBpmn.set(id, newId);
      let kind: DiagramNode["kind"];
      if (oitAttr && ["OPERATION","TRANSPORT","INSPECTION","DELAY","STORAGE","COMBINED"].includes(oitAttr)) {
        kind = { type: "OIT", value: oitAttr as OitKind };
      } else {
        kind = { type: "BPMN", value: bType };
      }
      nodes.push({
        id: newId,
        kind,
        label: el.getAttribute("name") || tag,
        position: { x, y },
        size: null,
        metrics: { time_seconds: null, distance_meters: null, cost: null },
        resource: null,
        ports: defaultPorts(),
      });
    }
  }

  const edges: DiagramEdge[] = [];
  if (process) {
    for (const el of Array.from(process.children)) {
      if (localName(el) !== "sequenceFlow") continue;
      const id = el.getAttribute("id");
      const src = el.getAttribute("sourceRef") || "";
      const tgt = el.getAttribute("targetRef") || "";
      const sId = nodeIdByBpmn.get(src);
      const tId = nodeIdByBpmn.get(tgt);
      if (!id || !sId || !tId) continue;
      edges.push({
        id: crypto.randomUUID(),
        source: { node_id: sId, port_id: "e" },
        target: { node_id: tId, port_id: "w" },
        label: el.getAttribute("name") || null,
        kind: "SEQUENCE_FLOW",
      });
    }
  }

  const diagram: Diagram = { id: crypto.randomUUID(), nodes, edges };
  return {
    schema_version: "0.1.0",
    metadata: {
      name: process?.getAttribute("name") || "Proceso importado BPMN",
      notation: "BPMN",
      method: "AS_IS",
      analyst: null,
      created_at: null,
      updated_at: null,
    },
    diagram,
  };
}

export async function importBpmnFromFilePicker(): Promise<{ doc?: ProjectDocument; message: string }> {
  return new Promise((resolve) => {
    const input = document.getElementById("file-import-bpmn") as HTMLInputElement | null;
    if (!input) { resolve({ message: "No se encontró selector BPMN" }); return; }
    input.value = "";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) { resolve({ message: "Importación cancelada" }); return; }
      try {
        const text = await file.text();
        const doc = importBpmnXml(text);
        resolve({ doc, message: `BPMN importado: ${file.name} (${doc.diagram.nodes.length} nodos, ${doc.diagram.edges.length} aristas)` });
      } catch (e) {
        resolve({ message: `Error al importar BPMN: ${e}` });
      }
    };
    input.click();
  });
}