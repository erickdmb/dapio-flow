---
name: rust-bpm-core
description: Especificación del núcleo en Rust para modelado de dominio, análisis topológico con petgraph y reglas de negocio para BPMN, DOP y DAP.
---

# Skill: `rust-bpm-core`

## 1. Alcance y Responsabilidades
- Modelar notaciones **BPMN 2.0**, **DOP** y **DAP** con un esquema de datos tipado y serializable.
- Implementar análisis topológico y validaciones sobre grafos dirigidos usando **`petgraph`**.
- Calcular métricas consolidadas (Ficha Resumen DAP) a partir del modelo de nodos/aristas.
- Exponer lógica pura reutilizable por la capa IPC (`src-tauri`) y por exportadores.

## 2. Modelo de dominio (v0.1)
- **Documento:** `schema_version`, `metadata` (nombre, notación, método AS_IS/TO_BE, analista, fechas) y `diagram` (`nodes`, `edges`).
- **Notación (`NotationType`):** `BPMN`, `DOP`, `DAP`.
- **Nodo:** `id` (UUID), `kind`, `label`, `position {x,y}`, `size?`, `metrics`, `resource?`, `ports[]`.
- **Clasificación OIT/ASME (`NodeKind::OIT`):** `Operation`, `Transport`, `Inspection`, `Delay`, `Storage`, `Combined`.
- **BPMN mínimo (`NodeKind::BPMN`):** `Task`, `StartEvent`, `EndEvent`, `ExclusiveGateway`, `ParallelGateway` (extensible).
- **Métricas canónicas:** `time_seconds: f64 >= 0`, `distance_meters: f64 >= 0`, `cost: f64 >= 0` (opcionales según actividad).
- **Arista:** `id`, `source {node_id, port_id}`, `target {node_id, port_id}`, `label?`, `kind` (`SequenceFlow`/`Association`).

## 3. Motor de cálculo DAP
- **Conteo por tipo:** operaciones, transportes, inspecciones, demoras y almacenamientos.
- **Actividad combinada:** suma +1 a operaciones y +1 a inspecciones; su tiempo se suma una sola vez al total.
- **Tiempo de ciclo:** sumatoria de `time_seconds` de actividades aplicables.
- **Distancia total:** sumatoria de `distance_meters` de nodos `Transport`.
- **Salida:** estructura de resumen serializable para UI y exportadores.

## 4. Reglas de validación
- **DOP estricta:** rechaza nodos OIT `Transport`, `Delay`, `Storage`.
- **DAP:** permite los 5 tipos OIT y `Combined`.
- **Integridad:** IDs únicos, referencias de aristas válidas, puertos existentes, métricas no negativas.
- **Topología (`petgraph`):**
  - Nodos huérfanos: sin aristas entrantes/salientes (permitido solo si es el único nodo).
  - Ciclos en flujos lineales DOP/DAP: reportar como error cuando impidan determinar secuencia inicio-fin.
  - Inicio/fin: en flujos secuenciales debe existir al menos un nodo fuente y uno sumidero (o eventos start/end en BPMN).
- **Errores:** devolver lista estructurada `{ code, message, node_id?, edge_id? }`, sin pánico.

## 5. Criterios de implementación
- Crate: `crates/bpm-core`.
- Módulos iniciales: `model`, `validation`, `metrics` (y `graph` auxiliar si aplica).
- Serialización con `serde`; tests unitarios para reglas DOP/DAP, combinadas y casos topológicos básicos.