import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

const PLUGIN = 'crush-style'
const VIEW = { columns: 100, rows: 30 }
const PROMPT = { text: 'hello', origin: { kind: 'composer' }, isExpanded: true } as const

type Calls = { closes: string[]; invalidations: number; registered: string[] }

// The engine beneath the mod, recording what the switch asks of it. `store`
// is what `$.store` holds when the session starts: the last session's choice.
const beneath = (on: On, store: Readonly<Record<string, unknown>> = {}): Calls => {
  const calls: Calls = { closes: [], invalidations: 0, registered: [] }

  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: 'C:/proj' }))
  on('session.model', () => ({ value: 'claude-sonnet-5-5' }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }) as never)
  on('process.run', () => ({ value: { exitCode: 0, stdout: 'main\n', stderr: '' } }) as never)
  on('command.register', (_$, e) => {
    calls.registered.push(e.name)

    return { value: { command: e.name } }
  })
  on('ui.close', (_$, e) => {
    calls.closes.push(e.id)

    return { value: undefined } as never
  })
  on('ui.invalidate', () => {
    calls.invalidations += 1

    return { value: undefined } as never
  })
  mock.env(on, {})
  mock.store(on, store)
  mock.clock(on)

  return calls
}

const crush = ($: Engine, args: string) =>
  $.command.run({ command: 'crush', args, origin: { kind: 'composer' }, presentation: {} } as never)

const start = ($: Engine) => $.session.start({ cwd: 'C:/proj', surface: 'terminal', isInteractive: true })

/** Whether a typed prompt is drawn by the mod (`crush`) or by the engine. */
const lookOf = async ($: Engine): Promise<'crush' | 'engine'> => {
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'UserMessage', viewport: VIEW, props: PROMPT })
  const isEngine = (await ui.find({ type: 'Text', text: 'engine' })) !== undefined

  await ui.unmount()

  return isEngine ? 'engine' : 'crush'
}

describe('master switch', () => {
  test('on unless a session switched it off', async ($, on) => {
    const calls = beneath(on)

    await start($)
    expect(await lookOf($)).toBe('crush')
    expect(calls.registered).toEqual(['crush', 'sidebar'])
  })

  test('/crush off draws as Claude Code ships, closes the sidebar and redraws', async ($, on) => {
    const calls = beneath(on)

    await start($)

    const done = await crush($, 'off')

    expect(done.text).toMatch(/Crush style off/)
    expect(await lookOf($)).toBe('engine')
    expect(calls.closes).toEqual(['crush-sidebar'])
    expect(calls.invalidations).toBe(1)
  })

  test('the next session starts the way the last /crush left it', async ($, on) => {
    const calls = beneath(on, { enabled: false })

    await start($)
    expect(await lookOf($)).toBe('engine')
    expect(calls.invalidations).toBe(1)

    const done = await crush($, 'on')

    expect(done.text).toMatch(/Crush style on/)
    expect(await lookOf($)).toBe('crush')
  })

  test('/crush alone toggles, both ways', async ($, on) => {
    beneath(on)
    await start($)

    await crush($, '')
    expect(await lookOf($)).toBe('engine')

    await crush($, '')
    expect(await lookOf($)).toBe('crush')
  })

  test('/crush on while on changes nothing', async ($, on) => {
    const calls = beneath(on)

    await start($)

    const done = await crush($, 'ON')

    expect(done.text).toBe('Crush style is already on.')
    expect(calls.invalidations).toBe(0)
  })

  test('/crush with anything else explains itself', async ($, on) => {
    beneath(on)

    const done = await crush($, 'maybe')

    expect(done.text).toMatch(/^Usage: \/crush on/)
    expect(await lookOf($)).toBe('crush')
  })

  test('off, the draft keeps its own colors and /sidebar points at /crush', async ($, on) => {
    beneath(on, { enabled: false })
    on('prompt.edit', (_$, e) => ({ text: e.inputText, cursor: e.inputText.length }))
    await start($)

    const prompt = $.prompt as unknown as {
      edit: (e: object) => Promise<{ decorations?: readonly object[] }>
    }
    const box = await prompt.edit({ origin: { kind: 'composer' }, text: '', cursor: 0, start: 0, end: 0, inputText: '/help' })

    expect(box.decorations).toBeUndefined()

    const sidebar = await $.command.run({
      command: 'sidebar',
      args: '',
      origin: { kind: 'composer' },
      presentation: {},
    } as never)

    expect(sidebar.text).toBe('Crush style is off. /crush on turns it back on.')
  })
})
