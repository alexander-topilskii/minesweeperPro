import type { Cell, Board } from './board';
import type { Game } from './game';

export type PrototypeMode = 'vanilla' | 'mode1_chord' | 'mode2_patterns' | 'mode3_claim';

export interface HandScoreResult {
  name: string;
  description: string;
  chips: number;
  mult: number;
  totalScore: number;
  badge?: string;
}

export class PrototypeManager {
  public currentMode: PrototypeMode = 'vanilla';

  // Mode 3 (Hand selection) state:
  public selectedCells: Cell[] = [];
  public maxSelected = 5;
  public handsLeft = 4;
  public maxHands = 4;

  constructor(private game: Game) {}

  setGame(g: Game): void {
    this.game = g;
    this.selectedCells = [];
  }

  setMode(mode: PrototypeMode): void {
    this.currentMode = mode;
    this.selectedCells = [];
    this.handsLeft = this.maxHands;

    // Restart stage with target appropriate for the mode
    if (mode === 'mode1_chord') {
      this.game.startStage(0, 'battle');
      this.game.target = 350;
      this.game.clicks = 40;
    } else if (mode === 'mode2_patterns') {
      this.game.startStage(0, 'battle');
      this.game.target = 400;
      this.game.clicks = 45;
    } else if (mode === 'mode3_claim') {
      this.game.startStage(0, 'battle');
      this.game.target = 400;
      this.game.clicks = 40;
      this.handsLeft = 4;
    } else {
      this.game.startStage(0, 'battle');
    }
  }

  // ==========================================
  // MODE 1: CHORD КАК РУКА (The Chording Hand)
  // ==========================================
  evaluateChord(cell: Cell, openedCells: Cell[], cascadeDepth: number): HandScoreResult {
    let baseChips = 20;
    let baseMult = 2;
    let handName = `АККОРД [${cell.adjacent}]`;
    let badge = '🎯';

    if (cell.adjacent === 1) {
      baseChips = 20;
      baseMult = 2;
      handName = 'АККОРД НА [1]';
    } else if (cell.adjacent === 2) {
      baseChips = 35;
      baseMult = 3;
      handName = 'АККОРД НА [2]';
    } else if (cell.adjacent === 3) {
      baseChips = 55;
      baseMult = 4.5;
      handName = 'АККОРД НА [3]';
    } else if (cell.adjacent >= 4) {
      baseChips = 85;
      baseMult = 6;
      handName = `ТЯЖЁЛЫЙ АККОРД НА [${cell.adjacent}]`;
      badge = '⚡';
    }

    // Bonus for volume of cells opened in chord
    const cellChips = openedCells.reduce((sum, c) => {
      return sum + (c.adjacent === 0 ? 25 : c.adjacent * 12);
    }, 0);

    if (openedCells.length >= 4) {
      baseChips += 30;
      baseMult += 1.5;
      badge = '💥';
      handName = `МАССИВНЫЙ ${handName} (${openedCells.length} клеток)`;
    }

    if (cascadeDepth > 0) {
      baseChips += cascadeDepth * 20;
      baseMult += cascadeDepth * 1;
      handName += ' + ОАЗИС 🌊';
    }

    const totalChips = baseChips + cellChips;
    const finalMult = Number((baseMult + this.game.combo * 0.2).toFixed(1));
    const totalScore = Math.round(totalChips * finalMult);

    return {
      name: handName,
      description: `База ${baseChips} + Клетки ${cellChips} Chips | x${finalMult} Mult`,
      chips: totalChips,
      mult: finalMult,
      totalScore,
      badge,
    };
  }

