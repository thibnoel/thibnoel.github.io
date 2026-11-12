import intellabUrl from './maps/intellab.png?url';
import {
  DEFAULT_MAP_PARAMS,
  DEFAULT_ROADMAP_PARAMS,
  planPath,
  smoothPath,
  type BubblePath,
  type SmoothedPath,
  type DistanceGrid,
  type Roadmap,
  type RoadmapParams,
} from './core';
import type { ComputeRequest, ComputeResponse } from './worker';

type Tool = 'plan' | 'draw' | 'erase';
type Point = [number, number];

interface State {
  width: number;
  height: number;
  /** Raw occupancy (0 free – 255 occupied), edited by the user. */
  occupancy: Uint8Array;
  initialOccupancy: Uint8Array;
  grid: DistanceGrid | null;
  skeleton: Uint8Array | null;
  roadmap: Roadmap | null;
  path: BubblePath | null;
  smoothed: SmoothedPath | null;
  start: Point;
  goal: Point;
  tool: Tool;
  layers: Record<'isolines' | 'skeleton' | 'bubbles' | 'graph', boolean>;
  roadmapParams: RoadmapParams;
  requestId: number;
}

// The map encodes unknown space as occupancy ~0.1. The reference script treats it as free (threshold 0.4);
// the demo treats it as occupied so the roadmap only covers the mapped building, as in the paper figures.
const MAP_PARAMS = { ...DEFAULT_MAP_PARAMS, obstacleThreshold: 0.05 };
const RES = MAP_PARAMS.resolution;
const BRUSH_RADIUS = 0.4; // m
const ISOLINE_STEP = 1; // m
const MARKER_GRAB_PX = 14;

async function loadOccupancy(url: string) {
  const img = new Image();
  img.src = url;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const occupancy = new Uint8Array(canvas.width * canvas.height);
  for (let i = 0; i < occupancy.length; i++) {
    // Same luminance weights as OpenCV's BGR2GRAY in the reference implementation.
    const gray = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
    occupancy[i] = 255 - Math.round(gray);
  }
  return { width: canvas.width, height: canvas.height, occupancy };
}

/** Resolves a CSS color (including custom properties) to RGB components. */
function resolveColor(root: HTMLElement, variable: string): [number, number, number] {
  const probe = document.createElement('canvas').getContext('2d')!;
  probe.fillStyle = getComputedStyle(root).getPropertyValue(variable).trim() || '#000';
  probe.fillRect(0, 0, 1, 1);
  const [r, g, b] = probe.getImageData(0, 0, 1, 1).data;
  return [r, g, b];
}

