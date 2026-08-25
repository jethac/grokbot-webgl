/* Grok Bot engine — measured constants from Benji Taylor's reference film.
   Eyes live on a sphere. Transitions are ease-out quint. No body overshoot. */

const TAU = Math.PI * 2;
const clamp = (v, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a, b, t) => a + (b - a) * t;
const deg = (d) => (d * Math.PI) / 180;
const easeOutQuint = (t) => 1 - (1 - t) ** 5;
const easeOutCubic = (t) => 1 - (1 - t) ** 3;
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);

function loopNoise(t, period, seed = 0) {
  const p = (t / period) * TAU;
  return (
    0.55 * Math.sin(p + seed) +
    0.3 * Math.sin(2 * p + seed * 1.7 + 1.1) +
    0.15 * Math.sin(3 * p + seed * 2.3 + 2.4)
  );
}

function createRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const N = 64;
const ANGLES = Array.from({ length: N }, (_, i) => (i / N) * TAU);
const COS = ANGLES.map(Math.cos);
const SIN = ANGLES.map(Math.sin);

function radiusAt(radii, angle) {
  const t = ((((angle / TAU) % 1) + 1) % 1) * N;
  const i = Math.floor(t);
  return lerp(radii[i % N], radii[(i + 1) % N], t - i);
}

function circle(r = 1, pose = {}) {
  return { radii: new Array(N).fill(r), rot: 0, cx: 0, cy: 0, sx: 1, sy: 1, ...pose };
}

function blendSil(a, b, t) {
  const radii = new Array(N);
  for (let i = 0; i < N; i++) radii[i] = lerp(a.radii[i] ?? 1, b.radii[i] ?? 1, t);
  let dRot = b.rot - a.rot;
  while (dRot > Math.PI) dRot -= TAU;
  while (dRot < -Math.PI) dRot += TAU;
  return {
    radii,
    rot: a.rot + dRot * t,
    cx: lerp(a.cx, b.cx, t),
    cy: lerp(a.cy, b.cy, t),
    sx: lerp(a.sx, b.sx, t),
    sy: lerp(a.sy, b.sy, t),
  };
}

function profileFromPolygon(poly, cx, cy) {
  const radii = new Array(N).fill(0);
  const n = poly.length;
  for (let k = 0; k < N; k++) {
    const dx = COS[k];
    const dy = SIN[k];
    let best = 0;
    for (let i = 0; i < n; i++) {
      const A = poly[i];
      const B = poly[(i + 1) % n];
      const ex = B.x - A.x;
      const ey = B.y - A.y;
      const den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-9) continue;
      const px = A.x - cx;
      const py = A.y - cy;
      const tt = (px * ey - py * ex) / den;
      const u = (px * dy - py * dx) / den;
      if (tt > best && u >= 0 && u <= 1) best = tt;
    }
    radii[k] = best;
  }
  return radii;
}

function hullOfCircles(x1, y1, r1, x2, y2, r2, steps = 96) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.hypot(dx, dy) || 1e-6;
  const base = Math.atan2(dy, dx);
  const spread = Math.acos(Math.max(-1, Math.min(1, (r1 - r2) / dist)));
  const pts = [];
  for (let i = 0; i <= steps / 2; i++) {
    const a = base + spread + ((TAU - 2 * spread) * i) / (steps / 2);
    pts.push({ x: x1 + Math.cos(a) * r1, y: y1 + Math.sin(a) * r1 });
  }
  for (let i = 0; i <= steps / 2; i++) {
    const a = base - spread + (2 * spread * i) / (steps / 2);
    pts.push({ x: x2 + Math.cos(a) * r2, y: y2 + Math.sin(a) * r2 });
  }
  return pts;
}

const EGG = [
  0.8369, 0.8424, 0.8497, 0.8585, 0.8674, 0.8775, 0.8878, 0.8983, 0.9089, 0.9185, 0.9288, 0.9374,
  0.9445, 0.9504, 0.9543, 0.9559, 0.9555, 0.9519, 0.9466, 0.9389, 0.9302, 0.9193, 0.9085, 0.8969,
  0.8852, 0.8734, 0.8625, 0.8513, 0.8411, 0.8325, 0.8243, 0.8179, 0.8137, 0.8112, 0.8102, 0.8128,
  0.8178, 0.8262, 0.8374, 0.8518, 0.8702, 0.8922, 0.9169, 0.9446, 0.9741, 1.0023, 1.0267, 1.0433,
  1.0481, 1.0393, 1.0216, 0.997, 0.9697, 0.9418, 0.9169, 0.8949, 0.876, 0.8604, 0.849, 0.8394,
  0.8337, 0.8314, 0.8305, 0.8326,
];
const HEX = [
  0.921, 0.9282, 0.9441, 0.9706, 0.9984, 1.0059, 0.9896, 0.9562, 0.929, 0.9124, 0.9047, 0.9058,
  0.9157, 0.9349, 0.9642, 0.9873, 0.9882, 0.9665, 0.9336, 0.9105, 0.8968, 0.8918, 0.8955, 0.908,
  0.9293, 0.9611, 0.982, 0.9812, 0.959, 0.9282, 0.9089, 0.8978, 0.8964, 0.9026, 0.9189, 0.9439,
  0.9778, 0.999, 0.9964, 0.9713, 0.9439, 0.9274, 0.9196, 0.9206, 0.9308, 0.9502, 0.9799, 1.0121,
  1.0226, 1.0071, 0.9752, 0.951, 0.9366, 0.9316, 0.9351, 0.9485, 0.9711, 1.0026, 1.0213, 1.0155,
  0.9863, 0.9547, 0.9347, 0.9232,
];
const TRI = [
  0.7819, 0.8211, 0.8747, 0.944, 1.0223, 1.096, 1.1401, 1.134, 1.0808, 1.0047, 0.9265, 0.8603,
  0.8104, 0.773, 0.745, 0.7273, 0.7151, 0.7118, 0.7148, 0.7245, 0.7427, 0.768, 0.8037, 0.8518,
  0.9148, 0.9876, 1.0583, 1.1073, 1.1109, 1.0667, 0.994, 0.9164, 0.8482, 0.7948, 0.7555, 0.7261,
  0.7056, 0.6925, 0.6859, 0.6869, 0.6938, 0.7084, 0.7305, 0.7615, 0.804, 0.8595, 0.9311, 1.0092,
  1.0791, 1.1171, 1.1054, 1.0501, 0.9779, 0.905, 0.845, 0.799, 0.7656, 0.7413, 0.7258, 0.716,
  0.7146, 0.7204, 0.733, 0.7528,
];

