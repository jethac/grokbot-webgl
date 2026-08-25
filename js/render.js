/* WebGL2 SDF rasterizer for the Grok Bot. Grok mode is a flat ink cutout.
   Kirby mode is a cel-shaded puffball driven by the same state engine:
   the silhouette transform (scale, offset, spin, squash) moves the whole
   body, so every animation state reads as Kirby. Face follows @Kirby_JP /
   Kirby Super Star Ultra proportions. */

const VERT = `#version 300 es
in vec2 aPos;
void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAG = `#version 300 es
precision highp float;

uniform vec2 uRes;
uniform float uTime;
uniform float uKirby;
uniform float uScale;
uniform vec2 uCenter;
uniform float uRadii[64];
uniform vec4 uSil;          // rot, cx, cy, unused
uniform vec2 uSquash;       // sx, sy
uniform float uSilScale;    // mean silhouette radius
uniform float uBodyAlpha;
uniform vec4 uEyePos[2];    // xy, w, h
uniform vec4 uEyeMat[2];    // a b c d
uniform vec2 uEyeA;         // alpha per eye
uniform int uEyeN;
uniform vec4 uKEye;         // openL, sizeL, openR, sizeR
uniform vec2 uKTilt;        // eye tilt (deg) per eye
uniform float uFaceAlpha;
uniform float uArcEyes;     // 1 = happy closed arcs
uniform float uMouthRound;  // 0 smile .. 1 round O
uniform vec4 uDots[8];      // xy r opacity
uniform vec2 uDotMeta[8];   // kind, rot-deg
uniform int uDotN;
uniform vec4 uNotif;        // xy r notch
uniform float uNotifOn;
uniform float uMouth;
uniform float uShoes;
uniform float uStar;
uniform vec4 uArcA[8];      // a, k, tilt, width
uniform vec4 uArcB[8];      // speed, phase, sweep, opacity
uniform vec4 uArcC[8];      // hue, hueSpan, cx, cy
uniform float uArcT[8];
uniform int uArcN;
uniform vec2 uGaze;         // yaw, pitch (deg)
uniform float uReduced;

out vec4 fragColor;

const float PI = 3.14159265359;
const float TAU = 6.28318530718;

