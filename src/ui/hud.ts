import type { Game, TurnResult } from '../core/game';
import { CONFIG } from '../config';

const $ = (id: string) => document.getElementById(id)!;
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const pad = (n: number, len: number) => String(Math.max(0, Math.min(n, 10 ** len - 1))).padStart(len, '0');

function clicksRemainingText(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 19) return `осталось ${n} кликов`;
  if (mod10 === 1) return `остался ${n} клик`;
  if (mod10 >= 2 && mod10 <= 4) return `осталось ${n} клика`;
  return `осталось ${n} кликов`;
}

/** DOM HUD in classic Minesweeper window chrome. */
export class Hud {
  private displayedScore = 0;
  private clearedPopupDismissed = false;

  constructor(
    private game: Game,
    private actions: {
      smiley(): void;
      advance(): void;
      restart(): void;
      onUseConsumable(idx: number): void;
    },
  ) {
    $('smiley').addEventListener('click', () => this.actions.smiley());
    $('overlay').addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('[data-action="restart"]')) this.actions.restart();
      if (target.closest('[data-action="advance"]')) this.actions.advance();
      if (target.closest('[data-action="dismiss-cleared"]')) {
        this.clearedPopupDismissed = true;
        this.render();
      }
    });

    $('consumables').addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('[data-con-idx]') as HTMLElement | null;
      if (!btn) return;
      const idx = Number(btn.dataset.conIdx);
      this.actions.onUseConsumable(idx);
    });

    $('btn-advance')?.addEventListener('click', () => this.actions.advance());

    requestAnimationFrame(this.tick);
  }

  setGame(game: Game): void {
    this.game = game;
    this.displayedScore = 0;
    this.clearedPopupDismissed = false;
    const feed = $('bonus-feed');
    if (feed) feed.innerHTML = '';
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

    if (!g.cleared) {
      this.clearedPopupDismissed = false;
    }

    // View toggle between game and shop
    const isShop = g.status === 'shop';
    $('game-view').hidden = isShop;
    $('shop-view').hidden = !isShop;

    $('lcd-clicks').textContent = pad(g.clicks, 3);
    $('lcd-clicks').classList.toggle('low', g.clicks <= 3);
    $('lcd-clicks').title = clicksRemainingText(g.clicks);
    $('lcd-score').textContent = pad(this.displayedScore, 6);

    const smiley = $('smiley');
    smiley.dataset.state = g.status === 'lost' ? 'dead' : g.cleared ? 'cool' : 'normal';
    smiley.title = g.cleared && g.status === 'playing' ? 'Забрать награду и перейти в Магазин' : g.status === 'lost' ? 'Новый забег' : '';

    const pct = Math.min(100, (g.score / g.target) * 100);
    $('target-fill').style.width = `${pct}%`;

    const overchargeLvl = Math.max(0, Math.floor((g.score - g.target) / (g.target * CONFIG.overchargeBitStep)));
    const nextOverchargePct = 100 + (overchargeLvl + 1) * Math.round(CONFIG.overchargeBitStep * 100);
    const bitsReward = CONFIG.bitsPerWin + g.clicks * CONFIG.bitsPerClickLeft + overchargeLvl;

    if (g.cleared) {
      const currentPct = Math.round((g.score / g.target) * 100);
      $('target-text').textContent = overchargeLvl > 0
        ? `⚡ OVERCHARGE ${currentPct}% [УР.${overchargeLvl}: +${overchargeLvl} BITS] · СЛЕДУЮЩИЙ: ${nextOverchargePct}%`
        : `⚡ OVERCHARGE ${currentPct}% · СЛЕДУЮЩИЙ BIT НА ${nextOverchargePct}%`;
    } else {
      $('target-text').textContent = `ЦЕЛЬ: ${g.score} / ${g.target} (${Math.round((g.score / g.target) * 100)}%)`;
    }

    const btnAdvance = $('btn-advance');
    if (btnAdvance) {
      btnAdvance.hidden = !g.cleared || g.status !== 'playing';
      const advBits = $('advance-bits');
      if (advBits) advBits.textContent = `+${bitsReward}`;
    }

    document.body.classList.toggle('cleared', g.cleared);

    $('turn').innerHTML = this.turnHtml(g.lastTurn);
    $('hull').innerHTML = Array.from({ length: g.maxHull }, (_, i) => `<i class="${i < g.hull ? 'on' : ''}"></i>`).join('');
    $('combo').textContent = `${g.combo}  (+${fmt(g.combo * CONFIG.comboMultStep)})`;
    $('bits').textContent = String(g.bits);

    // Consumables list in side panel
    $('consumables').innerHTML = Array.from({ length: CONFIG.consumableSlots }, (_, i) => {
      const c = g.consumables[i];
      if (!c) return `<div class="con-slot empty">пусто</div>`;
      const isPrimed = g.activeConsumableIdx === i;
      const charges = c.charges ?? 1;
      const maxCharges = c.maxCharges ?? 1;
      return `
        <button class="con-slot bevel-out ${isPrimed ? 'primed' : ''}" data-con-idx="${i}" title="${c.description}">
          <div class="con-name">${c.name}</div>
          ${maxCharges > 1 ? `
          <div class="con-charges-row">
            <div class="con-pips">
              ${Array.from({ length: maxCharges }, (_, pi) => `<i class="pip ${pi < charges ? 'on' : 'off'}"></i>`).join('')}
            </div>
            <span class="con-charges-val">${charges}/${maxCharges}</span>
          </div>` : ''}
          <small class="con-state">${isPrimed ? '⚡ КЛИКНИТЕ КЛЕТКУ' : c.targetType === 'cell' ? '🎯 ПРИЦЕЛ' : '⚡ АКТИВИРОВАТЬ'}</small>
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

    if (isShop) {
      $('status-hint').textContent = '🛒 Торговый пост: покупайте Флаги-Слоты 🎰 за Bits · Нажмите «В БОЙ ▶» для старта';
    } else if (g.activeConsumableIdx !== undefined) {
      const con = g.consumables[g.activeConsumableIdx];
      const leftStr = con?.charges !== undefined ? ` (${con.charges} в запасе)` : '';
      $('status-hint').textContent = `🎯 [РЕЖИМ ПРИЦЕЛА]: Кликните ЛКМ/ПКМ по закрытой клетке для установки «${con?.name}»${leftStr}`;
    } else if (g.cleared && g.status === 'playing') {
      $('status-hint').textContent = '😎 Цель выполнена! Нажмите «ПРОДОЛЖИТЬ» для перехода в магазин или набивайте Overcharge';
    } else {
      $('status-hint').textContent = 'ЛКМ — скан · ПКМ — флаг · 🎰 Соберите 3 флага-слота для джекпота!';
    }

    this.renderOverlay();
  }

  private turnHtml(t?: TurnResult): string {
    if (!t) return `<div class="muted">Ожидание сканирования…</div>`;
    const x = t.xMult !== 1 ? ` <span class="x">×${fmt(t.xMult)}</span>` : '';
    return `<div class="${t.exploded ? 'boom' : ''}">
      <div class="turn-calc">
        <span class="chip data">${t.data}</span>
        <span class="op">×</span>
        <span class="chip mult" id="mult-chip">${fmt(t.mult)}</span>${x}
        <span class="sum">= +${t.score}</span>
      </div>
      <small>${t.cells} кл.${t.exploded ? ' · ПОДРЫВ' : ''}</small>
    </div>`;
  }

  /** Display juicy frameless glowing bonus text floating in the sidebar bonus feed */
  showBonus(callouts: string[], isExploded: boolean): void {
    const feed = $('bonus-feed');
    if (!feed) return;

    // Pulse multiplier badge on bonus addition
    const multChip = $('mult-chip');
    if (multChip && !isExploded) {
      multChip.classList.remove('bump');
      void multChip.offsetWidth;
      multChip.classList.add('bump');
    }

    // Pulse combo badge in Systems panel
    const comboEl = $('combo');
    if (comboEl) {
      comboEl.classList.remove('combo-bump', 'combo-break');
      void comboEl.offsetWidth;
      comboEl.classList.add(isExploded ? 'combo-break' : 'combo-bump');
    }

    callouts.forEach((text, i) => {
      setTimeout(() => {
        while (feed.children.length >= 3) {
          feed.firstElementChild?.remove();
        }

        const el = document.createElement('div');
        let cls = 'bonus-item';
        if (text.includes('СБИТА')) cls += ' broken';
        else if (text.includes('⚡')) cls += ' super';
        else if (text.includes('🔥')) cls += ' hot';
        else if (text.includes('В РЯД')) cls += ' streak';
        else if (text.includes('КАСКАД')) cls += ' cascade';
        else cls += ' module';

        el.className = cls;
        el.textContent = text;
        feed.appendChild(el);

        el.addEventListener('animationend', () => el.remove());
      }, i * 90);
    });
  }

  private renderOverlay(): void {
    const g = this.game;
    const el = $('overlay');

    if (g.status === 'lost') {
      el.hidden = false;
      let reasonText = 'Сектор не зачищен';
      let reasonSub = '';
      if (g.lossReason === 'clicks') {
        reasonText = 'Кончились клики';
        reasonSub = 'Закончились все доступные клики (осталось 0 кликов)';
      } else if (g.lossReason === 'hull') {
        reasonText = 'Кончились жизни (HP)';
        reasonSub = 'Подрыв на мине (0 HP)';
      } else if (g.lossReason === 'cashout') {
        reasonText = 'Авария детонатора';
        reasonSub = 'Ложный флаг вызвал детонацию (0 HP)';
      }

      el.innerHTML = `<div class="window dialog">
        <div class="titlebar"><span class="title">Сигнал потерян</span><span class="tbtns"><b>×</b></span></div>
        <div class="dialog-body">
          <span class="dicon">⚠</span>
          <div class="dialog-content">
            <div class="loss-reason-badge">ПРИЧИНА ПОРАЖЕНИЯ:</div>
            <div class="loss-reason-main">${reasonText}</div>
            <div class="loss-reason-sub">${reasonSub}</div>
            <div class="loss-stats">Сектор ${g.sector} · Счёт: ${g.score} / ${g.target}</div>
          </div>
        </div>
        <div class="dialog-btns"><button class="btn bevel-out" data-action="restart">Начать с начала</button></div>
      </div>`;
      return;
    }

    if (g.status === 'victory') {
      el.hidden = false;
      el.innerHTML = `<div class="window dialog">
        <div class="titlebar"><span class="title">Миссия выполнена</span><span class="tbtns"><b>×</b></span></div>
        <div class="dialog-body">
          <span class="dicon">👑</span>
          <div class="dialog-content">
            <div class="win-title">ВСЕ СЕКТОРЫ ЗАЧИЩЕНЫ!</div>
            <p>Вы прошли все глубины. Накоплено Bits: <b>${g.bits}</b></p>
          </div>
        </div>
        <div class="dialog-btns"><button class="btn bevel-out" data-action="restart">Начать с начала</button></div>
      </div>`;
      return;
    }

    if (g.cleared && !this.clearedPopupDismissed && g.status === 'playing') {
      el.hidden = false;
      const overchargeLvl = Math.max(0, Math.floor((g.score - g.target) / (g.target * CONFIG.overchargeBitStep)));
      const bitsReward = CONFIG.bitsPerWin + g.clicks * CONFIG.bitsPerClickLeft + overchargeLvl;

      el.innerHTML = `<div class="window dialog cleared-dialog">
        <div class="titlebar">
          <span class="title">Сектор зачищен — Задание выполнено!</span>
          <span class="tbtns"><b data-action="dismiss-cleared" title="Допройти поле">×</b></span>
        </div>
        <div class="dialog-body">
          <span class="dicon">🎉</span>
          <div class="dialog-content">
            <div class="cleared-header">СЕКТОР ${g.sector} ЗАЧИЩЕН!</div>
            <div class="cleared-sub">Норма очков успешно набрана.</div>
            <div class="stats-box bevel-in">
              <div class="stat-row">
                <span>Сектор:</span>
                <b>${g.sector}/${CONFIG.sectors} (${g.stageName})</b>
              </div>
              <div class="stat-row">
                <span>Счёт:</span>
                <b class="highlight-score">${g.score} / ${g.target}</b>
              </div>
              <div class="stat-row">
                <span>Клики:</span>
                <b class="highlight-clicks">${clicksRemainingText(g.clicks)}</b>
              </div>
              <div class="stat-row">
                <span>Награда:</span>
                <b class="highlight-bits">+${bitsReward} Bits</b>
              </div>
              ${overchargeLvl > 0 ? `
              <div class="stat-row">
                <span>Overcharge:</span>
                <b class="highlight-overcharge">Ур. ${overchargeLvl} (+${overchargeLvl} Bits)</b>
              </div>` : ''}
            </div>
            <div class="cleared-prompt">
              Перейдите в магазин за покупками или продолжите исследовать поле для фарма Overcharge.
            </div>
          </div>
        </div>
        <div class="dialog-btns cleared-btns">
          <button class="btn btn-primary bevel-out" data-action="advance">Продолжить ▶</button>
          <button class="btn bevel-out" data-action="dismiss-cleared">Допройти поле ⛏</button>
        </div>
      </div>`;
      return;
    }

    el.hidden = true;
  }

  flashModule(id: string): void {
    const el = document.querySelector(`.module[data-id="${id}"]`);
    if (!el) return;
    el.classList.remove('fired');
    void (el as HTMLElement).offsetWidth;
    el.classList.add('fired');
  }
}
