import { Game } from './core/game';
import type { Cell } from './core/board';
import { getModule } from './modules/registry';
import { BoardView } from './render/boardView';
import { Hud } from './ui/hud';
import { ShopView } from './ui/shopView';
import { MapView } from './ui/mapView';
import { Fx } from './ui/fx';
import { Sfx } from './audio/sfx';

/** Starter loadout: empty so the game starts vanilla without overwhelming the player. */
const STARTER: string[] = [];

const boardEl = document.getElementById('board')!;
const headerEl = (document.querySelector('.header') || boardEl) as HTMLElement;
const sfx = new Sfx();
const fx = new Fx();
let game = new Game(STARTER.map(getModule));

const view = new BoardView(boardEl, (x, y, action) => {
  if (action === 'flag') {
    game.toggleFlag(x, y);
    checkSlotAutoRoll();
  } else {
    game.click(x, y);
    checkSlotAutoRoll();
  }
});

const shopView = new ShopView(game, {
  onStartStage: () => {
    game.nextStage();
    sfx.relay();
    hud.render();
    mapView.render();
  },
  onBuy: () => {
    sfx.click();
  },
  onReroll: () => {
    sfx.relay();
  },
});

const mapView = new MapView(game, {
  onSelectBattle: (node) => {
    sfx.click();
    view.build(game.board);
    hud.render();
    mapView.render();
    fx.banner(headerEl, `${node.name.toUpperCase()}\nЦЕЛЬ: ${game.target}`, node.type === 'boss' ? 'rainbow' : 'bits');
  },
  onOpenShop: () => {
    sfx.relay();
    hud.render();
    shopView.render();
  },
  onPlaySfx: (type) => {
    if (type === 'fanfare') sfx.jackpotFanfare();
    else if (type === 'relay') sfx.relay();
    else sfx.click();
  },
});

const SAVE_KEY = 'minesweeper_pro_save';

const saveProgress = () => {
  try {
    const saveData = {
      stage: game.stage,
      score: game.score,
      target: game.target,
      clicks: game.clicks,
      hull: game.hull,
      bits: game.bits,
      combo: game.combo,
      roundMult: game.roundMult,
      modules: game.modules.map((m) => m.id),
      consumables: game.consumables.map((c) => c.id),
      savedAt: Date.now(),
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(saveData));
    sfx.relay();
    fx.banner(headerEl, '💾 ПРОГРЕСС СОХРАНЁН!', 'bits');
    hud.showBonus(['💾 ПРОГРЕСС СОХРАНЁН', 'В ЛОКАЛЬНОЕ ХРАНИЛИЩЕ'], false);
  } catch (err) {
    console.error('Save failed', err);
  }
};

const restart = () => {
  localStorage.removeItem(SAVE_KEY);
  fx.clear();
  game = new Game(STARTER.map(getModule));
  wire(game);
  hud.setGame(game);
  shopView.setGame(game);
  mapView.setGame(game);
  view.build(game.board);
  hud.render();
  shopView.render();
  mapView.render();
  sfx.click();
  hud.log('── Начат новый забег ──', 'sep');
  fx.banner(headerEl, 'НОВЫЙ ЗАБЕГ\nС НАЧАЛА', 'rainbow');
};

document.getElementById('btn-menu-save')?.addEventListener('click', saveProgress);
document.getElementById('btn-menu-restart')?.addEventListener('click', () => {
  if (confirm('Начать забег с самого начала? Текущий прогресс будет сброшен.')) {
    restart();
  }
});

let isSlotRolling = false;

