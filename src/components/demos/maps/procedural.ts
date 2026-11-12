/**
 * Seeded procedural environments, rasterised to the occupancy convention of the planning demos:
 * row-major, 0 free – 255 occupied, cell (col, row) centred at ((col + 0.5) * res, (row + 0.5) * res) m.
 */

export interface ProceduralMap {
  width: number;
  height: number;
  occupancy: Uint8Array;
  /** Suggested start and goal (m), in free space and far apart. */
  start: [number, number];
  goal: [number, number];
}

/** mulberry32: small, fast, seedable PRNG returning floats in [0, 1). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- Maze --------------------------------------------------------------------

export interface MazeParams {
  /** Maze size, in maze cells. */
  cols: number;
  rows: number;
  /** Range of the column widths and row heights (m, wall included), drawn independently per column and row. */
  minCellSize: number;
  maxCellSize: number;
  wallThickness: number;
  /** Raster resolution (m per occupancy cell). */
  resolution: number;
  /** Number of rectangular rooms carved after the perfect maze. */
  rooms: number;
  /** Probability of removing each remaining interior wall; 0 keeps a perfect maze (no loops). */
  loopFraction: number;
  seed: number;
}

export const DEFAULT_MAZE_PARAMS: MazeParams = {
  cols: 14,
  rows: 9,
  minCellSize: 2,
  maxCellSize: 4,
  wallThickness: 0.3,
  resolution: 0.1,
  rooms: 3,
  loopFraction: 0.12,
  seed: 1,
};

/**
 * A perfect maze (randomised depth-first search) opened up by carving rectangular rooms and removing a
 * fraction of the remaining walls, which creates loops. Random column and row sizes vary the passage widths.
 */
export function generateMaze(params: MazeParams): ProceduralMap {
  const { cols, rows, wallThickness, resolution } = params;
  const random = rng(params.seed);
  const randInt = (n: number) => Math.floor(random() * n);

  // vertical[r * (cols + 1) + c]: wall on the left of cell (c, r); horizontal[r * cols + c]: wall above it.
  const vertical = new Uint8Array((cols + 1) * rows).fill(1);
  const horizontal = new Uint8Array(cols * (rows + 1)).fill(1);

  // Perfect maze: iterative randomised depth-first search.
  const visited = new Uint8Array(cols * rows);
  const stack: [number, number][] = [[randInt(cols), randInt(rows)]];
  visited[stack[0][1] * cols + stack[0][0]] = 1;
  while (stack.length) {
    const [c, r] = stack[stack.length - 1];
    const next = (
      [
        [c - 1, r],
        [c + 1, r],
        [c, r - 1],
        [c, r + 1],
      ] as [number, number][]
    ).filter(([nc, nr]) => nc >= 0 && nc < cols && nr >= 0 && nr < rows && !visited[nr * cols + nc]);
    if (!next.length) {
      stack.pop();
      continue;
    }
    const [nc, nr] = next[randInt(next.length)];
    if (nc !== c) vertical[r * (cols + 1) + Math.max(c, nc)] = 0;
    else horizontal[Math.max(r, nr) * cols + c] = 0;
    visited[nr * cols + nc] = 1;
    stack.push([nc, nr]);
  }

  // Rooms: clear every interior wall of a random rectangle of 2–4 × 2–3 cells.
  for (let k = 0; k < params.rooms; k++) {
    const w = Math.min(cols, 2 + randInt(3));
    const h = Math.min(rows, 2 + randInt(2));
    const c0 = randInt(cols - w + 1);
    const r0 = randInt(rows - h + 1);
    for (let r = r0; r < r0 + h; r++) {
      for (let c = c0; c < c0 + w; c++) {
        if (c > c0) vertical[r * (cols + 1) + c] = 0;
        if (r > r0) horizontal[r * cols + c] = 0;
      }
    }
  }

  // Loops: drop a fraction of the remaining interior walls.
  for (let r = 0; r < rows; r++) {
    for (let c = 1; c < cols; c++) if (random() < params.loopFraction) vertical[r * (cols + 1) + c] = 0;
  }
  for (let r = 1; r < rows; r++) {
    for (let c = 0; c < cols; c++) if (random() < params.loopFraction) horizontal[r * cols + c] = 0;
  }

  // Wall lines (raster cells) at the cumulative column / row sizes.
  const lines = (n: number) => {
    const out = [0];
    for (let i = 0; i < n; i++) {
      const size = params.minCellSize + random() * (params.maxCellSize - params.minCellSize);
      out.push(out[i] + Math.round(size / resolution));
    }
    return out;
  };
  const xs = lines(cols);
  const ys = lines(rows);
  const thick = Math.max(1, Math.round(wallThickness / resolution));
  const width = xs[cols] + thick;
  const height = ys[rows] + thick;
  const occupancy = new Uint8Array(width * height);
  const fill = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y < y1; y++) occupancy.fill(255, y * width + x0, y * width + x1);
  };
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c <= cols; c++) {
      if (vertical[r * (cols + 1) + c]) fill(xs[c], ys[r], xs[c] + thick, ys[r + 1] + thick);
    }
  }
  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (horizontal[r * cols + c]) fill(xs[c], ys[r], xs[c + 1] + thick, ys[r] + thick);
    }
  }

  const cellCenter = (c: number, r: number): [number, number] => [
    ((xs[c] + xs[c + 1] + thick) / 2) * resolution,
    ((ys[r] + ys[r + 1] + thick) / 2) * resolution,
  ];
  return { width, height, occupancy, start: cellCenter(0, 0), goal: cellCenter(cols - 1, rows - 1) };
}

