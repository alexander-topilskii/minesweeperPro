/** Floating, self-destroying text effects (score pops, banners). Non-blocking by design. */
export class Fx {
  private layer = document.getElementById('fx')!;

  /** Text that floats up from a screen point and dissolves. */
  float(x: number, y: number, html: string, cls = ''): void {
    const el = document.createElement('div');
    el.className = `float ${cls}`;
    el.innerHTML = html;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    this.layer.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  }

  /** Large centred banner over an element, same float-and-dissolve motion. */
  banner(over: HTMLElement, html: string, cls = ''): void {
    const r = over.getBoundingClientRect();
    this.float(r.left + r.width / 2, r.top + r.height / 2, html, `banner ${cls}`);
  }
}
