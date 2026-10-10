export interface Cell {
  x: number;
  y: number;
  mine: boolean;
  adjacent: number;
  revealed: boolean;
  flagged: boolean;
  exploded: boolean;
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

  /** Places mines avoiding the first clicked cell and its neighbours. */
  generate(safe: Cell): void {
    const forbidden = new Set([safe, ...this.neighbors(safe)]);
    const pool = this.cells.filter((c) => !forbidden.has(c));
    const count = Math.min(this.mineCount, pool.length);
    for (let i = 0; i < count; i++) {
      const j = i + Math.floor(this.rng() * (pool.length - i));
      [pool[i], pool[j]] = [pool[j], pool[i]];
      pool[i].mine = true;
    }
    for (const c of this.cells) c.adjacent = this.neighbors(c).filter((n) => n.mine).length;
    this.generated = true;
  }

  /** Reveals a safe cell; flood-fills through zeros. Returns cells in BFS order (first = start). */
  flood(start: Cell): Cell[] {
    if (start.revealed || start.mine) return [];
    const opened: Cell[] = [];
    const queue = [start];
    start.revealed = true;
    while (queue.length) {
      const c = queue.shift()!;
      c.flagged = false;
      opened.push(c);
      if (c.adjacent !== 0) continue;
      for (const n of this.neighbors(c)) {
        if (n.revealed || n.mine || n.flagged) continue;
        n.revealed = true;
        queue.push(n);
      }
    }
    return opened;
  }

  safeRemaining(): number {
    return this.cells.filter((c) => !c.mine && !c.revealed).length;
  }
}
