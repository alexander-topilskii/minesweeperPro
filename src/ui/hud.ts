import type { Game, TurnResult } from '../core/game';
import { CONFIG } from '../config';

const $ = (id: string) => document.getElementById(id)!;
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const pad = (n: number, len: number) => String(Math.max(0, Math.min(n, 10 ** len - 1))).padStart(len, '0');

/** DOM HUD in classic Minesweeper window chrome. */
export class Hud {
  private displayedScore = 0;

  constructor(
    private game: Game,
    private actions: { smiley(): void; restart(): void; onUseConsumable(idx: number): void },
  ) {
    $('smiley').addEventListener('click', () => this.actions.smiley());
    $('overlay').addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('[data-action="restart"]')) this.actions.restart();
    });

    $('consumables').addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('[data-con-idx]') as HTMLElement | null;
      if (!btn) return;
      const idx = Number(btn.dataset.conIdx);
      this.actions.onUseConsumable(idx);
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
      const step = Math.sign(diff) * Math.max(1, Math.ceil(Math.abs(diff) * 0.12));
      this.displayedScore = Math.abs(step) >= Math.abs(diff) ? target : this.displayedScore + step;
      $('lcd-score').textContent = pad(this.displayedScore, 6);
      $('lcd-score').classList.toggle('rolling', this.displayedScore !== target);
    }
    requestAnimationFrame(this.tick);
  };

  render(): void {
    const g = this.game;

    // View toggle between game and shop
    const isShop = g.status === 'shop';
    $('game-view').hidden = isShop;
    $('shop-view').hidden = !isShop;

    $('lcd-clicks').textContent = pad(g.clicks, 3);
    $('lcd-clicks').classList.toggle('low', g.clicks <= 3);
    $('lcd-score').textContent = pad(this.displayedScore, 6);

    const smiley = $('smiley');
    smiley.dataset.state = g.status === 'lost' ? 'dead' : g.cleared ? 'cool' : 'normal';
    smiley.title = g.cleared && g.status === 'playing' ? 'Забрать награду и перейти в Магазин' : g.status === 'lost' ? 'Новый забег' : '';

    const pct = Math.min(100, (g.score / g.target) * 100);
    $('target-fill').style.width = `${pct}%`;
    $('target-text').textContent = g.cleared
      ? `OVERCHARGE ${Math.round((g.score / g.target) * 100)}%`
      : `ЦЕЛЬ ${g.target}`;
    document.body.classList.toggle('cleared', g.cleared);

    $('turn').innerHTML = this.turnHtml(g.lastTurn);
    $('hull').innerHTML = Array.from({ length: CONFIG.hull }, (_, i) => `<i class="${i < g.hull ? 'on' : ''}"></i>`).join('');
    $('combo').textContent = `${g.combo}  (+${fmt(g.combo * CONFIG.comboMultStep)})`;
    $('bits').textContent = String(g.bits);

    // Consumables list in side panel
    $('consumables').innerHTML = Array.from({ length: CONFIG.consumableSlots }, (_, i) => {
      const c = g.consumables[i];
      if (!c) return `<div class="con-slot empty">пусто</div>`;
      const isPrimed = g.activeConsumableIdx === i;
      return `
        <button class="con-slot bevel-out ${isPrimed ? 'primed' : ''}" data-con-idx="${i}" title="${c.description}">
          <b>${c.name}</b>
          <small>${isPrimed ? '⚡ КЛИКНИТЕ КЛЕТКУ' : c.targetType === 'cell' ? '🎯 ПРИЦЕЛ' : '⚡ АКТИВИРОВАТЬ'}</small>
        </button>
      `;
    }).join('');

    // Modules list
    $('modules').innerHTML = Array.from({ length: CONFIG.moduleSlots }, (_, i) => {
      const m = g.modules[i];
      return m
        ? `<div class="module bevel-out" data-id="${m.id}"><b>${m.name}</b><small>${m.description}</small></div>`
        : `<div class="module empty">пустой слот</div>`;
    }).join('');

    $('status-stage').textContent = isShop
      ? `Торговый пост Сектора ${g.sector}`
      : `Сектор ${g.sector}/${CONFIG.sectors} · ${g.stageName}`;

    if (g.activeConsumableIdx !== undefined) {
      const con = g.consumables[g.activeConsumableIdx];
      $('status-hint').textContent = `🎯 [РЕЖИМ ПРИЦЕЛА]: Выберите закрытую клетку для применения «${con?.name}» (ПКМ для отмены)`;
    } else if (g.cleared && g.status === 'playing') {
      $('status-hint').textContent = '😎 — нажми смайлик для перехода в Магазин или набивай Overcharge дальше!';
    } else {
      $('status-hint').textContent = 'ЛКМ — скан · ПКМ/удержание — флаг · клик по цифре — аккорд';
    }

    this.renderOverlay();
  }

  private turnHtml(t?: TurnResult): string {
    if (!t) return `<div class="muted">Ожидание сканирования…</div>`;
    const x = t.xMult !== 1 ? ` <span class="x">×${fmt(t.xMult)}</span>` : '';
    const callouts = t.callouts && t.callouts.length
      ? `<div class="turn-callouts">${t.callouts.map((c) => `<span class="chip-callout">${c}</span>`).join('')}</div>`
      : '';
    return `<div class="${t.exploded ? 'boom' : ''}">
      ${callouts}
      <span class="chip data">${t.data}</span> × <span class="chip mult">${fmt(t.mult)}</span>${x}
      <div class="sum">= +${t.score}</div>
      <small>${t.cells} кл.${t.exploded ? ' · ПОДРЫВ' : ''}</small>
    </div>`;
  }

  private renderOverlay(): void {
    const g = this.game;
    const el = $('overlay');
    if (g.status !== 'lost' && g.status !== 'victory') return void (el.hidden = true);
    el.hidden = false;
    const [title, icon, text] =
      g.status === 'lost'
        ? ['Сигнал потерян', '⚠', `Сектор ${g.sector}, счёт ${g.score} / ${g.target}`]
        : ['Миссия выполнена', 'ℹ', `Все глубины пройдены. Bits: ${g.bits}`];
    el.innerHTML = `<div class="window dialog">
      <div class="titlebar"><span class="title">${title}</span><span class="tbtns"><b>×</b></span></div>
      <div class="dialog-body"><span class="dicon">${icon}</span><p>${text}</p></div>
      <div class="dialog-btns"><button class="btn bevel-out" data-action="restart">Новый забег</button></div>
    </div>`;
  }

  flashModule(id: string): void {
    const el = document.querySelector(`.module[data-id="${id}"]`);
    if (!el) return;
    el.classList.remove('fired');
    void (el as HTMLElement).offsetWidth;
    el.classList.add('fired');
  }
}
