# Sistema de Modelado de Procesos (BPMN, DOP y DAP) en Rust

## Descargar o clonar el proyecto

Repositorio: [erickdmb/dapio-flow](https://github.com/erickdmb/dapio-flow).

### Opción 1: descargar ZIP

1. Abre el repositorio en GitHub.
2. Pulsa **Code → Download ZIP**.
3. Extrae el archivo y abre una terminal en la carpeta extraída.

### Opción 2: clonar con Git

```bash
git clone https://github.com/erickdmb/dapio-flow.git
cd dapio-flow
```

### Ejecutar en el navegador

Necesitas Node.js y npm instalados. Desde la carpeta del proyecto:

```bash
npm install
npm run dev
```

Abre la dirección que muestra Vite en la terminal. Para generar la versión web de producción:

```bash
npm run build
npm run preview
```

Los archivos generados se guardan en `dist/`. El ZIP y el clon contienen el código fuente; no incluyen un instalador de escritorio.

### Ejecutar la aplicación de escritorio

Además de Node.js y npm, instala Rust con Cargo y los requisitos de Tauri para tu sistema. En Windows se necesitan las herramientas de compilación de C++ y WebView2.

```bash
npm install
npm run tauri dev
```

Para generar la aplicación de escritorio:

```bash
npm run tauri build
```

### Verificación

```bash
npm test
npm run build
cargo test -p bpm-core
```

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

La importación BPMN actual admite un subconjunto de elementos y no garantiza recuperar todos los detalles de un XML externo. Usa `.bpmr.json` para conservar y volver a editar el proyecto completo.

## Exportación PDF y orientación BPMN

- Usa **Exportar → PDF (diagrama centrado)** para descargar el diagrama completo en una página A4. La orientación de la página se adapta al gráfico y mantiene márgenes iguales a ambos lados. La exportación incluye los elementos fuera de la vista actual y omite la cuadrícula y los indicadores de selección.
- Para cambiar un pool a disposición **horizontal** o **vertical**, selecciónalo y usa **Propiedades → Orientación del pool**. Sus carriles y actividades cambian de disposición; el texto de las actividades conserva su orientación de lectura.
- La orientación se conserva en los proyectos `.bpmr.json` y en la exportación BPMN XML. La importación XML sigue limitada al subconjunto de elementos descrito anteriormente.

## Texto, numeración y uniones en DOP

- **Texto libre:** arrastra este elemento desde «Texto y uniones» y edita su contenido en Propiedades. Admite varias líneas para títulos, materiales y notas.
- **Numeración:** los nuevos símbolos DOP reciben un número visible en su interior, con secuencias independientes por tipo de símbolo. Puedes cambiarlo o borrarlo en **Propiedades → Número del símbolo**, también en diagramas existentes.
- **Unir líneas:** arrastra un conector desde el puerto de un símbolo y suéltalo sobre otra línea. Se creará un punto de unión compartido. También puedes soltar **Unión de líneas** sobre una línea existente y conectar otras ramas a ese punto.
- El texto y los puntos de unión se guardan con el proyecto y aparecen en el PDF; se excluyen de la tabla de actividades y de los conteos de operaciones e inspecciones. CSV y Excel conservan la numeración editada.
