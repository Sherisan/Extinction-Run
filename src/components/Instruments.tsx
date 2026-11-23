import { useEffect, useRef } from 'react';
import { frameBus, type Frame } from '../game/frameBus';
import { ALT_START } from '../game/run';

export type InstrumentKind = 'speed' | 'comet';

interface Spec {
  label: string;
  unit: string;
  /** 0..1, how full the bar is */
  fill: (f: Frame) => number;
  value: (f: Frame) => string;
  sub: (f: Frame) => string;
}

const SEGMENTS = 16;

export function formatAltitude(km: number): string {
  return km >= 100 ? `${Math.round(km)}` : km >= 1 ? km.toFixed(1) : '0';
}

const SPECS: Record<InstrumentKind, Spec> = {
  speed: {
    label: 'SPRINT',
    unit: 'KM/H',
    fill: (f) => Math.min(1, f.run.speed / 80),
    value: (f) => String(Math.round(f.run.speed)),
    sub: (f) => (f.phase === 'FLYING' || f.phase === 'CRASHED' ? `${Math.round(f.run.dist)} M RUN` : 'ON THE LINE'),
  },
  comet: {
    label: 'COMET ALT',
    unit: 'KM',
    fill: (f) => Math.min(1, Math.max(0, 1 - f.run.altitude / ALT_START)),
    value: (f) => formatAltitude(f.run.altitude),
    sub: (f) => (f.run.phase === 'blast' ? 'STRUCK' : f.run.phase === 'impact' ? 'INCOMING' : `${Math.round(f.run.heat * 100)}% HEAT`),
  },
};

/**
 * A chunky LCD panel: label, a big readout and a segmented bar. The comet panel's bar fills as the comet falls.
 * Updated from the frame bus, not through React.
 */
export function Instrument({ kind }: { kind: InstrumentKind }) {
  const spec = SPECS[kind];
  const root = useRef<HTMLDivElement>(null);
  const value = useRef<HTMLSpanElement>(null);
  const sub = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let lastLit = -1;
    let lastCls = '';
    return frameBus.subscribe((f) => {
      const v = spec.value(f);
      if (value.current && value.current.textContent !== v) value.current.textContent = v;
      const s = spec.sub(f);
      if (sub.current && sub.current.textContent !== s) sub.current.textContent = s;
      const lit = Math.round(spec.fill(f) * SEGMENTS);
      if (lit !== lastLit && bar.current) {
        Array.from(bar.current.children).forEach((c, i) => c.classList.toggle('on', i < lit));
        lastLit = lit;
      }
      const cls = f.run.phase === 'impact' ? 'impact' : f.run.phase === 'blast' ? 'dead' : kind === 'comet' && f.run.threat >= 4 ? 'hot' : '';
      if (cls !== lastCls && root.current) {
        root.current.className = `instrument instrument-${kind} ${cls}`;
        lastCls = cls;
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);
  return (
    <div ref={root} className={`instrument instrument-${kind}`} aria-hidden>
      <div className="instrument-label">{spec.label}</div>
      <div className="instrument-value">
        <span ref={value}>0</span>
        <em>{spec.unit}</em>
      </div>
      <div ref={bar} className="instrument-bar">
        {Array.from({ length: SEGMENTS }, (_, i) => (
          <i key={i} />
        ))}
      </div>
      <div ref={sub} className="instrument-sub" />
    </div>
  );
}
