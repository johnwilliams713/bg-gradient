export const PALETTE = {
  butter: '#FDE68A',
  flame:  '#FF5700',
  coral:  '#FF8547',
  canvas: '#F6F6F3',
} as const;

export function rgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
