import type { Game, TurnResult } from '../core/game';
import { CONFIG, calcBitsReward } from '../config';

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
  private clearedPopupOpen = false;

  constructor(
    private game: Game,
    private actions: {
      smiley(): void;
      advance(): void;
      restart(): void;
      onFairyRevive(): void;
      onUseConsumable(idx: number): void;
    },
  ) {
    $('smiley').addEventListener('click', () => this.actions.smiley());
    $('overlay').addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('[data-action="restart"]')) this.actions.restart();
      if (target.closest('[data-action="fairy-revive"]')) this.actions.onFairyRevive();
      if (target.closest('[data-action="advance"]')) {
        this.clearedPopupOpen = false;
        this.actions.advance();
      }
      if (target.closest('[data-action="dismiss-cleared"]')) {
        this.dismissClearedPopup();
      }
    });

    $('dock-fairy')?.addEventListener('click', () => {
      if (this.game.status === 'lost' && this.game.fairies > 0) {
        this.actions.onFairyRevive();
      }
    });

    $('consumables').addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('[data-con-idx]') as HTMLElement | null;
      if (!btn) return;
      const idx = Number(btn.dataset.conIdx);
      this.actions.onUseConsumable(idx);
    });

    $('btn-advance')?.addEventListener('click', () => {
      this.showClearedPopup();
    });

    requestAnimationFrame(this.tick);
  }

  showClearedPopup(): void {
    this.clearedPopupOpen = true;
    this.render();
  }

  dismissClearedPopup(): void {
    this.clearedPopupOpen = false;
    this.render();
  }

  setGame(game: Game): void {
    this.game = game;
    this.displayedScore = 0;
    this.clearedPopupOpen = false;
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

    // View toggle between game, shop, and map
    const isShop = g.status === 'shop';
    const isMap = g.status === 'map';
    if ((isShop || isMap) && !$('game-view').hidden) {
      $('fx').innerHTML = '';
    }
    $('game-view').hidden = isShop || isMap;
    $('shop-view').hidden = !isShop;
    $('map-view').hidden = !isMap;

    $('lcd-clicks').textContent = pad(g.clicks, 3);
    $('lcd-clicks').classList.toggle('low', g.clicks <= 3);
    $('lcd-clicks').title = clicksRemainingText(g.clicks);
    $('lcd-score').textContent = pad(this.displayedScore, 6);

    const smiley = $('smiley');
    if (g.status === 'lost') {
      smiley.dataset.state = 'dead';
      smiley.title = 'Новый забег';
    } else if (g.speedDemonActive && g.daredevilActive) {
      smiley.dataset.state = 'speed';
      smiley.title = '🚀🤩 КОМБО «НЕ УСЛЕДИТЬ» (×3) + «ОТВАГА И СЛАБОУМИЕ» (×10) = ×30 ОЧКОВ!';
    } else if (g.speedDemonActive) {
      smiley.dataset.state = 'speed';
      smiley.title = '🚀 РЕЖИМ «НЕ УСЛЕДИТЬ»! ×3 К ОЧКАМ ЗА СКОРОСТЬ! Не замедляйтесь!';
    } else if (g.daredevilActive) {
      smiley.dataset.state = 'daredevil';
      smiley.title = '🤩 РЕЖИМ «ОТВАГА И СЛАБОУМИЕ» АКТИВЕН! ×10 ОЧКОВ ЗА КЛИК НАУГАД!';
    } else if (g.cleared) {
      smiley.dataset.state = 'cool';
      smiley.title = 'Забрать награду и перейти к Карте';
    } else {
      smiley.dataset.state = 'normal';
      smiley.title = '';
    }

    // Toggle shimmering daredevil and boss frame on board
    const boardFrame = document.querySelector('.board-frame');
    if (boardFrame) {
      boardFrame.classList.toggle('daredevil', g.daredevilActive);
      boardFrame.classList.toggle('boss-encounter', g.currentEncounterType === 'boss');
    }

    const pct = Math.min(100, (g.score / g.target) * 100);
    $('target-fill').style.width = `${pct}%`;

    const overchargeLvl = Math.max(0, Math.floor((g.score - g.target) / (g.target * CONFIG.overchargeBitStep)));
    const nextOverchargePct = 100 + (overchargeLvl + 1) * Math.round(CONFIG.overchargeBitStep * 100);
    const bitsReward = calcBitsReward(g.clicks, overchargeLvl, g.currentEncounterType);

    if (g.cleared) {
      const currentPct = Math.round((g.score / g.target) * 100);
      $('target-text').textContent = overchargeLvl > 0
        ? `⚡ OVERCHARGE ${currentPct}% [УР.${overchargeLvl}: +$${overchargeLvl}] · СЛЕДУЮЩИЙ: ${nextOverchargePct}%`
        : `⚡ OVERCHARGE ${currentPct}% · СЛЕДУЮЩИЙ +$1 НА ${nextOverchargePct}%`;
    } else {
      $('target-text').textContent = `ЦЕЛЬ: ${g.score} / ${g.target} (${Math.round((g.score / g.target) * 100)}%)`;
    }

    const btnAdvance = $('btn-advance');
    if (btnAdvance) {
      btnAdvance.hidden = !g.cleared || g.status !== 'playing';
      const advBits = $('advance-bits');
      if (advBits) advBits.textContent = `+$${bitsReward}`;
    }

    document.body.classList.toggle('cleared', g.cleared);

    $('turn').innerHTML = this.turnHtml(g.lastTurn);
    $('hull').innerHTML = Array.from({ length: g.maxHull }, (_, i) => `<i class="${i < g.hull ? 'on' : ''}"></i>`).join('');
    const flagsEl = $('flags-status');
    if (flagsEl) {
      const flagsUsed = g.board.cells.filter((c) => c.flagged).length;
      const flagsMax = g.maxFlags ?? g.board.mineCount;
      const isLimitReached = flagsUsed >= flagsMax;
      flagsEl.textContent = `${flagsUsed}/${flagsMax}`;
      flagsEl.style.color = isLimitReached ? 'var(--col-danger, #ef4444)' : '';
      if (g.halfFlagsDebuff) {
        flagsEl.title = 'Действует дебаф «Половина флагов»';
      } else {
        flagsEl.title = 'Лимит по количеству мин на поле';
      }
    }
    const fairyEl = $('fairy-status');
    if (fairyEl) {
      fairyEl.textContent = g.fairies > 0 ? `🧚 ${g.fairies}` : '0';
      fairyEl.style.color = g.fairies > 0 ? '#00ffaa' : '';
      fairyEl.title = g.fairies > 0
        ? `Второе дыхание активно: при поражении сектор перезапустится (${g.fairies} шт.)`
        : 'Начиная со 2-го сегмента можно найти фею в банке на поле или за победу над первым боссом';
    }

    // Top header effect slot: Fairy in a Bottle
    const dockFairy = $('dock-fairy');
    const dockFairyBadge = $('dock-fairy-badge');
    if (dockFairy) {
      if (g.fairies > 0) {
        dockFairy.className = 'dock-slot bevel-out fairy-active';
        dockFairy.title = `Фея в банке (${g.fairies} шт.): Второе дыхание активно. При поражении сектор перезапустится!`;
        if (dockFairyBadge) {
          dockFairyBadge.textContent = String(g.fairies);
          dockFairyBadge.style.display = 'block';
        }
      } else {
        dockFairy.className = 'dock-slot bevel-in empty';
        dockFairy.title = 'Слот «Фея в банке» (пусто). Добывается на поле со 2-го сегмента или за победу над первым боссом!';
        if (dockFairyBadge) {
          dockFairyBadge.style.display = 'none';
        }
      }
    }

    $('combo').textContent = `${g.combo}  (+${fmt(g.combo * CONFIG.comboMultStep)})`;

    const baseMult = 1 + g.combo * CONFIG.comboMultStep + g.roundMult;
    let specialMult = 1;
    const specialTags: string[] = [];
    if (g.daredevilActive) {
      specialMult *= 10;
      specialTags.push('🤩 ×10');
    }
    if (g.speedDemonActive) {
      specialMult *= 3;
      specialTags.push('🚀 ×3');
    }
    const multStatusEl = $('mult-status');
    if (multStatusEl) {
      if (specialMult > 1) {
        multStatusEl.innerHTML = `<span class="mult-boost">×${(baseMult * specialMult).toFixed(1)}</span> <span class="mult-tag">(${specialTags.join(' · ')})</span>`;
      } else {
        multStatusEl.textContent = `×${baseMult.toFixed(2)}`;
      }
    }

    $('bits').textContent = `$${g.bits}`;

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

    const act = g.map ? g.map.act : 1;
    const sector = g.currentMapNode ? g.currentMapNode.floor + 1 : (g.stage % 8) + 1;
    $('status-stage').textContent = `${act}-${sector}/8`;

    // Only popup notifications belong in status-hint; do not overwrite active notification
    const hintEl = $('status-hint');
    if (hintEl && !hintEl.querySelector('.status-notify')) {
      hintEl.innerHTML = '';
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

  static calloutClass(text: string): string {
    if (text.includes('СБИТА') || text.includes('ПОДРЫВ')) return 'broken';
    if (text.includes('ОТВАГА')) return 'daredevil';
    if (text.includes('НЕ УСЛЕДИТЬ') || text.includes('СКОРОСТЬ')) return 'speed';
    if (text.includes('СПИЧКУ') || text.includes('$')) return 'money';
    if (text.includes('БАТАРЕЯ') || text.includes('КЛИК') || text.includes('⚡')) return 'super';
    if (text.includes('ХОРД')) return 'module';
    if (text.includes('🔥')) return 'hot';
    if (text.includes('В РЯД')) return 'streak';
    if (text.includes('КАСКАД')) return 'cascade';
    return 'module';
  }

  /** Append a row to the persistent event journal (newest on top). */
  log(html: string, cls = ''): void {
    const box = document.getElementById('event-log');
    if (!box) return;
    const row = document.createElement('div');
    row.className = `log-row ${cls}`;
    row.innerHTML = `<span class="log-msg">${html}</span>`;
    box.prepend(row);
    while (box.children.length > 80) box.lastElementChild?.remove();
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
      // Filter out step progress counters (e.g. "НАУГАД: 2/5", "СКОРОСТЬ: 1/3") from the permanent log
      if (!text.includes('НАУГАД:') && !text.includes('СКОРОСТЬ:')) {
        let logMsg = text;
        let logCls = Hud.calloutClass(text);

        if (text.includes('ОТВАГА И СЛАБОУМИЕ')) {
          logMsg = '🤩 <b>Клики наугад:</b> бонус к очкам ×10';
          logCls = 'daredevil';
        } else if (text.includes('НЕ УСЛЕДИТЬ')) {
          logMsg = '🚀 <b>Быстрые клики (&lt;1с):</b> бонус к очкам ×3';
          logCls = 'speed';
        } else if (text.includes('РАСЧЁТЛИВЫЙ КЛИК')) {
          logMsg = '😌 <b>Расчётливый ход:</b> бонус наугад завершён';
          logCls = 'neutral';
        } else if (text.includes('ЗАМЕДЛЕНИЕ')) {
          logMsg = '🐢 <b>Замедление (&ge;1с):</b> скоростной бонус завершён';
          logCls = 'neutral';
        } else if (text.includes('КАСКАД')) {
          logMsg = `🌊 <b>${text}</b>`;
          logCls = 'cascade';
        } else if (text.includes('В РЯД')) {
          logMsg = `🔥 <b>${text}</b>`;
          logCls = 'streak';
        } else if (text.includes('ХОРД')) {
          logMsg = `🧠 <b>${text}</b>`;
          logCls = 'module';
        } else if (text.includes('БАТАРЕЯ') || (text.includes('СЕРИЯ') && text.includes('КЛИК'))) {
          logMsg = `🔋 <b>${text}</b>`;
          logCls = 'super';
        } else if (text.includes('СПИЧКУ')) {
          logMsg = '🥢 <b>Вытянул длинную спичку:</b> угадал 50/50! +$3 Bits';
          logCls = 'money';
        } else if (text.includes('ПОДРЫВ')) {
          // Explode is logged once with full details from main.ts
          logMsg = '';
        }

        if (logMsg) {
          this.log(logMsg, logCls);
        }
      }

      setTimeout(() => {
        while (feed.children.length >= 3) {
          feed.firstElementChild?.remove();
        }

        const el = document.createElement('div');
        let cls = 'bonus-item';
        if (text.includes('СБИТА')) cls += ' broken';
        else if (text.includes('СПИЧКУ')) cls += ' money';
        else if (text.includes('БАТАРЕЯ') || text.includes('КЛИК')) cls += ' super';
        else if (text.includes('ХОРД')) cls += ' module';
        else if (text.includes('ОТВАГА')) cls += ' daredevil';
        else if (text.includes('НЕ УСЛЕДИТЬ') || text.includes('СКОРОСТЬ')) cls += ' speed';
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
        if (g.cleared) {
          reasonText = 'Подрыв при Overcharge';
          reasonSub = 'Жадность сгубила: подрыв на мине после выполнения секторной цели';
        } else {
          reasonText = 'Кончились жизни (HP)';
          reasonSub = 'Подрыв на мине (0 HP)';
        }
      } else if (g.lossReason === 'cashout') {
        reasonText = 'Авария детонатора';
        reasonSub = 'Ложный флаг вызвал детонацию (0 HP)';
      }

      if (g.fairies > 0) {
        const act = g.map ? g.map.act : 1;
        const sector = g.currentMapNode ? g.currentMapNode.floor + 1 : (g.stage % 8) + 1;
        el.innerHTML = `<div class="window dialog fairy-dialog">
          <div class="titlebar"><span class="title">Второе дыхание — Фея в банке</span><span class="tbtns"><b>🧚</b></span></div>
          <div class="dialog-body">
            <span class="dicon" style="font-size:36px;filter:drop-shadow(0 0 10px #00ffaa);">🧚‍♀️</span>
            <div class="dialog-content">
              <div class="win-title" style="color:#00ffaa;font-size:15px;">ФЕЯ В БАНКЕ СПАСЛА ВАС!</div>
              <p style="margin:2px 0 6px;font-size:12px;">Поражение в секторе <b>${act}-${sector}/8 (${g.stageName})</b>.</p>
              <div class="loss-reason-badge" style="color:#ff8888;">ПРИЧИНА ПОРАЖЕНИЯ:</div>
              <div class="loss-reason-sub" style="color:#ccc;">${reasonText} (${reasonSub})</div>
              <p style="margin:6px 0 2px;font-size:11px;color:#d4fcd4;line-height:1.3;">
                Фея пожертвовала собой и обратила время вспять! <b>Забег не сброшен</b> — сектор начнется заново с полным HP. Фея сгорает (осталось: <b>${g.fairies - 1}</b>).
              </p>
            </div>
          </div>
          <div class="dialog-btns">
            <button class="btn bevel-out fairy-revive-btn" data-action="fairy-revive">Перезапустить сектор (${g.fairies} 🧚) ↺</button>
          </div>
        </div>`;
        return;
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
            <p>Вы прошли все глубины. Накоплено: <b>$${g.bits}</b></p>
          </div>
        </div>
        <div class="dialog-btns"><button class="btn bevel-out" data-action="restart">Начать с начала</button></div>
      </div>`;
      return;
    }

    if (g.cleared && this.clearedPopupOpen && g.status === 'playing') {
      el.hidden = false;
      const overchargeLvl = Math.max(0, Math.floor((g.score - g.target) / (g.target * CONFIG.overchargeBitStep)));
      const bitsReward = calcBitsReward(g.clicks, overchargeLvl, g.currentEncounterType);

      const titleIcon =
        g.specialClear === 'full'
          ? '🏆'
          : g.specialClear === 'blind'
          ? '🕶️'
          : g.specialClear === 'cheater'
          ? '🕵️'
          : '🎉';

      const headerText =
        g.specialClear === 'full'
          ? 'ПОЛНАЯ ЗАЧИСТКА СЕКТОРА!'
          : g.specialClear === 'blind'
          ? 'ЗАЧИСТКА ВСЛЕПУЮ!'
          : g.specialClear === 'cheater'
          ? 'СЕКТОР ЗАКРЫТ (ЖУЛИК)'
          : `СЕКТОР ${g.sector} ЗАЧИЩЕН!`;

      el.innerHTML = `<div class="window dialog cleared-dialog">
        <div class="titlebar">
          <span class="title">Сектор зачищен — Задание выполнено!</span>
          ${g.clicks > 0 ? '<span class="tbtns"><b data-action="dismiss-cleared" title="Закрыть окно">×</b></span>' : ''}
        </div>
        <div class="dialog-body">
          <span class="dicon">${titleIcon}</span>
          <div class="dialog-content">
            <div class="cleared-header">${headerText}</div>
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
                <b class="highlight-bits">+$${bitsReward}</b>
              </div>
              ${g.specialClear === 'full' ? `
              <div class="stat-row highlight-full-clear">
                <span>Бонус «Полная зачистка»:</span>
                <b>+$10 Bits (+500 PTS)</b>
              </div>` : ''}
              ${g.specialClear === 'blind' ? `
              <div class="stat-row highlight-blind-clear">
                <span>Бонус «Зачистка вслепую»:</span>
                <b>+$12 Bits (+600 PTS)</b>
              </div>` : ''}
              ${g.specialClear === 'cheater' ? `
              <div class="stat-row highlight-cheater">
                <span>Метка «Жулик»:</span>
                <b class="text-danger">Штраф -500 очков</b>
              </div>
              <div class="stat-row highlight-cheater">
                <span>Дебаф на след. сектор:</span>
                <b class="text-danger">Половина флагов</b>
              </div>` : ''}
              ${overchargeLvl > 0 ? `
              <div class="stat-row">
                <span>Overcharge:</span>
                <b class="highlight-overcharge">Ур. ${overchargeLvl} (+$${overchargeLvl})</b>
              </div>` : ''}
              ${g.currentEncounterType === 'boss' && g.map.act === 1 ? `
              <div class="stat-row" style="background:#083824;color:#00ffaa;padding:3px 6px;border:1px solid #00ffaa;margin-top:2px;">
                <span>Трофей Босса:</span>
                <b>🧚 ФЕЯ В БАНКЕ (+1)</b>
              </div>` : ''}
            </div>
          </div>
        </div>
        <div class="dialog-btns cleared-btns">
          <button class="btn btn-primary bevel-out" data-action="advance">Дальше ▶</button>
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
