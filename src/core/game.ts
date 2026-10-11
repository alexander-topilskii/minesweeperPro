import { Board, type Cell } from './board';
import { CONFIG, calcBitsReward, minesFor, targetFor } from '../config';
import type { ConsumableDef, ModuleDef, ModuleHooks, TurnContext } from './types';
import { MODULES, getModule, sellValue } from '../modules/registry';
import { getConsumable } from '../modules/consumables';
import { generateActMap, type MapData, type MapNode, type NodeType } from './map';
import { BehaviorTracker } from './behaviorTracker';

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
  | { type: 'flagLimit' }
  | { type: 'stageCompletePending' }
  | { type: 'fairyFound'; cell: Cell }
  | { type: 'fairyRevived' }
  | { type: 'bossFairyReward' }
  | { type: 'longMatch'; bonusBits: number; cell: Cell }
  | { type: 'frozenCellClicked'; cell: Cell };

export class Game {
  board!: Board;
  stage = 0;
  score = 0;
  target = 0;
  clicks = 0;
  hull: number = CONFIG.hull;
  bits = 0;
  combo = 0;
  /** Number of Fairies in a Bottle held in inventory (revives upon defeat) */
  fairies = 0;
  /** Number of fairies spawned in the current Act (max 2) */
  actFairiesSpawned = 0;
  /** Permanent-for-round additive Mult (e.g. Extremum). */
  roundMult = 0;
  /** Target reached this round; play continues for overcharge until resources run out or player advances. */
  cleared = false;
  overchargeLevel = 0;
  status: RoundStatus = 'playing';
  /** Explicit reason for game over (loss) */
  lossReason?: 'clicks' | 'hull' | 'cashout';
  lastTurn?: TurnResult;
  /** True while the 3-slot machine jackpot roll animation is active. */
  isSlotRolling = false;
  /** Per-round scratch state for modules, keyed by module id. */
  roundState: Record<string, unknown> = {};

  /** Special clear outcome: 'full' (полная зачистка), 'blind' (зачистка вслепую), 'cheater' (жулик) */
  specialClear?: 'full' | 'blind' | 'cheater';
  cheaterPenalty = 0;
  nextLevelHalfFlags = false;
  halfFlagsDebuff = false;
  maxFlags?: number;
  extraFlags = 0;

  /** Playstyle tracking & heuristics (speed demon, daredevil, anti-cheat) */
  readonly behavior = new BehaviorTracker(() => this.emit({ type: 'change' }));

  get speedDemonActive(): boolean {
    return this.behavior.speedDemonActive;
  }
  get daredevilActive(): boolean {
    return this.behavior.daredevilActive;
  }
  get cheaterDetected(): boolean {
    return this.behavior.cheaterDetected;
  }

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
    if (this.board && this.board.frozenCount > 0) return '🧊 Крио-сектор';
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
    let frozenCount = 0;

    const isAct2 = this.map ? this.map.act === 2 : Math.floor(stage / 8) === 1;
    if (isAct2) {
      // Act 2: All sectors are 14x14 (same size as Act 1 Boss arena)
      boardW = 14;
      boardH = 14;
      mineCount = 18 + Math.min(6, stage % 8);
      clicks = encounterType === 'boss' ? CONFIG.bossClicks : 60;

      // Cryo sectors with frozen impassable cells in Act 2
      if (encounterType !== 'boss' && ((stage % 2 === 1) || encounterType === 'elite')) {
        frozenCount = 14;
      }
    }

    if (encounterType === 'elite') {
      mineCount += 3;
      targetScore = Math.round(targetScore * 1.2);
    } else if (encounterType === 'boss') {
      boardW = 14;
      boardH = 14;
      mineCount = Math.round(mineCount * 1.4) + 2;
      targetScore = Math.round(targetScore * 1.3);
      clicks = CONFIG.bossClicks; // 70 clicks for massive boss arena
    }

    this.halfFlagsDebuff = this.nextLevelHalfFlags;
    this.nextLevelHalfFlags = false;
    this.maxFlags = this.halfFlagsDebuff
      ? Math.max(1, Math.floor(mineCount / 2))
      : mineCount + this.extraFlags;
    this.cheaterPenalty = 0;
    this.specialClear = undefined;
    this.behavior.resetRound();

