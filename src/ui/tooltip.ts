/**
 * Canonical Windows 95–style instant tooltip.
 */
export class Tooltip {
  private el: HTMLElement;

  constructor() {
    this.el = document.createElement('div');
    this.el.id = 'game-tooltip';
    this.el.className = 'game-tooltip';
    document.body.appendChild(this.el);
  }

  show(html: string, x: number, y: number, offset = 12): void {
    this.el.innerHTML = html;
    this.el.style.display = 'block';

    const rect = this.el.getBoundingClientRect();
    let left = x + offset;
    let top = y + offset;

    if (left + rect.width > window.innerWidth - 8) {
      left = x - rect.width - 8;
    }
    if (top + rect.height > window.innerHeight - 8) {
      top = y - rect.height - 8;
    }

    this.el.style.left = `${Math.max(8, left)}px`;
    this.el.style.top = `${Math.max(8, top)}px`;
  }

  hide(): void {
    if (this.el) {
      this.el.style.display = 'none';
    }
  }
}

export const tooltip = new Tooltip();
