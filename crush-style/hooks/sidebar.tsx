import type { RenderChildren, RenderNode } from 'claude-code'

import type { FileChange, TodoItem, UsageInfo } from '../types'
import { toolLabel } from './tools'
import { C, clip, clipLeft, cellWidth, dimmed, fmtTokens, fmtUsd, grad, meter, prettyModel, relPath, rule, section, tilde } from './theme'
import type { T } from './theme'

export type Facts = {
  title: string
  cwd: string
  home: string
  branch: string
  model: string
  usage: UsageInfo | null
  files: FileChange[]
  todos: TodoItem[]
  tools: Record<string, number>
}

const LIMIT_LABELS: Record<string, string> = { five_hour: '5h', seven_day: '7d', spend_limit: 'spend' }

const MAX_FILES = 8
const MAX_TODOS = 8
const MAX_TOOLS = 6

/** The docked sidebar: session, model and context, files, to-dos, tool counts. */
export const sidebar = (t: T, f: Facts, columns: number) => {
  const { Box, Text } = t
  const w = Math.max(12, columns - 2)
  const u = f.usage
  const doneTodos = f.todos.filter(todo => todo.status === 'completed').length
  const shownFiles = f.files.slice(0, MAX_FILES)
  const shownTodos = f.todos.slice(0, MAX_TODOS)
  const toolRows = Object.entries(f.tools)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_TOOLS)
  const meterWidth = Math.max(6, Math.min(20, w - 8))

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box>
        {grad(t, 'CLAUDE CODE', { bold: true })}
        <Text> </Text>
        {rule(t, w - 12, { from: dimmed(C.primary), to: dimmed(C.secondary) })}
      </Box>

      <Box marginTop={1}>
        <Text bold wrap="truncate-end">
          {f.title === '' ? 'New session' : f.title}
        </Text>
      </Box>
      <Text color={C.muted} wrap="truncate-start">
        {tilde(f.cwd, f.home)}
      </Text>
      {f.branch === '' ? null : (
        <Text color={C.muted} wrap="truncate-end">
          {`⎇ ${f.branch}`}
        </Text>
      )}

      <Box marginTop={1}>
        <Text color={C.secondary}>◇ </Text>
        <Text wrap="truncate-end">{f.model === '' ? 'Claude' : prettyModel(f.model)}</Text>
      </Box>
      {u === null || u.percent === null ? null : (
        <Box paddingLeft={2}>
          {meter(t, u.percent, meterWidth)}
          <Text color={C.muted}>{` ${Math.round(u.percent)}%`}</Text>
        </Box>
      )}
      {u === null || u.tokens === null ? null : (
        <Box paddingLeft={2}>
          <Text color={C.muted} wrap="truncate-end">
            {`${fmtTokens(u.tokens)} / ${fmtTokens(u.window)}`}
          </Text>
        </Box>
      )}
      {/* The cost on a line of its own: beside the tokens a narrow sidebar cut it to `$1…`. */}
      {u === null || u.usd === null ? null : (
        <Box paddingLeft={2}>
          <Text color={C.muted}>{fmtUsd(u.usd)}</Text>
        </Box>
      )}
      {u === null
        ? null
        : u.limits.map(limit => (
            <Box paddingLeft={2}>
              <Box width={6} flexShrink={0}>
                <Text color={C.muted}>{LIMIT_LABELS[limit.kind] ?? limit.kind}</Text>
              </Box>
              {meter(t, limit.percentUsed, Math.max(4, Math.min(12, w - 14)))}
              <Text color={C.muted}>{` ${Math.round(limit.percentUsed)}%`}</Text>
            </Box>
          ))}

      {section(t, 'Modified Files', w)}
      {shownFiles.length === 0 ? <Text color={C.subtle}>None</Text> : null}
      {shownFiles.map(file => (
        <Box>
          <Box flexShrink={0} marginRight={1}>
            <Text>
              {file.added > 0 ? <Text color={C.success}>{`+${file.added}`}</Text> : null}
              {file.removed > 0 ? <Text color={C.error}>{` -${file.removed}`}</Text> : null}
              {file.added === 0 && file.removed === 0 ? <Text color={C.subtle}>±0</Text> : null}
            </Text>
          </Box>
          <Box flexGrow={1} flexShrink={1}>
            <Text wrap="truncate-start">{relPath(file.path, f.cwd)}</Text>
          </Box>
        </Box>
      ))}
      {f.files.length > shownFiles.length ? (
        <Text color={C.subtle}>{`…and ${f.files.length - shownFiles.length} more`}</Text>
      ) : null}

      {f.todos.length === 0 ? null : section(t, `To-Do ${doneTodos}/${f.todos.length}`, w)}
      {shownTodos.map(todo => (
        <Box>
          <Box width={2} flexShrink={0}>
            {todo.status === 'completed' ? (
              <Text color={C.success}>✓</Text>
            ) : todo.status === 'in_progress' ? (
              <Text color={C.secondary}>●</Text>
            ) : (
              <Text color={C.subtle}>○</Text>
            )}
          </Box>
          <Box flexGrow={1} flexShrink={1}>
            {todo.status === 'in_progress' ? (
              <Text wrap="truncate-end">{todo.activeForm || todo.content}</Text>
            ) : (
              <Text color={C.muted} wrap="truncate-end">
                {todo.content}
              </Text>
            )}
          </Box>
        </Box>
      ))}
      {f.todos.length > shownTodos.length ? (
        <Text color={C.subtle}>{`…and ${f.todos.length - shownTodos.length} more`}</Text>
      ) : null}

      {toolRows.length === 0 ? null : section(t, 'Activity', w)}
      {toolRows.map(([tool, count]) => (
        <Box justifyContent="space-between">
          <Text color={C.muted}>{toolLabel(tool)}</Text>
          <Text color={C.subtle}>{String(count)}</Text>
        </Box>
      ))}
    </Box>
  )
}

