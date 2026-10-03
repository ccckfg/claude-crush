import type { Elements } from 'claude-code'

export type T = Elements['terminal']

// Charm's palette, as Crush draws with it. Body text carries no color at all,
// so it follows the terminal's own foreground on a light theme as on a dark one.
export const C = {
  primary: '#6B50FF', // Charple
  secondary: '#FF60FF', // Dolly
  tertiary: '#68FFD6', // Bok
  accent: '#E8FE96', // Zest
  info: '#00A4FF', // Malibu
  success: '#12C78F', // Guac
  warn: '#F5EF34', // Mustard
  error: '#EB4268', // Sriracha
  muted: '#858392', // Squid
  subtle: '#605F6B', // Oyster
  line: '#4B4A57',
} as const

const toRgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16)

  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

const toHex = (n: number): string =>
  Math.round(Math.max(0, Math.min(255, n)))
    .toString(16)
    .padStart(2, '0')

/** The color `t` of the way from `a` to `b`, both `#rrggbb`. */
export const mix = (a: string, b: string, t: number): string => {
  const [ar, ag, ab] = toRgb(a)
  const [br, bg, bb] = toRgb(b)

  return `#${toHex(ar + (br - ar) * t)}${toHex(ag + (bg - ag) * t)}${toHex(ab + (bb - ab) * t)}`
}

const isWide = (cp: number): boolean =>
  (cp >= 0x1100 && cp <= 0x115f) ||
  (cp >= 0x2e80 && cp <= 0xa4cf) ||
  (cp >= 0xac00 && cp <= 0xd7a3) ||
  (cp >= 0xf900 && cp <= 0xfaff) ||
  (cp >= 0xfe30 && cp <= 0xfe6f) ||
  (cp >= 0xff00 && cp <= 0xff60) ||
  (cp >= 0xffe0 && cp <= 0xffe6) ||
  (cp >= 0x1f300 && cp <= 0x1f64f) ||
  (cp >= 0x1f900 && cp <= 0x1f9ff) ||
  (cp >= 0x20000 && cp <= 0x3fffd)

const isZero = (cp: number): boolean =>
  (cp >= 0x300 && cp <= 0x36f) || cp === 0x200d || (cp >= 0xfe00 && cp <= 0xfe0f)

/** Terminal cells `s` takes: CJK and emoji two, combining marks none. */
export const cellWidth = (s: string): number => {
  let width = 0

  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0
    width += isZero(cp) ? 0 : isWide(cp) ? 2 : 1
  }

  return width
}

/** `s` cut to `max` cells, with an ellipsis where it was cut. */
export const clip = (s: string, max: number): string => {
  if (max <= 0) {
    return ''
  }

  if (cellWidth(s) <= max) {
    return s
  }

  let out = ''
  let width = 0

  for (const ch of s) {
    const w = cellWidth(ch)

    if (width + w > max - 1) {
      break
    }

    out += ch
    width += w
  }

  return `${out}…`
}

/** `s` cut from the left to `max` cells, so the end of a path stays visible. */
export const clipLeft = (s: string, max: number): string => {
  if (max <= 0) {
    return ''
  }

  if (cellWidth(s) <= max) {
    return s
  }

  let out = ''
  let width = 0

  for (const ch of Array.from(s).reverse()) {
    const w = cellWidth(ch)

    if (width + w > max - 1) {
      break
    }

    out = ch + out
    width += w
  }

  return `…${out}`
}

/** Rows `text` takes when wrapped to `columns` cells. */
export const rowsFor = (text: string, columns: number): number =>
  text
    .split('\n')
    .reduce((rows, line) => rows + Math.max(1, Math.ceil(cellWidth(line) / Math.max(1, columns))), 0)

/** Text a tree may carry: no escape sequences or control characters, tabs as spaces. */
export const clean = (s: string): string =>
  s
    .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/\u001b\][^\u0007]*\u0007/g, '')
    .replace(/\r/g, '')
    .replace(/\t/g, '  ')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')

type GradientOptions = { from?: string; to?: string; bold?: boolean; phase?: number }

/**
 * `text` colored along a ramp, one Text per character. With `phase` the ramp
 * is a wave that travels one wavelength each time the phase moves by 1.
 */
