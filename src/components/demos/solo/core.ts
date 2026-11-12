/**
 * Planar model of SOLO's two left legs (front and hind, sharing the sagittal plane) with capsule
 * self-collision distances and a distance-based safety controller.
 *
 * World frame: x forward, y up, metres. Joint angles in radians, measured from the downward vertical,
 * counter-clockwise positive. Joint vector q = [front hip, front knee, hind hip, hind knee].
 */

export type Vec = [number, number];

/** SOLO leg dimensions; the capsule radius is a choice of this demo. */
export const GEOMETRY = { hipOffset: 0.19, upper: 0.16, lower: 0.16, radius: 0.015 };

/** Knee bending direction per leg: both knees point towards the body centre. */
const KNEE_SIGN = [1, -1];

/** Segments: front upper, front lower, hind upper, hind lower; each moved by the listed joints. */
export const SEGMENT_JOINTS = [[0], [0, 1], [2], [2, 3]];

/** Only pairs of segments from distinct legs are checked, as in the paper's capsule model. */
export const PAIRS: [number, number][] = [
  [0, 2],
  [0, 3],
  [1, 2],
  [1, 3],
];

export interface Kinematics {
  /** Joint positions, indexed like q. */
  joints: Vec[];
  feet: [Vec, Vec];
  /** Segment end points, indexed like SEGMENT_JOINTS. */
  segments: [Vec, Vec][];
}

const dir = (angle: number): Vec => [Math.sin(angle), -Math.cos(angle)];

export function forwardKinematics(q: ArrayLike<number>): Kinematics {
  const { hipOffset, upper, lower } = GEOMETRY;
  const joints: Vec[] = [];
  const feet: Vec[] = [];
  for (let leg = 0; leg < 2; leg++) {
    const hip: Vec = [leg === 0 ? hipOffset : -hipOffset, 0];
    const a = q[2 * leg];
    const b = a + q[2 * leg + 1];
    const knee: Vec = [hip[0] + upper * dir(a)[0], hip[1] + upper * dir(a)[1]];
    feet.push([knee[0] + lower * dir(b)[0], knee[1] + lower * dir(b)[1]]);
    joints.push(hip, knee);
  }
  return {
    joints,
    feet: feet as [Vec, Vec],
    segments: [
      [joints[0], joints[1]],
      [joints[1], feet[0]],
      [joints[2], joints[3]],
      [joints[3], feet[1]],
    ],
  };
}

/** Joint angles placing the foot of `leg` (0 front, 1 hind) at `foot`, clamped to the reachable annulus. */
export function inverseKinematics(leg: 0 | 1, foot: Vec): [number, number] {
  const { hipOffset, upper, lower } = GEOMETRY;
  const dx = foot[0] - (leg === 0 ? hipOffset : -hipOffset);
  const dy = foot[1];
  const reach = Math.min(Math.max(Math.hypot(dx, dy), Math.abs(upper - lower) + 1e-3), upper + lower - 1e-3);
  const cosKnee = (reach * reach - upper * upper - lower * lower) / (2 * upper * lower);
  const knee = KNEE_SIGN[leg] * Math.acos(Math.min(1, Math.max(-1, cosKnee)));
  const hip = Math.atan2(dx, -dy) - Math.atan2(lower * Math.sin(knee), upper + lower * Math.cos(knee));
  return [hip, knee];
}

/** Closest points between segments [p1, q1] and [p2, q2] (Ericson, Real-Time Collision Detection, 5.1.9). */
export function closestPoints(p1: Vec, q1: Vec, p2: Vec, q2: Vec): [Vec, Vec] {
  const d1: Vec = [q1[0] - p1[0], q1[1] - p1[1]];
  const d2: Vec = [q2[0] - p2[0], q2[1] - p2[1]];
  const r: Vec = [p1[0] - p2[0], p1[1] - p2[1]];
  const a = d1[0] * d1[0] + d1[1] * d1[1];
  const e = d2[0] * d2[0] + d2[1] * d2[1];
  const f = d2[0] * r[0] + d2[1] * r[1];
  const c = d1[0] * r[0] + d1[1] * r[1];
  const b = d1[0] * d2[0] + d1[1] * d2[1];
  const denom = a * e - b * b;
  const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
  let s = denom > 1e-12 ? clamp01((b * f - c * e) / denom) : 0;
  let t = (b * s + f) / e;
  if (t < 0) {
    t = 0;
    s = clamp01(-c / a);
  } else if (t > 1) {
    t = 1;
    s = clamp01((b - c) / a);
  }
  return [
    [p1[0] + d1[0] * s, p1[1] + d1[1] * s],
    [p2[0] + d2[0] * t, p2[1] + d2[1] * t],
  ];
}

