import type { ConsumableDef } from '../core/types';

export const CONSUMABLES: ConsumableDef[] = [
  {
    id: 'CON-01',
    name: 'Импульсный сонар',
    nameEn: 'Pulse Sonar',
    description: 'Гарантированно открывает безопасную закрытую клетку с максимумом соседей',
    cost: 4,
    targetType: 'instant',
    use(game) {
      if (!game.board.generated) {
        // Find center-ish cell to start
        const center = game.board.get(Math.floor(game.board.w / 2), Math.floor(game.board.h / 2));
        if (center) {
          game.click(center.x, center.y);
          return true;
        }
      }
      // Pick unrevealed safe cell with highest adjacent count (or zero)
      const safeUnrevealed = game.board.cells.filter((c) => !c.revealed && !c.mine && !c.flagged);
      if (!safeUnrevealed.length) return false;
      // Sort by zero first or high adjacent
      safeUnrevealed.sort((a, b) => (b.adjacent === 0 ? 10 : b.adjacent) - (a.adjacent === 0 ? 10 : a.adjacent));
      const target = safeUnrevealed[0];
      game.click(target.x, target.y);
      return true;
    },
  },
  {
    id: 'CON-02',
    name: 'Нейтрализатор',
    nameEn: 'Defuser',
    description: 'Обезвреживает закрытую плитку (если там мина — дает +3 Bits)',
    cost: 4,
    targetType: 'cell',
    use(game, cell) {
      if (!cell || cell.revealed) return false;
      if (!game.board.generated) game.board.generate(cell);
      if (cell.mine) {
        cell.mine = false;
        cell.flagged = false;
        game.bits += 3;
        // Recalculate neighbors
        for (const n of game.board.neighbors(cell)) {
          n.adjacent = game.board.neighbors(n).filter((nn) => nn.mine).length;
        }
        cell.adjacent = game.board.neighbors(cell).filter((nn) => nn.mine).length;
        game.click(cell.x, cell.y);
      } else {
        game.click(cell.x, cell.y);
      }
      return true;
    },
  },
  {
    id: 'CON-03',
    name: 'Сейсмо-заряд',
    nameEn: 'Seismic Charge',
    description: 'Мгновенно покрывает 20% от целевых очков раунда',
    cost: 5,
    targetType: 'instant',
    use(game) {
      const bonus = Math.round(game.target * 0.2);
      game.score += bonus;
      if (!game.cleared && game.score >= game.target) {
        game.cleared = true;
      }
      return true;
    },
  },
  {
    id: 'CON-04',
    name: 'Перезагрузка',
    nameEn: 'Reboot',
    description: 'Сбрасывает закрытые мины и пересчитывает поле, сохраняя очки',
    cost: 5,
    targetType: 'instant',
    use(game) {
      if (!game.board.generated) return false;
      // Count remaining unrevealed mines
      const hiddenMines = game.board.cells.filter((c) => !c.revealed && c.mine).length;
      const hiddenPool = game.board.cells.filter((c) => !c.revealed);
      if (hiddenMines === 0 || hiddenPool.length <= hiddenMines) return false;

      // Clear mines on hidden cells
      for (const c of hiddenPool) {
        c.mine = false;
        c.flagged = false;
      }
      // Shuffle & redistribute mines among hidden cells
      for (let i = 0; i < hiddenMines; i++) {
        const j = i + Math.floor(Math.random() * (hiddenPool.length - i));
        [hiddenPool[i], hiddenPool[j]] = [hiddenPool[j], hiddenPool[i]];
        hiddenPool[i].mine = true;
      }
      // Recalculate adjacents for all cells
      for (const c of game.board.cells) {
        c.adjacent = game.board.neighbors(c).filter((n) => n.mine).length;
      }
      return true;
    },
  },
];

export function getConsumable(id: string): ConsumableDef {
  const c = CONSUMABLES.find((item) => item.id === id);
  if (!c) throw new Error(`Unknown consumable ${id}`);
  return c;
}
