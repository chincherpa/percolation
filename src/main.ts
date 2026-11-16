import { drawChart, SERIES_COLORS, type Series } from "./chart";
import { findClusters, Outbreak, P_C, randomField, Sweep, type Clusters, type Lattice } from "./model";

type Tab = "outbreak" | "clusters" | "experiment";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const grid = $<HTMLCanvasElement>("grid");
const chart = $<HTMLCanvasElement>("chart");
const ctx = grid.getContext("2d")!;
const pIn = $<HTMLInputElement>("p");
const latticeIn = $<HTMLSelectElement>("lattice");
const sizeIn = $<HTMLSelectElement>("size");
const biteIn = $<HTMLInputElement>("bite");
const speedIn = $<HTMLInputElement>("speed");
const trialsIn = $<HTMLSelectElement>("trials");
const metricIn = $<HTMLSelectElement>("metric");
const stats = $<HTMLDListElement>("stats");
const runBtn = $<HTMLButtonElement>("run");

const pct = (x: number, digits = 1) => (100 * x).toFixed(digits).replace(".", ",") + " %";
const num = (x: number) => x.toLocaleString("de-DE");

let tab: Tab = "outbreak";
let n = +sizeIn.value;
let lattice = +latticeIn.value as Lattice;
let p = +pIn.value;
let u = randomField(n);
let clusters: Clusters;
let outbreak: Outbreak;
let image: ImageData;
let dirty = true;
let stepBudget = 0;

// ---------- Zustand ----------

function rebuild(newField: boolean) {
  if (newField) u = randomField(n);
  clusters = findClusters(u, n, p, lattice);
  outbreak = new Outbreak(u, n, p, lattice, +biteIn.value);
  // 2×2 Pixel je Zelle; im Dreiecksgitter sind ungerade Zeilen um 1 Pixel versetzt.
  grid.width = 2 * n + 1;
  grid.height = 2 * n;
  image = ctx.createImageData(grid.width, grid.height);
  dirty = true;
}

function updateLabels() {
  $("pOut").textContent = pct(p);
  $("biteOut").textContent = pct(+biteIn.value, 0);
  $("speedOut").textContent = `${speedIn.value} Wellen/s`;
  $("pcMark").style.left = `calc(8px + (100% - 16px) * ${P_C[lattice]})`;
  $("pcMark").title = `kritische Dichte ≈ ${pct(P_C[lattice], 2)}`;
}

// ---------- Zeichnen ----------

function hsl(h: number, s: number, l: number): [number, number, number] {
  const a = s * Math.min(l, 1 - l);
  const f = (k: number) => {
    const t = (k + h / 30) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(t - 3, 9 - t, 1))));
  };
  return [f(0), f(8), f(4)];
}

function cellColor(i: number): [number, number, number] {
  const id = clusters.label[i];
  if (id < 0) return [10, 12, 13];
  if (tab === "clusters") {
    if (id === clusters.largest) return clusters.spanning[id] ? [240, 195, 60] : [245, 245, 245];
    return hsl((id * 137.508) % 360, 0.55, 0.42);
  }
  const w = outbreak.wave[i];
  if (w < 0) return [84, 98, 108]; // Mensch
  const age = outbreak.step - w;
  if (outbreak.active && age <= 1) return [235, 255, 190]; // Front
  return hsl(105, 0.7, 0.3 + 0.18 * Math.exp(-age / 12));
}

function draw() {
  const d = image.data, W = image.width;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = 10; d[i + 1] = 12; d[i + 2] = 13; d[i + 3] = 255;
  }
  for (let r = 0; r < n; r++) {
    const shift = lattice === 6 && r & 1 ? 1 : 0;
    for (let c = 0; c < n; c++) {
      const [R, G, B] = cellColor(r * n + c);
      for (let dy = 0; dy < 2; dy++) {
        let o = ((2 * r + dy) * W + 2 * c + shift) * 4;
        for (let dx = 0; dx < 2; dx++, o += 4) {
          d[o] = R; d[o + 1] = G; d[o + 2] = B;
        }
      }
    }
  }
  ctx.putImageData(image, 0, 0);
}

function showStats() {
  const rows: [string, string][] = [];
  let verdict = "";
  const pop = clusters.population;
  if (tab === "outbreak") {
    rows.push(["Bevölkerung", num(pop)], ["Infiziert", num(outbreak.infected)]);
    rows.push(["Anteil", pop ? pct(outbreak.infected / pop) : "–"], ["Wellen", num(outbreak.step)]);
    if (outbreak.infected > 0) {
      verdict = outbreak.crossed
        ? `<dd class="verdict bad">Apokalypse – die Infektion durchquert die Karte</dd>`
        : outbreak.active
          ? `<dd class="verdict">Ausbreitung läuft …</dd>`
          : `<dd class="verdict ok">Eingedämmt – der Ausbruch bleibt lokal</dd>`;
    }
  } else if (tab === "clusters") {
    const big = clusters.largest >= 0 ? clusters.sizes[clusters.largest] : 0;
    const spans = clusters.largest >= 0 && clusters.spanning[clusters.largest];
    rows.push(["Bevölkerung", num(pop)], ["Cluster", num(clusters.sizes.length)]);
    rows.push(["Größter Cluster", num(big)], ["… Anteil", pop ? pct(big / pop) : "–"]);
    rows.push(["Kritische Dichte", pct(P_C[lattice], 2)]);
    verdict = spans
      ? `<dd class="verdict bad">Ein Cluster durchspannt die Karte</dd>`
      : `<dd class="verdict ok">Nur isolierte Inseln</dd>`;
  }
  stats.innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("") + verdict;
}