const BAR_UPRIGHT_CY = -0.1875;
const BAR_UPRIGHT = profileFromPolygon(hullOfCircles(0, -0.505, 0.132, 0, 0.13, 0.075), 0, BAR_UPRIGHT_CY);
const BAR_ITALIC = profileFromPolygon(hullOfCircles(0, -0.2535, 0.1345, 0, 0.2535, 0.1345), 0, 0);

function silNamed(name, pose = {}) {
  const radii =
    name === "egg" ? EGG.slice() : name === "hexagon" ? HEX.slice() : name === "triangle" ? TRI.slice() : new Array(N).fill(1);
  return { radii, rot: 0, cx: 0, cy: 0, sx: 1, sy: 1, ...pose };
}

function barUpright(pose = {}) {
  return { radii: BAR_UPRIGHT.slice(), rot: 0, cx: 0, cy: BAR_UPRIGHT_CY, sx: 1, sy: 1, ...pose };
}
function barItalic(pose = {}) {
  return { radii: BAR_ITALIC.slice(), rot: 0, cx: 0, cy: 0, sx: 1, sy: 1, ...pose };
}

const TRI_ORBIT = 0.213;
function spinningTriangle(rot) {
  return silNamed("triangle", {
    rot,
    cx: -TRI_ORBIT * Math.sin(rot),
    cy: TRI_ORBIT * Math.cos(rot),
  });
}

/* ------------------------------------------------------------------ face */

const EYE_SPLIT = 15.46;
const EYE_W = 0.186;
const EYE_H = 0.412;
const REST_GAZE = { yaw: 28.49, pitch: 28.62, roll: -13 };

function spin(u, v, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [
    [u[0] * c + v[0] * s, u[1] * c + v[1] * s, u[2] * c + v[2] * s],
    [v[0] * c - u[0] * s, v[1] * c - u[1] * s, v[2] * c - u[2] * s],
  ];
}

function eyePoses(gaze, scale, split = EYE_SPLIT) {
  let f = [0, 0, 1];
  let right = [1, 0, 0];
  let down = [0, 1, 0];
  [f, right] = spin(f, right, deg(gaze.yaw));
  [down, f] = spin(down, f, deg(gaze.pitch));
  [right, down] = spin(right, down, deg(gaze.roll));
  const build = (side) => {
    const [ef, er] = spin(f, right, deg(split * side));
    return {
      x: ef[0] * scale,
      y: ef[1] * scale,
      a: er[0],
      b: er[1],
      c: down[0],
      d: down[1],
      depth: ef[2],
    };
  };
  return [build(-1), build(1)];
}

const BLINK_RNG = createRng(0x5eed);
const BLINKS = (() => {
  const out = [];
  let t = 1.4;
  while (t < 900) {
    out.push(t);
    t += 1.9 + BLINK_RNG() * 2.7;
    if (BLINK_RNG() < 0.18) {
      out.push(t);
      t += 0.24;
    }
  }
  return out;
})();
const BLINK_DUR = 0.18;

function blinkLid(t) {
  for (let i = 0; i < BLINKS.length; i++) {
    const start = BLINKS[i];
    if (t < start) break;
    const k = (t - start) / BLINK_DUR;
    if (k >= 0 && k <= 1) return k < 0.45 ? 1 - k / 0.45 : (k - 0.45) / 0.55;
  }
  return 1;
}

function liveliness(t, opt = {}) {
  const wander = opt.wander ?? 1;
  const blink = opt.blink !== false;
  const floatOn = opt.float !== false;
  return {
    dYaw: (loopNoise(t, 11.3, 0.4) * 5.5 + loopNoise(t, 3.7, 2.1) * 1.6) * wander,
    dPitch: (loopNoise(t, 9.1, 1.3) * 4.2 + loopNoise(t, 4.3, 0.7) * 1.3) * wander,
    dRoll: loopNoise(t, 13.7, 3.2) * 2.2 * wander,
    lid: blink ? blinkLid(t) : 1,
    driftX: floatOn ? loopNoise(t, 7.9, 1.9) * 0.006 : 0,
    driftY: floatOn ? loopNoise(t, 5.3, 0.3) * 0.007 : 0,
    breath: floatOn ? 1 + Math.sin((t / 3.4) * Math.PI * 2) * 0.005 : 1,
  };
}

function blinkScale(lid) {
  return 0.06 + 0.94 * clamp(lid);
}