export const grad = (t: T, text: string, options: GradientOptions = {}) => {
  const { Text } = t
  const from = options.from ?? C.primary
  const to = options.to ?? C.secondary
  const chars = Array.from(text)
  const last = Math.max(1, chars.length - 1)
  const { phase } = options

  return (
    <Text bold={options.bold === true}>
      {chars.map((ch, i) => {
        const x =
          phase === undefined
            ? i / last
            : 0.5 - 0.5 * Math.cos(2 * Math.PI * (i / Math.max(1, chars.length) - phase))

        return <Text color={mix(from, to, x)}>{ch}</Text>
      })}
    </Text>
  )
}

/** A run of Crush's diagonal fill, `width` cells across. */
export const rule = (t: T, width: number, options: GradientOptions = {}) =>
  width > 0 ? grad(t, '╱'.repeat(width), options) : null

/** `color` pulled toward the border grey, for fills that should stay behind the text. */
export const dimmed = (color: string): string => mix(color, C.line, 0.55)

/** A section heading with the diagonal fill running out to `width` cells. */
export const section = (t: T, title: string, width: number) => {
  const { Box, Text } = t

  return (
    <Box marginTop={1}>
      <Text color={C.muted}>{title} </Text>
      {rule(t, width - cellWidth(title) - 1, { from: dimmed(C.primary), to: dimmed(C.secondary) })}
    </Box>
  )
}

/** A bar `width` cells wide, `percent` full, its fill on the brand ramp. */
export const meter = (t: T, percent: number, width: number) => {
  const { Text } = t
  const clamped = Math.max(0, Math.min(100, percent))
  const filled = Math.round((clamped / 100) * width)
  const hot = clamped >= 90 ? C.error : clamped >= 75 ? C.warn : undefined
  const cells = Array.from({ length: filled }, (_, i) =>
    hot === undefined ? mix(C.primary, C.secondary, i / Math.max(1, width - 1)) : hot,
  )

  return (
    <Text>
      {cells.map(color => (
        <Text color={color}>█</Text>
      ))}
      <Text color={C.line}>{'░'.repeat(Math.max(0, width - filled))}</Text>
    </Text>
  )
}

export const SPIN = ['⣾', '⣽', '⣻', '⢿', '⡿', '⣟', '⣯', '⣷'] as const

/** `claude-sonnet-5-5` as `Sonnet 5.5`. */
export const prettyModel = (id: string): string => {
  const base = id
    .replace(/\[.*\]$/, '')
    .replace(/^claude-/, '')
    .replace(/-\d{8}$/, '')
  const out: string[] = []

  for (const part of base.split('-').filter(Boolean)) {
    const prev = out[out.length - 1]

    if (/^\d+$/.test(part)) {
      if (prev !== undefined && /^\d+(\.\d+)*$/.test(prev)) {
        out[out.length - 1] = `${prev}.${part}`
      } else {
        out.push(part)
      }
    } else {
      out.push(part.charAt(0).toUpperCase() + part.slice(1))
    }
  }

  return out.join(' ') || id
}

export const fmtTokens = (n: number): string =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : String(n)

export const fmtUsd = (n: number): string => `$${n.toFixed(2)}`

export const fmtDuration = (ms: number): string => {
  const s = Math.max(0, Math.round(ms / 1000))

  if (s < 60) {
    return `${s}s`
  }

  const m = Math.floor(s / 60)

  return m < 60 ? `${m}m ${s % 60}s` : `${Math.floor(m / 60)}h ${m % 60}m`
}

export const slash = (p: string): string => p.replace(/\\/g, '/')

/** `path` relative to `cwd` when it lies under it. */
export const relPath = (path: string, cwd: string): string => {
  const p = slash(path)
  const base = slash(cwd).replace(/\/$/, '')

  return base !== '' && p.toLowerCase().startsWith(`${base.toLowerCase()}/`) ? p.slice(base.length + 1) : p
}

/** `path` with the home directory written `~`. */
export const tilde = (path: string, home: string): string => {
  const p = slash(path)
  const h = slash(home).replace(/\/$/, '')

  if (h === '') {
    return p
  }

  if (p.toLowerCase() === h.toLowerCase()) {
    return '~'
  }

  return p.toLowerCase().startsWith(`${h.toLowerCase()}/`) ? `~${p.slice(h.length)}` : p
}