  // ==========================================
  // MODE 2: ПАТТЕРНЫ САПЁРА (Minesweeper Patterns)
  // ==========================================
  detectPattern(board: Board, origin: Cell, cascadeCount: number): HandScoreResult {
    // 1. Check for 1-2-1 Pattern in horizontal or vertical lines around origin
    const is121 = this.checkPatternSequence(board, origin, [1, 2, 1]);
    if (is121) {
      const chips = 65;
      const mult = Number((4.5 + this.game.combo * 0.2).toFixed(1));
      return {
        name: 'ПАТТЕРН 1-2-1 👑',
        description: 'Легендарная классика Сапёра: мины по краям, центр свободен',
        chips,
        mult,
        totalScore: Math.round(chips * mult),
        badge: '👑',
      };
    }

    // 2. Check for 1-2-2-1 Pattern
    const is1221 = this.checkPatternSequence(board, origin, [1, 2, 2, 1]);
    if (is1221) {
      const chips = 95;
      const mult = Number((6 + this.game.combo * 0.2).toFixed(1));
      return {
        name: 'ПАТТЕРН 1-2-2-1 ⚡',
        description: 'Редкая симметричная связка Сапёра',
        chips,
        mult,
        totalScore: Math.round(chips * mult),
        badge: '⚡',
      };
    }

    // 3. Oasis cascade (3+ zero cells opened)
    if (cascadeCount >= 3) {
      const chips = 40 + cascadeCount * 8;
      const mult = Number((3.5 + this.game.combo * 0.2).toFixed(1));
      return {
        name: 'ОАЗИС НУЛЕЙ 🌊',
        description: `Каскадный прорыв (${cascadeCount} нулей)`,
        chips,
        mult,
        totalScore: Math.round(chips * mult),
        badge: '🌊',
      };
    }

    // 4. Corner Triple / Lock (3 or higher at boundary)
    if (origin.adjacent >= 3 && (origin.x === 0 || origin.x === board.w - 1 || origin.y === 0 || origin.y === board.h - 1)) {
      const chips = 50;
      const mult = Number((3.0 + this.game.combo * 0.2).toFixed(1));
      return {
        name: 'УГЛОВОЙ ЗАМОК 📐',
        description: `Цифра ${origin.adjacent} на границе поля`,
        chips,
        mult,
        totalScore: Math.round(chips * mult),
        badge: '📐',
      };
    }

    // 5. Triple Wall (three identical numbers next to each other, e.g. 1-1-1 or 2-2-2)
    const isWall = this.checkTripleIdentical(board, origin);
    if (isWall) {
      const chips = 35;
      const mult = Number((2.5 + this.game.combo * 0.2).toFixed(1));
      return {
        name: `СТЕНА ${origin.adjacent}-ЕК 🧱`,
        description: `Линия одинаковых цифр [${origin.adjacent}-${origin.adjacent}-${origin.adjacent}]`,
        chips,
        mult,
        totalScore: Math.round(chips * mult),
        badge: '🧱',
      };
    }

    // Fallback: standard clean reveal
    const chips = origin.adjacent === 0 ? 20 : origin.adjacent * 10;
    const mult = Number((1.2 + this.game.combo * 0.1).toFixed(1));
    return {
      name: origin.adjacent === 0 ? 'ЧИСТАЯ ПОЛЯНА' : `ОТКРЫТИЕ [${origin.adjacent}]`,
      description: 'Базовое раскрытие ячейки',
      chips,
      mult,
      totalScore: Math.round(chips * mult),
      badge: '🔍',
    };
  }

  private checkPatternSequence(board: Board, origin: Cell, seq: number[]): boolean {
    const len = seq.length;
    // Horizontal scan [-len+1 .. len-1]
    for (let startX = origin.x - len + 1; startX <= origin.x; startX++) {
      let match = true;
      for (let i = 0; i < len; i++) {
        const c = board.get(startX + i, origin.y);
        if (!c || !c.revealed || c.mine || c.adjacent !== seq[i]) {
          match = false;
          break;
        }
      }
      if (match) return true;
    }
    // Vertical scan
    for (let startY = origin.y - len + 1; startY <= origin.y; startY++) {
      let match = true;
      for (let i = 0; i < len; i++) {
        const c = board.get(origin.x, startY + i);
        if (!c || !c.revealed || c.mine || c.adjacent !== seq[i]) {
          match = false;
          break;
        }
      }
      if (match) return true;
    }
    return false;
  }

