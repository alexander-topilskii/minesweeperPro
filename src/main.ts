import { Game } from './core/game';
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
        const boardRect = boardEl.getBoundingClientRect();

        // Offset popup to the side and slightly above cell so cursor or finger does not obscure it
        const isNearRightEdge = p.x > boardRect.right - 140;
        const offsetX = isNearRightEdge ? p.x - 56 : p.x + 56;
        const offsetY = Math.max(boardRect.top + 32, Math.min(boardRect.bottom - 45, p.y - 24));

        if (t.exploded) {
          sfx.boom();
          view.kick();
          fx.float(offsetX, offsetY, '💥 -1 HP', 'hurt');
        }
        if (t.score > 0) {
          const big = t.score >= g.target * 0.25;
          fx.float(
            offsetX,
            offsetY,
            `+${t.score}<small>${t.data} × ${t.mult.toFixed(1)}</small>`,
            big ? 'score big' : 'score',
          );
        }
        if (t.cells > 1) sfx.cascade(t.cells);
        else if (t.cells === 1) sfx.click();
        break;
      }
      case 'cleared':
        fx.banner(boardEl, 'СЕКТОР ОЧИЩЕН', 'rainbow');
        sfx.cascade(10);
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
