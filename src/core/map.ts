export type NodeType = 'battle' | 'elite' | 'shop' | 'event' | 'rest' | 'boss';

export interface MapNode {
  id: string;
  floor: number;
  col: number;
  type: NodeType;
  name: string;
  desc: string;
  nextIds: string[];
  completed: boolean;
}

export interface MapData {
  act: number;
  floorsCount: number;
  bossName: string;
  nodes: MapNode[];
  currentNodeId: string;
  visitedNodeIds: string[];
}

const BOSS_NAMES = [
  'СУПЕРКОМПЬЮТЕР «ЦЕФЕЙ»',
  'ДЕТОНАТОР «ОРЕОЛ-9»',
  'МАЙН-ЯДРО «ЛЕВИАФАН»',
  'СЕРВЕР «АРХИТЕКТОР ОМЕГА»',
];

/** Number of lanes (columns) on the act map. */
export const MAP_COLS = 5;

/**
 * Procedurally generates a Slay the Spire–style branching act map.
 * - Floor 0: entry node (already completed)
 * - Floors 1..5: nodes produced by walking several non-crossing paths upward
 * - Floor 5: always rest stops (campfire before the boss)
 * - Floor 6: Act Boss
 */
export function generateActMap(act: number): MapData {
  const bossName = BOSS_NAMES[(act - 1) % BOSS_NAMES.length];
  const floorsCount = 7; // 0..6
  const lastPathFloor = 5;
  const center = Math.floor(MAP_COLS / 2);

  // ---- 1. Walk non-crossing paths ----
  const edges = new Map<string, Set<string>>(); // "f_c" -> Set of "f+1_c"
  const key = (f: number, c: number) => `${f}_${c}`;
  const addEdge = (f: number, a: number, b: number) => {
    const k = key(f, a);
    if (!edges.has(k)) edges.set(k, new Set());
    edges.get(k)!.add(key(f + 1, b));
  };
  const crosses = (f: number, a: number, b: number): boolean => {
    for (const [from, tos] of edges) {
      const [ff, cc] = from.split('_').map(Number);
      if (ff !== f) continue;
      for (const to of tos) {
        const dd = Number(to.split('_')[1]);
        if ((a < cc && b > dd) || (a > cc && b < dd)) return true;
      }
    }
    return false;
  };

  const occupied: Set<number>[] = Array.from({ length: floorsCount }, () => new Set());
  const pathCount = 4;
  const starts = shuffle([...Array(MAP_COLS).keys()]).slice(0, 3);
  for (let p = 0; p < pathCount; p++) {
    let col = p < starts.length ? starts[p] : starts[Math.floor(Math.random() * starts.length)];
    occupied[1].add(col);
    for (let f = 1; f < lastPathFloor; f++) {
      const opts = shuffle([-1, 0, 1])
        .map((d) => col + d)
        .filter((c) => c >= 0 && c < MAP_COLS && !crosses(f, col, c));
      const next = opts.length ? opts[0] : col;
      addEdge(f, col, next);
      col = next;
      occupied[f + 1].add(col);
    }
  }

  // ---- 2. Assign node types ----
  const typeAt = new Map<string, NodeType>();
  const parentsOf = (f: number, c: number): number[] => {
    const res: number[] = [];
    for (const pc of occupied[f - 1] ?? []) if (edges.get(key(f - 1, pc))?.has(key(f, c))) res.push(pc);
    return res;
  };
  for (let f = 1; f <= lastPathFloor; f++) {
    for (const c of [...occupied[f]].sort((a, b) => a - b)) {
      let t: NodeType;
      if (f === 1) t = 'battle';
      else if (f === lastPathFloor) t = 'rest';
      else {
        const parentTypes = parentsOf(f, c).map((pc) => typeAt.get(key(f - 1, pc)));
        let guard = 0;
        do {
          t = rollType(f);
          guard++;
        } while (guard < 20 && t !== 'battle' && parentTypes.includes(t));
      }
      typeAt.set(key(f, c), t);
    }
  }
  // Guarantee at least one shop and one elite on the map
  const midKeys = [...typeAt.keys()].filter((k) => {
    const f = Number(k.split('_')[0]);
    return f >= 2 && f <= 4;
  });
  const ensure = (type: NodeType) => {
    if ([...typeAt.values()].includes(type)) return;
    const candidates = midKeys.filter((k) => typeAt.get(k) === 'battle');
    const pick = (candidates.length ? candidates : midKeys)[Math.floor(Math.random() * (candidates.length || midKeys.length))];
    if (pick) typeAt.set(pick, type);
  };
  ensure('shop');
  ensure('elite');

  // ---- 3. Build nodes ----
  const nodes: MapNode[] = [];
  const id = (f: number, c: number) => `f${f}_c${c}`;
  nodes.push({
    id: id(0, center),
    floor: 0,
    col: center,
    type: 'battle',
    name: 'Стартовый сектор',
    desc: 'Начальная точка входа в сектор.',
    nextIds: [...occupied[1]].sort((a, b) => a - b).map((c) => id(1, c)),
    completed: true,
  });
  for (let f = 1; f <= lastPathFloor; f++) {
    for (const c of [...occupied[f]].sort((a, b) => a - b)) {
      const type = typeAt.get(key(f, c))!;
      const next =
        f === lastPathFloor
          ? [id(6, center)]
          : [...(edges.get(key(f, c)) ?? [])].map((k) => id(f + 1, Number(k.split('_')[1])));
      nodes.push({
        id: id(f, c),
        floor: f,
        col: c,
        type,
        name: nodeTypeName(type),
        desc: nodeTypeDesc(type),
        nextIds: next,
        completed: false,
      });
    }
  }
  nodes.push({
    id: id(6, center),
    floor: 6,
    col: center,
    type: 'boss',
    name: `БОСС: ${bossName}`,
    desc: 'Главный сервер сектора. Финальное испытание акта.',
    nextIds: [],
    completed: false,
  });

  return {
    act,
    floorsCount,
    bossName,
    nodes,
    currentNodeId: id(0, center),
    visitedNodeIds: [id(0, center)],
  };
}