function buildBoardBorderLights(): HTMLElement[] {
  const container = document.getElementById('board-lights');
  if (!container) return [];
  container.innerHTML = '';
  const lamps: HTMLElement[] = [];
  const perSide = 8;
  const total = perSide * 4; // 32 lamps encircling the entire board perimeter

  for (let i = 0; i < total; i++) {
    const lamp = document.createElement('div');
    lamp.className = `chase-lamp ${i % 2 === 0 ? '' : 'alt'} off`;

    let xCss = '';
    let yCss = '';
    if (i < perSide) {
      // Top Edge: Left to Right
      const pct = ((i + 0.5) / perSide) * 100;
      xCss = `${pct.toFixed(2)}%`;
      yCss = '7px';
    } else if (i < perSide * 2) {
      // Right Edge: Top to Bottom
      const idx = i - perSide;
      const pct = ((idx + 0.5) / perSide) * 100;
      xCss = 'calc(100% - 7px)';
      yCss = `${pct.toFixed(2)}%`;
    } else if (i < perSide * 3) {
      // Bottom Edge: Right to Left
      const idx = i - perSide * 2;
      const pct = ((perSide - 1 - idx + 0.5) / perSide) * 100;
      xCss = `${pct.toFixed(2)}%`;
      yCss = 'calc(100% - 7px)';
    } else {
      // Left Edge: Bottom to Top
      const idx = i - perSide * 3;
      const pct = ((perSide - 1 - idx + 0.5) / perSide) * 100;
      xCss = '7px';
      yCss = `${pct.toFixed(2)}%`;
    }

    lamp.style.left = xCss;
    lamp.style.top = yCss;
    container.appendChild(lamp);
    lamps.push(lamp);
  }
  return lamps;
}

interface SlotReelController {
  widget: HTMLElement;
  cabinet: HTMLElement;
  viewport: HTMLElement;
  strip: HTMLElement;
  cell: Cell;
  itemH: number;
}

const REEL_SYMBOLS = ['🍒', '💣', '7️⃣', '💎', '🔔', '🍀', '🍋', '⭐'];

function mountSlotReels(slots: Cell[]): { controllers: SlotReelController[]; layer: HTMLElement } {
  let layer = document.getElementById('slot-reels') as HTMLElement | null;
  if (!layer) {
    layer = document.createElement('div');
    layer.id = 'slot-reels';
    layer.className = 'slot-reels-layer';
    boardEl.appendChild(layer);
  }
  layer.innerHTML = '';

  const p0 = view.cellToScreen(0, 0);
  const p1 = view.cellToScreen(1, 0);
  const cellSize = Math.max(38, Math.round(Math.abs(p1.x - p0.x)));
  const itemH = Math.round(cellSize * 0.72);

  const controllers: SlotReelController[] = [];

  slots.forEach((cell, idx) => {
    const pos = view.cellToScreen(cell.x, cell.y);
    const widget = document.createElement('div');
    widget.className = 'slot-reel-widget';
    widget.style.left = `${pos.x}px`;
    widget.style.top = `${pos.y}px`;
    widget.style.width = `${cellSize}px`;
    widget.style.height = `${cellSize}px`;

    const cabinet = document.createElement('div');
    cabinet.className = 'slot-reel-cabinet';

    const header = document.createElement('div');
    header.className = 'slot-marquee-header';
    header.textContent = `777 [${idx + 1}]`;

    const viewport = document.createElement('div');
    viewport.className = 'slot-reel-viewport';

    const glare = document.createElement('div');
    glare.className = 'slot-glass-glare';

    const strip = document.createElement('div');
    strip.className = 'slot-reel-strip spinning';

    // Repeating symbols loop for seamless vertical scroll animation
    const fullLoop = [...REEL_SYMBOLS, ...REEL_SYMBOLS];
    fullLoop.forEach((sym) => {
      const item = document.createElement('div');
      item.className = 'slot-reel-item';
      item.style.height = `${itemH}px`;
      item.style.fontSize = `${Math.round(itemH * 0.62)}px`;
      item.textContent = sym;
      strip.appendChild(item);
    });

    viewport.appendChild(glare);
    viewport.appendChild(strip);
    cabinet.appendChild(header);
    cabinet.appendChild(viewport);
    widget.appendChild(cabinet);
    layer.appendChild(widget);

    controllers.push({ widget, cabinet, viewport, strip, cell, itemH });
  });

  return { controllers, layer };
}

