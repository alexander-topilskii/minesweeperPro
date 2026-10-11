import type { Game } from './game';
import { getModule } from '../modules/registry';
import { getConsumable } from '../modules/consumables';

export interface EventChoice {
  text: string;
  desc: string;
  apply(game: Game): { outcomeText: string; success: boolean };
}

export interface MapEvent {
  id: string;
  title: string;
  lore: string;
  choices: EventChoice[];
}

export const EVENTS_POOL: MapEvent[] = [
  {
    id: 'evt-probe',
    title: 'БРОШЕННЫЙ ИССЛЕДОВАТЕЛЬСКИЙ ЗОНД',
    lore: 'На обочине сектора дрейфует повреждённый геологический дрон. Его терминал всё ещё мерцает зелёным светом, передавая телеметрию в пустоту.',
    choices: [
      {
        text: '💾 Извлечь банк памяти',
        desc: 'Продать накопленные данные геологической разведки (+$3).',
        apply: (g) => {
          g.bits += 3;
          return { outcomeText: 'Данные извлечены и переведены на баланс: +$3.', success: true };
        },
      },
      {
        text: '🎰 Перепрошить микросхему под Слот-Флаг',
        desc: 'Собрать из деталей дрона расходник «Слот-флаг» (3 заряда).',
        apply: (g) => {
          if (g.consumables.length >= 3) {
            g.bits += 2;
            return { outcomeText: 'Нет свободных слотов расходников! Дрон утилизирован на металлолом: +$2.', success: false };
          }
          const slot = getConsumable('CON-SLOT');
          g.consumables.push({ ...slot, charges: slot.maxCharges });
          return { outcomeText: 'Микросхема адаптирована! В инвентарь добавлен «Слот-флаг» (3 заряда).', success: true };
        },
      },
      {
        text: '🔧 Снять титановую броню',
        desc: 'Использовать пластины обшивки для полевого ремонта корпуса (+1 HP).',
        apply: (g) => {
          g.hull = Math.min(g.hull + 1, g.maxHull);
          return { outcomeText: 'Обшивка усилена: Корпус восстановлен (+1 HP).', success: true };
        },
      },
    ],
  },
  {
    id: 'evt-generator',
    title: 'НЕСТАБИЛЬНЫЙ ГЕНЕРАТОР ПОЛЯ',
    lore: 'Вы натыкаетесь на пульсирующий силовой ретранслятор. Высокое напряжение гудит в воздухе, стрелки вольтметров зашкаливают.',
    choices: [
      {
        text: '⚡ Зарядить конденсаторы сканера',
        desc: 'Пополнить резерв питания (+5 кликов к батарее).',
        apply: (g) => {
          g.clicks += 5;
          return { outcomeText: 'Батарея поглотила избыточный импульс: +5 кликов!', success: true };
        },
      },
      {
        text: '🔥 Снять предохранитель цепи',
        desc: 'Рискованная перегрузка: +0.5 к комбо-серии, но удар током стоит 1 HP.',
        apply: (g) => {
          if (g.hull > 1) {
            g.hull--;
            g.roundMult += 0.5;
            return { outcomeText: 'Предохранитель снят! Разряд обжёг обшивку (-1 HP), но множитель сканера усилен (+0.5)!', success: true };
          } else {
            g.clicks += 3;
            return { outcomeText: 'Слишком опасно при 1 HP! Вы отступили, собрав лишь остаточный заряд: +3 клика.', success: false };
          }
        },
      },
      {
        text: '🛡️ Обойти аномалию',
        desc: 'Не рисковать системами сканера.',
        apply: () => {
          return { outcomeText: 'Вы безопасно миновали опасную зону.', success: true };
        },
      },
    ],
  },
  {
    id: 'evt-casino',
    title: 'АРКАДНЫЙ АВТОМАТ «НЕВАДА-777»',
    lore: 'В заброшенной капсуле отдыха шахтёров стоит работающий слот-автомат. Лампочки бегут по кругу, неоновая вывеска манит сыграть.',
    choices: [
      {
        text: '🪙 Бросить $1 в монетоприёмник',
        desc: '50% шанс сорвать куш +$4, 50% потерять $1.',
        apply: (g) => {
          if (g.bits < 1) {
            return { outcomeText: 'У вас нет $1 для игры в автомат!', success: false };
          }
          g.bits -= 1;
          const win = Math.random() < 0.6;
          if (win) {
            g.bits += 4;
            return { outcomeText: '🎰 ДЖЕКПОТ! Барабаны совпали: выигрыш +$4!', success: true };
          } else {
            return { outcomeText: 'Осечка! Барабаны показали лимон и вишню. Монета потеряна (-$1).', success: false };
          }
        },
      },
      {
        text: '💻 Подключить сервисный шлейф',
        desc: 'Взломать логику аппарата и извлечь блок слот-флага.',
        apply: (g) => {
          if (g.consumables.length >= 3) {
            g.bits += 2;
            return { outcomeText: 'Инвентарь полон! Вы обменяли механизм на $2.', success: false };
          }
          const slot = getConsumable('CON-SLOT');
          g.consumables.push({ ...slot, charges: slot.maxCharges });
          return { outcomeText: 'Взлом успешен! Из автомата извлечён модуль «Слот-флаг» (3 заряда).', success: true };
        },
      },
      {
        text: '🚶 Пройти мимо',
        desc: 'Азартные игры в шахте до добра не доводят.',
        apply: () => {
          return { outcomeText: 'Вы сохранили хладнокровие и пошли дальше.', success: true };
        },
      },
    ],
  },
  {
    id: 'evt-armory',
    title: 'АРСЕНАЛ ОТРЯДА САПЁРОВ',
    lore: 'Скрытый герметичный бокс с маркировкой тяжелой сапёрной роты. Замки оплавлены, но внутри остался нетронутый отсек хранения.',
    choices: [
      {
        text: '🛡️ Установить бронепластину',
        desc: 'Укрепить корпус (+1 к максимальному и текущему запасу HP).',
        apply: (g) => {
          const hpMod = getModule('MOD-HAZ-HP');
          if (g.modules.length < 5) {
            g.modules.push({ ...hpMod });
            g.hull++;
            return { outcomeText: 'Установлен модуль «Бронепластина»: +1 HP к запасу жизней!', success: true };
          } else {
            g.hull = Math.min(g.hull + 1, g.maxHull);
            return { outcomeText: 'Слоты модулей заполнены! Вы провели полевой ремонт: +1 HP.', success: true };
          }
        },
      },
      {
        text: '📦 Забрать аварийный запас батарей',
        desc: 'Пополнить запас энергии сканера (+8 кликов).',
        apply: (g) => {
          g.clicks += 8;
          return { outcomeText: 'Установлены резервные элементы питания: +8 кликов!', success: true };
        },
      },
    ],
  },
];

export function getRandomEvent(): MapEvent {
  const idx = Math.floor(Math.random() * EVENTS_POOL.length);
  return EVENTS_POOL[idx];
}
