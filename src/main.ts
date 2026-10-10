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

const restart = () => {
  game = new Game(STARTER.map(getModule));
  wire(game);
  hud.setGame(game);
  shopView.setGame(game);
  view.build(game.board);
  hud.render();
  shopView.render();
};

let isSlotRolling = false;

function buildBoardBorderLights(): HTMLElement[] {
  const container = document.getElementById('board-lights');
  if (!container) return [];
  container.innerHTML = '';
  const lamps: HTMLElement[] = [];
  // Place perimeter lamps (e.g. 24 lamps around the border)
  const total = 28;
  for (let i = 0; i < total; i++) {
    const lamp = document.createElement('div');
    lamp.className = `chase-lamp ${i % 2 === 0 ? '' : 'alt'}`;
    container.appendChild(lamp);
    lamps.push(lamp);
  }
  layoutBoardLamps(lamps);
  return lamps;
}

function layoutBoardLamps(lamps: HTMLElement[]) {
  const container = document.getElementById('board-lights');
  if (!container || !lamps.length) return;
  const w = container.clientWidth;
  const h = container.clientHeight;
  const perimeter = 2 * (w + h);
  const step = perimeter / lamps.length;

  lamps.forEach((lamp, i) => {
    let d = i * step;
    let x = 0;
    let y = 0;
    if (d < w) {
      x = d;
      y = 6;
    } else if (d < w + h) {
      x = w - 6;
      y = d - w;
    } else if (d < 2 * w + h) {
      x = w - (d - (w + h));
      y = h - 6;
    } else {
      x = 6;
      y = h - (d - (2 * w + h));
    }
    lamp.style.left = `${x.toFixed(1)}px`;
    lamp.style.top = `${y.toFixed(1)}px`;
  });
}

const runSlotJackpotRoll = async () => {
  if (isSlotRolling || game.status !== 'playing') return;
  const slots = game.getSlotFlags();
  if (slots.length < 3) return;

  isSlotRolling = true;
  view.locked = true;

  // Make sure board has mines generated
  if (!game.board.generated) {
    const safe = game.board.cells.find((c) => !c.slotFlag && !c.flagged) || slots[0];
    game.board.generate(safe);
  }

  const lightsContainer = document.getElementById('board-lights');
  const lamps = buildBoardBorderLights();
  if (lightsContainer) {
    lightsContainer.className = 'board-lights active';
  }

  // Phase 1: Arcade lights chasing along the contour & slot machines blinking
  // Sound of spinning slot reels!
  let chaseTick = 0;
  const chaseInterval = setInterval(() => {
    chaseTick++;
    sfx.slotReelSpin(chaseTick);
    // Cycle lamp highlights
    lamps.forEach((l, idx) => {
      const active = (idx + chaseTick) % 4 === 0;
      l.classList.toggle('off', !active);
    });
    // Slot tiles flash in rhythm
    const glowToggle = chaseTick % 2 === 0;
    view.setGlowingSlotCells(glowToggle ? slots : []);
  }, 90);

  // Spin for 1.8 seconds of escalating suspense
  await new Promise((r) => setTimeout(r, 1800));
  clearInterval(chaseInterval);

  // Phase 2: Sequential reveal of the 3 slot machine flags
  let failedCell: Cell | null = null;
  for (let i = 0; i < 3; i++) {
    const c = slots[i];
    view.setCheckingCell(c);
    sfx.slotReelStop(i);
    view.kick(0.2);

    await new Promise((r) => setTimeout(r, 450));

    if (c.mine) {
      // Confirmed mine!
      sfx.flagConfirmed(i);
      const p = cellScreen(c.x, c.y);
      fx.burst(p.x, p.y, `<span class="score-main" style="color:#00ff88;font-size:20px;">⚡ МИНА [7]!</span>`, 'score');
    } else {
      // False flag! Safe cell under slot machine -> BUST!
      failedCell = c;
      break;
    }
  }

  view.setCheckingCell(undefined);
  view.setGlowingSlotCells([]);

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
    hud.showBonus([`💥 ОСЕЧКА СЛОТА! -1 HP`, `СЕРИЯ СБИТА`], true);
    hud.render();
    setTimeout(() => {
      if (lightsContainer) lightsContainer.className = 'board-lights';
    }, 1200);
  } else {
    // 3 MINES CONFIRMED: 777 JACKPOT!
    sfx.jackpotFanfare();
    view.kick(0.45);
    if (lightsContainer) lightsContainer.className = 'board-lights jackpot';

    const result = game.resolveSlotJackpot(slots);
    view.build(game.board);
    view.locked = false;
    isSlotRolling = false;

    fx.banner(boardEl, `🎰 7-7-7 ДЖЕКПОТ!\n+${result.score} PTS · +${result.bits} BITS`, 'rainbow');
    hud.showBonus([
      `🎰 7-7-7 ДЖЕКПОТ! (+${result.score} PTS)`,
      `💎 +${result.bits} BITS ЗА 3 ОБЕЗВРЕЖЕННЫХ МИНЫ!`,
    ], false);
    hud.render();
    setTimeout(() => {
      if (lightsContainer) lightsContainer.className = 'board-lights';
    }, 2200);
  }
};

const hud = new Hud(game, {
  smiley: () => {
    if (game.status === 'lost' || game.status === 'victory') restart();
    else game.advance();
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
        hud.showBonus(['🎉 ЦЕЛЬ ВЫПОЛНЕНА!', '🏁 В МАГАЗИН ИЛИ НАБИВАЙТЕ OVERCHARGE!'], false);
        break;
      case 'overchargeUp':
        fx.banner(boardEl, `⚡ OVERCHARGE УР. ${e.level}!\n+1 EXTRA BIT`, 'bits');
        sfx.cascade(8);
        hud.showBonus([`⚡ OVERCHARGE УР. ${e.level}!`, `+1 БОНУСНЫЙ BIT ДЛЯ МАГАЗИНА`], false);
        break;
      case 'roundEnd':
        fx.banner(boardEl, `+${e.summary.bits} BITS<small>${e.summary.score} / ${e.summary.target}</small>`, 'bits');
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
