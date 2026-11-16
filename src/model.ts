// Site-Perkolation: Jede Zelle bekommt eine feste Zufallszahl u ∈ [0,1).
// Bei Dichte p ist die Zelle bewohnt, wenn u < p ("uniform coupling") –
// dadurch wächst die Bevölkerung beim Schieben des Reglers monoton.

export type Lattice = 4 | 6 | 8;

/** Kritische Dichten der Site-Perkolation. */
export const P_C: Record<Lattice, number> = {
  4: 0.592746, // Quadratgitter, von-Neumann-Nachbarschaft (nur numerisch bekannt)
  6: 0.5, // Dreiecksgitter (exakt)
  8: 0.407254, // Quadratgitter, Moore-Nachbarschaft (= 1 - 0.592746)
};

export function randomField(n: number): Float32Array {
  const u = new Float32Array(n * n);
  for (let i = 0; i < u.length; i++) u[i] = Math.random();
  return u;
}

/** Schreibt die Nachbarn von Zelle i nach out, gibt deren Anzahl zurück. */
export function neighbours(i: number, n: number, lattice: Lattice, out: Int32Array): number {
  const r = (i / n) | 0;
  const c = i - r * n;
  let k = 0;
  const up = r > 0, down = r < n - 1, left = c > 0, right = c < n - 1;
  if (up) out[k++] = i - n;
  if (down) out[k++] = i + n;
  if (left) out[k++] = i - 1;
  if (right) out[k++] = i + 1;
  if (lattice === 8) {
    if (up && left) out[k++] = i - n - 1;
    if (up && right) out[k++] = i - n + 1;
    if (down && left) out[k++] = i + n - 1;
    if (down && right) out[k++] = i + n + 1;
  } else if (lattice === 6) {
    // Versetzte Zeilen: ungerade Zeilen sind um eine halbe Zelle nach rechts verschoben.
    if (r & 1) {
      if (up && right) out[k++] = i - n + 1;
      if (down && right) out[k++] = i + n + 1;
    } else {
      if (up && left) out[k++] = i - n - 1;
      if (down && left) out[k++] = i + n - 1;
    }
  }
  return k;
}

export interface Clusters {
  label: Int32Array; // -1 = leer
  sizes: number[];
  spanning: boolean[]; // verbindet oben-unten oder links-rechts
  largest: number; // Index des größten Clusters, -1 falls keiner
  population: number;
}

export function findClusters(u: Float32Array, n: number, p: number, lattice: Lattice): Clusters {
  const label = new Int32Array(n * n).fill(-1);
  const sizes: number[] = [];
  const spanning: boolean[] = [];
  const stack = new Int32Array(n * n);
  const nb = new Int32Array(8);
  let largest = -1, population = 0;
  for (let s = 0; s < label.length; s++) {
    if (u[s] >= p || label[s] !== -1) continue;
    const id = sizes.length;
    let sp = 0, size = 0, edges = 0;
    stack[sp++] = s;
    label[s] = id;
    while (sp > 0) {
      const i = stack[--sp];
      size++;
      const r = (i / n) | 0, c = i - r * n;
      if (r === 0) edges |= 1;
      if (r === n - 1) edges |= 2;
      if (c === 0) edges |= 4;
      if (c === n - 1) edges |= 8;
      const k = neighbours(i, n, lattice, nb);
      for (let j = 0; j < k; j++) {
        const q = nb[j];
        if (u[q] < p && label[q] === -1) {
          label[q] = id;
          stack[sp++] = q;
        }
      }
    }
    sizes.push(size);
    spanning.push((edges & 3) === 3 || (edges & 12) === 12);
    population += size;
    if (largest < 0 || size > sizes[largest]) largest = id;
  }
  return { label, sizes, spanning, largest, population };
}

/** Schrittweise Zombie-Ausbreitung (BFS-Wellen) mit optionaler Biss-Wahrscheinlichkeit. */
export class Outbreak {
  /** Welle, in der die Zelle infiziert wurde; -1 = nicht infiziert. */
  wave: Int32Array;
  frontier: number[] = [];
  step = 0;
  infected = 0;
  private edges = 0;
  private nb = new Int32Array(8);

  constructor(
    private u: Float32Array,
    private n: number,
    private p: number,
    private lattice: Lattice,
    private bite: number,
  ) {
    this.wave = new Int32Array(n * n).fill(-1);
  }

