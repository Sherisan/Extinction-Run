/*
 * The prehistoric plain, side on, in pixel layers that scroll at different speeds:
 *   sky       a dithered dusk gradient that burns red as the comet nears, and turns to ash after the impact
 *   far       a volcano range, smoking harder and spitting lava as the threat rises
 *   mid       mesas and buttes, with long-necked sauropods plodding across in silhouette
 *   flora     tree ferns, cycads and conifers in silhouette (flattened by the shockwave)
 *   ground    a sandy strip the herd runs on (two lanes), cut away below to show the rock: dithered strata, roots,
 *             sediment lines, fossils, crystals, magma veins that wake as the comet nears, and the burrows
 * All positions are in low-res pixels. `cam` is how far the camera has travelled (world px).
 */

import { fossilSprite, type Ctx, type Fossil } from './pixel';

export interface Layout {
  /** low-res size */
  W: number;
  H: number;
  /** the front edge of the running strip (the rock starts here) */
  GY: number;
  /** its back edge */
  BACK: number;
  /** the horizon, where the far range stands */
  HZ: number;
  /** the player's raptor, screen x */
  PX: number;
  /** feet of the back and front lanes */
  laneBack: number;
  laneFront: number;
}

export function layout(W: number, H: number): Layout {
  // on tall phone screens the HUD panels take the bottom, so the plain sits higher
  const GY = Math.round(H * (H > W * 1.3 ? 0.54 : 0.64));
  const BACK = GY - 12;
  return { W, H, GY, BACK, HZ: GY - Math.round(H * 0.16), PX: Math.round(W * (W < 200 ? 0.36 : 0.3)), laneBack: BACK + 4, laneFront: GY - 2 };
}

export const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
const mod = (a: number, n: number) => ((a % n) + n) % n;

/* ── Colour ──────────────────────────────────────────────────────────── */

type RGB = [number, number, number];
const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const rgb = (c: RGB) => `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`;

const SKY_CALM = ['#120a2a', '#2e1648', '#6b2a5e', '#c4486a', '#f2925a', '#ffd08a'].map(hex);
const SKY_DOOM = ['#1a0404', '#3d0a08', '#7a1608', '#c2340e', '#f2701a', '#ffc04a'].map(hex);
const SKY_ASH = ['#1a0e0c', '#2c1610', '#4a2014', '#6e2e18', '#92421e', '#b0602c'].map(hex);

function ramp(stops: RGB[], t: number): RGB {
  const f = Math.max(0, Math.min(0.9999, t)) * (stops.length - 1);
  const i = Math.floor(f);
  return mix(stops[i], stops[i + 1], f - i);
}

