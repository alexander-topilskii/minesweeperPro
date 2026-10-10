import type { ConsumableDef } from '../core/types';

export const CONSUMABLES: ConsumableDef[] = [
  {
    id: 'CON-SLOT',
    name: 'Флаг-Слот 🎰',
    nameEn: 'Slot Flag',
    description: 'Комплект из 3 флагов-слотов. Установите 3 слота на мины для запуска джекпота 7-7-7!',
    cost: 3,
    charges: 3,
    maxCharges: 3,
    targetType: 'cell',
    use(_game, cell) {
      if (!cell || cell.revealed || cell.slotFlag) return false;
      cell.slotFlag = true;
      cell.flagged = false; // replaces regular flag if any
      return true;
    },
  },
];

export function getConsumable(id: string): ConsumableDef {
  const c = CONSUMABLES.find((item) => item.id === id);
  if (!c) throw new Error(`Unknown consumable ${id}`);
  return c;
}
