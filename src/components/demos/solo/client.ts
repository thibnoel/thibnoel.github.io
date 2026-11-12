import { resolveColor, rgba } from '../colors';
import { GEOMETRY, forwardKinematics, inverseKinematics, step, type PairDistance, type SafetyParams, type Vec } from './core';

type Mode = 'swing' | 'drag';

/** World window shown on the scene canvas (m). */
const VIEW = { x0: -0.42, x1: 0.42, y0: -0.34, y1: 0.08 };
const BODY = { halfLength: 0.23, bottom: -0.025, top: 0.035 };
/** Control period (s), as on the robot's 1 kHz loop. */
const DT = 1e-3;
/** Crossing motion: both feet swing under the body, past each other, and back. */
const SWING = { period: 4, amplitude: 0.22, height: -0.2 };
const SAFETY_DAMPING = 30; // N·s/m
const PLOT = { window: 6, min: -0.035, max: 0.1, aspect: 0.84 / 0.14 };
const STATS_INTERVAL = 100; // ms

const restTargets = (): [Vec, Vec] => [
  [GEOMETRY.hipOffset, SWING.height],
  [-GEOMETRY.hipOffset, SWING.height],
];

export function mountSoloDemo(root: HTMLElement) {
  const scene = root.querySelector<HTMLCanvasElement>('canvas[data-scene]')!;
  const plot = root.querySelector<HTMLCanvasElement>('canvas[data-plot]')!;
  const stats = root.querySelector<HTMLElement>('[data-stats]')!;
  const sceneCtx = scene.getContext('2d')!;
  const plotCtx = plot.getContext('2d')!;
  const viewAspect = (VIEW.x1 - VIEW.x0) / (VIEW.y1 - VIEW.y0);
  scene.style.aspectRatio = String(viewAspect);
  plot.style.aspectRatio = String(PLOT.aspect);

  const targets = restTargets();
  const referenceJoints = () => [...inverseKinematics(0, targets[0]), ...inverseKinematics(1, targets[1])];
  const sim = { q: referenceJoints(), qd: [0, 0, 0, 0] };
  const safety: SafetyParams = { threshold: 0.04, stiffness: 1000, damping: SAFETY_DAMPING };
  let safetyOn = true;
  let mode: Mode = 'swing';
  let swingTime = 0;
  let simTime = 0;
  let distances: PairDistance[] = [];
  let tau = [0, 0, 0, 0];
  const history: { t: number; d: number }[] = [];

  // --- Rendering -----------------------------------------------------------

  let colors = readColors();
  function readColors() {
    return {
      surface: resolveColor(root, '--surface'),
      fg: resolveColor(root, '--fg'),
      muted: resolveColor(root, '--muted'),
      line: resolveColor(root, '--line-strong'),
      accent: resolveColor(root, '--accent'),
      danger: resolveColor(root, '--danger'),
    };
  }
  const mono = getComputedStyle(root).getPropertyValue('--mono');

  /** Canvas pixels per metre. */
  const scale = () => scene.width / (VIEW.x1 - VIEW.x0);
  const toCanvas = ([x, y]: Vec): Vec => [(x - VIEW.x0) * scale(), (VIEW.y1 - y) * scale()];

  function strokeSegments(segments: [Vec, Vec][], width: number, color: string) {
    sceneCtx.lineWidth = width;
    sceneCtx.strokeStyle = color;
    sceneCtx.beginPath();
    for (const [a, b] of segments) {
      sceneCtx.moveTo(...toCanvas(a));
      sceneCtx.lineTo(...toCanvas(b));
    }
    sceneCtx.stroke();
  }

  function drawScene() {
    const ctx = sceneCtx;
    const dpr = window.devicePixelRatio || 1;
    const s = scale();
    ctx.clearRect(0, 0, scene.width, scene.height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const [bx, by] = toCanvas([-BODY.halfLength, BODY.top]);
    ctx.fillStyle = rgba(colors.surface, 1);
    ctx.strokeStyle = rgba(colors.line, 1);
    ctx.lineWidth = dpr;
    ctx.beginPath();
    ctx.rect(bx, by, 2 * BODY.halfLength * s, (BODY.top - BODY.bottom) * s);
    ctx.fill();
    ctx.stroke();

    const kin = forwardKinematics(sim.q);
    // Single path per layer, so overlapping margins do not stack their transparency.
    if (safetyOn) strokeSegments(kin.segments, 2 * (GEOMETRY.radius + safety.threshold / 2) * s, rgba(colors.accent, 0.14));

    ctx.setLineDash([4 * dpr, 4 * dpr]);
    strokeSegments(forwardKinematics(referenceJoints()).segments, 1.25 * dpr, rgba(colors.muted, 0.9));
    ctx.setLineDash([]);

    const colliding = new Set(distances.filter((p) => p.distance < 0).flatMap((p) => p.pair));
    kin.segments.forEach((segment, i) => {
      strokeSegments([segment], 2 * GEOMETRY.radius * s, rgba(colliding.has(i) ? colors.danger : colors.fg, 0.85));
    });
    ctx.fillStyle = rgba(colors.surface, 1);
    for (const joint of kin.joints) {
      ctx.beginPath();
      ctx.arc(...toCanvas(joint), 0.45 * GEOMETRY.radius * s, 0, 2 * Math.PI);
      ctx.fill();
    }

    const closest = minPair();
    if (closest) {
      const color = closest.distance < 0 ? colors.danger : safetyOn && closest.distance < safety.threshold ? colors.accent : colors.muted;
      ctx.strokeStyle = rgba(color, 1);
      ctx.fillStyle = rgba(color, 1);
      ctx.lineWidth = 1.25 * dpr;
      ctx.setLineDash([3 * dpr, 2 * dpr]);
      ctx.beginPath();
      ctx.moveTo(...toCanvas(closest.points[0]));
      ctx.lineTo(...toCanvas(closest.points[1]));
      ctx.stroke();
      ctx.setLineDash([]);
      for (const point of closest.points) {
        ctx.beginPath();
        ctx.arc(...toCanvas(point), 2.5 * dpr, 0, 2 * Math.PI);
        ctx.fill();
      }
    }

    drawTarget(targets[0], 'F');
    drawTarget(targets[1], 'H');
  }

  function drawTarget(target: Vec, label: string) {
    const ctx = sceneCtx;
    const dpr = window.devicePixelRatio || 1;
    const [cx, cy] = toCanvas(target);
    const r = 7 * dpr;
    ctx.lineWidth = 1.5 * dpr;
    ctx.strokeStyle = rgba(colors.accent, 1);
    ctx.fillStyle = rgba(colors.surface, 1);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      ctx.moveTo(cx + dx * r, cy + dy * r);
      ctx.lineTo(cx + dx * 1.8 * r, cy + dy * 1.8 * r);
    }
    ctx.stroke();
    ctx.fillStyle = rgba(colors.accent, 1);
    ctx.font = `600 ${9 * dpr}px ${mono}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, cx, cy + 0.5 * dpr);
  }

  function drawPlot() {
    const ctx = plotCtx;
    const dpr = window.devicePixelRatio || 1;
    const { width, height } = plot;
    const pad = 6 * dpr;
    const toY = (d: number) => pad + ((PLOT.max - d) / (PLOT.max - PLOT.min)) * (height - 2 * pad);
    const toX = (t: number) => ((t - simTime + PLOT.window) / PLOT.window) * width;
    ctx.clearRect(0, 0, width, height);
    ctx.font = `${9 * dpr}px ${mono}`;
    ctx.textBaseline = 'bottom';
    ctx.textAlign = 'left';

    const zero = toY(0);
    ctx.lineWidth = dpr;
    ctx.strokeStyle = rgba(colors.line, 1);
    ctx.beginPath();
    ctx.moveTo(0, zero);
    ctx.lineTo(width, zero);
    ctx.stroke();
    ctx.fillStyle = rgba(colors.muted, 1);
    ctx.fillText('contact', pad, zero - 2 * dpr);

    const thresholdColor = safetyOn ? colors.accent : colors.muted;
    const threshold = toY(safety.threshold);
    ctx.strokeStyle = rgba(thresholdColor, 0.8);
    ctx.setLineDash([4 * dpr, 4 * dpr]);
    ctx.beginPath();
    ctx.moveTo(0, threshold);
    ctx.lineTo(width, threshold);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = rgba(thresholdColor, 1);
    ctx.fillText('d₀', pad, threshold - 2 * dpr);
    ctx.textAlign = 'right';
    ctx.fillStyle = rgba(colors.muted, 1);
    ctx.fillText(`min. distance, last ${PLOT.window} s`, width - pad, pad + 9 * dpr);

    if (history.length < 2) return;
    const trace = new Path2D();
    history.forEach(({ t, d }, i) => {
      const y = toY(Math.min(PLOT.max, Math.max(PLOT.min, d)));
      if (i) trace.lineTo(toX(t), y);
      else trace.moveTo(toX(t), y);
    });
    ctx.lineWidth = 1.5 * dpr;
    ctx.strokeStyle = rgba(colors.fg, 1);
    ctx.stroke(trace);
    // Overdraw the part below contact in the collision color.
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, zero, width, height - zero);
    ctx.clip();
    ctx.strokeStyle = rgba(colors.danger, 1);
    ctx.stroke(trace);
    ctx.restore();
  }

  function draw() {
    drawScene();
    drawPlot();
  }

  function minPair() {
    return distances.reduce<PairDistance | null>((best, p) => (!best || p.distance < best.distance ? p : best), null);
  }

  let statsUpdated = 0;
  function updateStats(now: number) {
    if (now - statsUpdated < STATS_INTERVAL) return;
    statsUpdated = now;
    const d = minPair()?.distance ?? Infinity;
    const torque = Math.hypot(...tau);
    stats.textContent = `${d < 0 ? 'collision' : `min. distance ${(d * 100).toFixed(1)} cm`} · safety torque ${torque.toFixed(2)} N·m`;
  }

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    scene.width = Math.round(scene.clientWidth * dpr);
    scene.height = Math.round(scene.width / viewAspect);
    plot.width = Math.round(plot.clientWidth * dpr);
    plot.height = Math.round(plot.width / PLOT.aspect);
    draw();
  }
  new ResizeObserver(resize).observe(scene);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    colors = readColors();
    draw();
  });

  // --- Simulation loop -----------------------------------------------------

  function swingTargets(t: number) {
    const s = (1 - Math.cos((2 * Math.PI * t) / SWING.period)) / 2;
    targets[0] = [GEOMETRY.hipOffset - SWING.amplitude * s, SWING.height];
    targets[1] = [-GEOMETRY.hipOffset + SWING.amplitude * s, SWING.height];
  }

  let running = false;
  let lastFrame = 0;
  let pending = 0;
  function frame(now: number) {
    if (!running) return;
    pending += Math.min((now - lastFrame) / 1000, 0.05);
    lastFrame = now;
    while (pending >= DT) {
      if (mode === 'swing') {
        swingTime += DT;
        swingTargets(swingTime);
      }
      ({ distances, tau } = step(sim, referenceJoints(), safetyOn ? safety : null, DT));
      simTime += DT;
      pending -= DT;
    }
    history.push({ t: simTime, d: minPair()?.distance ?? Infinity });
    while (history.length && history[0].t < simTime - PLOT.window) history.shift();
    draw();
    updateStats(now);
    requestAnimationFrame(frame);
  }

  // Only simulate while the demo is on screen.
  new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting === running) return;
    running = entry.isIntersecting;
    if (running) {
      lastFrame = performance.now();
      requestAnimationFrame(frame);
    }
  }).observe(root);

  // --- Interaction ---------------------------------------------------------

  const modeInputs = root.querySelectorAll<HTMLInputElement>('input[name$="-mode"]');
  function setMode(next: Mode) {
    mode = next;
    modeInputs.forEach((input) => (input.checked = input.value === next));
    if (next === 'swing') swingTime = 0;
  }
  modeInputs.forEach((input) => input.addEventListener('change', () => setMode(input.value as Mode)));

  function eventToWorld(event: PointerEvent): Vec {
    const rect = scene.getBoundingClientRect();
    return [
      VIEW.x0 + ((event.clientX - rect.left) / rect.width) * (VIEW.x1 - VIEW.x0),
      VIEW.y1 - ((event.clientY - rect.top) / rect.height) * (VIEW.y1 - VIEW.y0),
    ];
  }

  let dragged: 0 | 1 | null = null;
  scene.addEventListener('pointerdown', (event) => {
    const p = eventToWorld(event);
    scene.setPointerCapture(event.pointerId);
    setMode('drag');
    const [front, hind] = targets.map(([x, y]) => Math.hypot(x - p[0], y - p[1]));
    dragged = front <= hind ? 0 : 1;
    targets[dragged] = p;
  });
  scene.addEventListener('pointermove', (event) => {
    if (dragged !== null) targets[dragged] = eventToWorld(event);
  });
  const endDrag = () => (dragged = null);
  scene.addEventListener('pointerup', endDrag);
  scene.addEventListener('pointercancel', endDrag);

  root.querySelector<HTMLInputElement>('input[data-safety]')!.addEventListener('change', (event) => {
    safetyOn = (event.target as HTMLInputElement).checked;
  });

  const formats = { threshold: (v: number) => `${(v * 100).toFixed(1)} cm`, stiffness: (v: number) => `${v} N/m` };
  root.querySelectorAll<HTMLInputElement>('input[data-param]').forEach((input) => {
    const param = input.dataset.param as keyof typeof formats;
    const output = root.querySelector<HTMLOutputElement>(`output[for="${input.id}"]`)!;
    input.addEventListener('input', () => {
      safety[param] = Number(input.value);
      output.value = formats[param](safety[param]);
    });
  });

  root.querySelector('[data-action="reset"]')!.addEventListener('click', () => {
    [targets[0], targets[1]] = restTargets();
    sim.q = referenceJoints();
    sim.qd = [0, 0, 0, 0];
    swingTime = 0;
    history.length = 0;
  });

  resize();
}
