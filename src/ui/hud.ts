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
    private actions: {
      smiley(): void;
      restart(): void;
      onUseConsumable(idx: number): void;
      onPullLever(): void;
    },
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

    $('lever-handle')?.addEventListener('click', () => this.actions.onPullLever());
    $('btn-lever-slam')?.addEventListener('click', () => this.actions.onPullLever());
    $('btn-advance')?.addEventListener('click', () => this.actions.smiley());

    requestAnimationFrame(this.tick);
  }

  setGame(game: Game): void {
    this.game = game;
    this.displayedScore = 0;
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

    if (isShop) {
      $('status-hint').textContent = '🛒 Торговый пост: покупайте модули и расходники за Bits · Нажмите «В БОЙ ▶» для старта следующего этапа';
    } else if (g.activeConsumableIdx !== undefined) {
      const con = g.consumables[g.activeConsumableIdx];
      $('status-hint').textContent = `🎯 [РЕЖИМ ПРИЦЕЛА]: Выберите закрытую клетку для применения «${con?.name}» (ПКМ для отмены)`;
    } else if (g.cleared && g.status === 'playing') {
      $('status-hint').textContent = '😎 — нажмите «В МАГАЗИН» для перехода к покупкам или набивайте Overcharge дальше!';
    } else {
      $('status-hint').textContent = 'ЛКМ — скан · ПКМ/удержание — флаг · клик по цифре — аккорд';
    }

    // Cashout Lever status & readouts
    const cashout = g.getCashoutInfo();
    const leverHandle = $('lever-handle') as HTMLButtonElement | null;
    const btnSlam = $('btn-lever-slam') as HTMLButtonElement | null;
    const leverLamp = $('lever-lamp');
    const leverStatus = $('lever-status');

    if ($('lever-flags-count')) $('lever-flags-count').textContent = `${cashout.count} 🚩`;
    if ($('lever-mult-val')) $('lever-mult-val').textContent = `×${cashout.mult.toFixed(1)}`;
    if ($('lever-pot-val')) $('lever-pot-val').textContent = `+${cashout.potScore}`;

    const canPull = cashout.count > 0 && g.status === 'playing' && !g.isCashoutRolling;
    if (leverHandle) leverHandle.disabled = !canPull;
    if (btnSlam) btnSlam.disabled = !canPull;

    if (leverLamp && leverStatus) {
      if (g.isCashoutRolling) {
        leverLamp.className = 'lamp rolling';
        leverStatus.textContent = 'ПРОВЕРКА...';
      } else if (cashout.count > 0 && g.status === 'playing') {
        leverLamp.className = 'lamp armed';
        leverStatus.textContent = 'ВЗВЕДЕНО!';
      } else {
        leverLamp.className = 'lamp';
        leverStatus.textContent = 'ОЖИДАНИЕ';
      }
    }

    this.renderOverlay();
  }

  setLeverAnimation(state: 'pull' | 'jackpot' | 'bust' | 'reset'): void {
    const handle = $('lever-handle');
    const chassis = $('lever-chassis');
    const lamp = $('lever-lamp');
    const status = $('lever-status');
    if (!handle || !chassis) return;

    if (state === 'pull') {
      handle.classList.add('pulled');
      chassis.classList.add('rolling');
      if (lamp) lamp.className = 'lamp rolling';
      if (status) status.textContent = 'ПРОВЕРКА...';
    } else if (state === 'jackpot') {
      chassis.classList.remove('rolling');
      chassis.classList.add('jackpot');
      if (lamp) lamp.className = 'lamp jackpot';
      if (status) status.textContent = 'ДЖЕКПОТ!';
      setTimeout(() => {
        handle.classList.remove('pulled');
        chassis.classList.remove('jackpot');
      }, 1600);
    } else if (state === 'bust') {
      chassis.classList.remove('rolling');
      chassis.classList.add('bust');
      if (lamp) lamp.className = 'lamp bust';
      if (status) status.textContent = 'ОСЕЧКА!';
      setTimeout(() => {
        handle.classList.remove('pulled');
        chassis.classList.remove('bust');
      }, 1400);
    } else if (state === 'reset') {
      handle.classList.remove('pulled');
      chassis.classList.remove('rolling', 'jackpot', 'bust');
    }
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
    if (g.status !== 'lost' && g.status !== 'victory') return void (el.hidden = true);
    el.hidden = false;

    if (g.status === 'lost') {
      let reasonText = 'Сектор не зачищен';
      let reasonSub = '';
      if (g.lossReason === 'clicks') {
        reasonText = 'Кончились клики';
        reasonSub = 'Батарея сканера полностью разряжена (0 кликов)';
      } else if (g.lossReason === 'hull') {
        reasonText = 'Кончился корпус / жизни';
        reasonSub = 'Критический урон от подрыва мины (0 HP)';
      } else if (g.lossReason === 'cashout') {
        reasonText = 'Авария детонатора';
        reasonSub = 'Ложный флаг вызвал детонацию и разрушил корпус (0 HP)';
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
        <div class="dialog-btns"><button class="btn bevel-out" data-action="restart">Новый забег</button></div>
      </div>`;
    } else {
      el.innerHTML = `<div class="window dialog">
        <div class="titlebar"><span class="title">Миссия выполнена</span><span class="tbtns"><b>×</b></span></div>
        <div class="dialog-body">
          <span class="dicon">👑</span>
          <div class="dialog-content">
            <div class="win-title">ВСЕ СЕКТОРЫ ЗАЧИЩЕНЫ!</div>
            <p>Вы прошли все глубины. Накоплено Bits: <b>${g.bits}</b></p>
          </div>
        </div>
        <div class="dialog-btns"><button class="btn bevel-out" data-action="restart">Новый забег</button></div>
      </div>`;
    }
  }

  flashModule(id: string): void {
    const el = document.querySelector(`.module[data-id="${id}"]`);
    if (!el) return;
    el.classList.remove('fired');
    void (el as HTMLElement).offsetWidth;
    el.classList.add('fired');
  }
}
