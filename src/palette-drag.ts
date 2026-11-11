/** Internal palette dragging uses pointer events so WebView drag handlers cannot swallow it. */
export function installPaletteDrag(
  palette: HTMLElement,
  canvas: HTMLCanvasElement,
  onDrop: (id: string, clientX: number, clientY: number) => void,
) {
  let active: { id: string; pointerId: number; x: number; y: number; source: HTMLElement; moved: boolean } | null = null;
  let ghost: HTMLDivElement | null = null;
  let suppressClickUntil = 0;
  const overCanvas = (x: number, y: number) => {
    const r = canvas.getBoundingClientRect();
    if (x < r.left || x > r.right || y < r.top || y > r.bottom) return false;
    const target = document.elementFromPoint?.(x, y);
    return target === undefined || target === canvas;
  };
  const cancel = () => {
    const previous = active;
    active = null;
    ghost?.remove(); ghost = null;
    canvas.parentElement?.classList.remove("palette-drop-active");
    previous?.source.classList.remove("palette-item-dragging");
    if (previous?.source.hasPointerCapture?.(previous.pointerId)) previous.source.releasePointerCapture(previous.pointerId);
  };
  palette.addEventListener("pointerdown", event => {
    if (event.button !== 0 || event.isPrimary === false) return;
    const source = (event.target as Element | null)?.closest<HTMLElement>("[data-palette-id]");
    if (!source || !palette.contains(source)) return;
    cancel();
    event.preventDefault();
    source.focus({ preventScroll: true });
    active = { id: source.dataset.paletteId!, pointerId: event.pointerId, x: event.clientX, y: event.clientY, source, moved: false };
    source.setPointerCapture?.(event.pointerId);
  });
  window.addEventListener("pointermove", event => {
    if (!active || active.pointerId !== event.pointerId) return;
    if (!active.moved && Math.hypot(event.clientX - active.x, event.clientY - active.y) < 4) return;
    active.moved = true;
    active.source.classList.add("palette-item-dragging");
    event.preventDefault();
    if (!ghost) {
      ghost = document.createElement("div");
      ghost.className = "palette-drag-ghost";
      ghost.textContent = active.source.textContent;
      ghost.setAttribute("aria-hidden", "true");
      document.body.appendChild(ghost);
    }
    ghost.style.left = `${event.clientX + 14}px`;
    ghost.style.top = `${event.clientY + 14}px`;
    canvas.parentElement?.classList.toggle("palette-drop-active", overCanvas(event.clientX, event.clientY));
  }, { passive: false });
  window.addEventListener("pointerup", event => {
    if (!active || active.pointerId !== event.pointerId) return;
    const id = active.id;
    const moved = active.moved || Math.hypot(event.clientX - active.x, event.clientY - active.y) >= 4;
    const shouldDrop = moved && overCanvas(event.clientX, event.clientY);
    if (moved) suppressClickUntil = Date.now() + 400;
    cancel();
    if (shouldDrop) { event.preventDefault(); onDrop(id, event.clientX, event.clientY); }
  });
  window.addEventListener("pointercancel", event => { if (event.pointerId === active?.pointerId) cancel(); });
  window.addEventListener("blur", cancel);
  window.addEventListener("keydown", event => { if (event.key === "Escape" && active) { cancel(); event.preventDefault(); } });
  return { cancel, suppressClick: () => Date.now() < suppressClickUntil };
}
