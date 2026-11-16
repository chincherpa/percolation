export interface Series {
  label: string;
  color: string;
  xs: number[];
  ys: number[];
}

export interface ChartOptions {
  xLabel: string;
  yLabel: string;
  xMin: number;
  xMax: number;
  marker?: { x: number; label: string };
  empty?: string;
}

export const SERIES_COLORS = ["#5aa9e6", "#7ddc3a", "#f0c33c", "#ff6b5e"];

const de = (x: number, digits: number) => x.toFixed(digits).replace(".", ",");

/** Liniendiagramm mit y ∈ [0, 1]. */
export function drawChart(canvas: HTMLCanvasElement, series: Series[], o: ChartOptions) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const g = canvas.getContext("2d")!;
  g.scale(dpr, dpr);
  g.clearRect(0, 0, w, h);
  g.font = "12px system-ui, sans-serif";

  const m = { l: 52, r: 16, t: 16, b: 44 };
  const X = (x: number) => m.l + ((x - o.xMin) / (o.xMax - o.xMin)) * (w - m.l - m.r);
  const Y = (y: number) => h - m.b - y * (h - m.t - m.b);

  // Gitter und Achsen
  g.lineWidth = 1;
  g.textBaseline = "middle";
  g.textAlign = "right";
  for (let i = 0; i <= 4; i++) {
    const y = i / 4;
    g.strokeStyle = i === 0 ? "#5a676e" : "#232a2f";
    g.beginPath(); g.moveTo(m.l, Y(y) + 0.5); g.lineTo(w - m.r, Y(y) + 0.5); g.stroke();
    g.fillStyle = "#8b989f";
    g.fillText(de(y, 2), m.l - 8, Y(y));
  }
  g.textAlign = "center";
  g.textBaseline = "top";
  for (let i = 0; i <= 5; i++) {
    const x = o.xMin + ((o.xMax - o.xMin) * i) / 5;
    g.fillText(de(x, 2), X(x), h - m.b + 8);
  }
  g.fillText(o.xLabel, (m.l + w - m.r) / 2, h - 18);
  g.save();
  g.translate(12, (m.t + h - m.b) / 2);
  g.rotate(-Math.PI / 2);
  g.textBaseline = "middle";
  g.fillText(o.yLabel, 0, 0);
  g.restore();

  if (o.marker) {
    g.strokeStyle = "#f0c33c";
    g.setLineDash([4, 4]);
    g.beginPath(); g.moveTo(X(o.marker.x), m.t); g.lineTo(X(o.marker.x), h - m.b); g.stroke();
    g.setLineDash([]);
    g.fillStyle = "#f0c33c";
    g.textAlign = "left";
    g.textBaseline = "top";
    g.fillText(o.marker.label, X(o.marker.x) + 6, m.t + 2);
  }

  const drawn = series.filter((s) => s.ys.length);
  if (!drawn.length) {
    if (o.empty) {
      g.fillStyle = "#8b989f";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(o.empty, (m.l + w - m.r) / 2, (m.t + h - m.b) / 2);
    }
    return;
  }

  g.lineWidth = 2;
  g.lineJoin = "round";
  for (const s of drawn) {
    g.strokeStyle = s.color;
    g.beginPath();
    s.xs.forEach((x, i) => (i ? g.lineTo(X(x), Y(s.ys[i])) : g.moveTo(X(x), Y(s.ys[i]))));
    g.stroke();
  }

  // Legende
  g.textAlign = "left";
  g.textBaseline = "middle";
  drawn.forEach((s, i) => {
    const y = m.t + 28 + i * 18;
    g.fillStyle = s.color;
    g.fillRect(m.l + 12, y - 1.5, 16, 3);
    g.fillStyle = "#dfe6ea";
    g.fillText(s.label, m.l + 34, y);
  });
}