// ---------- Experiment ----------

const SWEEP_SIZES = [20, 40, 80, 160];
let sweeps: Sweep[] = [];
let sweepTarget = 0;

function startExperiment() {
  const pc = P_C[lattice];
  const lo = Math.max(0, pc - 0.25), hi = Math.min(1, pc + 0.25);
  const ps = Array.from({ length: 101 }, (_, i) => lo + ((hi - lo) * i) / 100);
  sweeps = SWEEP_SIZES.map((s) => new Sweep(s, lattice, ps));
  sweepTarget = +trialsIn.value;
  runBtn.textContent = "Abbrechen";
}

function stopExperiment() {
  sweepTarget = 0;
  runBtn.textContent = "Experiment starten";
}

function experimentTick() {
  if (sweepTarget > 0) {
    const t0 = performance.now();
    while (performance.now() - t0 < 12) {
      const s = sweeps.find((x) => x.result.trials < sweepTarget);
      if (!s) { stopExperiment(); break; }
      s.runTrial();
    }
    dirty = true;
  }
  if (!dirty) return;
  dirty = false;
  const metric = metricIn.value as "spanProb" | "largestFrac";
  const series: Series[] = sweeps.map((s, i) => ({
    label: `${s.n}×${s.n}`,
    color: SERIES_COLORS[i],
    xs: s.result.ps,
    ys: s.result.trials ? s.result[metric] : [],
  }));
  const pc = P_C[lattice];
  drawChart(chart, series, {
    xLabel: "Bevölkerungsdichte p",
    yLabel: metricIn.selectedOptions[0].text,
    xMin: Math.max(0, pc - 0.25),
    xMax: Math.min(1, pc + 0.25),
    marker: { x: pc, label: `p_c ≈ ${pc.toFixed(4).replace(".", ",")}` },
    empty: "„Experiment starten“ berechnet die Schwellenkurve.",
  });
  stats.innerHTML = sweeps.length
    ? sweeps.map((s) => `<dt>${s.n}×${s.n}</dt><dd>${s.result.trials} / ${sweepTarget || s.result.trials} Durchläufe</dd>`).join("")
    : "";
}

// ---------- Schleife ----------

let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (tab === "experiment") {
    experimentTick();
  } else {
    if (tab === "outbreak" && outbreak.active) {
      stepBudget += dt * +speedIn.value;
      while (stepBudget >= 1 && outbreak.active) {
        outbreak.advance();
        stepBudget--;
      }
      dirty = true;
    }
    if (dirty) {
      dirty = false;
      draw();
      showStats();
    }
  }
  requestAnimationFrame(frame);
}

// ---------- Ereignisse ----------

function setTab(t: Tab) {
  tab = t;
  document.querySelectorAll<HTMLButtonElement>("#tabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === t));
  document.querySelectorAll<HTMLElement>(".panel").forEach((el) => (el.hidden = el.dataset.panel !== t));
  grid.hidden = t === "experiment";
  chart.hidden = t !== "experiment";
  // Dichte und Kartengröße werden im Experiment durchgefahren, nicht eingestellt.
  pIn.closest("label")!.hidden = sizeIn.closest("label")!.hidden = $("regen").hidden = t === "experiment";
  dirty = true;
}

document.querySelectorAll<HTMLButtonElement>("#tabs button").forEach((b) =>
  b.addEventListener("click", () => setTab(b.dataset.tab as Tab)),
);

pIn.addEventListener("input", () => { p = +pIn.value; updateLabels(); rebuild(false); });
latticeIn.addEventListener("change", () => {
  lattice = +latticeIn.value as Lattice;
  stopExperiment();
  sweeps = [];
  updateLabels();
  rebuild(false);
});
sizeIn.addEventListener("change", () => { n = +sizeIn.value; rebuild(true); });
biteIn.addEventListener("input", () => { updateLabels(); rebuild(false); });
speedIn.addEventListener("input", updateLabels);
metricIn.addEventListener("change", () => (dirty = true));
$("regen").addEventListener("click", () => rebuild(true));
$("heal").addEventListener("click", () => rebuild(false));
runBtn.addEventListener("click", () => (sweepTarget > 0 ? stopExperiment() : startExperiment()));
window.addEventListener("resize", () => (dirty = true));

$("bite-random").addEventListener("click", () => {
  if (clusters.population === 0) return;
  for (let tries = 0; tries < 10000; tries++) {
    if (outbreak.infect((Math.random() * n * n) | 0)) break;
  }
  dirty = true;
});

grid.addEventListener("click", (e) => {
  if (tab !== "outbreak") return;
  const rect = grid.getBoundingClientRect();
  const y = ((e.clientY - rect.top) / rect.height) * grid.height;
  const r = Math.min(n - 1, Math.floor(y / 2));
  const shift = lattice === 6 && r & 1 ? 1 : 0;
  const x = ((e.clientX - rect.left) / rect.width) * grid.width - shift;
  const c = Math.max(0, Math.min(n - 1, Math.floor(x / 2)));
  // Etwas Toleranz: nächstgelegenen Menschen im 3×3-Umfeld treffen.
  const candidates = [0, -1, 1, -n, n, -n - 1, -n + 1, n - 1, n + 1].map((o) => r * n + c + o);
  for (const i of candidates) {
    if (i >= 0 && i < n * n && outbreak.infect(i)) break;
  }
  dirty = true;
});

updateLabels();
rebuild(false);
requestAnimationFrame(frame);