function stopSlotReel(controller: SlotReelController, reelIndex: number): Promise<boolean> {
  return new Promise((resolve) => {
    const { cabinet, strip, cell, itemH } = controller;

    // Build the landing sequence: 6 passing spinning symbols followed by the ACTUAL cell content
    const passing = [
      REEL_SYMBOLS[Math.floor(Math.random() * REEL_SYMBOLS.length)],
      REEL_SYMBOLS[Math.floor(Math.random() * REEL_SYMBOLS.length)],
      REEL_SYMBOLS[Math.floor(Math.random() * REEL_SYMBOLS.length)],
      REEL_SYMBOLS[Math.floor(Math.random() * REEL_SYMBOLS.length)],
      REEL_SYMBOLS[Math.floor(Math.random() * REEL_SYMBOLS.length)],
      REEL_SYMBOLS[Math.floor(Math.random() * REEL_SYMBOLS.length)],
    ];

    strip.innerHTML = '';
    passing.forEach((sym) => {
      const item = document.createElement('div');
      item.className = 'slot-reel-item';
      item.style.height = `${itemH}px`;
      item.style.fontSize = `${Math.round(itemH * 0.62)}px`;
      item.textContent = sym;
      strip.appendChild(item);
    });

    // The true target symbol item
    const targetItem = document.createElement('div');
    targetItem.className = 'slot-reel-item final-symbol';
    targetItem.style.height = `${itemH}px`;
    targetItem.style.fontSize = `${Math.round(itemH * 0.62)}px`;

    if (cell.mine) {
      targetItem.innerHTML = `<span class="bomb-icon">💣</span>`;
    } else {
      if (cell.adjacent > 0) {
        targetItem.innerHTML = `<span class="digit-${cell.adjacent}">${cell.adjacent}</span>`;
      } else {
        targetItem.innerHTML = `<span class="digit-empty">·</span>`;
      }
    }
    strip.appendChild(targetItem);

    // Stop continuous loop and trigger smooth, authentic mechanical deceleration
    strip.classList.remove('spinning');
    strip.style.transform = 'translateY(0px)';
    void strip.offsetHeight; // force reflow

    const targetOffset = passing.length * itemH;
    // Decelerates over 850ms with elastic snap on lock
    strip.style.transition = 'transform 0.85s cubic-bezier(0.16, 0.95, 0.28, 1.15)';
    strip.style.transform = `translateY(-${targetOffset}px)`;

    setTimeout(() => {
      sfx.slotReelStop(reelIndex);
      view.kick(0.2);

      if (cell.mine) {
        cabinet.classList.add('confirmed');
        sfx.flagConfirmed(reelIndex);
        const p = cellScreen(cell.x, cell.y);
        fx.burst(p.x, p.y, `<span class="score-main" style="color:#00ff88;font-size:20px;">⚡ МИНА [7]!</span>`, 'score');
        resolve(true);
      } else {
        cabinet.classList.add('bust');
        sfx.buzzer();
        const p = cellScreen(cell.x, cell.y);
        fx.burst(p.x, p.y, `<span class="hurt-main" style="font-size:18px;">⚠️ МИМО!</span>`, 'hurt');
        resolve(false);
      }
    }, 850);
  });
}

