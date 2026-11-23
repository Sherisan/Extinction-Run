/*
 * The scene: a pixel-art side-scroller behind the HUD. A herd of raptors sprints right across a prehistoric plain at
 * dusk while a comet falls out of the sky; the multiplier is the distance run. Each bet is a raptor (yours are marked).
 * They hop logs, rocks and cycads and duck under pterosaurs on their own: none of that changes anything.
 *   burrow (cash out)  the raptor skids, digs, and drops into a chamber you can see in the cut-away rock, safe
 *   impact (crash)     the comet streaks down to the horizon, a white flash, a fireball rises behind the mesas, and
 *                      the shockwave rolls across the plain flinging every raptor still running
 * Everything is drawn at a low resolution and scaled up with hard edges. The scene animates outcomes; it never
 * decides them (useGame, run.ts).
 */

import {
  GHOST_HIDES, RUN_FRAMES, clutterSprite, curledSprite, pixelText, pteroSprite, raptorSprite, textWidth, type Clutter, type HideKey, type Pose,
} from './pixel';
import { drawBurrow, drawFar, drawFlora, drawGround, drawMid, drawSauropods, drawStars, hash, layout, skyCanvas, type Layout } from './world';
import { IMPACT_S, distAt, type Run } from '../game/run';
import { secondsTo } from '../game/clock';

export interface RunnerView {
  id: string;
  hide: 'red' | 'blue';
  /** Local performance.now() when this bet burrowed (cashed out), or null. */
  burrowAt: number | null;
}

export interface GhostView {
  id: string;
  /** Cashed out: the raptor digs in. */
  burrowed: boolean;
}

export interface SceneView {
  /** null until the first snapshot. */
  phase: 'BETTING' | 'FLYING' | 'CRASHED' | null;
  run: Run;
  /** Seconds until the start, while betting. */
  countdownS: number | null;
  runners: RunnerView[];
  ghosts: GhostView[];
  growthRate: number;
  reducedMotion: boolean;
}

interface Fling {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
}

interface Actor {
  id: string;
  hide: HideKey;
  /** Screen offset from the player's spot, at 360 px wide. */
  dx: number;
  back: boolean;
  mine: boolean;
  burrowAt: number | null;
  /** World x of the burrow. */
  burrowX: number | null;
  fling: Fling | null;
  phase: number;
  dustT: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  g: number;
  age: number;
  life: number;
  color: string;
  size: number;
  /** moves with the ground */
  ground: boolean;
}

interface Ptero {
  x: number;
  y: number;
  speed: number;
  seed: number;
}

