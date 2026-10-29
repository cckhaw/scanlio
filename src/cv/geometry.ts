import type { Point, Quad } from '../types';

export const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** Sort 4 arbitrary points into TL, TR, BR, BL. */
export function orderQuad(pts: Point[]): Quad {
  const sum = (p: Point) => p.x + p.y;
  const diff = (p: Point) => p.x - p.y;
  const tl = pts.reduce((a, b) => (sum(b) < sum(a) ? b : a));
  const br = pts.reduce((a, b) => (sum(b) > sum(a) ? b : a));
  const tr = pts.reduce((a, b) => (diff(b) > diff(a) ? b : a));
  const bl = pts.reduce((a, b) => (diff(b) < diff(a) ? b : a));
  return [tl, tr, br, bl];
}

export function quadArea(q: Quad) {
  let a = 0;
  for (let i = 0; i < 4; i++) { const p = q[i], n = q[(i + 1) % 4]; a += p.x * n.y - n.x * p.y; }
  return Math.abs(a) / 2;
}

export function isConvex(q: Quad) {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i], b = q[(i + 1) % 4], c = q[(i + 2) % 4];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (cross !== 0) { if (sign && Math.sign(cross) !== sign) return false; sign = Math.sign(cross); }
  }
  return true;
}

export const scaleQuad = (q: Quad, sx: number, sy = sx): Quad =>
  q.map((p) => ({ x: p.x * sx, y: p.y * sy })) as Quad;

export const insetQuad = (w: number, h: number, f = 0.08): Quad => [
  { x: w * f, y: h * f }, { x: w * (1 - f), y: h * f }, { x: w * (1 - f), y: h * (1 - f) }, { x: w * f, y: h * (1 - f) },
];

/** Largest corner displacement between two quads, relative to the frame diagonal. */
export function quadMotion(a: Quad, b: Quad, diag: number) {
  let m = 0;
  for (let i = 0; i < 4; i++) m = Math.max(m, dist(a[i], b[i]));
  return m / diag;
}

/**
 * Solve the 3x3 homography H (h33 = 1) that maps src[i] -> dst[i] for 4 point pairs.
 * Returns row-major [h11..h32, 1].
 */
export function homography(src: Point[], dst: Point[]): number[] | null {
  const A: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i], { x: u, y: v } = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  // Gauss-Jordan with partial pivoting on the 8x9 augmented system.
  for (let c = 0; c < 8; c++) {
    let p = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    if (Math.abs(A[p][c]) < 1e-10) return null;
    [A[c], A[p]] = [A[p], A[c]];
    for (let r = 0; r < 8; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let k = c; k < 9; k++) A[r][k] -= f * A[c][k];
    }
  }
  return [...A.map((row, i) => row[8] / row[i]), 1];
}