/* ------------------------------------------------------------------ decor */

function wheel(hue, s = 0.55, l = 0.62) {
  const h = ((hue % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r, g, b;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [r + m, g + m, b + m];
}

const RING_RNG = createRng(0xa11ce);
const RINGS = Array.from({ length: 6 }, (_, i) => ({
  a: 1.3 + RING_RNG() * 0.1,
  k: 0.05 + RING_RNG() * 0.4,
  tilt: (i / 6) * Math.PI + RING_RNG() * 0.5,
  speed: 3 + RING_RNG() * 0.7,
  phase: RING_RNG() * TAU,
  sweep: 0.6 + RING_RNG() * 0.25,
  hue: (i * 360) / 6 + RING_RNG() * 30,
  hueSpan: 60 + RING_RNG() * 60,
  width: 0.05 + RING_RNG() * 0.012,
  cx: 0,
  cy: 0.1,
}));

const SWOOSH = Array.from({ length: 4 }, (_, i) => ({
  a: 0.78 + i * 0.2,
  k: 0.05 + i * 0.02,
  tilt: -0.62 + i * 0.05,
  speed: 0.3,
  phase: 0.06 * i,
  sweep: 0.4,
  hue: 95 + i * 62,
  hueSpan: 100,
  width: 0.05,
  cx: 0,
  cy: -0.12,
}));

const COMET_RNG = createRng(0xc0e7);
const COMET_RIBBONS = Array.from({ length: 4 }, (_, i) => {
  const d = i - 1.5;
  return {
    a: 0.85 * (1 + d * 0.03),
    k: (0.15 / 0.85) * (1 + d * 0.16),
    tilt: (34 * Math.PI) / 180 + d * 0.035,
    speed: 210 / 360,
    phase: -i * 0.045 + COMET_RNG() * 0.012,
    sweep: 0.34,
    hue: i * 85 + COMET_RNG() * 20,
    hueSpan: 80,
    width: 0.095,
    cx: 0,
    cy: 0,
  };
});

const DOT_X = [-0.557, -0.013, 0.532];
const DOT_R = 0.165;
const DOT_PEAK = 1.25;
const COMET_DOT = 0.129;
const NOTIF_BLUE = [0.141, 0.588, 0.91];
const NOTIF_ANGLE = -42;
const NOTIF_DIST = 1.003;
const NOTIF_R = 0.15;
const NOTIF_POP = 1.14;
const NOTIF_MARGIN = 0.054;

const P_RNG = createRng(0xbeef);
const PARTICLES = Array.from({ length: 5 }, (_, i) => ({
  birth: i * 0.2,
  angle: P_RNG() * TAU,
  rho: 0.58 + P_RNG() * 0.18,
}));

function particles(t) {
  const out = [];
  for (const p of PARTICLES) {
    const u = t - p.birth;
    if (u < 0 || u > 0.62) continue;
    const rho = p.rho * Math.pow(0.75, u * 10);
    const a = p.angle + (u * 100 * Math.PI) / 180;
    out.push({
      x: Math.cos(a) * rho,
      y: Math.sin(a) * rho,
      r: 0.04 + 0.028 * clamp(u / 0.55),
      opacity: clamp(u / 0.06) * clamp((0.62 - u) / 0.08),
      depth: clamp(1 - rho / 0.8),
      kind: 0,
    });
  }
  return out;
}

function dotPulse(t, index) {
  const p = ((((t - index * 0.5) / 1.5) % 1) + 1) % 1;
  const k = p < 0.5 ? 0.5 - 0.5 * Math.cos(p * TAU) : 0;
  return clamp(k * 2);
}

function sleepZs(t) {
  const out = [];
  for (let i = 0; i < 3; i++) {
    const u = ((((t - i * 1.1) / 3.3) % 1) + 1) % 1;
    out.push({
      x: 0.66 + u * 0.5 + 0.03 * Math.sin(u * TAU * 1.5 + i),
      y: -0.66 - u * 0.6,
      r: 0.055 + 0.05 * u,
      opacity: clamp(u / 0.15) * clamp((1 - u) / 0.25) * 0.95,
      kind: 2,
      rot: -12 + 9 * Math.sin(u * TAU + i * 2.1),
    });
  }
  return out;
}

/* ------------------------------------------------------------------ expressions */

function eye(w, h, tilt = 0, open = 1) {
  return { w, h, tilt, open };
}
function pair(w, h, tilt = 0, open = 1) {
  return [eye(w, h, tilt, open), eye(w, h, -tilt, open)];
}

const EXPRESSIONS = {
  rest: { gaze: { ...REST_GAZE }, split: EYE_SPLIT, eyes: [eye(EYE_W, EYE_H), eye(EYE_W, EYE_H)] },
  attentive: { gaze: { yaw: 4, pitch: 5, roll: -4 }, split: 16, eyes: pair(0.21, 0.44) },
  surprised: { gaze: { yaw: 3, pitch: -3, roll: 0 }, split: 19, eyes: pair(0.45, 0.47) },
  happy: { gaze: { yaw: 5, pitch: 9, roll: 0 }, split: 17, eyes: pair(0.27, 0.17, 14), arcEyes: 1 },
  angry: { gaze: { yaw: 3, pitch: 7, roll: 0 }, split: 17, eyes: pair(0.34, 0.15, 30) },
  sad: { gaze: { yaw: 3, pitch: -13, roll: 0 }, split: 16, eyes: pair(0.22, 0.4, -28) },
  curious: { gaze: { yaw: 16, pitch: -9, roll: -15 }, split: 16.5, eyes: [eye(0.24, 0.46, -8), eye(0.2, 0.38, -8)] },
  sleepy: { gaze: { yaw: 6, pitch: -9, roll: -3 }, split: 16, eyes: pair(0.2, 0.42, 0, 0.42) },
  suspicious: { gaze: { yaw: 12, pitch: 6, roll: -6 }, split: 16, eyes: [eye(0.21, 0.4), eye(0.22, 0.15)] },
  shy: { gaze: { yaw: -19, pitch: -14, roll: -7 }, split: 14, eyes: pair(0.17, 0.3) },
};

function blendExpr(a, b, t) {
  return {
    gaze: {
      yaw: lerp(a.gaze.yaw, b.gaze.yaw, t),
      pitch: lerp(a.gaze.pitch, b.gaze.pitch, t),
      roll: lerp(a.gaze.roll, b.gaze.roll, t),
    },
    split: lerp(a.split, b.split, t),
    arcEyes: lerp(a.arcEyes ?? 0, b.arcEyes ?? 0, t),
    eyes: [
      {
        w: lerp(a.eyes[0].w, b.eyes[0].w, t),
        h: lerp(a.eyes[0].h, b.eyes[0].h, t),
        tilt: lerp(a.eyes[0].tilt ?? 0, b.eyes[0].tilt ?? 0, t),
        open: lerp(a.eyes[0].open, b.eyes[0].open, t),
      },
      {
        w: lerp(a.eyes[1].w, b.eyes[1].w, t),
        h: lerp(a.eyes[1].h, b.eyes[1].h, t),
        tilt: lerp(a.eyes[1].tilt ?? 0, b.eyes[1].tilt ?? 0, t),
        open: lerp(a.eyes[1].open, b.eyes[1].open, t),
      },
    ],
  };
}

/* ------------------------------------------------------------------ states */

function base(over = {}) {
  return {
    sil: circle(1),
    offX: 0,
    offY: 0,
    gaze: { ...REST_GAZE },
    split: EYE_SPLIT,
    eyes: [
      { w: EYE_W, h: EYE_H, open: 1, tilt: 0 },
      { w: EYE_W, h: EYE_H, open: 1, tilt: 0 },
    ],
    eyeAlpha: 1,
    bodyAlpha: 1,
    dots: [],
    arcs: [],
    notif: null,
    mouth: 0,
    mouthRound: 0,
    arcEyes: 0,
    shoes: 1,
    star: 0,
    dotsBehind: false,
    ...over,
  };
}

const STATES = {
  idle: {
    duration: 2.4,
    morph: 0.45,
    blinkIn: false,
    baseFace: true,
    baseBody: true,
    pose: () => base(),
  },
  thinking: {
    duration: 2.6,
    morph: 0.4,
    blinkIn: true,
    baseFace: false,
    baseBody: false,
    pose: (t) => {
      const mid = dotPulse(t, 1);
      const emerge = 0.3 + 0.7 * easeOutCubic(clamp(t / 0.3));
      return base({
        sil: circle(DOT_R * (1 + (DOT_PEAK - 1) * mid), { cx: DOT_X[1] }),
        eyeAlpha: 0,
        shoes: 0,
        dots: [0, 2].map((i) => {
          const k = dotPulse(t, i);
          return {
            x: DOT_X[i] * emerge,
            y: 0,
            r: DOT_R * (1 + (DOT_PEAK - 1) * k),
            opacity: 0.55 + 0.45 * k,
            kind: 0,
          };
        }),
      });
    },
  },
  wink: {
    duration: 1.6,
    morph: 0.3,
    blinkIn: true,
    baseFace: false,
    baseBody: true,
    pose: () =>
      base({
        gaze: { yaw: -5.37, pitch: 4.55, roll: 6.7 },
        split: 16.25,
        eyes: [
          { w: 0.236, h: 0.464, open: 1, tilt: 0 },
          { w: 0.447, h: 0.089, open: 1, tilt: 0 },
        ],
      }),
    kirbyPose: () =>
      base({
        gaze: { yaw: -5, pitch: 3, roll: 5 },
        eyes: [eye(0.22, 0.47), eye(0.3, 0.05, 0, 0)],
        mouth: 0.3,
      }),
  },
  wide: {
    duration: 1.8,
    morph: 0.55,
    blinkIn: true,
    baseFace: false,
    baseBody: true,
    pose: () =>
      base({
        gaze: { yaw: 6.92, pitch: -21.96, roll: 11.6 },
        split: 18.43,
        eyes: pair(0.356, 0.875),
      }),
    kirbyPose: () =>
      base({
        gaze: { yaw: 4, pitch: -10, roll: 3 },
        eyes: pair(0.3, 0.8),
        mouth: 0.16,
        mouthRound: 1,
      }),
  },
  alert: {
    duration: 2.4,
    morph: 0.45,
    blinkIn: false,
    baseFace: false,
    baseBody: false,
    pose: (t) => {
      const p = clamp(t / 1.5);
      const travel = easeInOutCubic(p) * 0.82 - 0.087;
      const back = t > 1.6 ? clamp((t - 1.6) / 0.4) : 0;
      const x = travel * (1 - back) + 0.1 * back;
      const buzz = Math.sin(t * 2.5 * TAU) * 0.005;
      const tilt = (17.7 * Math.PI) / 180;
      return base({
        sil: barItalic({ rot: tilt, cx: x, cy: -0.325 - buzz }),
        eyeAlpha: 0,
        shoes: 0,
        dots: [
          {
            x: x - Math.sin(tilt) * 0.58,
            y: -0.325 + Math.cos(tilt) * 0.58 + buzz * 2.8,
            r: 0.118,
            opacity: 1,
            kind: 1,
            rot: (tilt * 180) / Math.PI,
          },
        ],
      });
    },
  },
  notify: {
    duration: 2.2,
    morph: 0.5,
    blinkIn: true,
    baseFace: false,
    baseBody: true,
    pose: (t) => {
      const p = clamp(t / 0.45);
      const pop = 1 + (NOTIF_POP - 1) * Math.sin(p * Math.PI) * (1 - p * 0.35);
      const r = NOTIF_R * (p < 1 ? pop : 1);
      const a = (NOTIF_ANGLE * Math.PI) / 180;
      return base({
        gaze: { yaw: -21.94, pitch: -5.82, roll: -12.2 },
        split: 18.89,
        eyes: pair(0.505, 0.498),
        notif: {
          x: Math.cos(a) * NOTIF_DIST,
          y: Math.sin(a) * NOTIF_DIST,
          r,
          notch: r + NOTIF_MARGIN,
        },
      });
    },
    kirbyPose: (t) => {
      const p = clamp(t / 0.45);
      const pop = 1 + (NOTIF_POP - 1) * Math.sin(p * Math.PI) * (1 - p * 0.35);
      const r = NOTIF_R * (p < 1 ? pop : 1);
      const a = (NOTIF_ANGLE * Math.PI) / 180;
      return base({
        gaze: { yaw: 19, pitch: 7, roll: 0 },
        eyes: pair(0.24, 0.52),
        mouth: 0.14,
        mouthRound: 1,
        notif: {
          x: Math.cos(a) * NOTIF_DIST,
          y: Math.sin(a) * NOTIF_DIST,
          r,
          notch: r + NOTIF_MARGIN,
        },
      });
    },
  },
  exclaim: {
    duration: 2,
    morph: 0.45,
    blinkIn: false,
    baseFace: false,
    baseBody: false,
    pose: () =>
      base({
        sil: barUpright(),
        eyeAlpha: 0,
        shoes: 0,
        dots: [{ x: -0.012, y: 0.526, r: 0.113, opacity: 1, kind: 0 }],
      }),
  },
  sleep: {
    duration: 2.4,
    morph: 0.5,
    blinkIn: false,
    baseFace: false,
    baseBody: false,
    pose: (t) =>
      base({
        sil: circle(0.1585, { cy: 0.11 + Math.sin(t * (TAU / 0.6)) * 0.19 }),
        eyeAlpha: 0,
        shoes: 0,
      }),
    kirbyPose: (t) =>
      base({
        sil: circle(1, { rot: 0.1, sy: 1 + Math.sin((t / 3.2) * TAU) * 0.02 }),
        gaze: { yaw: 0, pitch: 0, roll: 5 },
        eyes: pair(0.2, 0.05, 0, 0),
        mouth: 0.1,
        mouthRound: 1,
        dots: sleepZs(t),
      }),
  },
  egg: {
    duration: 1.8,
    morph: 0.4,
    blinkIn: true,
    baseFace: false,
    baseBody: false,
    pose: () =>
      base({
        sil: silNamed("egg"),
        gaze: { yaw: 19.97, pitch: 26.01, roll: -17.1 },
        split: 11.07,
        eyes: pair(0.164, 0.385),
        shoes: 0.4,
      }),
  },
  hexagon: {
    duration: 1.6,
    morph: 0.4,
    blinkIn: true,
    baseFace: false,
    baseBody: false,
    pose: () =>
      base({
        sil: silNamed("hexagon"),
        gaze: { yaw: 23.11, pitch: 24.42, roll: -13.3 },
        split: 13.37,
        eyes: pair(0.177, 0.411),
        shoes: 0.2,
      }),
  },
  play: {
    duration: 2,
    morph: 0.5,
    blinkIn: true,
    baseFace: false,
    baseBody: false,
    pose: (t) => {
      const fade = clamp(t / 0.35) * clamp((2.2 - t) / 0.5);
      return base({
        sil: spinningTriangle(0),
        gaze: { yaw: 12, pitch: -8, roll: -6 },
        split: 15,
        eyes: pair(0.18, 0.34),
        shoes: 0,
        arcs: SWOOSH.map((s, i) => ({ ...s, t, opacity: fade, id: i })),
      });
    },
  },
  orbit: {
    duration: 3.4,
    morph: 0.6,
    blinkIn: false,
    baseFace: false,
    baseBody: false,
    pose: (t) => {
      const ramp = easeInOutCubic(clamp(t / 0.35));
      const rot = -TAU * 1.25 * t * ramp;
      const back = easeInOutCubic(clamp((t - 1.6) / 0.9));
      const tri = spinningTriangle(rot);
      const ball = circle(1, { rot });
      const sil = blendSil(tri, ball, back);
      const fade = clamp(t / 0.8) * clamp((3.6 - t) / 0.9);
      return base({
        sil,
        gaze: {
          yaw: REST_GAZE.yaw + Math.sin(t * 6.5) * 65 * (1 - back),
          pitch: -4 + back * 32,
          roll: -13,
        },
        eyes: pair(0.18, 0.34 + back * 0.07),
        shoes: back,
        star: 1 - back,
        arcs: RINGS.map((s, i) => ({
          ...s,
          t,
          opacity: fade * clamp((t - i * 0.13) / 0.3),
          id: i,
        })),
      });
    },
    kirbyPose: (t) => {
      // Kirby stays a ball: two full tumbles along a small loop, warp star in tow.
      const spin = easeInOutCubic(clamp(t / 1.7)) * 2;
      const rot = -TAU * spin;
      const back = easeInOutCubic(clamp((t - 1.6) / 0.9));
      const fade = clamp(t / 0.8) * clamp((3.6 - t) / 0.9);
      const orbitR = TRI_ORBIT * (1 - back);
      return base({
        sil: circle(1, { rot, cx: -orbitR * Math.sin(rot), cy: orbitR * Math.cos(rot) }),
        gaze: { yaw: 0, pitch: -6, roll: 0 },
        eyes: pair(0.22, 0.5),
        mouth: 0.35,
        star: 1 - back,
        arcs: RINGS.map((s, i) => ({
          ...s,
          t,
          opacity: fade * clamp((t - i * 0.13) / 0.3),
          id: i,
        })),
      });
    },
  },
  burst: {
    duration: 2.6,
    morph: 0.4,
    blinkIn: false,
    baseFace: false,
    baseBody: false,
    pose: (t) => {
      const collapse = 1 - 0.834 * easeOutQuint(clamp(t / 0.7));
      const regrow = easeOutQuint(clamp((t - 1.7) / 0.7));
      return base({
        sil: circle(collapse + (1 - collapse) * regrow),
        eyeAlpha: clamp((t - 1.85) / 0.4),
        shoes: clamp((t - 1.85) / 0.4),
        dots: particles(t),
        dotsBehind: true,
      });
    },
  },
  comet: {
    duration: 2.4,
    morph: 0.45,
    blinkIn: false,
    baseFace: false,
    baseBody: false,
    pose: (t) => {
      const collapse = 1 - (1 - COMET_DOT) * easeOutQuint(clamp(t / 0.55));
      const regrow = easeOutQuint(clamp((t - 1.85) / 0.6));
      const fade = clamp((t - 0.15) / 0.25) * clamp((1.95 - t) / 0.3);
      return base({
        sil: circle(collapse + (1 - collapse) * regrow, {
          cy: Math.sin(clamp(t / 1.7) * Math.PI) * 0.035,
        }),
        eyeAlpha: clamp((t - 2) / 0.35),
        shoes: clamp((t - 2) / 0.35),
        arcs: COMET_RIBBONS.map((s, i) => ({ ...s, t, opacity: fade, id: i })),
      });
    },
  },
  inhale: {
    duration: 2.2,
    morph: 0.4,
    blinkIn: true,
    baseFace: false,
    baseBody: true,
    pose: (t) => {
      const p = clamp(t / 0.35);
      const hold = t > 0.35 && t < 1.5 ? 1 : t >= 1.5 ? 1 - clamp((t - 1.5) / 0.5) : p;
      return base({
        gaze: { yaw: 2, pitch: 18, roll: 0 },
        split: 14,
        eyes: pair(0.34, 0.14, 8),
        mouth: 0.15 + 0.85 * easeOutCubic(hold),
        shoes: 1,
      });
    },
    kirbyPose: (t) => {
      const p = clamp(t / 0.35);
      const hold = t > 0.35 && t < 1.5 ? 1 : t >= 1.5 ? 1 - clamp((t - 1.5) / 0.5) : p;
      const h = easeOutCubic(hold);
      return base({
        sil: circle(1, { rot: -0.06 * h, sx: 1 + 0.03 * h, sy: 1 - 0.02 * h }),
        gaze: { yaw: 0, pitch: 8, roll: 0 },
        eyes: pair(0.24, 0.55),
        mouth: 0.2 + 0.8 * h,
        mouthRound: 1,
      });
    },
  },
  puff: {
    duration: 2,
    morph: 0.45,
    blinkIn: true,
    baseFace: false,
    baseBody: false,
    pose: () => {
      const grow = 1.18;
      return base({
        sil: circle(grow, { sy: 1.04 }),
        gaze: { yaw: 4, pitch: 12, roll: -4 },
        split: 16,
        eyes: pair(0.22, 0.16, 16),
        shoes: 0,
        mouth: 0.12,
      });
    },
    kirbyPose: () =>
      base({
        sil: circle(1.18, { sy: 1.05 }),
        gaze: { yaw: 0, pitch: 4, roll: 0 },
        eyes: pair(0.2, 0.4),
        mouth: 0.12,
        mouthRound: 1,
      }),
  },
  happy: {
    duration: 2,
    morph: 0.4,
    blinkIn: true,
    baseFace: false,
    baseBody: true,
    pose: () =>
      base({
        gaze: { yaw: 5, pitch: 9, roll: 0 },
        split: 17,
        eyes: pair(0.27, 0.17, 14),
        mouth: 0.22,
      }),
    kirbyPose: () =>
      base({
        gaze: { yaw: 0, pitch: 4, roll: 0 },
        eyes: pair(0.2, 0.05, 0, 0),
        arcEyes: 1,
        mouth: 0.5,
      }),
  },
  curious: {
    duration: 2,
    morph: 0.4,
    blinkIn: true,
    baseFace: false,
    baseBody: true,
    pose: () =>
      base({
        gaze: { yaw: 16, pitch: -9, roll: -15 },
        split: 16.5,
        eyes: [eye(0.24, 0.46, -8), eye(0.2, 0.38, -8)],
      }),
    kirbyPose: () =>
      base({
        sil: circle(1, { rot: 0.09 }),
        gaze: { yaw: 16, pitch: -9, roll: -10 },
        eyes: [eye(0.22, 0.48, -6), eye(0.2, 0.42, -6)],
      }),
  },
};

const SEQUENCE = [
  "idle",
  "thinking",
  "wink",
  "wide",
  "alert",
  "notify",
  "exclaim",
  "sleep",
  "egg",
  "hexagon",
  "play",
  "orbit",
  "burst",
  "comet",
];

const KIRBY_SEQUENCE = [
  "idle",
  "wink",
  "wide",
  "happy",
  "inhale",
  "puff",
  "notify",
  "sleep",
  "curious",
  "orbit",
  "burst",
];

function lerpEye(a, b, t) {
  return {
    w: lerp(a.w, b.w, t),
    h: lerp(a.h, b.h, t),
    open: lerp(a.open, b.open, t),
    tilt: lerp(a.tilt ?? 0, b.tilt ?? 0, t),
  };
}

function blendPose(a, b, t) {
  const out = 1 - t;
  return {
    sil: blendSil(a.sil, b.sil, t),
    offX: lerp(a.offX, b.offX, t),
    offY: lerp(a.offY, b.offY, t),
    gaze: {
      yaw: lerp(a.gaze.yaw, b.gaze.yaw, t),
      pitch: lerp(a.gaze.pitch, b.gaze.pitch, t),
      roll: lerp(a.gaze.roll, b.gaze.roll, t),
    },
    split: lerp(a.split, b.split, t),
    eyes: [lerpEye(a.eyes[0], b.eyes[0], t), lerpEye(a.eyes[1], b.eyes[1], t)],
    eyeAlpha: lerp(a.eyeAlpha, b.eyeAlpha, t),
    bodyAlpha: lerp(a.bodyAlpha, b.bodyAlpha, t),
    dots: [
      ...a.dots.map((d) => ({ ...d, opacity: d.opacity * out })),
      ...b.dots.map((d) => ({ ...d, opacity: d.opacity * t })),
    ],
    arcs: [
      ...a.arcs.map((r) => ({ ...r, opacity: r.opacity * out })),
      ...b.arcs.map((r) => ({ ...r, opacity: r.opacity * t })),
    ],
    notif: t < 0.5 ? a.notif : b.notif,
    mouth: lerp(a.mouth, b.mouth, t),
    mouthRound: lerp(a.mouthRound ?? 0, b.mouthRound ?? 0, t),
    arcEyes: lerp(a.arcEyes ?? 0, b.arcEyes ?? 0, t),
    shoes: lerp(a.shoes, b.shoes, t),
    star: lerp(a.star ?? 0, b.star ?? 0, t),
    dotsBehind: t < 0.5 ? a.dotsBehind : b.dotsBehind,
  };
}

class BotEngine {
  constructor() {
    this.cur = "idle";
    this.prev = null;
    this.frozen = null;
    this.tCur = 0;
    this.tPrev = 0;
    this.blinkAt = -10;
    this.expr = "rest";
    this.exprPrev = "rest";
    this.exprAt = -10;
    this.look = { yaw: 0, pitch: 0, mix: 0, wander: 1 };
    this.lookPrev = { ...this.look };
    this.lookAt = -10;
    this.lookMorph = 0.24;
    this.reduced = false;
    this.kirby = false;
  }

  setState(id, now) {
    if (id === this.cur) return;
    if (!STATES[id]) return;
    const morph = STATES[this.cur].morph;
    const mid = this.prev !== null && now - this.tCur < morph;
    this.frozen = mid ? this.composed(now) : null;
    this.prev = this.cur;
    this.tPrev = this.tCur;
    this.cur = id;
    this.tCur = now;
    if (STATES[id].blinkIn) this.blinkAt = now;
  }

  reset(id, now) {
    this.cur = id;
    this.prev = null;
    this.frozen = null;
    this.tCur = now;
    this.tPrev = now;
    this.blinkAt = -10;
  }

  setExpression(id, now) {
    if (id === this.expr) return;
    if (!EXPRESSIONS[id]) return;
    this.exprPrev = this.expr;
    this.expr = id;
    this.exprAt = now;
  }

  setLook(look, now, morph = 0.24) {
    if (look && !Number.isFinite(look.yaw + look.pitch + look.mix + look.wander)) return;
    this.lookPrev = this.lookAtTime(now);
    this.look = look ?? { yaw: 0, pitch: 0, mix: 0, wander: 1 };
    this.lookAt = now;
    this.lookMorph = morph;
  }

  lookAtTime(now) {
    const k = (now - this.lookAt) / this.lookMorph;
    if (k >= 1) return this.look;
    const t = easeOutQuint(clamp(k));
    const a = this.lookPrev;
    const b = this.look;
    return {
      yaw: lerp(a.yaw, b.yaw, t),
      pitch: lerp(a.pitch, b.pitch, t),
      mix: lerp(a.mix, b.mix, t),
      wander: lerp(a.wander, b.wander, t),
    };
  }

  exprAtTime(now) {
    const to = EXPRESSIONS[this.expr];
    const from = EXPRESSIONS[this.exprPrev];
    if (!to || !from || this.expr === this.exprPrev) return to;
    const k = (now - this.exprAt) / 0.45;
    if (k >= 1) return to;
    return blendExpr(from, to, easeOutQuint(clamp(k)));
  }

  posed(def, t, expr) {
    let pose = this.kirby && def.kirbyPose ? def.kirbyPose(t) : def.pose(t);
    if (def.baseFace && expr) {
      const gaze = this.kirby
        ? {
            yaw: (expr.gaze.yaw - REST_GAZE.yaw) * 0.85,
            pitch: (expr.gaze.pitch - REST_GAZE.pitch) * 0.85,
            roll: expr.gaze.roll,
          }
        : expr.gaze;
      pose = { ...pose, gaze, split: expr.split, eyes: expr.eyes, arcEyes: expr.arcEyes ?? 0 };
    }
    return pose;
  }

  remorph(now) {
    // re-enter the current state so a pose-family change morphs instead of snapping
    this.frozen = this.composed(now);
    this.prev = this.cur;
    this.tPrev = this.tCur;
    this.tCur = now;
  }

  origin(now, expr) {
    if (this.frozen) return this.frozen;
    if (!this.prev) return null;
    return this.posed(STATES[this.prev], Math.max(0, now - this.tPrev), expr);
  }

  composed(now) {
    const def = STATES[this.cur];
    const expr = this.exprAtTime(now);
    const pose = this.posed(def, Math.max(0, now - this.tCur), expr);
    const since = now - this.tCur;
    if (since >= def.morph) return pose;
    const orig = this.origin(now, expr);
    if (!orig) return pose;
    return blendPose(orig, pose, easeOutQuint(clamp(since / def.morph)));
  }

  sample(now) {
    const def = STATES[this.cur];
    const expr = this.exprAtTime(now);
    let pose = this.posed(def, Math.max(0, now - this.tCur), expr);
    const since = now - this.tCur;
    const orig = since < def.morph ? this.origin(now, expr) : null;
    if (orig) pose = blendPose(orig, pose, easeOutQuint(clamp(since / def.morph)));

    const alive = pose.eyeAlpha > 0.01;
    const look = this.lookAtTime(now);
    const life = this.reduced
      ? { dYaw: 0, dPitch: 0, dRoll: 0, lid: 1, driftX: 0, driftY: 0, breath: 1 }
      : liveliness(now, { wander: alive ? look.wander : 0, blink: alive });

    const gaze = {
      yaw: lerp(pose.gaze.yaw, look.yaw, look.mix) + life.dYaw,
      pitch: lerp(pose.gaze.pitch, look.pitch, look.mix) + life.dPitch,
      roll: pose.gaze.roll + life.dRoll,
    };

    const forced = clamp((now - this.blinkAt) / 0.2);
    const forcedLid = forced < 1 ? Math.abs(forced * 2 - 1) : 1;
    const lid = Math.min(life.lid, forcedLid);

    const offX = pose.offX + life.driftX;
    const offY = pose.offY + life.driftY;
    const sil = {
      ...pose.sil,
      cx: pose.sil.cx + offX,
      cy: pose.sil.cy + offY,
      sy: pose.sil.sy * life.breath,
    };

    const eyes = [];
    if (pose.eyeAlpha > 0.01) {
      const poses = eyePoses(gaze, 1, pose.split);
      for (let i = 0; i < 2; i++) {
        const e = poses[i];
        if (e.depth <= 0.02) continue;
        const cfg = pose.eyes[i];
        const fit = radiusAt(pose.sil.radii, Math.atan2(e.y, e.x) - pose.sil.rot);
        const phi = ((cfg.tilt ?? 0) * Math.PI) / 180;
        const cp = Math.cos(phi);
        const sp = Math.sin(phi);
        const ax = e.a * cp + e.c * sp;
        const ay = e.b * cp + e.d * sp;
        const cx2 = -e.a * sp + e.c * cp;
        const cy2 = -e.b * sp + e.d * cp;
        const k = blinkScale(Math.min(lid, cfg.open));
        eyes.push({
          x: e.x * fit + offX,
          y: e.y * fit + offY,
          a: ax,
          b: ay * k,
          c: cx2,
          d: cy2 * k,
          w: cfg.w,
          h: cfg.h,
          open: Math.min(lid, cfg.open),
          tilt: cfg.tilt ?? 0,
          alpha: pose.eyeAlpha * clamp(e.depth / 0.12),
          depth: e.depth,
        });
      }
    }

    let notif = null;
    if (pose.notif) {
      const nFit = radiusAt(pose.sil.radii, Math.atan2(pose.notif.y, pose.notif.x) - pose.sil.rot);
      notif = {
        x: pose.notif.x * nFit + offX,
        y: pose.notif.y * nFit + offY,
        r: pose.notif.r,
        notch: pose.notif.notch,
      };
    }

    return {
      sil,
      eyes,
      dots: pose.dots
        .filter((d) => d.opacity > 0.01 && d.r > 0.0005)
        .map((d) => ({ ...d, x: d.x + offX, y: d.y + offY })),
      arcs: pose.arcs.filter((a) => a.opacity > 0.01),
      notif,
      mouth: pose.mouth,
      mouthRound: pose.mouthRound ?? 0,
      arcEyes: pose.arcEyes ?? 0,
      shoes: pose.shoes,
      star: pose.star ?? 0,
      eyeAlpha: pose.eyeAlpha,
      bodyAlpha: pose.bodyAlpha,
      gaze,
      lid,
    };
  }
}

window.GrokBotEngine = {
  BotEngine,
  STATES,
  SEQUENCE,
  KIRBY_SEQUENCE,
  EXPRESSIONS,
  REST_GAZE,
  NOTIF_BLUE,
  wheel,
  TAU,
  clamp,
  lerp,
};
