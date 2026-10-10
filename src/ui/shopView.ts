import type { Game } from '../core/game';
import { CONFIG, minesFor, targetFor } from '../config';
import { sellValue } from '../modules/registry';
import type { ConsumableDef, ModuleDef } from '../core/types';

const $ = (id: string) => document.getElementById(id)!;
const pad = (n: number, len: number) => String(Math.max(0, Math.min(n, 10 ** len - 1))).padStart(len, '0');

export class ShopView {
  constructor(
    private game: Game,
    private actions: {
      onStartStage(): void;
      onBuy(): void;
      onReroll(): void;
    },
  ) {
    this.bindEvents();
  }

  setGame(game: Game): void {
    this.game = game;
  }

  private bindEvents(): void {
    $('btn-reroll').addEventListener('click', () => {
      if (this.game.rerollShop()) {
        this.actions.onReroll();
        this.render();
      }
    });

    $('btn-start-stage').addEventListener('click', () => {
      this.actions.onStartStage();
    });

    $('shop-module-offers').addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('[data-buy-mod]') as HTMLElement | null;
      if (!btn) return;
      const modId = btn.dataset.buyMod;
      const mod = this.game.shopOffers.modules.find((m) => m.id === modId);
      if (mod && this.game.buyModule(mod)) {
        this.actions.onBuy();
        this.render();
      }
    });

    $('shop-cons-offers').addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('[data-buy-con]') as HTMLElement | null;
      if (!btn) return;
      const conId = btn.dataset.buyCon;
      const con = this.game.shopOffers.consumables.find((c) => c.id === conId);
      if (con && this.game.buyConsumable(con)) {
        this.actions.onBuy();
        this.render();
      }
    });

    $('shop-player-modules').addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('[data-sell-mod]') as HTMLElement | null;
      if (!btn) return;
      const idx = Number(btn.dataset.sellMod);
      if (this.game.sellModule(idx)) {
        this.render();
      }
    });

    $('shop-player-consumables').addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('[data-sell-con]') as HTMLElement | null;
      if (!btn) return;
      const idx = Number(btn.dataset.sellCon);
      if (this.game.sellConsumable(idx)) {
        this.render();
      }
    });
  }

  render(): void {
    const g = this.game;
    $('shop-sector').textContent = String(g.sector);
    $('shop-bits').textContent = `$${pad(g.bits, 3)}`;
    $('shop-mod-count').textContent = String(g.modules.length);
    $('shop-con-count').textContent = String(g.consumables.length);
    $('reroll-cost').textContent = String(g.rerollCost);

    const btnReroll = $('btn-reroll') as HTMLButtonElement;
    btnReroll.disabled = g.bits < g.rerollCost;

    // Next Stage Preview
    const nextStage = g.stage + 1;
    const nextTarget = targetFor(nextStage);
    const nextMines = minesFor(nextStage);
    const stageNames = ['Стандартный сканер', 'Глубокий сканер', 'Аномалия'];
    const nextStageName = stageNames[nextStage % 3];
    $('shop-next-name').textContent = nextStageName;
    $('shop-next-target').textContent = String(nextTarget);
    $('shop-next-mines').textContent = String(nextMines);

    // Render Module Offers
    const modOffersEl = $('shop-module-offers');
    if (!g.shopOffers.modules.length) {
      modOffersEl.innerHTML = `<div class="empty-offer">Ассортимент распродан</div>`;
    } else {
      modOffersEl.innerHTML = g.shopOffers.modules
        .map((m) => this.renderModuleCard(m, g.bits, g.modules.length >= CONFIG.moduleSlots))
        .join('');
    }

    // Render Consumable Offers
    const conOffersEl = $('shop-cons-offers');
    if (!g.shopOffers.consumables.length) {
      conOffersEl.innerHTML = `<div class="empty-offer">Расходники распроданы</div>`;
    } else {
      conOffersEl.innerHTML = g.shopOffers.consumables
        .map((c) => this.renderConsumableCard(c, g.bits, g.consumables.length >= CONFIG.consumableSlots))
        .join('');
    }

    // Render Player Inventory
    const playerModsEl = $('shop-player-modules');
    playerModsEl.innerHTML = Array.from({ length: CONFIG.moduleSlots }, (_, i) => {
      const m = g.modules[i];
      if (!m) return `<div class="inv-slot empty">Свободный слот модуля</div>`;
      const sellPrice = sellValue(m.cost);
      return `<div class="inv-slot bevel-out">
        <div class="inv-info">
          <b>${m.name}</b>
          <small>${m.description}</small>
        </div>
        <button class="btn bevel-out btn-sell" data-sell-mod="${i}">ПРОДАТЬ (+$${sellPrice})</button>
      </div>`;
    }).join('');

    const playerConsEl = $('shop-player-consumables');
    playerConsEl.innerHTML = Array.from({ length: CONFIG.consumableSlots }, (_, i) => {
      const c = g.consumables[i];
      if (!c) return `<div class="inv-slot empty">Свободный слот расходника</div>`;
      const sellPrice = sellValue(c.cost);
      return `<div class="inv-slot bevel-out">
        <div class="inv-info">
          <b>${c.name} ${c.maxCharges ? `(${c.charges ?? c.maxCharges}/${c.maxCharges})` : ''}</b>
          <small>${c.description}</small>
        </div>
        <button class="btn bevel-out btn-sell" data-sell-con="${i}">ПРОДАТЬ (+$${sellPrice})</button>
      </div>`;
    }).join('');
  }

  private renderModuleCard(m: ModuleDef, currentBits: number, isFull: boolean): string {
    const canAfford = currentBits >= m.cost && !isFull;
    const catClass = `cat-${m.category.toLowerCase()}`;
    const rarityLabel = { common: 'Обычный', uncommon: 'Необычный', rare: 'Редкий' }[m.rarity];
    return `
      <div class="card bevel-out ${catClass} ${m.rarity}">
        <div class="card-head">
          <span class="badge cat">${m.category}</span>
          <span class="badge rarity">${rarityLabel}</span>
        </div>
        <div class="card-name">${m.name}</div>
        <div class="card-name-en">${m.nameEn}</div>
        <div class="card-desc">${m.description}</div>
        <button class="btn bevel-out btn-buy" data-buy-mod="${m.id}" ${canAfford ? '' : 'disabled'}>
          ${isFull ? 'МЕСТ НЕТ' : `КУПИТЬ: $${m.cost}`}
        </button>
      </div>
    `;
  }

  private renderConsumableCard(c: ConsumableDef, currentBits: number, isFull: boolean): string {
    const canAfford = currentBits >= c.cost && !isFull;
    return `
      <div class="card bevel-out consumable">
        <div class="card-head">
          <span class="badge consumable">РАСХОДНИК ${c.maxCharges ? `(${c.maxCharges} ШТ)` : ''}</span>
          <span class="badge type">${c.targetType === 'cell' ? 'ПРИЦЕЛ' : 'МГНОВЕННЫЙ'}</span>
        </div>
        <div class="card-name">${c.name} ${c.maxCharges ? `(${c.maxCharges} шт)` : ''}</div>
        <div class="card-name-en">${c.nameEn}</div>
        <div class="card-desc">${c.description}</div>
        <button class="btn bevel-out btn-buy" data-buy-con="${c.id}" ${canAfford ? '' : 'disabled'}>
          ${isFull ? 'МЕСТ НЕТ' : `КУПИТЬ: $${c.cost}`}
        </button>
      </div>
    `;
  }
}
