import { useEffect, useRef } from 'react';
import type { Phase } from '../api/types';
import { frameBus } from '../game/frameBus';
import { IMPACT_S } from '../game/run';
import { formatAltitude } from './Instruments';

/**
 * The big multiplier over the plain, with the status line under it: the countdown to the off while betting, "RUN!"
 * and the comet's altitude on the run, "IMPACT!" then "EXTINCT" at the crash. Updated from the frame bus.
 */
export function Readout({ phase }: { phase: Phase | null }) {
  const root = useRef<HTMLDivElement>(null);
  const mult = useRef<HTMLDivElement>(null);
  const status = useRef<HTMLDivElement>(null);
  const sub = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let lastText = '';
    let lastStatus = '';
    let lastCls = '';
    return frameBus.subscribe((f) => {
      const text = `${f.m.toFixed(2)}×`;
      if (text !== lastText && mult.current) {
        mult.current.textContent = text;
        lastText = text;
      }
      let st = '';
      let subText = '';
      let cls = '';
      if (f.phase === 'BETTING') {
        const s = f.countdownS ?? 0;
        st = s <= 1.6 ? 'GET SET…' : 'THE HERD GATHERS';
        subText = s <= 1.6 ? '' : `RUN STARTS IN ${s.toFixed(1)}s`;
        cls = 'staging';
      } else if (f.phase === 'FLYING') {
        st = f.run.t < 1.2 ? 'RUN!' : f.run.threat >= 4 ? 'IT’S COMING DOWN' : 'RUNNING';
        subText = `COMET ${formatAltitude(f.run.altitude)} KM UP`;
        cls = f.run.threat >= 4 ? 'run hot' : 'run';
      } else if (f.phase === 'CRASHED') {
        const impact = (f.run.crashAge ?? 0) < IMPACT_S;
        st = impact ? 'IMPACT!' : 'EXTINCT';
        subText = impact ? '' : `STRUCK AT ${f.crashPoint?.toFixed(2) ?? f.m.toFixed(2)}×`;
        cls = impact ? 'impact' : 'extinct';
      }
      if (st !== lastStatus && status.current) {
        status.current.textContent = st;
        lastStatus = st;
      }
      if (sub.current && sub.current.textContent !== subText) sub.current.textContent = subText;
      if (cls !== lastCls && root.current) {
        root.current.className = `readout ${cls}`;
        lastCls = cls;
      }
    });
  }, []);

  return (
    <div ref={root} className="readout" aria-live="off" data-phase={phase ?? 'none'}>
      <div ref={status} className="readout-status">
        {phase ? '' : 'CONNECTING'}
      </div>
      <div ref={mult} className="readout-mult">
        1.00×
      </div>
      <div ref={sub} className="readout-sub" />
    </div>
  );
}