/** Low-res pixels per metre run. */
const PPM = 6;
/** Milestones staked out along the course, passed exactly as the multiplier reaches them. */
const SIGNS = [1.5, 2, 3, 5, 10, 25, 50, 100, 250, 500];
/** Where the other raptors run, relative to yours: [dx at 360 px wide, back lane]. */
const SLOTS: [number, boolean][] = [[22, true], [62, false], [-44, true], [108, true], [-82, false], [66, true], [-100, true], [130, false]];
const OB_EVERY = 64;
const DECOR_EVERY = 23;
const OBSTACLES: Clutter[] = ['log', 'rock', 'cycad'];
const DECOR: Clutter[] = ['skull', 'fern', 'fern'];

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export class Scene {
  private ctx: CanvasRenderingContext2D;
  private low: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private pix = 3;
  private L: Layout = layout(160, 90);
  private actors = new Map<string, Actor>();
  private particles: Particle[] = [];
  private pteros: Ptero[] = [];
  private nextPtero = 3;
  private last = 0;
  private time = 0;
  private prevPhase: SceneView['phase'] = null;
  private prevCam = 0;
  private resizeObs: ResizeObserver | null = null;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.low = document.createElement('canvas');
    this.g = this.low.getContext('2d')!;
    this.resize();
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(canvas);
  }

  destroy() {
    this.resizeObs?.disconnect();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.w = Math.max(1, Math.round(rect.width));
    this.h = Math.max(1, Math.round(rect.height));
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    // big chunky pixels: about 200 rows on a desktop, never fewer than 140 columns on a phone
    this.pix = Math.max(2, Math.min(7, Math.round(Math.min(this.h / 200, this.w / 140))));
    const W = Math.ceil(this.w / this.pix);
    const H = Math.ceil(this.h / this.pix);
    this.low.width = W;
    this.low.height = H;
    this.g = this.low.getContext('2d')!;
    this.g.imageSmoothingEnabled = false;
    this.L = layout(W, H);
  }

  /** Draw one frame. `now` is performance.now(). */
  frame(now: number, view: SceneView) {
    const dt = Math.min(0.1, this.last ? (now - this.last) / 1000 : 0.016);
    this.last = now;
    this.time += dt;
    const { run } = view;
    const time = this.time;
    const L = this.L;
    const g = this.g;
    const reduced = view.reducedMotion;

    if (view.phase !== this.prevPhase) {
      if (view.phase === 'BETTING') {
        this.actors.clear();
        this.particles = [];
        this.pteros = [];
        this.nextPtero = 3;
      }
      this.prevPhase = view.phase;
    }

    const cam = run.dist * PPM;
    const scroll = Math.max(0, cam - this.prevCam);
    this.prevCam = cam;
    const crash = run.crashAge;
    const impactK = crash == null ? 0 : clamp01(crash / IMPACT_S);
    const blast = crash == null ? -1 : crash - IMPACT_S;
    const ash = blast > 0 ? clamp01(blast / 1.6) : 0;
    const heat = crash == null ? run.heat : Math.max(run.heat, 0.55 + 0.45 * impactK);
    const IX = Math.round(L.W * 0.58);
    // the shockwave's front, screen x (off to the right until the impact)
    const front = blast < 0 ? Infinity : IX - blast * L.W * 1.25;
    const wind = clamp01(run.speed / 70) * 0.4 + heat * 0.6;

    this.syncActors(view, now, cam);

    // ── sky ──
    g.drawImage(skyCanvas(L, heat, ash), 0, 0);
    drawStars(g, L, heat, ash, time);
    if (blast < 0) this.shootingStars(heat, time);
    if (blast < 0) this.comet(run, heat, impactK, crash != null);
    if (heat > 0.45 || blast >= 0) this.meteorShower(heat, blast, time);
    drawFar(g, L, cam, heat, ash, time);
    if (blast >= 0) this.fireball(blast, IX);
    drawMid(g, L, cam, heat, ash);
    drawSauropods(g, L, cam, heat, ash, time, blast >= 0 ? 1 : heat);
    drawFlora(g, L, cam, heat, ash, time, wind, front);
    drawGround(g, L, cam, heat, ash, time, front);

    // ── burrows in the cut-away rock ──
    for (const a of this.actors.values()) {
      if (a.burrowAt == null || a.burrowX == null) continue;
      const age = (now - a.burrowAt) / 1000;
      const sx = Math.round(a.burrowX - cam);
      if (sx < -30 || sx > L.W + 30) continue;
      drawBurrow(g, L, sx, clamp01((age - 0.2) / 0.75), a.back);
      if (age >= 0.95) {
        const spr = curledSprite(a.hide);
        const shake = blast >= 0 && blast < 1.2 && !reduced ? Math.round(Math.sin(time * 60) * 1) : 0;
        g.drawImage(spr, sx + 3 - 9 + shake, L.GY + 12 - 4);
        if (a.mine) this.marker(sx + 3, L.GY + 4, a.hide, time);
      }
    }

    // ── the course: clutter, milestones, then the herd, back lane first ──
    const obstacles = this.obstacles(cam);
    this.drawDecor(cam, true);
    for (const o of obstacles) if (o.back) this.drawObstacle(o.spr, o.sx, L.laneBack);
    this.drawSigns(view, cam, run);
    this.drawActors(view, true, now, dt, cam, obstacles, front, heat);
    this.drawDecor(cam, false);
    for (const o of obstacles) if (!o.back) this.drawObstacle(o.spr, o.sx, L.laneFront);
    this.drawActors(view, false, now, dt, cam, obstacles, front, heat);

    if (run.phase === 'run' && heat > 0.4 && !reduced && Math.random() < dt * 30 * (heat - 0.4)) {
      this.particles.push({ x: rnd(0, L.W), y: L.laneFront - rnd(0, 10), vx: rnd(-14, -4), vy: rnd(-22, -8), g: -3, age: 0, life: rnd(1.2, 2.4), color: Math.random() < 0.6 ? '#ff8a2a' : '#ffd060', size: 1, ground: false });
    }
    this.stepPteros(view, dt, scroll, time);
    if (blast >= 0) this.aftermath(blast, front, dt, reduced);
    this.stepParticles(dt, scroll);

    // ── grade ──
    if (heat > 0.02) {
      g.fillStyle = `rgba(255,70,20,${(0.1 * heat).toFixed(3)})`;
      g.fillRect(0, 0, L.W, L.H);
    }
    if (ash > 0) {
      g.fillStyle = `rgba(16,6,2,${(0.16 * ash).toFixed(3)})`;
      g.fillRect(0, 0, L.W, L.H);
    }
    const vig = g.createRadialGradient(L.W / 2, L.H * 0.5, L.H * 0.35, L.W / 2, L.H * 0.5, L.H * 0.95);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, `rgba(0,0,0,${(0.45 + 0.2 * heat).toFixed(2)})`);
    g.fillStyle = vig;
    g.fillRect(0, 0, L.W, L.H);
    // the flash of the impact
    if (blast >= 0 && blast < 0.5) {
      g.fillStyle = `rgba(255,248,230,${(reduced ? 0.4 : 1) * (1 - blast / 0.5) ** 2})`;
      g.fillRect(0, 0, L.W, L.H);
    }

    // ── up to the screen, hard pixels ──
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    let shake = 0;
    if (!reduced) {
      if (crash != null && crash < IMPACT_S) shake = 1;
      else if (blast >= 0 && blast < 1.6) shake = Math.round(3 * (1 - blast / 1.6));
      else if (run.phase === 'run' && heat > 0.6) shake = Math.random() < (heat - 0.6) * 0.6 ? 1 : 0;
    }
    const ox = shake ? Math.round(rnd(-shake, shake)) * this.pix : 0;
    const oy = shake ? Math.round(rnd(-shake, shake)) * this.pix : 0;
    ctx.fillStyle = '#000';
    if (shake) ctx.fillRect(0, 0, this.w, this.h);
    ctx.drawImage(this.low, ox, oy, L.W * this.pix, L.H * this.pix);
  }

  /* ── Sky ───────────────────────────────────────────────────────────── */

  /** The comet: a white-hot head and a burning tail, lower and bigger as the run goes on; streaking in at the impact. */
  private comet(run: Run, heat: number, impactK: number, crashed: boolean) {
    const g = this.g;
    const L = this.L;
    const S = { x: L.W * 0.8, y: L.H * 0.07 };
    const E = { x: L.W * 0.58, y: L.HZ };
    const p = clamp01(1 - run.altitude / 1000);
    const f = Math.pow(p, 1.6);
    const hx = S.x + (E.x - S.x) * f;
    const hy = S.y + (E.y - S.y) * f;
    const r = 1 + 11 * Math.pow(p, 1.5) + (crashed ? 3 * impactK : 0);
    const dx = S.x - E.x;
    const dy = S.y - E.y;
    const dl = Math.hypot(dx, dy);
    const ux = dx / dl;
    const uy = dy / dl;
    // glow
    const gl = g.createRadialGradient(hx, hy, 0, hx, hy, r * 5 + 6);
    gl.addColorStop(0, `rgba(255,220,150,${(0.45 + heat * 0.3).toFixed(2)})`);
    gl.addColorStop(1, 'rgba(255,120,40,0)');
    g.fillStyle = gl;
    g.fillRect(hx - r * 5 - 6, hy - r * 5 - 6, r * 10 + 12, r * 10 + 12);
    // tail: shrinking, cooling blobs back along the path, flickering
    const len = 8 + 60 * heat + r * 4 + (crashed ? 30 * impactK : 0);
    const steps = Math.ceil(len);
    for (let i = steps; i >= 0; i--) {
      const t = i / steps;
      const wob = Math.sin(this.time * 30 + i) * t * 1.2;
      const x = hx + ux * len * t - uy * wob;
      const y = hy + uy * len * t + ux * wob;
      const rr = Math.max(0.5, r * (1 - t) * 0.9);
      const col = t < 0.15 ? '255,250,230' : t < 0.4 ? '255,210,110' : t < 0.7 ? '255,130,50' : '200,60,30';
      g.fillStyle = `rgba(${col},${((1 - t) * 0.9).toFixed(2)})`;
      g.fillRect(Math.round(x - rr), Math.round(y - rr), Math.max(1, Math.round(rr * 2)), Math.max(1, Math.round(rr * 2)));
    }
    // head
    const R = Math.max(1, Math.round(r));
    g.fillStyle = '#ffc870';
    g.beginPath();
    g.arc(Math.round(hx), Math.round(hy), R + 0.5, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#fffbe8';
    g.beginPath();
    g.arc(Math.round(hx - R * 0.1), Math.round(hy - R * 0.1), Math.max(0.6, R * 0.82), 0, Math.PI * 2);
    g.fill();
  }

  private shootingStars(heat: number, time: number) {
    const n = Math.floor(heat * 7);
    const g = this.g;
    const L = this.L;
    for (let i = 0; i < n; i++) {
      const cyc = time * (0.4 + hash(i) * 0.3) + hash(i * 3.3) * 5;
      const ph = cyc - Math.floor(cyc);
      if (ph > 0.25) continue;
      const id = Math.floor(cyc);
      const x0 = hash(i * 7 + id * 13) * L.W * 1.2;
      const y0 = hash(i * 11 + id * 17) * L.HZ * 0.5;
      const k = ph / 0.25;
      for (let j = 0; j < 7; j++) {
        g.fillStyle = `rgba(255,${200 - j * 15},${140 - j * 15},${((1 - k) * (1 - j / 7)).toFixed(2)})`;
        g.fillRect(Math.round(x0 - k * 40 + j * 2), Math.round(y0 + k * 22 - j), 1, 1);
      }
    }
  }

  /** The fireball rising behind the mesas, its column of smoke, and the glow on the horizon. */
  private fireball(blast: number, IX: number) {
    const g = this.g;
    const L = this.L;
    const grow = 1 - Math.pow(1 - clamp01(blast / 1.1), 3);
    const R = L.H * 0.4 * grow;
    const cool = clamp01((blast - 0.4) / 2.4);
    // the light thrown across the sky
    const gl = g.createRadialGradient(IX, L.HZ, 0, IX, L.HZ, L.W * 0.8);
    gl.addColorStop(0, `rgba(255,170,80,${(0.5 * (1 - cool * 0.6)).toFixed(2)})`);
    gl.addColorStop(1, 'rgba(255,120,40,0)');
    g.fillStyle = gl;
    g.fillRect(0, 0, L.W, L.BACK);
    // the mushroom: a churning stem and a cap of lit, rolling puffs, cooling from fire to smoke as it climbs
    if (blast > 0.25) {
      const k = clamp01((blast - 0.25) / 2.2);
      const capY = L.HZ - R * (0.9 + k * 0.9);
      const puff = (x: number, y: number, r: number, heatK: number) => {
        const c1 = heatK > 0.5 ? [255, 160 + 60 * (heatK - 0.5), 70] : [120 + 270 * heatK, 60 + 160 * heatK, 40 + 40 * heatK];
        const dark = [Math.round(c1[0] * 0.55), Math.round(c1[1] * 0.5), Math.round(c1[2] * 0.5)];
        g.fillStyle = `rgb(${dark.join(',')})`;
        g.beginPath();
        g.arc(Math.round(x), Math.round(y), r, 0, Math.PI * 2);
        g.fill();
        // lit from the fire below and the sky above-left
        g.fillStyle = `rgb(${c1.map(Math.round).join(',')})`;
        g.beginPath();
        g.arc(Math.round(x - r * 0.25), Math.round(y - r * 0.25), r * 0.72, 0, Math.PI * 2);
        g.fill();
      };
      for (let y = L.HZ; y > capY + R * 0.2; y -= 3) {
        const t = (L.HZ - y) / (L.HZ - capY);
        const w = R * (0.22 - 0.08 * t) + Math.sin(y * 0.5 + blast * 8) * 1.2;
        puff(IX + Math.sin(y * 0.3 + blast * 4) * 1.5, y, Math.max(2, w), (1 - k) * (1 - t * 0.6));
      }
      const n = 14;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + blast * 0.6;
        const rr = R * (0.55 + 0.06 * Math.sin(i * 2.7 + blast * 3));
        const cx = IX + Math.cos(a) * rr * 0.9;
        const cy = capY + Math.sin(a) * rr * 0.32;
        puff(cx, cy, R * (0.26 + 0.05 * Math.sin(i * 1.9)), (1 - k) * (0.6 + 0.4 * Math.max(0, Math.sin(a))));
      }
      puff(IX, capY - R * 0.12, R * 0.34, (1 - k) * 0.7);
    }
    // the dome of fire on the horizon, its edge boiling
    const fade = clamp01(1 - (blast - 1.4) / 1.8);
    if (fade > 0) {
      const rings: [number, string][] = [[1, '190,40,20'], [0.84, '255,96,30'], [0.64, '255,170,60'], [0.42, '255,226,150'], [0.22, '255,252,236']];
      for (const [k, col] of rings) {
        g.fillStyle = `rgba(${col},${(0.95 * fade).toFixed(2)})`;
        g.beginPath();
        for (let i = 0; i <= 24; i++) {
          const a = Math.PI + (i / 24) * Math.PI;
          const rr = R * k * (1 + 0.05 * Math.sin(a * 9 + blast * 14 + k * 5));
          const x = IX + Math.cos(a) * rr;
          const y = L.HZ + 2 + Math.sin(a) * rr;
          if (i) g.lineTo(x, y);
          else g.moveTo(x, y);
        }
        g.closePath();
        g.fill();
      }
    }
  }

  /** Fragments of the comet raining in ahead of it (and after it), each striking the plain with a spark. */
  private meteorShower(heat: number, blast: number, time: number) {
    const g = this.g;
    const L = this.L;
    const n = blast >= 0 ? (blast < 2.5 ? 7 : 3) : Math.floor((heat - 0.45) * 12);
    for (let i = 0; i < n; i++) {
      const cyc = time * (0.55 + hash(i * 1.7) * 0.4) + hash(i * 5.3) * 7;
      const ph = cyc - Math.floor(cyc);
      const id = Math.floor(cyc);
      const tx = hash(i * 7.1 + id * 3.3) * L.W;
      const ty = L.HZ + 2 + hash(i * 2.9 + id * 1.1) * (L.BACK - L.HZ - 4);
      if (ph < 0.55) {
        const k = ph / 0.55;
        const x = tx + (1 - k) * 60;
        const y = ty - (1 - k) * 90;
        for (let j = 0; j < 8; j++) {
          g.fillStyle = `rgba(255,${210 - j * 18},${120 - j * 12},${(1 - j / 8).toFixed(2)})`;
          g.fillRect(Math.round(x + j * 0.66), Math.round(y - j), 1, 1);
        }
        g.fillStyle = '#fff6dc';
        g.fillRect(Math.round(x), Math.round(y), 1, 1);
      } else if (ph < 0.75) {
        const k = (ph - 0.55) / 0.2;
        const r = 1 + k * 3;
        g.fillStyle = `rgba(255,${Math.round(220 - k * 120)},90,${(1 - k).toFixed(2)})`;
        g.fillRect(Math.round(tx - r), Math.round(ty - r * 0.6), Math.round(r * 2), Math.max(1, Math.round(r)));
      }
    }
  }

  /* ── The course ────────────────────────────────────────────────────── */

  private obstacles(cam: number) {
    const L = this.L;
    const out: { sx: number; w: number; h: number; back: boolean; spr: HTMLCanvasElement }[] = [];
    for (let k = Math.floor(cam / OB_EVERY) - 1; k <= Math.floor((cam + L.W) / OB_EVERY) + 1; k++) {
      const wx = k * OB_EVERY + hash(k * 2.2) * 30;
      if (wx < L.PX + 150) continue; // a clear run off the line
      if (hash(k * 3.7) < 0.42) continue;
      const spr = clutterSprite(OBSTACLES[Math.floor(hash(k * 5.1) * OBSTACLES.length)]);
      out.push({ sx: Math.round(wx - cam), w: spr.width, h: spr.height, back: hash(k * 8.3) < 0.5, spr });
    }
    return out;
  }

  private drawDecor(cam: number, back: boolean) {
    const L = this.L;
    for (let k = Math.floor(cam / DECOR_EVERY) - 1; k <= Math.floor((cam + L.W) / DECOR_EVERY) + 1; k++) {
      if (hash(k * 1.9) > 0.35 || hash(k * 6.7) < 0.5 !== back) continue;
      const sx = Math.round(k * DECOR_EVERY + hash(k * 4.1) * 12 - cam);
      const spr = clutterSprite(DECOR[Math.floor(hash(k * 3.1) * DECOR.length)]);
      const base = back ? L.laneBack - 1 : L.laneFront + 1;
      this.g.drawImage(spr, sx, base - spr.height + 1);
    }
  }

  /** Bone-and-post markers with the multiplier on a plaque, staked at the distance you'll have run when it hits. */
  private drawSigns(view: SceneView, cam: number, run: Run) {
    const L = this.L;
    const g = this.g;
    for (const m of SIGNS) {
      const wx = L.PX + distAt(secondsTo(view.growthRate, m)) * PPM;
      const sx = Math.round(wx - cam);
      if (sx < -20 || sx > L.W + 20) continue;
      const passed = run.m >= m;
      const text = `x${m}`;
      const tw = textWidth(text);
      const base = L.BACK + 1;
      g.fillStyle = '#3a2214';
      g.fillRect(sx, base - 14, 2, 14);
      g.fillStyle = passed ? '#8a7a5a' : '#efe2c0';
      g.fillRect(sx - Math.floor(tw / 2) - 2, base - 22, tw + 5, 9);
      g.fillStyle = '#3a2214';
      g.fillRect(sx - Math.floor(tw / 2) - 2, base - 14, tw + 5, 1);
      pixelText(g, text, sx - Math.floor(tw / 2) + 1, base - 20, passed ? '#3a2a1a' : '#7a1a10');
    }
  }

  /* ── The herd ──────────────────────────────────────────────────────── */

  private syncActors(view: SceneView, now: number, cam: number) {
    const seen = new Set<string>();
    view.runners.forEach((r, i) => {
      const id = `me:${r.id}`;
      seen.add(id);
      let a = this.actors.get(id);
      if (!a) {
        a = { id, hide: r.hide, dx: i === 0 ? 0 : -34, back: false, mine: true, burrowAt: null, burrowX: null, fling: null, phase: i * 2.1, dustT: 0 };
        this.actors.set(id, a);
      }
      if (r.burrowAt != null && a.burrowAt == null) this.burrow(a, r.burrowAt, now, cam);
    });
    let idx = 0;
    for (const gv of view.ghosts) {
      if (idx >= SLOTS.length) break;
      seen.add(gv.id);
      let a = this.actors.get(gv.id);
      if (!a) {
        const [dx, back] = SLOTS[idx];
        a = { id: gv.id, hide: GHOST_HIDES[idx % GHOST_HIDES.length], dx, back, mine: false, burrowAt: null, burrowX: null, fling: null, phase: rnd(0, 6), dustT: 0 };
        this.actors.set(gv.id, a);
      }
      if (gv.burrowed && a.burrowAt == null) this.burrow(a, now, now, cam);
      idx++;
    }
    for (const id of this.actors.keys()) if (!seen.has(id)) this.actors.delete(id);
  }

  private screenX(a: Actor) {
    const L = this.L;
    const s = Math.min(1, L.W / 360);
    return Math.round(L.PX + a.dx * s + (a.mine ? 0 : Math.sin(this.time * 0.6 + a.phase) * 3));
  }

  private burrow(a: Actor, at: number, now: number, cam: number) {
    a.burrowAt = at;
    // where it dug in: where it was standing when we learnt it stopped
    a.burrowX = this.screenX(a) + cam;
    void now;
    const L = this.L;
    const base = a.back ? L.laneBack : L.laneFront;
    for (let i = 0; i < 10; i++) this.puff(this.screenX(a) - 4, base, rnd(-30, 10), rnd(-30, -5), '#c8a070', true);
  }

  private drawActors(view: SceneView, back: boolean, now: number, dt: number, cam: number, obstacles: ReturnType<Scene['obstacles']>, front: number, heat: number) {
    const L = this.L;
    const { run } = view;
    const running = view.phase === 'FLYING' || view.phase === 'CRASHED';
    const base = back ? L.laneBack : L.laneFront;
    const speedK = clamp01(run.speed / 60);
    for (const a of this.actors.values()) {
      if (a.back !== back) continue;
      const age = a.burrowAt != null ? (now - a.burrowAt) / 1000 : -1;
      if (age >= 0.95) continue; // in its burrow (drawn with the rock)
      let x = this.screenX(a);
      let y = 0;
      let rot = 0;
      let pose: Pose = { kind: 'stand' };
      if (age >= 0) {
        // skid, then dig
        x = Math.round(a.burrowX! - cam);
        if (age < 0.2) pose = { kind: 'stand' };
        else {
          pose = { kind: 'dig', frame: Math.floor(age * 14) };
          rot = 0.35;
          y = 2;
          if (Math.random() < 0.7) this.puff(x - 8, base - 2, rnd(-50, -15), rnd(-60, -20), Math.random() < 0.5 ? '#9a6a3e' : '#c8a070', true, 1, 0.6);
        }
      } else if (a.fling) {
        const f = a.fling;
        f.vy += 300 * dt;
        f.x += f.vx * dt;
        f.y += f.vy * dt;
        f.rot += f.vr * dt;
        if (f.y > L.H + 30) continue;
        this.drawRaptor(a.hide, { kind: 'jump' }, f.x, f.y, f.rot);
        if (Math.random() < 0.8) this.puff(f.x, f.y - 8, rnd(-10, 10), rnd(-20, 0), Math.random() < 0.5 ? '#ff9a3a' : '#ffd060', false, 1, 0.4);
        if (Math.random() < 0.4) this.puff(f.x, f.y - 8, rnd(-10, 10), rnd(-30, -10), '#3a2a24', false, 2, 0.9);
        continue;
      } else if (running) {
        if (x >= front) {
          // the shockwave has reached it
          a.fling = { x, y: base, vx: -rnd(80, 140), vy: -rnd(110, 170), rot: 0, vr: -rnd(7, 12) };
          for (let i = 0; i < 14; i++) this.puff(x, base - 8, rnd(-120, 0), rnd(-120, 0), i % 2 ? '#ff8a2a' : '#5a3a28', false, 2, 0.8);
          continue;
        }
        const stride = run.phase === 'blast' ? 0 : speedK;
        pose = stride > 0.05 ? { kind: 'run', frame: Math.floor(this.time * (6 + stride * 10) + a.phase * 3) % RUN_FRAMES } : { kind: 'stand' };
        // hop whatever's in the way on this lane
        for (const o of obstacles) {
          if (o.back !== back) continue;
          const rel = o.sx - (x + 6);
          const span = 26 + o.w;
          const j = (22 - rel) / span;
          if (j >= 0 && j <= 1) {
            y = -Math.round(Math.sin(j * Math.PI) * (o.h + 6));
            pose = { kind: 'jump' };
          }
        }
        // duck under a low pterosaur
        if (!back && y === 0) {
          for (const p of this.pteros) {
            if (p.y > base - 34 && p.x > x - 22 && p.x < x + 26) {
              rot = -0.22;
              y = 2;
            }
          }
        }
        // kicked-up dust
        a.dustT -= dt;
        if (a.dustT <= 0 && y === 0 && stride > 0.2) {
          a.dustT = a.mine ? 0.09 : 0.2;
          this.puff(x - 10, base, rnd(-25, -8), rnd(-14, -4), heat > 0.5 ? '#c07850' : '#d8b080', true, 1, 0.5);
        }
      } else {
        // waiting at the line: shifting weight, crouching for the off
        const crouch = view.countdownS != null && view.countdownS < 1.8;
        y = crouch ? 1 : Math.round(Math.sin(this.time * 2 + a.phase) * 0.5);
        rot = crouch ? 0.08 : 0;
      }
      this.shadow(x, base, y);
      this.drawRaptor(a.hide, pose, x, base + y, rot);
      if (a.mine && age < 0) this.marker(x + 2, base + y - 26, a.hide, this.time);
    }
  }

