/** Procedural WebAudio SFX — no assets needed. */
export class Sfx {
  private ctx?: AudioContext;

  private ac(): AudioContext {
    this.ctx ??= new AudioContext();
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  private tone(freq: number, at: number, dur = 0.08, type: OscillatorType = 'square', vol = 0.06) {
    const ac = this.ac();
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, ac.currentTime + at);
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + at + dur);
    o.connect(g).connect(ac.destination);
    o.start(ac.currentTime + at);
    o.stop(ac.currentTime + at + dur);
  }

  /** Rising arpeggio — length scales with cascade size. */
  cascade(cells: number) {
    const steps = Math.min(cells, 16);
    const scale = [0, 3, 7, 12, 15, 19, 24, 27, 31, 36];
    for (let i = 0; i < steps; i++) this.tone(220 * 2 ** (scale[i % scale.length] / 12 + Math.floor(i / scale.length)), i * 0.035);
  }

  combo(streak: number) {
    const scale = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
    const semitone = scale[Math.min(streak, scale.length - 1)];
    const freq = 392 * 2 ** (semitone / 12);
    this.tone(freq, 0, 0.08, 'triangle', 0.08);
    this.tone(freq * 1.5, 0.03, 0.1, 'sine', 0.06);
  }

  breakCombo() {
    this.tone(180, 0, 0.15, 'sawtooth', 0.09);
    this.tone(130, 0.06, 0.22, 'sawtooth', 0.09);
  }

  click() {
    this.tone(880, 0, 0.03, 'square', 0.04);
  }

  relay() {
    this.tone(140, 0, 0.02, 'square', 0.05);
  }

  boom() {
    const ac = this.ac();
    const len = ac.sampleRate * 0.4;
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
    const src = ac.createBufferSource();
    const g = ac.createGain();
    g.gain.value = 0.3;
    src.buffer = buf;
    src.connect(g).connect(ac.destination);
    src.start();
  }

  /** Heavy mechanical knife-switch lever throw */
  leverPull() {
    this.tone(130, 0, 0.05, 'sawtooth', 0.14);
    this.tone(85, 0.03, 0.12, 'square', 0.16);
    this.tone(60, 0.08, 0.18, 'triangle', 0.2);
  }

  /** Suspense ticker for sequential flag check: "Тум... Тум... Тум..." */
  rollTick(step: number) {
    const baseFreq = 160 * 1.12 ** Math.min(step, 10);
    this.tone(baseFreq, 0, 0.08, 'triangle', 0.16);
    this.tone(baseFreq * 1.5, 0.02, 0.06, 'sine', 0.1);
  }

  /** Confirmation chirp when a checked flag is verified as a real mine */
  flagConfirmed(step: number) {
    const f = 520 * 1.08 ** Math.min(step, 8);
    this.tone(f, 0, 0.08, 'sine', 0.09);
    this.tone(f * 1.25, 0.04, 0.09, 'triangle', 0.07);
  }

  /** Emergency siren buzzer on false flag */
  buzzer() {
    this.tone(280, 0, 0.18, 'sawtooth', 0.22);
    this.tone(210, 0.09, 0.25, 'sawtooth', 0.25);
    this.tone(140, 0.2, 0.35, 'square', 0.22);
  }

  /** Triumphant arcade slot-machine jackpot bell sequence */
  jackpotFanfare() {
    const notes = [523, 659, 784, 1046, 784, 1046, 1318, 1568];
    notes.forEach((freq, i) => {
      this.tone(freq, i * 0.07, 0.16, 'sine', 0.15);
      this.tone(freq * 0.5, i * 0.07, 0.14, 'triangle', 0.09);
    });
  }
}
