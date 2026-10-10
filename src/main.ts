import { Game } from './core/game';
import { getModule } from './modules/registry';
import { BoardView } from './render/boardView';
import { Hud } from './ui/hud';
import { Sfx } from './audio/sfx';

/** Starter loadout until the shop exists. */
const STARTER = ['MOD-VAL-01', 'MOD-RUL-06', 'MOD-HAZ-01'];

const sfx = new Sfx();
let game = new Game(STARTER.map(getModule));

const view = new BoardView(document.getElementById('board')!, (x, y, action) => {
  if (action === 'flag') game.toggleFlag(x, y);
  else game.click(x, y);
});

const hud = new Hud(game, {
  next: () => game.nextStage(),
  restart: () => {
    game = new Game(STARTER.map(getModule));
    wire(game);
    hud.setGame(game);
    view.build(game.board);
    hud.render();
  },
});

function wire(g: Game) {
  g.on((e) => {
    if (g !== game) return;
    switch (e.type) {
      case 'newBoard':
        view.build(g.board);
        break;
      case 'turn':
        if (e.result.exploded) (sfx.boom(), view.kick());
        if (e.result.cells > 1) sfx.cascade(e.result.cells);
        else if (e.result.cells === 1) sfx.click();
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
