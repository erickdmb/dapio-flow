# Sistema de Modelado de Procesos (BPMN, DOP y DAP) en Rust

## 1. Visión General del Sistema
Aplicación de escritorio de alto rendimiento construida en **Rust** para la modelación, análisis y documentación de procesos industriales y organizacionales. Permite la diagramación interactiva en notaciones **BPMN 2.0**, **DOP** (Diagrama de Operaciones del Proceso) y **DAP** (Diagrama Analítico del Proceso), integrando el cálculo automático de tiempos de ciclo, distancias recorridas y generación de reportes ejecutivos.

## 2. Decisiones iniciales de arquitectura
- **Shell de escritorio:** Tauri v2.
- **Backend/lógica:** Rust (workspace), con núcleo de dominio en `crates/bpm-core`.
- **Grafo y análisis topológico:** `petgraph` en el núcleo.
- **Frontend:** aplicación web embebida (Vite + TypeScript) con renderizado en **Canvas 2D**.
- **Persistencia de proyecto:** archivo JSON versionado (`.bpmr.json`) como formato nativo; interoperabilidad BPMN 2.0 vía XML (`.bpmn`).
- **Repositorio:** incluye `.gitignore` y estructura preparada para control de versiones.

## 3. Estructura inicial del proyecto

```text
bpm-rust/
├── .agent/
│   └── skills/                      # Especificaciones técnicas por módulo
├── crates/
│   └── bpm-core/                    # Modelo de dominio, grafo, validación y cálculos
├── src/                             # Frontend (Canvas 2D, UI)
├── src-tauri/                       # App Tauri, comandos IPC y estado
├── docs/
│   └── MODEL.md                     # Primer diseño del modelo de datos
├── .gitignore
├── Cargo.toml                       # Workspace Rust
├── package.json
├── README.md
└── tsconfig.json
```

## 4. Documentación (Skills)

```text
.agent/
└── skills/
    ├── rust-bpm-core/SKILL.md            # Dominio, grafo (petgraph) y reglas
    ├── canvas-diagram-engine/SKILL.md    # Canvas 2D, cámara y glifos OIT/ASME
    ├── tauri-ipc-bridge/SKILL.md         # IPC async (Tauri), estado y persistencia
    └── process-exporter-reports/SKILL.md # Exportación Excel (DAP), CSV y BPMN 2.0
```

## 5. Estado actual
- **Versión:** `0.1.0-alpha.1` (alfa).
- **Modalidades:** (1) aplicación **web** (Vite/frontend) para uso en navegador y (2) aplicación de **escritorio** con Tauri (`src-tauri/`) que integra el mismo frontend y backend Rust.
- Especificaciones actualizadas, modelo de datos v0.1 y editor en evolución (`docs/MODEL.md`, `crates/bpm-core`, `src/`, `src-tauri/`).
- Incluye lienzo con elementos DOP/DAP/BPMN (sin mezclar notaciones en un mismo diagrama), conexiones, tiempos, validación, análisis detallado y exportaciones. La compilación de escritorio requiere toolchain de Rust y dependencias de Tauri.