export async function mountSdgrmDemo(root: HTMLElement) {
  const canvas = root.querySelector<HTMLCanvasElement>('canvas')!;
  const status = root.querySelector<HTMLElement>('[data-status]')!;
  const stats = root.querySelector<HTMLElement>('[data-stats]')!;
  const ctx = canvas.getContext('2d')!;

  const map = await loadOccupancy(intellabUrl);
  const state: State = {
    ...map,
    initialOccupancy: map.occupancy.slice(),
    grid: null,
    skeleton: null,
    roadmap: null,
    path: null,
    smoothed: null,
    start: [10, 13],
    goal: [46, 50],
    tool: 'plan',
    layers: { isolines: true, skeleton: true, bubbles: true, graph: true },
    roadmapParams: { ...DEFAULT_ROADMAP_PARAMS },
    requestId: 0,
  };

  const raster = document.createElement('canvas');
  raster.width = state.width;
  raster.height = state.height;
  const rasterCtx = raster.getContext('2d')!;
  canvas.style.aspectRatio = `${state.width} / ${state.height}`;

  // --- Rendering -----------------------------------------------------------

  let colors = readColors();
  function readColors() {
    return {
      surface: resolveColor(root, '--surface'),
      fg: resolveColor(root, '--fg'),
      muted: resolveColor(root, '--muted'),
      accent: resolveColor(root, '--accent'),
    };
  }
  const rgba = ([r, g, b]: [number, number, number], a: number) => `rgba(${r}, ${g}, ${b}, ${a})`;

  function renderRaster() {
    const image = rasterCtx.createImageData(state.width, state.height);
    const px = image.data;
    const { surface, fg, muted, accent } = colors;
    const { grid, skeleton } = state;
    for (let i = 0; i < state.occupancy.length; i++) {
      const t = state.occupancy[i] / 255;
      let c: [number, number, number] = [
        surface[0] + (fg[0] - surface[0]) * t,
        surface[1] + (fg[1] - surface[1]) * t,
        surface[2] + (fg[2] - surface[2]) * t,
      ];
      if (grid && state.layers.isolines && grid.dist[i] > 0) {
        const band = Math.floor(grid.dist[i] / ISOLINE_STEP);
        const x = i % state.width;
        const right = x + 1 < state.width ? grid.dist[i + 1] : grid.dist[i];
        const down = i + state.width < grid.dist.length ? grid.dist[i + state.width] : grid.dist[i];
        if (band !== Math.floor(right / ISOLINE_STEP) || band !== Math.floor(down / ISOLINE_STEP)) {
          c = [c[0] * 0.75 + muted[0] * 0.25, c[1] * 0.75 + muted[1] * 0.25, c[2] * 0.75 + muted[2] * 0.25];
        }
      }
      if (skeleton && state.layers.skeleton && skeleton[i]) c = accent;
      px[i * 4] = c[0];
      px[i * 4 + 1] = c[1];
      px[i * 4 + 2] = c[2];
      px[i * 4 + 3] = 255;
    }
    rasterCtx.putImageData(image, 0, 0);
  }

  /** Canvas pixels per map cell. */
  const scale = () => canvas.width / state.width;
  const toCanvas = (x: number, y: number): Point => [(x / RES) * scale(), (y / RES) * scale()];

  function draw() {
    const s = scale();
    const dpr = window.devicePixelRatio || 1;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(raster, 0, 0, canvas.width, canvas.height);
    const { roadmap, path, smoothed } = state;
    if (roadmap) {
      if (state.layers.bubbles) {
        ctx.lineWidth = dpr;
        ctx.strokeStyle = rgba(colors.fg, 0.18);
        ctx.beginPath();
        for (const b of roadmap.bubbles) {
          const [cx, cy] = toCanvas(b.x, b.y);
          ctx.moveTo(cx + (b.r / RES) * s, cy);
          ctx.arc(cx, cy, (b.r / RES) * s, 0, 2 * Math.PI);
        }
        ctx.stroke();
      }
      if (state.layers.graph) {
        ctx.lineWidth = dpr;
        ctx.strokeStyle = rgba(colors.fg, 0.75);
        ctx.beginPath();
        for (const [a, b] of roadmap.edges) {
          ctx.moveTo(...toCanvas(roadmap.bubbles[a].x, roadmap.bubbles[a].y));
          ctx.lineTo(...toCanvas(roadmap.bubbles[b].x, roadmap.bubbles[b].y));
        }
        ctx.stroke();
        ctx.fillStyle = rgba(colors.fg, 0.9);
        for (const b of roadmap.bubbles) {
          const [cx, cy] = toCanvas(b.x, b.y);
          ctx.fillRect(cx - 1.5 * dpr, cy - 1.5 * dpr, 3 * dpr, 3 * dpr);
        }
      }
    }
    if (path) {
      // Bubbles kept by the reduction step (all raw path bubbles if smoothing failed).
      ctx.fillStyle = rgba(colors.accent, 0.12);
      ctx.strokeStyle = rgba(colors.accent, 0.6);
      ctx.lineWidth = dpr;
      for (const b of (smoothed?.reduced ?? path).points) {
        if (!(b.r > 0)) continue;
        const [cx, cy] = toCanvas(b.x, b.y);
        ctx.beginPath();
        ctx.arc(cx, cy, (b.r / RES) * s, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();
      }
      ctx.lineJoin = 'round';
      if (smoothed) {
        // Raw roadmap path, dashed, under the smoothed spline.
        ctx.strokeStyle = rgba(colors.accent, 0.7);
        ctx.lineWidth = 1.25 * dpr;
        ctx.setLineDash([4 * dpr, 3 * dpr]);
        tracePolyline(path.points);
        ctx.setLineDash([]);
      }
      ctx.strokeStyle = rgba(colors.accent, 1);
      ctx.lineWidth = 2.5 * dpr;
      tracePolyline((smoothed?.spline ?? path).points);
    }
    drawMarker(state.start, 'S');
    drawMarker(state.goal, 'G');
  }

  function tracePolyline(points: { x: number; y: number }[]) {
    ctx.beginPath();
    points.forEach((b, i) => (i ? ctx.lineTo(...toCanvas(b.x, b.y)) : ctx.moveTo(...toCanvas(b.x, b.y))));
    ctx.stroke();
  }

  function drawMarker([x, y]: Point, label: string) {
    const dpr = window.devicePixelRatio || 1;
    const [cx, cy] = toCanvas(x, y);
    const r = 7 * dpr;
    ctx.lineWidth = 1.5 * dpr;
    ctx.strokeStyle = rgba(colors.accent, 1);
    ctx.fillStyle = rgba(colors.surface, 1);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - 2 * r, cy);
    ctx.lineTo(cx - r, cy);
    ctx.moveTo(cx + r, cy);
    ctx.lineTo(cx + 2 * r, cy);
    ctx.moveTo(cx, cy - 2 * r);
    ctx.lineTo(cx, cy - r);
    ctx.moveTo(cx, cy + r);
    ctx.lineTo(cx, cy + 2 * r);
    ctx.stroke();
    ctx.fillStyle = rgba(colors.accent, 1);
    ctx.font = `600 ${9 * dpr}px ${getComputedStyle(root).getPropertyValue('--mono')}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, cx, cy + 0.5 * dpr);
  }

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(canvas.clientWidth * dpr);
    canvas.height = Math.round((canvas.width * state.height) / state.width);
    draw();
  }
  new ResizeObserver(resize).observe(canvas);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    colors = readColors();
    renderRaster();
    draw();
  });

  // --- Computation ---------------------------------------------------------

  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  let computeStarted = 0;

  function requestCompute() {
    state.requestId++;
    computeStarted = performance.now();
    status.textContent = 'Computing roadmap…';
    const request: ComputeRequest = {
      id: state.requestId,
      width: state.width,
      height: state.height,
      occupancy: state.occupancy.slice(),
      mapParams: MAP_PARAMS,
      roadmapParams: state.roadmapParams,
    };
    worker.postMessage(request, [request.occupancy.buffer]);
  }

  worker.onmessage = (event: MessageEvent<ComputeResponse>) => {
    const r = event.data;
    if (r.id !== state.requestId) return; // a newer request is in flight
    state.grid = { width: state.width, height: state.height, resolution: RES, dist: r.dist };
    state.skeleton = r.skeleton;
    const bubbles = [];
    for (let i = 0; i < r.bubbles.length; i += 3) bubbles.push({ x: r.bubbles[i], y: r.bubbles[i + 1], r: r.bubbles[i + 2] });
    const edges: [number, number][] = [];
    for (let i = 0; i < r.edges.length; i += 2) edges.push([r.edges[i], r.edges[i + 1]]);
    state.roadmap = { bubbles, edges };
    status.textContent = '';
    stats.dataset.compute = `${bubbles.length} nodes · ${edges.length} edges · ${Math.round(performance.now() - computeStarted)} ms`;
    replan();
    renderRaster();
    draw();
  };

  function replan() {
    state.path = state.roadmap && state.grid ? planPath(state.roadmap, state.grid, state.start, state.goal) : null;
    state.smoothed = state.path && state.grid ? smoothPath(state.path, state.grid) : null;
    const shown = state.smoothed?.spline ?? state.path;
    const path = shown ? `path ${shown.length.toFixed(1)} m` : 'no path';
    stats.textContent = `${stats.dataset.compute ?? ''} · ${path}`;
  }

  // --- Interaction ---------------------------------------------------------

  function eventToWorld(event: PointerEvent): Point {
    const rect = canvas.getBoundingClientRect();
    return [
      ((event.clientX - rect.left) / rect.width) * state.width * RES,
      ((event.clientY - rect.top) / rect.height) * state.height * RES,
    ];
  }

  function paint(from: Point, to: Point) {
    const value = state.tool === 'draw' ? 255 : 0;
    const r = BRUSH_RADIUS / RES;
    const steps = Math.max(1, Math.ceil(Math.hypot(to[0] - from[0], to[1] - from[1]) / (RES * r * 0.5)));
    for (let k = 0; k <= steps; k++) {
      const cx = (from[0] + ((to[0] - from[0]) * k) / steps) / RES - 0.5;
      const cy = (from[1] + ((to[1] - from[1]) * k) / steps) / RES - 0.5;
      for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(state.height - 1, Math.ceil(cy + r)); y++) {
        for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(state.width - 1, Math.ceil(cx + r)); x++) {
          if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) state.occupancy[y * state.width + x] = value;
        }
      }
    }
  }

  let drag: { kind: 'start' | 'goal' | 'paint'; last: Point } | null = null;

  canvas.addEventListener('pointerdown', (event) => {
    const p = eventToWorld(event);
    canvas.setPointerCapture(event.pointerId);
    if (state.tool === 'plan') {
      const grab = (MARKER_GRAB_PX / canvas.getBoundingClientRect().width) * state.width * RES;
      // Grab the start marker when close to it; any other click moves the goal.
      const kind = Math.hypot(state.start[0] - p[0], state.start[1] - p[1]) < grab ? 'start' : 'goal';
      state[kind] = p;
      drag = { kind, last: p };
      replan();
    } else {
      drag = { kind: 'paint', last: p };
      paint(p, p);
      renderRaster();
    }
    draw();
  });

  canvas.addEventListener('pointermove', (event) => {
    if (!drag) return;
    const p = eventToWorld(event);
    if (drag.kind === 'paint') {
      paint(drag.last, p);
      renderRaster();
    } else {
      state[drag.kind] = p;
      replan();
    }
    drag.last = p;
    draw();
  });

  const endDrag = () => {
    if (drag?.kind === 'paint') requestCompute();
    drag = null;
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  root.querySelectorAll<HTMLInputElement>('input[name$="-tool"]').forEach((input) => {
    input.addEventListener('change', () => {
      state.tool = input.value as Tool;
      canvas.dataset.tool = state.tool;
    });
  });

  root.querySelectorAll<HTMLInputElement>('input[data-layer]').forEach((input) => {
    input.addEventListener('change', () => {
      state.layers[input.dataset.layer as keyof State['layers']] = input.checked;
      renderRaster();
      draw();
    });
  });

  let sliderTimer = 0;
  root.querySelectorAll<HTMLInputElement>('input[data-param]').forEach((input) => {
    const output = root.querySelector<HTMLOutputElement>(`output[for="${input.id}"]`)!;
    input.addEventListener('input', () => {
      const value = Number(input.value);
      state.roadmapParams[input.dataset.param as 'minJunctionRadius' | 'minBubbleRadius'] = value;
      output.value = `${value.toFixed(1)} m`;
      clearTimeout(sliderTimer);
      sliderTimer = window.setTimeout(requestCompute, 150);
    });
  });

  root.querySelector('[data-action="reset"]')!.addEventListener('click', () => {
    state.occupancy.set(state.initialOccupancy);
    renderRaster();
    draw();
    requestCompute();
  });
  root.querySelector('[data-action="clear"]')!.addEventListener('click', () => {
    state.occupancy.fill(0);
    renderRaster();
    draw();
    requestCompute();
  });

  renderRaster();
  resize();
  requestCompute();
}
