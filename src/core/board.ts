export interface Cell {
  x: number;
  y: number;
  mine: boolean;
  adjacent: number;
  revealed: boolean;
  flagged: boolean;
  exploded: boolean;
  defused?: boolean;
  wrong?: boolean;
  /** True if tagged with a Slot Machine Flag consumable */
  slotFlag?: boolean;
  /** True if cell contains a Fairy in a Bottle */
  hasFairy?: boolean;
  /** True if fairy in this cell was collected */
  fairyCollected?: boolean;
  /** True if cell is frozen (impassable obstacle in Act 2 cryo sectors, cannot be opened or mined) */
  frozen?: boolean;
}

/** Pure grid logic: generation, neighbours, flood fill. No scoring here. */
export class Board {
  readonly cells: Cell[] = [];
  generated = false;

  constructor(
    readonly w: number,
    readonly h: number,
    readonly mineCount: number,
    private readonly rng: () => number = Math.random,
    readonly frozenCount: number = 0,
  ) {
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        this.cells.push({ x, y, mine: false, adjacent: 0, revealed: false, flagged: false, exploded: false });
  }

  get(x: number, y: number): Cell | undefined {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return undefined;
    return this.cells[y * this.w + x];
  }

  /** Moore neighbourhood (8). Swap here for hex / von Neumann mutators. */
  neighbors(c: Cell): Cell[] {
    const out: Cell[] = [];
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const n = this.get(c.x + dx, c.y + dy);
        if (n) out.push(n);
      }
    return out;
  }

  /** Places mines avoiding the first clicked cell and its neighbours, while clustering mines to naturally create open zero basins. */
  generate(safe: Cell): void {
    // 1. First clicked cell and its immediate 8 neighbors MUST be safe (guaranteed open start)
    const forbidden = new Set<Cell>([safe, ...this.neighbors(safe)]);

    // 2. Select 1 distant "oasis" seed across the field (manhattan dist >= 5) for a secondary meadow
    const potentialSeeds = this.cells.filter((c) => {
      const dist = Math.abs(c.x - safe.x) + Math.abs(c.y - safe.y);
      return dist >= 5;
    });

    if (potentialSeeds.length > 0) {
      const seed1 = potentialSeeds[Math.floor(this.rng() * potentialSeeds.length)];
      forbidden.add(seed1);
      for (const n of this.neighbors(seed1)) forbidden.add(n);
    }

    // 3. Place frozen barrier cells if this sector is a cryo/ice sector
    if (this.frozenCount > 0) {
      const frozenCandidates = this.cells.filter((c) => !forbidden.has(c));
      const chosenFrozen = new Set<Cell>();
      const clustersCount = Math.max(2, Math.floor(this.frozenCount / 4));
      const perCluster = Math.ceil(this.frozenCount / clustersCount);

      const shuffledCandidates = [...frozenCandidates].sort(() => this.rng() - 0.5);
      for (let i = 0; i < clustersCount && chosenFrozen.size < this.frozenCount; i++) {
        const root = shuffledCandidates[i];
        if (!root || chosenFrozen.has(root)) continue;
        chosenFrozen.add(root);
        const ns = this.neighbors(root).filter((n) => !forbidden.has(n) && !chosenFrozen.has(n));
        for (const n of ns.slice(0, perCluster - 1)) {
          if (chosenFrozen.size < this.frozenCount) {
            chosenFrozen.add(n);
          }
        }
      }

      for (const c of shuffledCandidates) {
        if (chosenFrozen.size >= this.frozenCount) break;
        if (!chosenFrozen.has(c)) chosenFrozen.add(c);
      }

      for (const fc of chosenFrozen) {
        fc.frozen = true;
      }
    }

    // 4. Place mines in the remaining pool with slight natural clustering (never on frozen cells!)
    const pool = this.cells.filter((c) => !forbidden.has(c) && !c.frozen);
    const count = Math.min(this.mineCount, pool.length);

    for (let i = 0; i < count; i++) {
      const j = i + Math.floor(this.rng() * (pool.length - i));
      [pool[i], pool[j]] = [pool[j], pool[i]];
      pool[i].mine = true;
    }

    for (const c of this.cells) {
      c.adjacent = c.frozen ? 0 : this.neighbors(c).filter((n) => n.mine).length;
    }
    this.generated = true;
  }

  /** Reveals a safe cell; flood-fills through zeros. Returns BFS layers (layer 0 = start, each next layer = one chain step). */
  flood(start: Cell): Cell[][] {
    if (start.revealed || start.mine || start.frozen) return [];
    const layers: Cell[][] = [];
    let frontier = [start];
    start.revealed = true;
    while (frontier.length) {
      layers.push(frontier);
      const next: Cell[] = [];
      for (const c of frontier) {
        c.flagged = false;
        if (c.adjacent !== 0) continue;
        for (const n of this.neighbors(c)) {
          if (n.revealed || n.mine || n.flagged || n.frozen) continue;
          n.revealed = true;
          next.push(n);
        }
      }
      frontier = next;
    }
    return layers;
  }

  safeRemaining(): number {
    return this.cells.filter((c) => !c.mine && !c.defused && !c.frozen && !c.revealed).length;
  }

  /** Recomputes numbers after a mine is defused/neutralized. */
  recomputeAdjacents(): void {
    for (const c of this.cells) {
      c.adjacent = this.neighbors(c).filter((n) => n.mine).length;
    }
  }
}
