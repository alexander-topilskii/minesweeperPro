import type { Game } from '../core/game';
import type { MapNode } from '../core/map';
import { MAP_COLS, nodeTypeIcon, nodeTypeName } from '../core/map';
import { getRandomEvent, type MapEvent } from '../core/events';

const $ = (id: string) => document.getElementById(id)!;

export class MapView {
  private currentEvent?: MapEvent;

  constructor(
    private game: Game,
    private actions: {
      onSelectBattle(node: MapNode): void;
      onOpenShop(node: MapNode): void;
      onPlaySfx(type: 'click' | 'relay' | 'fanfare'): void;
    },
  ) {
    this.bindEvents();
  }

  setGame(game: Game): void {
    this.game = game;
  }

  private bindEvents(): void {
    const treeEl = $('map-tree');
    if (treeEl) {
      treeEl.addEventListener('click', (e) => {
        const btn = (e.target as HTMLElement).closest('[data-node-id]') as HTMLElement | null;
        if (!btn) return;
        const nodeId = btn.dataset.nodeId!;
        this.handleNodeClick(nodeId);
      });
    }

    const modalEl = $('map-modal');
    if (modalEl) {
      modalEl.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const restAction = target.closest('[data-rest-choice]')?.getAttribute('data-rest-choice');
        if (restAction) {
          this.applyRestChoice(restAction);
          return;
        }

        const evtChoiceIdx = target.closest('[data-evt-choice]')?.getAttribute('data-evt-choice');
        if (evtChoiceIdx !== null && evtChoiceIdx !== undefined) {
          this.applyEventChoice(Number(evtChoiceIdx));
          return;
        }

        if (target.closest('[data-action="close-modal"]')) {
          this.closeModal();
        }
      });
    }
  }

  private handleNodeClick(nodeId: string): void {
    const map = this.game.map;
    const node = map.nodes.find((n) => n.id === nodeId);
    if (!node) return;

    // Check if node is available
    const currentNode = map.nodes.find((n) => n.id === map.currentNodeId);
    const isAvailable = currentNode ? currentNode.nextIds.includes(node.id) : false;
    if (!isAvailable) return;

    this.actions.onPlaySfx('click');

    if (node.type === 'rest') {
      map.currentNodeId = node.id;
      if (!map.visitedNodeIds.includes(node.id)) map.visitedNodeIds.push(node.id);
      this.game.currentMapNode = node;
      this.render();
      this.showRestModal(node);
      return;
    }

    if (node.type === 'event') {
      map.currentNodeId = node.id;
      if (!map.visitedNodeIds.includes(node.id)) map.visitedNodeIds.push(node.id);
      this.game.currentMapNode = node;
      this.render();
      this.showEventModal(node);
      return;
    }

    if (node.type === 'shop') {
      this.game.selectMapNode(node.id);
      this.actions.onOpenShop(node);
      return;
    }

    // battle, elite, boss
    this.game.selectMapNode(node.id);
    this.actions.onSelectBattle(node);
  }

  render(): void {
    const g = this.game;
    const map = g.map;
    if (!map) return;

    // Header updates
    $('map-sector-num').textContent = String(map.act);
    $('map-boss-name').textContent = map.bossName;
    $('map-hp').textContent = `${g.hull}/${g.maxHull}`;
    $('map-bits').textContent = `$${g.bits}`;

    const treeEl = $('map-tree');
    if (!treeEl) return;

    const currentNode = map.nodes.find((n) => n.id === map.currentNodeId);
    const availableIds = new Set(currentNode ? currentNode.nextIds : []);
    const visitedSet = new Set(map.visitedNodeIds);

    const svgLines = this.buildSvgConnections(map, availableIds, visitedSet);

    const nodesHtml = map.nodes
      .map((node) => {
        const isCurrent = node.id === map.currentNodeId;
        const isVisited = visitedSet.has(node.id);
        const isAvailable = availableIds.has(node.id);
        const { x, y } = this.pos(node);

        let stateCls = 'locked';
        if (isCurrent) stateCls = 'current';
        else if (isVisited) stateCls = 'visited';
        else if (isAvailable) stateCls = 'available';

        const icon = nodeTypeIcon(node.type);
        const name = node.type === 'boss' ? map.bossName : nodeTypeName(node.type);
        const delay = ((node.col * 0.17 + node.floor * 0.11) % 1).toFixed(2);

        return `
          <button class="map-node ${stateCls} type-${node.type}"
                  style="left:${x}%; top:${y}%; --d:${delay}s"
                  data-node-id="${node.id}"
                  ${isAvailable ? '' : 'disabled'}
                  title="${name}: ${node.desc}">
            <span class="node-disc"><span class="node-icon">${icon}</span></span>
            ${isCurrent ? '<span class="node-you">▲ ВЫ ЗДЕСЬ</span>' : ''}
            <span class="node-label">${name}</span>
          </button>
        `;
      })
      .join('');

    const railHtml = Array.from({ length: map.floorsCount }, (_, f) => {
      const label = f === 0 ? 'СТАРТ' : f === map.floorsCount - 1 ? 'БОСС' : `${f}`;
      return `<div class="map-rail-mark" style="top:${this.floorY(f)}%">${label}</div>`;
    }).join('');

    treeEl.innerHTML = `
      <div class="map-rail">${railHtml}</div>
      <svg class="map-connections" viewBox="0 0 100 100" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
        ${svgLines}
      </svg>
      <div class="map-nodes-container">
        ${nodesHtml}
      </div>
    `;
  }

  private buildSvgConnections(
    map: typeof this.game.map,
    availableIds: Set<string>,
    visitedSet: Set<string>,
  ): string {
    const locked: string[] = [];
    const visited: string[] = [];
    const avail: string[] = [];

    for (const node of map.nodes) {
      const a = this.pos(node);
      for (const nextId of node.nextIds) {
        const nextNode = map.nodes.find((n) => n.id === nextId);
        if (!nextNode) continue;
        const b = this.pos(nextNode);
        // Gentle S-curve between the two nodes
        const my = (a.y + b.y) / 2;
        const d = `M ${a.x} ${a.y} C ${a.x} ${my}, ${b.x} ${my}, ${b.x} ${b.y}`;

        if (visitedSet.has(node.id) && visitedSet.has(nextNode.id)) {
          visited.push(`<path d="${d}" class="map-line visited-path" />`);
        } else if (node.id === map.currentNodeId && availableIds.has(nextNode.id)) {
          avail.push(`<path d="${d}" class="map-line available-path" />`);
        } else {
          locked.push(`<path d="${d}" class="map-line locked-path" />`);
        }
      }
    }
    // Draw order: locked under, then visited, then available on top
    return locked.join('') + visited.join('') + avail.join('');
  }

  /** Deterministic pseudo-random in [-1, 1] from a string. */
  private jitter(seed: string, salt: number): number {
    let h = 2166136261 ^ salt;
    for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
    return ((h >>> 0) % 2000) / 1000 - 1;
  }

  private pos(node: MapNode): { x: number; y: number } {
    const cols = MAP_COLS;
    const fixed = node.type === 'boss' || node.floor === 0;
    const baseX = 14 + (node.col / (cols - 1)) * 72;
    const jx = fixed ? 0 : this.jitter(node.id, 1) * 4.5;
    const jy = fixed ? 0 : this.jitter(node.id, 2) * 2.2;
    return { x: +(baseX + jx).toFixed(2), y: +(this.floorY(node.floor) + jy).toFixed(2) };
  }

  private floorY(floor: number): number {
    // Floor 0 at bottom, boss at top (0..7)
    return +(91 - floor * 11.5).toFixed(2);
  }
  // ---------- REST SITE MODAL ----------

  private showRestModal(_node: MapNode): void {
    const modal = $('map-modal');
    if (!modal) return;
    modal.hidden = false;

    modal.innerHTML = `
      <div class="window dialog rest-dialog bevel-out">
        <div class="titlebar">
          <span class="title">🏕️ СЕРВИСНЫЙ ОТСЕК — ТЕХНИЧЕСКИЙ ПРИВАЛ</span>
        </div>
        <div class="dialog-body">
          <div class="dialog-content">
            <div class="rest-title">ТИХАЯ ЗОНА ТЕХОБСЛУЖИВАНИЯ</div>
            <p class="rest-desc">
              Перед продолжением опасного маршрута вы нашли аварийную станцию шахтёров.
              Выберите одну сервисную операцию:
            </p>
            <div class="rest-options">
              <button class="btn rest-btn bevel-out" data-rest-choice="repair">
                <span class="btn-icon">🔧</span>
                <span class="btn-text">
                  <b>Ремонт корпуса (+1 HP)</b>
                  <small>Восстановить целостность скафандра (текущие HP: ${this.game.hull}/${this.game.maxHull})</small>
                </span>
              </button>
              <button class="btn rest-btn bevel-out" data-rest-choice="battery">
                <span class="btn-icon">⚡</span>
                <span class="btn-text">
                  <b>Калибровка батареи (+5 кликов)</b>
                  <small>Пополнить заряд аккумулятора на следующий сектор</small>
                </span>
              </button>
              <button class="btn rest-btn bevel-out" data-rest-choice="scrap">
                <span class="btn-icon">💰</span>
                <span class="btn-text">
                  <b>Сбор металлолома (+$2)</b>
                  <small>Утилизировать старые детали для магазина</small>
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private applyRestChoice(choice: string): void {
    const g = this.game;
    let resultMsg = '';

    if (choice === 'repair') {
      g.hull = Math.min(g.hull + 1, g.maxHull);
      resultMsg = `🔧 Корпус отремонтирован! Текущий запас HP: ${g.hull}/${g.maxHull}`;
    } else if (choice === 'battery') {
      g.clicks += 5;
      resultMsg = `⚡ Аккумуляторы заряжены: +5 кликов к запасу батареи!`;
    } else if (choice === 'scrap') {
      g.bits += 2;
      resultMsg = `💰 Лом собран и переработан: Баланс +$2!`;
    }

    this.actions.onPlaySfx('relay');

    const modal = $('map-modal');
    if (!modal) return;

    modal.innerHTML = `
      <div class="window dialog rest-dialog bevel-out">
        <div class="titlebar">
          <span class="title">🏕️ СЕРВИСНЫЙ ОТСЕК — ГОТОВО</span>
        </div>
        <div class="dialog-body">
          <div class="dialog-content">
            <div class="rest-title" style="color:#00aa00;">ОПЕРАЦИЯ ЗАВЕРШЕНА</div>
            <p class="rest-desc" style="font-size:14px;font-weight:bold;color:#000;">${resultMsg}</p>
          </div>
        </div>
        <div class="dialog-btns">
          <button class="btn btn-primary bevel-out" data-action="close-modal">Продолжить путь ▶</button>
        </div>
      </div>
    `;
  }

  // ---------- EVENT MODAL ----------

  private showEventModal(_node: MapNode): void {
    const modal = $('map-modal');
    if (!modal) return;
    modal.hidden = false;

    this.currentEvent = getRandomEvent();
    const evt = this.currentEvent;

    const choicesHtml = evt.choices
      .map((c, idx) => `
        <button class="btn evt-btn bevel-out" data-evt-choice="${idx}">
          <b>${c.text}</b>
          <small>${c.desc}</small>
        </button>
      `)
      .join('');

    modal.innerHTML = `
      <div class="window dialog event-dialog bevel-out">
        <div class="titlebar">
          <span class="title">❓ НЕИЗВЕСТНЫЙ СИГНАЛ — ТЕРМИНАЛ DOS</span>
        </div>
        <div class="dialog-body">
          <div class="dialog-content">
            <div class="evt-title">${evt.title}</div>
            <p class="evt-lore">${evt.lore}</p>
            <div class="evt-choices">
              ${choicesHtml}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private applyEventChoice(choiceIdx: number): void {
    if (!this.currentEvent) return;
    const choice = this.currentEvent.choices[choiceIdx];
    if (!choice) return;

    const res = choice.apply(this.game);
    this.actions.onPlaySfx(res.success ? 'relay' : 'click');

    const modal = $('map-modal');
    if (!modal) return;

    modal.innerHTML = `
      <div class="window dialog event-dialog bevel-out">
        <div class="titlebar">
          <span class="title">❓ ТЕРМИНАЛ DOS — РЕЗУЛЬТАТ</span>
        </div>
        <div class="dialog-body">
          <div class="dialog-content">
            <div class="evt-title" style="color:${res.success ? '#00aa00' : '#cc0000'};">
              ${res.success ? 'ПРОТОКОЛ ВЫПОЛНЕН' : 'ОШИБКА ОПЕРАЦИИ'}
            </div>
            <p class="evt-lore" style="font-size:14px;font-weight:bold;color:#000;">${res.outcomeText}</p>
          </div>
        </div>
        <div class="dialog-btns">
          <button class="btn btn-primary bevel-out" data-action="close-modal">Продолжить путь ▶</button>
        </div>
      </div>
    `;
  }

  private closeModal(): void {
    const modal = $('map-modal');
    if (modal) modal.hidden = true;
    this.game.completeNodeAndReturnToMap();
    this.render();
  }
}