type Seg = { w: number; node: RenderNode }

/** One line above the prompt: model, context, cost, to-dos, branch, directory. */
export const bandRow = (t: T, f: Facts, columns: number) => {
  const { Box, Text } = t
  const u = f.usage
  const name = f.model === '' ? 'Claude' : prettyModel(f.model)
  const doneTodos = f.todos.filter(todo => todo.status === 'completed').length
  const segs: Seg[] = []

  segs.push({
    w: 2 + cellWidth(name),
    node: (
      <Text>
        <Text color={C.secondary}>◇ </Text>
        <Text>{name}</Text>
      </Text>
    ),
  })

  if (u !== null && u.percent !== null) {
    const pct = ` ${Math.round(u.percent)}%`

    segs.push({
      w: 8 + cellWidth(pct),
      node: (
        <Text>
          {meter(t, u.percent, 8)}
          <Text color={C.muted}>{pct}</Text>
        </Text>
      ),
    })
  }

  if (u !== null && u.usd !== null) {
    segs.push({ w: cellWidth(fmtUsd(u.usd)), node: <Text color={C.muted}>{fmtUsd(u.usd)}</Text> })
  }

  if (f.todos.length > 0) {
    const label = `✓ ${doneTodos}/${f.todos.length}`

    segs.push({ w: cellWidth(label), node: <Text color={C.muted}>{label}</Text> })
  }

  if (f.branch !== '') {
    const label = `⎇ ${clip(f.branch, 24)}`

    segs.push({ w: cellWidth(label), node: <Text color={C.muted}>{label}</Text> })
  }

  const place = clipLeft(tilde(f.cwd, f.home), 32)

  segs.push({ w: cellWidth(place), node: <Text color={C.subtle}>{place}</Text> })

  const lead = 3
  const sep = 3
  const kept: Seg[] = []
  let used = lead

  for (const seg of segs) {
    const next = used + (kept.length === 0 ? 0 : sep) + seg.w

    if (next > columns - 1) {
      break
    }

    kept.push(seg)
    used = next
  }

  const fill = columns - used - 2
  const row: RenderChildren[] = [rule(t, 2, { from: dimmed(C.primary), to: dimmed(C.secondary) }), <Text> </Text>]

  kept.forEach((seg, i) => {
    if (i > 0) {
      row.push(<Text color={C.subtle}> · </Text>)
    }

    row.push(seg.node)
  })

  if (fill >= 3) {
    row.push(<Text> </Text>)
    row.push(rule(t, fill, { from: dimmed(C.secondary), to: dimmed(C.primary) }))
  }

  return <Box>{row}</Box>
}
