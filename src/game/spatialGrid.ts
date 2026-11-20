import type { Enemy } from '../types';

export class SpatialGrid {
  private readonly cellSize: number;
  private cells = new Map<number, Enemy[]>();

  constructor(cellSize = 64) {
    this.cellSize = cellSize;
  }

  private key(cx: number, cy: number): number {
    // Pack signed 16-bit cell coords into a 32-bit integer key (fast, zero string alloc)
    return ((cx + 32768) << 16) | ((cy + 32768) & 0xffff);
  }

  public clear(): void {
    this.cells.clear();
  }

  public insert(enemy: Enemy): void {
    const cx = Math.floor(enemy.x / this.cellSize);
    const cy = Math.floor(enemy.y / this.cellSize);
    const k = this.key(cx, cy);
    let bucket = this.cells.get(k);
    if (!bucket) {
      bucket = [];
      this.cells.set(k, bucket);
    }
    bucket.push(enemy);
  }

  public queryRadius(x: number, y: number, radius: number, out: Enemy[] = []): Enemy[] {
    const pad = radius + 24; // account for largest boss radius
    const minCx = Math.floor((x - pad) / this.cellSize);
    const maxCx = Math.floor((x + pad) / this.cellSize);
    const minCy = Math.floor((y - pad) / this.cellSize);
    const maxCy = Math.floor((y + pad) / this.cellSize);

    for (let cy = minCy; cy <= maxCy; cy++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        const bucket = this.cells.get(this.key(cx, cy));
        if (!bucket) continue;
        for (let i = 0; i < bucket.length; i++) {
          const e = bucket[i];
          if (e.dead) continue;
          const dx = e.x - x;
          const dy = e.y - y;
          const maxD = radius + e.radius;
          if (dx * dx + dy * dy <= maxD * maxD) {
            out.push(e);
          }
        }
      }
    }
    return out;
  }

  public findNearest(x: number, y: number, maxDist: number, excludeId?: number): Enemy | null {
    const pad = maxDist + 24;
    const minCx = Math.floor((x - pad) / this.cellSize);
    const maxCx = Math.floor((x + pad) / this.cellSize);
    const minCy = Math.floor((y - pad) / this.cellSize);
    const maxCy = Math.floor((y + pad) / this.cellSize);

    let best: Enemy | null = null;
    let bestD2 = maxDist * maxDist;

    for (let cy = minCy; cy <= maxCy; cy++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        const bucket = this.cells.get(this.key(cx, cy));
        if (!bucket) continue;
        for (let i = 0; i < bucket.length; i++) {
          const e = bucket[i];
          if (e.dead || e.id === excludeId) continue;
          const dx = e.x - x;
          const dy = e.y - y;
          const d2 = dx * dx + dy * dy;
          if (d2 < bestD2) {
            bestD2 = d2;
            best = e;
          }
        }
      }
    }
    return best;
  }
}
