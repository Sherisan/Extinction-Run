/* Art preview (see preview.html): renders the scene at fixed moments by stepping it with a fake clock. */
import '@fontsource/chakra-petch/600.css';
import '@fontsource/press-start-2p/400.css';
import { IMPACT_S, RunModel } from '../src/game/run';
import { Scene, type GhostView, type RunnerView, type SceneView } from '../src/scene/scene';

const RATE = 0.12;
const W = 960;
const H = 540;

interface Shot {
  id: string;
  label: string;
  /** Seconds of running before the crash (or the whole run if no crash). */
  runS: number;
  /** Seconds after the crash to stop at, or null for no crash. */
  crashAge: number | null;
  /** Betting only: seconds left on the countdown at the shot. */
  staging?: number;
  /** Second at which the player burrows. */
  burrowAt?: number;
  two?: boolean;
}

const SHOTS: Shot[] = [
  { id: 'staging', label: 'Betting · the herd gathers', runS: 0, crashAge: null, staging: 2.4 },
  { id: 'start', label: 'Run! · 1.2×', runS: 1.6, crashAge: null, two: true },
  { id: 'run', label: 'Running · 2.6×', runS: 8, crashAge: null },
  { id: 'burrow', label: 'Burrowing', runS: 7.6, crashAge: null, burrowAt: 7 },
  { id: 'burrowed', label: 'Safe underground', runS: 9.5, crashAge: null, burrowAt: 7 },
  { id: 'late', label: 'Threat V · 18×', runS: 24, crashAge: null },
  { id: 'impact', label: 'Impact', runS: 16, crashAge: 0.4, burrowAt: 12 },
  { id: 'blast', label: 'The shockwave', runS: 16, crashAge: IMPACT_S + 0.35, burrowAt: 12 },
  { id: 'flung', label: 'Flung', runS: 16, crashAge: IMPACT_S + 0.8 },
  { id: 'after', label: 'Extinct', runS: 16, crashAge: IMPACT_S + 3, burrowAt: 12 },
];

const ghostsAt = (t: number): GhostView[] => ['g1', 'g2', 'g3', 'g4', 'g5', 'g6'].map((id, i) => ({ id, burrowed: (i === 1 && t > 4) || (i === 4 && t > 10) }));

function render(shot: Shot, canvas: HTMLCanvasElement) {
  const scene = new Scene(canvas);
  // a ResizeObserver callback would reset the canvas after the shot is drawn
  scene.destroy();
  const model = new RunModel();
  const fps = 30;
  let now = 1000;
  const step = (phase: SceneView['phase'], t: number, crashAge: number | null, countdownS: number | null, runners: RunnerView[], ghosts: GhostView[]) => {
    const run = model.step(phase !== 'BETTING', t, RATE, crashAge);
    scene.frame(now, { phase, run, countdownS, runners, ghosts, growthRate: RATE, reducedMotion: false });
    now += 1000 / fps;
  };
  let burrowNow: number | null = null;
  const runnersAt = (): RunnerView[] => {
    const r: RunnerView[] = [{ id: 'raptor0', hide: 'red', burrowAt: burrowNow }];
    if (shot.two) r.push({ id: 'raptor1', hide: 'blue', burrowAt: null });
    return r;
  };
  const stageEnd = shot.staging ?? 0;
  for (let s = 7; s > stageEnd; s -= 1 / fps) step('BETTING', 0, null, s, runnersAt(), ghostsAt(0));
  if (shot.staging != null) return;
  // only the last few seconds need simulating (particles, pterosaurs)
  const from = Math.max(0, shot.runS - 5);
  for (let t = from; t <= shot.runS; t += 1 / fps) {
    if (shot.burrowAt != null && burrowNow == null && t >= shot.burrowAt) burrowNow = now;
    step('FLYING', t, null, null, runnersAt(), ghostsAt(t));
  }
  if (shot.crashAge == null) return;
  for (let a = 0; a <= shot.crashAge; a += 1 / fps) step('CRASHED', shot.runS, a, null, runnersAt(), ghostsAt(shot.runS));
}

const root = document.getElementById('root')!;
document.head.append(Object.assign(document.createElement('style'), {
  textContent: `
    body { margin: 0; background: #000; font: 600 14px 'Chakra Petch', sans-serif; color: #ccd; }
    .grid { display: grid; grid-template-columns: repeat(2, ${W}px); gap: 8px; padding: 8px; }
    figure { margin: 0; position: relative; }
    figcaption { position: absolute; left: 10px; top: 8px; padding: 3px 8px; background: rgba(0,0,0,0.6); border-radius: 6px; }
    canvas { display: block; width: ${W}px; height: ${H}px; }
  `,
}));
const grid = document.createElement('div');
grid.className = 'grid';
root.append(grid);
for (const shot of SHOTS) {
  const fig = document.createElement('figure');
  fig.id = shot.id;
  const canvas = document.createElement('canvas');
  const cap = document.createElement('figcaption');
  cap.textContent = shot.label;
  fig.append(canvas, cap);
  grid.append(fig);
}
document.fonts.ready.then(() => {
  try {
    for (const shot of SHOTS) render(shot, document.querySelector(`#${shot.id} canvas`) as HTMLCanvasElement);
    document.body.dataset.done = '1';
  } catch (e) {
    document.body.dataset.error = String((e as Error)?.stack ?? e);
  }
});
