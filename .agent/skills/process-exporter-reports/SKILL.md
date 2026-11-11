---
name: process-exporter-reports
description: Especificación para exportación de diagramas a Excel (Ficha DAP), CSV, BPMN 2.0 XML y formatos gráficos SVG/PNG.
---

# Skill: `process-exporter-reports`

## 1. Alcance y Responsabilidades
- Transformar el `ProjectDocument`/`Diagram` y resultados de `bpm-core` a formatos de reporte e intercambio.
- Generar Ficha Analítica DAP (Excel), exportación tabular (CSV), interoperabilidad BPMN 2.0 (XML/BPMNDI) y salida gráfica (SVG/PNG).

## 2. Excel — Ficha Analítica DAP
- **Encabezado:** título "FICHA ANALÍTICA DEL PROCESO (DAP)", nombre del proceso, notación, método (Actual/Propuesto), analista y fecha.
- **Tabla de actividades (orden secuencial del flujo):** `N°`, `Descripción`, `Tipo de Actividad` (OIT), `Tiempo (s)`, `Distancia (m)`, `Recurso/Máquina`.
  - Valores vacíos se exportan como celdas en blanco; tiempos/distancias numéricos.
- **Resumen consolidado:** conteos por tipo OIT, tiempo total de ciclo y distancia total recorrida (fuente: `calculate_dap_summary`).
- Formato y estilos (anchos, bordes, resaltados) definidos en implementación; datos y estructura son obligatorios.

## 3. CSV
- **Formato:** `.csv`, codificación UTF-8, separador coma, primera fila como cabecera.
- **Campos mínimos:** `Numero_Secuencia,Nombre_Actividad,Tipo_Actividad_OIT,Tiempo_Segundos,Distancia_Metros,Recurso_Asignado`.
- **Reglas:** escapar comillas y saltos de línea según RFC 4180; valores numéricos sin separador de miles; campos ausentes vacíos.

## 4. BPMN 2.0 (XML)
- **Proceso:** mapear a `<bpmn:definitions>`, `<bpmn:process>`, `<bpmn:task>`, `<bpmn:startEvent>`, `<bpmn:endEvent>`, `<bpmn:exclusiveGateway>`, `<bpmn:sequenceFlow>`, etc., según elementos soportados.
- **Diagrama (BPMNDI):** `<bpmndi:BPMNDiagram>`, `<bpmndi:BPMNPlane>`, `<bpmndi:BPMNShape>`, `<bpmndi:BPMNEdge>` con bounds/waypoints en coordenadas del lienzo.
- **Mapeo OIT:** actividades OIT se exportan como tareas con metadatos/extensiones cuando no exista equivalente nativo; métricas específicas pueden conservarse en extensiones del proyecto.
- **Importación:** validar namespace/estructura y reconstruir modelo interno cuando sea posible; rechazar con error claro si no es compatible.

## 5. Exportación gráfica (SVG/PNG)
- **SVG:** representación vectorial del lienzo (nodos, conectores, etiquetas) preservando geometría.
- **PNG:** rasterización del lienzo completo (v0.1) con fondo configurable y margen; resolución/escala definida en opciones de exportación.
- La exportación gráfica es responsabilidad del frontend/capa de renderizado con datos del modelo; el backend puede orquestar guardado a archivo.