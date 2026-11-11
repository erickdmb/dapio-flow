import "./style.css";

const canvas = document.getElementById("diagram-canvas") as HTMLCanvasElement | null;
const statusbar = document.getElementById("statusbar");

function resize() {
  if (!canvas) return;
  const parent = canvas.parentElement;
  if (!parent) return;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(parent.clientWidth * dpr);
  canvas.height = Math.floor(parent.clientHeight * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  draw(ctx, parent.clientWidth, parent.clientHeight);
}

function draw(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.clearRect(0, 0, w, h);
  // grid placeholder (20px)
  ctx.strokeStyle = "#eee";
  ctx.lineWidth = 1;
  for (let x = 0; x < w; x += 20) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  }
  for (let y = 0; y < h; y += 20) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }
  ctx.fillStyle = "#666";
  ctx.font = "14px system-ui, sans-serif";
  ctx.fillText("Lienzo inicial (Canvas 2D) — estructura del proyecto creada", 24, 32);
}

window.addEventListener("resize", resize);
resize();

if (statusbar) statusbar.textContent = "Proyecto inicializado. Modelo v0.1 en crates/bpm-core.";