/* The lobby thumbnail (see thumbnail.html): one frozen frame of the scene with the title over it. */
import { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/chakra-petch/600.css';
import '@fontsource/chakra-petch/700.css';
import '@fontsource/press-start-2p/400.css';
import '@fontsource/jetbrains-mono/700.css';
import '../src/styles/global.css';
import { ThreatScale } from '../src/components/Dash';
import { RunModel } from '../src/game/run';
import { frameBus } from '../src/game/frameBus';
import { multiplierAt } from '../src/game/clock';
import { Scene, type GhostView, type RunnerView } from '../src/scene/scene';

/** Seconds into the run the shot is taken: threat IV, the comet low and burning. */
const T = 21.5;
const RATE = 0.12;

function Shot() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const scene = new Scene(ref.current!);
    scene.destroy(); // its ResizeObserver would wipe the still after it is drawn
    const model = new RunModel();
    const ghosts: GhostView[] = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, burrowed: false }));
    const runners: RunnerView[] = [{ id: 'raptor0', hide: 'red', burrowAt: null }, { id: 'raptor1', hide: 'blue', burrowAt: null }];
    let now = 1000;
    for (let s = 7; s > 0; s -= 1 / 30) {
      scene.frame(now, { phase: 'BETTING', run: model.step(false, 0, RATE, null), countdownS: s, runners, ghosts, growthRate: RATE, reducedMotion: false });
      now += 1000 / 30;
    }
    let run = model.step(true, T - 5, RATE, null);
    for (let t = T - 5; t <= T; t += 1 / 30) {
      run = model.step(true, t, RATE, null);
      scene.frame(now, { phase: 'FLYING', run, countdownS: null, runners, ghosts, growthRate: RATE, reducedMotion: false });
      now += 1000 / 30;
    }
    const f = { phase: 'FLYING' as const, run, m: multiplierAt(RATE, T * 1000), countdownS: null, crashPoint: null };
    for (const ms of [50, 200, 400, 700]) window.setTimeout(() => frameBus.publish(f), ms);
  }, []);
  return <canvas ref={ref} className="thumb-scene" />;
}

function Thumbnail() {
  return (
    <div className="thumb">
      <Shot />
      <div className="thumb-hud">
        <ThreatScale />
        <div className="thumb-mult">{multiplierAt(RATE, T * 1000).toFixed(2)}×</div>
      </div>
      <div className="thumb-title">
        <div className="thumb-word">
          EXTINCTION <em>RUN</em>
        </div>
        <div className="thumb-tag">BURROW BEFORE THE COMET HITS</div>
        <div className="thumb-sub">UP TO ×1000 · 96% RTP · PROVABLY FAIR</div>
      </div>
    </div>
  );
}

const OUT = '4px 0 0 #2a0a06, -4px 0 0 #2a0a06, 0 4px 0 #2a0a06, 0 -4px 0 #2a0a06, 4px 4px 0 #2a0a06, -4px 4px 0 #2a0a06, 4px -4px 0 #2a0a06, -4px -4px 0 #2a0a06, 0 10px 0 rgba(0,0,0,0.5)';
const css = `
  html, body { margin: 0; width: 1280px; height: 720px; overflow: hidden; background: #140a10; }
  .thumb { position: relative; width: 1280px; height: 720px; overflow: hidden; }
  .thumb-scene { position: absolute; inset: 0; width: 1280px; height: 720px; display: block; }
  .thumb-hud { position: absolute; top: 28px; left: 0; right: 0; display: flex; flex-direction: column; align-items: center; gap: 14px; }
  .thumb-hud .threat { transform: scale(1.5); transform-origin: center top; }
  .thumb-mult { margin-top: 18px; font: 400 76px/1.2 'Press Start 2P', monospace; color: #ffcf6a; text-shadow: ${OUT}; }
  .thumb-title { position: absolute; left: 50%; bottom: 30px; transform: translateX(-50%); text-align: center; white-space: nowrap; }
  .thumb-word { font: 400 58px/1.2 'Press Start 2P', monospace; color: #fff; text-shadow: ${OUT}; }
  .thumb-word em { font-style: normal; color: #ff8a2a; }
  .thumb-tag { margin-top: 18px; font: 400 18px 'Press Start 2P', monospace; color: #ffd27a; text-shadow: 3px 3px 0 #2a0a06; }
  .thumb-sub { margin-top: 12px; font: 700 18px 'JetBrains Mono', monospace; letter-spacing: 0.14em; color: #f2e6d8; text-shadow: 0 2px 6px rgba(0,0,0,0.9); }
`;
document.head.append(Object.assign(document.createElement('style'), { textContent: css }));
createRoot(document.getElementById('root')!).render(<Thumbnail />);
