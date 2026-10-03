import { atom, read, update } from 'claude-code'
import type { EngineInterface, PromptDecoration, Register, Timer } from 'claude-code'

import type { FileChange, TodoItem } from '../types'
import { assistantRow, commandBox, footerRow, noticeRow, spinnerRow, spinnerWord, userRow } from './messages'
import { bandRow, sidebar } from './sidebar'
import type { Facts } from './sidebar'
import { C, clean, clip } from './theme'
import { changeStats, describeTool, diffTail, interruptedTail, outputBody, rec, str, toolHeader } from './tools'
import type { Status } from './tools'

const SIDEBAR = 'crush-sidebar'
const DISMISSED = 'sidebarDismissed'
// `$.store` key of the master switch: kept per plugin across every session.
const SWITCH = 'enabled'
const MAX_TEXT = 9900

const CHANGING = ['Edit', 'MultiEdit', 'Write', 'NotebookEdit']

// Every value the drawings read lives in `$.state`, so a hot reload keeps it
// and a write redraws exactly the rows that read it. They are declared here,
// in the file that reads and writes them, which is where the scan looks.
const frameAtom = atom({ plugin: 'crush-style', key: 'frame' } as const, 0)
const turnStartAtom = atom({ plugin: 'crush-style', key: 'turnStartedAt' } as const, 0)
const filesAtom = atom({ plugin: 'crush-style', key: 'files' } as const, [])
const toolsAtom = atom({ plugin: 'crush-style', key: 'tools' } as const, {})
const todosAtom = atom({ plugin: 'crush-style', key: 'todos' } as const, [])
const titleAtom = atom({ plugin: 'crush-style', key: 'title' } as const, '')
const branchAtom = atom({ plugin: 'crush-style', key: 'branch' } as const, '')
const modelAtom = atom({ plugin: 'crush-style', key: 'model' } as const, '')
const usageAtom = atom({ plugin: 'crush-style', key: 'usage' } as const, null)

// Plain values the drawings read without subscribing: they change rarely and
// nothing needs to redraw when they do. A reload starts them over.
let home = ''
let cwd = ''
let modelId = ''
let ticker: Timer | undefined
let isTurnActive = false
let hasTriedOpen = false
let isSidebarAuto = true
// The master switch, as `$.store` holds it; every drawing reads it.
let isOn = true

/** Colors a leading /command, a leading `!` and @file mentions in the draft. */
const decorate = (text: string): PromptDecoration[] => {
  const marks: PromptDecoration[] = []
  const command = /^\/[A-Za-z0-9:_-]+/.exec(text)

  if (command !== null) {
    marks.push({ start: 0, end: command[0].length, color: C.secondary, bold: true })
  } else if (text.startsWith('!')) {
    marks.push({ start: 0, end: 1, color: C.warn, bold: true })
  }

  for (const m of text.matchAll(/(^|\s)(@[^\s]+)/g)) {
    const start = (m.index ?? 0) + (m[1] ?? '').length

    marks.push({ start, end: start + (m[2] ?? '').length, color: C.tertiary })
  }

  return marks
}

const asTodos = (value: unknown): TodoItem[] =>
  (Array.isArray(value) ? value : []).flatMap((item): TodoItem[] => {
    const o = rec(item)
    const status = o.status === 'completed' || o.status === 'in_progress' ? o.status : 'pending'
    const content = clip(clean(str(o.content)).trim(), 160)

    return content === ''
      ? []
      : [{ content, status, activeForm: clip(clean(str(o.activeForm)).trim(), 160) }]
  })

/** Ticks the animation frame while a turn runs; it ends itself when none does. */
function startTicker($: EngineInterface): void {
  if (ticker === undefined) {
    ticker = $.clock.every(120, () => {
      if (!isTurnActive) {
        stopTicker()

        return
      }

      void update($, frameAtom, n => ((n ?? 0) + 1) % 1_000_000)
    })
  }
}

function stopTicker(): void {
  ticker?.cancel()
  ticker = undefined
}

