// WCAG contrast tooling for the theme registry. Parses the colour formats the
// tokens use (hex, rgb()/rgba(), oklch()), composites translucent colours over a
// solid backdrop, and computes the WCAG 2.1 contrast ratio. Used by the contrast
// test that asserts every registry theme stays readable (see contrast.test.ts).

export interface RGB {
  r: number
  g: number
  b: number
  a: number
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x))
}

// oklch(L C H) → sRGB (0–255). L in 0–1, C chroma, H degrees.
function oklchToRgb(L: number, C: number, H: number): RGB {
  const h = (H * Math.PI) / 180
  const a = C * Math.cos(h)
  const b = C * Math.sin(h)
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b
  const s_ = L - 0.0894841775 * a - 1.291485548 * b
  const l = l_ ** 3
  const m = m_ ** 3
  const s = s_ ** 3
  const rl = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
  const gl = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
  const bl = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  const toSrgb = (c: number) => {
    const v = clamp01(c)
    return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055
  }
  return {
    r: Math.round(toSrgb(rl) * 255),
    g: Math.round(toSrgb(gl) * 255),
    b: Math.round(toSrgb(bl) * 255),
    a: 1,
  }
}

export function parseColor(input: string): RGB {
  const s = input.trim()
  if (s.startsWith('#')) {
    const hex = s.slice(1)
    const full = hex.length === 3 ? hex.replace(/./g, (ch) => ch + ch) : hex
    return {
      r: parseInt(full.slice(0, 2), 16),
      g: parseInt(full.slice(2, 4), 16),
      b: parseInt(full.slice(4, 6), 16),
      a: 1,
    }
  }
  const rgb = s.match(/^rgba?\(([^)]+)\)$/i)
  if (rgb) {
    const parts = rgb[1].split(',').map((p) => parseFloat(p))
    return { r: parts[0], g: parts[1], b: parts[2], a: parts[3] ?? 1 }
  }
  const ok = s.match(/^oklch\(([^)]+)\)$/i)
  if (ok) {
    const parts = ok[1]
      .trim()
      .split(/\s+/)
      .map((p) => parseFloat(p))
    return oklchToRgb(parts[0], parts[1] ?? 0, parts[2] ?? 0)
  }
  // Unknown format → mid grey, so a typo shows up as a failing contrast rather
  // than throwing.
  return { r: 128, g: 128, b: 128, a: 1 }
}

// Composite a (possibly translucent) foreground colour over an opaque backdrop.
export function over(fg: RGB, bg: RGB): RGB {
  const a = fg.a
  return {
    r: fg.r * a + bg.r * (1 - a),
    g: fg.g * a + bg.g * (1 - a),
    b: fg.b * a + bg.b * (1 - a),
    a: 1,
  }
}

function relLuminance({ r, g, b }: RGB): number {
  const lin = (c: number) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

// WCAG contrast ratio between two colours over a solid surface (both composited
// over `surface` first so translucent tokens read against a real backdrop).
export function contrastRatio(fg: string, bg: string, surface = bg): number {
  const surf = parseColor(surface)
  const f = over(parseColor(fg), surf)
  const b = over(parseColor(bg), surf)
  const L1 = relLuminance(f)
  const L2 = relLuminance(b)
  const [hi, lo] = L1 >= L2 ? [L1, L2] : [L2, L1]
  return (hi + 0.05) / (lo + 0.05)
}
