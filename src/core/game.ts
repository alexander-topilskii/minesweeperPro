import { Board, type Cell } from './board';
import { CONFIG, cashoutMultiplier, cashoutScore, minesFor, targetFor } from '../config';
import type { ConsumableDef, ModuleDef, ModuleHooks, TurnContext } from './types';
import { MODULES, getModule, sellValue } from '../modules/registry';
import { getConsumable } from '../modules/consumables';
import { generateActMap, type MapData, type MapNode, type NodeType } from './map';

/**
 * playing — round in progress (target may already be reached — see `cleared`)
 * map     — Slay the Spire style act route map navigation
 * shop    — shop phase: buy/sell modules & consumables, reroll, continue route
 * lost    — round ended below target, run over
 * victory — all sectors done
 */
export type RoundStatus = 'playing' | 'map' | 'shop' | 'lost' | 'victory';

export interface TurnResult {
  data: number;
  mult: number;
  xMult: number;
  score: number;
  cells: number;
  exploded: boolean;
  origin: { x: number; y: number };
  callouts: string[];
  comboStreak: number;
  comboBroken: boolean;
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
  | { type: 'overchargeUp'; level: number }
  | { type: 'roundEnd'; summary: RoundSummary }
  | { type: 'moduleFired'; id: string }
  | { type: 'newBoard' }
  | { type: 'fullClear'; bonusBits: number; bonusScore: number }
  | { type: 'blindClear'; bonusBits: number; bonusScore: number }
  | { type: 'cheaterCaught'; penalty: number }
  | { type: 'flagLimit' };

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
  overchargeLevel = 0;
  status: RoundStatus = 'playing';
  /** Explicit reason for game over (loss) */
  lossReason?: 'clicks' | 'hull' | 'cashout';
  lastTurn?: TurnResult;
  /** True while the sequential cashout lever validation roll is active. */
  isCashoutRolling = false;
  /** True while the 3-slot machine jackpot roll animation is active. */
  isSlotRolling = false;
  /** Per-round scratch state for modules, keyed by module id. */
  roundState: Record<string, unknown> = {};

  /** Special clear outcome: 'full' (полная зачистка), 'blind' (зачистка вслепую), 'cheater' (жулик) */
  specialClear?: 'full' | 'blind' | 'cheater';
  cheaterPenalty = 0;
  cheaterDetected = false;
  nextLevelHalfFlags = false;
  halfFlagsDebuff = false;
  maxFlags?: number;
  extraFlags = 0;
  blindFlagsCount = 0;
  private lastFlagToggleTime = 0;
  private rapidBlindFlagStreak = 0;

  /** Number of consecutive blind clicks (with 0 revealed neighbors) */
  blindClicks = 0;
  /** Active state of "Отвага и слабоумие" bonus mode */
  daredevilActive = false;

  /** Fast click streak count (consecutive cell reveals with <1000ms gap) */
  fastClicks = 0;
  /** Active state of "Не уследить" speed demon bonus mode */
  speedDemonActive = false;
  /** Timestamp of the last cell reveal */
  lastRevealTime = 0;
  /** Inactivity timer to reset speed mode when player slows down */
  private speedDemonTimer?: ReturnType<typeof setTimeout>;

