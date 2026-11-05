/**
 * Tiny WebAudio synth. No audio files, no autoplay issues:
 * the context is created/resumed from a user gesture.
 */
class AudioKit {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
    this.noiseBuffer = null;
  }

  ensure() {
    if (!this.enabled) return null;
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.42;
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.knee.value = 18;
      comp.ratio.value = 5;
      this.master.connect(comp);
      comp.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  setEnabled(value) {
    // Never create or resume the AudioContext here: this runs at boot,
    // before any user gesture, which browsers treat as an autoplay attempt.
    // The first tap/keypress creates it lazily via ensure().
    this.enabled = value;
  }

  get now() { return this.ctx ? this.ctx.currentTime : 0; }

  tone(freq, dur = 0.12, opts = {}) {
    const ctx = this.ensure();
    if (!ctx) return;
    const {
      type = "sine", vol = 0.16, delay = 0, slide = null, attack = 0.008,
    } = opts;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, freq), t0);
    if (slide != null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t0 + dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t0 + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  noise(dur = 0.2, opts = {}) {
    const ctx = this.ensure();
    if (!ctx) return;
    const { vol = 0.12, delay = 0, freq = 900, q = 0.8, type = "bandpass", slide = null } = opts;
    if (!this.noiseBuffer) {
      const len = Math.floor(ctx.sampleRate * 1.2);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.noiseBuffer = buf;
    }
    const t0 = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, t0);
    filter.Q.value = q;
    if (slide != null) filter.frequency.exponentialRampToValueAtTime(Math.max(40, slide), t0 + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  tap() { this.tone(520, 0.05, { type: "triangle", vol: 0.1, slide: 760 }); }
  click() { this.tone(340, 0.045, { type: "square", vol: 0.05, slide: 420 }); }
  pop() { this.tone(560, 0.09, { type: "sine", vol: 0.16, slide: 980 }); }
  eat() { this.tone(440, 0.07, { type: "triangle", vol: 0.14, slide: 880 }); this.tone(880, 0.06, { type: "sine", vol: 0.07, delay: 0.04, slide: 1180 }); }
  good() { this.tone(660, 0.09, { type: "triangle", vol: 0.15 }); this.tone(990, 0.13, { type: "triangle", vol: 0.13, delay: 0.07 }); }
  bad() { this.tone(190, 0.28, { type: "sawtooth", vol: 0.14, slide: 55 }); this.noise(0.22, { vol: 0.1, freq: 400, slide: 120 }); }
  fail() { this.tone(240, 0.2, { type: "square", vol: 0.08, slide: 90 }); this.tone(180, 0.34, { type: "sawtooth", vol: 0.09, delay: 0.1, slide: 50 }); }
  thunk() { this.tone(150, 0.09, { type: "triangle", vol: 0.22, slide: 60 }); this.noise(0.06, { vol: 0.13, freq: 240, q: 1.2 }); }
  whoosh() { this.noise(0.14, { vol: 0.11, freq: 500, slide: 2200, q: 1.1 }); }
  tick() { this.tone(900, 0.032, { type: "square", vol: 0.05 }); }
  graze() { this.tone(1420, 0.045, { type: "sine", vol: 0.055, slide: 1860 }); }
  shoot() { this.tone(760, 0.055, { type: "square", vol: 0.055, slide: 260 }); }
  hurt() { this.tone(220, 0.16, { type: "sawtooth", vol: 0.16, slide: 90 }); this.noise(0.12, { vol: 0.1, freq: 300 }); }
  splash() { this.noise(0.2, { vol: 0.12, freq: 1400, slide: 300, q: 0.7 }); }
  levelUp() {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.18, { type: "triangle", vol: 0.13, delay: i * 0.07 }));
  }
  win() {
    [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.26, { type: "triangle", vol: 0.15, delay: i * 0.085 }));
    this.tone(1568, 0.5, { type: "sine", vol: 0.1, delay: 0.45 });
  }
  lose() {
    [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.22, { type: "sawtooth", vol: 0.09, delay: i * 0.12 }));
  }
}

export const audio = new AudioKit();