    this.board = new Board(boardW, boardH, mineCount, Math.random, frozenCount);
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
    this.isSlotRolling = false;
    this.lossReason = undefined;
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
      const stageIndex = (this.map.act - 1) * 8 + node.floor;
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

  /** Generates board mines and seeds a Fairy in a Bottle if eligible. */
  generateBoard(safe: Cell): void {
    if (this.board.generated) return;
    this.board.generate(safe);
    this.maybeSpawnFairy(safe);
  }

  /**
   * Starting from Act 2 (map.act >= 2), up to 2 times across the entire segment,
   * a Fairy in a Bottle can spawn in a safe empty cell.
   */
  private maybeSpawnFairy(safe: Cell): void {
    if (!this.map || this.map.act < 2) return;
    if (this.actFairiesSpawned >= 2) return;
    if (this.currentEncounterType !== 'battle' && this.currentEncounterType !== 'elite' && this.currentEncounterType !== 'boss') return;

    const floor = this.currentMapNode?.floor ?? (this.stage % 8);
    const needed = 2 - this.actFairiesSpawned;
    const remainingFloors = Math.max(1, 8 - floor);

    // Guaranteed if remaining combat opportunities are scarce, otherwise high probability (~50%)
    const chance = remainingFloors <= needed ? 1.0 : Math.max(0.45, needed / remainingFloors);
    if (Math.random() > chance) return;

    // Pick an empty safe cell (preferring adjacent === 0, or any !c.mine, avoiding the clicked safe start)
    const zeroSafeCandidates = this.board.cells.filter((c) => !c.mine && c.adjacent === 0 && c !== safe);
    const anySafeCandidates = this.board.cells.filter((c) => !c.mine && c !== safe);
    const pool = zeroSafeCandidates.length > 0 ? zeroSafeCandidates : anySafeCandidates;

    if (pool.length > 0) {
      const chosen = pool[Math.floor(Math.random() * pool.length)];
      chosen.hasFairy = true;
      this.actFairiesSpawned++;
    }
  }

  checkFairy(cell: Cell, callouts?: string[]): boolean {
    if (cell.hasFairy && !cell.fairyCollected && cell.revealed) {
      cell.fairyCollected = true;
      this.fairies++;
      if (callouts) {
        callouts.unshift('🧚‍♀️ ФЕЯ В БАНКЕ НАЙДЕНА!');
      }
      this.emit({ type: 'fairyFound', cell });
      return true;
    }
    return false;
  }

  /**
   * Revives player after total defeat: consumes 1 fairy and restarts current stage/sector with full HP.
   */
  useFairyRevive(): boolean {
    if (this.fairies <= 0) return false;
    this.fairies--;
    this.status = 'playing';
    this.lossReason = undefined;
    this.startStage(this.stage, this.currentEncounterType);
    this.emit({ type: 'fairyRevived' });
    this.emit({ type: 'change' });
    return true;
  }