  /** Slay the Spire style branching map */
  map!: MapData;
  currentMapNode?: MapNode;
  currentEncounterType: NodeType = 'battle';

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
    this.map = generateActMap(1);
    this.currentMapNode = this.map.nodes[0];
    this.startStage(0, 'battle');
  }

  on(fn: (e: GameEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(e: GameEvent): void {
    for (const fn of this.listeners) fn(e);
  }

  private currentTurnContext?: TurnContext;

  /** Called by modules to flash their slot in the UI. */
  fire(id: string): void {
    if (this.currentTurnContext) {
      const m = this.modules.find((mod) => mod.id === id);
      if (m && !this.currentTurnContext.callouts.includes(m.name)) {
        this.currentTurnContext.callouts.push(m.name);
      }
    }
    this.emit({ type: 'moduleFired', id });
  }

  get maxHull(): number {
    const extraHp = this.modules.filter((m) => m.id === 'MOD-HAZ-HP').length;
    return CONFIG.hull + extraHp;
  }

  get sector(): number {
    return this.map ? this.map.act : 1;
  }

  get stageName(): string {
    if (this.currentEncounterType === 'boss') return `👑 ${this.map.bossName}`;
    if (this.currentEncounterType === 'elite') return '💀 Элитный сектор';
    return ['Стандартный сканер', 'Глубокий сканер', 'Аномалия'][this.stage % 3];
  }

  startStage(stage: number, encounterType: NodeType = 'battle'): void {
    this.stage = stage;
    this.currentEncounterType = encounterType;
    let mineCount = minesFor(stage);
    let targetScore = targetFor(stage);
    let boardW: number = CONFIG.board.w;
    let boardH: number = CONFIG.board.h;
    let clicks: number = CONFIG.clicks;

    if (encounterType === 'elite') {
      mineCount += 3;
      targetScore = Math.round(targetScore * 1.25);
    } else if (encounterType === 'boss') {
      boardW = 14;
      boardH = 14;
      // 14x14 = 196 cells (~2x bigger than standard 10x10=100 cells)
      mineCount = Math.round(mineCount * 1.7) + 3;
      targetScore = Math.round(targetScore * 1.5);
      clicks = CONFIG.clicks + 8; // 33 clicks for the massive arena
    }

    this.halfFlagsDebuff = this.nextLevelHalfFlags;
    this.nextLevelHalfFlags = false;
    this.maxFlags = this.halfFlagsDebuff
      ? Math.max(1, Math.floor(mineCount / 2))
      : mineCount + this.extraFlags;
    this.cheaterDetected = false;
    this.cheaterPenalty = 0;
    this.blindFlagsCount = 0;
    this.rapidBlindFlagStreak = 0;
    this.lastFlagToggleTime = 0;
    this.specialClear = undefined;

    this.board = new Board(boardW, boardH, mineCount);
    this.score = 0;
    this.target = targetScore;
    this.clicks = clicks;
    this.hull = this.maxHull;
    this.combo = 0;
    this.roundMult = 0;
    this.cleared = false;
    this.overchargeLevel = 0;
    this.activeConsumableIdx = undefined;
    this.roundState = {};
    this.lastTurn = undefined;
    this.isCashoutRolling = false;
    this.isSlotRolling = false;
    this.lossReason = undefined;
    this.blindClicks = 0;
    this.daredevilActive = false;
    this.fastClicks = 0;
    this.speedDemonActive = false;
    this.lastRevealTime = 0;
    if (this.speedDemonTimer) {
      clearTimeout(this.speedDemonTimer);
      this.speedDemonTimer = undefined;
    }
    this.status = 'playing';
    this.runHook('onRoundStart', (h) => h(this));
    this.emit({ type: 'newBoard' });
    this.emit({ type: 'change' });
  }

  /** Player selects a destination node on the Act Map */
  selectMapNode(nodeId: string): void {
    const node = this.map.nodes.find((n) => n.id === nodeId);
    if (!node) return;

    this.map.currentNodeId = nodeId;
    if (!this.map.visitedNodeIds.includes(nodeId)) {
      this.map.visitedNodeIds.push(nodeId);
    }
    this.currentMapNode = node;

    if (node.type === 'battle' || node.type === 'elite' || node.type === 'boss') {
      const stageIndex = (this.map.act - 1) * 6 + node.floor;
      this.startStage(stageIndex, node.type);
    } else if (node.type === 'shop') {
      this.status = 'shop';
      this.rerollCost = CONFIG.rerollBaseCost;
      this.generateShop();
      this.emit({ type: 'change' });
    }
    // 'rest' and 'event' nodes are handled interactively in MapView
  }

  /** Completes a non-combat node (shop, rest, event) and returns to map */
  completeNodeAndReturnToMap(): void {
    if (this.currentMapNode) {
      this.currentMapNode.completed = true;
    }
    this.status = 'map';
    this.emit({ type: 'change' });
  }

  nextStage(): void {
    if (this.status === 'shop') {
      this.completeNodeAndReturnToMap();
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
    const slotDef = getConsumable('CON-SLOT');
    const hpMod = getModule('MOD-HAZ-HP');
    const fugasMod = getModule('MOD-HAZ-FUGAS');
    const hpCount = this.modules.filter((m) => m.id === 'MOD-HAZ-HP').length;
    const hasFugas = this.modules.some((m) => m.id === 'MOD-HAZ-FUGAS');

    const modOffers: ModuleDef[] = [];
    if (hpCount < 2) {
      modOffers.push({ ...hpMod });
    }
    if (!hasFugas) {
      modOffers.push({ ...fugasMod });
    }

    // Добавляем 1-2 случайных модуля из пула, которыми игрок еще не владеет
    const ownedIds = new Set(this.modules.map((m) => m.id));
    ownedIds.add('MOD-HAZ-HP');
    ownedIds.add('MOD-HAZ-FUGAS');
    const pool = MODULES.filter((m) => !ownedIds.has(m.id));
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    for (const m of shuffled.slice(0, 2)) {
      modOffers.push({ ...m });
    }

    this.shopOffers = {
      modules: modOffers,
      consumables: [{ ...slotDef }],
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
    if (m.id === 'MOD-HAZ-HP') {
      this.hull += 1;
    }
    this.shopOffers.modules = this.shopOffers.modules.filter((item) => item.id !== m.id);
    this.emit({ type: 'change' });
    return true;
  }

  sellModule(index: number): boolean {
    if (index < 0 || index >= this.modules.length) return false;
    const [mod] = this.modules.splice(index, 1);
    this.bits += sellValue(mod.cost);
    if (mod.id === 'MOD-HAZ-HP') {
      this.hull = Math.min(this.hull, this.maxHull);
    }
    this.emit({ type: 'change' });
    return true;
  }

  buyConsumable(c: ConsumableDef): boolean {
    if (this.consumables.length >= CONFIG.consumableSlots) return false;
    if (this.bits < c.cost) return false;
    this.bits -= c.cost;
    const cloned: ConsumableDef = {
      ...c,
      charges: c.charges ?? c.maxCharges ?? 1,
      maxCharges: c.maxCharges ?? c.charges ?? 1,
    };
    this.consumables.push(cloned);
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
      if (c.charges !== undefined) {
        c.charges--;
        if (c.charges <= 0) {
          this.consumables.splice(index, 1);
          this.activeConsumableIdx = undefined;
        } else {
          // Keep activeConsumableIdx active so the player can place the next flag without re-clicking!
          this.activeConsumableIdx = index;
        }
      } else {
        this.consumables.splice(index, 1);
        this.activeConsumableIdx = undefined;
      }
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

  /** Refunds +1 charge of CON-SLOT when a placed slot-flag is removed from the board */
  refundSlotCharge(): void {
    const slotCon = this.consumables.find((c) => c.id === 'CON-SLOT');
    if (slotCon) {
      if (slotCon.charges !== undefined) {
        const max = slotCon.maxCharges ?? 3;
        slotCon.charges = Math.min(max, slotCon.charges + 1);
      }
    } else {
      const def = getConsumable('CON-SLOT');
      const item: ConsumableDef = {
        ...def,
        charges: 1,
        maxCharges: def.maxCharges ?? 3,
      };
      this.consumables.push(item);
    }
    this.emit({ type: 'change' });
  }

  removeSlotFlag(cell: Cell): void {
    if (!cell.slotFlag) return;
    cell.slotFlag = false;
    this.refundSlotCharge();
  }

  // ---------- Player Actions ----------

  click(x: number, y: number): void {
    const cell = this.board.get(x, y);
    if (!cell || this.status !== 'playing' || this.isCashoutRolling) return;

    // If consumable targeting mode is active:
    if (this.activeConsumableIdx !== undefined) {
      const activeCon = this.consumables[this.activeConsumableIdx];
      if (activeCon && activeCon.id === 'CON-SLOT' && cell.slotFlag) {
        // Clicking an existing slot flag unflags it and refunds charge
        this.removeSlotFlag(cell);
        return;
      }
      this.useConsumable(this.activeConsumableIdx, cell);
      return;
    }

    if (cell.flagged || cell.slotFlag) return;
    if (cell.revealed) this.chord(cell);
    else this.reveal(cell);
  }

  toggleFlag(x: number, y: number): void {
    if (this.isCashoutRolling) return;
    const cell = this.board.get(x, y);
    if (!cell || this.status !== 'playing' || cell.revealed) return;

    // If cell already has slotFlag, remove it and refund charge
    if (cell.slotFlag) {
      this.removeSlotFlag(cell);
      return;
    }

    // If CON-SLOT consumable is currently primed/active:
    if (this.activeConsumableIdx !== undefined) {
      const activeCon = this.consumables[this.activeConsumableIdx];
      if (activeCon && activeCon.id === 'CON-SLOT') {
        this.useConsumable(this.activeConsumableIdx, cell);
        return;
      }
      this.cancelTargetMode();
      return;
    }

    // Flag limit check (default: capped by mineCount + extraFlags; half if debuffed)
    if (!cell.flagged && this.maxFlags !== undefined) {
      const currentFlags = this.board.cells.filter((c) => c.flagged).length;
      if (currentFlags >= this.maxFlags) {
        this.emit({ type: 'flagLimit' });
        return;
      }
    }

    // If turn 0 with no cells revealed, generate board with safe start
    if (!this.board.generated) {
      this.board.generate(cell);
    }

    cell.flagged = !cell.flagged;

    if (cell.flagged) {
      // Analyze flag placement to detect blind / cheat guessing
      const hasRevealedNeighbor = this.board.neighbors(cell).some((n) => n.revealed);
      const now = performance.now();
      const timeSinceLast = this.lastFlagToggleTime > 0 ? now - this.lastFlagToggleTime : Infinity;
      this.lastFlagToggleTime = now;

      const currentFlags = this.board.cells.filter((c) => c.flagged).length;
      const totalMines = this.board.cells.filter((c) => c.mine).length;
      const flagsRemaining = totalMines - currentFlags;

      if (!hasRevealedNeighbor) {
        this.blindFlagsCount++;
        if (timeSinceLast < 650) {
          this.rapidBlindFlagStreak++;
        } else {
          this.rapidBlindFlagStreak = 1;
        }

        // Suspicious behavior:
        // 1) Guessing the final 1-2 flags blind without revealed neighbors
        // 2) Placing 2+ blind flags without clues throughout the stage
        // 3) Rapidly spamming flags across unopened cells
        if (flagsRemaining <= 2 || this.blindFlagsCount >= 2 || this.rapidBlindFlagStreak >= 3) {
          this.cheaterDetected = true;
        }
      } else {
        this.rapidBlindFlagStreak = 0;
      }
    }

    this.checkCompletionConditions();
    this.emit({ type: 'change' });
  }

  getCashoutInfo(): { count: number; mult: number; potScore: number } {
    const count = this.board.cells.filter((c) => c.flagged).length;
    const mult = cashoutMultiplier(count);
    const potScore = cashoutScore(count, this.combo);
    return { count, mult, potScore };
  }

  /** Arms the detonator and returns the array of flagged cells to validate */
  startCashout(): Cell[] | null {
    if (this.status !== 'playing' || this.isCashoutRolling) return null;
    const flags = this.board.cells.filter((c) => c.flagged);
    if (!flags.length) return null;

    // If turn 0 with no cells revealed, generate board with mines
    if (!this.board.generated) {
      const safe = this.board.cells.find((c) => !c.flagged) || flags[0];
      this.board.generate(safe);
    }

    if (this.speedDemonTimer) {
      clearTimeout(this.speedDemonTimer);
      this.speedDemonTimer = undefined;
    }
    this.speedDemonActive = false;
    this.fastClicks = 0;
    this.lastRevealTime = 0;
    this.isCashoutRolling = true;
    this.emit({ type: 'change' });
    return flags;
  }

  getSlotFlags(): Cell[] {
    return this.board.cells.filter((c) => c.slotFlag && !c.revealed);
  }

  /** Resolves false slot machine flag penalty: cell explodes/wrong, -1 HP, combo reset to 0, click refunded */
  resolveSlotBust(faultCell: Cell): void {
    faultCell.slotFlag = false;
    faultCell.flagged = false;
    faultCell.revealed = true;
    faultCell.wrong = true;
    faultCell.exploded = true;
    this.hull--;
    this.clicks++; // Mine explosion does not waste battery click
    this.combo = 0;
    this.roundMult = 0;
    this.isCashoutRolling = false;
    if (this.hull <= 0) {
      this.lossReason = 'hull';
      this.status = 'lost';
    }
    this.emit({ type: 'change' });
  }

  /**
   * Resolves the result of the 3-slot roll for all 3 reels:
   * - If all 3 are mines -> 777 Jackpot! (+pts, +$, defuses all 3, cascade)
   * - If not all 3 are mines -> Bust:
   *   - True mines among the 3 are safely kept as confirmed flags (m.flagged = true, m.slotFlag = false)
   *   - Safe cells among the 3 are revealed as what they really are (c.revealed = true, cascading if 0)
   *   - Penalty: -1 HP, clicks refunded, combo reset to 0
   */
  resolveSlotRoll(slots: Cell[]): {
    jackpot: boolean;
    minesHit: number;
    score: number;
    bits: number;
  } {
    const mineCells = slots.filter((c) => c.mine);
    const safeCells = slots.filter((c) => !c.mine);

    if (mineCells.length === 3) {
      const res = this.resolveSlotJackpot(slots);
      return {
        jackpot: true,
        minesHit: 3,
        score: res.score,
        bits: res.bits,
      };
    }

    // BUST
    // 1) Mark correct mine guesses as confirmed flags
    for (const m of mineCells) {
      m.slotFlag = false;
      m.flagged = true;
    }

    // 2) Reveal safe cells and flood if adjacent == 0
    for (const s of safeCells) {
      s.slotFlag = false;
      s.flagged = false;
      s.revealed = true;
      if (s.adjacent === 0) {
        const layers = this.board.flood(s);
        for (const layer of layers) {
          for (const c of layer) c.revealed = true;
        }
      }
    }

    this.hull--;
    this.clicks++; // Click compensation
    this.combo = 0;
    this.roundMult = 0;
    this.isCashoutRolling = false;

    if (this.hull <= 0) {
      this.lossReason = 'hull';
      this.status = 'lost';
    }

    this.emit({ type: 'change' });

    return {
      jackpot: false,
      minesHit: mineCells.length,
      score: 0,
      bits: 0,
    };
  }

  /** Resolves 3-slot jackpot win: defuses all 3 mines, awards jackpot score, combo, bits */
  resolveSlotJackpot(slots: Cell[]): { score: number; bits: number } {
    const jackpotScore = Math.round(this.target * 1.5);
    const bonusBits = 3;

    for (const c of slots) {
      c.mine = false;
      c.slotFlag = false;
      c.flagged = false;
      c.revealed = true;
      c.defused = true;
    }

    this.board.recomputeAdjacents();

    // Cascade safe cells around the 3 jackpot detonated points
    for (const m of slots) {
      for (const n of this.board.neighbors(m)) {
        if (!n.revealed && !n.mine && !n.flagged && !n.slotFlag) {
          const layers = this.board.flood(n);
          if (layers.length) {
            for (const layer of layers) {
              for (const c of layer) c.revealed = true;
            }
          } else {
            n.revealed = true;
          }
        }
      }
    }

    this.score += jackpotScore;
    this.combo += 3;
    this.bits += bonusBits;

    if (!this.cleared && this.score >= this.target) {
      this.cleared = true;
      this.emit({ type: 'cleared' });
    }
    if (this.cleared) {
      const newLvl = Math.max(0, Math.floor((this.score - this.target) / (this.target * CONFIG.overchargeBitStep)));
      if (newLvl > this.overchargeLevel) {
        this.overchargeLevel = newLvl;
        this.emit({ type: 'overchargeUp', level: newLvl });
      }
    }
    if (this.board.safeRemaining() === 0) {
      this.cleared = true;
    }

    this.isCashoutRolling = false;
    this.emit({ type: 'change' });
    return { score: jackpotScore, bits: bonusBits };
  }

  /** Resolves false flag penalty: 1 HP lost, combo reset to 0 */
  resolveCashoutBust(faultCell: Cell): void {
    faultCell.flagged = false;
    faultCell.slotFlag = false;
    faultCell.revealed = true;
    faultCell.wrong = true;
    this.hull--;
    this.combo = 0;
    this.isCashoutRolling = false;
    if (this.hull <= 0) {
      this.lossReason = 'cashout';
      this.status = 'lost';
    }
    this.emit({ type: 'change' });
  }

  /** Resolves jackpot win: defuses all mines, updates adjacents, opens safe neighbors, awards score & bits */
  resolveCashoutJackpot(flaggedCells: Cell[]): { score: number; mult: number; count: number } {
    const mult = cashoutMultiplier(flaggedCells.length);
    const score = cashoutScore(flaggedCells.length, this.combo);

    for (const c of flaggedCells) {
      c.mine = false;
      c.flagged = false;
      c.revealed = true;
      c.defused = true;
    }

    // Update numbers on adjacent cells
    this.board.recomputeAdjacents();

    // Safely reveal / cascade safe cells around detonation points
    for (const m of flaggedCells) {
      for (const n of this.board.neighbors(m)) {
        if (!n.revealed && !n.mine && !n.flagged) {
          const layers = this.board.flood(n);
          if (layers.length) {
            for (const layer of layers) {
              for (const c of layer) c.revealed = true;
            }
          } else {
            n.revealed = true;
          }
        }
      }
    }

    this.score += score;
    this.combo += flaggedCells.length;

    // Bonus bits for daring gambles
    if (flaggedCells.length >= 6) this.bits += 2;
    else if (flaggedCells.length >= 3) this.bits += 1;

    if (!this.cleared && this.score >= this.target) {
      this.cleared = true;
      this.emit({ type: 'cleared' });
    }
    if (this.cleared) {
      const newLvl = Math.max(0, Math.floor((this.score - this.target) / (this.target * CONFIG.overchargeBitStep)));
      if (newLvl > this.overchargeLevel) {
        this.overchargeLevel = newLvl;
        this.emit({ type: 'overchargeUp', level: newLvl });
      }
    }
    if (this.board.safeRemaining() === 0) {
      this.cleared = true;
    }

    this.isCashoutRolling = false;
    this.emit({ type: 'change' });
    return { score, mult, count: flaggedCells.length };
  }

  private reveal(cell: Cell): void {
    const ns = this.board.neighbors(cell);
    const hasRevealedNeighbor = ns.some((n) => n.revealed);
    const wasBlind = !hasRevealedNeighbor;

    if (!this.board.generated) this.board.generate(cell);
    const ctx = this.beginTurn();

    if (cell.mine) {
      // Подрыв: обнуление бонуса «Отвага и слабоумие» и «Не уследить»
      this.blindClicks = 0;
      this.daredevilActive = false;
      this.checkSpeedStreak(ctx, true);
      this.hitMine(cell, ctx);
    } else {
      // Безопасный клик
      if (wasBlind) {
        this.blindClicks++;
        if (this.daredevilActive) {
          ctx.xMult *= 10;
          ctx.callouts.unshift('🤩 «ОТВАГА И СЛАБОУМИЕ» ×10!');
        } else if (this.blindClicks >= 5) {
          this.daredevilActive = true;
          ctx.xMult *= 10;
          ctx.callouts.unshift('🤩 «ОТВАГА И СЛАБОУМИЕ» ВКЛЮЧЕНО! ×10 ОЧКОВ!');
        } else {
          ctx.callouts.push(`🎲 НАУГАД: ${this.blindClicks}/5`);
        }
      } else {
        // Клик рядом с открытой цифрой: обнуление бонуса
        if (this.daredevilActive) {
          ctx.callouts.push('😌 РАСЧЁТЛИВЫЙ КЛИК: РЕЖИМ СБРОШЕН');
        }
        this.blindClicks = 0;
        this.daredevilActive = false;
      }
      this.checkSpeedStreak(ctx, false);
      this.openSafe(cell, ctx);
    }

    this.endTurn(ctx, cell);
  }

  private chord(cell: Cell): void {
    if (cell.adjacent === 0 || cell.exploded) return;
    const ns = this.board.neighbors(cell);
    if (ns.filter((n) => n.flagged || n.exploded).length !== cell.adjacent) return;
    const targets = ns.filter((n) => !n.revealed && !n.flagged);
    if (!targets.length) return;

    // Чорд — это продуманный клик по открытой цифре, сбрасывает режим наугад
    if (this.daredevilActive) {
      this.daredevilActive = false;
    }
    this.blindClicks = 0;

    const ctx = this.beginTurn();
    for (const t of targets) {
      if (t.revealed) continue;
      if (t.mine) this.hitMine(t, ctx);
      else this.openSafe(t, ctx);
    }
    this.checkSpeedStreak(ctx, ctx.exploded);
    this.endTurn(ctx, cell);
  }

  private checkSpeedStreak(ctx: TurnContext, isDetonation: boolean): void {
    if (this.speedDemonTimer) {
      clearTimeout(this.speedDemonTimer);
      this.speedDemonTimer = undefined;
    }

    if (isDetonation) {
      this.fastClicks = 0;
      this.speedDemonActive = false;
      this.lastRevealTime = 0;
      return;
    }

    const now = performance.now();
    const delta = this.lastRevealTime > 0 ? now - this.lastRevealTime : Infinity;
    this.lastRevealTime = now;

    if (delta < 1000) {
      this.fastClicks++;
      if (this.speedDemonActive) {
        ctx.xMult *= 3;
        ctx.callouts.unshift('🚀 «НЕ УСЛЕДИТЬ» ×3!');
      } else if (this.fastClicks >= 3) {
        this.speedDemonActive = true;
        ctx.xMult *= 3;
        ctx.callouts.unshift('🚀 «НЕ УСЛЕДИТЬ» ВКЛЮЧЕНО! ×3 БОНУС!');
      } else {
        ctx.callouts.push(`⚡ СКОРОСТЬ: ${this.fastClicks}/3`);
      }
    } else {
      if (this.speedDemonActive) {
        this.speedDemonActive = false;
        ctx.callouts.push('🐢 ЗАМЕДЛЕНИЕ: РЕЖИМ СБРОШЕН');
      }
      this.fastClicks = 0;
    }

    if (this.speedDemonActive || this.fastClicks > 0) {
      this.speedDemonTimer = setTimeout(() => {
        if (this.status === 'playing' && (this.speedDemonActive || this.fastClicks > 0)) {
          this.speedDemonActive = false;
          this.fastClicks = 0;
          this.lastRevealTime = 0;
          this.emit({ type: 'change' });
        }
      }, 1020);
    }
  }

  // ---------- Turn Pipeline ----------

  private beginTurn(): TurnContext {
    this.clicks--;
    const ctx: TurnContext = {
      data: 0,
      mult: 1 + this.combo * CONFIG.comboMultStep + this.roundMult,
      xMult: 1,
      cascadeSteps: 0,
      revealed: [],
      exploded: false,
      callouts: [],
    };
    this.currentTurnContext = ctx;
    return ctx;
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
    if (layers.length > 1) {
      const cascadeMult = (ctx.cascadeSteps * CONFIG.cascadeMultStep).toFixed(1);
      ctx.callouts.push(`КАСКАД +${cascadeMult} Mult`);
      this.runHook('onCascade', (h) => h(this, ctx, layers.flat()));
    }
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
    let score = Math.round(ctx.data * ctx.mult * ctx.xMult);

    const prevCombo = this.combo;
    let comboBroken = false;
    if (ctx.exploded) {
      // Hitting a mine costs 1 HP and breaks combo multiplier, but keeps score and refunds the wasted click!
      this.clicks++; // Compensate click so mine hit doesn't burn battery in vain
      this.combo = 0;
      this.roundMult = 0;
      score = 0;
      comboBroken = prevCombo >= 1;
      ctx.callouts.unshift(prevCombo >= 1 ? `💥 ПОДРЫВ! -1 HP · СЕРИЯ СБИТА` : '💥 ПОДРЫВ! -1 HP');
    } else {
      this.score += score;
      this.combo = prevCombo + 1;
      if (this.combo >= 2) {
        const bonusStr = (this.combo * CONFIG.comboMultStep).toFixed(1);
        const title =
          this.combo >= 8
            ? `⚡ ${this.combo} В РЯД! (+${bonusStr} Mult)`
            : this.combo >= 5
              ? `🔥 ${this.combo} В РЯД! (+${bonusStr} Mult)`
              : `${this.combo} В РЯД! (+${bonusStr} Mult)`;
        ctx.callouts.unshift(title);
      }
    }

    this.lastTurn = {
      data: ctx.data,
      mult: ctx.mult,
      xMult: ctx.xMult,
      score,
      cells: ctx.revealed.length,
      exploded: ctx.exploded,
      origin: { x: origin.x, y: origin.y },
      callouts: ctx.callouts,
      comboStreak: this.combo,
      comboBroken,
    };
    this.currentTurnContext = undefined;
    this.emit({ type: 'turn', result: this.lastTurn });
    if (!this.cleared && this.score >= this.target) {
      this.cleared = true;
      this.emit({ type: 'cleared' });
    }
    if (this.cleared) {
      const newLvl = Math.max(0, Math.floor((this.score - this.target) / (this.target * CONFIG.overchargeBitStep)));
      if (newLvl > this.overchargeLevel) {
        this.overchargeLevel = newLvl;
        this.emit({ type: 'overchargeUp', level: newLvl });
      }
    }

    this.checkCompletionConditions();

    if (this.hull <= 0) {
      this.lossReason = 'hull';
      this.status = 'lost';
      this.emit({ type: 'change' });
      return;
    }

    if (this.clicks <= 0) {
      if (!this.cleared) {
        this.lossReason = 'clicks';
        this.status = 'lost';
        this.emit({ type: 'change' });
        return;
      } else {
        this.endRound();
        this.emit({ type: 'change' });
        return;
      }
    }

    this.emit({ type: 'change' });
  }

  checkCompletionConditions(): void {
    if (this.status !== 'playing' || !this.board.generated) return;

    const mines = this.board.cells.filter((c) => c.mine);
    const flags = this.board.cells.filter((c) => c.flagged);

    // Number of active mines on board (mines that are not defused)
    const activeMines = mines.filter((c) => !c.defused);
    const flaggedActiveMines = activeMines.filter((c) => c.flagged);
    const falseFlags = flags.filter((c) => !c.mine);
    const safeRemaining = this.board.safeRemaining();
    const totalSafe = this.board.cells.filter((c) => !c.mine && !c.defused).length;

    // All active mines correctly flagged and zero false flags
    const allMinesCorrectlyFlagged =
      activeMines.length > 0 &&
      flaggedActiveMines.length === activeMines.length &&
      falseFlags.length === 0;

    // Case 1: ПОЛНАЯ ЗАЧИСТКА (Full Clear)
    // All safe cells revealed AND all active mines correctly flagged
    if (safeRemaining === 0 && allMinesCorrectlyFlagged) {
      if (this.specialClear !== 'full') {
        this.specialClear = 'full';
        this.cleared = true;
        const bonusBits = 10;
        const bonusScore = 500;
        this.bits += bonusBits;
        this.score += bonusScore;
        this.emit({ type: 'fullClear', bonusBits, bonusScore });
      }
      return;
    }

    // Case 2: ЗАЧИСТКА ВСЛЕПУЮ (Blind Clear) or ЖУЛИК (Cheater)
    // All active mines correctly flagged, but territory is still hidden
    // At least 15% of safe cells or at least 3 safe cells unrevealed
    const unrevealedSafe = this.board.cells.filter((c) => !c.mine && !c.defused && !c.revealed).length;
    const isBlindClearThreshold = unrevealedSafe >= Math.max(3, Math.round(totalSafe * 0.15));

    if (allMinesCorrectlyFlagged && isBlindClearThreshold && !this.specialClear) {
      if (this.cheaterDetected) {
        // Cheater detected: blind guessing the final flags!
        this.specialClear = 'cheater';
        this.cleared = true;
        const penalty = 500;
        this.cheaterPenalty = penalty;
        this.score = Math.max(0, this.score - penalty);
        this.nextLevelHalfFlags = true;
        this.emit({ type: 'cheaterCaught', penalty });
      } else {
        // Legitimate blind clear
        this.specialClear = 'blind';
        this.cleared = true;
        const bonusBits = 12;
        const bonusScore = 600;
        this.bits += bonusBits;
        this.score += bonusScore;
        this.emit({ type: 'blindClear', bonusBits, bonusScore });
      }
    }
  }

  private endRound(): void {
    if (this.hull <= 0) {
      this.lossReason = 'hull';
      this.status = 'lost';
      return;
    }
    if (!this.cleared) {
      this.lossReason = 'clicks';
      this.status = 'lost';
      return;
    }
    const correctFlags = this.board.cells.filter((c) => c.flagged && c.mine).length;
    this.score += correctFlags * CONFIG.flagRoundEndData;
    this.runHook('onRoundEnd', (h) => h(this));

    // Return any un-rolled slot flags remaining on board to consumable inventory
    const lingeringSlotFlags = this.board.cells.filter((c) => c.slotFlag).length;
    for (let i = 0; i < lingeringSlotFlags; i++) {
      this.refundSlotCharge();
    }

    const overcharge = Math.floor((this.score - this.target) / (this.target * CONFIG.overchargeBitStep));
    let bitsEarned = CONFIG.bitsPerWin + this.clicks * CONFIG.bitsPerClickLeft + Math.max(0, overcharge);
    if (this.currentEncounterType === 'elite') bitsEarned += 3;
    if (this.currentEncounterType === 'boss') bitsEarned += 5;
    this.bits += bitsEarned;

    if (this.currentMapNode) {
      this.currentMapNode.completed = true;
    }

    if (this.currentEncounterType === 'boss') {
      if (this.map.act >= 3) {
        this.status = 'victory';
      } else {
        const nextAct = this.map.act + 1;
        this.map = generateActMap(nextAct);
        this.currentMapNode = this.map.nodes[0];
        this.status = 'map';
      }
    } else {
      this.status = 'map';
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
