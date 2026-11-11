export class Camera {
  x = 0;
  y = 0;
  scale = 1;
  readonly minScale = 0.001;
  readonly maxScale = 3;

  screenToWorld(sx: number, sy: number) {
    return { x: (sx - this.x) / this.scale, y: (sy - this.y) / this.scale };
  }

  worldToScreen(wx: number, wy: number) {
    return { x: wx * this.scale + this.x, y: wy * this.scale + this.y };
  }

  setScaleAt(sx: number, sy: number, scale: number) {
    const before = this.screenToWorld(sx, sy);
    this.scale = Math.min(this.maxScale, Math.max(this.minScale, scale));
    this.x = sx - before.x * this.scale;
    this.y = sy - before.y * this.scale;
  }

  fitBounds(bounds: { x: number; y: number; width: number; height: number }, viewportWidth: number, viewportHeight: number, padding = 72) {
    if (viewportWidth <= 0 || viewportHeight <= 0) return;
    const scale = Math.min((Math.max(1, viewportWidth - padding * 2)) / Math.max(1, bounds.width), (Math.max(1, viewportHeight - padding * 2)) / Math.max(1, bounds.height), 1.5);
    // Allow distant and large diagrams while keeping the camera scale positive.
    this.scale = Math.max(0.001, scale);
    this.x = viewportWidth / 2 - (bounds.x + bounds.width / 2) * this.scale;
    this.y = viewportHeight / 2 - (bounds.y + bounds.height / 2) * this.scale;
  }

  zoomAt(sx: number, sy: number, delta: number) {
    this.setScaleAt(sx, sy, this.scale * Math.exp(-delta * 0.0015));
  }

  pan(dx: number, dy: number) {
    this.x += dx;
    this.y += dy;
  }
}