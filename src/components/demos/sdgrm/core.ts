/**
 * Skeleton Disk-Graph Roadmap (SDGRM), ported from the reference Python implementation
 * (github.com/thibnoel/skel_disk_graph_roadmap) for in-browser demos.
 *
 * Grid convention: row-major, cell (col, row) has index row * width + col.
 * World convention: meters, cell centers at ((col + 0.5) * res, (row + 0.5) * res).
 */

export interface MapParams {
  /** Cell size in meters. */
  resolution: number;
  /** Occupancy in [0, 1] above which a cell is an obstacle. */
  obstacleThreshold: number;
  /** Dilation then erosion distance (m) used to smooth obstacles. */
  smoothingDist: number;
  /** Offset (m) subtracted from the signed distance field. */
  distOffset: number;
  /** Gradient flux threshold below which a cell is a skeleton candidate. */
  fluxThreshold: number;
  /** Skeleton cells closer than this (m, offset SDF) to obstacles are dropped. */
  skeletonMinDist: number;
}

export interface RoadmapParams {
  /** Minimum radius (m) of the bubbles placed on skeleton junctions. */
  minJunctionRadius: number;
  /** Minimum radius (m) of the second-pass bubbles; also the edge midpoint clearance. */
  minBubbleRadius: number;
  /** Connected components with fewer nodes are discarded. */
  minComponentSize: number;
}

export const DEFAULT_MAP_PARAMS: MapParams = {
  resolution: 0.1,
  obstacleThreshold: 0.4,
  smoothingDist: 0.6,
  distOffset: 0.2,
  fluxThreshold: -1e-2,
  skeletonMinDist: 0.2,
};

export const DEFAULT_ROADMAP_PARAMS: RoadmapParams = {
  minJunctionRadius: 0.6,
  minBubbleRadius: 0.4,
  minComponentSize: 4,
};

export interface Bubble {
  x: number;
  y: number;
  r: number;
}

/** Signed distance grid: everything roadmap construction and planning need. */
export interface DistanceGrid {
  width: number;
  height: number;
  resolution: number;
  /** Signed distance (m) minus the offset; negative inside obstacles. Float64 so threshold tests match the reference. */
  dist: Float64Array;
}

export interface DistanceField extends DistanceGrid {
  /** Unit gradient of the distance field (zero where undefined). */
  gx: Float32Array;
  gy: Float32Array;
}

export interface Roadmap {
  bubbles: Bubble[];
  edges: [number, number][];
}

export interface PipelineResult {
  obstacles: Uint8Array;
  field: DistanceField;
  skeleton: Uint8Array;
  roadmap: Roadmap;
  timings: { distance: number; skeleton: number; roadmap: number };
}

const INF = 1e20;

// ---------------------------------------------------------------------------
// Obstacles preprocessing

/** Binary dilation (op = 1) or erosion (op = 0) with a square kernel; out-of-bounds cells are ignored. */
function morph(src: Uint8Array, width: number, height: number, half: number, op: 0 | 1): Uint8Array {
  const tmp = new Uint8Array(src.length);
  const out = new Uint8Array(src.length);
  const hit = op; // value that, if present in the window, decides the result
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let v = 1 - hit;
      const x0 = Math.max(0, x - half);
      const x1 = Math.min(width - 1, x + half);
      for (let k = x0; k <= x1; k++) {
        if (src[y * width + k] === hit) {
          v = hit;
          break;
        }
      }
      tmp[y * width + x] = v;
    }
  }
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      let v = 1 - hit;
      const y0 = Math.max(0, y - half);
      const y1 = Math.min(height - 1, y + half);
      for (let k = y0; k <= y1; k++) {
        if (tmp[k * width + x] === hit) {
          v = hit;
          break;
        }
      }
      out[y * width + x] = v;
    }
  }
  return out;
}

/** Thresholds occupancy (0-255) and closes small gaps between obstacles (dilation then erosion). */
export function extractObstacles(occupancy: Uint8Array, width: number, height: number, params: MapParams): Uint8Array {
  const threshold = params.obstacleThreshold * 255;
  const binary = new Uint8Array(occupancy.length);
  for (let i = 0; i < occupancy.length; i++) binary[i] = occupancy[i] > threshold ? 1 : 0;
  let kernel = Math.floor(params.smoothingDist / params.resolution);
  kernel += 1 - (kernel % 2);
  const half = (kernel - 1) / 2;
  if (half === 0) return binary;
  return morph(morph(binary, width, height, half, 1), width, height, half, 0);
}

