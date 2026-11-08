"use client";

/**
 * Synthesised engine + horn audio (WebAudio). No external assets required:
 * a sawtooth oscillator tracks RPM, filtered noise adds road roar,
 * and a dual-tone horn mimics an Indian bus horn.
 */
export class EngineAudio {
  private ctx: AudioContext | null = null;
  private osc: OscillatorNode | null = null;
  private sub: OscillatorNode | null = null;
  private gain: GainNode | null = null;
  private noiseGain: GainNode | null = null;
  private master: GainNode | null = null;
  private volume = 0.6;
  private running = false;

  start() {
    if (this.running) return;
    try {
      this.ctx = new AudioContext();
    } catch {
      return; // audio unsupported — game still plays
    }
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(ctx.destination);

    this.osc = ctx.createOscillator();
    this.osc.type = "sawtooth";
    this.osc.frequency.value = 80;
    this.gain = ctx.createGain();
    this.gain.gain.value = 0.06;
    this.osc.connect(this.gain).connect(this.master);
    this.osc.start();

    this.sub = ctx.createOscillator();
    this.sub.type = "triangle";
    this.sub.frequency.value = 40;
    const subG = ctx.createGain();
    subG.gain.value = 0.05;
    this.sub.connect(subG).connect(this.master);
    this.sub.start();

    // road/tyre noise via looping noise buffer
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 350;
    this.noiseGain = ctx.createGain();
    this.noiseGain.gain.value = 0;
    src.connect(filter).connect(this.noiseGain).connect(this.master);
    src.start();

    this.running = true;
  }

  stop() {
    try {
      this.ctx?.close();
    } catch {
      /* ignore */
    }
    this.running = false;
    this.ctx = null;
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1);
    }
  }

  setPaused(p: boolean) {
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(p ? 0 : this.volume, this.ctx.currentTime, 0.05);
    }
  }

  updateEngine(rpm: number, wheelOmega: number, throttle: number) {
    if (!this.ctx || !this.osc || !this.gain || !this.noiseGain) return;
    const t = this.ctx.currentTime;
    const f = 26 + (rpm / 2400) * 150;
    this.osc.frequency.setTargetAtTime(f, t, 0.05);
    this.sub?.frequency.setTargetAtTime(f * 0.5, t, 0.05);
    this.gain.gain.setTargetAtTime(0.035 + throttle * 0.05, t, 0.08);
    this.noiseGain.gain.setTargetAtTime(
      Math.min(0.12, Math.abs(wheelOmega) * 0.012),
      t,
      0.1,
    );
  }

  horn() {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = 0.22;
    g.connect(this.master);
    for (const f of [400, 505]) {
      const o = ctx.createOscillator();
      o.type = "square";
      o.frequency.value = f;
      o.connect(g);
      o.start();
      o.stop(ctx.currentTime + 0.45);
    }
    g.gain.setTargetAtTime(0, ctx.currentTime + 0.35, 0.05);
    setTimeout(() => g.disconnect(), 700);
  }
}