function rollType(floor: number): NodeType {
  const r = Math.random();
  if (floor === 2) {
    if (r < 0.55) return 'battle';
    if (r < 0.78) return 'event';
    return 'shop';
  }
  if (r < 0.42) return 'battle';
  if (r < 0.62) return 'event';
  if (r < 0.8) return 'elite';
  return 'shop';
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function nodeTypeName(type: NodeType): string {
  switch (type) {
    case 'battle':
      return 'Сектор';
    case 'elite':
      return 'Элитный сектор';
    case 'shop':
      return 'Торговый пост';
    case 'event':
      return 'Аномалия';
    case 'rest':
      return 'Привал';
    case 'boss':
      return 'БОСС СЕКТОРА';
  }
}

export function nodeTypeDesc(type: NodeType): string {
  switch (type) {
    case 'battle':
      return 'Стандартное минное поле. Наберите норму очков.';
    case 'elite':
      return 'Опасный сектор с высокой плотностью мин. Награда +$3 и редкий лут.';
    case 'shop':
      return 'Покупка модулей, пополнение слот-флагов и продажа снаряжения.';
    case 'event':
      return 'Неизвестный сигнал DOS. Текстовое событие с выбором.';
    case 'rest':
      return 'Сервисный отсек. Ремонт корпуса (+1 HP) или заряд батареи.';
    case 'boss':
      return 'Финальный сервер сектора. Особые условия разминирования.';
  }
}

export function nodeTypeIcon(type: NodeType): string {
  switch (type) {
    case 'battle':
      return '⚔️';
    case 'elite':
      return '💀';
    case 'shop':
      return '🛒';
    case 'event':
      return '❓';
    case 'rest':
      return '🏕️';
    case 'boss':
      return '👑';
  }
}
