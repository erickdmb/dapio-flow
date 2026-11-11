# Primer modelo de datos (v0.1)

Este documento define el modelo inicial compartido entre núcleo Rust, IPC y persistencia nativa.

## Convenciones
- **Identificadores:** UUID v4 en formato string (`id`).
- **Unidades canónicas:** tiempo en `seconds` (f64), distancia en `meters` (f64), costo en `cost` (f64, moneda definida a nivel de proyecto).
- **Coordenadas de lienzo:** `x`, `y`, `width`, `height` en unidades de mundo (px lógicos), origen arriba-izquierda.
- **Versionado:** `schema_version` en el documento para migraciones futuras.

## Entidades principales

### ProjectDocument (persistencia `.bpmr.json`)
- `schema_version: string` (ej. `"0.1.0"`)
- `metadata: ProjectMetadata`
- `diagram: Diagram`

### ProjectMetadata
- `name: string`
- `notation: NotationType` (`BPMN` | `DOP` | `DAP`)
- `method: MethodType` (`AS_IS` | `TO_BE`)
- `analyst?: string`
- `created_at?: string` (ISO-8601)
- `updated_at?: string` (ISO-8601)

### Diagram
- `id: string`
- `nodes: Node[]`
- `edges: Edge[]`

### Node
- `id: string`
- `kind: NodeKind`
- `label: string`
- `position: Position { x, y }`
- `size?: Size { width, height }`
- `metrics: Metrics`
- `resource?: string`
- `ports: Port[]` (por defecto N,S,E,O; extensible)

### NodeKind
- `OIT(Operation | Transport | Inspection | Delay | Storage | Combined)`
- `BPMN(BpmnElementType)` — v0.1 mínimo: `Task`, `StartEvent`, `EndEvent`, `ExclusiveGateway`, `ParallelGateway`

### Metrics
- `time_seconds?: number` (>= 0)
- `distance_meters?: number` (>= 0, relevante en `Transport`)
- `cost?: number` (>= 0)

### Edge
- `id: string`
- `source: Endpoint { node_id, port_id }`
- `target: Endpoint { node_id, port_id }`
- `label?: string`
- `kind: EdgeKind` (`SequenceFlow` | `Association`)

### Port
- `id: string` (ej. `n`, `s`, `e`, `w`)
- `side: PortSide`

## Reglas del modelo (v0.1)
- **DOP:** no permite nodos OIT `Transport`, `Delay`, `Storage`.
- **DAP:** permite los 5 tipos OIT + `Combined`.
- **Combinada:** en cálculos cuenta +1 operación y +1 inspección; su `time_seconds` suma una vez al tiempo total.
- **Validación topológica base:** detectar nodos huérfanos (salvo diagrama de un solo nodo), componentes/ciclos que impidan flujo lineal en DOP/DAP y ausencia de inicio/fin cuando aplique.
- **Valores inválidos:** métricas negativas se rechazan en validación.

## Mapeo a implementación
- `crates/bpm-core/src/model.rs`: tipos y enums serializables (`serde`).
- `crates/bpm-core/src/validation.rs`: reglas de notación y grafo (`petgraph`).
- `crates/bpm-core/src/metrics.rs`: resumen DAP (conteos, tiempo total, distancia total).
- `src-tauri`: comandos IPC exponen validar/calcular/cargar/guardar usando este modelo.
- `src`: el frontend consume/edita el mismo esquema via IPC/JSON.