import type { Cell } from '../core/board';
import type { Game } from '../core/game';
import type { BoardView } from '../render/boardView';
import type { Hud } from './hud';
import type { Sfx } from '../audio/sfx';
import type { Fx } from './fx';

interface SlotReelController {
  widget: HTMLElement;
  cabinet: HTMLElement;
  viewport: HTMLElement;
  strip: HTMLElement;
  cell: Cell;
  itemH: number;
}

const REEL_SYMBOLS = ['🍒', '💣', '7️⃣', '💎', '🔔', '🍀', '🍋', '⭐'];

export interface SlotMachineContext {
  game: Game;
  boardEl: HTMLElement;
  headerEl: HTMLElement;
  view: BoardView;
  hud: Hud;
  sfx: Sfx;
  fx: Fx;
  cellScreen: (x: number, y: number) => { x: number; y: number };
}

export class SlotMachineView {
  private isRolling = false;

  constructor(private ctx: SlotMachineContext) {}

  get rolling(): boolean {
    return this.isRolling;
  }

  setGame(game: Game): void {
    this.ctx.game = game;
  }

  buildBoardBorderLights(): HTMLElement[] {
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

  mountSlotReels(slots: Cell[]): { controllers: SlotReelController[]; layer: HTMLElement } {
    const { boardEl, view } = this.ctx;
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

  stopSlotReel(controller: SlotReelController, reelIndex: number): Promise<boolean> {
    return new Promise((resolve) => {
      const { cabinet, strip, cell, itemH } = controller;
      const { view, cellScreen, sfx, fx } = this.ctx;

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

  async runSlotJackpotRoll(): Promise<void> {
    const { game, view, hud, headerEl, sfx, fx } = this.ctx;
    if (this.isRolling || game.status !== 'playing') return;
    const slots = game.getSlotFlags();
    if (slots.length < 3) return;

    this.isRolling = true;
    game.isSlotRolling = true;
    view.locked = true;

    // Ensure mines are fully generated before spinning
    if (!game.board.generated) {
      const safe = game.board.cells.find((c) => !c.slotFlag && !c.flagged) || slots[0];
      game.generateBoard(safe);
    }

    const lightsContainer = document.getElementById('board-lights');
    const lamps = this.buildBoardBorderLights();
    if (lightsContainer) {
      lightsContainer.className = 'board-lights active';
    }

    // Mount the 3 spinning slot-machine reels on top of the slot cells
    const { controllers, layer: reelsLayer } = this.mountSlotReels(slots);

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
    for (let i = 0; i < 3; i++) {
      const controller = controllers[i];
      await this.stopSlotReel(controller, i);
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

      setTimeout(() => {
        reelsLayer.remove();
        view.build(game.board);
        view.locked = false;
        this.isRolling = false;
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

      setTimeout(() => {
        reelsLayer.remove();
        view.sync();
        view.locked = false;
        this.isRolling = false;
        game.isSlotRolling = false;
        if (lightsContainer) lightsContainer.className = 'board-lights';
      }, 3200);
    }
  }
}