  get active(): boolean {
    return this.frontier.length > 0;
  }

  /** Hat die Infektion gegenüberliegende Kartenränder erreicht? */
  get crossed(): boolean {
    return (this.edges & 3) === 3 || (this.edges & 12) === 12;
  }

  infect(i: number): boolean {
    if (this.u[i] >= this.p || this.wave[i] !== -1) return false;
    this.mark(i);
    this.frontier.push(i);
    return true;
  }

  private mark(i: number) {
    const n = this.n;
    this.wave[i] = this.step;
    this.infected++;
    const r = (i / n) | 0, c = i - r * n;
    if (r === 0) this.edges |= 1;
    if (r === n - 1) this.edges |= 2;
    if (c === 0) this.edges |= 4;
    if (c === n - 1) this.edges |= 8;
  }

  advance() {
    this.step++;
    const next: number[] = [];
    for (const i of this.frontier) {
      const k = neighbours(i, this.n, this.lattice, this.nb);
      for (let j = 0; j < k; j++) {
        const q = this.nb[j];
        if (this.u[q] < this.p && this.wave[q] === -1 && (this.bite >= 1 || Math.random() < this.bite)) {
          this.mark(q);
          next.push(q);
        }
      }
    }
    this.frontier = next;
  }
}

export interface SweepResult {
  ps: number[];
  spanProb: number[]; // P(durchgehender Cluster oben–unten)
  largestFrac: number[]; // mittlerer Anteil des größten Clusters an der Bevölkerung
  trials: number;
}

/**
 * Newman-Ziff-Verfahren: Zellen in zufälliger Reihenfolge besetzen und mit
 * Union-Find verfolgen – ein Durchlauf liefert Messwerte für alle Dichten.
 */
export class Sweep {
  readonly result: SweepResult;
  private spanCount: Float64Array;
  private largestSum: Float64Array;
  private ks: Int32Array;

  constructor(readonly n: number, private lattice: Lattice, ps: number[]) {
    this.result = { ps, spanProb: ps.map(() => 0), largestFrac: ps.map(() => 0), trials: 0 };
    this.spanCount = new Float64Array(ps.length);
    this.largestSum = new Float64Array(ps.length);
    this.ks = Int32Array.from(ps, (p) => Math.round(p * n * n));
  }

  runTrial() {
    const n = this.n, total = n * n;
    const TOP = total, BOTTOM = total + 1;
    const parent = new Int32Array(total + 2);
    const size = new Int32Array(total + 2);
    const occupied = new Uint8Array(total);
    const order = new Int32Array(total);
    for (let i = 0; i < total; i++) order[i] = i;
    for (let i = total - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      const t = order[i]; order[i] = order[j]; order[j] = t;
    }
    for (let i = 0; i < total + 2; i++) parent[i] = i;
    const find = (x: number) => {
      while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
      return x;
    };
    let maxSize = 0;
    const union = (a: number, b: number) => {
      a = find(a); b = find(b);
      if (a === b) return;
      if (size[a] < size[b]) { const t = a; a = b; b = t; }
      parent[b] = a;
      size[a] += size[b];
      if (size[a] > maxSize) maxSize = size[a];
    };
    const nb = new Int32Array(8);
    let m = 0;
    for (let k = 0; k <= total && m < this.ks.length; k++) {
      // Zustand mit k besetzten Zellen auswerten
      while (m < this.ks.length && this.ks[m] === k) {
        if (find(TOP) === find(BOTTOM) && k > 0) this.spanCount[m]++;
        if (k > 0) this.largestSum[m] += maxSize / k;
        m++;
      }
      if (k === total) break;
      const i = order[k];
      occupied[i] = 1;
      size[i] = 1;
      if (maxSize < 1) maxSize = 1;
      const cnt = neighbours(i, n, this.lattice, nb);
      for (let j = 0; j < cnt; j++) if (occupied[nb[j]]) union(i, nb[j]);
      if (i < n) union(i, TOP);
      if (i >= total - n) union(i, BOTTOM);
    }
    const r = this.result;
    r.trials++;
    for (let j = 0; j < r.ps.length; j++) {
      r.spanProb[j] = this.spanCount[j] / r.trials;
      r.largestFrac[j] = this.largestSum[j] / r.trials;
    }
  }
}
