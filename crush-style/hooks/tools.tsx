import type { RenderNode } from 'claude-code'

import { C, SPIN, clean, clip, mix, relPath } from './theme'
import type { T } from './theme'

export type Status = 'running' | 'done' | 'error' | 'interrupted'

export const rec = (v: unknown): Record<string, unknown> =>
  typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {}

export const str = (v: unknown): string => (typeof v === 'string' ? v : '')

const oneLine = (s: string): string => {
  const lines = clean(s)
    .split('\n')
    .map(line => line.trim())
    .filter(line => line !== '')

  return lines.length > 1 ? `${lines[0] ?? ''} …` : (lines[0] ?? '')
}

const firstString = (input: Record<string, unknown>): string => {
  for (const value of Object.values(input)) {
    if (typeof value === 'string' && value !== '') {
      return oneLine(value)
    }
  }

  return ''
}

/** The name Crush gives a tool, and what its row says it is working on. */
export const describeTool = (tool: string, input: unknown, cwd: string): { name: string; detail: string } => {
  const i = rec(input)
  const path = (key: string): string => relPath(str(i[key]), cwd)

  switch (tool) {
    case 'Bash':
      return {
        name: 'Bash',
        detail: oneLine(str(i.command)) + (i.run_in_background === true ? '  (background)' : ''),
      }
    case 'Read': {
      const offset = typeof i.offset === 'number' ? i.offset : undefined
      const limit = typeof i.limit === 'number' ? i.limit : undefined
      const range =
        offset === undefined ? '' : limit === undefined ? `:${offset}` : `:${offset}-${offset + limit}`

      return { name: 'View', detail: path('file_path') + range }
    }
    case 'Edit':
    case 'MultiEdit':
      return { name: 'Edit', detail: path('file_path') }
    case 'Write':
      return { name: 'Write', detail: path('file_path') }
    case 'NotebookEdit':
      return { name: 'Notebook', detail: path('notebook_path') }
    case 'Glob':
      return { name: 'Glob', detail: oneLine(str(i.pattern)) + (str(i.path) === '' ? '' : `  in ${path('path')}`) }
    case 'Grep': {
      const where = str(i.glob) !== '' ? str(i.glob) : str(i.path) === '' ? '' : path('path')

      return { name: 'Grep', detail: oneLine(str(i.pattern)) + (where === '' ? '' : `  in ${where}`) }
    }
    case 'WebFetch':
      return { name: 'Fetch', detail: oneLine(str(i.url)) }
    case 'WebSearch':
      return { name: 'Search', detail: oneLine(str(i.query)) }
    case 'Agent':
    case 'Task': {
      const kind = str(i.subagent_type)

      return {
        name: 'Agent',
        detail: oneLine(str(i.description) !== '' ? str(i.description) : str(i.prompt)) + (kind === '' ? '' : `  (${kind})`),
      }
    }
    case 'TodoWrite': {
      const list = Array.isArray(i.todos) ? i.todos : []
      const done = list.filter(item => rec(item).status === 'completed').length

      return { name: 'To-Do', detail: `${done}/${list.length} done` }
    }
    default:
      break
  }

  if (tool.startsWith('mcp__')) {
    const [, server = '', ...rest] = tool.split('__')
    const detail = firstString(i)

    return { name: rest.join('__') || tool, detail: detail === '' ? server : `${server} · ${detail}` }
  }

  return { name: tool, detail: firstString(i) }
}

/** The label a tool carries in counts and lists. */
export const toolLabel = (tool: string): string => describeTool(tool, {}, '').name

