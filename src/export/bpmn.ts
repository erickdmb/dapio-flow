import type { DiagramNode, ProjectDocument } from "../model/types";
import { nodeSize } from "../canvas/renderer";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function bpmnElementForNode(n: DiagramNode): { tag: string; attrs: string; body?: string } {
  const id = `node_${n.id.replace(/[^a-zA-Z0-9_]/g, "")}`;
  const name = esc(n.label || id);
  if (n.kind.type === "BPMN") {
    switch (n.kind.value) {
      case "START_EVENT": return { tag: "bpmn:startEvent", attrs: `id="${id}" name="${name}"` };
      case "END_EVENT": return { tag: "bpmn:endEvent", attrs: `id="${id}" name="${name}"` };
      case "EXCLUSIVE_GATEWAY": return { tag: "bpmn:exclusiveGateway", attrs: `id="${id}" name="${name}"` };
      case "PARALLEL_GATEWAY": return { tag: "bpmn:parallelGateway", attrs: `id="${id}" name="${name}"` };
      default: return { tag: "bpmn:task", attrs: `id="${id}" name="${name}"` };
    }
  }
  // OIT mapped as task with type in name metadata
  const oit = n.kind.value;
  return { tag: "bpmn:task", attrs: `id="${id}" name="${name}" oit:type="${oit}"` };
}

function boundsForNode(n: DiagramNode) {
  if (n.kind.type === "OIT") {
    const { w, h } = nodeSize(n.kind.value);
    return { x: n.position.x - w / 2, y: n.position.y - h / 2, w, h };
  }
  return { x: n.position.x - 30, y: n.position.y - 20, w: 60, h: 40 };
}

export function documentToBpmnXml(doc: ProjectDocument): string {
  const diagram = doc.diagram;
  const defId = "Definitions_1";
  const procId = "Process_1";
  const planeId = "BPMNPlane_1";

  const nodeIdMap = new Map<string, string>();
  diagram.nodes.forEach(n => nodeIdMap.set(n.id, `node_${n.id.replace(/[^a-zA-Z0-9_]/g, "")}`));
  const flowIdMap = new Map<string, string>();
  diagram.edges.forEach(e => flowIdMap.set(e.id, `flow_${e.id.replace(/[^a-zA-Z0-9_]/g, "")}`));

  const incoming = new Map<string, string[]>();
  const outgoing = new Map<string, string[]>();
  diagram.nodes.forEach(n => { incoming.set(n.id, []); outgoing.set(n.id, []); });
  diagram.edges.forEach(e => {
    const fid = flowIdMap.get(e.id)!;
    outgoing.get(e.source.node_id)?.push(fid);
    incoming.get(e.target.node_id)?.push(fid);
  });

  const processNodes = diagram.nodes.map(n => {
    const el = bpmnElementForNode(n);
    const ins = (incoming.get(n.id) || []).map(f => `<bpmn:incoming>${f}</bpmn:incoming>`).join("");
    const outs = (outgoing.get(n.id) || []).map(f => `<bpmn:outgoing>${f}</bpmn:outgoing>`).join("");
    const inner = ins + outs;
    return inner ? `<${el.tag} ${el.attrs}>${inner}</${el.tag}>` : `<${el.tag} ${el.attrs} />`;
  }).join("\n      ");

  const flows = diagram.edges.map(e => {
    const fid = flowIdMap.get(e.id)!;
    const src = nodeIdMap.get(e.source.node_id) || "";
    const tgt = nodeIdMap.get(e.target.node_id) || "";
    return `<bpmn:sequenceFlow id="${fid}" sourceRef="${src}" targetRef="${tgt}" />`;
  }).join("\n      ");

  const shapes = diagram.nodes.map(n => {
    const b = boundsForNode(n);
    const nid = nodeIdMap.get(n.id)!;
    return `<bpmndi:BPMNShape id="${nid}_di" bpmnElement="${nid}">
        <dc:Bounds x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" />
      </bpmndi:BPMNShape>`;
  }).join("\n      ");

  // simple straight/orthogonal-ish waypoints via port centers
  const portPos = (n: DiagramNode, pid: string) => {
    const b = boundsForNode(n);
    const cx = b.x + b.w/2, cy = b.y + b.h/2;
    switch (pid) {
      case "n": return { x: cx, y: b.y };
      case "s": return { x: cx, y: b.y + b.h };
      case "e": return { x: b.x + b.w, y: cy };
      case "w": return { x: b.x, y: cy };
      default: return { x: cx, y: cy };
    }
  };
  const nodesById = new Map(diagram.nodes.map(n => [n.id, n]));
  const edgesXml = diagram.edges.map(e => {
    const fid = flowIdMap.get(e.id)!;
    const sn = nodesById.get(e.source.node_id), tn = nodesById.get(e.target.node_id);
    if (!sn || !tn) return "";
    const a = portPos(sn, e.source.port_id), b = portPos(tn, e.target.port_id);
    const midX = (a.x + b.x) / 2, midY = (a.y + b.y) / 2;
    let pts = [a,b];
    const horiz = (p:string)=>p==="e"||p==="w";
    if (horiz(e.source.port_id) && horiz(e.target.port_id)) pts = [a,{x:midX,y:a.y},{x:midX,y:b.y},b];
    else if (!horiz(e.source.port_id) && !horiz(e.target.port_id)) pts = [a,{x:a.x,y:midY},{x:b.x,y:midY},b];
    else if (horiz(e.source.port_id)) pts = [a,{x:b.x,y:a.y},b];
    else pts = [a,{x:a.x,y:b.y},b];
    const wps = pts.map(p => `<di:waypoint x="${p.x}" y="${p.y}" />`).join("");
    return `<bpmndi:BPMNEdge id="${fid}_di" bpmnElement="${fid}">${wps}</bpmndi:BPMNEdge>`;
  }).join("\n      ");

  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  xmlns:oit="http://bpm-rust/schema/oit"
  id="${defId}" targetNamespace="http://bpm-rust/schema/bpmn">
  <bpmn:process id="${procId}" name="${esc(doc.metadata.name || "Proceso")}" isExecutable="false">
      ${processNodes}
      ${flows}
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="${planeId}" bpmnElement="${procId}">
      ${shapes}
      ${edgesXml}
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;
}

export function downloadBpmn(filename: string, xml: string) {
  const blob = new Blob([xml], { type: "application/xml;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}