// ---------------------------------------------------------------------------
// Euclidean distance transform with nearest-feature tracking (Felzenszwalb & Huttenlocher)

interface Edt {
  /** Distance in cells to the nearest feature cell (INF if none). */
  dist: Float32Array;
  /** Index of the nearest feature cell (-1 if none). */
  nearest: Int32Array;
}

function edt(features: Uint8Array, featureValue: number, width: number, height: number): Edt {
  const n = width * height;
  // Pass 1, per column: distance to the nearest feature row.
  const colDist = new Float64Array(n);
  const colRow = new Int32Array(n);
  for (let x = 0; x < width; x++) {
    let last = -1;
    for (let y = 0; y < height; y++) {
      if (features[y * width + x] === featureValue) last = y;
      colRow[y * width + x] = last;
    }
    last = -1;
    for (let y = height - 1; y >= 0; y--) {
      const i = y * width + x;
      if (features[i] === featureValue) last = y;
      const up = colRow[i];
      let best = -1;
      if (up >= 0) best = up;
      if (last >= 0 && (best < 0 || last - y < y - best)) best = last;
      colRow[i] = best;
      colDist[i] = best < 0 ? INF : (y - best) * (y - best);
    }
  }

  // Pass 2, per row: lower envelope of parabolas f(q) = colDist(q).
  const dist = new Float32Array(n);
  const nearest = new Int32Array(n);
  const v = new Int32Array(width);
  const z = new Float64Array(width + 1);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    let k = -1;
    for (let q = 0; q < width; q++) {
      const fq = colDist[row + q];
      if (fq >= INF) continue;
      if (k < 0) {
        k = 0;
        v[0] = q;
        z[0] = -INF;
        z[1] = INF;
        continue;
      }
      let s: number;
      for (;;) {
        const p = v[k];
        s = (fq + q * q - (colDist[row + p] + p * p)) / (2 * (q - p));
        if (s <= z[k] && k > 0) k--;
        else break;
      }
      if (s <= z[k]) {
        // k === 0 and the new parabola dominates the first one entirely.
        v[0] = q;
        z[0] = -INF;
        z[1] = INF;
        continue;
      }
      k++;
      v[k] = q;
      z[k] = s;
      z[k + 1] = INF;
    }
    if (k < 0) {
      for (let x = 0; x < width; x++) {
        dist[row + x] = INF;
        nearest[row + x] = -1;
      }
      continue;
    }
    let j = 0;
    for (let x = 0; x < width; x++) {
      while (z[j + 1] < x) j++;
      const p = v[j];
      const d2 = (x - p) * (x - p) + colDist[row + p];
      dist[row + x] = Math.sqrt(d2);
      nearest[row + x] = colRow[row + p] * width + p;
    }
  }
  return { dist, nearest };
}

/** Signed distance field (m, minus offset) and its unit gradient, from binary obstacles. */
export function computeDistanceField(obstacles: Uint8Array, width: number, height: number, params: MapParams): DistanceField {
  const pos = edt(obstacles, 1, width, height); // free cells -> nearest obstacle
  const neg = edt(obstacles, 0, width, height); // obstacle cells -> nearest free cell
  const n = width * height;
  const dist = new Float64Array(n);
  const gx = new Float32Array(n);
  const gy = new Float32Array(n);
  const res = params.resolution;
  for (let i = 0; i < n; i++) {
    const x = i % width;
    const y = (i - x) / width;
    const free = obstacles[i] === 0;
    const e = free ? pos : neg;
    const d = e.dist[i];
    const sign = free ? 1 : -1;
    dist[i] = (d >= INF ? INF : sign * d * res) - params.distOffset;
    const nearestIdx = e.nearest[i];
    if (nearestIdx >= 0 && d > 0) {
      const nx = nearestIdx % width;
      const ny = (nearestIdx - nx) / width;
      // Points towards increasing signed distance in both regions.
      gx[i] = (sign * (x - nx)) / d;
      gy[i] = (sign * (y - ny)) / d;
    }
  }
  return { width, height, resolution: res, dist, gx, gy };
}

// ---------------------------------------------------------------------------
// Skeleton extraction: gradient flux + thinning

const NEIGHBORS_8: [number, number][] = [
  [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1],
];

