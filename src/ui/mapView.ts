import type { Game } from '../core/game';
import type { MapNode } from '../core/map';
import { nodeTypeIcon, nodeTypeName } from '../core/map';
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

    // SVG connections
    const svgLines = this.buildSvgConnections(map, availableIds);

    // Node items
    const nodesHtml = map.nodes
      .map((node) => {
        const isCurrent = node.id === map.currentNodeId;
        const isVisited = map.visitedNodeIds.includes(node.id);
        const isAvailable = availableIds.has(node.id);

        const xPct = this.colX(node.col);
        const yPct = this.floorY(node.floor);

        let stateCls = 'locked';
        if (isCurrent) stateCls = 'current';
        else if (isVisited) stateCls = 'visited';
        else if (isAvailable) stateCls = 'available';

        const icon = nodeTypeIcon(node.type);
        const name = nodeTypeName(node.type);

        return `
          <button class="map-node bevel-out ${stateCls} type-${node.type}"
                  style="left:${xPct}; top:${yPct};"
                  data-node-id="${node.id}"
                  ${isAvailable ? '' : 'disabled'}
                  title="${name}: ${node.desc}">
            <span class="node-icon">${icon}</span>
            <span class="node-label">${name}</span>
            ${isCurrent ? '<span class="node-badge current">[ВЫ ТУТ]</span>' : ''}
            ${isVisited && !isCurrent ? '<span class="node-badge visited">✔</span>' : ''}
            ${isAvailable ? '<span class="node-badge available">ВЫБРАТЬ ▶</span>' : ''}
          </button>
        `;
      })
      .join('');

    treeEl.innerHTML = `
      <svg class="map-connections" xmlns="http://www.w3.org/2000/svg">
        ${svgLines}
      </svg>
      <div class="map-nodes-container">
        ${nodesHtml}
      </div>
    `;
  }

  private buildSvgConnections(map: typeof this.game.map, availableIds: Set<string>): string {
    const lines: string[] = [];
    const visitedSet = new Set(map.visitedNodeIds);

    for (const node of map.nodes) {
      const x1 = this.colX(node.col);
      const y1 = this.floorY(node.floor);

      for (const nextId of node.nextIds) {
        const nextNode = map.nodes.find((n) => n.id === nextId);
        if (!nextNode) continue;

        const x2 = this.colX(nextNode.col);
        const y2 = this.floorY(nextNode.floor);

        let cls = 'locked-path';
        if (visitedSet.has(node.id) && visitedSet.has(nextNode.id)) {
          cls = 'visited-path';
        } else if (node.id === map.currentNodeId && availableIds.has(nextNode.id)) {
          cls = 'available-path';
        }

        lines.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="map-line ${cls}" />`);
      }
    }

    return lines.join('');
  }

  private colX(col: number): string {
    return col === 0 ? '22%' : col === 1 ? '50%' : '78%';
  }

  private floorY(floor: number): string {
    // Floor 0 at bottom (93%), Floor 6 at top (9%)
    return `${(93 - floor * 14).toFixed(1)}%`;
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
