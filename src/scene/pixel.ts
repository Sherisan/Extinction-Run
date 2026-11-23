/*
 * Pixel art for Extinction Run. Everything is drawn at a low resolution (scene.ts scales it up with hard edges), so
 * sprites are tiny hand-made bitmaps: text grids where each character picks a colour from a palette. The raptors are
 * a body grid plus legs drawn per frame, so the run cycle, the jump, the dig and the tumble all come from one design.
 */

export type Ctx = CanvasRenderingContext2D;

/** A raptor's colours. */
export interface Hide {
  /** outline */
  k: string;
  /** body */
  b: string;
  /** stripes and the far leg */
  d: string;
  /** belly */
  l: string;
  /** neck feathers */
  f: string;
}

export type HideKey = 'red' | 'blue' | 'green' | 'purple' | 'teal' | 'sand' | 'slate' | 'pink' | 'olive' | 'gold';

export const HIDES: Record<HideKey, Hide> = {
  red: { k: '#2a0b08', b: '#e8492f', d: '#9c2414', l: '#f8c98a', f: '#ffd23a' },
  blue: { k: '#081633', b: '#3a86f0', d: '#1d4aa0', l: '#c4e6ff', f: '#ffffff' },
  green: { k: '#0c200d', b: '#5fae3e', d: '#2f6b23', l: '#d6efa0', f: '#f0e05a' },
  purple: { k: '#1a0b26', b: '#9a5ad6', d: '#5a2d8a', l: '#e6c8ff', f: '#ff8ad0' },
  teal: { k: '#06201f', b: '#2fb8a8', d: '#17706a', l: '#bff3e8', f: '#ffe07a' },
  sand: { k: '#2a1d0c', b: '#d6a85a', d: '#8f6a2c', l: '#f6e2b0', f: '#a8402a' },
  slate: { k: '#111418', b: '#7c8794', d: '#4a535e', l: '#d8dee6', f: '#ffb02a' },
  pink: { k: '#2a0c1a', b: '#ef6fa0', d: '#a83864', l: '#ffd6e6', f: '#7ad8ff' },
  olive: { k: '#1a1b08', b: '#9aa23a', d: '#5f661c', l: '#ecf0b0', f: '#e85a2a' },
  gold: { k: '#2a1a04', b: '#f2b632', d: '#a8701a', l: '#fff0c0', f: '#e8492f' },
};
export const GHOST_HIDES: HideKey[] = ['green', 'purple', 'teal', 'sand', 'slate', 'pink', 'olive', 'gold'];

/** Draws a text grid at (x, y), one pixel per character; '.' and ' ' are transparent. */
export function blit(ctx: Ctx, rows: string[], pal: Record<string, string>, x = 0, y = 0) {
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    for (let c = 0; c < row.length; c++) {
      const col = pal[row[c]];
      if (!col) continue;
      ctx.fillStyle = col;
      ctx.fillRect(x + c, y + r, 1, 1);
    }
  }
}

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  return { c, ctx };
}

/* ── Raptor ──────────────────────────────────────────────────────────── */

/** The raptor's body, facing right: head with an eye and teeth, feathered neck, striped back, belly, claw, stiff tail. */
const RAPTOR = [
  '......................kkkk....',
  '....................kkhhhhkk..',
  '...................khhbbbbbbk.',
  '..................khbbbbwpbbbk',
  '..................kbbbbbbbbbbk',
  '..............kk.kbbbbbkccckk.',
  'kkk.........kkffkbbbbbbkkk....',
  'khhkkk.....kffhhhhbbbbk.......',
  '.kbbhhkkkkkhhbbdbbdbbk........',
  '..kkbbbbbbbbbdbbdbbbblk.......',
  '....kkkbbbbbbbbbbbbllkk.......',
  '.......kkkbbbbbbbblllkck......',
  '..........kkbbbbbblllk........',
  '............kkbbbbkkk.........',
];
export const RAPTOR_W = 30;
export const RAPTOR_H = 20;
/** Where the hip is, on the body grid. */
const HIP = { x: 14, y: 13 };

