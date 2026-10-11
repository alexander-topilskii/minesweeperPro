import type { ModuleDef } from '../core/types';

/** Implemented modules from docs/content/modules/*. */
/**
 * Active in-game shop module pool.
 * Only non-score utility, survival, battery, and economy modules are present.
 * Score/mult-boosting modules are stashed below to preserve the economy.
 */
export const MODULES: ModuleDef[] = [
  // --- HAZ: Survival & Armor ---
  {
    id: 'MOD-HAZ-HP',
    name: 'Бронекапсула (+1 HP)',
    nameEn: 'Armor Plating (+1 HP)',
    description: '+1 слот HP (восстанавливается в начале каждого сектора: +1 → 3 HP).',
    category: 'HAZ',
    rarity: 'uncommon',
    cost: 5,
    hooks: {},
  },
  {
    id: 'MOD-HAZ-FUGAS',
    name: 'Направленный фугас',
    nameEn: 'Shaped Charge',
    description: 'Подрыв на мине принудительно открывает все 8 клеток вокруг эпицентра бесплатно',
    category: 'HAZ',
    rarity: 'rare',
    cost: 6,
    hooks: {
      onMineHit(g, ctx, cell) {
        g.fire('MOD-HAZ-FUGAS');
        const neighbors = g.board.neighbors(cell);
        for (const n of neighbors) {
          if (!n.revealed && n.mine) {
            n.defused = true;
            n.revealed = true;
            n.flagged = false;
          }
        }
        for (const n of neighbors) {
          if (!n.revealed && !n.mine) {
            n.flagged = false;
            g.openSafe(n, ctx);
          }
        }
        ctx.callouts.push('💥 НАПРАВЛЕННЫЙ ФУГАС: 3×3 ВСКРЫТО!');
      },
    },
  },
  {
    id: 'MOD-HAZ-01',
    name: 'Реактивная броня',
    nameEn: 'Explosive Reactive Armor',
    description: 'Подрыв без урона + вскрытие 3×3 вокруг (1 раз за раунд)',
    category: 'HAZ',
    rarity: 'uncommon',
    cost: 7,
    hooks: {
      onMineHit(g, ctx, cell, ev) {
        if (g.roundState['MOD-HAZ-01']) return;
        g.roundState['MOD-HAZ-01'] = true;
        ev.prevented = true;
        for (const n of g.board.neighbors(cell)) {
          if (!n.mine && !n.revealed && !n.flagged) g.openSafe(n, ctx);
        }
        g.fire('MOD-HAZ-01');
      },
    },
  },
  {
    id: 'MOD-HAZ-06',
    name: 'Сапер-камикадзе',
    nameEn: 'Kamikaze Sapper',
    description: 'Завершение раунда с ровно 1 HP начисляет +$15',
    category: 'HAZ',
    rarity: 'rare',
    cost: 7,
    hooks: {
      onRoundEnd(g) {
        if (g.hull === 1) {
          g.bits += 15;
          g.fire('MOD-HAZ-06');
        }
      },
    },
  },

  // --- RUL: Battery & Movement Utility ---
  {
    id: 'MOD-RUL-06',
    name: 'Сверхпроводник',
    nameEn: 'Superconductor',
    description: 'Каскадная волна нулей → +1 клик батареи',
    category: 'RUL',
    rarity: 'uncommon',
    cost: 6,
    hooks: {
      onCascade(g) {
        g.clicks += 1;
        g.fire('MOD-RUL-06');
      },
    },
  },

  // --- ECO: Economy & Bits ---
  {
    id: 'MOD-ECO-01',
    name: 'Сборщик лома',
    nameEn: 'Scrap Harvester',
    description: 'Подрыв на мине приносит +$4 компенсации',
    category: 'ECO',
    rarity: 'common',
    cost: 4,
    hooks: {
      onMineHit(g) {
        g.bits += 4;
        g.fire('MOD-ECO-01');
      },
    },
  },
  {
    id: 'MOD-ECO-02',
    name: 'Золотая жила',
    nameEn: 'Midas Probe',
    description: 'Каждые 4 открытых нуля в каскаде дают +$1',
    category: 'ECO',
    rarity: 'uncommon',
    cost: 6,
    hooks: {
      onCascade(g, _, cells) {
        const zeros = cells.filter((c) => c.adjacent === 0).length;
        const bitsEarned = Math.floor(zeros / 4);
        if (bitsEarned > 0) {
          g.bits += bitsEarned;
          g.fire('MOD-ECO-02');
        }
      },
    },
  },
  {
    id: 'MOD-ECO-03',
    name: 'Генератор Теслы',
    nameEn: 'Kinetic Battery',
    description: 'Каждые 8 открытых клеток подряд восстанавливают +1 клик',
    category: 'ECO',
    rarity: 'uncommon',
    cost: 6,
    hooks: {
      onReveal(g) {
        let count = ((g.roundState['MOD-ECO-03'] as number) || 0) + 1;
        if (count >= 8) {
          g.clicks += 1;
          count = 0;
          g.fire('MOD-ECO-03');
        }
        g.roundState['MOD-ECO-03'] = count;
      },
    },
  },
];

