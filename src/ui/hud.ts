import type { Game, TurnResult } from '../core/game';
import { CONFIG } from '../config';

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** DOM HUD: stats, last-turn breakdown, module slots, round overlay. */
export class Hud {
  private hud = document.getElementById('hud')!;
  private modules = document.getElementById('modules')!;
  private overlay = document.getElementById('overlay')!;
  private displayedScore = 0;

  constructor(
    private game: Game,
    private actions: { next(): void; restart(): void },
  ) {
    this.overlay.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
      if (btn?.dataset.action === 'next') this.actions.next();
      if (btn?.dataset.action === 'restart') this.actions.restart();
    });
    requestAnimationFrame(this.tick);
  }

  setGame(game: Game): void {
    this.game = game;
    this.displayedScore = 0;
  }

  /** Mechanical score counter roll-up. */
  private tick = () => {
    const target = this.game.score;
    if (this.displayedScore !== target) {
      const diff = target - this.displayedScore;
      this.displayedScore += Math.sign(diff) * Math.max(1, Math.ceil(Math.abs(diff) * 0.15));
      if ((diff > 0 && this.displayedScore > target) || (diff < 0 && this.displayedScore < target)) this.displayedScore = target;
      const el = this.hud.querySelector('#score');
      if (el) el.textContent = String(this.displayedScore);
    }
    requestAnimationFrame(this.tick);
  };

  render(): void {
    const g = this.game;
    const pct = Math.min(100, (g.score / g.target) * 100);
    const hull = '■'.repeat(Math.max(0, g.hull)) + '□'.repeat(Math.max(0, CONFIG.hull - g.hull));
    this.hud.innerHTML = `
      <h1>SWEEPER<span>:OVERCHARGE</span></h1>
      <div class="stage">СЕКТОР ${g.sector}/${CONFIG.sectors} · ${g.stageName}</div>
      <div class="block">
        <div class="label">ОЧКИ</div>
        <div class="big"><span id="score">${this.displayedScore}</span> / ${g.target}</div>
        <div class="bar"><i style="width:${pct}%"></i></div>
      </div>
      ${this.turnHtml(g.lastTurn)}
      <div class="grid">
        <div><div class="label">БАТАРЕЯ</div><div class="val">${g.clicks}</div></div>
        <div><div class="label">КОРПУС</div><div class="val hull">${hull}</div></div>
        <div><div class="label">КОМБО</div><div class="val">${g.combo}</div></div>
        <div><div class="label">BITS</div><div class="val">${g.bits}</div></div>
      </div>
      <div class="hint">ЛКМ — скан · ПКМ — флаг · клик по цифре — аккорд<br/>Touch: тап — скан, удержание — флаг</div>
    `;
    this.modules.innerHTML = Array.from({ length: CONFIG.moduleSlots }, (_, i) => {
      const m = g.modules[i];
      return m
        ? `<div class="module" data-id="${m.id}"><b>${m.name}</b><small>${m.description}</small></div>`
        : `<div class="module empty">— пусто —</div>`;
    }).join('');
    this.renderOverlay();
  }

  private turnHtml(t?: TurnResult): string {
    if (!t) return `<div class="turn muted">Ожидание сканирования…</div>`;
    const x = t.xMult !== 1 ? ` <span class="x">×${fmt(t.xMult)}</span>` : '';
    return `<div class="turn ${t.exploded ? 'boom' : ''}">
      <span class="data">${t.data}</span> × <span class="mult">${fmt(t.mult)}</span>${x} = <b>+${t.score}</b>
      <small>${t.cells} кл.${t.exploded ? ' · ПОДРЫВ' : ''}</small>
    </div>`;
  }

  private renderOverlay(): void {
    const g = this.game;
    if (g.status === 'playing') return void (this.overlay.hidden = true);
    this.overlay.hidden = false;
    const content = {
      won: `<h2>СЕКТОР ОЧИЩЕН</h2><p>Счёт ${g.score} / ${g.target}<br/>Bits: ${g.bits}</p><button data-action="next">ДАЛЕЕ ▶</button>`,
      lost: `<h2>СИГНАЛ ПОТЕРЯН</h2><p>Счёт ${g.score} / ${g.target}</p><button data-action="restart">НОВЫЙ ЗАБЕГ</button>`,
      victory: `<h2>ВСЕ ГЛУБИНЫ ПРОЙДЕНЫ</h2><p>Bits: ${g.bits}</p><button data-action="restart">НОВЫЙ ЗАБЕГ</button>`,
    }[g.status];
    this.overlay.innerHTML = `<div class="panel">${content}</div>`;
  }

  flashModule(id: string): void {
    const el = this.modules.querySelector(`[data-id="${id}"]`);
    if (!el) return;
    el.classList.remove('fired');
    void (el as HTMLElement).offsetWidth;
    el.classList.add('fired');
  }
}