/** Outward flux of the distance gradient through the 8-neighborhood; strongly negative on the skeleton. */
export function gradientFlux(field: DistanceField): Float32Array {
  const { width, height, gx, gy } = field;
  const flux = new Float32Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let phi = 0;
      for (const [dx, dy] of NEIGHBORS_8) {
        const j = (y + dy) * width + (x + dx);
        const norm = dx !== 0 && dy !== 0 ? Math.SQRT1_2 : 1;
        phi += norm * (dx * gx[j] + dy * gy[j]);
      }
      flux[y * width + x] = phi / (2 * Math.PI);
    }
  }
  return flux;
}

// Lookup tables of the thinning algorithm of Lam, Lee & Suen (1992), as used by scikit-image's thin().
const [THIN_LUT_1, THIN_LUT_2] = (() => {
  const bit = (n: number, i: number) => ((n >> (i % 8)) & 1) === 1;
  const g1 = (n: number) => {
    let s = 0;
    for (const i of [0, 2, 4, 6]) if (!bit(n, i) && (bit(n, i + 1) || bit(n, i + 2))) s++;
    return s === 1;
  };
  const g2 = (n: number) => {
    let n1 = 0;
    let n2 = 0;
    for (const k of [1, 3, 5, 7]) {
      if (bit(n, k) || bit(n, k - 1)) n1++;
      if (bit(n, k) || bit(n, k + 1)) n2++;
    }
    const m = Math.min(n1, n2);
    return m === 2 || m === 3;
  };
  const g3 = (n: number) => !((bit(n, 1) || bit(n, 2) || !bit(n, 7)) && bit(n, 0));
  const g3p = (n: number) => !((bit(n, 5) || bit(n, 6) || !bit(n, 3)) && bit(n, 4));
  const lut1 = new Uint8Array(256);
  const lut2 = new Uint8Array(256);
  for (let n = 0; n < 256; n++) {
    const g12 = g1(n) && g2(n);
    lut1[n] = g12 && g3(n) ? 1 : 0;
    lut2[n] = g12 && g3p(n) ? 1 : 0;
  }
  return [lut1, lut2];
})();

/** Thins a binary image (in place) down to a one-pixel-wide skeleton. */
export function thin(img: Uint8Array, width: number, height: number): Uint8Array {
  const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < width && y < height ? img[y * width + x] : 0);
  const toDelete: number[] = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (const lut of [THIN_LUT_1, THIN_LUT_2]) {
      toDelete.length = 0;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (!img[y * width + x]) continue;
          // Neighborhood code, bit order: E, NE, N, NW, W, SW, S, SE (rows grow downwards).
          const code =
            at(x + 1, y) |
            (at(x + 1, y - 1) << 1) |
            (at(x, y - 1) << 2) |
            (at(x - 1, y - 1) << 3) |
            (at(x - 1, y) << 4) |
            (at(x - 1, y + 1) << 5) |
            (at(x, y + 1) << 6) |
            (at(x + 1, y + 1) << 7);
          if (lut[code]) toDelete.push(y * width + x);
        }
      }
      for (const i of toDelete) img[i] = 0;
      if (toDelete.length) changed = true;
    }
  }
  return img;
}

export function extractSkeleton(field: DistanceField, params: MapParams): Uint8Array {
  const { width, height, dist } = field;
  const flux = gradientFlux(field);
  const skeleton = new Uint8Array(width * height);
  for (let i = 0; i < flux.length; i++) skeleton[i] = flux[i] < params.fluxThreshold ? 1 : 0;
  thin(skeleton, width, height);
  for (let i = 0; i < skeleton.length; i++) if (dist[i] <= params.skeletonMinDist) skeleton[i] = 0;
  return skeleton;
}

// ---------------------------------------------------------------------------
// Disk-graph construction

/** Cell index of a world position, with the reference implementation's rounding. */
export function worldToCell(field: DistanceGrid, x: number, y: number): number {
  const cx = Math.floor(x / field.resolution - 0.5);
  const cy = Math.floor(y / field.resolution - 0.5);
  if (cx < 0 || cy < 0 || cx >= field.width || cy >= field.height) return -1;
  return cy * field.width + cx;
}

export function distanceAt(field: DistanceGrid, x: number, y: number): number {
  const i = worldToCell(field, x, y);
  return i < 0 ? Number.NaN : field.dist[i];
}

