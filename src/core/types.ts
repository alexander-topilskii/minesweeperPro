import type { Cell } from './board';
import type { Game } from './game';

/** Accumulator for one player action (click / chord), including the whole cascade. */
export interface TurnContext {
  data: number;
  mult: number;
  xMult: number;
  cascadeSteps: number;
  revealed: Cell[];
  exploded: boolean;
}

export interface MineHitEvent {
  /** Set by modules to block hull damage. */
  prevented: boolean;
}

/** Trigger names match docs/glossary.md#триггеры. */
export interface ModuleHooks {
  onReveal(g: Game, ctx: TurnContext, cell: Cell): void;
  onCascade(g: Game, ctx: TurnContext, cells: Cell[]): void;
  onMineHit(g: Game, ctx: TurnContext, cell: Cell, ev: MineHitEvent): void;
  onRoundStart(g: Game): void;
  onRoundEnd(g: Game): void;
}

export type ModuleCategory = 'VAL' | 'SCL' | 'RUL' | 'HAZ' | 'ECO' | 'LEG';
export type Rarity = 'common' | 'uncommon' | 'rare';

export interface ModuleDef {
  /** Stable ID from docs/content/modules (e.g. MOD-VAL-01). */
  id: string;
  name: string;
  nameEn: string;
  description: string;
  category: ModuleCategory;
  rarity: Rarity;
  cost: number;
  hooks: Partial<ModuleHooks>;
}

export interface ConsumableDef {
  id: string;
  name: string;
  nameEn: string;
  description: string;
  cost: number;
  targetType: 'instant' | 'cell';
  use(game: Game, targetCell?: Cell): boolean;
}