const runSlotJackpotRoll = async () => {
  if (isSlotRolling || game.status !== 'playing') return;
  const slots = game.getSlotFlags();
  if (slots.length < 3) return;

  isSlotRolling = true;
  game.isSlotRolling = true;
  view.locked = true;

  // Ensure mines are fully generated before spinning
  if (!game.board.generated) {
    const safe = game.board.cells.find((c) => !c.slotFlag && !c.flagged) || slots[0];
    game.board.generate(safe);
  }

  const lightsContainer = document.getElementById('board-lights');
  const lamps = buildBoardBorderLights();
  if (lightsContainer) {
    lightsContainer.className = 'board-lights active';
  }

  // Mount the 3 spinning slot-machine reels on top of the slot cells
  const { controllers, layer: reelsLayer } = mountSlotReels(slots);

  // Phase 1: Arcade contour lights chasing & reels spinning sound
  let chaseTick = 0;
  const chaseInterval = setInterval(() => {
    chaseTick++;
    sfx.slotReelSpin(chaseTick);
    lamps.forEach((l, idx) => {
      const active = (idx + chaseTick) % 4 === 0;
      l.classList.toggle('off', !active);
    });
  }, 90);

  // Spin for 1.4s before the first reel begins decelerating
  await new Promise((r) => setTimeout(r, 1400));

  // Phase 2: Sequential deceleration and reveal of ALL 3 reels (Reel 1 → Reel 2 → Reel 3)
  // Even if a reel fails, all 3 reels ALWAYS complete and reveal what is behind them!
  for (let i = 0; i < 3; i++) {
    const controller = controllers[i];
    await stopSlotReel(controller, i);
    // Pause 600ms between reel stops so the player can see each outcome clearly
    await new Promise((r) => setTimeout(r, 600));
  }

  clearInterval(chaseInterval);
  lamps.forEach((l) => l.classList.add('off'));

  // Phase 3: Evaluate result of all 3 reels
  const result = game.resolveSlotRoll(slots);

  if (result.jackpot) {
    // 3 MINES CONFIRMED: 777 JACKPOT!
    controllers.forEach((ctrl) => ctrl.cabinet.classList.add('jackpot'));
    sfx.jackpotFanfare();
    view.kick(0.45);
    if (lightsContainer) lightsContainer.className = 'board-lights jackpot';

    fx.banner(
      headerEl,
      `🎰 7-7-7 ДЖЕКПОТ!\n+$${result.bits} · +${result.score} PTS`,
      'rainbow slot-result',
    );
    hud.showBonus([
      `🎰 7-7-7 ДЖЕКПОТ! (+${result.score} PTS)`,
      `💎 +$${result.bits} ЗА 3 ОБЕЗВРЕЖЕННЫХ МИНЫ!`,
    ], false);
    hud.render();

    // Keep on screen for 3.4 seconds so the player can fully enjoy the win & read the stats
    setTimeout(() => {
      reelsLayer.remove();
      view.build(game.board);
      view.locked = false;
      isSlotRolling = false;
      game.isSlotRolling = false;
      if (lightsContainer) lightsContainer.className = 'board-lights';
    }, 3400);
  } else {
    // BUST: Not all 3 were mines
    sfx.boom();
    view.kick(0.65);
    if (lightsContainer) lightsContainer.className = 'board-lights bust';

    const hitText = result.minesHit > 0
      ? `💥 СБОЙ СЛОТА: ${result.minesHit} ИЗ 3 МИН\n-1 HP · ${result.minesHit === 1 ? '1 МИНА' : '2 МИНЫ'} ПОМЕЧЕНЫ ФЛАГОМ`
      : `💥 СБОЙ СЛОТА: 0 ИЗ 3 МИН\n-1 HP · СЕРИЯ СБИТА`;

    fx.banner(headerEl, hitText, 'hurt slot-result bust');
    hud.showBonus([
      result.minesHit > 0 ? `⚠️ УГАДАНО ${result.minesHit} ИЗ 3 МИН` : `💥 0 ИЗ 3 МИН`,
      `💥 -1 HP · СЕРИЯ СБИТА`,
    ], true);
    hud.render();

    // Keep on screen for 3.2 seconds so the text and final reel positions are clearly understood
    setTimeout(() => {
      reelsLayer.remove();
      view.sync();
      view.locked = false;
      isSlotRolling = false;
      game.isSlotRolling = false;
      if (lightsContainer) lightsContainer.className = 'board-lights';
    }, 3200);
  }
};

const hud = new Hud(game, {
  smiley: () => {
    if (game.status === 'lost' || game.status === 'victory') restart();
    else if (game.cleared && game.status === 'playing') hud.showClearedPopup();
  },
  advance: () => {
    game.advance();
  },
  restart,
  onUseConsumable: (idx) => {
    const success = game.useConsumable(idx);
    if (success) {
      sfx.click();
      checkSlotAutoRoll();
    } else {
      sfx.click();
    }
  },
});