/** Context, cost and limits, the model and the directory, as the status line has them. */
async function refresh($: EngineInterface): Promise<void> {
  try {
    const [figures, model, dir] = await Promise.all([$.session.usage(), $.session.model(), $.session.cwd()])

    modelId = model
    cwd = dir
    await update($, modelAtom, () => model)
    await update($, usageAtom, () => ({
      percent: figures.context.percent ?? null,
      tokens: figures.context.tokens ?? null,
      window: figures.context.window,
      usd: figures.cost?.usd ?? null,
      limits: figures.rateLimits.map(limit => ({ kind: limit.kind, percentUsed: limit.percentUsed })),
    }))
  } catch {
    // The figures stay as they were.
  }
}

async function refreshBranch($: EngineInterface): Promise<void> {
  try {
    const run = await $.process.run(['git', 'branch', '--show-current'], { timeoutMs: 4000 })
    const name = run.exitCode === 0 ? run.stdout.trim() : ''

    await update($, branchAtom, () => name)
  } catch {
    // Not a repository, or no git: no branch.
  }
}

async function gather($: EngineInterface, isFull: boolean): Promise<Facts> {
  const [title, branch, model, usage, todos] = await Promise.all([
    isFull ? read($, titleAtom) : '',
    read($, branchAtom),
    read($, modelAtom),
    read($, usageAtom),
    read($, todosAtom),
  ])
  const [files, tools] = isFull ? await Promise.all([read($, filesAtom), read($, toolsAtom)]) : [[], {}]

  return {
    title,
    cwd: cwd === '' ? await $.session.cwd() : cwd,
    home,
    branch,
    model,
    usage,
    files,
    todos,
    tools,
  }
}

async function openSidebar($: EngineInterface): Promise<void> {
  await $.ui.open({ id: SIDEBAR, title: 'Session', columns: 38 })
}

async function openIfWanted($: EngineInterface): Promise<void> {
  if ((await $.store.get(DISMISSED)) !== true) {
    await openSidebar($)
  }
}

/** Opens the sidebar once, and only where it would dock beside the transcript. */
function openOnce($: EngineInterface): void {
  if (!isSidebarAuto || hasTriedOpen) {
    return
  }

  hasTriedOpen = true

  try {
    $.clock.after(0, () => {
      openIfWanted($).catch(() => undefined)
    })
  } catch {
    hasTriedOpen = false
  }
}

/** Reads the master switch; a change redraws every row this mod draws. */
async function loadSwitch($: EngineInterface): Promise<void> {
  try {
    const stored = (await $.store.get(SWITCH)) !== false

    if (stored !== isOn) {
      isOn = stored
      $.ui.invalidate('ui.render')
    }
  } catch {
    // The look stays as it is.
  }
}

/**
 * `/crush [on|off]`: the master switch. It is kept in `$.store`, which lasts
 * across sessions, so every new session starts the way the last /crush left
 * it; this one redraws at once.
 */
async function switchLook($: EngineInterface, args: string): Promise<{ text: string }> {
  const word = args.trim().toLowerCase()
  const want = word === 'on' ? true : word === 'off' ? false : word === '' ? !isOn : undefined

  if (want === undefined) {
    return { text: 'Usage: /crush on, /crush off, or /crush alone to toggle. The choice is kept for every session.' }
  }

  if (want === isOn) {
    return { text: `Crush style is already ${isOn ? 'on' : 'off'}.` }
  }

  await $.store.set(SWITCH, want)
  isOn = want

  if (want) {
    hasTriedOpen = false
  } else {
    stopTicker()
    await $.ui.close({ id: SIDEBAR }).catch(() => undefined)
  }

  $.ui.invalidate('ui.render')

  return {
    text: want
      ? 'Crush style on, here and in every new session.'
      : 'Crush style off, here and in every new session. /crush on brings it back.',
  }
}

