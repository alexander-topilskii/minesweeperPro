import { Game } from './core/game';
import type { Cell } from './core/board';
import { getModule } from './modules/registry';
import { BoardView } from './render/boardView';
import { Hud } from './ui/hud';
import { ShopView } from './ui/shopView';
import { Fx } from './ui/fx';
import { Sfx } from './audio/sfx';

/** Starter loadout: empty so the game starts vanilla without overwhelming the player. */
const STARTER: string[] = [];

const boardEl = document.getElementById('board')!;
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
  },
  onBuy: () => {
    sfx.click();
  },
  onReroll: () => {
    sfx.relay();
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
    fx.banner(boardEl, '💾 ПРОГРЕСС СОХРАНЁН!', 'bits');
    hud.showBonus(['💾 ПРОГРЕСС СОХРАНЁН', 'В ЛОКАЛЬНОЕ ХРАНИЛИЩЕ'], false);
  } catch (err) {
    console.error('Save failed', err);
  }
};

const restart = () => {
  localStorage.removeItem(SAVE_KEY);
  game = new Game(STARTER.map(getModule));
  wire(game);
  hud.setGame(game);
  shopView.setGame(game);
  view.build(game.board);
  hud.render();
  shopView.render();
  sfx.click();
  fx.banner(boardEl, 'НОВЫЙ ЗАБЕГ\nС НАЧАЛА', 'rainbow');
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

function stopSlotReel(controller: SlotReelController): Promise<boolean> {
  return new Promise((resolve) => {
    const { cabinet, strip, cell, itemH } = controller;

    // Build the landing sequence: passing spinning symbols followed by the ACTUAL cell content
    const passing = [
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

    // Stop continuous loop and trigger elastic mechanical snap to the target symbol
    strip.classList.remove('spinning');
    strip.style.transform = 'translateY(0px)';
    void strip.offsetHeight; // force reflow

    const targetOffset = passing.length * itemH;
    strip.style.transition = 'transform 0.42s cubic-bezier(0.12, 0.88, 0.35, 1.25)';
    strip.style.transform = `translateY(-${targetOffset}px)`;

    setTimeout(() => {
      if (cell.mine) {
        cabinet.classList.add('confirmed');
        resolve(true);
      } else {
        cabinet.classList.add('bust');
        resolve(false);
      }
    }, 430);
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

  // Spin for 1.2s before the first reel begins stopping
  await new Promise((r) => setTimeout(r, 1200));

  // Phase 2: Sequential deceleration and snap of the 3 reels (Reel 1 → Reel 2 → Reel 3)
  let failedCell: Cell | null = null;
  for (let i = 0; i < 3; i++) {
    const controller = controllers[i];
    const c = controller.cell;

    sfx.slotReelStop(i);
    const isMine = await stopSlotReel(controller);
    view.kick(0.2);

    if (isMine) {
      // Confirmed mine under reel!
      sfx.flagConfirmed(i);
      const p = cellScreen(c.x, c.y);
      fx.burst(p.x, p.y, `<span class="score-main" style="color:#00ff88;font-size:20px;">⚡ МИНА [7]!</span>`, 'score');
      // Build tension before next reel stops
      await new Promise((r) => setTimeout(r, 450));
    } else {
      // Safe cell under slot machine -> BUST!
      failedCell = c;
      break;
    }
  }

  clearInterval(chaseInterval);
  lamps.forEach((l) => l.classList.add('off'));

  if (failedCell) {
    // BUST / EXPLOSION
    sfx.buzzer();
    view.kick(0.65);
    if (lightsContainer) lightsContainer.className = 'board-lights bust';
    const p = cellScreen(failedCell.x, failedCell.y);
    fx.burst(p.x, p.y, `<span class="hurt-main">💥 ВЗРЫВ! -1 HP</span><small style="color:#ff6666;font-weight:bold;">СЕРИЯ СБИТА</small>`, 'hurt');
    game.resolveSlotBust(failedCell);
    view.sync();
    view.locked = false;
    isSlotRolling = false;
    game.isSlotRolling = false;
    hud.showBonus([`💥 ОСЕЧКА СЛОТА! -1 HP`, `СЕРИЯ СБИТА`], true);
    hud.render();
    setTimeout(() => {
      reelsLayer.remove();
      if (lightsContainer) lightsContainer.className = 'board-lights';
    }, 1400);
  } else {
    // 3 MINES CONFIRMED: 777 JACKPOT!
    controllers.forEach((ctrl) => ctrl.cabinet.classList.add('jackpot'));
    sfx.jackpotFanfare();
    view.kick(0.45);
    if (lightsContainer) lightsContainer.className = 'board-lights jackpot';

    const result = game.resolveSlotJackpot(slots);
    view.build(game.board);
    view.locked = false;
    isSlotRolling = false;

    fx.banner(boardEl, `🎰 7-7-7 ДЖЕКПОТ!\n+${result.score} PTS · +$${result.bits}`, 'rainbow');
    hud.showBonus([
      `🎰 7-7-7 ДЖЕКПОТ! (+${result.score} PTS)`,
      `💎 +$${result.bits} ЗА 3 ОБЕЗВРЕЖЕННЫХ МИНЫ!`,
    ], false);
    hud.render();
    setTimeout(() => {
      reelsLayer.remove();
      game.isSlotRolling = false;
      if (lightsContainer) lightsContainer.className = 'board-lights';
    }, 2200);
  }
};

const hud = new Hud(game, {
  smiley: () => {
    if (game.status === 'lost' || game.status === 'victory') restart();
    else game.advance();
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
        fx.banner(boardEl, 'ЦЕЛЬ ВЫПОЛНЕНА!\nСЕКТОР ПРОЙДЕН', 'rainbow');
        sfx.jackpotFanfare();
        hud.showBonus(['🎉 ЦЕЛЬ ВЫПОЛНЕНА!', '🏁 ПРОДОЛЖИТЬ ИЛИ НАБИВАТЬ OVERCHARGE!'], false);
        break;
      case 'overchargeUp':
        fx.banner(boardEl, `⚡ OVERCHARGE УР. ${e.level}!\n+$1 БОНУС`, 'bits');
        sfx.cascade(8);
        hud.showBonus([`⚡ OVERCHARGE УР. ${e.level}!`, `+$1 БОНУС ДЛЯ МАГАЗИНА`], false);
        break;
      case 'roundEnd':
        fx.banner(boardEl, `+$${e.summary.bits}<small>${e.summary.score} / ${e.summary.target}</small>`, 'bits');
        if (g.status === 'shop') {
          setTimeout(() => {
            if (g === game && g.status === 'shop') {
              sfx.relay();
              hud.render();
              shopView.render();
            }
          }, 1100);
        }
        break;
      case 'moduleFired':
        hud.flashModule(e.id);
        sfx.relay();
        break;
      case 'change':
        view.sync();
        hud.render();
        if (g.status === 'shop') shopView.render();
        break;
    }
  });
}

wire(game);
view.build(game.board);
hud.render();
shopView.render();
