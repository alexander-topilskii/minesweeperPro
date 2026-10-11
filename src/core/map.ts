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

/**
 * Generates a Slay the Spire branching map for the given act.
 * Floors 0 to 6:
 * - Floor 0: Entry node (the starter level just completed)
 * - Floor 1: 3 nodes (early branches)
 * - Floor 2: 3 nodes (shops, battles, elites)
 * - Floor 3: 3 nodes (events, battles, shops)
 * - Floor 4: 3 nodes (elites, battles, events)
 * - Floor 5: 2 nodes (campfires / rest stations before boss)
 * - Floor 6: 1 node (Act Boss)
 */
export function generateActMap(act: number): MapData {
  const bossName = BOSS_NAMES[(act - 1) % BOSS_NAMES.length];
  const nodes: MapNode[] = [];
  const floorsCount = 7; // 0 to 6

  // Floor 0: Origin node
  nodes.push({
    id: 'f0_c1',
    floor: 0,
    col: 1,
    type: 'battle',
    name: 'Стартовый сектор',
    desc: 'Начальная точка входа в сектор.',
    nextIds: ['f1_c0', 'f1_c1', 'f1_c2'],
    completed: true,
  });

  // Floor 1: 3 nodes
  const f1Types: NodeType[] = ['battle', 'event', 'battle'];
  f1Types.forEach((type, col) => {
    nodes.push({
      id: `f1_c${col}`,
      floor: 1,
      col,
      type,
      name: nodeTypeName(type),
      desc: nodeTypeDesc(type),
      nextIds: [],
      completed: false,
    });
  });

  // Floor 2: 3 nodes (Shop, Elite, Battle)
  const f2Types: NodeType[] = ['elite', 'battle', 'shop'];
  f2Types.forEach((type, col) => {
    nodes.push({
      id: `f2_c${col}`,
      floor: 2,
      col,
      type,
      name: nodeTypeName(type),
      desc: nodeTypeDesc(type),
      nextIds: [],
      completed: false,
    });
  });

  // Floor 3: 3 nodes (Event, Battle, Shop / Battle)
  const f3Types: NodeType[] = ['event', 'battle', act % 2 === 1 ? 'event' : 'shop'];
  f3Types.forEach((type, col) => {
    nodes.push({
      id: `f3_c${col}`,
      floor: 3,
      col,
      type,
      name: nodeTypeName(type),
      desc: nodeTypeDesc(type),
      nextIds: [],
      completed: false,
    });
  });

  // Floor 4: 3 nodes (Elite, Event, Battle)
  const f4Types: NodeType[] = ['battle', 'elite', 'event'];
  f4Types.forEach((type, col) => {
    nodes.push({
      id: `f4_c${col}`,
      floor: 4,
      col,
      type,
      name: nodeTypeName(type),
      desc: nodeTypeDesc(type),
      nextIds: [],
      completed: false,
    });
  });

  // Floor 5: 2 nodes (Rest sites before Boss)
  const f5Types: NodeType[] = ['rest', 'rest'];
  f5Types.forEach((type, col) => {
    nodes.push({
      id: `f5_c${col}`,
      floor: 5,
      col: col === 0 ? 0 : 2, // Spaced left & right
      type,
      name: nodeTypeName(type),
      desc: nodeTypeDesc(type),
      nextIds: ['f6_c1'], // Both lead to Boss
      completed: false,
    });
  });

  // Floor 6: Boss
  nodes.push({
    id: 'f6_c1',
    floor: 6,
    col: 1,
    type: 'boss',
    name: `БОСС: ${bossName}`,
    desc: 'Главный сервер сектора. Финальное испытание акта.',
    nextIds: [],
    completed: false,
  });

  // Connect Floor 1 to Floor 2
  connect(nodes, 'f1_c0', ['f2_c0', 'f2_c1']);
  connect(nodes, 'f1_c1', ['f2_c0', 'f2_c1', 'f2_c2']);
  connect(nodes, 'f1_c2', ['f2_c1', 'f2_c2']);

  // Connect Floor 2 to Floor 3
  connect(nodes, 'f2_c0', ['f3_c0', 'f3_c1']);
  connect(nodes, 'f2_c1', ['f3_c0', 'f3_c1', 'f3_c2']);
  connect(nodes, 'f2_c2', ['f3_c1', 'f3_c2']);

  // Connect Floor 3 to Floor 4
  connect(nodes, 'f3_c0', ['f4_c0', 'f4_c1']);
  connect(nodes, 'f3_c1', ['f4_c0', 'f4_c1', 'f4_c2']);
  connect(nodes, 'f3_c2', ['f4_c1', 'f4_c2']);

  // Connect Floor 4 to Floor 5 (f5_c0 at left, f5_c1 at right)
  connect(nodes, 'f4_c0', ['f5_c0']);
  connect(nodes, 'f4_c1', ['f5_c0', 'f5_c1']);
  connect(nodes, 'f4_c2', ['f5_c1']);

  return {
    act,
    floorsCount,
    bossName,
    nodes,
    currentNodeId: 'f0_c1',
    visitedNodeIds: ['f0_c1'],
  };
}

function connect(nodes: MapNode[], fromId: string, toIds: string[]): void {
  const from = nodes.find((n) => n.id === fromId);
  if (from) {
    from.nextIds = Array.from(new Set([...from.nextIds, ...toIds]));
  }
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
