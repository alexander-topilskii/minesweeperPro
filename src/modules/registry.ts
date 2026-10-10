import type { ModuleDef } from '../core/types';

/** Implemented modules. IDs and texts follow docs/content/modules/*. */
export const MODULES: ModuleDef[] = [
  {
    id: 'MOD-VAL-01',
    name: 'Бинарный код',
    nameEn: 'Binary Core',
    description: '1 → +15 Data; 2 → +4 Mult',
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
    description: 'Чётные цифры → +5 Mult',
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
    description: 'Нечётные цифры → +25 Data',
    hooks: {
      onReveal(g, ctx, c) {
        if (c.adjacent % 2 === 1) (ctx.data += 25), g.fire('MOD-VAL-03');
      },
    },
  },
  {
    id: 'MOD-VAL-05',
    name: 'Критическая масса',
    nameEn: 'High Roller',
    description: '4+ → +50 Data, +8 Mult',
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
    hooks: {
      onReveal(g, ctx, c) {
        if (c.adjacent === 8) (ctx.data += 200), (ctx.xMult *= 5), g.fire('MOD-VAL-06');
      },
    },
  },
  {
    id: 'MOD-RUL-06',
    name: 'Сверхпроводник',
    nameEn: 'Superconductor',
    description: 'Каскад → +1 клик',
    hooks: {
      onCascade(g) {
        g.clicks += 1;
        g.fire('MOD-RUL-06');
      },
    },
  },
  {
    id: 'MOD-HAZ-01',
    name: 'Реактивная броня',
    nameEn: 'Explosive Reactive Armor',
    description: 'Подрыв без урона + вскрытие 3×3 (1/раунд)',
    hooks: {
      onMineHit(g, ctx, cell, ev) {
        if (g.roundState['MOD-HAZ-01']) return;
        g.roundState['MOD-HAZ-01'] = true;
        ev.prevented = true;
        for (const n of g.board.neighbors(cell)) if (!n.mine && !n.revealed && !n.flagged) g.openSafe(n, ctx);
        g.fire('MOD-HAZ-01');
      },
    },
  },
  {
    id: 'MOD-ECO-01',
    name: 'Сборщик лома',
    nameEn: 'Scrap Harvester',
    description: 'Подрыв → +4 Bits',
    hooks: {
      onMineHit(g) {
        g.bits += 4;
        g.fire('MOD-ECO-01');
      },
    },
  },
];

export function getModule(id: string): ModuleDef {
  const m = MODULES.find((m) => m.id === id);
  if (!m) throw new Error(`Unknown module ${id}`);
  return m;
}
