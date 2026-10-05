/**
 * Plameny 4 — deterministic reacting-fluid VFX, no external JS packages.
 * Run: node vytvor-plameny4.mjs
 * Preview simulation only: node vytvor-plameny4.mjs --draft
 * Keep raw work files: node vytvor-plameny4.mjs --keep-work
 * Encode/check retained frames: node vytvor-plameny4.mjs --encode-only
 * Recheck an existing video against retained frames: --verify-only --keep-work
 * Optional: --ffmpeg=C:/ffmpeg/bin/ffmpeg.exe
 *
 * Three independently simulated depth slabs. Semi-Lagrangian RK2 transport,
 * limited MacCormack scalar advection, pressure projection, buoyancy,
 * vorticity confinement, fuel/oxygen reaction and soot. The coordinate frame
 * follows the prescribed burn front. This is a 2D game-VFX approximation,
 * not a quantitatively calibrated 3D combustion solver.
 * RGB is straight/unassociated; compositing is performed in linear light.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(ROOT, 'snimky4');
fs.mkdirSync(CACHE, { recursive: true });
const ffarg = process.argv.find(a => a.startsWith('--ffmpeg='));
const FFMPEG = ffarg?.slice(9) || (fs.existsSync('C:/ffmpeg/bin/ffmpeg.exe') ? 'C:/ffmpeg/bin/ffmpeg.exe' : 'ffmpeg');
const FFPROBE = FFMPEG.replace(/ffmpeg(\.exe)?$/, 'ffprobe$1');
const DRAFT = process.argv.includes('--draft');
const VERIFY_ONLY = process.argv.includes('--verify-only');
const ENCODE_ONLY = process.argv.includes('--encode-only') || VERIFY_ONLY;
const KEEP_WORK = process.argv.includes('--keep-work');
const IMPORTED = path.resolve(process.argv[1] || '') !== fileURLToPath(import.meta.url);
const W = 1440, H = 1440, FPS = 30, N = 72;
const DARK = [26, 18, 12], LIGHT = [232, 225, 210];
const clamp = (a, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, a));
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export function baseline(t) {
  if (t < 0.25) return H + 10;
  if (t < 1.75) return (H + 10) + (-20 - (H + 10)) * ((t - 0.25) / 1.5);
  return -10;
}
function rng(seed) { return () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; }; }
const random = rng(0x57afc213);

// Non-periodic hashed gradient noise, used as a curl FORCE and for the fuel
// source. No drawn flame silhouettes or repeated flame/tongue templates.
function hash(x, y, z = 0) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function noise(x, y, z = 0) {
  const X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z);
  x -= X; y -= Y; z -= Z;
  const a = x * x * (3 - 2 * x), b = y * y * (3 - 2 * y), c = z * z * (3 - 2 * z);
  return mix(mix(mix(hash(X, Y, Z), hash(X + 1, Y, Z), a), mix(hash(X, Y + 1, Z), hash(X + 1, Y + 1, Z), a), b),
    mix(mix(hash(X, Y, Z + 1), hash(X + 1, Y, Z + 1), a), mix(hash(X, Y + 1, Z + 1), hash(X + 1, Y + 1, Z + 1), a), b), c) * 2 - 1;
}
function fbm(x, y, z = 0) { return .59 * noise(x, y, z) + .28 * noise(x * 2.03 + 9.3, y * 2.03 + 1.7, z * 1.33) + .13 * noise(x * 4.13 + 3.7, y * 4.13 + 15, z * 1.77); }
export function edgeOffset(x, t) {
  const ragged = 15 * noise(x / 87, t * 1.4, 10) + 7 * noise(x / 28, t * 2.1, 3) + 2.2 * noise(x / 7, t * 2.7, 1);
  // Both endpoint biases stay within the allowed +/-30 px. The first pilot
  // line is inside the bottom edge; the final cooling edge remains inside.
  const start = mix(-19 + ragged * .23, ragged, smooth(.18, .34, t));
  return mix(start, 18 + ragged * .23, smooth(1.58, 1.75, t));
}
function bandWidth(x, t) { return 56 + 2 * noise(x / 49 + 2, t * 1.1, 6) + 1.5 * noise(x / 9, t, 8); }
export function topDissipation(y, root) {
  // A broad extinction region, not a narrow alpha cut at the canvas edge.
  // The stationary cooling residue has a smaller, still smooth envelope.
  return smooth(18, Math.min(130, Math.max(38, root * .4)), y);
}

class Fluid {
  constructor(w, h, scale, seed) {
    this.w = w; this.h = h; this.scale = scale; this.seed = seed;
    this.n = w * h; this.front = h * .85; this.time = 0;
    for (const key of ['u', 'v', 'T', 'fuel', 'soot', 'oxygen', 'mixing', 'p', 'p2', 'div', 'curl', 'psi', 'nx', 'ny', 'fu', 'fv', 'a', 'b', 'tx', 'ty']) this[key] = new Float32Array(this.n);
    this.oxygen.fill(1);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      this.v[i] = -46 / scale * 2;
      this.u[i] = noise(x / 41, y / 37, seed) * 8;
    }
  }
  sample(f, x, y) {
    x = clamp(x, .501, this.w - 1.501); y = clamp(y, .501, this.h - 1.501);
    const X = x | 0, Y = y | 0, a = x - X, b = y - Y, i = Y * this.w + X;
    return mix(mix(f[i], f[i + 1], a), mix(f[i + this.w], f[i + this.w + 1], a), b);
  }
  bounds(f, ambient = 0) {
    const { w, h } = this;
    for (let x = 0; x < w; x++) { f[x] = f[x + w]; f[(h - 1) * w + x] = ambient; }
    for (let y = 1; y < h - 1; y++) { f[y * w] = f[y * w + 1]; f[y * w + w - 1] = f[y * w + w - 2]; }
  }
  trace(dt) {
    const { w, h, u, v, tx, ty } = this;
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const mx = x - u[i] * dt * .5, my = y - v[i] * dt * .5;
      tx[i] = clamp(x - this.sample(u, mx, my) * dt, .501, w - 1.501);
      ty[i] = clamp(y - this.sample(v, mx, my) * dt, .501, h - 1.501);
    }
  }
  advect(src, out) {
    const { w, h, tx, ty } = this;
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x, X = tx[i] | 0, Y = ty[i] | 0, j = Y * w + X;
      const a = tx[i] - X, b = ty[i] - Y;
      out[i] = mix(mix(src[j], src[j + 1], a), mix(src[j + w], src[j + w + 1], a), b);
    }
  }
  transport(src, dt, ambient = 0) {
    // MacCormack error correction with a strict local min/max limiter.
    this.advect(src, this.a); this.bounds(this.a, ambient);
    const { w, h, a, b, tx, ty, u, v } = this;
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x, X = tx[i] | 0, Y = ty[i] | 0, j = Y * w + X;
      const reverse = this.sample(a, x + dt * u[i], y + dt * v[i]);
      const lo = Math.min(src[j], src[j + 1], src[j + w], src[j + w + 1]);
      const hi = Math.max(src[j], src[j + 1], src[j + w], src[j + w + 1]);
      b[i] = clamp(a[i] + .35 * (src[i] - reverse), lo, hi);
    }
    src.set(b); this.bounds(src, ambient);
  }
  project() {
    const { w, h, u, v, div } = this;
    let p = this.p, q = this.p2;
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x; div[i] = .5 * (u[i + 1] - u[i - 1] + v[i + w] - v[i - w]);
    }
    // Warm-started Poisson solve; pressure has open (Dirichlet) boundaries.
    for (let k = 0; k < 32; k++) {
      for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
        const i = y * w + x; q[i] = .25 * (p[i - 1] + p[i + 1] + p[i - w] + p[i + w] - div[i]);
      }
      [p, q] = [q, p];
    }
    this.p = p; this.p2 = q;
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      u[i] -= .5 * (p[i + 1] - p[i - 1]); v[i] -= .5 * (p[i + w] - p[i - w]);
    }
    this.bounds(u); this.bounds(v, -8);
  }
  step(dt, worldTime, sourceStrength = 1) {
    const { w, h, u, v, T, fuel, soot, oxygen: O, mixing, curl, psi, scale, seed } = this;
    const s = this.time, phase = s * .72 + seed;
    this.time += dt;
    this.trace(dt); this.advect(u, this.fu); this.advect(v, this.fv);
    u.set(this.fu); v.set(this.fv);
    // A multiscale stream function creates divergence-free turbulent forcing.
    // It enters the dynamics BEFORE projection, never the rendered image.
    if ((Math.round(s / dt) % 4) === 0) {
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x;
        psi[i] = (noise(x / 35, y / 38 - s * .5, phase) * 230
          + noise(x / 13 + 31, y / 14 - s, phase * 1.7) * 345
          + noise(x / 4.7 + 13, y / 5.3 - s * 2, phase * 2.2) * 240) * 2 / scale;
      }
    }
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      curl[i] = .5 * (v[i + 1] - v[i - 1] - u[i + w] + u[i - w]);
    }
    for (let y = 2; y < h - 2; y++) for (let x = 2; x < w - 2; x++) {
      const i = y * w + x;
      const gx = Math.abs(curl[i + 1]) - Math.abs(curl[i - 1]);
      const gy = Math.abs(curl[i + w]) - Math.abs(curl[i - w]);
      const d = 1 / (Math.sqrt(gx * gx + gy * gy) + 1e-5);
      u[i] += dt * ((psi[i + w] - psi[i - w]) * .5 + 7 * gy * d * curl[i]);
      v[i] += dt * (-(psi[i + 1] - psi[i - 1]) * .5 - 7 * gx * d * curl[i] - T[i] * 460 / scale + soot[i] * 2);
      u[i] *= .998; v[i] *= .999;
      u[i] = clamp(u[i], -130, 130); v[i] = clamp(v[i], -265, 80);
    }
    // Source is a thin strip that follows exactly the prescribed ragged edge.
    const first = Math.floor(this.front - 18), last = Math.ceil(this.front + 16);
    for (let x = 1; x < w - 1; x++) {
      const px = (x - w / 2) * scale + W / 2;
      const y0 = this.front + edgeOffset(px, worldTime) / scale;
      // A small continuous pilot keeps the base alight across the full width;
      // larger intermittent fuel packets stretch and detach in the rising flow.
      const modulation = .16 + Math.pow(clamp(.58 + .90 * noise(px / 38, s * 3.3, seed) + .48 * noise(px / 8, s * 9, seed + 8), 0, 1.6), 1.4);
      for (let y = first; y <= last; y++) {
        const i = y * w + x, height = (y0 - y) * scale;
        const injection = Math.exp(-(((height - 3) / 4.2) ** 2)) * sourceStrength * modulation;
        fuel[i] += dt * 12.6 * injection;
        T[i] += dt * 5.5 * injection;
        mixing[i] = mix(mixing[i], .5 + .5 * noise(px / 3.4, s * 20, seed + 19), clamp(injection * dt * 50));
        // The cooling char releases a last wisp of soot after the front exits.
        const smolder = smooth(1.68, 1.78, worldTime) * (1 - smooth(2.00, 2.18, worldTime));
        soot[i] += dt * 2.4 * smolder * modulation * Math.exp(-(((height + 26) / 6) ** 2));
        v[i] -= dt * 820 / scale * injection;
      }
    }
    this.project(); this.trace(dt);
    this.transport(T, dt); this.transport(fuel, dt); this.transport(soot, dt); this.transport(O, dt, 1); this.transport(mixing, dt);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      // Fuel burns only in hot oxygenated cells. Ambient oxygen re-enters
      // through entrainment; reacted fuel releases heat and soot.
      const activation = smooth(.075, .27, T[i]);
      const burned = Math.min(fuel[i], O[i] * .9, fuel[i] * activation * O[i] * (2.2 + 9 * mixing[i]) * dt);
      fuel[i] -= burned;
      O[i] = clamp(O[i] - burned * .68 + (1 - O[i]) * dt * 2.8);
      T[i] = clamp(T[i] + burned * 2.6, 0, 2.1);
      soot[i] = Math.min(2, soot[i] + burned * .8);
      const height = Math.max(0, (this.front - y) * scale);
      // Slower cooling in the rising column, then faster quenching beyond
      // the intended 180--300 px flame envelope (no stretched render geometry).
      T[i] *= Math.exp(-dt * (1.28 + height * .0035 + T[i] * .44 + smooth(190, 320, height) * 4.5));
      soot[i] *= Math.exp(-dt * (.70 + height * .0019));
      fuel[i] *= .999;
      if (y > this.front + 15) { T[i] *= .88; fuel[i] *= .88; soot[i] *= .94; }
    }
  }
}

// Art-directed thermal ramp in sRGB, converted ONCE to linear light.
// Exposing each Planck channel separately washed the previous ramp to beige.
// Yellow is now reserved for hot fuel immediately next to the burn front.
const srgbToLinear = v => (v /= 255) <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
const toSrgb = Array.from({ length: 65536 }, (_, i) => { const v = i / 65535; return Math.round(255 * (v <= .0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - .055)); });
function palette(stops) {
  return Array.from({ length: 2048 }, (_, i) => {
    const t = i / 2047;
    let k = 0; while (k < stops.length - 2 && t > stops[k + 1][0]) k++;
    const a = stops[k], b = stops[k + 1], f = clamp((t - a[0]) / (b[0] - a[0]));
    return a.slice(1).map((v, c) => srgbToLinear(mix(v, b[c + 1], f)));
  });
}
const FIRE = palette([[0,138,20,0],[.22,212,40,10],[.49,255,90,0],[.76,255,122,18],[1,255,145,22]]);
const SPARK = palette([[0,138,20,0],[.27,224,43,4],[.62,255,117,15],[.86,255,189,57],[1,255,243,168]]);
const YELLOW = [255,216,74].map(srgbToLinear);
const thermal = (lut, t) => lut[Math.round(clamp(t) * 2047)];

// Small self-contained PNG writer (RGBA/RGB), avoids platform dependencies.
const crcTable = Uint32Array.from({ length: 256 }, (_, n) => { for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1; return n >>> 0; });
function crc(buf) { let c = 0xffffffff; for (const v of buf) c = crcTable[(c ^ v) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) {
  const out = Buffer.alloc(data.length + 12); out.writeUInt32BE(data.length); out.write(type, 4); data.copy(out, 8); out.writeUInt32BE(crc(out.subarray(4, -4)), out.length - 4); return out;
}
function png(filename, width, height, data, channels = 4) {
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = channels === 4 ? 6 : 2;
  const scan = Buffer.alloc((width * channels + 1) * height);
  for (let y = 0; y < height; y++) {
    const start = y * (width * channels + 1); scan[start] = 1;
    for (let x = 0; x < width * channels; x++) { const i = y * width * channels + x; scan[start + x + 1] = data[i] - (x >= channels ? data[i - channels] : 0); }
  }
  fs.writeFileSync(filename, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(scan, { level: 6 })), chunk('IEND', Buffer.alloc(0))]));
}

class Embers {
  constructor() { this.p = []; this.accum = 0; this.clock = 0; }
  step(dt, sim, t, strength) {
    this.clock += dt;
    const base = baseline(t);
    const frontVelocity = t > 0 ? (baseline(t + .0005) - baseline(Math.max(0, t - .0005))) / .001 : 0;
    this.accum += dt * 120 * strength * smooth(.07, .25, t);
    while (this.accum >= 1) {
      this.accum--;
      const x = random() * W;
      const late = t > 1.59;
      const y = late ? 24 + random() * 14 : base + edgeOffset(x, t) - 8 - random() * 42 * smooth(.07, .25, t);
      this.p.push({ x, y, late, vx: (random() - .5) * (late ? 130 : 920), vy: late ? -24 - random() * 32 : frontVelocity - 250 - random() * 400,
        age: 0, life: late ? .22 + random() * .32 : .48 + random() * .45, size: 1 + random() ** 2 * 2.5,
        brightness: .60 + random() * .40, phase: random() * 90, lift: 110 + random() * 170,
        shutter: .002 + random() ** 2 * .005, fastShutter: random() < .09,
        history: [{ x, y, age: 0 }] });
    }
    for (const p of this.p) {
      // World-space inertia: translating the flame grid must not drag every
      // ember into an identical vertical streak. The GAS carries front speed;
      // particles follow it with finite drag, lateral curl and their own lift.
      // 480 Hz path samples also make the shutter follow real curved motion.
      for (let k = 0; k < 4; k++) {
        const h = dt / 4;
        p.age += h;
        const sx = sim.w / 2 + (p.x - W / 2) / sim.scale, sy = sim.front + (p.y - base) / sim.scale;
        const u = sim.sample(sim.u, sx, sy) * sim.scale, v = sim.sample(sim.v, sx, sy) * sim.scale;
        const eddy = noise(p.x / 100 + p.phase, (p.y - base) / 90, this.clock * 3.8);
        const drag = 1 - Math.exp(-h * 5.5);
        const targetX = p.late ? u * .45 + 70 * eddy : u * 2.8 + 410 * Math.sin(this.clock * 8.5 + p.phase) + 260 * eddy;
        const targetY = p.late ? 8 * eddy : frontVelocity + v * .90 - p.lift + 200 * noise(p.phase, this.clock * 4.5, 17);
        p.vx += (targetX - p.vx) * drag;
        p.vy += (targetY - p.vy) * drag;
        // Braking well inside the image: embers lose energy before the top.
        if (!p.late && p.y < 160) { p.vy *= Math.exp(-h * 30); p.brightness *= Math.exp(-h * 14); }
        p.x += p.vx * h;
        p.y = Math.max(14, p.y + p.vy * h * (p.late ? 1 : smooth(14, 135, p.y)));
        p.history.push({ x: p.x, y: p.y, age: p.age });
      }
      while (p.history.length > 2 && p.history[1].age < p.age - .035) p.history.shift();
    }
    this.p = this.p.filter(p => p.age < p.life && p.x > -30 && p.x < W + 30);
  }
}

function emberTrail(p) {
  const speed = Math.hypot(p.vx, p.vy);
  const exposure = p.fastShutter && speed > 950 ? .011 : p.shutter;
  const start = Math.max(0, p.age - exposure), points = [];
  for (let k = 1; k < p.history.length; k++) {
    const a = p.history[k - 1], b = p.history[k];
    if (b.age < start) continue;
    if (!points.length) {
      const f = clamp((start - a.age) / (b.age - a.age));
      points.push({ x: mix(a.x, b.x, f), y: mix(a.y, b.y, f) });
    }
    points.push(b);
  }
  if (!points.length) points.push(p);
  const length = points.reduce((sum, pt, k) => sum + (k ? Math.hypot(pt.x - points[k - 1].x, pt.y - points[k - 1].y) : 0), 0);
  return { points, length, speed };
}

function blur(src, radius) {
  const tmp = new Float32Array(W * H), dst = new Float32Array(W * H), width = radius * 2 + 1;
  for (let y = 0; y < H; y++) {
    let sum = 0; const row = y * W;
    for (let k = -radius; k <= radius; k++) sum += src[row + clamp(k, 0, W - 1)];
    for (let x = 0; x < W; x++) { tmp[row + x] = sum / width; sum += src[row + Math.min(W - 1, x + radius + 1)] - src[row + Math.max(0, x - radius)]; }
  }
  for (let x = 0; x < W; x++) {
    let sum = 0;
    for (let k = -radius; k <= radius; k++) sum += tmp[clamp(k, 0, H - 1) * W + x];
    for (let y = 0; y < H; y++) { dst[y * W + x] = sum / width; sum += tmp[Math.min(H - 1, y + radius + 1) * W + x] - tmp[Math.max(0, y - radius) * W + x]; }
  }
  return dst;
}

function render(index, sims, embers) {
  const t = index / FPS, base = baseline(t), count = W * H;
  const rgba = Buffer.alloc(count * 4);
  if (index === 0 || index === N - 1) return { rgba, info: { frame: index, time: t, baseline: base, alphaNonzero: 0, emberCount: 0 } };
  const R = new Float32Array(count), G = new Float32Array(count), B = new Float32Array(count), A = new Float32Array(count), emission = new Float32Array(count);
  const ignition = smooth(0, .075, t), fade = 1 - smooth(2.08, 71 / FPS, t);
  const growth = smooth(.025, .25, t);
  const settling = smooth(1.56, 1.75, t);
  const cooling = 1 - smooth(1.75, 2.15, t);
  const flameAlpha = ignition * smooth(.025, .09, t) * cooling;
  // A finite headroom envelope shortens the same simulated tongues near the
  // top. At burnout they shrink around a stationary root inside the char band.
  // No scrolling beyond the canvas and no duplicated/low-resolution frames.
  const roots = Float32Array.from({ length: W }, (_, x) => base + edgeOffset(x, t) + 28 * settling);
  const scales = Float32Array.from(roots, root => Math.max(.008, Math.min(growth, Math.max(0, root - 13) / 350)) * mix(1, .22, smooth(1.75, 2.15, t)));
  const offsets = Float32Array.from({ length: W }, (_, x) => edgeOffset(x, t));
  const sampleY = (f, x, y) => f.front + offsets[x] / f.scale + (y - roots[x]) / (f.scale * scales[x]);
  const front = Float32Array.from({ length: W }, (_, x) => base + edgeOffset(x, t));
  const band = Float32Array.from({ length: W }, (_, x) => bandWidth(x, t));
  const over = (i, r, g, b, a) => { const k = 1 - a; R[i] = r * a + R[i] * k; G[i] = g * a + G[i] * k; B[i] = b * a + B[i] * k; A[i] = a + A[i] * k; };
  const top = Math.max(0, Math.floor(base - 610)), bottom = Math.min(H, Math.ceil(base + 100));
  // Render ALL soot behind ALL emission. A foreground cold slab must never
  // grey out a hot flame in another slab. Soot is suppressed wherever any
  // depth layer still has fire, and fades in above the burning column.
  let maxSmoke = 0;
  const hotMask = new Float32Array(count);
  for (const f of sims) {
    for (let y = top; y < bottom; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const temp = f.sample(f.T, f.w / 2 + (x - W / 2) / f.scale, sampleY(f, x, y));
      hotMask[i] = Math.max(hotMask[i], smooth(.10, .32, temp));
    }
  }
  for (const f of sims) {
    for (let y = top; y < bottom; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, above = (roots[x] - y) / scales[x];
      const sx = f.w / 2 + (x - W / 2) / f.scale, sy = sampleY(f, x, y);
      const density = Math.max(0, f.sample(f.soot, sx, sy));
      const smokeMask = Math.max(smooth(145, 250, above), smooth(1.75, 1.95, t) * smooth(-50, -15, above));
      const smokeAlpha = Math.min(.13, 1 - Math.exp(-density * 1.20)) * (1 - hotMask[i]) * ignition * growth * smokeMask * (1 - smooth(1.92, 2.34, t));
      maxSmoke = Math.max(maxSmoke, smokeAlpha);
      if (smokeAlpha > .0003) over(i, .0034, .0026, .0020, smokeAlpha);
    }
  }
  // Temperature, fuel and density retain the three turbulent depth layers.
  for (let slab = sims.length - 1; slab >= 0; slab--) {
    const f = sims[slab];
    for (let y = top; y < bottom; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, above = (roots[x] - y) / scales[x];
      if (above < -55) continue;
      const sx = f.w / 2 + (x - W / 2) / f.scale;
      const sy = sampleY(f, x, y);
      const temp = Math.max(0, f.sample(f.T, sx, sy));
      const density = Math.max(0, f.sample(f.soot, sx, sy));
      const fuel = Math.max(0, f.sample(f.fuel, sx, sy));
      const riseMask = smooth(-5, 3, above);
      const heat = smooth(.10, .46, temp);
      const opacity = (1 - Math.exp(-(density * 3.8 + fuel * 1.8 + temp * 1.1))) * heat * riseMask * flameAlpha;
      if (opacity < .0003) continue;
      const rgb = thermal(FIRE, smooth(.12, 1.35, temp));
      const core = smooth(.82, 1.55, temp) * (1 - smooth(4, 26, above)) * smooth(.03, .22, fuel);
      over(i, mix(rgb[0], YELLOW[0], core), mix(rgb[1], YELLOW[1], core), mix(rgb[2], YELLOW[2], core), opacity * (slab ? .84 : .98));
      emission[i] = Math.max(emission[i], opacity * smooth(.45, 1.25, temp));
    }
  }
  // Charred paper: granular albedo, multiscale cracks, ragged finite thickness.
  for (let x = 0; x < W; x++) {
    const edge = front[x], width = band[x];
    for (let y = Math.max(0, Math.floor(edge - 5)); y < Math.min(H, Math.ceil(edge + width)); y++) {
      const d = y - edge, i = y * W + x;
      const tex = fbm(x / 11, (y - base) / 14, 4.6);
      const fine = noise(x / 2.3, (y - base) / 2.7, 1);
      const fracture = smooth(.075, .015, Math.abs(noise(x / 10, (y - base) / 9, 31) + .14 * fine));
      const alpha = smooth(-.7, 1.1, d) * (1 - smooth(width - 3.5, width, d));
      const luma = .0045 + .0042 * (tex + .6) + .0016 * fine;
      if (alpha > 0) over(i, luma * 1.32, luma * .95, luma * .69, alpha * ignition * (.94 + .06 * fracture) * (1 - smooth(1.63, 1.88, t)));
      const hot = clamp(.62 + .38 * noise(x / 21, t * 4.6, 4) + .26 * noise(x / 5, t * 3, 8));
      const line = Math.exp(-Math.pow((d - .25) / (1.1 + .6 * hot), 2));
      const crackGlow = fracture * Math.exp(-Math.max(0, d) / 8) * .32 * hot;
      const ember = (line * (.66 + .32 * hot) + crackGlow) * ignition * (1 - smooth(1.78, 2.20, t));
      if (ember > .002) { const c = thermal(FIRE, .33 + hot * .48); over(i, ...c, clamp(ember)); emission[i] = Math.max(emission[i], ember * .8); }
    }
  }
  // Integrate recorded world-space trajectories, from faded tail to hot head.
  // Most exposures are 2--7 ms: short points/streaks, not a rain curtain.
  const sparkStats = [];
  for (const p of embers.p) {
    const life = 1 - p.age / p.life;
    const color = thermal(SPARK, Math.pow(life, .80));
    const flicker = .70 + .30 * Math.sin(p.age * 57 + p.phase) ** 2;
    const a = smooth(0, .20, life) * p.brightness * flicker * ignition;
    const trail = emberTrail(p), steps = Math.max(2, Math.ceil(trail.length * 2));
    if (p.y > 0 && p.y < H && p.x >= 0 && p.x < W && p.y < front[Math.floor(p.x)] + band[Math.floor(p.x)]) {
      sparkStats.push({ lengthPx: trail.length + p.size, angleDeg: Math.atan2(p.vx, -p.vy) * 180 / Math.PI, speed: trail.speed });
    }
    const rad = p.size / 2;
    for (let k = 0; k <= steps; k++) {
      const phase = k / steps, pos = phase * (trail.points.length - 1);
      const j = Math.floor(pos), pa = trail.points[j], pb = trail.points[Math.min(j + 1, trail.points.length - 1)];
      const cx = mix(pa.x, pb.x, pos - j), cy = mix(pa.y, pb.y, pos - j);
      for (let y = Math.max(0, Math.floor(cy - rad - 1)); y <= Math.min(H - 1, Math.ceil(cy + rad + 1)); y++) for (let x = Math.max(0, Math.floor(cx - rad - 1)); x <= Math.min(W - 1, Math.ceil(cx + rad + 1)); x++) {
        const dist = Math.hypot(x + .5 - cx, y + .5 - cy);
        const coverage = clamp(rad + .6 - dist) * a * (.30 + .70 * phase) * (1.7 / Math.max(1, steps / (2 * rad + 1)));
        if (coverage > 0) { const i = y * W + x; over(i, ...color, clamp(coverage)); emission[i] = Math.max(emission[i], coverage * .50); }
      }
    }
  }
  const glow1 = blur(blur(emission, 3), 3), glow2 = blur(blur(emission, 10), 10);
  let nonzero = 0, belowBand = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    // Strict matte boundary, including particles and bloom. Lossless VP9
    // preserves every alpha sample, including the exact zero outside this edge.
    if (y >= Math.ceil(front[x] + band[x])) continue;
    const ga = clamp(glow1[i] * .11 + glow2[i] * .024) * ignition;
    if (ga > .00015) over(i, ...thermal(FIRE, .68), ga);
    // All layers, including bloom and char, approach zero BEFORE the border.
    const alpha = clamp(A[i] * fade * smooth(5, 17, y));
    const a8 = Math.round(Math.round(alpha * 255) * topDissipation(y, roots[x]));
    if (!a8) continue;
    rgba[i * 4 + 3] = a8; nonzero++;
    const inv = 1 / Math.max(1e-9, A[i]);
    rgba[i * 4] = toSrgb[Math.round(clamp(R[i] * inv) * 65535)];
    rgba[i * 4 + 1] = toSrgb[Math.round(clamp(G[i] * inv) * 65535)];
    rgba[i * 4 + 2] = toSrgb[Math.round(clamp(B[i] * inv) * 65535)];
    if (y > front[x] + 60) belowBand++;
  }
  return { rgba, info: { frame: index, time: t, baseline: base, edgeMean: front.reduce((a, b) => a + b, 0) / W,
    edgeMin: Math.min(...front), edgeMax: Math.max(...front), bandMean: band.reduce((a, b) => a + b, 0) / W,
    smokeAlphaMaxPerSlab: maxSmoke, smokeAlphaUpperBoundCombined: 1 - (1 - .13) ** 3,
    alphaNonzero: nonzero, nonzeroBelowBand: belowBand, emberCount: embers.p.length,
    visibleEmberCount: sparkStats.length, sparkStats } };
}

function composite(rgba, bg) {
  const out = Buffer.alloc(W * H * 3);
  // Conventional web (sRGB) source-over preview, identical to HTML compositing.
  for (let i = 0; i < W * H; i++) { const a = rgba[i * 4 + 3] / 255; for (let c = 0; c < 3; c++) out[i * 3 + c] = Math.round(rgba[i * 4 + c] * a + bg[c] * (1 - a)); }
  return out;
}
function previews(raw) {
  const frames = [0, 10, 20, 30, 41, 51, 61, 71];
  const tw = 360, th = 360, gap = 12, cw = tw * 4 + gap * 5, ch = th * 2 + gap * 3;
  const sheet = Buffer.alloc(cw * ch * 3);
  for (let i = 0; i < cw * ch; i++) for (let c = 0; c < 3; c++) sheet[i * 3 + c] = DARK[c];
  const fd = fs.openSync(raw, 'r');
  for (let n = 0; n < frames.length; n++) {
    const data = Buffer.alloc(W * H * 4); fs.readSync(fd, data, 0, data.length, frames[n] * data.length);
    const rgb = composite(data, DARK), ox = gap + n % 4 * (tw + gap), oy = gap + Math.floor(n / 4) * (th + gap);
    for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) for (let c = 0; c < 3; c++) {
      let s = 0; for (let yy = 0; yy < 4; yy++) for (let xx = 0; xx < 4; xx++) s += rgb[((y * 4 + yy) * W + x * 4 + xx) * 3 + c];
      sheet[((y + oy) * cw + x + ox) * 3 + c] = Math.round(s / 16);
    }
  }
  png(path.join(ROOT, 'nahled4.png'), cw, ch, sheet, 3);
  // Additional close-up sheets make the short onset and the top-boundary
  // transition reviewable. In a final run all of these come from decoded VP9.
  const inspection = (frames, fromY, bg, filename) => {
    const tw = 720, th = 240, gap = 8, width = 2 * tw + 3 * gap, height = Math.ceil(frames.length / 2) * (th + gap) + gap;
    const out = Buffer.alloc(width * height * 3);
    for (let i = 0; i < width * height; i++) for (let c = 0; c < 3; c++) out[i * 3 + c] = bg[c];
    const frame = Buffer.alloc(W * H * 4);
    for (let n = 0; n < frames.length; n++) {
      fs.readSync(fd, frame, 0, frame.length, frames[n] * frame.length);
      const ox = gap + n % 2 * (tw + gap), oy = gap + Math.floor(n / 2) * (th + gap);
      for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) for (let c = 0; c < 3; c++) {
        let sum = 0;
        for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
          const i = ((fromY + y * 2 + dy) * W + x * 2 + dx) * 4, a = frame[i + 3] / 255;
          sum += frame[i + c] * a + bg[c] * (1 - a);
        }
        out[((oy + y) * width + ox + x) * 3 + c] = Math.round(sum / 4);
      }
    }
    png(path.join(CACHE, filename), width, height, out, 3);
  };
  inspection([0, 1, 2, 3, 4, 5, 6, 7], 960, DARK, 'nastup-kontrola.png');
  inspection([43, 47, 51, 53, 54, 57, 63, 71], 0, DARK, 'konec-kontrola.png');
  inspection([40, 43, 47, 53], 0, LIGHT, 'horni-okraj-svetly.png');
  const center = Buffer.alloc(W * H * 4);
  for (const frame of [1, 2, 3, 4, 5, 6, 7, 8, 15, 30, 43, 47, 49, 51, 52, 53, 54, 57, 60, 63, 66, 69, 70, 71]) {
    fs.readSync(fd, center, 0, center.length, frame * center.length);
    png(path.join(CACHE, `snimek-${String(frame).padStart(2, '0')}.png`), W, H, center);
  }
  fs.readSync(fd, center, 0, center.length, 30 * center.length); fs.closeSync(fd);
  const dark = composite(center, DARK), light = composite(center, LIGHT), both = Buffer.alloc(W * 2 * H * 3);
  for (let y = 0; y < H; y++) { dark.copy(both, y * W * 6, y * W * 3, (y + 1) * W * 3); light.copy(both, y * W * 6 + W * 3, y * W * 3, (y + 1) * W * 3); }
  png(path.join(ROOT, 'overeni4.png'), W * 2, H, both, 3);
}
function run(exe, args, opts = {}) {
  const result = spawnSync(exe, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 8e6, windowsHide: true, ...opts });
  if (result.status !== 0) throw new Error(`${path.basename(exe)} failed: ${result.stderr || result.error}`);
  return result.stdout;
}
const RAW = path.join(CACHE, 'plameny4.rgba');
const SIM_REPORT = path.join(CACHE, 'simulace.json');
if (!IMPORTED && !ENCODE_ONLY) {
  const sims = [new Fluid(976, 448, 1.5, 7), new Fluid(816, 376, 1.8, 81), new Fluid(656, 304, 2.25, 43)];
  const embers = new Embers();
  const dt = 1 / 120;
  console.log('Warm-up: three reacting-fluid slabs, grids 976x448 + 816x376 + 656x304');
  for (let k = 0; k < 156; k++) {
    for (const s of sims) s.step(dt, 0, 1);
    // Gas is preconditioned; particles start empty at ignition.
    if (k % 30 === 29) console.log(`  warm-up ${k + 1}/156`);
  }
  const fd = fs.openSync(RAW, 'w'), report = [];
  for (let i = 0; i < N; i++) {
    if (i) for (let k = 0; k < 4; k++) {
      const t = ((i - 1) * 4 + k + 1) * dt;
      const source = 1 - smooth(1.75, 1.92, t);
      for (const s of sims) s.step(dt, t, source);
      embers.step(dt, sims[0], t, source);
    }
    const { rgba, info } = render(i, sims, embers);
    fs.writeSync(fd, rgba); report.push(info);
    if ([1, 2, 3, 4, 5, 6, 7, 8, 15, 30, 43, 47, 49, 51, 52, 53, 54, 57, 60, 63, 66, 69, 70, 71].includes(i)) png(path.join(CACHE, `snimek-${String(i).padStart(2, '0')}.png`), W, H, rgba);
    if (i % 3 === 0 || i === N - 1) console.log(`Frame ${i + 1}/${N}, edge ${info.baseline.toFixed(1)} px, embers ${info.emberCount}`);
  }
  fs.closeSync(fd); fs.writeFileSync(SIM_REPORT, JSON.stringify(report, null, 2));
  previews(RAW);
}
if (!IMPORTED && !DRAFT) {
  console.log(VERIFY_ONLY ? 'Rechecking final VP9 + alpha...' : 'Encoding VP9 + alpha, two passes, CRF 0 / lossless (exact alpha)...');
  const yuvFile = path.join(CACHE, 'encode.yuva');
  if (!VERIFY_ONLY) {
  const rgbaInput = ['-f', 'rawvideo', '-pixel_format', 'rgba', '-video_size', `${W}x${H}`, '-framerate', `${FPS}`, '-i', RAW];
  run(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...rgbaInput, '-frames:v', `${N}`, '-pix_fmt', 'yuva420p', '-f', 'rawvideo', yuvFile]);
  // Some swscale paths round RGBA alpha 128..254 up by one. Restore the
  // original alpha plane after RGB->YUV conversion; the codec is then exact.
  {
    const src = fs.openSync(RAW, 'r'), dst = fs.openSync(yuvFile, 'r+');
    const frame = Buffer.alloc(W * H * 4), alpha = Buffer.alloc(W * H);
    for (let f = 0; f < N; f++) {
      fs.readSync(src, frame, 0, frame.length, f * frame.length);
      for (let i = 0; i < alpha.length; i++) alpha[i] = frame[i * 4 + 3];
      fs.writeSync(dst, alpha, 0, alpha.length, f * W * H * 2.5 + W * H * 1.5);
    }
    fs.closeSync(src); fs.closeSync(dst);
  }
  const input = ['-f', 'rawvideo', '-pixel_format', 'yuva420p', '-video_size', `${W}x${H}`, '-framerate', `${FPS}`, '-i', yuvFile];
  const options = ['-an', '-frames:v', `${N}`, '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-b:v', '0', '-crf', '0', '-lossless', '1', '-auto-alt-ref', '0', '-deadline', 'good', '-cpu-used', '2', '-row-mt', '1', '-threads', '8', '-g', '72', '-passlogfile', path.join(CACHE, 'vp9-pass')];
  run(FFMPEG, ['-hide_banner', '-loglevel', 'warning', '-y', ...input, ...options, '-pass', '1', '-f', 'null', process.platform === 'win32' ? 'NUL' : '/dev/null']);
  run(FFMPEG, ['-hide_banner', '-loglevel', 'warning', '-y', ...input, ...options, '-pass', '2', '-metadata:s:v:0', 'alpha_mode=1', path.join(ROOT, 'plameny4.webm')]);
  }
  // Every delivered preview is decoded from the FINAL WebM with libvpx,
  // because FFmpeg's native VP9 decoder can silently discard alpha.
  const decoded = path.join(CACHE, 'decoded.rgba');
  run(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-c:v', 'libvpx-vp9', '-i', path.join(ROOT, 'plameny4.webm'), '-pix_fmt', 'rgba', '-f', 'rawvideo', decoded]);
  previews(decoded);
  const rgbFile = path.join(CACHE, 'nahled.rgb'), rgbFd = fs.openSync(rgbFile, 'w');
  const data = fs.readFileSync(decoded), bytes = W * H * 4;
  for (let i = 0; i < N; i++) fs.writeSync(rgbFd, composite(data.subarray(i * bytes, (i + 1) * bytes), DARK));
  fs.closeSync(rgbFd);
  if (!VERIFY_ONLY) run(FFMPEG, ['-hide_banner', '-loglevel', 'warning', '-y', '-f', 'rawvideo', '-pixel_format', 'rgb24', '-video_size', `${W}x${H}`, '-framerate', `${FPS}`, '-i', rgbFile, '-frames:v', `${N}`, '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '15', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.join(ROOT, 'plameny4-nahled.mp4')]);
  const probe = JSON.parse(run(FFPROBE, ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,width,height,pix_fmt,r_frame_rate,avg_frame_rate,nb_read_frames:stream_tags=alpha_mode:format=duration,size', '-of', 'json', path.join(ROOT, 'plameny4.webm')]));
  const simReport = JSON.parse(fs.readFileSync(SIM_REPORT, 'utf8'));
  const sourceData = fs.readFileSync(RAW);
  const measurements = [];
  for (let f = 0; f < N; f++) {
    const img = data.subarray(f * bytes, (f + 1) * bytes), t = f / FPS, b = baseline(t);
    let alphaMax = 0, alphaNonzero = 0, below60 = 0, belowActual = 0, alphaDifferent = 0, topBorderNonzero = 0, alphaSum = 0, topmost = H, fireTopmost = H, lowerSum = 0, diffSum = 0, edgeSum = 0, columns = 0, edgeColumns = 0, edgeMaxError = 0;
    const flameHeights = [], strongHeights = [], saturation = [];
    let firePixels = 0, yellowPixels = 0, baseCoveredColumns = 0;
    for (let x = 0; x < W; x++) {
      const target = b + edgeOffset(x, t), width = bandWidth(x, t);
      let lower = -1, brightest = -1, score = 0, flameTop = H, strongTop = H;
      const glowCandidates = [];
      for (let y = 0; y < H; y++) {
        const i = (y * W + x) * 4, a = img[i + 3];
        if (a !== sourceData[f * bytes + i + 3]) alphaDifferent++;
        alphaMax = Math.max(alphaMax, a); if (a) { alphaNonzero++; alphaSum += a; topmost = Math.min(topmost, y); if (y <= 5) topBorderNonzero++; if (a > 100 && img[i] > 145 && img[i + 1] < 160 && img[i + 2] < 70) fireTopmost = Math.min(fireTopmost, y); }
        if (a > 127) lower = y;
        if (y > Math.ceil(target + 60) && a) below60++;
        if (y >= Math.ceil(Math.fround(target) + Math.fround(width)) && a) belowActual++;
        // Exclude 1–4 px sparks: a flame sample must span at least seven
        // horizontal pixels and have orange thermal chromaticity.
        if (b > 400 && x > 3 && x < W - 4 && y < target - 10 && a > 45 && img[i] > 75 && img[i] > img[i + 1] * 1.12 && img[i] > img[i + 2] * 1.5
          && img[i - 12 + 3] > 45 && img[i + 12 + 3] > 45 && img[i - 12] > img[i - 12 + 1] * 1.10 && img[i + 12] > img[i + 12 + 1] * 1.10) flameTop = Math.min(flameTop, y);
        // Stricter flame-body measurement: reject wispy low-alpha red tails,
        // smoke and narrow sparks. Both thresholds are retained in the report.
        if (b > 400 && x > 3 && x < W - 4 && y < target - 10 && a > 110 && img[i] > 145 && img[i] > img[i + 1] * 1.3 && img[i + 2] < 70
          && img[i - 12 + 3] > 110 && img[i + 12 + 3] > 110 && img[i - 12] > 145 && img[i + 12] > 145) strongTop = Math.min(strongTop, y);
        if (y < target - 2 && y > target - 320 && a > 127 && img[i] > 140 && img[i] > img[i + 1] * 1.08) {
          firePixels++; saturation.push(1 - Math.min(img[i + 1], img[i + 2]) / img[i]);
          if (img[i + 1] > 180) yellowPixels++;
        }
        if (y === Math.floor(target - 6) && a > 165 && img[i] > 175) baseCoveredColumns++;
        // Scan the entire image, without consulting baseline. Then locate
        // the glowing ridge above the independently detected char bottom.
        if (y > 2 && y < H - 5) {
          const below = i + W * 4 * 4;
          const luma = (img[i] * .2126 + img[i + 1] * .7152 + img[i + 2] * .0722) * a / 255;
          const dark = (img[below] * .2126 + img[below + 1] * .7152 + img[below + 2] * .0722) * img[below + 3] / 255;
          const s = luma - dark;
          if (s > 35) glowCandidates.push({ y, score: s });
        }
      }
      for (const candidate of glowCandidates) {
        if (candidate.y > lower - 78 && candidate.y < lower - 39 && candidate.score > score) {
          score = candidate.score; brightest = candidate.y;
        }
      }
      if (target > 5 && target + width < H - 2 && lower >= 0 && t >= .25 && t < 1.72) { lowerSum += lower; diffSum += lower - (target + width); columns++; }
      if (score > 35 && brightest >= 0 && lower < H - 2 && target > 5 && target < H - 8 && t >= .25 && t < 1.72) { edgeSum += brightest; edgeColumns++; edgeMaxError = Math.max(edgeMaxError, Math.abs(brightest - b)); }
      if (flameTop < H) flameHeights.push(target - flameTop);
      if (strongTop < H) strongHeights.push(target - strongTop);
    }
    flameHeights.sort((a, b) => a - b);
    strongHeights.sort((a, b) => a - b); saturation.sort((a, b) => a - b);
    measurements.push({ frame: f, time: t, expectedBaseline: b, alphaMax, alphaNonzero, alphaSum, topmost, fireTopmost, topBorderNonzero, nonzeroBelow60PxBand: below60, nonzeroBelowActualRaggedBand: belowActual, alphaSamplesDifferentFromSource: alphaDifferent,
      ...(flameHeights.length ? { flameHeight95Px: flameHeights[Math.floor(flameHeights.length * .95)], flameHeightMedianPx: flameHeights[Math.floor(flameHeights.length * .5)] } : {}),
      ...(strongHeights.length ? { strongFlameHeight95Px: strongHeights[Math.floor(strongHeights.length * .95)], strongFlameHeightMedianPx: strongHeights[Math.floor(strongHeights.length * .5)] } : {}),
      ...(firePixels ? { firePixels, yellowFraction: yellowPixels / firePixels, medianFireSaturation: saturation[Math.floor(saturation.length * .5)], denseBaseWidthFraction: baseCoveredColumns / W } : {}),
      ...(columns ? { measuredCharBottomMean: lowerSum / columns, meanErrorToExpectedCharBottom: diffSum / columns, measuredColumns: columns } : {}),
      ...(edgeColumns ? { measuredGlowEdgeMean: edgeSum / edgeColumns, meanGlowEdgeErrorToBaseline: edgeSum / edgeColumns - b, maxGlowEdgeErrorToBaseline: edgeMaxError, glowColumns: edgeColumns } : {}) });
  }
  const last = measurements.at(-1), st = probe.streams[0];
  const fullBurn = simReport.filter(m => m.frame >= 10 && m.frame <= 42);
  const sparks = fullBurn.flatMap(m => m.sparkStats ?? []);
  const lengths = sparks.map(s => s.lengthPx).sort((a, b) => a - b);
  const sparkSummary = { activeCountMin: Math.min(...fullBurn.map(m => m.emberCount)), activeCountMax: Math.max(...fullBurn.map(m => m.emberCount)),
    visibleCountMin: Math.min(...fullBurn.map(m => m.visibleEmberCount)), visibleCountMax: Math.max(...fullBurn.map(m => m.visibleEmberCount)),
    trailMedianPx: lengths[Math.floor(lengths.length * .5)], trail95Px: lengths[Math.floor(lengths.length * .95)],
    fractionTrails2to8Px: lengths.filter(l => l >= 2 && l <= 8).length / lengths.length,
    fractionTiltedAtLeast10Deg: sparks.filter(s => Math.abs(s.angleDeg) >= 10).length / sparks.length,
    fractionTravelingUp: sparks.filter(s => Math.abs(s.angleDeg) < 90).length / sparks.length };
  const checks = { codecVP9: st.codec_name === 'vp9', dimensions: st.width === W && st.height === H, fps30: st.r_frame_rate === '30/1', frames72: Number(st.nb_read_frames) === N,
    duration2_4: Math.abs(Number(probe.format.duration) - 2.4) < .001, alphaTag: String(st.tags?.alpha_mode ?? st.tags?.ALPHA_MODE) === '1',
    decoded72Frames: data.length === N * bytes, lastFrameAlphaZero: last.alphaMax === 0, firstFrameAlphaZero: measurements[0].alphaMax === 0, noTopBorderClipping: measurements.every(m => m.topmost > 18),
    ignitionGrowsContinuously: measurements.slice(1, 8).every((m, i) => m.alphaSum > measurements[i].alphaSum),
    burnoutAlphaDecreases: measurements[53].alphaSum > 0 && measurements.slice(54).every((m, i) => m.alphaSum <= measurements[i + 53].alphaSum),
    noAlphaBelow60PxBand: measurements.every(m => m.nonzeroBelow60PxBand === 0),
    noAlphaBelowActualRaggedBand: measurements.every(m => m.nonzeroBelowActualRaggedBand === 0),
    alphaPlaneBitExact: measurements.every(m => m.alphaSamplesDifferentFromSource === 0),
    measuredMeanGlowEdgeWithin30Px: measurements.every(m => m.meanGlowEdgeErrorToBaseline === undefined || Math.abs(m.meanGlowEdgeErrorToBaseline) <= 30),
    edgeWithin30Px: simReport.every(m => m.edgeMin === undefined || (m.edgeMin >= m.baseline - 30 && m.edgeMax <= m.baseline + 30)),
    particlesPresentDuringFullBurn: fullBurn.every(m => m.emberCount > 10),
    majoritySparkTrails2to8Px: sparkSummary.fractionTrails2to8Px > .5 };
  fs.writeFileSync(path.join(ROOT, 'overeni4.json'), JSON.stringify({ checks, ffprobe: probe,
    notes: ['Native ffprobe may report yuv420p: alpha is stored in WebM BlockAdditional. alpha_mode=1 plus libvpx-vp9 RGBA decode verifies the actual alpha plane.', 'All previews are decoded from final WebM.', 'Smoke alpha bound for the three depth slabs is 0.341497.', 'Frames 0 and 71 (t=2.3666667 s) are wholly transparent; container duration is 2.4 s.', 'Exact specified baseline; endpoint edge biases remain within +/-30 px. Finite headroom shortens flames near the top; cooling residues stay inside the remaining char band.'],
    simulation: { grids: [[976, 448], [816, 376], [656, 304]], substepsPerFrame: 4, particleSubstepsPerFrame: 16, pressureIterations: 32, warmupSteps: 156, seed: '0x57afc213' }, sparkSummary, measurements, sourceMeasurements: simReport }, null, 2));
  console.log(JSON.stringify({ checks, sizeBytes: Number(probe.format.size) }, null, 2));
  if (Object.values(checks).some(v => !v)) throw new Error('Verification failed; see overeni4.json');
  if (!KEEP_WORK) {
    // Only explicitly named, generator-owned temporary files in this workspace.
    for (const filename of [RAW, decoded, rgbFile, yuvFile, path.join(CACHE, 'vp9-pass-0.log')]) if (fs.existsSync(filename)) fs.unlinkSync(filename);
  }
  console.log('Complete: plameny4.webm, plameny4-nahled.mp4, nahled4.png, overeni4.png, overeni4.json');
}