  private checkTripleIdentical(board: Board, origin: Cell): boolean {
    if (!origin.revealed || origin.mine || origin.adjacent === 0) return false;
    const val = origin.adjacent;
    // Horizontal check
    for (let dx = -2; dx <= 0; dx++) {
      const c1 = board.get(origin.x + dx, origin.y);
      const c2 = board.get(origin.x + dx + 1, origin.y);
      const c3 = board.get(origin.x + dx + 2, origin.y);
      if (c1?.revealed && c2?.revealed && c3?.revealed && c1.adjacent === val && c2.adjacent === val && c3.adjacent === val) {
        return true;
      }
    }
    // Vertical check
    for (let dy = -2; dy <= 0; dy++) {
      const c1 = board.get(origin.x, origin.y + dy);
      const c2 = board.get(origin.x, origin.y + dy + 1);
      const c3 = board.get(origin.x, origin.y + dy + 2);
      if (c1?.revealed && c2?.revealed && c3?.revealed && c1.adjacent === val && c2.adjacent === val && c3.adjacent === val) {
        return true;
      }
    }
    return false;
  }

  // ==========================================
  // MODE 3: ВЫБОР КОМБИНАЦИЙ (Claiming Hand)
  // ==========================================
  toggleSelectCell(cell: Cell): boolean {
    if (!cell.revealed || cell.mine || cell.frozen) return false;
    const idx = this.selectedCells.indexOf(cell);
    if (idx >= 0) {
      this.selectedCells.splice(idx, 1);
      return true;
    }
    if (this.selectedCells.length >= this.maxSelected) {
      return false;
    }
    this.selectedCells.push(cell);
    return true;
  }

  clearSelection(): void {
    this.selectedCells = [];
  }

  evaluateSelectedHand(): HandScoreResult {
    if (!this.selectedCells.length) {
      return {
        name: 'ВЫБЕРИТЕ КЛЕТКИ',
        description: 'Кликайте по открытым цифрам на поле (до 5 шт)',
        chips: 0,
        mult: 0,
        totalScore: 0,
      };
    }

    const digits = this.selectedCells.map((c) => c.adjacent).sort((a, b) => a - b);
    const counts: Record<number, number> = {};
    for (const d of digits) counts[d] = (counts[d] || 0) + 1;
    const freq = Object.values(counts).sort((a, b) => b - a);

    // Sum of digit values as card chips
    const cardChips = digits.reduce((sum, d) => sum + (d === 0 ? 15 : d * 8), 0);

    // 1. Straight (e.g., 1-2-3-4 or 1-2-3-4-5 or 2-3-4-5)
    const isStraight =
      digits.length >= 4 &&
      digits.every((val, i) => i === 0 || val === digits[i - 1] + 1);

    // 2. Four of a Kind (Каре)
    const isFour = freq[0] >= 4;

    // 3. Full House (3 + 2)
    const isFullHouse = freq[0] === 3 && freq[1] >= 2;

    // 4. Three of a Kind (Сет)
    const isThree = freq[0] === 3;

    // 5. Two Pair (Две пары)
    const isTwoPair = freq[0] === 2 && freq[1] === 2;

    // 6. One Pair (Пара)
    const isPair = freq[0] === 2;

    let baseChips = 15;
    let baseMult = 1.2;
    let handName = 'РАЗНОБОЙ';
    let badge = '🃏';

    if (isStraight) {
      baseChips = 60;
      baseMult = 5;
      handName = `СТРИТ (${digits.join('-')})`;
      badge = '🌈';
    } else if (isFour) {
      baseChips = 75;
      baseMult = 6;
      handName = 'КАРЕ ЧЕТЫРЁХ';
      badge = '💎';
    } else if (isFullHouse) {
      baseChips = 50;
      baseMult = 4;
      handName = 'ФУЛЛ-ХАУС';
      badge = '🏠';
    } else if (isThree) {
      baseChips = 35;
      baseMult = 3;
      handName = 'СЕТ (ТРОЙКА)';
      badge = '🎯';
    } else if (isTwoPair) {
      baseChips = 25;
      baseMult = 2.2;
      handName = 'ДВЕ ПАРЫ';
      badge = '✌️';
    } else if (isPair) {
      baseChips = 15;
      baseMult = 1.8;
      handName = 'ОДНА ПАРА';
      badge = '🔹';
    }

    const totalChips = baseChips + cardChips;
    const finalMult = Number((baseMult + this.game.combo * 0.15).toFixed(1));
    const totalScore = Math.round(totalChips * finalMult);

    return {
      name: handName,
      description: `Карты +${cardChips} Chips | x${finalMult} Mult`,
      chips: totalChips,
      mult: finalMult,
      totalScore,
      badge,
    };
  }
}
