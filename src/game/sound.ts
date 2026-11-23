/*
 * Synth sound, no samples, with an 8-bit edge: a bed of wind, the comet's rising hiss and a ground rumble that grows
 * with the threat; the herd's footfalls pattering with their speed; square-wave countdown blips, a two-tone alarm on
 * each threat level, the impact (a crack, a boom and a long roll), the dig of a burrow, and a win arpeggio. Built from
 * oscillators and a noise buffer at first use, so a muted game costs nothing.
 */

import type { RunPhase } from './run';

const STORAGE_KEY = 'extinctionrun.sound';

interface Bed {
  windGain: GainNode;
  windFilter: BiquadFilterNode;
  hissGain: GainNode;
  hissFilter: BiquadFilterNode;
  rumbleGain: GainNode;
}

class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private bed: Bed | null = null;
  private unlocked = false;
  private _enabled: boolean;
  private stepAcc = 0;
  private stepSide = 0;

  constructor() {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(STORAGE_KEY);
    } catch {
      /* private mode */
    }
    this._enabled = saved !== 'off';
  }

  get enabled() {
    return this._enabled;
  }

  set enabled(v: boolean) {
    this._enabled = v;
    try {
      localStorage.setItem(STORAGE_KEY, v ? 'on' : 'off');
    } catch {
      /* ignore */
    }
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(v ? 0.9 : 0, this.ctx.currentTime, 0.05);
    if (v) this.unlock();
  }

  /** Call from a user gesture: browsers only start audio after one. */
  unlock() {
    if (!this._enabled) return;
    if (!this.ctx) this.build();
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
    this.unlocked = true;
  }

  private build() {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = this._enabled ? 0.9 : 0;
    this.master.connect(comp);

    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noise = buf;

    const loopNoise = (type: BiquadFilterType, freq: number, q: number) => {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.loopStart = Math.random();
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(f);
      f.connect(g);
      g.connect(this.master!);
      src.start();
      return { f, g };
    };
    const wind = loopNoise('bandpass', 500, 0.8);
    const hiss = loopNoise('bandpass', 2400, 2.5);
    const rumble = loopNoise('lowpass', 90, 0.9);
    this.bed = { windGain: wind.g, windFilter: wind.f, hissGain: hiss.g, hissFilter: hiss.f, rumbleGain: rumble.g };
  }

  private get ready() {
    return this._enabled && this.unlocked && this.ctx != null && this.ctx.state === 'running';
  }

  /** Per frame: the bed follows the comet; footfalls follow the herd's speed. */
  ambience(heat: number, speed: number, phase: RunPhase, dt: number) {
    if (!this.ready || !this.ctx || !this.bed) return;
    const t = this.ctx.currentTime;
    const b = this.bed;
    const blast = phase === 'blast';
    b.windGain.gain.setTargetAtTime(0.03 + heat * 0.08 + (blast ? 0.06 : 0), t, 0.3);
    b.windFilter.frequency.setTargetAtTime(380 + heat * 500 + Math.sin(t * 1.3) * 60, t, 0.3);
    b.hissGain.gain.setTargetAtTime(phase === 'run' ? heat * heat * 0.12 : phase === 'impact' ? 0.25 : 0, t, phase === 'impact' ? 0.05 : 0.3);
    b.hissFilter.frequency.setTargetAtTime(1800 + heat * 2600 + (phase === 'impact' ? 2000 : 0), t, 0.2);
    b.rumbleGain.gain.setTargetAtTime(blast ? 0.5 : phase === 'impact' ? 0.7 : Math.max(0, heat - 0.25) * 0.5, t, 0.25);
    // footfalls: a quick patter, faster as they sprint
    if (phase === 'run' && speed > 8) {
      this.stepAcc += dt * (4 + speed / 7);
      while (this.stepAcc >= 1) {
        this.stepAcc--;
        this.stepSide ^= 1;
        this.burst({ dur: 0.05, gain: 0.05, type: 'bandpass', freq: this.stepSide ? 900 : 700, q: 2 });
        this.tone(this.stepSide ? 110 : 98, 0.05, 0.05, 'square');
      }
    } else this.stepAcc = 0;
  }

  private burst(opts: { dur: number; gain: number; type?: BiquadFilterType; freq?: number; freqEnd?: number; q?: number; delay?: number; attack?: number }) {
    if (!this.ready || !this.ctx || !this.noise) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + (opts.delay ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filt = ctx.createBiquadFilter();
    filt.type = opts.type ?? 'bandpass';
    filt.frequency.setValueAtTime(opts.freq ?? 1000, t0);
    if (opts.freqEnd) filt.frequency.exponentialRampToValueAtTime(opts.freqEnd, t0 + opts.dur);
    filt.Q.value = opts.q ?? 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(opts.gain, t0 + (opts.attack ?? 0.01));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
    src.connect(filt);
    filt.connect(g);
    g.connect(this.master!);
    src.start(t0);
    src.stop(t0 + opts.dur + 0.05);
  }

  private tone(freq: number, dur: number, gain: number, type: OscillatorType = 'square', delay = 0, freqEnd?: number, attack = 0.005) {
    if (!this.ready || !this.ctx) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(this.master!);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  /** The countdown blip in the last seconds before the off. */
  ping() {
    this.tone(880, 0.09, 0.08, 'square');
  }

  /** The off: a high blip and a raptor's screech. */
  start() {
    this.tone(1760, 0.12, 0.09, 'square');
    this.tone(1200, 0.35, 0.1, 'sawtooth', 0.05, 2400, 0.02);
    this.tone(1250, 0.3, 0.06, 'square', 0.08, 1900, 0.02);
    this.burst({ dur: 0.3, gain: 0.1, type: 'highpass', freq: 3000, delay: 0.05 });
  }

  /** A higher threat level: two-tone square alarm, more urgent the higher it goes. */
  alarm(level: number) {
    const g = 0.04 + Math.min(5, level) * 0.012;
    for (let i = 0; i < 2; i++) {
      this.tone(660, 0.1, g, 'square', i * 0.24);
      this.tone(990, 0.1, g, 'square', i * 0.24 + 0.12);
    }
  }

  /** The comet comes down: a rising scream. */
  incoming() {
    this.tone(300, 0.6, 0.12, 'sawtooth', 0, 1800, 0.1);
    this.burst({ dur: 0.6, gain: 0.3, type: 'bandpass', freq: 1200, freqEnd: 5000, q: 1.2, attack: 0.3 });
  }

  /** Impact: the crack, the boom, a long roll of thunder and falling rock. */
  impact() {
    this.burst({ dur: 0.25, gain: 0.6, type: 'highpass', freq: 2500 });
    this.tone(70, 1.6, 0.7, 'sine', 0, 28, 0.01);
    this.tone(140, 0.4, 0.3, 'square', 0, 40);
    this.burst({ dur: 3.2, gain: 0.7, type: 'lowpass', freq: 900, freqEnd: 60, attack: 0.02 });
    for (const d of [0.4, 0.7, 1.0, 1.5, 2.1]) this.burst({ dur: 0.2, gain: 0.15, type: 'bandpass', freq: 400 + Math.random() * 500, q: 2, delay: d });
  }

  /** Burrowing: claws scraping dirt, then a soft thump into the chamber. */
  burrow() {
    for (let i = 0; i < 5; i++) this.burst({ dur: 0.07, gain: 0.16, type: 'bandpass', freq: 1300 + Math.random() * 900, q: 3, delay: i * 0.1 });
    this.tone(160, 0.15, 0.12, 'triangle', 0.55, 80);
  }

  win() {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.14, 0.09, 'square', 0.04 + i * 0.07));
  }

  bet() {
    this.tone(640, 0.05, 0.08, 'square');
  }

  click() {
    this.burst({ dur: 0.03, gain: 0.08, type: 'bandpass', freq: 2200, q: 1 });
  }

  /** Another raptor digs in. */
  otherBurrow() {
    this.burst({ dur: 0.12, gain: 0.06, type: 'bandpass', freq: 1100, q: 2.5 });
    this.tone(420, 0.06, 0.04, 'square', 0.02, 300);
  }
}

export const sound = new SoundEngine();