/** Lines added and removed by an Edit or Write result, when it says. */
export const changeStats = (output: unknown): { added: number; removed: number } | undefined => {
  const o = rec(output)
  const git = rec(o.gitDiff)

  if (typeof git.additions === 'number' && typeof git.deletions === 'number') {
    return { added: git.additions, removed: git.deletions }
  }

  if (Array.isArray(o.structuredPatch)) {
    let added = 0
    let removed = 0

    for (const hunk of o.structuredPatch) {
      const lines = rec(hunk).lines

      for (const line of Array.isArray(lines) ? lines : []) {
        if (typeof line !== 'string') {
          continue
        }

        if (line.startsWith('+')) {
          added += 1
        } else if (line.startsWith('-')) {
          removed += 1
        }
      }
    }

    return { added, removed }
  }

  if (o.type === 'create' && typeof o.content === 'string') {
    return { added: o.content.split('\n').length, removed: 0 }
  }

  return undefined
}

/** The `+3 -1` a changed file's row ends with. */
export const diffTail = (t: T, stats: { added: number; removed: number }): RenderNode => {
  const { Text } = t

  return (
    <Text>
      <Text color={C.success}>{`+${stats.added}`}</Text>
      <Text color={C.error}>{` -${stats.removed}`}</Text>
    </Text>
  )
}

/** What an interrupted call's row ends with. */
export const interruptedTail = (t: T): RenderNode => {
  const { Text } = t

  return <Text color={C.warn}>interrupted</Text>
}

type HeaderInput = { status: Status; name: string; detail: string; tail?: RenderNode; frame: number }

/** A tool call's row: status mark, name, what it works on. */
export const toolHeader = (t: T, v: HeaderInput) => {
  const { Box, Text } = t
  const color =
    v.status === 'running'
      ? mix(C.primary, C.secondary, 0.5 - 0.5 * Math.cos(v.frame / 3))
      : v.status === 'done'
        ? C.success
        : v.status === 'error'
          ? C.error
          : C.warn
  const icon =
    v.status === 'running'
      ? (SPIN[v.frame % SPIN.length] ?? '●')
      : v.status === 'done'
        ? '✓'
        : v.status === 'error'
          ? '×'
          : '⊘'

  return (
    <Box>
      <Box width={2} flexShrink={0}>
        <Text color={color}>{icon}</Text>
      </Box>
      <Box flexShrink={0} marginRight={1}>
        <Text color={C.info} bold>
          {v.name}
        </Text>
      </Box>
      <Box flexGrow={1} flexShrink={1}>
        <Text color={C.muted} wrap="truncate-end">
          {v.detail === '' ? ' ' : v.detail}
        </Text>
      </Box>
      {v.tail === undefined ? null : (
        <Box flexShrink={0} marginLeft={1}>
          {v.tail}
        </Box>
      )}
    </Box>
  )
}

type BodyOptions = { max: number; color?: string }

/** Output under a tool row: a gutter, the first lines, and a count of the rest. */
export const outputBody = (t: T, text: string, options: BodyOptions) => {
  const { Box, Text } = t
  const lines = clean(text).replace(/\s+$/, '').split('\n')
  const shown = lines.slice(0, options.max)
  const hidden = lines.length - shown.length

  return (
    <Box flexDirection="column" paddingLeft={2}>
      {shown.map(line => (
        <Box>
          <Box width={2} flexShrink={0}>
            <Text color={C.line}>│</Text>
          </Box>
          <Box flexGrow={1} flexShrink={1}>
            {options.color === undefined ? (
              <Text wrap="truncate-end">{line === '' ? ' ' : clip(line, 400)}</Text>
            ) : (
              <Text color={options.color} wrap="truncate-end">
                {line === '' ? ' ' : clip(line, 400)}
              </Text>
            )}
          </Box>
        </Box>
      ))}
      {hidden > 0 ? (
        <Box>
          <Box width={2} flexShrink={0}>
            <Text color={C.line}>╰</Text>
          </Box>
          <Text color={C.subtle}>{`… ${hidden} more line${hidden === 1 ? '' : 's'} (ctrl+o to expand)`}</Text>
        </Box>
      ) : null}
    </Box>
  )
}