/** Radius-descending bubble placement: the largest remaining candidate becomes a bubble and closes its neighbors. */
function placeBubbles(candidates: number[], field: DistanceGrid, minRadius: number): Bubble[] {
  const { width, resolution: res, dist } = field;
  const order = [...candidates].sort((a, b) => dist[b] - dist[a]);
  const px = order.map((i) => ((i % width) + 0.5) * res);
  const py = order.map((i) => (Math.floor(i / width) + 0.5) * res);
  const active = new Uint8Array(order.length).fill(1);
  const bubbles: Bubble[] = [];
  for (let k = 0; k < order.length; k++) {
    if (!active[k]) continue;
    const r = dist[order[k]];
    if (!(r > minRadius)) break; // candidates are sorted, all remaining ones are smaller
    const b = { x: px[k], y: py[k], r };
    bubbles.push(b);
    const closeR2 = (0.9 * r) ** 2;
    for (let m = k; m < order.length; m++) {
      if (active[m] && (px[m] - b.x) ** 2 + (py[m] - b.y) ** 2 < closeR2) active[m] = 0;
    }
  }
  return bubbles;
}

function skeletonJunctions(skeleton: Uint8Array, width: number, height: number): number[] {
  const junctions: number[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!skeleton[y * width + x]) continue;
      let count = 0;
      for (const [dx, dy] of NEIGHBORS_8) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < width && ny < height && skeleton[ny * width + nx]) count++;
      }
      if (count > 2) junctions.push(y * width + x);
    }
  }
  return junctions;
}

/** Clears the cells strictly inside each bubble (radius shrunk by `padCells`). */
function maskBubbles(mask: Uint8Array, field: DistanceGrid, bubbles: Bubble[], padCells: number) {
  const { width, height, resolution: res } = field;
  for (const b of bubbles) {
    const c = worldToCell(field, b.x, b.y);
    const cx = c % width;
    const cy = Math.floor(c / width);
    const r = b.r / res + padCells;
    if (r <= 0) continue;
    const ri = Math.ceil(r);
    for (let y = Math.max(0, cy - ri); y <= Math.min(height - 1, cy + ri); y++) {
      for (let x = Math.max(0, cx - ri); x <= Math.min(width - 1, cx + ri); x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 < r * r) mask[y * width + x] = 0;
      }
    }
  }
}

/** Edge condition: overlapping bubbles whose lens (radical-axis point) keeps `minClearance` to obstacles. */
function edgeValid(a: Bubble, b: Bubble, field: DistanceGrid, minClearance: number): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d2 = dx * dx + dy * dy;
  const d = Math.sqrt(d2);
  if (!(a.r + b.r > d)) return false;
  if (d < a.r || d < b.r) return true;
  const t = 0.5 * (1 + ((a.r - b.r) * (a.r + b.r)) / d2);
  return distanceAt(field, a.x + t * dx, a.y + t * dy) > minClearance;
}

export function buildRoadmap(field: DistanceGrid, skeleton: Uint8Array, params: RoadmapParams): Roadmap {
  const { width, height, dist } = field;
  const masked = new Uint8Array(skeleton.length);
  for (let i = 0; i < skeleton.length; i++) masked[i] = skeleton[i] && dist[i] > params.minBubbleRadius ? 1 : 0;

  // First pass on skeleton junctions, second pass on the remaining skeleton.
  const junctionBubbles = placeBubbles(skeletonJunctions(masked, width, height), field, params.minJunctionRadius);
  maskBubbles(masked, field, junctionBubbles, -2);
  const rest: number[] = [];
  for (let i = 0; i < masked.length; i++) if (masked[i]) rest.push(i);
  const bubbles = junctionBubbles.concat(placeBubbles(rest, field, params.minBubbleRadius));

  const edges: [number, number][] = [];
  for (let i = 0; i < bubbles.length; i++) {
    for (let j = i + 1; j < bubbles.length; j++) {
      if (edgeValid(bubbles[i], bubbles[j], field, params.minBubbleRadius)) edges.push([i, j]);
    }
  }
  return pruneSmallComponents({ bubbles, edges }, params.minComponentSize);
}

function pruneSmallComponents(roadmap: Roadmap, minSize: number): Roadmap {
  const n = roadmap.bubbles.length;
  const parent = Int32Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  for (const [a, b] of roadmap.edges) parent[find(a)] = find(b);
  const size = new Int32Array(n);
  for (let i = 0; i < n; i++) size[find(i)]++;
  const remap = new Int32Array(n).fill(-1);
  const bubbles: Bubble[] = [];
  for (let i = 0; i < n; i++) {
    if (size[find(i)] >= minSize) {
      remap[i] = bubbles.length;
      bubbles.push(roadmap.bubbles[i]);
    }
  }
  const edges = roadmap.edges
    .filter(([a]) => remap[a] >= 0)
    .map(([a, b]) => [remap[a], remap[b]] as [number, number]);
  return { bubbles, edges };
}