/** Sky colour at height t (0 top → 1 horizon) for the comet's heat and the aftermath. */
export function skyAt(t: number, heat: number, ash: number): RGB {
  return mix(mix(ramp(SKY_CALM, t), ramp(SKY_DOOM, t), heat), ramp(SKY_ASH, t), ash);
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayer = (x: number, y: number) => BAYER[(y & 3) * 4 + (x & 3)] / 16;

const skyCache = new Map<string, HTMLCanvasElement>();
/** The sky down to the horizon, banded with an ordered dither like an old console. Cached per heat step. */
export function skyCanvas(L: Layout, heat: number, ash: number): HTMLCanvasElement {
  const hs = Math.round(heat * 24);
  const as = Math.round(ash * 12);
  const id = `${L.W}x${L.H}:${hs}:${as}`;
  let c = skyCache.get(id);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = L.W;
  c.height = L.HZ + 1;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(L.W, L.HZ + 1);
  const BANDS = 22;
  const cols: RGB[] = [];
  for (let i = 0; i < BANDS; i++) cols.push(skyAt(i / (BANDS - 1), hs / 24, as / 12));
  for (let y = 0; y <= L.HZ; y++) {
    const t = Math.pow(y / L.HZ, 1.25);
    for (let x = 0; x < L.W; x++) {
      const v = t * (BANDS - 1) + bayer(x, y) - 0.47;
      const col = cols[Math.max(0, Math.min(BANDS - 1, Math.round(v)))];
      const o = (y * L.W + x) * 4;
      img.data[o] = col[0];
      img.data[o + 1] = col[1];
      img.data[o + 2] = col[2];
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  if (skyCache.size > 60) skyCache.delete(skyCache.keys().next().value!);
  skyCache.set(id, c);
  return c;
}

/** Stars, fading as the sky burns, and a far flock of pterosaurs crossing. */
export function drawStars(ctx: Ctx, L: Layout, heat: number, ash: number, time: number) {
  const a = Math.max(0, 1 - heat * 2.2);
  if (a > 0) {
    for (let i = 0; i < 80; i++) {
      const x = Math.floor(hash(i * 3.1) * L.W);
      const y = Math.floor(Math.pow(hash(i * 7.7), 1.6) * L.HZ * 0.7);
      const tw = 0.5 + 0.5 * Math.sin(time * (1 + hash(i) * 3) + i);
      ctx.fillStyle = `rgba(255,240,220,${(a * (0.3 + 0.7 * tw) * (0.4 + hash(i * 1.3) * 0.6)).toFixed(3)})`;
      ctx.fillRect(x, y, 1, 1);
      if (hash(i * 9.1) > 0.94) {
        ctx.fillStyle = `rgba(255,240,220,${(a * 0.35 * tw).toFixed(3)})`;
        ctx.fillRect(x - 1, y, 3, 1);
        ctx.fillRect(x, y - 1, 1, 3);
      }
    }
  }
  if (ash > 0.5) return;
  // the flock: little wingbeats in a loose V, drifting left
  const span = L.W + 80;
  const fx = L.W + 40 - mod(time * 9, span);
  const fy = L.HZ * 0.34 + Math.sin(time * 0.4) * 4;
  ctx.fillStyle = 'rgba(40,14,20,0.8)';
  for (let i = 0; i < 7; i++) {
    const row = Math.ceil(i / 2);
    const side = i % 2 ? 1 : -1;
    const x = Math.round(fx + row * 6);
    const y = Math.round(fy + side * row * 3 + Math.sin(time * 3 + i) * 0.8);
    const up = Math.sin(time * 8 + i * 1.3) > 0;
    ctx.fillRect(x - 2, y + (up ? -1 : 0), 2, 1);
    ctx.fillRect(x, y, 1, 1);
    ctx.fillRect(x + 1, y + (up ? -1 : 0), 2, 1);
  }
}

/* ── Far: the volcano range ──────────────────────────────────────────── */

const FAR_P = 0.04;
const VOLCANO_EVERY = 230;

function farHeight(x: number, H: number) {
  return H * (0.035 + 0.02 * Math.sin(x * 0.013) + 0.012 * Math.sin(x * 0.041 + 1.3) + 0.006 * Math.sin(x * 0.11));
}

function volcano(x: number, H: number) {
  const k = Math.floor(x / VOLCANO_EVERY);
  const cx = k * VOLCANO_EVERY + VOLCANO_EVERY * (0.3 + hash(k) * 0.4);
  const hgt = H * (0.1 + hash(k * 2.3) * 0.07);
  const half = hgt * 1.5;
  const d = Math.abs(x - cx);
  if (d > half) return 0;
  const crater = d < hgt * 0.12;
  return hgt * (1 - d / half) - (crater ? hgt * 0.04 : 0);
}

export function drawFar(ctx: Ctx, L: Layout, cam: number, heat: number, ash: number, time: number) {
  const off = cam * FAR_P;
  const base = mix(mix(hex('#3a1e3e'), hex('#4a1410'), heat), hex('#2a1810'), ash);
  const shade = mix(base, hex('#000000'), 0.25);
  const rim = rgb(mix(hex('#7a3858'), hex('#c4401c'), heat));
  const tops: number[] = [];
  for (let x = 0; x < L.W; x++) {
    const lx = x + off;
    const h = Math.max(farHeight(lx, L.H), volcano(lx, L.H));
    tops.push(Math.round(L.HZ - h));
  }
  // lit side and shadow side of each slope
  for (let x = 0; x < L.W; x++) {
    const top = tops[x];
    const right = tops[Math.min(L.W - 1, x + 1)];
    ctx.fillStyle = rgb(right > top ? base : shade);
    ctx.fillRect(x, top, 1, L.HZ - top + 1);
  }
  ctx.fillStyle = rim;
  for (let x = 0; x < L.W; x++) ctx.fillRect(x, tops[x], 1, 1);
  // craters: glowing lava, lava streams, smoke, bombs — harder as the threat rises
  const k0 = Math.floor(off / VOLCANO_EVERY) - 1;
  for (let k = k0; k < k0 + Math.ceil(L.W / VOLCANO_EVERY) + 3; k++) {
    const cx = k * VOLCANO_EVERY + VOLCANO_EVERY * (0.3 + hash(k) * 0.4);
    const hgt = L.H * (0.1 + hash(k * 2.3) * 0.07);
    const sx = Math.round(cx - off);
    if (sx < -60 || sx > L.W + 60) continue;
    const ty = Math.round(L.HZ - hgt * 0.96);
    const glow = Math.min(1, 0.4 + heat * 0.6 + 0.1 * Math.sin(time * 3 + k));
    ctx.fillStyle = `rgba(255,${Math.round(110 + 70 * heat)},40,${glow.toFixed(2)})`;
    ctx.fillRect(sx - 2, ty, 5, 1);
    ctx.fillRect(sx - 1, ty - 1, 3, 1);
    // lava trickling down the flank
    if (heat > 0.2) {
      const len = Math.round(hgt * 0.7 * Math.min(1, (heat - 0.2) * 2));
      for (let i = 0; i < len; i++) {
        const x = sx + 1 + Math.round(i * 0.9 + Math.sin(i * 0.7 + k) * 1.2);
        ctx.fillStyle = `rgba(255,${Math.round(150 - i * 2)},50,${(0.9 - (i / len) * 0.6).toFixed(2)})`;
        ctx.fillRect(x, ty + 1 + Math.round(i * 0.62), 1, 1);
      }
    }
    // smoke: round puffs rising and leaning left on the wind
    const puffs = 7 + Math.round(heat * 10);
    for (let i = 0; i < puffs; i++) {
      const ph = mod(time * (0.1 + heat * 0.14) + i / puffs + hash(k * 9 + i) * 0.1, 1);
      const px = sx - ph * (20 + heat * 34) + Math.sin(ph * 6 + k) * 2;
      const py = ty - 2 - ph * L.H * (0.13 + heat * 0.1);
      const r = 1.5 + ph * (3 + heat * 5);
      const gr = Math.round(46 + 30 * (1 - ph));
      ctx.fillStyle = `rgba(${gr + 14},${gr - 8},${gr - 14},${(0.62 * (1 - ph)).toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(Math.round(px), Math.round(py), r, 0, Math.PI * 2);
      ctx.fill();
      // lava light on the underside of the low puffs
      if (ph < 0.25) {
        ctx.fillStyle = `rgba(255,120,40,${(0.35 * (1 - ph * 4) * glow).toFixed(2)})`;
        ctx.fillRect(Math.round(px - r * 0.6), Math.round(py + r * 0.4), Math.max(1, Math.round(r * 1.2)), 1);
      }
    }
    if (heat > 0.35) {
      for (let i = 0; i < 4; i++) {
        const ph = mod(time * 0.6 + hash(k * 13 + i), 1);
        const vx = (hash(k * 5 + i) - 0.5) * 34;
        const bx = sx + vx * ph;
        const by = ty - 32 * heat * ph + 36 * ph * ph;
        ctx.fillStyle = `rgba(255,${Math.round(140 + 80 * (1 - ph))},60,${(1 - ph).toFixed(2)})`;
        ctx.fillRect(Math.round(bx), Math.round(by), 1, 1);
      }
    }
  }
}

/* ── Mid: mesas, and sauropods walking across ────────────────────────── */

const MID_P = 0.15;

function midHeight(x: number, H: number) {
  const k = Math.floor(x / 90);
  const w = 30 + hash(k) * 40;
  const e = mod(x, 90);
  const base = H * (0.03 + 0.012 * Math.sin(x * 0.03));
  if (!(e < w && hash(k * 3.3) < 0.6)) return base;
  const edge = Math.min(e, w - e);
  return base + Math.min(1, edge / 3) * H * (0.045 + hash(k * 7.1) * 0.035);
}

export function drawMid(ctx: Ctx, L: Layout, cam: number, heat: number, ash: number) {
  const off = cam * MID_P;
  const col = mix(mix(hex('#2a1430'), hex('#34100c'), heat), hex('#20120c'), ash);
  ctx.fillStyle = rgb(col);
  const tops: number[] = [];
  for (let x = 0; x < L.W; x++) {
    const top = Math.round(L.HZ + 6 - midHeight(x + off, L.H));
    tops.push(top);
    ctx.fillRect(x, top, 1, L.BACK - top + 1);
  }
  // a thin sunset rim on the mesa tops
  ctx.fillStyle = rgb(mix(col, hex('#ff9a5a'), 0.35 + heat * 0.2));
  for (let x = 0; x < L.W; x++) ctx.fillRect(x, tops[x], 1, 1);
}

/** Long-necked sauropods plodding left across the plain, in silhouette: a mother and her young. */
export function drawSauropods(ctx: Ctx, L: Layout, cam: number, heat: number, ash: number, time: number, gone: number) {
  if (gone >= 1) return;
  const P = 0.24;
  const SPAN = 300;
  const col = mix(mix(hex('#24102a'), hex('#2c0c08'), heat), hex('#1a0e0a'), ash);
  ctx.fillStyle = rgb(col);
  const off = cam * P + time * 4; // they walk, too
  const k0 = Math.floor(off / SPAN) - 1;
  for (let k = k0; k <= k0 + Math.ceil(L.W / SPAN) + 2; k++) {
    const baseX = k * SPAN + hash(k * 3.9) * 200;
    for (const [dx, s] of [[0, 1], [-34, 0.55]] as const) {
      const sx = Math.round(baseX + dx - off);
      if (sx < -70 || sx > L.W + 70) continue;
      drawSauropod(ctx, sx, L.BACK - 1, s * (L.H / 200), time + k, gone);
    }
  }
}

function drawSauropod(ctx: Ctx, x: number, feet: number, s: number, t: number, flee: number) {
  const px = (dx: number, dy: number, w: number, h: number) => ctx.fillRect(Math.round(x + dx * s), Math.round(feet - dy * s), Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s)));
  const step = Math.sin(t * 3);
  // legs: four pillars, alternating
  for (const [lx, ph] of [[-12, 0], [-6, Math.PI], [7, Math.PI], [13, 0]] as const) {
    const lift = Math.max(0, Math.sin(t * 3 + ph)) * 2;
    px(lx, 12 + lift, 4, 12 - lift);
  }
  // body
  for (let i = -16; i <= 17; i++) {
    const h = Math.sqrt(Math.max(0, 1 - (i / 17) ** 2)) * 9;
    px(i, 12 + h + step * 0.3, 1, h * 1.6);
  }
  // tail sweeping back to the right, and the long neck up and forward (left), raised in alarm as the end nears
  for (let i = 0; i < 26; i++) {
    const t2 = i / 26;
    px(16 + i, 16 - t2 * 10 + Math.sin(t * 2 + t2 * 3) * t2 * 1.5, 1, Math.max(1, 5 * (1 - t2)));
  }
  const lift = 14 + flee * 6;
  for (let i = 0; i < 24; i++) {
    const t2 = i / 24;
    const nx = -15 - i * 0.85;
    const ny = 18 + Math.sin(t2 * Math.PI * 0.5) * lift;
    px(nx, ny + 2, 2, 3);
  }
  px(-37, 18 + lift + 3, 5, 3);
  px(-39, 18 + lift + 2, 3, 2);
}

/* ── Flora: silhouettes beyond the running strip ─────────────────────── */

const FLORA_P = 0.45;

/**
 * Tree ferns, cycads and conifers. `blownFrom`: screen x beyond which the shockwave has passed; plants there are
 * flattened, leaning hard left.
 */
export function drawFlora(ctx: Ctx, L: Layout, cam: number, heat: number, ash: number, time: number, wind: number, blownFrom: number) {
  const off = cam * FLORA_P;
  ctx.fillStyle = rgb(mix(mix(hex('#1c0c1e'), hex('#220806'), heat), hex('#140a08'), ash));
  const SPACING = 26;
  const k0 = Math.floor(off / SPACING) - 2;
  for (let k = k0; k < k0 + Math.ceil(L.W / SPACING) + 4; k++) {
    if (hash(k * 1.7) < 0.35) continue;
    const sx = Math.round(k * SPACING + hash(k * 2.9) * SPACING - off);
    if (sx < -20 || sx > L.W + 20) continue;
    const kind = Math.floor(hash(k * 4.3) * 3);
    const hgt = Math.round(L.H * (0.07 + hash(k * 6.1) * 0.08));
    const base = L.BACK + 1;
    const blown = sx > blownFrom;
    if (blown && hash(k * 9.9) < 0.5) continue; // torn out
    const lean = blown ? -0.9 : -(wind * (0.15 + 0.1 * Math.sin(time * 2 + k)));
    const topX = sx + lean * hgt;
    for (let i = 0; i <= hgt; i++) {
      const t = i / hgt;
      ctx.fillRect(Math.round(sx + (topX - sx) * t * t), base - i, kind === 2 ? 1 : 2, 1);
    }
    const tx = Math.round(topX);
    const ty = base - hgt;
    if (kind === 2) {
      for (let i = 0; i < 5; i++) {
        const w = 2 + i * 2;
        ctx.fillRect(tx - w + Math.round(lean * 2), ty + i * 3, w * 2, 2);
      }
    } else {
      const fronds = kind === 0 ? 7 : 9;
      for (let f = 0; f < fronds; f++) {
        const a = Math.PI * (0.1 + (0.8 * f) / (fronds - 1));
        const len = (kind === 0 ? 9 : 7) + (f % 2) * 2;
        for (let i = 1; i <= len; i++) {
          const t = i / len;
          ctx.fillRect(Math.round(tx + Math.cos(a) * i + lean * i * 1.2), Math.round(ty - Math.sin(a) * i * 0.6 + t * t * 5), 1, 1);
        }
      }
    }
  }
}

/* ── Ground: the running strip and the rock under it ─────────────────── */

const STRATA = ['#b8784a', '#9c5e3a', '#86492e', '#6e3a26', '#58301f', '#432618', '#2e1a10'].map(hex);
const FOSSILS: Fossil[] = ['ammonite', 'bone', 'trilobite', 'ammonite', 'skeleton'];

function stratumTop(i: number, wx: number, L: Layout) {
  if (i === 0) return L.GY + 1;
  const depth = L.H - L.GY;
  return Math.round(L.GY + 3 + depth * Math.pow(i / STRATA.length, 0.85) + 1.8 * Math.sin(wx * 0.04 + i * 1.7) + 1.2 * Math.sin(wx * 0.13 + i * 3.1));
}

/**
 * The strip of sand the herd runs on (BACK to GY, two lanes), its grassy lip, and the rock cut away beneath it.
 * `scorchFrom`: screen x beyond which the shockwave has passed.
 */
export function drawGround(ctx: Ctx, L: Layout, cam: number, heat: number, ash: number, time: number, scorchFrom: number) {
  const sand = [hex('#c4925e'), hex('#d4a26a'), hex('#e0b47a')].map((c) => mix(mix(c, hex('#e88a4a'), heat * 0.45), hex('#5a3a24'), ash));
  // three bands of sand, dithered into each other, lighter towards the front
  for (let y = L.BACK; y < L.GY; y++) {
    const t = ((y - L.BACK) / (L.GY - L.BACK)) * 2;
    for (let x = 0; x < L.W; x++) {
      const i = Math.min(2, Math.floor(t + bayer(x + Math.floor(cam), y) - 0.25 + 0.25));
      ctx.fillStyle = rgb(sand[Math.max(0, i)]);
      ctx.fillRect(x, y, 1, 1);
    }
  }
  // the darker line where the strip meets the land behind it
  ctx.fillStyle = rgb(mix(sand[0], hex('#3a1a10'), 0.45));
  ctx.fillRect(0, L.BACK, L.W, 1);
  // wind ripples, pebbles and tufts, all moving with the ground
  for (let x = 0; x < L.W; x++) {
    const wx = Math.floor(x + cam);
    const h1 = hash(wx * 0.37);
    const y = L.BACK + 1 + Math.floor(hash(wx * 1.9) * (L.GY - L.BACK - 1));
    if (h1 < 0.1) {
      ctx.fillStyle = 'rgba(70,40,24,0.5)';
      ctx.fillRect(x, y, 1, 1);
    } else if (h1 > 0.93) {
      ctx.fillStyle = 'rgba(255,240,200,0.45)';
      ctx.fillRect(x, y, 2, 1);
    }
    if (hash(wx * 0.53) < 0.06 && ash < 0.5) {
      // a tuft of grass
      const ty = L.BACK + 2 + Math.floor(hash(wx * 2.3) * 8);
      ctx.fillStyle = hash(wx * 4.1) < 0.5 ? '#5e8a34' : '#7a9a3a';
      ctx.fillRect(x, ty - 2, 1, 2);
      ctx.fillRect(x - 1, ty - 1, 1, 1);
      ctx.fillRect(x + 1, ty - 1, 1, 1);
    }
  }
  // the rock, column by column: each stratum a little lighter at its top edge, dithered where they meet
  const fire = hex('#ff5a1a');
  const cols = STRATA.map((c, i) => mix(mix(c, fire, heat * 0.12 * (i / STRATA.length)), hex('#1e120c'), ash * 0.45));
  for (let x = 0; x < L.W; x++) {
    const wx = x + cam;
    for (let i = 0; i < STRATA.length; i++) {
      const top = stratumTop(i, wx, L);
      const bot = i === STRATA.length - 1 ? L.H : stratumTop(i + 1, wx, L);
      if (bot <= top) continue;
      ctx.fillStyle = rgb(cols[i]);
      ctx.fillRect(x, top, 1, bot - top);
      ctx.fillStyle = rgb(mix(cols[i], hex('#fff0d0'), 0.12));
      ctx.fillRect(x, top, 1, 1);
      if (i > 0 && (Math.floor(wx) + top) % 2 === 0) {
        ctx.fillStyle = rgb(cols[i - 1]);
        ctx.fillRect(x, top, 1, 1);
      }
    }
  }
  // fine sediment lines inside the bands
  ctx.fillStyle = 'rgba(255,225,180,0.08)';
  for (let j = 0; j < 9; j++) {
    const base = L.GY + 6 + j * ((L.H - L.GY) / 9);
    for (let x = 0; x < L.W; x++) {
      const wx = x + cam;
      if (hash(Math.floor(wx / 7) + j * 77) < 0.35) continue;
      ctx.fillRect(x, Math.round(base + Math.sin(wx * 0.05 + j) * 1.5), 1, 1);
    }
  }
  // the grassy lip over the cut, with roots reaching down into the rock
  for (let x = 0; x < L.W; x++) {
    const wx = Math.floor(x + cam);
    ctx.fillStyle = ash > 0.5 ? '#3a2a1a' : hash(wx * 0.91) < 0.5 ? '#5a7a2e' : '#4a6a28';
    ctx.fillRect(x, L.GY, 1, 1);
    if (hash(wx * 1.7) < 0.35) ctx.fillRect(x, L.GY + 1, 1, 1);
    if (hash(wx * 0.29) < 0.022) {
      ctx.fillStyle = 'rgba(40,24,14,0.35)';
      const len = 3 + Math.floor(hash(wx * 3.7) * 8);
      for (let i = 0; i < len; i++) ctx.fillRect(x + Math.round(Math.sin(i * 0.9 + wx) * 1), L.GY + 2 + i, 1, 1);
    }
  }
  // grit
  for (let x = 0; x < L.W; x++) {
    const wx = Math.floor(x + cam);
    if (hash(wx * 0.71) < 0.22) {
      const y = L.GY + 3 + Math.floor(hash(wx * 3.3) * (L.H - L.GY - 3));
      ctx.fillStyle = hash(wx * 5.1) < 0.55 ? 'rgba(20,10,6,0.4)' : 'rgba(255,230,190,0.2)';
      ctx.fillRect(x, y, 1, 1);
    }
  }
  // fossils and crystal pockets
  const FE = 62;
  for (let k = Math.floor(cam / FE) - 2; k < Math.floor((cam + L.W) / FE) + 1; k++) {
    if (hash(k * 4.4) < 0.25) continue;
    const sx = Math.round(k * FE + hash(k * 5.5) * FE - cam);
    const sy = Math.round(L.GY + 18 + hash(k * 6.6) * Math.max(4, L.H - L.GY - 34));
    if (hash(k * 8.8) < 0.2) {
      crystals(ctx, sx, sy, k, heat);
      continue;
    }
    ctx.drawImage(fossilSprite(FOSSILS[Math.floor(hash(k * 7.7) * FOSSILS.length)]), sx, sy);
  }
  // magma veins in the deep rock, waking as the comet nears
  const vein = Math.max(heat - 0.3, 0) / 0.7 + ash * 0.6;
  if (vein > 0.02) {
    const vy = L.H - Math.round((L.H - L.GY) * 0.16);
    for (let x = 0; x < L.W; x++) {
      const wx = x + cam;
      const y = Math.round(vy + Math.sin(wx * 0.03) * 3 + Math.sin(wx * 0.11) * 1.5);
      const p = 0.5 + 0.5 * Math.sin(time * 3 - wx * 0.05);
      ctx.fillStyle = `rgba(255,${Math.round(90 + 90 * p)},30,${Math.min(1, vein * (0.5 + 0.5 * p)).toFixed(2)})`;
      ctx.fillRect(x, y, 1, 1);
      if (hash(Math.floor(wx) * 0.13) < 0.04) {
        for (let i = 1; i < 5; i++) ctx.fillRect(x + (i % 2), y - i, 1, 1);
      }
    }
  }
  // scorched behind the shockwave
  if (scorchFrom < L.W) {
    const x0 = Math.max(0, Math.floor(scorchFrom));
    ctx.fillStyle = 'rgba(24,8,4,0.5)';
    ctx.fillRect(x0, L.BACK, L.W - x0, L.GY - L.BACK + 1);
    // glowing cracks
    for (let x = x0; x < L.W; x++) {
      const wx = Math.floor(x + cam);
      if (hash(wx * 0.61) < 0.12) {
        ctx.fillStyle = `rgba(255,${Math.round(110 + hash(wx) * 80)},40,${(0.8 * (1 - ash * 0.6)).toFixed(2)})`;
        ctx.fillRect(x, L.BACK + 2 + Math.floor(hash(wx * 2.2) * 9), 2, 1);
      }
    }
  }
}

function crystals(ctx: Ctx, x: number, y: number, k: number, heat: number) {
  const col = hash(k * 2.1) < 0.5 ? ['#7a4ac8', '#b48aff', '#e8d8ff'] : ['#2a9a8a', '#5ae0c8', '#d8fff4'];
  ctx.fillStyle = 'rgba(20,10,6,0.6)';
  ctx.fillRect(x - 1, y - 1, 9, 7);
  for (let i = 0; i < 4; i++) {
    const cx = x + i * 2;
    const h = 2 + Math.floor(hash(k * 3 + i) * 4);
    ctx.fillStyle = col[0];
    ctx.fillRect(cx, y + 5 - h, 2, h);
    ctx.fillStyle = col[1];
    ctx.fillRect(cx, y + 5 - h, 1, h - 1);
    ctx.fillStyle = col[2];
    ctx.fillRect(cx, y + 5 - h, 1, 1);
  }
  if (heat > 0.5) {
    ctx.fillStyle = `rgba(255,255,255,${((heat - 0.5) * 0.6).toFixed(2)})`;
    ctx.fillRect(x + 2, y + 1, 1, 1);
  }
}

/** A burrow: a tunnel from the surface down to a chamber, dug `p` (0..1) of the way. */
export function drawBurrow(ctx: Ctx, L: Layout, sx: number, p: number, back: boolean) {
  const top = back ? L.laneBack : L.laneFront;
  const chamberY = L.GY + 12;
  const dark = '#1a0d08';
  const rim = '#3e2416';
  const depth = Math.round((chamberY - top) * Math.min(1, p / 0.7));
  // spoil heap beside the hole
  ctx.fillStyle = '#a8784a';
  ctx.fillRect(sx - 10, top - 2, 7, 2);
  ctx.fillRect(sx - 9, top - 3, 5, 1);
  ctx.fillStyle = '#c8986a';
  ctx.fillRect(sx - 9, top - 3, 2, 1);
  for (let i = 0; i <= depth; i++) {
    const t = i / Math.max(1, chamberY - top);
    const x = Math.round(sx - 3 + t * 6);
    ctx.fillStyle = rim;
    ctx.fillRect(x - 3, top + i, 7, 1);
    ctx.fillStyle = dark;
    ctx.fillRect(x - 2, top + i, 5, 1);
  }
  if (p > 0.7) {
    const k = Math.min(1, (p - 0.7) / 0.3);
    const w = Math.round(13 * k);
    ctx.fillStyle = rim;
    ctx.fillRect(sx + 3 - w - 1, chamberY - 6, w * 2 + 2, 12);
    ctx.fillRect(sx + 3 - w, chamberY - 7, w * 2, 1);
    ctx.fillStyle = dark;
    ctx.fillRect(sx + 3 - w, chamberY - 5, w * 2, 10);
    // a warm glow in the den
    ctx.fillStyle = 'rgba(255,170,90,0.12)';
    ctx.fillRect(sx + 3 - w + 1, chamberY - 4, w * 2 - 2, 8);
  }
}