/**
 * Stashed score/mult-boosting modules.
 * Temporarily disabled per game balance design until score overhaul.
 */
export const STASHED_SCORE_MODULES: ModuleDef[] = [
  {
    id: 'MOD-VAL-01',
    name: 'Бинарный код',
    nameEn: 'Binary Core',
    description: '1 → +15 Data; 2 → +4 Mult',
    category: 'VAL',
    rarity: 'common',
    cost: 4,
    hooks: {
      onReveal(g, ctx, c) {
        if (c.adjacent === 1) (ctx.data += 15), g.fire('MOD-VAL-01');
        if (c.adjacent === 2) (ctx.mult += 4), g.fire('MOD-VAL-01');
      },
    },
  },
  {
    id: 'MOD-VAL-02',
    name: 'Четный фронт',
    nameEn: 'Even Split',
    description: 'Чётные цифры (2, 4, 6, 8) → +5 Mult',
    category: 'VAL',
    rarity: 'common',
    cost: 5,
    hooks: {
      onReveal(g, ctx, c) {
        if (c.adjacent > 0 && c.adjacent % 2 === 0) (ctx.mult += 5), g.fire('MOD-VAL-02');
      },
    },
  },
  {
    id: 'MOD-VAL-03',
    name: 'Нечетный импульс',
    nameEn: 'Odd Charge',
    description: 'Нечётные цифры (1, 3, 5, 7) → +25 Data',
    category: 'VAL',
    rarity: 'common',
    cost: 5,
    hooks: {
      onReveal(g, ctx, c) {
        if (c.adjacent % 2 === 1) (ctx.data += 25), g.fire('MOD-VAL-03');
      },
    },
  },
  {
    id: 'MOD-VAL-04',
    name: 'Троичный триггер',
    nameEn: 'Triangulation',
    description: 'Цифра 3 → +10 Mult, если открыто ≥2 соседа',
    category: 'VAL',
    rarity: 'common',
    cost: 5,
    hooks: {
      onReveal(g, ctx, c) {
        if (c.adjacent === 3) {
          const openNeighbors = g.board.neighbors(c).filter((n) => n.revealed).length;
          if (openNeighbors >= 2) {
            ctx.mult += 10;
            g.fire('MOD-VAL-04');
          }
        }
      },
    },
  },
  {
    id: 'MOD-VAL-05',
    name: 'Критическая масса',
    nameEn: 'High Roller',
    description: '4+ → +50 Data, +8 Mult',
    category: 'VAL',
    rarity: 'uncommon',
    cost: 6,
    hooks: {
      onReveal(g, ctx, c) {
        if (c.adjacent >= 4) (ctx.data += 50), (ctx.mult += 8), g.fire('MOD-VAL-05');
      },
    },
  },
  {
    id: 'MOD-VAL-06',
    name: 'Одинокий пик',
    nameEn: 'Deadlock 8',
    description: '8 → +200 Data, ×5 счёт хода',
    category: 'VAL',
    rarity: 'rare',
    cost: 8,
    hooks: {
      onReveal(g, ctx, c) {
        if (c.adjacent === 8) (ctx.data += 200), (ctx.xMult *= 5), g.fire('MOD-VAL-06');
      },
    },
  },
  {
    id: 'MOD-VAL-08',
    name: 'Тройной интеграл',
    nameEn: 'Triple Integral',
    description: 'Цифра 3 удваивает множитель хода',
    category: 'VAL',
    rarity: 'uncommon',
    cost: 6,
    hooks: {
      onReveal(g, ctx, c) {
        if (c.adjacent === 3) (ctx.xMult *= 2), g.fire('MOD-VAL-08');
      },
    },
  },
  {
    id: 'MOD-VAL-09',
    name: 'Экстремум',
    nameEn: 'Extremum',
    description: 'Цифры 5+ дают +3 Mult на весь раунд',
    category: 'VAL',
    rarity: 'uncommon',
    cost: 7,
    hooks: {
      onReveal(g, _, c) {
        if (c.adjacent >= 5) {
          g.roundMult += 3;
          g.fire('MOD-VAL-09');
        }
      },
    },
  },
  {
    id: 'MOD-SCL-01',
    name: 'Бортовой самописец',
    nameEn: 'Black Box',
    description: '+0.1× Mult за верный флаг (сброс при взрыве)',
    category: 'SCL',
    rarity: 'uncommon',
    cost: 6,
    hooks: {
      onReveal(g, ctx) {
        const correctFlags = g.board.cells.filter((c) => c.flagged && c.mine).length;
        if (correctFlags > 0) {
          ctx.xMult *= 1 + correctFlags * 0.1;
          g.fire('MOD-SCL-01');
        }
      },
      onMineHit(g) {
        g.roundState['MOD-SCL-01'] = 0;
      },
    },
  },
  {
    id: 'MOD-SCL-02',
    name: 'Счетчик Гейгера',
    nameEn: 'Geiger Counter',
    description: '+1 Mult за каждую клетку рядом с минами (копится за раунд)',
    category: 'SCL',
    rarity: 'uncommon',
    cost: 6,
    hooks: {
      onReveal(g, _, c) {
        if (c.adjacent > 0) {
          g.roundMult += 0.5;
          g.fire('MOD-SCL-02');
        }
      },
    },
  },
  {
    id: 'MOD-RUL-02',
    name: 'Цепной реактор',
    nameEn: 'Zero Shift',
    description: 'Каждый 0 в каскаде дает очки как цифра 1',
    category: 'RUL',
    rarity: 'common',
    cost: 5,
    hooks: {
      onReveal(g, ctx, c) {
        if (c.adjacent === 0) {
          ctx.data += 1;
          g.fire('MOD-RUL-02');
        }
      },
    },
  },
  {
    id: 'MOD-RUL-07',
    name: 'Периметр',
    nameEn: 'Corner Bonus',
    description: 'Открытие угловой клетки дает ×2 к счету хода',
    category: 'RUL',
    rarity: 'common',
    cost: 5,
    hooks: {
      onReveal(g, ctx, c) {
        const isCorner =
          (c.x === 0 || c.x === g.board.w - 1) &&
          (c.y === 0 || c.y === g.board.h - 1);
        if (isCorner) {
          ctx.xMult *= 2;
          g.fire('MOD-RUL-07');
        }
      },
    },
  },
  {
    id: 'MOD-HAZ-02',
    name: 'Адреналиновый насос',
    nameEn: 'Critical Threshold',
    description: 'Пока ровно 1 HP, весь счет хода ×2',
    category: 'HAZ',
    rarity: 'uncommon',
    cost: 6,
    hooks: {
      onReveal(g, ctx) {
        if (g.hull === 1) {
          ctx.xMult *= 2;
          g.fire('MOD-HAZ-02');
        }
      },
    },
  },
];

export function getModule(id: string): ModuleDef {
  const m = MODULES.find((mod) => mod.id === id) ?? STASHED_SCORE_MODULES.find((mod) => mod.id === id);
  if (!m) throw new Error(`Unknown module ${id}`);
  return m;
}

export function sellValue(cost: number): number {
  return Math.max(1, Math.floor(cost / 2));
}
