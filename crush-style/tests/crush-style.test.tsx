import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const VIEW = { columns: 100, rows: 30 }
const SIDE = { columns: 140, rows: 40, isFullscreen: true }
const PLUGIN = 'crush-style'

const BAND = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 5,
  bodyColumns: 100,
  scroll: { offset: 0, bodyRows: 5 },
  view: {},
}

const PANE = {
  title: 'Session',
  isFocused: false,
  bodyColumns: 38,
  placement: 'dock',
  scroll: { offset: 0, bodyRows: 40 },
  view: {},
} as const

// What the session reports of itself; a test moves `percent` to move the figures.
const figures = { percent: 34 }

const usage = () =>
  ({
    startedAt: 0,
    context: { tokens: 68000, window: 200000, percent: figures.percent },
    rateLimits: [{ kind: 'five_hour', percentUsed: 23 }],
    cost: { usd: 0.42 },
  }) as never

// What the engine answers beneath the mod: its own drawing is one Text, and the
// session answers the few questions the mod asks of it.
const beneath = (on: On, store: Readonly<Record<string, unknown>> = {}) => {
  figures.percent = 34

  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: 'C:/proj' }))
  on('session.model', () => ({ value: 'claude-sonnet-5-5' }))
  on('session.usage', () => ({ value: usage() }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: 'main\n', stderr: '' } }) as never)
  on('command.register', () => ({ value: { command: 'sidebar' } }))
  on('prompt.submit', (_$, e) => ({ text: e.text }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  mock.env(on, { USERPROFILE: 'C:/Users/me' })
  mock.store(on, store)

  return mock.clock(on, { now: 1_000_000 })
}

describe('messages', () => {
  test('a typed prompt carries a bar down its left edge', async ($, on) => {
    beneath(on)

    const ui = await $.ui.mount({
      plugin: PLUGIN,
      surface: 'terminal',
      component: 'UserMessage',
      viewport: VIEW,
      props: { text: 'fix the build', origin: { kind: 'composer' }, isExpanded: true },
    })

    expect(await ui.find({ type: 'Text', text: 'fix the build' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '▌' })).toBeDefined()
    await ui.unmount()
  })

  test('a long prompt gets a bar as tall as its wrapped rows', async ($, on) => {
    beneath(on)

    const ui = await $.ui.mount({
      plugin: PLUGIN,
      surface: 'terminal',
      component: 'UserMessage',
      viewport: { columns: 40, rows: 30 },
      props: { text: '你好'.repeat(30), origin: { kind: 'composer' }, isExpanded: true },
    })

    // Sixty wide characters are 120 cells: four rows at 37 columns.
    expect((await ui.find({ type: 'Text', text: /▌\n▌\n▌/ }))?.text).toBeDefined()
    await ui.unmount()
  })

  test('a task notification keeps the engine row', async ($, on) => {
    beneath(on)

    const ui = await $.ui.mount({
      plugin: PLUGIN,
      surface: 'terminal',
      component: 'UserMessage',
      viewport: VIEW,
      props: { text: 'build finished', origin: { kind: 'task-notification' }, isExpanded: false },
    })

    expect(await ui.find({ type: 'Text', text: 'engine' })).toBeDefined()
    await ui.unmount()
  })

  test('only the terminal is restyled', async ($, on) => {
    beneath(on)

    for (const surface of ['desktop', 'vscode', 'mobile'] as const) {
      const ui = await $.ui.mount({
        plugin: PLUGIN,
        surface,
        component: 'AssistantMessage',
        viewport: VIEW,
        props: { text: 'hello', isFirstOfReply: true },
      })

      expect(await ui.find({ type: 'Text', text: 'engine' })).toBeDefined()
      await ui.unmount()
    }
  })

  test('a reply is drawn as markdown under a two column indent', async ($, on) => {
    beneath(on)

    const ui = await $.ui.mount({
      plugin: PLUGIN,
      surface: 'terminal',
      component: 'AssistantMessage',
      viewport: VIEW,
      props: { text: '**done**\u0007', isFirstOfReply: true },
    })

    expect(await ui.find({ type: 'Markdown', text: '**done**' })).toBeDefined()
    await ui.unmount()
  })

  test('a reply past the markdown limit keeps the engine drawing', async ($, on) => {
    beneath(on)

    const ui = await $.ui.mount({
      plugin: PLUGIN,
      surface: 'terminal',
      component: 'AssistantMessage',
      viewport: VIEW,
      props: { text: 'x'.repeat(12000), isFirstOfReply: false },
    })

    expect(await ui.find({ type: 'Text', text: 'engine' })).toBeDefined()
    await ui.unmount()
  })

  test('the spinner speaks Crush by mode and counts the turn', async ($, on) => {
    const clock = beneath(on)
    const props = { word: 'Sauteing', message: null, suffix: '…', mode: 'thinking' } as const

    await $.turn.start({ text: 'hi', turnId: 'turn-1' })

    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'Spinner', viewport: VIEW, props })

    expect(await ui.find({ type: 'Text', text: /Thinking/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /5s/ })).toBeUndefined()

    await clock.advance(5000)
    await ui.redraw()

    expect(await ui.find({ type: 'Text', text: /5s/ })).toBeDefined()
    await ui.unmount()
  })

  test('the spinner shows a state message in place of the word', async ($, on) => {
    beneath(on)

    const ui = await $.ui.mount({
      plugin: PLUGIN,
      surface: 'terminal',
      component: 'Spinner',
      viewport: VIEW,
      props: { word: 'Sauteing', message: 'Compacting conversation…', suffix: '…', mode: 'requesting' },
    })

    expect(await ui.find({ type: 'Text', text: /Compacting conversation…/ })).toBeDefined()
    await ui.unmount()
  })

  test('the spinner keeps Claude Code verbs when asked', { options: { spinnerWords: 'claude' } }, async ($, on) => {
    beneath(on)

    const ui = await $.ui.mount({
      plugin: PLUGIN,
      surface: 'terminal',
      component: 'Spinner',
      viewport: VIEW,
      props: { word: 'Sauteing', message: null, suffix: '…', mode: 'thinking' },
    })

    expect(await ui.find({ type: 'Text', text: /Sauteing/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Thinking/ })).toBeUndefined()
    await ui.unmount()
  })

  test('a turn closes with the model and its time', async ($, on) => {
    beneath(on)
    await $.session.start({ cwd: 'C:/proj', surface: 'terminal', isInteractive: true })

    const ui = await $.ui.mount({
      plugin: PLUGIN,
      surface: 'terminal',
      component: 'TurnDuration',
      viewport: VIEW,
      props: { word: 'Baked', durationMs: 64000 },
    })

    expect(await ui.find({ type: 'Text', text: 'Sonnet 5.5' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /1m 4s/ })).toBeDefined()
    await ui.unmount()
  })

  test('a command answers in a rounded frame', async ($, on) => {
    beneath(on)

    const ui = await $.ui.mount({
      plugin: PLUGIN,
      surface: 'terminal',
      component: 'CommandOutput',
      viewport: VIEW,
      props: { command: 'cost', args: '', text: 'Total cost: $0.42', isErrored: false },
    })

    expect(await ui.find({ type: 'Markdown', text: /0\.42/ })).toBeDefined()
    expect(await ui.drawn()).toMatchObject({ type: 'Box', props: { borderStyle: 'round' } })
    await ui.unmount()
  })
})

