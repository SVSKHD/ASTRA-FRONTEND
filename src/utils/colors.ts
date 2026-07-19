// Urgency colour for a deadline that is `d` days away, ported from the design.
export function urg(d: number, dark: boolean): string {
  if (d <= 2) return dark ? 'oklch(0.68 0.2 25)' : 'oklch(0.58 0.2 25)'
  if (d <= 7) return dark ? 'oklch(0.8 0.16 72)' : 'oklch(0.68 0.16 68)'
  return dark ? 'oklch(0.74 0.13 250)' : 'oklch(0.62 0.13 250)'
}

export const CATEGORY_COLOR: Record<string, string> = {
  Food: 'oklch(0.8 0.13 85)',
  Transport: 'oklch(0.74 0.13 250)',
  Bills: 'oklch(0.72 0.13 305)',
  Fun: 'oklch(0.72 0.16 350)',
}
