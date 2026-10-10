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
  if (action === 'flag') game.toggleFlag(x, y);
  else game.click(x, y);
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

const pullLever = async () => {
  const flags = game.startCashout();
  if (!flags || !flags.length) return;

  sfx.leverPull();
  view.locked = true;
  hud.setLeverAnimation('pull');

  let failedCell: Cell | null = null;

  for (let i = 0; i < flags.length; i++) {
    const c = flags[i];
    view.setCheckingCell(c);
    sfx.rollTick(i);

    // Suspense rhythm
    await new Promise((r) => setTimeout(r, 340));

    if (c.mine) {
      sfx.flagConfirmed(i);
      const p = cellScreen(c.x, c.y);
      fx.burst(p.x, p.y, `<span class="score-main" style="color:#00ff88;font-size:18px;">⚡ МИНА!</span>`, 'score');
    } else {
      failedCell = c;
      break;
    }
  }

  view.setCheckingCell(undefined);

  if (failedCell) {
    // BUST
    sfx.buzzer();
    view.kick(0.6);
    hud.setLeverAnimation('bust');
    const p = cellScreen(failedCell.x, failedCell.y);
    fx.burst(p.x, p.y, `<span class="hurt-main">💥 ОСЕЧКА! -1 HP</span>`, 'hurt');
    game.resolveCashoutBust(failedCell);
    view.sync();
    view.locked = false;
    hud.showBonus([`💥 ОСЕЧКА! ЛОЖНЫЙ ФЛАГ`, `СЕРИЯ СБИТА (-1 HP)`], true);
    hud.render();
  } else {
    // JACKPOT!
    sfx.jackpotFanfare();
    view.kick(0.35);
    hud.setLeverAnimation('jackpot');

    const result = game.resolveCashoutJackpot(flags);
    view.build(game.board);
    view.locked = false;

    fx.banner(boardEl, `🎰 ДЖЕКПОТ! +${result.score}`, 'rainbow');
    hud.showBonus([
      `🎰 ДЖЕКПОТ! ×${result.mult.toFixed(1)} (+${result.score} PTS)`,
      `⚡ ${result.count} МИН ОБЕЗВРЕЖЕНО!`,
    ], false);
    hud.render();
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
      sfx.cascade(5);
    } else {
      sfx.click();
    }
  },
  onPullLever: () => {
    void pullLever();
  },
});

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
          fx.burst(p.x, p.y, `<span class="hurt-main">💥 -1 HP</span><small style="color:#ff6666;font-weight:bold;">СЧЁТ СБРОШЕН В 0</small>`, 'hurt');
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
