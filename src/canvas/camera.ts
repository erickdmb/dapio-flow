export class Camera {
  x = 0;
  y = 0;
  scale = 1;
  readonly minScale = 0.1;
  readonly maxScale = 3;

  screenToWorld(sx: number, sy: number) {
    return { x: (sx - this.x) / this.scale, y: (sy - this.y) / this.scale };
  }

  worldToScreen(wx: number, wy: number) {
    return { x: wx * this.scale + this.x, y: wy * this.scale + this.y };
  }

  zoomAt(sx: number, sy: number, delta: number) {
    const before = this.screenToWorld(sx, sy);
    const factor = Math.exp(-delta * 0.0015);
    this.scale = Math.min(this.maxScale, Math.max(this.minScale, this.scale * factor));
    this.x = sx - before.x * this.scale;
    this.y = sy - before.y * this.scale;
  }

  pan(dx: number, dy: number) {
    this.x += dx;
    this.y += dy;
  }
}