  /**
   * Detects when the player was forced into a guess/50-50 choice and correctly picked safe:
   * "Вытянул длинную спичку" (+$3 Bits reward).
   */
  checkLongMatch(cell: Cell, ctx: TurnContext): boolean {
    if (cell.mine) return false;

    const unrevealed = this.board.cells.filter((c) => !c.revealed && !c.defused);
    const unrevealedMines = unrevealed.filter((c) => c.mine).length;

    // 1. Endgame 50/50: Exactly 2 unopened cells left on the whole field, exactly 1 is a mine!
    const isEndgame5050 = unrevealed.length === 2 && unrevealedMines === 1;

    // 2. Endgame guess: 3-4 unopened cells left with at least 1 mine when most of the board has been swept
    const isEndgameGuess =
      unrevealed.length <= 4 &&
      unrevealedMines >= 1 &&
      unrevealedMines < unrevealed.length &&
      this.board.cells.filter((c) => c.revealed).length >= 15;

    // 3. Local 50/50: cell touches a revealed neighbor where exactly 1 mine is needed among 2 unrevealed neighbors
    let isLocal5050 = false;
    const revealedNeighbors = this.board.neighbors(cell).filter((n) => n.revealed);
    for (const n of revealedNeighbors) {
      const ns = this.board.neighbors(n);
      const unrev = ns.filter((c) => !c.revealed && !c.flagged);
      const flags = ns.filter((c) => c.flagged).length;
      const needed = n.adjacent - flags;
      if (needed === 1 && unrev.length === 2 && unrev.includes(cell)) {
        const other = unrev.find((c) => c !== cell);
        if (other && ((cell.mine && !other.mine) || (!cell.mine && other.mine))) {
          // Verify that neither cell had an obvious free chord from any other neighbor
          const cellHasTrivialSafe = this.board.neighbors(cell).some((rn) => {
            if (!rn.revealed) return false;
            const rflags = this.board.neighbors(rn).filter((c) => c.flagged).length;
            return rn.adjacent - rflags === 0;
          });
          const otherHasTrivialSafe = this.board.neighbors(other).some((rn) => {
            if (!rn.revealed) return false;
            const rflags = this.board.neighbors(rn).filter((c) => c.flagged).length;
            return rn.adjacent - rflags === 0;
          });
          if (!cellHasTrivialSafe && !otherHasTrivialSafe) {
            isLocal5050 = true;
            break;
          }
        }
      }
    }

    if (isEndgame5050 || isLocal5050 || isEndgameGuess) {
      const bonusBits = 3;
      this.bits += bonusBits;
      ctx.callouts.unshift('🥢 ВЫТЯНУЛ ДЛИННУЮ СПИЧКУ! (+$3)');
      this.emit({ type: 'longMatch', bonusBits, cell });
      return true;
    }
    return false;
  }

  // ---------- Player Actions ----------

  click(x: number, y: number): void {
    const cell = this.board.get(x, y);
    if (!cell || this.status !== 'playing' || this.isSlotRolling || this.clicks <= 0) return;

    if (cell.frozen) {
      this.emit({ type: 'frozenCellClicked', cell });
      return;
    }

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
    if (this.isSlotRolling) return;
    const cell = this.board.get(x, y);
    if (!cell || this.status !== 'playing' || cell.revealed || cell.frozen) return;

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
      this.generateBoard(cell);
    }

    cell.flagged = !cell.flagged;

    if (cell.flagged) {
      const hasRevealedNeighbor = this.board.neighbors(cell).some((n) => n.revealed);
      const currentFlags = this.board.cells.filter((c) => c.flagged).length;
      const totalMines = this.board.cells.filter((c) => c.mine).length;
      const flagsRemaining = totalMines - currentFlags;
      this.behavior.onFlagPlaced(hasRevealedNeighbor, flagsRemaining);
    }