export const register: Register = (on, options) => {
  const showBand = options.band !== false
  const expandGroups = options.toolGroups !== 'fold'
  const crushWords = options.spinnerWords !== 'claude'

  isSidebarAuto = options.sidebar !== false

  on('command.run', { command: 'crush' }, ($, e) => switchLook($, e.args))

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'crush',
      description: 'Crush-style look on or off for every session: /crush on, /crush off',
    })

    await loadSwitch($)

    home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME')) ?? ''
    await $.command.register({ name: 'sidebar', description: 'Toggle the Crush-style sidebar' })
    await Promise.all([refresh($), refreshBranch($)])

    // A reload in the middle of a turn: its clock is in `$.state`, its ticker is gone.
    try {
      if ((await read($, turnStartAtom)) > 0) {
        isTurnActive = true
        startTicker($)
      }
    } catch {
      // The spinner holds its last frame until the next turn.
    }

    return next(e)
  })

  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') {
      await Promise.all([
        update($, filesAtom, () => []),
        update($, toolsAtom, () => ({})),
        update($, todosAtom, () => []),
        update($, titleAtom, () => ''),
      ])
    }

    return next(e)
  })

  on('command.run', { command: 'sidebar' }, async $ => {
    if (!isOn) {
      return { text: 'Crush style is off. /crush on turns it back on.' }
    }

    const isOpen = (await $.ui.panes()).some(pane => pane.id === SIDEBAR)

    if (isOpen) {
      await $.store.set(DISMISSED, true)
      await $.ui.close({ id: SIDEBAR })

      return { text: 'Sidebar off.' }
    }

    await $.store.set(DISMISSED, false)
    await openSidebar($)

    return { text: 'Sidebar on.' }
  })

  on('ui.close', { id: SIDEBAR }, async ($, e, next) => {
    if (e.origin.kind === 'person') {
      await $.store.set(DISMISSED, true)
    }

    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    const text = clean(e.text).trim()

    if (e.origin.kind === 'composer' && text !== '' && !text.startsWith('/')) {
      const first = clip(text.split('\n')[0]?.replace(/\s+/g, ' ') ?? '', 80)

      await update($, titleAtom, current => (current === undefined || current === '' ? first : current))
    }

    return next(e)
  })

  on('prompt.edit', async ($, e, next) => {
    if (!isOn) {
      return next(e)
    }

    const box = await next(e)
    const marks = decorate(box.text)

    return marks.length === 0 ? box : { ...box, decorations: [...(box.decorations ?? []), ...marks] }
  })

  on('turn.start', async ($, e, next) => {
    const now = await $.clock.now()

    await update($, turnStartAtom, () => now)
    isTurnActive = true

    if (isOn) {
      startTicker($)
    }

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)

    if (e.agentId === undefined) {
      isTurnActive = false
      stopTicker()
      await update($, turnStartAtom, () => 0)
      await Promise.all([refresh($), refreshBranch($)])
    }

    return done
  })

  on('tool.call', async ($, e, next) => {
    const tool = String(e.tool)

    await update($, toolsAtom, counts => ({ ...counts, [tool]: ((counts ?? {})[tool] ?? 0) + 1 }))

    const ran = await next(e)

    try {
      if (ran.deny !== undefined || ran.isError === true) {
        return ran
      }

      const input = rec(e)

      if (CHANGING.includes(tool) && rec(ran.result).staged !== true) {
        const path = str(input.file_path) !== '' ? str(input.file_path) : str(input.notebook_path)
        const stats = changeStats(ran.result)

        if (path !== '' && stats !== undefined) {
          await update($, filesAtom, list => {
            const current = list ?? []
            const prior = current.find(file => file.path === path)
            const merged: FileChange = {
              path,
              added: (prior?.added ?? 0) + stats.added,
              removed: (prior?.removed ?? 0) + stats.removed,
            }

            return [merged, ...current.filter(file => file.path !== path)].slice(0, 50)
          })
        }
      } else if (tool === 'TodoWrite') {
        await update($, todosAtom, () => asTodos(input.todos))
      }
    } catch {
      // The sidebar misses one update; the call itself is untouched.
    }

    return ran
  })

  on('ui.render', { component: 'UserMessage' }, ($, e, next) => {
    if (!isOn || e.surface !== 'terminal' || e.props.origin.kind !== 'composer' || e.props.text.length > 8000) {
      return next(e)
    }

    return userRow($.ui.resolve(e), e.props.text, e.viewport?.columns ?? 100)
  })

  on('ui.render', { component: 'AssistantMessage' }, ($, e, next) => {
    if (!isOn || e.surface !== 'terminal') {
      return next(e)
    }

    const text = clean(e.props.text)

    return text.trim() === '' || text.length > MAX_TEXT ? next(e) : assistantRow($.ui.resolve(e), text)
  })

  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    if (!isOn || e.surface !== 'terminal') {
      return next(e)
    }

    const p = e.props
    const t = $.ui.resolve(e)
    const status: Status = p.isRunning ? 'running' : p.isInterrupted ? 'interrupted' : p.isErrored ? 'error' : 'done'
    const { name, detail } = describeTool(p.tool, p.input, cwd)
    const frame = status === 'running' ? await read($, frameAtom) : 0
    const stats = status === 'done' && CHANGING.includes(p.tool) ? changeStats(p.output) : undefined
    const tail =
      stats !== undefined ? diffTail(t, stats) : status === 'interrupted' ? interruptedTail(t) : undefined

    return toolHeader(t, { status, name, detail, ...(tail === undefined ? {} : { tail }), frame })
  })

  on('ui.render', { component: 'ToolResult' }, ($, e, next) => {
    if (!isOn || e.surface !== 'terminal') {
      return next(e)
    }

    const p = e.props
    const t = $.ui.resolve(e)

    if (p.isErrored) {
      return typeof p.output === 'string' && p.output.trim() !== ''
        ? outputBody(t, p.output, { max: 6, color: C.error })
        : next(e)
    }

    if (p.tool !== 'Bash') {
      return next(e)
    }

    const out = rec(p.output)

    if (out.isImage === true || typeof out.backgroundTaskId === 'string') {
      return next(e)
    }

    const text = [str(out.stdout), str(out.stderr)].filter(part => part.trim() !== '').join('\n')

    return text === ''
      ? outputBody(t, '(no output)', { max: 1, color: C.subtle })
      : outputBody(t, text, { max: 10 })
  })

  on('ui.render', { component: 'ToolGroup' }, ($, e, next) => {
    if (!isOn || e.surface !== 'terminal' || !expandGroups || e.props.isExpanded) {
      return next(e)
    }

    return next({ ...e, props: { ...e.props, isExpanded: true } })
  })

  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    if (!isOn || e.surface !== 'terminal') {
      return next(e)
    }

    const frame = await read($, frameAtom)
    const startedAt = await read($, turnStartAtom)
    const now = await $.clock.now()
    const label = e.props.message ?? (crushWords ? spinnerWord(e.props.mode) : e.props.word)

    return spinnerRow($.ui.resolve(e), {
      label,
      suffix: e.props.suffix,
      frame,
      elapsedMs: startedAt > 0 ? now - startedAt : 0,
    })
  })

  on('ui.render', { component: 'TurnDuration' }, ($, e, next) => {
    if (!isOn || e.surface !== 'terminal') {
      return next(e)
    }

    return footerRow($.ui.resolve(e), modelId, e.props.durationMs)
  })

  on('ui.render', { component: 'InfoNotice' }, ($, e, next) => {
    if (!isOn || e.surface !== 'terminal') {
      return next(e)
    }

    return noticeRow($.ui.resolve(e), e.props.text, e.props.command)
  })

  on('ui.render', { component: 'CommandOutput' }, ($, e, next) => {
    if (!isOn || e.surface !== 'terminal') {
      return next(e)
    }

    const text = clean(e.props.text)

    return text.trim() === '' || text.length > MAX_TEXT
      ? next(e)
      : commandBox($.ui.resolve(e), text, e.props.isErrored)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (!isOn || e.surface !== 'terminal') {
      return next(e)
    }

    if (e.viewport?.isFullscreen === true) {
      openOnce($)
    }

    const isDocked = (e.viewport?.columns ?? 0) > e.props.bodyColumns

    if (!showBand || e.props.hasSurvey || isDocked) {
      return next(e)
    }

    return bandRow($.ui.resolve(e), await gather($, false), e.props.bodyColumns)
  })

  on('ui.render', { component: 'Pane', requestId: SIDEBAR }, async ($, e, next) => {
    if (!isOn || e.surface !== 'terminal') {
      return next(e)
    }

    return sidebar($.ui.resolve(e), await gather($, true), e.props.bodyColumns)
  })
}
