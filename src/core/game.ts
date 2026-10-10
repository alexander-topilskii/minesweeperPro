import { Board, type Cell } from './board';
import { CONFIG, minesFor, targetFor } from '../config';
import type { ConsumableDef, ModuleDef, ModuleHooks, TurnContext } from './types';
import { MODULES, sellValue } from '../modules/registry';
import { CONSUMABLES } from '../modules/consumables';

/**
 * playing — round in progress (target may already be reached — see `cleared`)
 * shop    — shop phase between rounds: buy/sell modules & consumables, reroll, view next stage
 * lost    — round ended below target, run over
 * victory — all sectors done
 */
export type RoundStatus = 'playing' | 'shop' | 'lost' | 'victory';

export interface TurnResult {
  data: number;
  mult: number;
  xMult: number;
  score: number;
  cells: number;
  exploded: boolean;
  origin: { x: number; y: number };
}

export interface RoundSummary {
  score: number;
  target: number;
  bits: number;
}

export type GameEvent =
  | { type: 'change' }
  | { type: 'turn'; result: TurnResult }
  | { type: 'cleared' }
  | { type: 'roundEnd'; summary: RoundSummary }
  | { type: 'moduleFired'; id: string }
  | { type: 'newBoard' };

export class Game {
  board!: Board;
  stage = 0;
  score = 0;
  target = 0;
  clicks = 0;
  hull: number = CONFIG.hull;
  bits = 0;
  combo = 0;
  /** Permanent-for-round additive Mult (e.g. Extremum). */
  roundMult = 0;
  /** Target reached this round; play continues for overcharge until resources run out or player advances. */
  cleared = false;
  status: RoundStatus = 'playing';
  lastTurn?: TurnResult;
  /** Per-round scratch state for modules, keyed by module id. */
  roundState: Record<string, unknown> = {};

  /** Consumables in player inventory (max CONFIG.consumableSlots). */
  consumables: ConsumableDef[] = [];
  /** If a consumable requires clicking a tile, its index in `consumables`. */
  activeConsumableIdx?: number;

  /** Shop items available between rounds. */
  shopOffers: {
    modules: ModuleDef[];
    consumables: ConsumableDef[];
  } = { modules: [], consumables: [] };
  rerollCost: number = CONFIG.rerollBaseCost;

  private listeners = new Set<(e: GameEvent) => void>();

  constructor(public modules: ModuleDef[]) {
    this.startStage(0);
  }

