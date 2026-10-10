import { Board, type Cell } from './board';
import { CONFIG, minesFor, targetFor } from '../config';
import type { ModuleDef, ModuleHooks, TurnContext } from './types';

export type RoundStatus = 'playing' | 'won' | 'lost' | 'victory';

export interface TurnResult {
  data: number;
  mult: number;
  xMult: number;
  score: number;
  cells: number;
  exploded: boolean;
}

export type GameEvent =
  | { type: 'change' }
  | { type: 'turn'; result: TurnResult }
  | { type: 'moduleFired'; id: string }
  | { type: 'newBoard' };

export class Game {
  board!: Board;
  stage = 0;
  score = 0;
  target = 0;
  clicks = 0;
  hull = CONFIG.hull;
  bits = 0;
  combo = 0;
  /** Permanent-for-round additive Mult (e.g. Extremum). */
  roundMult = 0;
  status: RoundStatus = 'playing';
  lastTurn?: TurnResult;
  /** Per-round scratch state for modules, keyed by module id. */
  roundState: Record<string, unknown> = {};

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
    this.roundState = {};
    this.lastTurn = undefined;
    this.status = 'playing';
    this.runHook('onRoundStart', (h) => h(this));
    this.emit({ type: 'newBoard' });
    this.emit({ type: 'change' });
  }

  nextStage(): void {
    if (this.status !== 'won') return;
    this.startStage(this.stage + 1);
  }

  // ---------- Player actions ----------

  click(x: number, y: number): void {
    const cell = this.board.get(x, y);
    if (!cell || this.status !== 'playing' || cell.flagged) return;
    if (cell.revealed) this.chord(cell);
    else this.reveal(cell);
  }

  toggleFlag(x: number, y: number): void {
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
    this.endTurn(ctx);
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
    this.endTurn(ctx);
  }

  // ---------- Turn pipeline (public so modules can trigger extra reveals) ----------

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
    const opened = this.board.flood(start);
    opened.forEach((c, i) => {
      ctx.revealed.push(c);
      if (i > 0) {
        ctx.cascadeSteps++;
        ctx.mult += CONFIG.cascadeMultStep;
      }
      ctx.data += c.adjacent || CONFIG.zeroData;
      this.runHook('onReveal', (h) => h(this, ctx, c));
    });
    if (opened.length > 1) this.runHook('onCascade', (h) => h(this, ctx, opened));
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

  private endTurn(ctx: TurnContext): void {
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
    };
    this.emit({ type: 'turn', result: this.lastTurn });
    this.checkRoundEnd();
    this.emit({ type: 'change' });
  }

  private checkRoundEnd(): void {
    if (this.score >= this.target) return this.winRound();
    if (this.hull <= 0 || this.clicks <= 0 || this.board.safeRemaining() === 0) this.status = 'lost';
  }

  private winRound(): void {
    const correctFlags = this.board.cells.filter((c) => c.flagged && c.mine).length;
    this.score += correctFlags * CONFIG.flagRoundEndData;
    this.runHook('onRoundEnd', (h) => h(this));
    this.bits += CONFIG.bitsPerWin + this.clicks * CONFIG.bitsPerClickLeft;
    this.status = this.stage + 1 >= CONFIG.sectors * 3 ? 'victory' : 'won';
  }

  private runHook<K extends keyof ModuleHooks>(name: K, call: (h: ModuleHooks[K]) => void): void {
    for (const m of this.modules) {
      const h = m.hooks[name];
      if (h) call(h as ModuleHooks[K]);
    }
  }
}
