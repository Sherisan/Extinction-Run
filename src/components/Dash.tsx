import { useEffect, useRef } from 'react';
import { frameBus } from '../game/frameBus';
import { THREAT_NAMES } from '../game/run';

const LEVELS = ['I', 'II', 'III', 'IV', 'V', 'VI'];

/**
 * The threat strip across the top: a segment lights for each level as the comet nears, with the level's name beside
 * it; everything strobes at the impact.
 */
export function ThreatScale() {
  const root = useRef<HTMLDivElement>(null);
  const name = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let last = '';
    return frameBus.subscribe((f) => {
      const el = root.current;
      if (!el) return;
      const impact = f.run.phase === 'impact';
      const dead = f.run.phase === 'blast';
      const lv = f.run.threat;
      const lit = LEVELS.map((_, i) => (impact ? Math.sin(performance.now() / 45) > 0 : !dead && (f.phase === 'FLYING' || f.phase === 'CRASHED') && lv >= i));
      const label = dead ? 'EXTINCT' : impact ? 'IMPACT' : f.phase === 'BETTING' || !f.phase ? 'SKY WATCH' : THREAT_NAMES[lv];
      const key = lit.map((b) => (b ? 1 : 0)).join('') + label + (f.run.threatUp ? 'u' : '');
      if (key === last) return;
      last = key;
      lit.forEach((on, i) => {
        const seg = el.children[i] as HTMLElement | undefined;
        if (!seg) return;
        seg.classList.toggle('on', on);
        seg.classList.toggle('impact', impact);
        if (f.run.threatUp && i === lv) {
          seg.classList.remove('up');
          void seg.offsetWidth;
          seg.classList.add('up');
        }
      });
      if (name.current) {
        name.current.textContent = label;
        name.current.className = `threat-name lv-${dead || impact ? 'x' : lv}`;
      }
    });
  }, []);
  return (
    <div className="threat">
      <div ref={root} className="threat-scale" aria-hidden>
        {LEVELS.map((t, i) => (
          <span key={t} className={`lv lv-${i}`}>
            {t}
          </span>
        ))}
      </div>
      <span ref={name} className="threat-name">
        SKY WATCH
      </span>
    </div>
  );
}

/** The impact alarm: warms up at high threat, flashes through the impact, stays lit after. */
export function ImpactLamp() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let last = '';
    return frameBus.subscribe((f) => {
      const el = ref.current;
      if (!el) return;
      const cls = f.run.phase === 'impact' ? 'blink' : f.run.phase === 'blast' ? 'on' : f.run.threat >= 4 ? 'warm' : '';
      if (cls === last) return;
      last = cls;
      el.className = `impact-lamp ${cls}`;
    });
  }, []);
  return (
    <div ref={ref} className="impact-lamp" role="img" aria-label="Impact warning">
      <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden shapeRendering="crispEdges">
        <path d="M11 1h3v3h-1v1h-1v1h-1v1h-1v1H9v1H8v1H7v1H6v1H4v-1H3v-2h1V9h1V8h1V7h1V6h1V5h1V4h1V3h1V2h1z" fill="currentColor" opacity="0.55" />
        <path d="M2 10h4v4H2z" fill="currentColor" />
      </svg>
      <span>IMPACT ALERT</span>
    </div>
  );
}
