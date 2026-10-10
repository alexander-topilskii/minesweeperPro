import { Game } from './core/game';
import { CONFIG } from './config';
import { getModule } from './modules/registry';
import { BoardView } from './render/boardView';
import { Hud } from './ui/hud';
import { Fx } from './ui/fx';
import { Sfx } from './audio/sfx';

/** Starter loadout until the shop exists. */
const STARTER = ['MOD-VAL-01', 'MOD-RUL-06', 'MOD-HAZ-01'];

const boardEl = document.getElementById('board')!;
const sfx = new Sfx();
const fx = new Fx();
let game = new Game(STARTER.map(getModule));

const view = new BoardView(boardEl, (x, y, action) => {
  if (action === 'flag') game.toggleFlag(x, y);
  else game.click(x, y);
});

const restart = () => {
  game = new Game(STARTER.map(getModule));
  wire(game);
  hud.setGame(game);
  view.build(game.board);
  hud.render();
};

const hud = new Hud(game, {
  smiley: () => {
    if (game.status === 'lost' || game.status === 'victory') restart();
    else game.advance();
  },
  restart,
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
          fx.float(p.x, p.y + 20, '-1 HP', 'hurt');
        }
        if (t.score > 0) {
          const big = t.score >= g.target * 0.25;
          fx.float(p.x, p.y, `+${t.score}<small>${t.data} × ${t.mult.toFixed(1)}</small>`, big ? 'score big' : 'score');
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
        if (g.status === 'transition') setTimeout(() => g === game && g.nextStage(), CONFIG.stageTransitionMs);
        break;
      case 'moduleFired':
        hud.flashModule(e.id);
        sfx.relay();
        break;
      case 'change':
        view.sync();
        hud.render();
        break;
    }
  });
}

wire(game);
view.build(game.board);
hud.render();