describe('tools', () => {
  test('a finished edit shows its path and lines changed', async ($, on) => {
    beneath(on)
    await $.session.start({ cwd: 'C:/proj', surface: 'terminal', isInteractive: true })

    const ui = await $.ui.mount({
      plugin: PLUGIN,
      surface: 'terminal',
      component: 'ToolUse',
      viewport: VIEW,
      props: {
        tool_use_id: 't1',
        tool: 'Edit',
        input: { file_path: 'C:\\proj\\src\\app.ts' },
        isRunning: false,
        isErrored: false,
        isInterrupted: false,
        output: {
          structuredPatch: [
            { oldStart: 1, oldLines: 2, newStart: 1, newLines: 3, lines: [' a', '-b', '+c', '+d'] },
          ],
        },
      },
    })

    expect(await ui.find({ type: 'Text', text: '✓' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Edit' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'src/app.ts' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '+2' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '-1' })).toBeDefined()
    await ui.unmount()
  })

  test('a running command animates and a failed one is marked', async ($, on) => {
    beneath(on)

    const base = {
      tool_use_id: 't2',
      tool: 'Bash',
      input: { command: 'npm test\nnpm run lint' },
      isInterrupted: false,
    }
    const running = await $.ui.mount({
      plugin: PLUGIN,
      surface: 'terminal',
      component: 'ToolUse',
      viewport: VIEW,
      props: { ...base, isRunning: true, isErrored: false },
    })

    expect(await running.find({ type: 'Text', text: /npm test …/ })).toBeDefined()
    await running.unmount()

    const failed = await $.ui.mount({
      plugin: PLUGIN,
      surface: 'terminal',
      component: 'ToolUse',
      viewport: VIEW,
      props: { ...base, isRunning: false, isErrored: true },
    })

    expect(await failed.find({ type: 'Text', text: '×' })).toBeDefined()
    await failed.unmount()
  })

  test('Crush names read and search tools, and MCP tools by server', async ($, on) => {
    beneath(on)

    const rows: [string, unknown, string][] = [
      ['Read', { file_path: 'C:/proj/a.ts', offset: 10, limit: 20 }, 'View'],
      ['WebFetch', { url: 'https://example.com' }, 'Fetch'],
      ['Grep', { pattern: 'TODO', glob: '*.ts' }, 'Grep'],
      ['mcp__github__create_issue', { title: 'Bug' }, 'create_issue'],
    ]

    for (const [tool, input, name] of rows) {
      const ui = await $.ui.mount({
        plugin: PLUGIN,
        surface: 'terminal',
        component: 'ToolUse',
        viewport: VIEW,
        props: { tool_use_id: tool, tool, input, isRunning: false, isErrored: false, isInterrupted: false },
      })

      expect(await ui.find({ type: 'Text', text: name })).toBeDefined()
      await ui.unmount()
    }
  })

  test('shell output shows ten lines and counts the rest', async ($, on) => {
    beneath(on)

    const stdout = Array.from({ length: 14 }, (_, i) => `line ${i + 1}`).join('\n')
    const ui = await $.ui.mount({
      plugin: PLUGIN,
      surface: 'terminal',
      component: 'ToolResult',
      viewport: VIEW,
      props: {
        tool_use_id: 't3',
        tool: 'Bash',
        output: { stdout: `${stdout}\u001b[31m!\u001b[0m`, stderr: '', interrupted: false },
        isErrored: false,
      },
    })

    expect(await ui.find({ type: 'Text', text: 'line 10' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'line 11' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /… 4 more lines/ })).toBeDefined()
    await ui.unmount()
  })

  test('an errored call shows its text in red', async ($, on) => {
    beneath(on)

    const ui = await $.ui.mount({
      plugin: PLUGIN,
      surface: 'terminal',
      component: 'ToolResult',
      viewport: VIEW,
      props: { tool_use_id: 't4', tool: 'Bash', output: 'Exit code 1\nboom', isErrored: true },
    })

    expect((await ui.find({ type: 'Text', text: 'boom' }))?.props).toMatchObject({ color: '#EB4268' })
    await ui.unmount()
  })

  test('other tools keep the engine result', async ($, on) => {
    beneath(on)

    const ui = await $.ui.mount({
      plugin: PLUGIN,
      surface: 'terminal',
      component: 'ToolResult',
      viewport: VIEW,
      props: { tool_use_id: 't5', tool: 'Read', output: { numLines: 3 }, isErrored: false },
    })

    expect(await ui.find({ type: 'Text', text: 'engine' })).toBeDefined()
    await ui.unmount()
  })

  test('runs of reads unfold into rows of their own', async ($, on) => {
    let seen: boolean | undefined

    on('ui.render', { component: 'ToolGroup' }, ($, e) => {
      const { Text } = $.ui.resolve(e)

      seen = e.props.isExpanded

      return <Text>engine</Text>
    })

    const ui = await $.ui.mount({
      plugin: PLUGIN,
      surface: 'terminal',
      component: 'ToolGroup',
      viewport: VIEW,
      props: { calls: [], isActive: false, isExpanded: false },
    })

    expect(seen).toBe(true)
    await ui.unmount()
  })

  test('runs of reads stay folded when asked', { options: { toolGroups: 'fold' } }, async ($, on) => {
    let seen: boolean | undefined

    on('ui.render', { component: 'ToolGroup' }, ($, e) => {
      const { Text } = $.ui.resolve(e)

      seen = e.props.isExpanded

      return <Text>engine</Text>
    })

    const ui = await $.ui.mount({
      plugin: PLUGIN,
      surface: 'terminal',
      component: 'ToolGroup',
      viewport: VIEW,
      props: { calls: [], isActive: false, isExpanded: false },
    })

    expect(seen).toBe(false)
    await ui.unmount()
  })
})

describe('sidebar', () => {
  test('it lists files, to-dos and tool counts the session produced', async ($, on) => {
    beneath(on)
    on('tool.call', ($, e) => {
      if (e.tool === 'Edit') {
        return {
          result: {
            filePath: 'C:/proj/src/app.ts',
            structuredPatch: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 3, lines: ['-a', '+b', '+c'] }],
          },
        } as never
      }

      return { result: {} } as never
    })

    await $.session.start({ cwd: 'C:/proj', surface: 'terminal', isInteractive: true })
    await $.prompt.submit({ text: 'make the sidebar work', origin: { kind: 'composer' } } as never)
    await $.tool.call({ tool: 'Edit', file_path: 'C:/proj/src/app.ts', old_string: 'a', new_string: 'b' } as never)
    await $.tool.call({
      tool: 'TodoWrite',
      todos: [
        { content: 'Write it', status: 'completed', activeForm: 'Writing it' },
        { content: 'Test it', status: 'in_progress', activeForm: 'Testing it' },
        { content: 'Ship it', status: 'pending', activeForm: 'Shipping it' },
      ],
    } as never)

    const ui = await $.ui.mount({
      plugin: PLUGIN,
      surface: 'terminal',
      component: 'Pane',
      requestId: 'crush-sidebar',
      viewport: SIDE,
      props: {
        title: 'Session',
        isFocused: false,
        bodyColumns: 38,
        placement: 'dock',
        scroll: { offset: 0, bodyRows: 40 },
        view: {},
      },
    })

    expect(await ui.find({ type: 'Text', text: 'make the sidebar work' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'src/app.ts' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '+2' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Sonnet 5.5' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /34%/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /To-Do 1\/3/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Testing it' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Edit' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '⎇ main' })).toBeDefined()
    await ui.unmount()
  })
})

describe('band and draft', () => {
  test('a band sums up the session above the prompt', async ($, on) => {
    beneath(on)
    await $.session.start({ cwd: 'C:/proj', surface: 'terminal', isInteractive: true })

    const ui = await $.ui.mount({
      plugin: PLUGIN,
      surface: 'terminal',
      component: 'AbovePrompt',
      viewport: VIEW,
      props: BAND,
    })

    expect(await ui.find({ type: 'Text', text: 'Sonnet 5.5' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '$0.42' })).toBeDefined()
    await ui.unmount()
  })

  test('the band gives way to a docked sidebar', async ($, on) => {
    beneath(on)

    const ui = await $.ui.mount({
      plugin: PLUGIN,
      surface: 'terminal',
      component: 'AbovePrompt',
      viewport: SIDE,
      props: BAND,
    })

    expect(await ui.find({ type: 'Text', text: 'engine' })).toBeDefined()
    await ui.unmount()
  })

  test('the band gives way to a survey', async ($, on) => {
    beneath(on)

    const ui = await $.ui.mount({
      plugin: PLUGIN,
      surface: 'terminal',
      component: 'AbovePrompt',
      viewport: VIEW,
      props: { ...BAND, hasSurvey: true },
    })

    expect(await ui.find({ type: 'Text', text: 'engine' })).toBeDefined()
    await ui.unmount()
  })

  test('/commands and @files are colored as they are typed', async ($, on) => {
    on('prompt.edit', (_$, e) => ({ text: e.inputText, cursor: e.inputText.length }))

    // The engine raises prompt.edit itself as the person types; the test kit's
    // typings do not list it among the calls a test can make, the runtime does.
    const prompt = $.prompt as unknown as {
      edit: (e: object) => Promise<{ decorations?: readonly object[] }>
    }
    const box = await prompt.edit({
      origin: { kind: 'composer' },
      text: '',
      cursor: 0,
      start: 0,
      end: 0,
      inputText: '/review @src/app.ts now',
    })

    expect(box.decorations).toEqual([
      { start: 0, end: 7, color: '#FF60FF', bold: true },
      { start: 8, end: 19, color: '#68FFD6' },
    ])
  })
})

describe('lifecycle', () => {
  const opens = (on: On): string[] => {
    const opened: string[] = []

    on('ui.open', (_$, e) => {
      opened.push(e.id)

      return { value: { isPlaced: true } }
    })

    return opened
  }

  test('the sidebar opens by itself, once, where it would dock', async ($, on) => {
    const clock = beneath(on)
    const opened = opens(on)
    const ui = await $.ui.mount({
      plugin: PLUGIN,
      surface: 'terminal',
      component: 'AbovePrompt',
      viewport: SIDE,
      props: BAND,
    })

    await clock.advance(10)
    expect(opened).toEqual(['crush-sidebar'])

    await ui.redraw()
    await clock.advance(10)
    expect(opened).toEqual(['crush-sidebar'])
    await ui.unmount()
  })

  test('the sidebar stays shut outside the fullscreen layout', async ($, on) => {
    const clock = beneath(on)
    const opened = opens(on)
    const ui = await $.ui.mount({
      plugin: PLUGIN,
      surface: 'terminal',
      component: 'AbovePrompt',
      viewport: { columns: 160, rows: 40, isFullscreen: false },
      props: BAND,
    })

    await clock.advance(10)
    expect(opened).toEqual([])
    await ui.unmount()
  })

  test('the sidebar stays shut once the person closed it', async ($, on) => {
    const clock = beneath(on, { sidebarDismissed: true })
    const opened = opens(on)
    const ui = await $.ui.mount({
      plugin: PLUGIN,
      surface: 'terminal',
      component: 'AbovePrompt',
      viewport: SIDE,
      props: BAND,
    })

    await clock.advance(10)
    expect(opened).toEqual([])
    await ui.unmount()
  })

  test('the sidebar stays shut when switched off in config', { options: { sidebar: false } }, async ($, on) => {
    const clock = beneath(on)
    const opened = opens(on)
    const ui = await $.ui.mount({
      plugin: PLUGIN,
      surface: 'terminal',
      component: 'AbovePrompt',
      viewport: SIDE,
      props: BAND,
    })

    await clock.advance(10)
    expect(opened).toEqual([])
    await ui.unmount()
  })

  test('/sidebar toggles the pane, and off stays off', async ($, on) => {
    const clock = beneath(on)

    let panes: { id: string }[] = []
    const calls: string[] = []

    on('ui.panes', () => ({ value: panes }) as never)
    on('ui.open', (_$, e) => {
      calls.push(`open ${e.id}`)
      panes = [{ id: e.id }]

      return { value: { isPlaced: true } }
    })
    on('ui.close', (_$, e) => {
      calls.push(`close ${e.id}`)
      panes = []

      return { value: undefined } as never
    })

    const run = () =>
      $.command.run({ command: 'sidebar', args: '', origin: { kind: 'composer' }, presentation: {} } as never)

    expect((await run()).text).toBe('Sidebar on.')
    expect((await run()).text).toBe('Sidebar off.')
    expect(calls).toEqual(['open crush-sidebar', 'close crush-sidebar'])

    // Switched off by hand, the sidebar does not come back by itself.
    const ui = await $.ui.mount({
      plugin: PLUGIN,
      surface: 'terminal',
      component: 'AbovePrompt',
      viewport: SIDE,
      props: BAND,
    })

    await clock.advance(10)
    expect(calls).toEqual(['open crush-sidebar', 'close crush-sidebar'])
    await ui.unmount()
  })

  test('/clear starts the sidebar over', async ($, on) => {
    beneath(on)
    on('session.end', () => ({ sessionId: 'session-1' }) as never)
    on('tool.call', () => ({
      result: { structuredPatch: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 2, lines: ['-a', '+b'] }] },
    }) as never)

    await $.session.start({ cwd: 'C:/proj', surface: 'terminal', isInteractive: true })
    await $.prompt.submit({ text: 'first prompt', origin: { kind: 'composer' } } as never)
    await $.tool.call({ tool: 'Edit', file_path: 'C:/proj/a.ts', old_string: 'a', new_string: 'b' } as never)

    const before = await $.ui.mount({
      plugin: PLUGIN,
      surface: 'terminal',
      component: 'Pane',
      requestId: 'crush-sidebar',
      viewport: SIDE,
      props: PANE,
    })

    expect(await before.find({ type: 'Text', text: 'first prompt' })).toBeDefined()
    expect(await before.find({ type: 'Text', text: 'a.ts' })).toBeDefined()

    await $.session.end({ reason: 'clear' } as never)
    await before.redraw()

    expect(await before.find({ type: 'Text', text: 'first prompt' })).toBeUndefined()
    expect(await before.find({ type: 'Text', text: 'New session' })).toBeDefined()
    expect(await before.find({ type: 'Text', text: 'None' })).toBeDefined()
    await before.unmount()
  })

  test('the first prompt names the session and slash commands do not', async ($, on) => {
    beneath(on)

    for (const text of ['/effort high', '', '  lay out the   sidebar\nwith two columns ']) {
      await $.prompt.submit({ text, origin: { kind: 'composer' } } as never)
    }

    const ui = await $.ui.mount({
      plugin: PLUGIN,
      surface: 'terminal',
      component: 'Pane',
      requestId: 'crush-sidebar',
      viewport: SIDE,
      props: PANE,
    })

    expect(await ui.find({ type: 'Text', text: 'lay out the sidebar' })).toBeDefined()
    await ui.unmount()
  })

  test('a finished turn refreshes the figures the band shows', async ($, on) => {
    const clock = beneath(on)

    on('turn.complete', () => ({ text: '' }))

    await $.session.start({ cwd: 'C:/proj', surface: 'terminal', isInteractive: true })

    const ui = await $.ui.mount({
      plugin: PLUGIN,
      surface: 'terminal',
      component: 'AbovePrompt',
      viewport: VIEW,
      props: BAND,
    })

    expect(await ui.find({ type: 'Text', text: /34%/ })).toBeDefined()

    figures.percent = 52
    await $.turn.start({ text: 'go', turnId: 'turn-9' })
    await clock.advance(500)
    await $.turn.complete({ answer: 'done', durationMs: 500, isAborted: false, turnId: 'turn-9', reason: 'answer' })
    await ui.redraw()

    expect(await ui.find({ type: 'Text', text: /52%/ })).toBeDefined()
    await ui.unmount()
  })

  test('the animation clock stops with the turn', async ($, on) => {
    const clock = beneath(on)

    on('turn.complete', () => ({ text: '' }))

    const ui = await $.ui.mount({
      plugin: PLUGIN,
      surface: 'terminal',
      component: 'Spinner',
      viewport: VIEW,
      props: { word: 'Sauteing', message: null, suffix: '…', mode: 'thinking' },
    })
    const glyphs = async (): Promise<string> => JSON.stringify(await ui.drawn())

    await $.turn.start({ text: 'go', turnId: 'turn-1' })
    await ui.redraw()

    const first = await glyphs()

    await clock.advance(240)
    await ui.redraw()
    expect(await glyphs()).not.toBe(first)

    await $.turn.complete({ answer: '', durationMs: 240, isAborted: false, turnId: 'turn-1', reason: 'answer' })
    await ui.redraw()

    const stopped = await glyphs()

    await clock.advance(2000)
    await ui.redraw()
    expect(await glyphs()).toBe(stopped)
    await ui.unmount()
  })
})