/** A soft pixel shadow on the sand under a raptor, shrinking as it jumps. */
  private shadow(x: number, base: number, lift: number) {
    const g = this.g;
    const w = Math.max(6, 18 + Math.round(lift / 2));
    g.fillStyle = 'rgba(40,14,6,0.35)';
    g.fillRect(Math.round(x - w / 2), base + 1, w, 1);
    g.fillRect(Math.round(x - w / 2 + 2), base, w - 4, 1);
  }

  private drawObstacle(spr: HTMLCanvasElement, sx: number, base: number) {
    const g = this.g;
    g.fillStyle = 'rgba(40,14,6,0.3)';
    g.fillRect(sx - 1, base + 1, spr.width + 2, 1);
    g.drawImage(spr, sx, base - spr.height + 1);
  }

  /** Draws a raptor with its feet at (x, y). */
  private drawRaptor(hide: HideKey, pose: Pose, x: number, y: number, rot: number) {
    const g = this.g;
    const spr = raptorSprite(hide, pose);
    if (!rot) {
      g.drawImage(spr, Math.round(x - 15), Math.round(y - 19));
      return;
    }
    g.save();
    g.translate(Math.round(x), Math.round(y - 9));
    g.rotate(rot);
    g.drawImage(spr, -15, -10);
    g.restore();
  }

  /** A bobbing arrow over your own raptors, in their colour. */
  private marker(x: number, y: number, hide: HideKey, time: number) {
    const g = this.g;
    const by = Math.round(y + Math.sin(time * 5) * 1.2);
    g.fillStyle = '#1a0a06';
    g.fillRect(x - 3, by - 1, 7, 2);
    g.fillRect(x - 2, by + 1, 5, 1);
    g.fillRect(x - 1, by + 2, 3, 1);
    g.fillStyle = hide === 'red' ? '#ff6a4a' : '#6ab0ff';
    g.fillRect(x - 2, by - 1, 5, 1);
    g.fillRect(x - 1, by, 3, 1);
    g.fillRect(x, by + 1, 1, 1);
  }

  /* ── Pterosaurs ────────────────────────────────────────────────────── */

  private stepPteros(view: SceneView, dt: number, scroll: number, time: number) {
    const L = this.L;
    if (view.run.phase === 'run') {
      this.nextPtero -= dt;
      if (this.nextPtero <= 0) {
        this.nextPtero = rnd(3.5, 8);
        const low = Math.random() < 0.55;
        this.pteros.push({ x: L.W + 12, y: low ? L.laneFront - 30 : L.HZ - rnd(10, 30), speed: rnd(26, 46), seed: Math.random() * 10 });
      }
    }
    const g = this.g;
    this.pteros = this.pteros.filter((p) => p.x > -30);
    for (const p of this.pteros) {
      p.x -= scroll + p.speed * dt;
      const yy = p.y + Math.sin(time * 2 + p.seed) * 2;
      g.drawImage(pteroSprite(Math.floor(time * 5 + p.seed) % 2), Math.round(p.x - 11), Math.round(yy - 4));
    }
  }

  /* ── The aftermath ─────────────────────────────────────────────────── */

  /** The shockwave front rolling across the plain, then ash and embers drifting down. */
  private aftermath(blast: number, front: number, dt: number, reduced: boolean) {
    const L = this.L;
    const g = this.g;
    if (front > -60 && front < L.W + 60) {
      // a rolling wall of dust and fire: billows leaning back from a bright leading edge
      const H0 = (L.GY - L.HZ) * 1.5;
      for (let i = 0; i < 9; i++) {
        const t = i / 8;
        const bx = front + 4 + t * 34 + Math.sin(i * 2.3 + blast * 9) * 2;
        const by = L.GY - t * H0 * 0.55 - Math.sin(i * 1.3 + blast * 6) * 3;
        const r = 7 + t * 9 + Math.sin(i + blast * 11) * 1.5;
        const fire = 1 - t;
        g.fillStyle = `rgb(${Math.round(70 + 60 * fire)},${Math.round(40 + 30 * fire)},${Math.round(26 + 10 * fire)})`;
        g.beginPath();
        g.arc(Math.round(bx), Math.round(by), r, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = `rgb(${Math.round(150 + 100 * fire)},${Math.round(96 + 80 * fire * fire)},${Math.round(56 + 40 * fire * fire)})`;
        g.beginPath();
        g.arc(Math.round(bx - r * 0.3), Math.round(by - r * 0.3), r * 0.62, 0, Math.PI * 2);
        g.fill();
      }
      // the leading edge: a hot line of fire along the ground
      g.fillStyle = 'rgba(255,240,200,0.95)';
      g.fillRect(Math.round(front), L.BACK - 3, 2, L.GY - L.BACK + 4);
      g.fillStyle = 'rgba(255,150,60,0.8)';
      g.fillRect(Math.round(front) + 2, L.BACK - 6, 3, L.GY - L.BACK + 7);
      if (!reduced) {
        for (let i = 0; i < 7; i++) this.puff(front + rnd(0, 14), L.BACK + rnd(-24, 8), rnd(-110, -40), rnd(-60, 0), Math.random() < 0.5 ? '#c8905a' : '#6a4a32', false, 2, 0.8);
        // stones skipping ahead of it
        if (Math.random() < 0.5) this.puff(front - 2, L.laneFront - rnd(0, 8), rnd(-160, -90), rnd(-90, -40), '#4a3428', false, 1, 0.7);
      }
    }
    const n = reduced ? 1 : 4;
    for (let i = 0; i < n; i++) {
      if (Math.random() < dt * 30) this.particles.push({ x: rnd(0, L.W), y: -2, vx: rnd(-12, -4), vy: rnd(8, 18), g: 0, age: 0, life: rnd(4, 7), color: Math.random() < 0.8 ? '#8a8078' : '#5a5048', size: 1, ground: false });
      if (Math.random() < dt * 14) this.particles.push({ x: rnd(0, L.W), y: L.GY - rnd(0, 6), vx: rnd(-10, 6), vy: rnd(-26, -10), g: -2, age: 0, life: rnd(1.5, 3), color: Math.random() < 0.6 ? '#ff8a2a' : '#ffd060', size: 1, ground: false });
    }
  }

  /* ── Particles ─────────────────────────────────────────────────────── */

  private puff(x: number, y: number, vx: number, vy: number, color: string, ground: boolean, size = 1, life = 0.6) {
    if (this.particles.length > 700) this.particles.shift();
    this.particles.push({ x, y, vx, vy, g: 60, age: 0, life: life * rnd(0.7, 1.3), color, size, ground });
  }

  private stepParticles(dt: number, scroll: number) {
    const g = this.g;
    const keep: Particle[] = [];
    for (const p of this.particles) {
      p.age += dt;
      if (p.age >= p.life) continue;
      p.vy += p.g * dt;
      p.x += p.vx * dt - (p.ground ? scroll : 0);
      p.y += p.vy * dt;
      g.globalAlpha = Math.min(1, (1 - p.age / p.life) * 1.4);
      g.fillStyle = p.color;
      g.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
      keep.push(p);
    }
    g.globalAlpha = 1;
    this.particles = keep;
  }
}