export function runPipeline(
  occupancy: Uint8Array,
  width: number,
  height: number,
  mapParams: MapParams,
  roadmapParams: RoadmapParams,
): PipelineResult {
  const t0 = performance.now();
  const obstacles = extractObstacles(occupancy, width, height, mapParams);
  const field = computeDistanceField(obstacles, width, height, mapParams);
  const t1 = performance.now();
  const skeleton = extractSkeleton(field, mapParams);
  const t2 = performance.now();
  const roadmap = buildRoadmap(field, skeleton, roadmapParams);
  const t3 = performance.now();
  return { obstacles, field, skeleton, roadmap, timings: { distance: t1 - t0, skeleton: t2 - t1, roadmap: t3 - t2 } };
}

// ---------------------------------------------------------------------------
// Path planning

export interface BubblePath {
  points: Bubble[];
  length: number;
}

/** Closest node whose bubble, inflated by the local clearance, contains the position. */
function attachNode(roadmap: Roadmap, field: DistanceGrid, x: number, y: number): number {
  const local = distanceAt(field, x, y);
  if (!(local > 0)) return -1;
  let best = -1;
  let bestD = Infinity;
  roadmap.bubbles.forEach((b, i) => {
    const d = Math.hypot(b.x - x, b.y - y);
    if (d < b.r + local && d < bestD) {
      best = i;
      bestD = d;
    }
  });
  return best;
}

export function planPath(roadmap: Roadmap, field: DistanceGrid, start: [number, number], goal: [number, number]): BubblePath | null {
  const s = attachNode(roadmap, field, ...start);
  const g = attachNode(roadmap, field, ...goal);
  if (s < 0 || g < 0) return null;

  const n = roadmap.bubbles.length;
  const adjacency: [number, number][][] = Array.from({ length: n }, () => []);
  for (const [a, b] of roadmap.edges) {
    const w = Math.hypot(roadmap.bubbles[a].x - roadmap.bubbles[b].x, roadmap.bubbles[a].y - roadmap.bubbles[b].y);
    adjacency[a].push([b, w]);
    adjacency[b].push([a, w]);
  }
  // Dijkstra; roadmaps stay in the hundreds of nodes, so a linear scan for the minimum is enough.
  const cost = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const done = new Uint8Array(n);
  cost[s] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && cost[i] < Infinity && (u < 0 || cost[i] < cost[u])) u = i;
    if (u < 0 || u === g) break;
    done[u] = 1;
    for (const [v, w] of adjacency[u]) {
      if (cost[u] + w < cost[v]) {
        cost[v] = cost[u] + w;
        prev[v] = u;
      }
    }
  }
  if (cost[g] === Infinity) return null;

  const nodes: Bubble[] = [];
  for (let u = g; u >= 0; u = prev[u]) nodes.unshift(roadmap.bubbles[u]);
  const points = [
    { x: start[0], y: start[1], r: distanceAt(field, ...start) },
    ...nodes,
    { x: goal[0], y: goal[1], r: distanceAt(field, ...goal) },
  ];
  return toPath(points);
}

function toPath(points: Bubble[]): BubblePath {
  let length = 0;
  for (let i = 1; i < points.length; i++) length += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  return { points, length };
}

export interface SmoothedPath {
  /** Minimal subset of overlapping bubbles along the raw path. */
  reduced: BubblePath;
  /** Cubic B-spline through the reduced bubbles. */
  spline: BubblePath;
}

/** Resamples a path into `n` points evenly spaced along its length, with radii from the distance field. */
function subdivide(path: BubblePath, n: number, field: DistanceGrid): Bubble[] {
  const pts = path.points;
  const out: Bubble[] = [];
  for (let k = 0; k < n; k++) {
    const target = (k / (n - 1)) * path.length;
    // Defaults to the path end, which the last sample (target === length) must hit exactly.
    let x = pts[pts.length - 1].x;
    let y = pts[pts.length - 1].y;
    let acc = 0;
    for (let i = 0; i < pts.length - 1 && target < path.length; i++) {
      const seg = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
      if (seg === 0) continue;
      if (target <= acc + seg) {
        const t = (target - acc) / seg;
        x = pts[i].x + t * (pts[i + 1].x - pts[i].x);
        y = pts[i].y + t * (pts[i + 1].y - pts[i].y);
        break;
      }
      acc += seg;
    }
    out.push({ x, y, r: distanceAt(field, x, y) });
  }
  return out;
}

