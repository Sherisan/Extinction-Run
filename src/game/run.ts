/*
 * The run as a function of time: theatre only. The multiplier comes from the server (e^(rate·t)) and everything here
 * is derived from it, so nothing on screen feeds back into the odds. As the multiplier climbs, the comet falls (its
 * altitude drops, it grows, the sky reddens) and the threat level rises. The crash point arrives from the server as
 * the impact: the comet comes down, then the shockwave rolls over the plain.
 */

/** Multiplier at which each threat level starts: CALM … EXTINCTION. */
export const THREAT_AT = [1, 1.5, 2.5, 5, 10, 25];
export const THREAT_NAMES = ['CALM', 'RUMBLE', 'ASHFALL', 'FIRESTORM', 'QUAKE', 'EXTINCTION'];
/** The comet streaks down to the horizon for this long. */
export const IMPACT_S = 0.6;
/** Then the fireball and the shockwave. */
export const BLAST_S = 3.2;
/** Comet altitude at the start, km. */
export const ALT_START = 1000;

export type RunPhase = 'idle' | 'run' | 'impact' | 'blast';

export interface Run {
  phase: RunPhase;
  /** Seconds into the run (0 while staging). */
  t: number;
  /** ln(multiplier). */
  power: number;
  /** The live multiplier. */
  m: number;
  /** The raptors' speed, km/h. */
  speed: number;
  /** Metres run since the start. */
  dist: number;
  /** The comet's altitude, km. */
  altitude: number;
  /** 0 → 1: how close the end is (the comet's size, the sky's colour). */
  heat: number;
  /** Threat level 0–5. */
  threat: number;
  /** True on the first frame of a higher threat level. */
  threatUp: boolean;
  /** Seconds since the impact began, once crashed. */
  crashAge: number | null;
}

export const altitudeAt = (power: number) => 20 + (ALT_START - 20) / (1 + 1.3 * power);
export const heatAt = (power: number) => Math.min(1, power / Math.log(1000));

export function threatOf(m: number): number {
  let lv = 0;
  for (let i = 0; i < THREAT_AT.length; i++) if (m >= THREAT_AT[i]) lv = i;
  return lv;
}

/** Speed (km/h) `t` seconds into the run: a burst off the line, then a steady sprint. */
export function speedAt(t: number): number {
  if (t <= 0) return 0;
  return 62 * (1 - Math.exp(-t / 1.2)) + 0.35 * t;
}

/** Metres run after `t` seconds: ∫ speedAt / 3.6. */
export function distAt(t: number): number {
  if (t <= 0) return 0;
  return (62 * (t - 1.2 * (1 - Math.exp(-t / 1.2))) + 0.175 * t * t) / 3.6;
}

/** Remembers the last threat level (for the alarm) and the state at the crash. Call `step` once per frame. */
export class RunModel {
  private lastThreat = 0;

  /**
   * @param running a run is on (FLYING) or finished (CRASHED); false while staging
   * @param t seconds since the start
   * @param rate the multiplier's growth rate (multiplier = e^(rate·t))
   * @param crashAge seconds since the crash, or null
   */
  step(running: boolean, t: number, rate: number, crashAge: number | null): Run {
    if (!running) {
      this.lastThreat = 0;
      return { phase: 'idle', t: 0, power: 0, m: 1, speed: 0, dist: 0, altitude: ALT_START, heat: 0, threat: 0, threatUp: false, crashAge: null };
    }
    const power = rate * Math.max(0, t);
    const m = Math.exp(power);
    const threat = threatOf(m);
    const base = { t, power, m, threat, heat: heatAt(power) };
    if (crashAge != null) {
      const speed = speedAt(t);
      if (crashAge < IMPACT_S) {
        const k = crashAge / IMPACT_S;
        return { ...base, phase: 'impact', speed, dist: distAt(t) + (speed / 3.6) * crashAge, altitude: altitudeAt(power) * (1 - k * k), threatUp: false, crashAge };
      }
      // the herd is gone: the plain slows to a stop
      const b = Math.min(1.5, crashAge - IMPACT_S);
      const extra = (speed / 3.6) * (IMPACT_S + b - (b * b) / 3);
      return { ...base, phase: 'blast', speed: speed * Math.max(0, 1 - b / 1.5), dist: distAt(t) + extra, altitude: 0, threatUp: false, crashAge };
    }
    const threatUp = threat > this.lastThreat;
    this.lastThreat = threat;
    return { ...base, phase: 'run', speed: speedAt(t), dist: distAt(t), altitude: altitudeAt(power), threatUp, crashAge: null };
  }
}