float smin(float a, float b, float k){
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

mat2 rot(float a){
  float c = cos(a), s = sin(a);
  return mat2(c, s, -s, c);
}

float hash(vec2 p){
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

vec3 wheel(float hue, float s, float l){
  float h = mod(hue, 360.0);
  float c = (1.0 - abs(2.0 * l - 1.0)) * s;
  float x = c * (1.0 - abs(mod(h / 60.0, 2.0) - 1.0));
  float m = l - c * 0.5;
  vec3 rgb;
  if(h < 60.0) rgb = vec3(c, x, 0.0);
  else if(h < 120.0) rgb = vec3(x, c, 0.0);
  else if(h < 180.0) rgb = vec3(0.0, c, x);
  else if(h < 240.0) rgb = vec3(0.0, x, c);
  else if(h < 300.0) rgb = vec3(x, 0.0, c);
  else rgb = vec3(c, 0.0, x);
  return rgb + m;
}

float radiusAt(float ang){
  float t = fract(ang / TAU) * 64.0;
  float i = floor(t);
  float f = t - i;
  int i0 = int(i);
  int i1 = int(mod(i + 1.0, 64.0));
  return mix(uRadii[i0], uRadii[i1], f);
}

float sdProfile(vec2 p){
  vec2 q = p - vec2(uSil.y, uSil.z);
  q.x /= max(uSquash.x, 1e-4);
  q.y /= max(uSquash.y, 1e-4);
  q = rot(-uSil.x) * q;
  float r = length(q);
  float ang = atan(q.y, q.x);
  float target = radiusAt(ang);
  float d = r - target;
  return d * min(uSquash.x, uSquash.y);
}

float sdCircle(vec2 p, float r){ return length(p) - r; }

float sdEllipse(vec2 p, vec2 r){
  float k = min(r.x, r.y);
  return (length(p / r) - 1.0) * k;
}

float sdRoundedBox(vec2 p, vec2 b, float r){
  vec2 q = abs(p) - b + r;
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
}

float sdCapsuleEye(vec2 p, vec4 m, vec2 pos, float w, float h){
  // world = pos + [a c; b d] * local
  float det = m.x * m.w - m.z * m.y;
  if(abs(det) < 1e-5) return 1e5;
  vec2 d = p - pos;
  vec2 local = vec2(m.w * d.x - m.z * d.y, -m.y * d.x + m.x * d.y) / det;
  float hw = max(w, 0.01) * 0.5;
  float hh = max(h, 0.01) * 0.5;
  float rad = min(hw, hh);
  return sdRoundedBox(local, vec2(hw, hh), rad);
}

float sdTeardrop(vec2 p, float rotDeg){
  vec2 q = rot(-rotDeg * PI / 180.0) * p;
  float dBall = length(q) - 0.72;
  float dTip = sdEllipse(q - vec2(0.0, 0.95), vec2(0.22, 0.55));
  return smin(dBall, dTip, 0.18);
}

float sdStar5(vec2 p, float r, float rf){
  const vec2 k1 = vec2(0.809016994375, -0.587785252292);
  const vec2 k2 = vec2(-k1.x, k1.y);
  p.x = abs(p.x);
  p -= 2.0 * max(dot(k1, p), 0.0) * k1;
  p -= 2.0 * max(dot(k2, p), 0.0) * k2;
  p.x = abs(p.x);
  p.y -= r;
  vec2 ba = rf * vec2(-k1.y, k1.x) - vec2(0.0, 1.0);
  float h = clamp(dot(p, ba) / dot(ba, ba), 0.0, r);
  return length(p - ba * h) * sign(p.y * ba.x - p.x * ba.y);
}

float sdZ(vec2 p){
  // unit "Z" glyph in roughly [-0.5, 0.5]
  float top = sdRoundedBox(p - vec2(0.0, -0.34), vec2(0.32, 0.085), 0.06);
  float bot = sdRoundedBox(p - vec2(0.0, 0.34), vec2(0.32, 0.085), 0.06);
  float diag = sdRoundedBox(rot(-0.82) * p, vec2(0.42, 0.082), 0.06);
  return min(min(top, bot), diag);
}

float sdArcStroke(vec2 p, vec4 A, vec4 B, vec4 C, float t){
  float ra = max(A.x, 0.05);
  float k = max(A.y, 0.04);
  float tilt = A.z;
  float width = max(A.w, 0.02);
  float speed = B.x, phase = B.y, sweep = clamp(B.z, 0.05, 1.0);
  vec2 q = rot(-tilt) * (p - C.zw);
  q.y /= k;
  float ang = atan(q.y, q.x);
  float start = phase + t * speed * TAU;
  float span = sweep * TAU;
  float rel = mod(ang - start + PI, TAU) - PI;
  float dCirc = abs(length(q) - ra);
  float d;
  if(abs(rel) < span * 0.5){
    d = dCirc;
  } else {
    vec2 p0 = vec2(cos(start), sin(start)) * ra;
    vec2 p1 = vec2(cos(start + span), sin(start + span)) * ra;
    d = min(length(q - p0), length(q - p1));
  }
  d = d * mix(k, 1.0, 0.5) - width * 0.5;
  return d;
}

float cover(float d, float lo, float hi){
  return 1.0 - smoothstep(lo, hi, d);
}

/* ------------------------------------------------------------- grok scene */

vec3 grokScene(vec2 p, vec2 uv, float aa){
  vec3 paper = vec3(0.949, 0.941, 0.918);

  float dBody = sdProfile(p);

  // extra body dots (thinking, particles, !)
  float dDots = 1e5;
  for(int i = 0; i < 8; i++){
    if(i >= uDotN) break;
    vec4 D = uDots[i];
    if(D.w < 0.01) continue;
    if(uDotMeta[i].x > 1.5) continue;
    vec2 q = p - D.xy;
    float dd;
    if(uDotMeta[i].x > 0.5){
      dd = sdTeardrop(q / max(D.z, 0.01), uDotMeta[i].y) * D.z;
    } else {
      dd = sdCircle(q, D.z);
    }
    dDots = min(dDots, dd);
  }

  float dInk = smin(dBody, dDots, 0.04);

  // notification notch — concentric hole
  float dBadge = 1e5;
  if(uNotifOn > 0.5){
    dBadge = sdCircle(p - uNotif.xy, uNotif.z);
    float dNotch = sdCircle(p - uNotif.xy, uNotif.w);
    dInk = max(dInk, -dNotch);
  }

  // contact shadow
  float sh = length((p - vec2(uSil.y, uSil.z + 1.05)) * vec2(0.92, 2.4)) - 0.42;
  float shadow = exp(-max(sh, 0.0) * max(sh, 0.0) * 10.0) * 0.10;
  shadow *= cover(dInk, -0.05, 0.35);
  vec3 col = paper - shadow * vec3(0.18, 0.16, 0.14);

  // arcs behind
  for(int i = 0; i < 8; i++){
    if(i >= uArcN) break;
    float op = uArcB[i].w;
    if(op < 0.01) continue;
    float dA = sdArcStroke(p, uArcA[i], uArcB[i], uArcC[i], uArcT[i]);
    vec3 ac = wheel(uArcC[i].x + uArcC[i].y * 0.5, 0.55, 0.62);
    float m = 1.0 - smoothstep(-aa, aa, dA);
    m *= mix(1.0, 0.15, 1.0 - smoothstep(aa, -aa, dInk));
    col = mix(col, ac, m * op);
  }

  // body fill
  float bodyMask = (1.0 - smoothstep(-aa, aa, dInk)) * uBodyAlpha;
  vec3 grokInk = vec3(0.047, 0.047, 0.047);
  col = mix(col, grokInk, bodyMask);

  // eyes: paper holes
  for(int i = 0; i < 2; i++){
    if(i >= uEyeN) break;
    if(uEyeA[i] < 0.02) continue;
    float dE = sdCapsuleEye(p, uEyeMat[i], uEyePos[i].xy, uEyePos[i].z, uEyePos[i].w);
    float em = (1.0 - smoothstep(-aa, aa, dE)) * uEyeA[i];
    col = mix(col, paper, em);
  }

  // arcs in front (thin residual outside the body)
  for(int i = 0; i < 8; i++){
    if(i >= uArcN) break;
    float op = uArcB[i].w;
    if(op < 0.01) continue;
    float dA = sdArcStroke(p, uArcA[i], uArcB[i], uArcC[i], uArcT[i]);
    vec3 ac = wheel(uArcC[i].x + uArcC[i].y * 0.35, 0.58, 0.64);
    float m = 1.0 - smoothstep(-aa, aa, dA);
    m *= smoothstep(-aa, aa, dInk);
    col = mix(col, ac, m * op);
  }

  // blue badge
  if(uNotifOn > 0.5){
    float bm = 1.0 - smoothstep(-aa, aa, dBadge);
    col = mix(col, vec3(0.141, 0.588, 0.910), bm);
  }

  return col;
}

/* ------------------------------------------------------------ kirby scene */

vec3 kirbySky(vec2 uv){
  float g = clamp(uv.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 top = vec3(0.52, 0.80, 0.97);
  vec3 mid = vec3(0.70, 0.89, 0.99);
  vec3 bot = vec3(0.80, 0.93, 0.90);
  vec3 col = mix(bot, mid, smoothstep(0.0, 0.42, g));
  col = mix(col, top, smoothstep(0.42, 1.0, g));
  // puffy clouds
  float c1 = cover(length((uv - vec2(-0.70, 0.30)) * vec2(1.0, 1.55)), 0.09, 0.24);
  float c2 = cover(length((uv - vec2(-0.56, 0.27)) * vec2(1.1, 1.7)), 0.07, 0.18);
  float c3 = cover(length((uv - vec2(0.72, 0.36)) * vec2(1.0, 1.65)), 0.08, 0.22);
  float c4 = cover(length((uv - vec2(0.60, 0.33)) * vec2(1.15, 1.8)), 0.06, 0.16);
  col = mix(col, vec3(1.0, 0.99, 0.97), clamp(c1 + c2 + c3 + c4, 0.0, 1.0) * 0.55);
  // rolling green hills, Green Greens style, kept low behind the footer
  float h1 = length((uv - vec2(-0.62, -1.78)) * vec2(1.0, 1.4)) - 1.38;
  float h2 = length((uv - vec2(0.66, -1.86)) * vec2(1.0, 1.35)) - 1.46;
  vec3 hillFar = vec3(0.72, 0.90, 0.62);
  vec3 hillNear = vec3(0.58, 0.85, 0.50);
  col = mix(col, hillFar, cover(h2, 0.0, 0.02) * 0.85);
  col = mix(col, hillNear, cover(h1, 0.0, 0.02) * 0.9);
  return col;
}

float sdSphere3(vec3 p, float r){ return length(p) - r; }

float sdEllipsoid3(vec3 p, vec3 r){
  float k0 = length(p / r);
  float k1 = length(p / (r * r));
  return k0 * (k0 - 1.0) / max(k1, 1e-4);
}

// canonical Kirby: body sphere r 0.70 at y +0.18 (y-up), feet below. id 1 = feet.
vec2 mapKirby(vec3 p){
  float body = sdSphere3(p - vec3(0.0, 0.18, 0.0), 0.70);
  float swing = uReduced > 0.5 ? 0.0 : 0.04 * sin(uTime * 2.1);
  float armL = sdSphere3(p - vec3(-0.585, 0.25 + swing, -0.12), 0.185);
  float armR = sdSphere3(p - vec3( 0.585, 0.25 - swing * 0.7, -0.12), 0.185);
  float flesh = smin(body, min(armL, armR), 0.04);

  float feet = 1e5;
  if(uShoes > 0.02){
    float fs = smoothstep(0.0, 1.0, uShoes);
    vec3 fl = p - vec3(-0.335, mix(-0.38, -0.60, fs), 0.10);
    fl.xz = rot(0.42) * fl.xz;
    fl.xy = rot(-0.22) * fl.xy;
    float footL = sdEllipsoid3(fl, vec3(0.30, 0.165, 0.19) * (0.45 + 0.55 * fs));
    vec3 fr = p - vec3( 0.335, mix(-0.38, -0.60, fs), 0.10);
    fr.xz = rot(-0.42) * fr.xz;
    fr.xy = rot(0.22) * fr.xy;
    float footR = sdEllipsoid3(fr, vec3(0.30, 0.165, 0.19) * (0.45 + 0.55 * fs));
    feet = smin(footL, footR, 0.04);
  }

  float d = smin(flesh, feet, 0.025);
  return vec2(d, feet < flesh ? 1.0 : 0.0);
}

vec3 kirbyNormal(vec3 p){
  vec2 e = vec2(0.0018, -0.0018);
  return normalize(
    e.xyy * mapKirby(p + e.xyy).x +
    e.yyx * mapKirby(p + e.yyx).x +
    e.yxy * mapKirby(p + e.yxy).x +
    e.xxx * mapKirby(p + e.xxx).x
  );
}

// Official eye: tall narrow oval, near-black; white gloss = top ~38%;
// inset blue patch at the bottom, brightening downward. Closed = drawn line.
void kirbyEye(inout vec3 col, vec2 f, vec2 c, float open, float size, float tiltDeg, float aa2){
  vec2 e = rot(tiltDeg * PI / 180.0) * (f - c);
  float hh = 0.2275 * size;
  float ww = 0.075 * (0.88 + 0.12 * size);
  vec3 ink = vec3(0.043, 0.043, 0.10);
  float oo = clamp(open, 0.0, 1.0);

  float ovalA = smoothstep(0.16, 0.30, oo);
  if(ovalA > 0.003){
    float oEase = smoothstep(0.16, 1.0, oo);
    float hEff = hh * mix(0.22, 1.0, oEase);
    float wEff = ww * mix(0.78, 1.0, oEase);
    float dW = sdEllipse(e, vec2(wEff, hEff));
    float m = cover(dW, -aa2, aa2) * ovalA;
    if(m > 0.003){
      vec3 eyeC = ink;
      // blue bottom patch, inset from the rim
      vec2 bc = vec2(0.0, hEff * 0.54);
      float dB = max(dW + 0.014, sdEllipse(e - bc, vec2(wEff * 0.85, hEff * 0.46)));
      float g = clamp((e.y - (bc.y - hEff * 0.46)) / max(hEff * 0.92, 1e-4), 0.0, 1.0);
      vec3 blue = mix(vec3(0.075, 0.16, 0.45), vec3(0.30, 0.64, 0.93), smoothstep(0.1, 1.0, g));
      eyeC = mix(eyeC, blue, cover(dB, -aa2, aa2));
      // white gloss on top
      vec2 wr = vec2(wEff * 0.74, hEff * 0.40);
      float dHi = max(dW + 0.006, sdEllipse(e - vec2(0.0, -hEff + wr.y + hEff * 0.10), wr));
      eyeC = mix(eyeC, vec3(0.995), cover(dHi, -aa2, aa2));
      col = mix(col, eyeC, m);
    }
  }

  float lineA = 1.0 - smoothstep(0.10, 0.24, oo);
  if(lineA > 0.003){
    vec2 el = rot(-1.6 * tiltDeg * PI / 180.0) * e;
    float R0 = 0.34;
    float y0 = 0.05;
    float cap = cover(abs(el.x), ww * 1.45, ww * 2.25);
    // relaxed closed eye: arc bowing down (ends up); keep only the near side
    float dU = abs(length(el - vec2(0.0, y0 - R0)) - R0) - 0.032;
    float sideU = step(y0 - R0, el.y);
    float mU = cover(dU, -aa2, aa2) * cap * sideU * lineA * (1.0 - uArcEyes);
    col = mix(col, ink, mU);
    // happy closed eye: arc bowing up
    if(uArcEyes > 0.003){
      float cN = y0 + R0 - 0.10;
      float dN = abs(length(el - vec2(0.0, cN)) - R0) - 0.032;
      float sideN = step(el.y, cN);
      float mN = cover(dN, -aa2, aa2) * cap * sideN * lineA * uArcEyes;
      col = mix(col, ink, mN);
    }
  }
}

void kirbyMouth(inout vec3 col, vec2 f, float aa2){
  float m = clamp(uMouth, 0.0, 1.0);
  float rnd = clamp(uMouthRound, 0.0, 1.0);
  vec3 lineC = vec3(0.30, 0.08, 0.17);

  // resting line smile
  float restA = 1.0 - smoothstep(0.03, 0.075, m);
  if(restA > 0.003){
    float R0 = 0.30;
    float dArc = abs(length(f - vec2(0.0, -0.035 - R0)) - R0) - 0.013;
    float capX = cover(abs(f.x), 0.052, 0.095);
    float side = step(-0.035 - R0, f.y);
    col = mix(col, lineC, cover(dArc, -aa2, aa2) * capX * side * restA);
  }

  float openA = smoothstep(0.03, 0.10, m);
  if(openA > 0.003){
    float mw = (0.055 + 0.305 * pow(m, 1.1)) * mix(1.15, 0.95, rnd);
    float mh = mw * mix(0.66, 1.0, rnd);
    float yTop = -0.095;
    vec2 mc = vec2(0.0, yTop + mh);
    float dM = sdEllipse(f - mc, vec2(mw, mh));
    // smile: arch the top edge flat-ish
    float dCut = -(f.y - (mc.y - mh * 0.58));
    float d2 = max(dM, mix(dCut, dM, rnd));
    float fill = cover(d2, -aa2, aa2) * openA;
    if(fill > 0.003){
      float g = clamp((f.y - (mc.y - mh)) / max(2.0 * mh, 1e-4), 0.0, 1.0);
      float deep = smoothstep(0.45, 0.95, m) * rnd;
      vec3 cavTop = mix(vec3(0.37, 0.07, 0.15), vec3(0.17, 0.03, 0.08), deep);
      vec3 cavBot = mix(vec3(0.63, 0.14, 0.25), vec3(0.32, 0.07, 0.13), deep);
      vec3 cav = mix(cavTop, cavBot, g);
      // tongue for the open smile
      float tA = (1.0 - smoothstep(0.3, 0.75, rnd)) * smoothstep(0.12, 0.3, m);
      if(tA > 0.003){
        vec2 tc = mc + vec2(0.0, mh * 0.42);
        float dT = max(d2 + 0.010, sdEllipse(f - tc, vec2(mw * 0.72, mh * 0.55)));
        cav = mix(cav, vec3(0.93, 0.38, 0.47), cover(dT, -aa2, aa2) * tA);
      }
      col = mix(col, cav, fill);
    }
    // outline
    float ol = cover(abs(d2) - 0.012, -aa2, aa2) * openA;
    col = mix(col, vec3(0.18, 0.04, 0.10), ol);
  }
}

void kirbyBlush(inout vec3 col, vec2 f, float aa2){
  for(int i = 0; i < 2; i++){
    float sx = i == 0 ? -1.0 : 1.0;
    vec2 e = rot(sx * 0.20) * (f - vec2(sx * 0.372, -0.225));
    float d = sdEllipse(e, vec2(0.104, 0.056));
    col = mix(col, vec3(0.945, 0.447, 0.498), cover(d, -0.006, 0.014) * 0.97);
  }
}

vec3 kirbyScene(vec2 p, vec2 uv, float aa){
  vec3 col = kirbySky(uv);

  float scl = max(uSilScale, 0.02);
  float sqMin = max(min(uSquash.x, uSquash.y), 1e-4);
  float aa2 = min(aa / (scl * sqMin), 0.05);

  // canonical space
  vec2 q = p - vec2(uSil.y, uSil.z);
  q.x /= max(uSquash.x, 1e-4);
  q.y /= max(uSquash.y, 1e-4);
  q = rot(-uSil.x) * q;
  q /= scl;

  // ground shadow
  float bottomY = uSil.z + (0.52 + 0.30 * uShoes) * scl * uSquash.y;
  float sfade = clamp(1.0 - (1.0 - bottomY) * 1.5, 0.0, 1.0);
  float sw = 0.55 * scl + 0.24;
  float sh = length((p - vec2(uSil.y, 1.04)) * vec2(1.0 / sw, 3.2)) - 1.0;
  col -= exp(-max(sh, 0.0) * max(sh, 0.0) * 8.0) * 0.20 * sfade * vec3(0.16, 0.13, 0.08);

  // body proxy for dimming decor behind the puff
  float dProxy = length(p - vec2(uSil.y, uSil.z)) - scl * 0.86;

  // rings behind
  for(int i = 0; i < 8; i++){
    if(i >= uArcN) break;
    float op = uArcB[i].w;
    if(op < 0.01) continue;
    float dA = sdArcStroke(p, uArcA[i], uArcB[i], uArcC[i], uArcT[i]);
    vec3 ac = wheel(uArcC[i].x + uArcC[i].y * 0.5, 0.52, 0.74);
    float m = 1.0 - smoothstep(-aa, aa, dA);
    m *= mix(1.0, 0.22, cover(dProxy, -aa, aa));
    col = mix(col, ac, m * op);
  }

  // warp star trailing the tumble
  if(uStar > 0.02){
    float sr = uSil.x - 1.15;
    vec2 sp0 = vec2(-sin(sr), cos(sr)) * 0.98;
    vec2 sq = rot(uSil.x * 0.12 + 0.15) * (p - sp0);
    float dS = sdStar5(sq, 0.30, 0.46);
    float m = cover(dS, -aa * 1.4, aa) * uStar;
    float ring = cover(abs(dS) - 0.017, -aa, aa) * uStar;
    vec3 starC = mix(vec3(1.0, 0.91, 0.47), vec3(1.0, 0.77, 0.15), smoothstep(-0.24, 0.0, dS));
    col = mix(col, starC, m);
    col = mix(col, vec3(0.24, 0.11, 0.24), ring);
  }

  // burst sparkles (dot kind 0) behind the body
  for(int i = 0; i < 8; i++){
    if(i >= uDotN) break;
    vec4 D = uDots[i];
    if(D.w < 0.01 || uDotMeta[i].x > 0.5) continue;
    vec2 sq = rot(uTime * 1.6 + float(i) * 1.7) * (p - D.xy);
    float dS = sdStar5(sq, D.z * 1.8, 0.48);
    vec3 sc = mix(vec3(1.0, 0.87, 0.44), vec3(1.0, 0.66, 0.78), fract(float(i) * 0.37));
    col = mix(col, sc, cover(dS, -aa * 1.4, aa) * D.w);
  }

  // ---- the puffball ----
  vec3 ro = vec3(q.x, -q.y, -2.6);
  vec3 rd = vec3(0.0, 0.0, 1.0);
  float outw = 0.052 / clamp(scl, 0.35, 1.6);

  float t = 0.0;
  vec2 h = vec2(1.0, 0.0);
  bool hitBody = false;
  for(int i = 0; i < 56; i++){
    h = mapKirby(ro + rd * t);
    if(h.x < 0.0012){ hitBody = true; break; }
    t += h.x;
    if(t > 5.5) break;
  }

  if(!hitBody){
    // outline hull
    t = 0.0;
    for(int i = 0; i < 40; i++){
      float d = mapKirby(ro + rd * t).x - outw;
      if(d < 0.0012){
        col = vec3(0.18, 0.07, 0.19);
        hitBody = false;
        t = -1.0;
        break;
      }
      t += d;
      if(t > 5.5) break;
    }
  } else {
    vec3 hit = ro + rd * t;
    vec3 N = kirbyNormal(hit);
    vec3 L = normalize(vec3(-0.32, 0.74, -0.58));
    float ndl = dot(N, L);
    float cel = smoothstep(0.08, 0.115, ndl);
    float deep = smoothstep(-0.34, -0.30, ndl);

    vec3 body;
    if(h.y > 0.5){
      vec3 footLit = vec3(0.855, 0.110, 0.361);
      vec3 footSh = vec3(0.647, 0.055, 0.267);
      body = mix(footSh, footLit, cel);
      // cel gloss spot
      vec3 half_ = normalize(L + vec3(0.0, 0.0, -1.0));
      float spec = smoothstep(0.855, 0.875, dot(N, half_));
      body = mix(body, vec3(0.96, 0.42, 0.49), spec * 0.9);
    } else {
      vec3 lit = vec3(0.980, 0.659, 0.773);
      vec3 shade = vec3(0.933, 0.498, 0.663);
      vec3 deepC = vec3(0.870, 0.400, 0.590);
      body = mix(mix(deepC, shade, deep), lit, cel);
    }

    // face on the front of the body
    if(h.y < 0.5 && N.z < -0.10 && uFaceAlpha > 0.005){
      vec2 f = vec2(hit.x, -hit.y);
      vec3 faceCol = body;
      vec2 gOff = vec2(clamp(uGaze.x, -40.0, 40.0) * 0.0016,
                       clamp(-uGaze.y, -34.0, 34.0) * 0.0013);
      kirbyBlush(faceCol, f - gOff * 0.5, aa2);
      kirbyMouth(faceCol, f - gOff * 0.6, aa2);
      kirbyEye(faceCol, f, vec2(-0.154, -0.355) + gOff, uKEye.x, uKEye.y, uKTilt.x, aa2);
      kirbyEye(faceCol, f, vec2( 0.154, -0.355) + gOff, uKEye.z, uKEye.w, uKTilt.y, aa2);
      body = mix(body, faceCol, uFaceAlpha);
    }
    col = body;
  }

  // sleep Zs (dot kind 2), in front
  for(int i = 0; i < 8; i++){
    if(i >= uDotN) break;
    vec4 D = uDots[i];
    if(D.w < 0.01 || uDotMeta[i].x < 1.5) continue;
    vec2 zq = rot(uDotMeta[i].y * PI / 180.0) * (p - D.xy) / max(D.z, 0.01);
    float dZ = sdZ(zq) * D.z;
    col = mix(col, vec3(0.94, 0.97, 1.0), cover(dZ, -aa, aa) * D.w);
    col = mix(col, vec3(0.24, 0.13, 0.28), cover(abs(dZ) - 0.008, -aa, aa) * D.w * 0.85);
  }

  // notification badge rides on top, sticker-style
  if(uNotifOn > 0.5){
    float dB = sdCircle(p - uNotif.xy, uNotif.z);
    col = mix(col, vec3(0.141, 0.588, 0.910), cover(dB, -aa, aa));
    col = mix(col, vec3(0.18, 0.07, 0.19), cover(abs(dB) - 0.016, -aa, aa));
  }

  return col;
}

void main(){
  vec2 frag = gl_FragCoord.xy;
  // Model space is y-down (same as the reference film). gl_FragCoord is y-up.
  vec2 p = (frag - uCenter) / uScale;
  p.y = -p.y;
  vec2 uv = (frag - 0.5 * uRes) / uRes.y;
  float aa = 1.5 / uScale;

  vec3 col;
  float kf = smoothstep(0.05, 0.85, uKirby);
  if(kf < 0.004){
    col = grokScene(p, uv, aa);
  } else if(kf > 0.996){
    col = kirbyScene(p, uv, aa);
  } else {
    col = mix(grokScene(p, uv, aa), kirbyScene(p, uv, aa), kf);
  }

  // vignette, tiny grain
  col *= 1.0 - 0.08 * uKirby * dot(uv, uv);
  col += (hash(frag + uTime * 17.0) - 0.5) * 0.015;

  fragColor = vec4(col, 1.0);
}
`;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(s));
  }
  return s;
}

function createRenderer(canvas) {
  const gl = canvas.getContext("webgl2", {
    antialias: false,
    alpha: false,
    premultipliedAlpha: false,
    powerPreference: "high-performance",
  });
  if (!gl) throw new Error("WebGL2 required");

  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.bindAttribLocation(prog, 0, "aPos");
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(prog));
  }
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const U = {};
  const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(prog, i);
    const name = info.name.replace(/\[0\]$/, "");
    U[name] = gl.getUniformLocation(prog, name);
  }

  const radii = new Float32Array(64);
  const sstep = (a, b, x) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, canvas.clientWidth);
    const h = Math.max(1, canvas.clientHeight);
    const W = Math.round(w * dpr);
    const H = Math.round(h * dpr);
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W;
      canvas.height = H;
    }
    gl.viewport(0, 0, W, H);
    return { W, H, dpr };
  }

  function draw(frame, kirby, now, reduced) {
    const { W, H } = resize();
    gl.useProgram(prog);
    const portrait = H > W * 1.15;
    const R = Math.min(W, H) * (portrait ? 0.21 : 0.26);
    const cx = W * 0.5;
    const cy = H * (portrait ? 0.50 : 0.46 + 0.03 * kirby);

    let meanR = 0;
    for (let i = 0; i < 64; i++) {
      radii[i] = frame.sil.radii[i] ?? 1;
      meanR += radii[i];
    }
    meanR /= 64;

    gl.uniform2f(U.uRes, W, H);
    gl.uniform1f(U.uTime, now);
    gl.uniform1f(U.uKirby, kirby);
    gl.uniform1f(U.uScale, R);
    gl.uniform2f(U.uCenter, cx, cy);
    gl.uniform1fv(U.uRadii, radii);
    gl.uniform4f(U.uSil, frame.sil.rot, frame.sil.cx, frame.sil.cy, 0);
    gl.uniform2f(U.uSquash, frame.sil.sx, frame.sil.sy);
    gl.uniform1f(U.uSilScale, meanR);
    gl.uniform1f(U.uBodyAlpha, frame.bodyAlpha);
    gl.uniform1f(U.uReduced, reduced ? 1 : 0);

    const nEyes = Math.min(2, frame.eyes.length);
    gl.uniform1i(U.uEyeN, nEyes);
    const pos = [];
    const mat = [];
    const alpha = [0, 0];
    const kEye = [1, 1, 1, 1];
    const kTilt = [0, 0];
    for (let i = 0; i < 2; i++) {
      const e = frame.eyes[i];
      if (e) {
        pos.push(e.x, e.y, e.w, e.h);
        mat.push(e.a, e.b, e.c, e.d);
        alpha[i] = e.alpha;
        kEye[i * 2] = sstep(0.12, 0.38, e.h) * sstep(0.0, 0.75, e.open ?? 1);
        kEye[i * 2 + 1] = 1 + 0.28 * sstep(0.45, 0.85, e.h);
        kTilt[i] = e.tilt ?? 0;
      } else {
        pos.push(0, 0, 0.1, 0.1);
        mat.push(1, 0, 0, 1);
      }
    }
    gl.uniform4fv(U.uEyePos, pos);
    gl.uniform4fv(U.uEyeMat, mat);
    gl.uniform2f(U.uEyeA, alpha[0], alpha[1]);
    gl.uniform4f(U.uKEye, kEye[0], kEye[1], kEye[2], kEye[3]);
    gl.uniform2f(U.uKTilt, kTilt[0], kTilt[1]);
    gl.uniform1f(U.uFaceAlpha, frame.eyeAlpha ?? (frame.eyes.length ? 1 : 0));
    gl.uniform1f(U.uArcEyes, frame.arcEyes || 0);
    gl.uniform1f(U.uMouthRound, frame.mouthRound || 0);
    gl.uniform2f(U.uGaze, frame.gaze.yaw, frame.gaze.pitch);

    const dots = frame.dots.slice(0, 8);
    gl.uniform1i(U.uDotN, dots.length);
    const dv = new Float32Array(32);
    const dm = new Float32Array(16);
    for (let i = 0; i < 8; i++) {
      const d = dots[i];
      if (d) {
        dv[i * 4] = d.x;
        dv[i * 4 + 1] = d.y;
        dv[i * 4 + 2] = d.r;
        dv[i * 4 + 3] = d.opacity;
        dm[i * 2] = d.kind || 0;
        dm[i * 2 + 1] = d.rot || 0;
      }
    }
    gl.uniform4fv(U.uDots, dv);
    gl.uniform2fv(U.uDotMeta, dm);

    if (frame.notif) {
      gl.uniform1f(U.uNotifOn, 1);
      gl.uniform4f(U.uNotif, frame.notif.x, frame.notif.y, frame.notif.r, frame.notif.notch);
    } else {
      gl.uniform1f(U.uNotifOn, 0);
      gl.uniform4f(U.uNotif, 0, 0, 0, 0);
    }

    gl.uniform1f(U.uMouth, frame.mouth);
    gl.uniform1f(U.uShoes, frame.shoes);
    gl.uniform1f(U.uStar, frame.star);

    const arcs = frame.arcs.slice(0, 8);
    gl.uniform1i(U.uArcN, arcs.length);
    const aA = new Float32Array(32);
    const aB = new Float32Array(32);
    const aC = new Float32Array(32);
    const aT = new Float32Array(8);
    for (let i = 0; i < 8; i++) {
      const a = arcs[i];
      if (!a) continue;
      aA[i * 4] = a.a;
      aA[i * 4 + 1] = a.k;
      aA[i * 4 + 2] = a.tilt;
      aA[i * 4 + 3] = a.width;
      aB[i * 4] = a.speed;
      aB[i * 4 + 1] = a.phase;
      aB[i * 4 + 2] = a.sweep;
      aB[i * 4 + 3] = a.opacity;
      aC[i * 4] = a.hue;
      aC[i * 4 + 1] = a.hueSpan;
      aC[i * 4 + 2] = a.cx;
      aC[i * 4 + 3] = a.cy;
      aT[i] = a.t;
    }
    gl.uniform4fv(U.uArcA, aA);
    gl.uniform4fv(U.uArcB, aB);
    gl.uniform4fv(U.uArcC, aC);
    gl.uniform1fv(U.uArcT, aT);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  return { gl, draw, resize };
}

window.createBotRenderer = createRenderer;