  on(fn: (e: GameEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(e: GameEvent): void {
    for (const fn of this.listeners) fn(e);
  }

  /** Called by modules to flash their slot in the UI. */
  fire(id: string): void {
    this.emit({ type: 'moduleFired', id });
  }

  get sector(): number {
    return Math.floor(this.stage / 3) + 1;
  }

  get stageName(): string {
    return ['Стандартный сканер', 'Глубокий сканер', 'Аномалия'][this.stage % 3];
  }

  startStage(stage: number): void {
    this.stage = stage;
    this.board = new Board(CONFIG.board.w, CONFIG.board.h, minesFor(stage));
    this.score = 0;
    this.target = targetFor(stage);
    this.clicks = CONFIG.clicks;
    this.hull = CONFIG.hull;
    this.combo = 0;
    this.roundMult = 0;
    this.cleared = false;
    this.activeConsumableIdx = undefined;
    this.roundState = {};
    this.lastTurn = undefined;
    this.status = 'playing';
    this.runHook('onRoundStart', (h) => h(this));
    this.emit({ type: 'newBoard' });
    this.emit({ type: 'change' });
  }

  nextStage(): void {
    if (this.status === 'shop') {
      this.startStage(this.stage + 1);
    }
  }

  /** Player chooses to bank early (keeps leftover clicks as Bits). */
  advance(): void {
    if (this.status === 'playing' && this.cleared) {
      this.endRound();
      this.emit({ type: 'change' });
    }
  }

  // ---------- Shop Operations ----------

  generateShop(): void {
    const ownedIds = new Set(this.modules.map((m) => m.id));
    const availableModules = MODULES.filter((m) => !ownedIds.has(m.id));

    // Shuffle & pick 2-3 modules
    const shuffledModules = [...availableModules].sort(() => Math.random() - 0.5);
    const offerModules = shuffledModules.slice(0, Math.min(3, shuffledModules.length));

    // Shuffle & pick 1-2 consumables
    const shuffledCons = [...CONSUMABLES].sort(() => Math.random() - 0.5);
    const offerConsumables = shuffledCons.slice(0, 2);

    this.shopOffers = {
      modules: offerModules,
      consumables: offerConsumables,
    };
  }

  rerollShop(): boolean {
    if (this.bits < this.rerollCost) return false;
    this.bits -= this.rerollCost;
    this.rerollCost += 1;
    this.generateShop();
    this.emit({ type: 'change' });
    return true;
  }

  buyModule(m: ModuleDef): boolean {
    if (this.modules.length >= CONFIG.moduleSlots) return false;
    if (this.bits < m.cost) return false;
    this.bits -= m.cost;
    this.modules.push(m);
    this.shopOffers.modules = this.shopOffers.modules.filter((item) => item.id !== m.id);
    this.emit({ type: 'change' });
    return true;
  }

  sellModule(index: number): boolean {
    if (index < 0 || index >= this.modules.length) return false;
    const [mod] = this.modules.splice(index, 1);
    this.bits += sellValue(mod.cost);
    this.emit({ type: 'change' });
    return true;
  }

  buyConsumable(c: ConsumableDef): boolean {
    if (this.consumables.length >= CONFIG.consumableSlots) return false;
    if (this.bits < c.cost) return false;
    this.bits -= c.cost;
    this.consumables.push(c);
    this.shopOffers.consumables = this.shopOffers.consumables.filter((item) => item.id !== c.id);
    this.emit({ type: 'change' });
    return true;
  }

  sellConsumable(index: number): boolean {
    if (index < 0 || index >= this.consumables.length) return false;
    const [c] = this.consumables.splice(index, 1);
    this.bits += sellValue(c.cost);
    this.emit({ type: 'change' });
    return true;
  }

  // ---------- Consumable Usage ----------

  useConsumable(index: number, cell?: Cell): boolean {
    if (index < 0 || index >= this.consumables.length) return false;
    const c = this.consumables[index];
    if (c.targetType === 'cell' && !cell) {
      // Toggle targeting mode
      if (this.activeConsumableIdx === index) {
        this.activeConsumableIdx = undefined;
      } else {
        this.activeConsumableIdx = index;
      }
      this.emit({ type: 'change' });
      return false;
    }

    const success = c.use(this, cell);
    if (success) {
      this.consumables.splice(index, 1);
      this.activeConsumableIdx = undefined;
      this.emit({ type: 'change' });
    }
    return success;
  }

  cancelTargetMode(): void {
    if (this.activeConsumableIdx !== undefined) {
      this.activeConsumableIdx = undefined;
      this.emit({ type: 'change' });
    }
  }

  // ---------- Player Actions ----------

  click(x: number, y: number): void {
    const cell = this.board.get(x, y);
    if (!cell || this.status !== 'playing') return;

    // If consumable targeting mode is active:
    if (this.activeConsumableIdx !== undefined) {
      this.useConsumable(this.activeConsumableIdx, cell);
      return;
    }

    if (cell.flagged) return;
    if (cell.revealed) this.chord(cell);
    else this.reveal(cell);
  }

  toggleFlag(x: number, y: number): void {
    if (this.activeConsumableIdx !== undefined) {
      this.cancelTargetMode();
      return;
    }
    const cell = this.board.get(x, y);
    if (!cell || this.status !== 'playing' || cell.revealed) return;
    cell.flagged = !cell.flagged;
    this.emit({ type: 'change' });
  }

  private reveal(cell: Cell): void {
    if (!this.board.generated) this.board.generate(cell);
    const ctx = this.beginTurn();
    if (cell.mine) this.hitMine(cell, ctx);
    else this.openSafe(cell, ctx);
    this.endTurn(ctx, cell);
  }

  private chord(cell: Cell): void {
    if (cell.adjacent === 0 || cell.exploded) return;
    const ns = this.board.neighbors(cell);
    if (ns.filter((n) => n.flagged || n.exploded).length !== cell.adjacent) return;
    const targets = ns.filter((n) => !n.revealed && !n.flagged);
    if (!targets.length) return;
    const ctx = this.beginTurn();
    for (const t of targets) {
      if (t.revealed) continue;
      if (t.mine) this.hitMine(t, ctx);
      else this.openSafe(t, ctx);
    }
    this.endTurn(ctx, cell);
  }

  // ---------- Turn Pipeline ----------

  private beginTurn(): TurnContext {
    this.clicks--;
    return {
      data: 0,
      mult: 1 + this.combo * CONFIG.comboMultStep + this.roundMult,
      xMult: 1,
      cascadeSteps: 0,
      revealed: [],
      exploded: false,
    };
  }

  openSafe(start: Cell, ctx: TurnContext): void {
    const layers = this.board.flood(start);
    layers.forEach((layer, depth) => {
      if (depth > 0) {
        ctx.cascadeSteps++;
        ctx.mult += CONFIG.cascadeMultStep;
      }
      for (const c of layer) {
        ctx.revealed.push(c);
        ctx.data += c.adjacent || CONFIG.zeroData;
        this.runHook('onReveal', (h) => h(this, ctx, c));
      }
    });
    if (layers.length > 1) this.runHook('onCascade', (h) => h(this, ctx, layers.flat()));
  }

  private hitMine(cell: Cell, ctx: TurnContext): void {
    const ev = { prevented: false };
    cell.revealed = true;
    cell.exploded = true;
    cell.flagged = false;
    ctx.exploded = true;
    this.runHook('onMineHit', (h) => h(this, ctx, cell, ev));
    if (!ev.prevented) this.hull--;
  }

  private endTurn(ctx: TurnContext, origin: Cell): void {
    const score = Math.round(ctx.data * ctx.mult * ctx.xMult);
    this.score += score;
    this.combo = ctx.exploded ? 0 : this.combo + 1;
    this.lastTurn = {
      data: ctx.data,
      mult: ctx.mult,
      xMult: ctx.xMult,
      score,
      cells: ctx.revealed.length,
      exploded: ctx.exploded,
      origin: { x: origin.x, y: origin.y },
    };
    this.emit({ type: 'turn', result: this.lastTurn });
    if (!this.cleared && this.score >= this.target) {
      this.cleared = true;
      this.emit({ type: 'cleared' });
    }
    if (this.hull <= 0 || this.clicks <= 0 || this.board.safeRemaining() === 0) this.endRound();
    this.emit({ type: 'change' });
  }

  private endRound(): void {
    if (!this.cleared) {
      this.status = 'lost';
      return;
    }
    const correctFlags = this.board.cells.filter((c) => c.flagged && c.mine).length;
    this.score += correctFlags * CONFIG.flagRoundEndData;
    this.runHook('onRoundEnd', (h) => h(this));
    const overcharge = Math.floor((this.score - this.target) / (this.target * CONFIG.overchargeBitStep));
    const bitsEarned = CONFIG.bitsPerWin + this.clicks * CONFIG.bitsPerClickLeft + Math.max(0, overcharge);
    this.bits += bitsEarned;

    if (this.stage + 1 >= CONFIG.sectors * 3) {
      this.status = 'victory';
    } else {
      this.status = 'shop';
      this.rerollCost = CONFIG.rerollBaseCost;
      this.generateShop();
    }
    this.emit({ type: 'roundEnd', summary: { score: this.score, target: this.target, bits: bitsEarned } });
  }

  private runHook<K extends keyof ModuleHooks>(name: K, call: (h: ModuleHooks[K]) => void): void {
    for (const m of this.modules) {
      const h = m.hooks[name];
      if (h) call(h as ModuleHooks[K]);
    }
  }
}