// --- Cave --------------------------------------------------------------------

export interface CaveParams {
  /** Map size (m). */
  width: number;
  height: number;
  /** Cellular automaton cell size (m): sets the scale of the cave features. */
  cellSize: number;
  /** Initial probability of a cell being rock. */
  fillProbability: number;
  /** Smoothing iterations of the 4–5 rule. */
  iterations: number;
  /** Raster resolution (m per occupancy cell). */
  resolution: number;
  seed: number;
}

export const DEFAULT_CAVE_PARAMS: CaveParams = {
  width: 42,
  height: 27,
  cellSize: 0.75,
  fillProbability: 0.45,
  iterations: 5,
  resolution: 0.1,
  seed: 1,
};

/**
 * Cellular-automaton cave: random rock, smoothed with the 4–5 rule (a rock cell stays rock with ≥ 4 rock
 * neighbours, a free cell turns to rock with ≥ 5), restricted to its largest connected free region, then
 * upsampled and blurred so walls are smooth rather than blocky.
 */
export function generateCave(params: CaveParams): ProceduralMap {
  const random = rng(params.seed);
  const cw = Math.round(params.width / params.cellSize);
  const ch = Math.round(params.height / params.cellSize);
  const border = (x: number, y: number) => x === 0 || y === 0 || x === cw - 1 || y === ch - 1;

  let rock = new Uint8Array(cw * ch);
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) rock[y * cw + x] = border(x, y) || random() < params.fillProbability ? 1 : 0;
  }
  for (let k = 0; k < params.iterations; k++) {
    const next = new Uint8Array(cw * ch);
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        if (border(x, y)) {
          next[y * cw + x] = 1;
          continue;
        }
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) n += rock[(y + dy) * cw + x + dx];
        next[y * cw + x] = n >= (rock[y * cw + x] ? 4 : 5) ? 1 : 0;
      }
    }
    rock = next;
  }

  // Keep the largest 4-connected free region; fill the others.
  const region = new Int32Array(cw * ch).fill(-1);
  let best = -1;
  let bestSize = 0;
  for (let seed = 0, id = 0; seed < cw * ch; seed++) {
    if (rock[seed] || region[seed] >= 0) continue;
    const queue = [seed];
    region[seed] = id;
    for (let i = 0; i < queue.length; i++) {
      const p = queue[i];
      for (const q of [p - 1, p + 1, p - cw, p + cw]) {
        if (!rock[q] && region[q] < 0) {
          region[q] = id;
          queue.push(q);
        }
      }
    }
    if (queue.length > bestSize) [best, bestSize] = [id, queue.length];
    id++;
  }
  for (let i = 0; i < cw * ch; i++) if (region[i] !== best) rock[i] = 1;

  // Start / goal: interior free cells (all 8 neighbours free) closest to opposite corners.
  const interior = (x: number, y: number) => {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (rock[(y + dy) * cw + x + dx]) return false;
    return true;
  };
  const nearest = (cx: number, cy: number): [number, number] => {
    let pick: [number, number] = [0, 0];
    let bestDist = Infinity;
    for (let y = 1; y < ch - 1; y++) {
      for (let x = 1; x < cw - 1; x++) {
        const d = (x - cx) ** 2 + (y - cy) ** 2;
        if (d < bestDist && interior(x, y)) [pick, bestDist] = [[(x + 0.5) * params.cellSize, (y + 0.5) * params.cellSize], d];
      }
    }
    return pick;
  };

  // Bilinear upsampling of the rock field, blurred to round off the automaton's staircase edges, then
  // thresholded at 0.5. Blocky walls would otherwise grow spurious skeleton branches at every step.
  const res = params.resolution;
  const width = Math.round((cw * params.cellSize) / res);
  const height = Math.round((ch * params.cellSize) / res);
  let field = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    const fy = Math.min(ch - 1, Math.max(0, ((y + 0.5) * res) / params.cellSize - 0.5));
    const y0 = Math.min(ch - 2, Math.floor(fy));
    const ty = fy - y0;
    for (let x = 0; x < width; x++) {
      const fx = Math.min(cw - 1, Math.max(0, ((x + 0.5) * res) / params.cellSize - 0.5));
      const x0 = Math.min(cw - 2, Math.floor(fx));
      const tx = fx - x0;
      const top = rock[y0 * cw + x0] * (1 - tx) + rock[y0 * cw + x0 + 1] * tx;
      const bottom = rock[(y0 + 1) * cw + x0] * (1 - tx) + rock[(y0 + 1) * cw + x0 + 1] * tx;
      field[y * width + x] = top * (1 - ty) + bottom * ty;
    }
  }
  // Separable box blur over about one automaton cell, two passes per axis (≈ Gaussian).
  const radius = Math.max(1, Math.round(params.cellSize / res / 2));
  for (let pass = 0; pass < 4; pass++) {
    const [n, lines, step, lineStep] = pass % 2 === 0 ? [width, height, 1, width] : [height, width, width, 1];
    const out = new Float32Array(width * height);
    for (let l = 0; l < lines; l++) {
      const base = l * lineStep;
      for (let i = 0; i < n; i++) {
        let sum = 0;
        for (let k = i - radius; k <= i + radius; k++) sum += field[base + Math.min(n - 1, Math.max(0, k)) * step];
        out[base + i * step] = sum / (2 * radius + 1);
      }
    }
    field = out;
  }
  const occupancy = new Uint8Array(width * height);
  for (let i = 0; i < occupancy.length; i++) if (field[i] >= 0.5) occupancy[i] = 255;

  return { width, height, occupancy, start: nearest(0, 0), goal: nearest(cw, ch) };
}
