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

export interface OKLCH {
  l: number
  c: number
  h: number
}

// The inverse of the transform above: sRGB → OKLCH. Needed because a theme can
// name the two ends of a colour ramp and the steps between them have to be
// walked somewhere the steps are perceptually even (section 29).
export function toOklch({ r, g, b }: RGB): OKLCH {
  const lin = (v: number) => {
    const c = v / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  const R = lin(r)
  const G = lin(g)
  const B = lin(b)
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B)
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B)
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B)
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const Bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  const h = (Math.atan2(Bb, A) * 180) / Math.PI
  return { l: L, c: Math.hypot(A, Bb), h: h < 0 ? h + 360 : h }
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
    // Both syntaxes. `rgba(43, 22, 11, 0.68)` is what the theme registry
    // writes; `rgb(43 22 11 / 68%)` is what the stylesheet writes, because
    // stylelint's modern-notation rule asks for it. They are the same colour,
    // and a parser that reads only one of them makes "the two copies agree"
    // fail on punctuation (section 43).
    const [channels, alpha] = rgb[1].split('/')
    const parts = channels
      .split(/[,\s]+/)
      .filter(Boolean)
      .map(parseFloat)
    const raw = alpha !== undefined ? alpha.trim() : String(parts[3] ?? 1)
    const a = raw.endsWith('%') ? parseFloat(raw) / 100 : parseFloat(raw)
    return { r: parts[0], g: parts[1], b: parts[2], a: Number.isFinite(a) ? a : 1 }
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
