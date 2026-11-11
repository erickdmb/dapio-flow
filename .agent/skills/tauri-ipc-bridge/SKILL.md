---
name: tauri-ipc-bridge
description: Especificación del puente IPC asíncrono en Tauri v2 entre frontend y Rust, estado global y persistencia local.
---

# Skill: `tauri-ipc-bridge`

## 1. Alcance y Responsabilidades
- Implementar la capa de aplicación en **Tauri v2** (`src-tauri`) como puente entre UI (Canvas 2D) y `bpm-core`.
- Exponer comandos IPC asíncronos tipados, gestionar estado compartido thread-safe y operar con el sistema de archivos local.
- Mantener sincronía entre el documento en memoria y la UI con manejo explícito de errores.

## 2. Contratos IPC (v0.1)
- **`validate_diagram(diagram: Diagram) -> ValidationResult`**: ejecuta reglas de `bpm-core` y retorna `{ ok: bool, issues: Issue[] }`.
- **`calculate_dap_summary(diagram: Diagram) -> DapSummary`**: retorna conteos y totales DAP.
- **`load_project(path: string) -> ProjectDocument`**: lee `.bpmr.json` (o `.bpmn` cuando se soporte importación), valida `schema_version` y estructura.
- **`save_project(path: string, document: ProjectDocument) -> SaveResult`**: serializa JSON nativo y escribe en disco de forma atómica (tmp + rename).
- **Errores:** `AppError { code, message, details? }` serializable; sin pánicos expuestos al frontend.

## 3. Estado global y sincronización
- Estado en Rust: `AppState` con el `ProjectDocument` activo protegido por primitivas thread-safe (p. ej. `Mutex`/`RwLock`).
- El frontend es fuente de verdad de la interacción inmediata; sincroniza cambios relevantes al backend (save points, validación, exportación).
- Cambios frecuentes (drag): aplicar debounce/batching en frontend; el backend puede exponer actualización de estado ligera si se requiere.
- Historial undo/redo: responsabilidad inicial del frontend; el backend persiste snapshots/documento vigente.

## 4. Persistencia y sistema operativo
- **Formato nativo:** `.bpmr.json` (JSON UTF-8, `schema_version`).
- **Diálogos nativos:** abrir/guardar con filtros `.bpmr.json` y `.bpmn`.
- **Autoguardado (futuro cercano):** archivo temporal/snapshot configurable sin sobrescribir el archivo del usuario sin confirmación.

## 5. Atajos y eventos
- `Ctrl/Cmd+S`: guardar.
- `Ctrl+Z` / `Ctrl+Y` o `Cmd+Shift+Z`: deshacer/rehacer (frontend, con sincronización de estado al confirmar operaciones).
- `Ctrl+C` / `Ctrl+V`: copiar/pegar selección.
- `Supr` / `Backspace`: eliminar selección.
- Los atajos se capturan en frontend; comandos que impliquen disco o cálculo de núcleo se delegan vía IPC.