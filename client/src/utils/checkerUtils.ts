// client/src/utils/checkerUtils.ts
export type Piece = 0 | 1 | 2 | -1 | -2;

/**
 * The canonical mapping used by server: 32 playable squares indexed 0..31.
 * indexToRC and rcToIndex mirror server logic exactly.
 */
export function indexToRC(idx: number): { r: number; c: number } {
  const r = Math.floor(idx / 4);
  const posInRow = idx % 4;
  const c = (r % 2 === 0) ? (1 + 2 * posInRow) : (0 + 2 * posInRow);
  return { r, c };
}

export function rcToIndex(r: number, c: number): number | null {
  if (r < 0 || r > 7 || c < 0 || c > 7) return null;
  if ((r + c) % 2 === 0) return null;
  const base = r * 4;
  const posInRow = (r % 2 === 0) ? ((c - 1) / 2) : (c / 2);
  if (!Number.isInteger(posInRow)) return null;
  return base + posInRow;
}

export function isDarkSquare(r: number, c: number) {
  return (r + c) % 2 === 1;
}
