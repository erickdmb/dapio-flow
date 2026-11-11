---
name: canvas-diagram-engine
description: Especificación de la capa visual 2D (Canvas 2D) para renderizado OIT/ASME/BPMN, interacción, cámara y ruteo ortogonal.
---

# Skill: `canvas-diagram-engine`

## 1. Alcance y Responsabilidades
- Renderizar diagramas en **HTML Canvas 2D** dentro del frontend (Vite + TypeScript) embebido en Tauri.
- Dibujar glifos OIT/ASME y elementos BPMN mínimos conforme al modelo de `bpm-core`.
- Gestionar cámara, selección, edición básica y sincronización de cambios hacia el estado/backend vía IPC.

## 2. Modelo visual y glifos OIT/ASME
- **Operación:** círculo (40x40 px base).
- **Transporte:** flecha horizontal a la derecha (45x25 px).
- **Inspección:** cuadrado (36x36 px).
- **Demora:** forma "D" (borde izquierdo recto + curva 180°, 40x40 px).
- **Almacenamiento:** triángulo invertido (40x35 px).
- **Combinada:** círculo inscrito en cuadrado (40x40 px).
- **Puertos:** 4 anclajes cardinales (`n`,`s`,`e`,`w`) por nodo; extensibles en versiones futuras.
- **Hitbox:** área de selección >= bounds del glifo (con padding mínimo de 4 px).

## 3. Cámara e interacción
- **Pan:** arrastre del fondo con botón central o `Space` + arrastre.
- **Zoom:** rango `0.1x`–`3.0x`, centrado en la posición del cursor; rueda del ratón.
- **Coordenadas:** funciones bidireccionales pantalla ↔ mundo.
- **Selección:** clic simple y (futuro) marquee; estados visuales hover/selección/error.
- **Snap-to-grid:** múltiplos de 20 px al mover/soltar nodos.
- **Guías magnéticas:** líneas temporales al alinear centro/bordes con nodos cercanos.

## 4. Conectores (ortogonal routing)
- Ruteo ortogonal (segmentos H/V, estilo Manhattan) entre puertos de origen/destino.
- Esquinas redondeadas (radio 8 px por defecto).
- Flecha en el extremo destino orientada según el último segmento.
- Re-ruteo automático al mover nodos; manejo básico de colisiones/solapamiento diferido a iteraciones posteriores.

## 5. Integración y sincronización
- El frontend edita una copia del `ProjectDocument` y emite cambios al backend mediante comandos IPC.
- Operaciones de alta frecuencia (drag) deben usar batching/debounce antes de persistir/sincronizar estado global.
- Errores de validación recibidos del núcleo se representan como indicadores visuales no bloqueantes en nodos/aristas afectados.