/** The raptor curled up asleep in its burrow, safe. */
const CURLED = [
  '....kkkkkkkk......',
  '..kkbbbbbbbbkk....',
  '.kbbdbbdbbbbbbk...',
  'kbbbbbbbbbbkkbbk..',
  'kbbllllllbkbbkkbk.',
  'kbbllllllbkbbbbbbk',
  '.kbbbbbbbbbkcckkk.',
  '..kkbbbbbbbbbk....',
  '....kkkkkkkkk.....',
];
export const CURLED_W = 18;
export const CURLED_H = 9;

/** A colour mixed towards white by k (0..1). */
function lighten(c: string, k: number) {
  const n = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  return '#' + n.map((v) => Math.round(v + (255 - v) * k).toString(16).padStart(2, '0')).join('');
}

/** Integer line, `w` px thick (square brush). */
function line(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, w: number) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  const o = Math.floor(w / 2);
  for (let i = 0; i <= n; i++) {
    const x = Math.round(x0 + ((x1 - x0) * i) / n);
    const y = Math.round(y0 + ((y1 - y0) * i) / n);
    ctx.fillRect(x - o, y - o, w, w);
  }
}

/** One leg: thigh, a knee bending forwards, shin, and a foot with its sickle claw. */
function leg(ctx: Ctx, hide: Hide, far: boolean, foot: { x: number; y: number }, knee: { x: number; y: number }) {
  const body = far ? hide.d : hide.b;
  ctx.fillStyle = hide.k;
  line(ctx, HIP.x, HIP.y, knee.x, knee.y, 3);
  line(ctx, knee.x, knee.y, foot.x, foot.y, 3);
  ctx.fillRect(foot.x - 1, foot.y - 1, 5, 2);
  ctx.fillStyle = body;
  line(ctx, HIP.x, HIP.y, knee.x, knee.y, 1);
  line(ctx, knee.x, knee.y, foot.x, foot.y - 1, 1);
  // toes and the claw raised on the inner toe
  ctx.fillStyle = hide.k;
  ctx.fillRect(foot.x + 3, foot.y, 1, 1);
  ctx.fillStyle = '#e9e2cc';
  ctx.fillRect(foot.x + 1, foot.y - 2, 1, 1);
}

export type Pose = { kind: 'run'; frame: number } | { kind: 'jump' } | { kind: 'dig'; frame: number } | { kind: 'stand' };

export const RUN_FRAMES = 6;

/** Builds a raptor frame. Feet sit on the bottom row of the 30×20 canvas. */
function drawRaptor(ctx: Ctx, hide: Hide, pose: Pose) {
  const pal: Record<string, string> = { k: hide.k, b: hide.b, h: lighten(hide.b, 0.32), d: hide.d, l: hide.l, f: hide.f, w: '#ffffff', p: '#111111', c: '#f2ecd8' };
  const legsFor = (phase: number) => {
    const s = Math.sin(phase);
    const c = Math.cos(phase);
    const foot = { x: Math.round(HIP.x + 1 + s * 6), y: Math.round(19 - Math.max(0, c) * 3) };
    const knee = { x: Math.round((HIP.x + foot.x) / 2 + 3), y: Math.round(16 - Math.max(0, c) * 1.5) };
    return { foot, knee };
  };
  let a: { foot: { x: number; y: number }; knee: { x: number; y: number } };
  let b: typeof a;
  if (pose.kind === 'run') {
    const ph = (pose.frame / RUN_FRAMES) * Math.PI * 2;
    a = legsFor(ph);
    b = legsFor(ph + Math.PI);
  } else if (pose.kind === 'jump') {
    a = { foot: { x: 18, y: 17 }, knee: { x: 19, y: 15 } };
    b = { foot: { x: 11, y: 18 }, knee: { x: 15, y: 16 } };
  } else if (pose.kind === 'dig') {
    // kicking dirt out behind
    const k = pose.frame % 2;
    a = { foot: { x: 16, y: 19 }, knee: { x: 19, y: 16 } };
    b = { foot: { x: k ? 6 : 9, y: k ? 16 : 18 }, knee: { x: 11, y: 15 } };
  } else {
    a = { foot: { x: 17, y: 19 }, knee: { x: 19, y: 16 } };
    b = { foot: { x: 12, y: 19 }, knee: { x: 15, y: 16 } };
  }
  leg(ctx, hide, true, b.foot, b.knee);
  blit(ctx, RAPTOR, pal);
  leg(ctx, hide, false, a.foot, a.knee);
}