function checkSlotAutoRoll() {
  if (game.getSlotFlags().length >= 3) {
    void runSlotJackpotRoll();
  }
}

function cellScreen(x: number, y: number) {
  const r = boardEl.getBoundingClientRect();
  const p = view.cellToScreen(x, y);
  return { x: r.left + p.x, y: r.top + p.y };
}

function wire(g: Game) {
  g.on((e) => {
    if (g !== game) return;
    switch (e.type) {
      case 'newBoard':
        view.build(g.board);
        hud.log(`── ${g.stageName} · цель ${g.target} ──`, 'sep');
        break;
      case 'turn': {
        const t = e.result;
        const p = cellScreen(t.origin.x, t.origin.y);

        if (t.exploded) {
          sfx.boom();
          view.kick();
          if (t.comboBroken) sfx.breakCombo();
          fx.burst(p.x, p.y, `<span class="hurt-main">💥 -1 HP</span><small style="color:#ff6666;font-weight:bold;">СЕРИЯ СБИТА</small>`, 'hurt');
        }
        if (t.score > 0) {
          const big = t.score >= g.target * 0.25;
          const lcdScoreEl = document.getElementById('lcd-score');
          fx.burst(
            p.x,
            p.y,
            `<span class="score-main">+${t.score}</span><small>${t.data} × ${t.mult.toFixed(1)}</small>`,
            big ? 'score big' : 'score',
            lcdScoreEl,
          );
        }

        // Trigger vivid frameless bonus animations in sidebar next to bonus badges
        if (t.callouts && t.callouts.length > 0) {
          hud.showBonus(t.callouts, t.exploded);
          const daredevilCallout = t.callouts.find((c) => c.includes('ОТВАГА И СЛАБОУМИЕ'));
          if (daredevilCallout) {
            sfx.jackpotFanfare();
            if (daredevilCallout.includes('ВКЛЮЧЕНО')) {
              fx.banner(headerEl, '🤩 «ОТВАГА И СЛАБОУМИЕ»!\n×10 МНОЖИТЕЛЬ АКТИВЕН', 'rainbow');
            }
          }
          const speedCallout = t.callouts.find((c) => c.includes('НЕ УСЛЕДИТЬ'));
          if (speedCallout) {
            if (speedCallout.includes('ВКЛЮЧЕНО')) {
              sfx.cascade(8);
              fx.banner(headerEl, '🚀 «НЕ УСЛЕДИТЬ»!\n×3 СКОРОСТНОЙ БОНУС!', 'rainbow');
            } else {
              sfx.cascade(4);
            }
          }
        }
        if (t.score > 0) {
          const multDetails = t.xMult !== 1 ? `${t.mult.toFixed(2)} × ${t.xMult}` : `${t.mult.toFixed(2)}`;
          hud.log(`<b>+${t.score}</b> <span class="log-detail">(${t.data} данн. × ${multDetails} · ${t.cells} кл.)</span>`, 'score');
        } else if (t.exploded) {
          hud.log(`💥 <b>Подрыв на мине:</b> -1 HP · комбо сброшено (осталось HP: ${g.hull})`, 'broken');
        }
        if (t.comboStreak >= 2) {
          sfx.combo(t.comboStreak);
        } else if (t.cells > 1) {
          sfx.cascade(t.cells);
        } else if (t.cells === 1 && !t.exploded) {
          sfx.click();
        }
        break;
      }
      case 'cleared':
        fx.banner(headerEl, 'ЦЕЛЬ ВЫПОЛНЕНА!\nСЕКТОР ПРОЙДЕН', 'rainbow');
        sfx.jackpotFanfare();
        hud.showBonus(['🎉 ЦЕЛЬ ВЫПОЛНЕНА!', '🏁 ПРОДОЛЖИТЬ ИЛИ НАБИВАТЬ OVERCHARGE!'], false);
        hud.log(`🏆 <b>Сектор пройден!</b> Цель (${g.target}) выполнена`, 'money');
        break;
      case 'overchargeUp':
        fx.banner(headerEl, `⚡ OVERCHARGE УР. ${e.level}!\n+$1 БОНУС`, 'bits');
        sfx.cascade(8);
        hud.showBonus([`⚡ OVERCHARGE УР. ${e.level}!`, `+$1 БОНУС ДЛЯ МАГАЗИНА`], false);
        hud.log(`⚡ <b>Overcharge Ур. ${e.level}:</b> +$1 к награде`, 'super');
        break;
      case 'fullClear':
        fx.banner(headerEl, `🏆 ПОЛНАЯ ЗАЧИСТКА!\n+$${e.bonusBits} БОНУС · +${e.bonusScore} PTS`, 'rainbow');
        sfx.jackpotFanfare();
        hud.showBonus(['🏆 ПОЛНАЯ ЗАЧИСТКА СЕКТОРА!', `+$${e.bonusBits} BITS · +${e.bonusScore} PTS`], false);
        hud.log(`🏆 <b>Полная зачистка поля:</b> открыты все клетки и помечены все мины! Награда +$${e.bonusBits} Bits (+${e.bonusScore} PTS)`, 'super');
        hud.showClearedPopup();
        break;
      case 'blindClear':
        fx.banner(headerEl, `🕶️ ЗАЧИСТКА ВСЛЕПУЮ!\n+$${e.bonusBits} БОНУС · +${e.bonusScore} PTS`, 'rainbow');
        sfx.jackpotFanfare();
        hud.showBonus(['🕶️ ЗАЧИСТКА ВСЛЕПУЮ!', `+$${e.bonusBits} BITS · +${e.bonusScore} PTS`], false);
        hud.log(`🕶️ <b>Зачистка вслепую:</b> все мины найдены в тумане войны! Награда +$${e.bonusBits} Bits (+${e.bonusScore} PTS)`, 'super');
        hud.showClearedPopup();
        break;
      case 'cheaterCaught':
        fx.banner(headerEl, `🕵️ ЖУЛИК ПОЙМАН!\nШТРАФ -${e.penalty} PTS`, 'hurt');
        sfx.boom();
        hud.showBonus(['🕵️ МЕТКА «ЖУЛИК»!', `-${e.penalty} PTS · ДЕБАФ «ПОЛОВИНА ФЛАГОВ»`], true);
        hud.log(`🕵️ <b>Жулик пойман:</b> попытка наугад накликать победу флагами! Штраф: -${e.penalty} очков. Дебаф «Половина флагов» на след. уровень`, 'broken');
        hud.showClearedPopup();
        break;
      case 'flagLimit':
        fx.banner(headerEl, `⚠️ ЛИМИТ ФЛАГОВ!\nМАКСИМУМ: ${g.maxFlags}`, 'hurt');
        sfx.boom();
        hud.showBonus(['⚠️ ЛИМИТ ФЛАГОВ!', `ДЕБАФ: ТОЛЬКО ${g.maxFlags} ФЛАГОВ`], true);
        hud.log(`⚠️ <b>Лимит исчерпан:</b> действует дебаф «Половина флагов» (макс. ${g.maxFlags} шт.)!`, 'broken');
        break;
      case 'roundEnd':
        hud.log(`🏁 <b>Сектор закрыт:</b> ${e.summary.score}/${e.summary.target} · Награда +$${e.summary.bits}`, 'money');
        fx.banner(headerEl, `+$${e.summary.bits}<small>${e.summary.score} / ${e.summary.target}</small>`, 'bits');
        setTimeout(() => {
          if (g === game) {
            hud.render();
            if (g.status === 'map') {
              sfx.relay();
              mapView.render();
            } else if (g.status === 'shop') {
              sfx.relay();
              shopView.render();
            }
          }
        }, 1100);
        break;
      case 'moduleFired':
        hud.flashModule(e.id);
        sfx.relay();
        break;
      case 'change':
        view.sync();
        hud.render();
        if (g.status === 'map') mapView.render();
        if (g.status === 'shop') shopView.render();
        break;
    }
  });
}

wire(game);
view.build(game.board);
hud.render();
shopView.render();
mapView.render();