/** Greedily keeps, from each kept bubble, the farthest following bubble that still overlaps it. */
function reduceBubbles(pts: Bubble[]): Bubble[] {
  if (pts.length <= 2) return pts;
  const out: Bubble[] = [];
  let current = 0;
  for (;;) {
    out.push(pts[current]);
    if (current === pts.length - 1) return out;
    let next = current + 1;
    while (
      next < pts.length &&
      pts[next].r + pts[current].r > Math.hypot(pts[next].x - pts[current].x, pts[next].y - pts[current].y)
    ) {
      next++;
    }
    next--;
    if (next === current) return out; // no overlapping successor: the path cannot be reduced further
    current = next;
  }
}

/** Uniform cubic B-spline whose control points keep each segment inside the bubbles' overlap. */
function splineThroughBubbles(pts: Bubble[], field: DistanceGrid, samplesPerSegment = 10): Bubble[] {
  type P = [number, number];
  const lerp = (a: P, b: P, t: number): P => [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
  const p = pts.map((b): P => [b.x, b.y]);
  // Transition point between consecutive bubbles, centered in their overlap.
  const m: P[] = [];
  for (let k = 0; k < p.length - 1; k++) {
    const d = Math.hypot(p[k + 1][0] - p[k][0], p[k + 1][1] - p[k][1]);
    const tb = Math.min(1, pts[k].r / d);
    const tn = Math.min(1, pts[k + 1].r / d);
    m.push(lerp(p[k], p[k + 1], tb - 0.5 * (tb + tn - 1)));
  }
  const first = p[0];
  const last = p[p.length - 1];
  const control: P[] = [lerp(first, m[0], -1 / 3), first, lerp(first, m[0], 1 / 3), lerp(first, m[0], 2 / 3)];
  for (let k = 1; k < p.length - 1; k++) {
    const b = p[k];
    control.push(
      lerp(b, m[k - 1], 2 / 3),
      lerp(b, m[k - 1], 1 / 3),
      [b[0] + (m[k - 1][0] - b[0]) / 8 + (m[k][0] - b[0]) / 8, b[1] + (m[k - 1][1] - b[1]) / 8 + (m[k][1] - b[1]) / 8],
      lerp(b, m[k], 1 / 3),
      lerp(b, m[k], 2 / 3),
    );
  }
  const mLast = m[m.length - 1];
  control.push(lerp(last, mLast, 2 / 3), lerp(last, mLast, 1 / 3), last, lerp(last, mLast, -1 / 3));

  const out: Bubble[] = [];
  for (let k = 1; k <= control.length - 3; k++) {
    const closing = k === control.length - 3;
    for (let i = 0; i < samplesPerSegment; i++) {
      const s = i / (closing ? samplesPerSegment - 1 : samplesPerSegment);
      const w0 = (1 - s) ** 3 / 6;
      const w1 = (3 * s ** 3 - 6 * s ** 2 + 4) / 6;
      const w2 = (-3 * s ** 3 + 3 * s ** 2 + 3 * s + 1) / 6;
      const w3 = s ** 3 / 6;
      const x = w0 * control[k - 1][0] + w1 * control[k][0] + w2 * control[k + 1][0] + w3 * control[k + 2][0];
      const y = w0 * control[k - 1][1] + w1 * control[k][1] + w2 * control[k + 1][1] + w3 * control[k + 2][1];
      out.push({ x, y, r: distanceAt(field, x, y) });
    }
  }
  return out;
}

/**
 * Post-processing of a roadmap path: resample it finely enough that consecutive bubbles overlap,
 * keep a minimal chain of overlapping bubbles, then fit a smooth spline through it.
 */
export function smoothPath(raw: BubblePath, field: DistanceGrid): SmoothedPath | null {
  const minRadius = Math.min(...raw.points.map((b) => b.r));
  if (!(minRadius > 0) || raw.length === 0) return null;
  const n = Math.min(20000, Math.max(5, Math.floor(raw.length / minRadius)));
  const samples = subdivide(raw, n, field);
  const reduced = reduceBubbles(samples);
  // A chain that stops before the goal means consecutive samples did not overlap.
  if (reduced.length < 2 || reduced.at(-1) !== samples.at(-1)) return null;
  return { reduced: toPath(reduced), spline: toPath(splineThroughBubbles(reduced, field)) };
}