const raptorCache = new Map<string, HTMLCanvasElement>();
/** A cached raptor frame (30×20, feet on the bottom row, facing right). */
export function raptorSprite(hideKey: HideKey, pose: Pose): HTMLCanvasElement {
  const id = `${hideKey}:${pose.kind}:${'frame' in pose ? pose.frame : 0}`;
  let c = raptorCache.get(id);
  if (!c) {
    const s = canvas(RAPTOR_W, RAPTOR_H);
    drawRaptor(s.ctx, HIDES[hideKey], pose);
    c = s.c;
    raptorCache.set(id, c);
  }
  return c;
}

const curledCache = new Map<string, HTMLCanvasElement>();
export function curledSprite(hideKey: HideKey): HTMLCanvasElement {
  let c = curledCache.get(hideKey);
  if (!c) {
    const h = HIDES[hideKey];
    const s = canvas(CURLED_W, CURLED_H);
    blit(s.ctx, CURLED, { k: h.k, b: h.b, d: h.d, l: h.l, c: '#f2ecd8' });
    c = s.c;
    curledCache.set(hideKey, c);
  }
  return c;
}

/* ── Pterosaur ───────────────────────────────────────────────────────── */

const PTERO_UP = [
  'k.....................',
  'kk....................',
  '.kkk..................',
  '..kkkk.......kk.......',
  '...kkkkk...kkddk......',
  '....kkkkkkkdddddkkkkk.',
  '.....kkkdddddddkk..kkk',
  '........kkkkkk........',
];
const PTERO_DOWN = [
  '......................',
  '.............kk.......',
  '...........kkddk......',
  '....kkkkkkkdddddkkkkk.',
  '..kkkkkkdddddddkk..kkk',
  '.kkkkkkkkkkkk.........',
  'kkkk..................',
  'k.....................',
];
export const PTERO_W = 22;
export const PTERO_H = 8;
const pteroCache: HTMLCanvasElement[] = [];
/** A pterosaur gliding left, wings up (0) or down (1); dark against the sky. */
export function pteroSprite(frame: number): HTMLCanvasElement {
  if (!pteroCache.length) {
    for (const rows of [PTERO_UP, PTERO_DOWN]) {
      const s = canvas(PTERO_W, PTERO_H);
      // drawn facing right, then flipped to fly left
      s.ctx.translate(PTERO_W, 0);
      s.ctx.scale(-1, 1);
      blit(s.ctx, rows, { k: '#2a1414', d: '#6a2e24' });
      pteroCache.push(s.c);
    }
  }
  return pteroCache[frame % 2];
}

/* ── Ground clutter ──────────────────────────────────────────────────── */

const ROCK = [
  '...kkkkk....',
  '..kssssskk..',
  '.ksshssssk..',
  'kssssssssskk',
  'ksssssdsssdk',
  'kssdssssssdk',
  'kkkkkkkkkkkk',
];
const LOG = [
  '.kkkkkkkkkkkkkk.',
  'kwwwwkwwwwwwwwrk',
  'kwkwwwwwkwwwwrhk',
  'kwwwwwwwwwkwwrrk',
  '.kkkkkkkkkkkkkk.',
];
const SKULL = [
  '..kkkkkk..',
  '.kbbbbbbk.',
  'kbkkbbbbbk',
  'kbkkbbkkbk',
  'kbbbbbbbbk',
  '.kbkbkbkk.',
  '..k.k.k...',
];
const CYCAD = [
  'g....g....g',
  '.g...g...g.',
  '..g..g..g..',
  'g..g.g.g..g',
  '.gg.ggg.gg.',
  '...gggggg..',
  '....ktk....',
  '....ktk....',
  '...kttk....',
  '...kttk....',
  '...ktttk...',
  '..kttttk...',
];
const FERN = [
  '.g...g..',
  'g.g.g.g.',
  '.ggggg.g',
  'g.ggg.g.',
  '..ggg...',
  '...g....',
];

