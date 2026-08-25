/* WebGL2 SDF rasterizer for the Grok Bot. Grok mode is a flat ink cutout.
   Kirby mode lights the same silhouette as a puffball and dresses the face. */

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
uniform float uBodyAlpha;
uniform vec4 uEyePos[2];    // xy, w, h
uniform vec4 uEyeMat[2];    // a b c d
uniform vec2 uEyeA;         // alpha per eye
uniform int uEyeN;
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
uniform vec2 uGaze;         // yaw, pitch (deg) — pupil offset
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
  // round end at origin, point along +y (screen down)
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

float sdArcStroke(vec2 p, vec4 A, vec4 B, vec4 C, float t){
  // A: a, k, tilt, width   B: speed, phase, sweep, opacity   C: hue, hueSpan, cx, cy
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

vec3 kirbySky(vec2 uv){
  float g = clamp(uv.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 top = vec3(0.55, 0.82, 0.97);
  vec3 mid = vec3(0.72, 0.90, 0.99);
  vec3 bot = vec3(0.62, 0.86, 0.58);
  vec3 col = mix(bot, mid, smoothstep(0.0, 0.42, g));
  col = mix(col, top, smoothstep(0.42, 1.0, g));
  float c1 = cover(length((uv - vec2(-0.70, 0.58)) * vec2(1.0, 1.55)), 0.09, 0.24);
  float c2 = cover(length((uv - vec2(-0.56, 0.55)) * vec2(1.1, 1.7)), 0.07, 0.18);
  float c3 = cover(length((uv - vec2(0.74, 0.52)) * vec2(1.0, 1.65)), 0.08, 0.22);
  col = mix(col, vec3(1.0, 0.98, 0.96), clamp(c1 + c2 + c3, 0.0, 1.0) * 0.5);
  return col;
}

float sdSphere3(vec3 p, float r){ return length(p) - r; }

float sdEllipsoid3(vec3 p, vec3 r){
  float k0 = length(p / r);
  float k1 = length(p / (r * r));
  return k0 * (k0 - 1.0) / max(k1, 1e-4);
}

// id: 0 body/arms, 1 feet, 2 mouth cavity
vec2 mapKirby(vec3 p){
  float breath = 1.0 + 0.012 * sin(uTime * 1.85);
  float bob = 0.010 * sin(uTime * 1.85 + 0.4);
  p.y -= bob;
  vec3 bp = p;
  bp.y /= breath;

  // body sits on the shoes — feet behind the puff so they peek out as a base
  float body = sdSphere3(bp - vec3(0.0, 0.18, 0.0), 0.70);

  float swing = 0.05 * sin(uTime * 2.35);
  float armL = sdSphere3(p - vec3(-0.66, 0.08 + swing, -0.18), 0.23);
  float armR = sdSphere3(p - vec3( 0.66, 0.08 - swing * 0.7, -0.18), 0.23);
  float arms = smin(armL, armR, 0.04);
  float flesh = smin(body, arms, 0.07);

  // planted behind the body; only the soles show under the silhouette
  float ground = -0.68;
  vec3 fl = p - vec3(-0.26, -0.54, 0.20);
  fl.xz = rot(0.20) * fl.xz;
  float footL = sdEllipsoid3(fl, vec3(0.20, 0.15, 0.16));
  footL = max(footL, ground - p.y);
  vec3 fr = p - vec3( 0.26, -0.54, 0.20);
  fr.xz = rot(-0.20) * fr.xz;
  float footR = sdEllipsoid3(fr, vec3(0.20, 0.15, 0.16));
  footR = max(footR, ground - p.y);
  float feet = smin(footL, footR, 0.05);

  float d = smin(flesh, feet, 0.03);
  float id = feet < flesh ? 1.0 : 0.0;
  return vec2(d, id);
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

void kirbyEye(inout vec3 col, vec2 f, vec2 c, float open){
  // HAL sheet: the oval IS the pupil. No sclera. Cyan crescent at the bottom,
  // one large painted white circle at the top. No phong.
  float hh = 0.235 * mix(0.18, 1.0, clamp(open, 0.0, 1.0));
  float ww = 0.118;
  float dW = sdEllipse(f - c, vec2(ww, hh));
  float ew = cover(dW, -0.007, 0.005);
  if(ew < 0.01) return;

  vec3 eye = vec3(0.06, 0.06, 0.09);

  // cyan crescent at the bottom of the pupil (ellipse minus a higher ellipse)
  vec2 bA = c + vec2(0.0, hh * 0.36);
  vec2 bB = c + vec2(0.0, hh * -0.04);
  float dBlue = max(dW, max(sdEllipse(f - bA, vec2(ww * 1.05, hh * 0.66)),
                            -sdEllipse(f - bB, vec2(ww * 1.18, hh * 0.80))));
  eye = mix(eye, vec3(0.34, 0.68, 1.0), cover(dBlue, -0.004, 0.004));

  // white oval: same aspect as the dark oval, tops aligned so the top 180°
  // shares that curvature (not a circle)
  vec2 wr = vec2(ww, hh) * 0.62;
  vec2 wc = c + vec2(0.0, -hh + wr.y + 0.010);
  float dHi = max(dW, sdEllipse(f - wc, wr));
  eye = mix(eye, vec3(1.0), cover(dHi, -0.003, 0.004));

  col = mix(col, eye, ew);
}

vec3 renderKirby(vec2 p, vec3 bg){
  // Kirby faces the camera. Grok's 3/4 rest gaze is not applied.
  vec3 ro = vec3(p.x, -p.y + 0.08, -2.55);
  vec3 rd = vec3(0.0, 0.0, 1.0);

  const float OUTW = 0.052;
  float t = 0.0;
  vec2 h = vec2(1.0, 0.0);
  bool hitBody = false;
  for(int i = 0; i < 56; i++){
    vec3 q = ro + rd * t;
    h = mapKirby(q);
    if(h.x < 0.001){ hitBody = true; break; }
    t += h.x;
    if(t > 5.5) break;
  }

  // contact shadow
  float sh = length((p - vec2(0.0, 0.98)) * vec2(0.90, 2.8)) - 0.36;
  float shadow = exp(-max(sh, 0.0) * max(sh, 0.0) * 9.0) * 0.22;
  vec3 col = bg - shadow * vec3(0.20, 0.16, 0.12);

  if(!hitBody){
    // backface hull: inflated SDF hits where the inner body missed
    t = 0.0;
    bool hitHull = false;
    for(int i = 0; i < 40; i++){
      vec3 q = ro + rd * t;
      float d = mapKirby(q).x - OUTW;
      if(d < 0.001){ hitHull = true; break; }
      t += d;
      if(t > 5.5) break;
    }
    if(hitHull){
      return mix(col, vec3(0.165, 0.145, 0.275), 1.0);
    }
    return col;
  }

  vec3 hit = ro + rd * t;
  vec3 N = kirbyNormal(hit);

  vec3 L = normalize(vec3(-0.22, 0.55, -0.80));
  float ndl = dot(N, L);
  // hard 2-band cel — official Kirby shading
  float cel = mix(0.70, 1.0, step(0.08, ndl));

  vec3 pinkLit = vec3(1.00, 0.76, 0.84);
  vec3 pinkSh = vec3(0.94, 0.58, 0.72);
  vec3 footLit = vec3(0.91, 0.22, 0.28);
  vec3 footSh = vec3(0.80, 0.14, 0.20);
  vec3 albedo = mix(mix(pinkSh, pinkLit, cel), mix(footSh, footLit, cel), step(0.5, h.y));
  col = albedo;

  // front-facing face (camera looks +Z, so front is -Z)
  if(h.y < 0.5 && N.z < -0.12){
    vec2 f = vec2(hit.x, -hit.y);
    // official @Kirby_JP layout, still tugged by grok gaze
    vec2 restL = vec2(-0.155, -0.26);
    vec2 restR = vec2( 0.155, -0.26);
    vec2 gOff = vec2(clamp(uGaze.x, -40.0, 40.0) * 0.0012,
                     clamp(-uGaze.y, -32.0, 32.0) * 0.0010);
    vec2 eL = restL + gOff;
    vec2 eR = restR + gOff;
    float oL = 1.0;
    float oR = 1.0;
    if(uEyeN > 0) oL = uEyePos[0].w < 0.16 ? 0.14 : clamp(uEyeA.x, 0.16, 1.0);
    if(uEyeN > 1) oR = uEyePos[1].w < 0.16 ? 0.14 : clamp(uEyeA.y, 0.16, 1.0);
    kirbyEye(col, f, eL, oL);
    kirbyEye(col, f, eR, oR);

    vec2 bL = eL + vec2(-0.18, 0.18);
    vec2 bR = eR + vec2( 0.18, 0.18);
    float blush = cover(sdEllipse(f - bL, vec2(0.12, 0.075)), -0.01, 0.03);
    blush = max(blush, cover(sdEllipse(f - bR, vec2(0.12, 0.075)), -0.01, 0.03));
    col = mix(col, vec3(1.0, 0.55, 0.66), blush * 0.58 * (1.0 - uMouth));

    float mw = 0.05 + 0.42 * uMouth;
    float mh = 0.035 + 0.36 * uMouth;
    vec2 mc = vec2(0.0, 0.16 + 0.06 * uMouth);
    float dM = sdEllipse(f - mc, vec2(mw, mh));
    float mm = cover(dM, -0.008, 0.006);
    vec3 cavity = mix(vec3(0.55, 0.18, 0.28), vec3(0.28, 0.06, 0.10), smoothstep(0.2, 1.0, uMouth));
    col = mix(col, cavity, mm * step(0.04, uMouth + 0.12));
    if(uMouth < 0.15){
      float dTiny = sdEllipse(f - vec2(0.0, 0.18), vec2(0.045, 0.038));
      col = mix(col, vec3(0.75, 0.28, 0.40), cover(dTiny, -0.004, 0.005) * 0.9);
    }
  }

  return col;
}

void main(){
  vec2 frag = gl_FragCoord.xy;
  // Model space is y-down (same as the reference film). gl_FragCoord is y-up.
  vec2 p = (frag - uCenter) / uScale;
  p.y = -p.y;
  vec2 uv = (frag - 0.5 * uRes) / uRes.y;

  vec3 paper = vec3(0.949, 0.941, 0.918);
  vec3 sky = kirbySky(uv);
  vec3 bg = mix(paper, sky, uKirby);

  float dBody = sdProfile(p);

  // extra body dots (thinking, particles, !)
  float dDots = 1e5;
  for(int i = 0; i < 8; i++){
    if(i >= uDotN) break;
    vec4 D = uDots[i];
    if(D.w < 0.01) continue;
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
  float dNotch = 1e5;
  float dBadge = 1e5;
  if(uNotifOn > 0.5){
    dBadge = sdCircle(p - uNotif.xy, uNotif.z);
    dNotch = sdCircle(p - uNotif.xy, uNotif.w);
    dInk = max(dInk, -dNotch);
  }

  // Kirby shoes — sit under the puff, long axis almost horizontal
  float dShoe = 1e5;
  if(uKirby > 0.01 && uShoes > 0.01){
    float k = uKirby * uShoes;
    vec2 fl = vec2(-0.42, 0.96);
    vec2 fr = vec2( 0.42, 0.96);
    vec2 pl = rot(0.18) * (p - fl);
    vec2 pr = rot(-0.18) * (p - fr);
    float sl = sdEllipse(pl, vec2(0.30, 0.155) * (0.75 + 0.25 * k));
    float sr = sdEllipse(pr, vec2(0.30, 0.155) * (0.75 + 0.25 * k));
    dShoe = min(sl, sr);
  }

  float dOcc = smin(dInk, dShoe, 0.08);

  // Kirby mouth (inhale / smile)
  float dMouth = 1e5;
  if(uMouth > 0.01 && uKirby > 0.05){
    float m = uMouth;
    vec2 mc = vec2(uSil.y, uSil.z + 0.22 + 0.12 * m);
    dMouth = sdEllipse(p - mc, vec2(0.22 + 0.42 * m, 0.08 + 0.38 * m));
    dMouth = max(dMouth, dBody + 0.01);
  }

  // eyes
  float dEye[2];
  dEye[0] = 1e5; dEye[1] = 1e5;
  for(int i = 0; i < 2; i++){
    if(i >= uEyeN) break;
    if(uEyeA[i] < 0.02) continue;
    dEye[i] = sdCapsuleEye(p, uEyeMat[i], uEyePos[i].xy, uEyePos[i].z, uEyePos[i].w);
  }

  float aa = 1.5 / uScale;

  // contact shadow
  float sh = length((p - vec2(uSil.y, uSil.z + 1.05)) * vec2(0.92, 2.4)) - 0.42;
  float shadow = exp(-max(sh, 0.0) * max(sh, 0.0) * 10.0) * (0.10 + 0.16 * uKirby);
  shadow *= cover(dOcc, -0.05, 0.35);
  vec3 col = bg - shadow * vec3(0.18, 0.16, 0.14);

  // arcs behind
  for(int i = 0; i < 8; i++){
    if(i >= uArcN) break;
    float op = uArcB[i].w;
    if(op < 0.01) continue;
    float dA = sdArcStroke(p, uArcA[i], uArcB[i], uArcC[i], uArcT[i]);
    vec3 ac = wheel(uArcC[i].x + uArcC[i].y * 0.5, 0.55, mix(0.62, 0.72, uKirby));
    float m = 1.0 - smoothstep(-aa, aa, dA);
    // hide behind body
    m *= mix(1.0, 0.15, 1.0 - smoothstep(aa, -aa, dInk));
    col = mix(col, ac, m * op);
  }

  // warp star (Kirby orbit)
  if(uKirby > 0.2 && uStar > 0.02){
    float ang = uTime * 1.6;
    vec2 sp = rot(ang * 0.4) * (p - vec2(1.15, -0.15));
    float dS = sdStar5(sp, 0.28, 0.42);
    float m = 1.0 - smoothstep(-aa * 1.4, aa, dS);
    vec3 star = mix(vec3(0.95, 0.55, 0.12), vec3(1.0, 0.88, 0.32), smoothstep(-0.08, 0.04, -dS));
    col = mix(col, star, m * uStar * uKirby);
  }

  // body fill
  float bodyMask = 1.0 - smoothstep(-aa, aa, dInk);
  bodyMask *= uBodyAlpha;

  vec3 grokInk = vec3(0.047, 0.047, 0.047);
  vec3 pink = vec3(0.957, 0.655, 0.765);
  vec3 pinkDeep = vec3(0.90, 0.48, 0.62);

  vec3 bodyCol = grokInk;

  // 2D Kirby extras only during the morph; full Kirby is the 3D toon pass
  if(uKirby > 0.01 && uKirby < 0.4){
    float sm = (1.0 - smoothstep(-aa, aa, dShoe)) * uKirby * uShoes;
    vec3 shoe = vec3(0.839, 0.227, 0.282);
    vec3 sole = vec3(0.62, 0.12, 0.18);
    float soleBand = smoothstep(0.88, 1.08, p.y);
    vec3 sc = mix(shoe, sole, soleBand * 0.7);
    sc += vec3(0.16, 0.05, 0.06) * cover(abs(p.y - 0.90), 0.0, 0.10);
    col = mix(col, sc, sm);
  }

  col = mix(col, bodyCol, bodyMask);

  // blush (2D morph only)
  if(uKirby > 0.05 && uKirby < 0.4 && uEyeN > 0 && uMouth < 0.7){
    for(int i = 0; i < 2; i++){
      if(i >= uEyeN) break;
      vec2 cheek = uEyePos[i].xy + vec2(0.0, 0.26);
      cheek.x += sign(uEyePos[i].x - uSil.y) * 0.04;
      float dB = sdEllipse(p - cheek, vec2(0.13, 0.07));
      float bm = (1.0 - smoothstep(-0.02, 0.06, dB)) * (1.0 - smoothstep(-aa, aa, dBody));
      col = mix(col, vec3(0.93, 0.42, 0.55), bm * 0.38 * uKirby);
    }
  }

  // eyes: grok = paper holes, kirby = glossy ovals
  vec3 grokEye = paper;
  for(int i = 0; i < 2; i++){
    if(i >= uEyeN) break;
    float em = (1.0 - smoothstep(-aa, aa, dEye[i])) * uEyeA[i];
    if(em < 0.001) continue;

    vec3 eyeCol = grokEye;
    if(uKirby > 0.001 && uKirby < 0.4){
      vec4 m = uEyeMat[i];
      float det = m.x * m.w - m.z * m.y;
      vec2 dlt = p - uEyePos[i].xy;
      vec2 local = vec2(m.w * dlt.x - m.z * dlt.y, -m.y * dlt.x + m.x * dlt.y) / max(det, 1e-5);
      float w = uEyePos[i].z;
      float h = uEyePos[i].w;
      // pupil sits in the lower half, drifts with gaze
      vec2 pc = vec2(clamp(uGaze.x * 0.0020, -0.18, 0.18) * w,
                     0.06 * h + clamp(-uGaze.y * 0.0014, -0.10, 0.10) * h);
      float pr = min(w, h) * mix(0.36, 0.54, smoothstep(0.35, 0.7, h / max(w, 0.01)));
      float dPup = length((local - pc) / vec2(0.78, 1.08)) - pr;
      vec3 white = vec3(0.99, 0.98, 0.97);
      vec3 iris = mix(vec3(0.16, 0.20, 0.40), vec3(0.06, 0.07, 0.10), smoothstep(0.0, pr, -dPup));
      float pupMask = h > w * 0.38 ? (1.0 - smoothstep(-aa * 0.6, aa, dPup)) : 0.0;
      vec3 pupil = mix(white, iris, pupMask);
      // highlights
      vec2 h1 = pc + vec2(-0.22 * pr, -0.42 * pr);
      vec2 h2 = pc + vec2(0.18 * pr, -0.08 * pr);
      float hi = cover(length(local - h1), 0.0, pr * 0.16);
      hi += 0.55 * cover(length(local - h2), 0.0, pr * 0.08);
      pupil = mix(pupil, vec3(1.0), clamp(hi, 0.0, 1.0));
      eyeCol = mix(white, pupil, uKirby);
    }
    col = mix(col, eyeCol, em);
  }

  // mouth interior
  if(uMouth > 0.01 && uKirby < 0.4){
    float mm = (1.0 - smoothstep(-aa, aa, dMouth)) * uKirby;
    vec3 cavity = vec3(0.22, 0.05, 0.08);
    col = mix(col, cavity, mm);
  }

  // arcs in front (thin residual)
  for(int i = 0; i < 8; i++){
    if(i >= uArcN) break;
    float op = uArcB[i].w;
    if(op < 0.01) continue;
    float dA = sdArcStroke(p, uArcA[i], uArcB[i], uArcC[i], uArcT[i]);
    vec3 ac = wheel(uArcC[i].x + uArcC[i].y * 0.35, 0.58, 0.64);
    float m = 1.0 - smoothstep(-aa, aa, dA);
    m *= smoothstep(-aa, aa, dInk); // only outside body
    col = mix(col, ac, m * op);
  }

  // blue badge
  if(uNotifOn > 0.5){
    float bm = 1.0 - smoothstep(-aa, aa, dBadge);
    vec3 blue = vec3(0.141, 0.588, 0.910);
    col = mix(col, blue, bm);
  }

  // vignette, tiny grain
  float vig = 1.0 - 0.08 * uKirby * dot(uv, uv);
  col *= vig;
  float g = hash(frag + uTime * 17.0) - 0.5;
  col += g * 0.015;

  if(uKirby > 0.02){
    vec3 kcol = renderKirby(p, bg);
    col = mix(col, kcol, smoothstep(0.04, 0.72, uKirby));
  }

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

    for (let i = 0; i < 64; i++) radii[i] = frame.sil.radii[i] ?? 1;

    gl.uniform2f(U.uRes, W, H);
    gl.uniform1f(U.uTime, now);
    gl.uniform1f(U.uKirby, kirby);
    gl.uniform1f(U.uScale, R);
    gl.uniform2f(U.uCenter, cx, cy);
    gl.uniform1fv(U.uRadii, radii);
    gl.uniform4f(U.uSil, frame.sil.rot, frame.sil.cx, frame.sil.cy, 0);
    gl.uniform2f(U.uSquash, frame.sil.sx, frame.sil.sy);
    gl.uniform1f(U.uBodyAlpha, frame.bodyAlpha);
    gl.uniform1f(U.uReduced, reduced ? 1 : 0);

    const nEyes = Math.min(2, frame.eyes.length);
    gl.uniform1i(U.uEyeN, nEyes);
    const pos = [];
    const mat = [];
    const alpha = [0, 0];
    for (let i = 0; i < 2; i++) {
      const e = frame.eyes[i];
      if (e) {
        pos.push(e.x, e.y, e.w, e.h);
        mat.push(e.a, e.b, e.c, e.d);
        alpha[i] = e.alpha;
      } else {
        pos.push(0, 0, 0.1, 0.1);
        mat.push(1, 0, 0, 1);
      }
    }
    gl.uniform4fv(U.uEyePos, pos);
    gl.uniform4fv(U.uEyeMat, mat);
    gl.uniform2f(U.uEyeA, alpha[0], alpha[1]);
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