    this.checkCompletionConditions();
    this.emit({ type: 'change' });
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
    this.isSlotRolling = false;
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
      this.checkFairy(s);
      if (s.adjacent === 0) {
        const layers = this.board.flood(s);
        for (const layer of layers) {
          for (const c of layer) {
            c.revealed = true;
            this.checkFairy(c);
          }
        }
      }
    }

    this.hull--;
    this.clicks++; // Click compensation
    this.combo = 0;
    this.roundMult = 0;
    this.isSlotRolling = false;

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
      c.slotFlag = false;
      c.flagged = false;
      c.revealed = true;
      c.defused = true;
    }

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

    this.isSlotRolling = false;
    this.emit({ type: 'change' });
    return { score: jackpotScore, bits: bonusBits };
  }

  private reveal(cell: Cell): void {
    const ns = this.board.neighbors(cell);
    const hasRevealedNeighbor = ns.some((n) => n.revealed);
    const wasBlind = !hasRevealedNeighbor;

    if (!this.board.generated) this.generateBoard(cell);
    const ctx = this.beginTurn();

    if (cell.mine) {
      this.behavior.onMineHit(ctx);
      this.hitMine(cell, ctx);
    } else {
      this.checkLongMatch(cell, ctx);
      this.behavior.onCellReveal(cell, wasBlind, ctx);
      this.openSafe(cell, ctx);
    }

    this.endTurn(ctx, cell);
  }

  private chord(cell: Cell): void {
    if (this.clicks <= 0 || cell.mine || cell.adjacent === 0 || cell.exploded || cell.defused) return;
    const ns = this.board.neighbors(cell);
    if (ns.filter((n) => n.flagged || n.exploded || n.defused).length !== cell.adjacent) return;
    const targets = ns.filter((n) => !n.revealed && !n.flagged && !n.frozen);
    if (!targets.length) return;

    this.behavior.onChord();

    const ctx = this.beginTurn();
    let safeOpened = 0;
    for (const t of targets) {
      if (t.revealed) continue;
      if (t.mine) {
        this.hitMine(t, ctx);
      } else {
        safeOpened++;
        this.checkLongMatch(t, ctx);
        this.openSafe(t, ctx);
      }
    }

    // Analytical play reward: Safe chording is battery-neutral!
    // If chord opened at least 1 safe cell and didn't explode, refund the click.
    if (!ctx.exploded && safeOpened > 0) {
      this.clicks++;
      ctx.callouts.unshift('🧠 ХОРД: БАТАРЕЯ СБЕРЕЖЕНА (+1 клик)');
    }

    this.behavior.checkSpeedStreak(ctx, ctx.exploded);
    this.endTurn(ctx, cell);
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
        this.checkFairy(c, ctx.callouts);
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
      this.combo = 0;
      this.roundMult = 0;
      score = 0;
      comboBroken = prevCombo >= 1;
      ctx.callouts.unshift(prevCombo >= 1 ? `💥 ПОДРЫВ! -1 HP · СЕРИЯ СБИТА` : '💥 ПОДРЫВ! -1 HP');

      // Rule: "если после набора очков человек не нажал дальше но подорвался - он проиграл"
      if (this.cleared) {
        this.lossReason = 'hull';
        this.status = 'lost';
      } else if (this.hull <= 0) {
        this.lossReason = 'hull';
        this.status = 'lost';
      } else {
        // Survived mine hit: compensate click so battery isn't burned in vain
        this.clicks++;
      }
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

      // Mastery momentum: every 5 combo streak rewards +1 Click!
      if (this.combo > 0 && this.combo % 5 === 0) {
        this.clicks++;
        ctx.callouts.unshift(`🔋 СЕРИЯ ${this.combo}: +1 КЛИК!`);
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

    // If player died on this turn, notify HUD and stop immediately!
    if (this.status === 'lost') {
      this.emit({ type: 'change' });
      return;
    }

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

    if (this.clicks <= 0) {
      if (!this.cleared) {
        this.lossReason = 'clicks';
        this.status = 'lost';
        this.emit({ type: 'change' });
        return;
      } else {
        // Battery depleted after achieving the goal:
        // Popup is only shown if the field was fully swept/cleared! Otherwise immediately open map.
        if (this.specialClear === 'full' || this.specialClear === 'blind') {
          this.emit({ type: 'stageCompletePending' });
        } else {
          this.endRound();
        }
        this.emit({ type: 'change' });
        return;
      }
    }

    this.emit({ type: 'change' });
  }

  checkCompletionConditions(): void {
    if (this.status !== 'playing' || this.hull <= 0 || !this.board.generated) return;

    const mines = this.board.cells.filter((c) => c.mine);
    const flags = this.board.cells.filter((c) => c.flagged);

    // Number of active mines on board (mines that are not defused)
    const activeMines = mines.filter((c) => !c.defused);
    const safeRemaining = this.board.safeRemaining();
    const totalSafe = this.board.cells.filter((c) => !c.mine && !c.defused).length;

    // If all safe cells on the board have been revealed:
    // Auto-flag all remaining active mines so the board is complete!
    if (safeRemaining === 0 && activeMines.length > 0) {
      for (const m of activeMines) {
        m.flagged = true;
      }
    }

    const flaggedActiveMines = activeMines.filter((c) => c.flagged);
    const falseFlags = flags.filter((c) => !c.mine);

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
    const bitsEarned = calcBitsReward(this.clicks, overcharge, this.currentEncounterType);
    this.bits += bitsEarned;

    if (this.currentMapNode) {
      this.currentMapNode.completed = true;
    }

    if (this.currentEncounterType === 'boss') {
      if (this.map.act === 1) {
        this.fairies++;
        this.emit({ type: 'bossFairyReward' });
      }
      if (this.map.act >= 3) {
        this.status = 'victory';
      } else {
        const nextAct = this.map.act + 1;
        this.map = generateActMap(nextAct);
        this.currentMapNode = this.map.nodes[0];
        this.actFairiesSpawned = 0;
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