export interface PairDistance {
  pair: [number, number];
  /** Signed capsule distance (negative once the capsules overlap). */
  distance: number;
  /** Closest points on the segment axes. */
  points: [Vec, Vec];
  /** ∂distance/∂q; zero when the segment axes intersect and the direction is undefined. */
  gradient: number[];
}

export function pairDistances(kin: Kinematics): PairDistance[] {
  return PAIRS.map((pair) => {
    const [s1, s2] = pair;
    const [c1, c2] = closestPoints(...kin.segments[s1], ...kin.segments[s2]);
    const gap = Math.hypot(c1[0] - c2[0], c1[1] - c2[1]);
    const gradient = [0, 0, 0, 0];
    if (gap > 1e-9) {
      const n: Vec = [(c1[0] - c2[0]) / gap, (c1[1] - c2[1]) / gap];
      // Planar revolute joint at c: ∂p/∂θ = ẑ × (p − c) = (−(p − c)ᵧ, (p − c)ₓ).
      const add = (point: Vec, joints: number[], sign: number) => {
        for (const j of joints) {
          const [cx, cy] = kin.joints[j];
          gradient[j] += sign * (n[0] * -(point[1] - cy) + n[1] * (point[0] - cx));
        }
      };
      add(c1, SEGMENT_JOINTS[s1], 1);
      add(c2, SEGMENT_JOINTS[s2], -1);
    }
    return { pair, distance: gap - 2 * GEOMETRY.radius, points: [c1, c2], gradient };
  });
}

export interface SafetyParams {
  /** Activation distance d₀ (m). */
  threshold: number;
  /** Repulsion stiffness k (N/m). */
  stiffness: number;
  /** Repulsion damping b (N·s/m). */
  damping: number;
}

/**
 * Repulsive spring–damper on each pair closer than d₀, mapped to joint torques through the distance
 * gradient: τ = Σ max(0, k (d₀ − d) − b ḋ) ∇d, with ḋ = ∇d · q̇.
 */
export function safetyTorque(distances: PairDistance[], qd: ArrayLike<number>, params: SafetyParams): number[] {
  const tau = [0, 0, 0, 0];
  for (const { distance, gradient } of distances) {
    if (distance >= params.threshold) continue;
    let rate = 0;
    for (let j = 0; j < 4; j++) rate += gradient[j] * qd[j];
    const force = params.stiffness * (params.threshold - distance) - params.damping * rate;
    if (force <= 0) continue;
    for (let j = 0; j < 4; j++) tau[j] += force * gradient[j];
  }
  return tau;
}

/**
 * Joints are simulated as independent damped inertias (no rigid-body coupling, no gravity), tracking the
 * reference with a PD controller; the safety torque is added on top.
 */
export const JOINT = { inertia: 0.01, kp: 3, kd: 0.2 };

export interface SimState {
  q: number[];
  qd: number[];
}

export interface StepResult {
  distances: PairDistance[];
  tau: number[];
}

/** Advances the simulation by `dt` seconds (semi-implicit Euler). Pass `safety = null` to disable it. */
export function step(state: SimState, qRef: number[], safety: SafetyParams | null, dt: number): StepResult {
  const distances = pairDistances(forwardKinematics(state.q));
  const tau = safety ? safetyTorque(distances, state.qd, safety) : [0, 0, 0, 0];
  for (let j = 0; j < 4; j++) {
    const pd = JOINT.kp * (qRef[j] - state.q[j]) - JOINT.kd * state.qd[j];
    state.qd[j] += ((pd + tau[j]) / JOINT.inertia) * dt;
    state.q[j] += state.qd[j] * dt;
  }
  return { distances, tau };
}
