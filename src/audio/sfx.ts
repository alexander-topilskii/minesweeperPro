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
}
