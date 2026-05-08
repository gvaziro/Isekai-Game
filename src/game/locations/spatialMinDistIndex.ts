/**
 * Быстрая проверка минимального расстояния до уже размещённых точек (сетка O(1) среднее).
 */

function distSq(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

export class SpatialMinDistIndex {
  private readonly buckets = new Map<string, { x: number; y: number }[]>();

  constructor(private readonly cellSize: number) {}

  clear(): void {
    this.buckets.clear();
  }

  private key(ix: number, iy: number): string {
    return `${ix},${iy}`;
  }

  add(x: number, y: number): void {
    const ix = Math.floor(x / this.cellSize);
    const iy = Math.floor(y / this.cellSize);
    const k = this.key(ix, iy);
    const arr = this.buckets.get(k);
    if (arr) arr.push({ x, y });
    else this.buckets.set(k, [{ x, y }]);
  }

  /** Минимальное квадрат расстояния до ближайшей точки в соседних ячейках (включая свою). */
  minDistSqToNearest(x: number, y: number): number {
    const ix = Math.floor(x / this.cellSize);
    const iy = Math.floor(y / this.cellSize);
    let best = Infinity;
    for (let dix = -1; dix <= 1; dix++) {
      for (let diy = -1; diy <= 1; diy++) {
        const pts = this.buckets.get(this.key(ix + dix, iy + diy));
        if (!pts) continue;
        for (const p of pts) {
          const d2 = distSq(x, y, p.x, p.y);
          if (d2 < best) best = d2;
        }
      }
    }
    return best;
  }
}