export type Clutter = 'rock' | 'log' | 'skull' | 'cycad' | 'fern';
const CLUTTER: Record<Clutter, { rows: string[]; pal: Record<string, string> }> = {
  rock: { rows: ROCK, pal: { k: '#2a1a14', s: '#8a6a52', h: '#c49a76', d: '#5e4434' } },
  log: { rows: LOG, pal: { k: '#2a160c', w: '#7a4a28', r: '#c88a52', h: '#e6b47a' } },
  skull: { rows: SKULL, pal: { k: '#3a2c20', b: '#efe6cc' } },
  cycad: { rows: CYCAD, pal: { g: '#3f7a2c', k: '#2a1a0c', t: '#7a5228' } },
  fern: { rows: FERN, pal: { g: '#4f8a34' } },
};
const clutterCache = new Map<Clutter, HTMLCanvasElement>();
export function clutterSprite(kind: Clutter): HTMLCanvasElement {
  let c = clutterCache.get(kind);
  if (!c) {
    const d = CLUTTER[kind];
    const s = canvas(d.rows[0].length, d.rows.length);
    blit(s.ctx, d.rows, d.pal);
    c = s.c;
    clutterCache.set(kind, c);
  }
  return c;
}

/* ── Fossils in the rock ─────────────────────────────────────────────── */

const AMMONITE = [
  '..kkkk..',
  '.kbbbbk.',
  'kbkkkbbk',
  'kbkbkkbk',
  'kbkbbkbk',
  'kbbkkbbk',
  '.kbbbbk.',
  '..kkkk..',
];
const BONE = [
  'kk......kk',
  'kbk....kbk',
  '.kbkkkkbk.',
  '.kbbbbbbk.',
  'kbkkkkkkbk',
  'kk......kk',
];
const TRILOBITE = [
  '..kkk..',
  '.kbbbk.',
  'kbkbkbk',
  'kbkbkbk',
  'kbkbkbk',
  '.kbkbk.',
  '..kkk..',
];
const SKELETON = [
  '................kkkk....',
  '...............kbkbbk...',
  '..............kbbbkbbk..',
  '.......k.k.k.kbk..kkk...',
  'kk..k.kbkbkbkbk.........',
  '.kbkbkbbbbbbbbk.........',
  '..kkkkbkbkbkbk..........',
  '......kbk..kbk..........',
  '.....kbk....kbk.........',
  '....kkk......kkk........',
];
export type Fossil = 'ammonite' | 'bone' | 'trilobite' | 'skeleton';
const fossilCache = new Map<Fossil, HTMLCanvasElement>();
export function fossilSprite(kind: Fossil): HTMLCanvasElement {
  let c = fossilCache.get(kind);
  if (!c) {
    const rows = kind === 'ammonite' ? AMMONITE : kind === 'bone' ? BONE : kind === 'skeleton' ? SKELETON : TRILOBITE;
    const s = canvas(rows[0].length, rows.length);
    blit(s.ctx, rows, { k: 'rgba(30,18,10,0.55)', b: 'rgba(236,220,186,0.62)' });
    c = s.c;
    fossilCache.set(kind, c);
  }
  return c;
}

/* ── A 3×5 pixel font for the milestone markers ──────────────────────── */

const FONT: Record<string, string[]> = {
  '0': ['###', '#.#', '#.#', '#.#', '###'],
  '1': ['.#.', '##.', '.#.', '.#.', '###'],
  '2': ['###', '..#', '###', '#..', '###'],
  '3': ['###', '..#', '.##', '..#', '###'],
  '4': ['#.#', '#.#', '###', '..#', '..#'],
  '5': ['###', '#..', '###', '..#', '###'],
  '6': ['###', '#..', '###', '#.#', '###'],
  '7': ['###', '..#', '.#.', '.#.', '.#.'],
  '8': ['###', '#.#', '###', '#.#', '###'],
  '9': ['###', '#.#', '###', '..#', '###'],
  '.': ['...', '...', '...', '...', '.#.'],
  'x': ['...', '#.#', '.#.', '#.#', '...'],
};

/** Width in pixels of `text` in the 3×5 font. */
export function textWidth(text: string) {
  return text.length * 4 - 1;
}

export function pixelText(ctx: Ctx, text: string, x: number, y: number, color: string) {
  ctx.fillStyle = color;
  let cx = x;
  for (const ch of text) {
    const g = FONT[ch];
    if (g) {
      for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) if (g[r][c] === '#') ctx.fillRect(cx + c, y + r, 1, 1);
    }
    cx += ch === '.' ? 3 : 4;
  }
}
