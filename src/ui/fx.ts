/** Floating, self-destroying text effects (score pops, banners). Non-blocking by design. */
export class Fx {
  private layer = document.getElementById('fx')!;

  /** Text that bursts away from a click point in a random fan direction, lingers, then flies to targetEl. */
  burst(originX: number, originY: number, html: string, cls = '', targetEl?: HTMLElement | null): void {
    const el = document.createElement('div');
    el.className = `float ${cls}`;
    el.innerHTML = html;

    // Random angle radiating outward: upper 150-degree fan (-165° to -15°)
    // so numbers burst upward & outward to sides, away from cursor/finger
    const angleDeg = -165 + Math.random() * 150;
    const rad = (angleDeg * Math.PI) / 180;

    // Initial spawn offset from cursor (28-42px)
    const spawnDist = 28 + Math.random() * 14;
    const startX = originX + Math.cos(rad) * spawnDist;
    const startY = originY + Math.sin(rad) * spawnDist;

    // Travel vector outwards in that direction (45-70px further)
    const travel = 45 + Math.random() * 25;
    const dx = Math.cos(rad) * travel;
    // Add slight upward lift (-18px)
    const dy = Math.sin(rad) * travel - 18;

    el.style.left = `${startX.toFixed(1)}px`;
    el.style.top = `${startY.toFixed(1)}px`;
    el.style.setProperty('--dx', `${dx.toFixed(1)}px`);
    el.style.setProperty('--dy', `${dy.toFixed(1)}px`);

    this.layer.appendChild(el);

    if (targetEl) {
      // Phase 1: Drift and linger near click point (~1000ms)
      // Phase 2: Rapidly zoom & shrink into the target (e.g. #lcd-score)
      const lingerMs = 950;
      const flyMs = 380;
      setTimeout(() => {
        if (!el.isConnected) return;
        const targetRect = targetEl.getBoundingClientRect();
        const targetX = targetRect.left + targetRect.width / 2;
        const targetY = targetRect.top + targetRect.height / 2;

        // Current visual position of the element after phase 1
        const curX = startX + dx;
        const curY = startY + dy;
        const toTargetX = targetX - curX;
        const toTargetY = targetY - curY;

        // Stop drift animation and smoothly transition to target
        el.style.animation = 'none';
        el.style.transform = `translate3d(calc(-50% + ${dx.toFixed(1)}px), calc(-50% + ${dy.toFixed(1)}px), 0) scale(1)`;
        void el.offsetWidth; // force reflow

        el.style.transition = `transform ${flyMs}ms cubic-bezier(0.25, 0.1, 0.25, 1), opacity ${flyMs}ms cubic-bezier(0.5, 0, 0.75, 0)`;
        el.style.transform = `translate3d(calc(-50% + ${(dx + toTargetX).toFixed(1)}px), calc(-50% + ${(dy + toTargetY).toFixed(1)}px), 0) scale(0.2)`;
        el.style.opacity = '0.15';

        setTimeout(() => {
          // Pulse target when points hit
          targetEl.classList.remove('bump');
          void targetEl.offsetWidth;
          targetEl.classList.add('bump');
          el.remove();
        }, flyMs);
      }, lingerMs);
    } else {
      el.addEventListener('animationend', () => el.remove());
    }
  }

  /** Standard floating element from a point */
  float(x: number, y: number, html: string, cls = ''): void {
    const el = document.createElement('div');
    el.className = `float ${cls}`;
    el.innerHTML = html;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.setProperty('--dx', '0px');
    el.style.setProperty('--dy', '-35px');
    this.layer.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  }

  /** Large centred banner over an element. */
  banner(over: HTMLElement, html: string, cls = ''): void {
    const r = over.getBoundingClientRect();
    const el = document.createElement('div');
    el.className = `float banner ${cls}`;
    el.innerHTML = html;
    el.style.left = `${(r.left + r.width / 2).toFixed(1)}px`;
    el.style.top = `${(r.top + r.height / 2).toFixed(1)}px`;
    this.layer.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  }
}
