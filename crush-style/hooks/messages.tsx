import { C, SPIN, clean, fmtDuration, grad, mix, prettyModel, rowsFor } from './theme'
import type { T } from './theme'

/** The person's prompt: a bar of Charple down its left edge. */
export const userRow = (t: T, text: string, columns: number) => {
  const { Box, Text } = t
  const body = clean(text)
  const rows = Math.min(rowsFor(body, Math.max(10, columns - 3)), 300)
  const bar = Array.from({ length: rows }, () => '▌').join('\n')

  return (
    <Box marginTop={1}>
      <Box width={2} flexShrink={0}>
        <Text color={C.primary}>{bar}</Text>
      </Box>
      <Box flexGrow={1} flexShrink={1}>
        <Text>{body}</Text>
      </Box>
    </Box>
  )
}

/** A block of the model's reply, indented under no mark at all. */
export const assistantRow = (t: T, text: string) => {
  const { Box, Markdown } = t

  return (
    <Box marginTop={1} paddingLeft={2}>
      <Markdown text={text} />
    </Box>
  )
}

const WORDS = {
  requesting: 'Connecting',
  thinking: 'Thinking',
  responding: 'Generating',
  'tool-input': 'Preparing',
  'tool-use': 'Working',
} as const

export const spinnerWord = (mode: keyof typeof WORDS): string => WORDS[mode]

type SpinnerInput = { label: string; suffix: string; frame: number; elapsedMs: number }

/** The line that runs while a turn does: a glyph, a word with a color wave in it, the time. */
export const spinnerRow = (t: T, v: SpinnerInput) => {
  const { Box, Text } = t
  const glyph = SPIN[v.frame % SPIN.length] ?? '●'
  const suffix = v.label.endsWith('…') ? '' : v.suffix

  return (
    <Box marginTop={1}>
      <Box width={2} flexShrink={0}>
        <Text color={mix(C.primary, C.secondary, 0.5 - 0.5 * Math.cos(v.frame / 3))}>{glyph}</Text>
      </Box>
      {grad(t, v.label, { phase: v.frame / 14 })}
      <Text color={C.subtle}>{suffix}</Text>
      {v.elapsedMs >= 1000 ? <Text color={C.subtle}>{`  ${fmtDuration(v.elapsedMs)}`}</Text> : null}
    </Box>
  )
}

/** What closes a turn: the model and how long it took. */
export const footerRow = (t: T, model: string, durationMs: number) => {
  const { Box, Text } = t

  return (
    <Box>
      <Text color={C.secondary}>◇ </Text>
      <Text color={C.muted}>{model === '' ? 'Claude' : prettyModel(model)}</Text>
      <Text color={C.subtle}>{`  ${fmtDuration(durationMs)}`}</Text>
    </Box>
  )
}

/** The dim line under the logo, in Crush's notice style. */
export const noticeRow = (t: T, text: string, command: string | null) => {
  const { Box, Text } = t

  return (
    <Box>
      <Text color={C.subtle}>╱ </Text>
      <Text color={C.muted} wrap="truncate-end">
        {clean(text)}
      </Text>
      {command === null ? null : <Text color={C.secondary}>{` ${clean(command)}`}</Text>}
    </Box>
  )
}

/** A slash command's output, in a rounded frame that shrinks to it. */
export const commandBox = (t: T, text: string, isErrored: boolean) => {
  const { Box, Markdown } = t

  return (
    <Box
      paddingX={1}
      borderStyle="round"
      borderColor={isErrored ? C.error : C.line}
      alignSelf="flex-start"
    >
      <Markdown text={text} />
    </Box>
  )
}
