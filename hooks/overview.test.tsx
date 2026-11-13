import { expect, mock, test } from 'claude-code/testing'
import { calledGerbil, environmentNote, feedNote, gerbilProposalNote, isWithin } from './call'
import { COATS, assignGerbils, coatById, findCoat, freeCoat, parseGerbilMap } from './coats'
import {
  EMPTY_RECORD,
  beatClock,
  clockMs,
  findSession,
  firstPromptTitle,
  fmtSpan,
  isAutoModeRefusal,
  rollup,
  withStatus,
} from './data'
import { gerbilSvg } from './gerbil-svg'
import { buildNamePrompt, parseName, placeholderName } from './naming'

// Runs under `claude plugin test <mod folder>`. The installed 2.1.132 CLI has no
// `plugin test`; the desktop app's bundled engine does:
//   %APPDATA%\Claude\claude-code\2.1.309\<hash>\claude.exe plugin test ./project-overview

const PANE = {
  plugin: 'project-overview',
  component: 'Pane',
  requestId: 'project-overview',
  props: {
    title: 'Projects',
    isFocused: false,
    bodyColumns: 80,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

const CWD = 'C:\\Users\\amyjm\\RiderProjects\\butterfield_rrt'
const OTHER = 'C:\\Users\\amyjm\\RiderProjects\\SeekerScrapers'

const SESSIONS = [
  {
    sessionId: 'local_a',
    title: 'Risk factors improvements',
    cwd: CWD,
    isArchived: false,
    isRunning: false,
    lastActivityAt: new Date().toISOString(),
    link: 'claude://claude.ai/epitaxy/local_a',
  },
  {
    sessionId: 'local_b',
    title: 'Weekly status report',
    cwd: CWD,
    isArchived: false,
    isRunning: false,
    lastActivityAt: '2026-10-23T15:00:00.000Z',
  },
  {
    sessionId: 'local_c',
    title: 'TIG scrape service year bug',
    cwd: OTHER,
    isArchived: false,
    isRunning: false,
    lastActivityAt: '2026-10-30T18:09:51.006Z',
  },
]

const ISSUES = JSON.stringify({
  issues: [
    { key: 'UAT_QRY-24', title: 'Nine more business factors blank', state: 'new', priority: 'Medium' },
    { key: 'UAT_QRY-25', title: 'Choose in-progress or completed assessment', state: 'testing', priority: 'High' },
    { key: 'UAT_QRY-8', title: 'CMP today column', state: 'closed', closedOn: '2026-10-28' },
  ],
})


// A page of the Jira connector's search answer: two open issues of an active sprint.
const JIRA_PAGE = JSON.stringify({
  issues: {
    totalCount: 2,
    nodes: [
      {
        key: 'SKR-919',
        webUrl: 'https://cortexgg.atlassian.net/browse/SKR-919',
        fields: {
          summary: 'Market Research: multiple items for a single cadastre',
          status: { name: 'To Do', statusCategory: { key: 'new' } },
          priority: { name: 'High' },
          assignee: null,
          customfield_10020: [{ name: 'Go-live Prep', state: 'active', endDate: '2026-08-13T20:00:03.000Z' }],
        },
      },
      {
        key: 'SKR-820',
        webUrl: 'https://cortexgg.atlassian.net/browse/SKR-820',
        fields: {
          summary: 'Export Greffe data to old',
          status: { name: 'In Progress', statusCategory: { key: 'indeterminate' } },
          priority: { name: 'Medium' },
          assignee: { displayName: 'Amy' },
          customfield_10020: [{ name: 'Go-live Prep', state: 'active', endDate: '2026-08-13T20:00:03.000Z' }],
        },
      },
    ],
  },
})

// A file system answers only absolute paths: a relative one would be read from the app's own folder.
const absolute = (path: string) => /^([A-Za-z]:)?[\\/]/.test(path)

const mcpAnswer = (text: string) => ({ value: { content: [{ type: 'text', text }], isError: false } })

// Nothing sits beneath the plugin: each hook here stands for the app.
function standForTheApp(
  on: Parameters<Parameters<typeof test>[1]>[1],
  archived: string[],
  cwd = CWD,
  env: Record<string, string> = {},
  // What list_scheduled_tasks answers: text, or `{ error }` for a failed call.
  tasksAnswer: string | { error: string } = '[]',
  // The tools the device has: the scheduled-tasks server's unless a test takes them away.
  tools: string[] = ['mcp__scheduled-tasks__list_scheduled_tasks', 'mcp__scheduled-tasks__list_task_runs'],
  // This session as the app answers `get_session self` (refused when left out; late when
  // `selfAfterMs` says how late), and its own conversation.
  own: {
    self?: Record<string, unknown>
    selfAfterMs?: number
    messages?: { role: 'user' | 'assistant'; text: string }[]
    // What the model answers when asked to name a gerbil; null: no answer (the call cut off).
    gerbilName?: string | null
    // Claude Desktop in auto mode: every MCP call the mod makes itself is refused.
    isAutoMode?: boolean
  } = {},
) {
  const named: string[] = []
  on('env.get', (_, e) => ({ value: env[e.name] }))
  on('tool.register', (_, e) => ({ value: { tool: `mcp__project-overview__${e.name}` } }))
  on('tool.list', () => ({ value: tools.map(name => ({ name, description: '', mcp: true })) }))
  on('command.register', () => ({ value: { command: 'overview' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: cwd }))
  on('session.id', () => ({ value: 'self' }))
  on('session.messages', () => ({ value: (own.messages ?? []).map(m => ({ ...m, toolUses: [] })) }))
  // The engine beneath a prompt and a turn: the prompt enters as it arrived (so a test reads
  // what the mod attached), and a turn starts and ends.
  on('prompt.submit', (_, e) => ({ text: e.text, context: e.context }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  // A clock in memory: `clock.now` reads it, and the timers wait for the test to advance it.
  const clock = mock.clock(on, { now: Date.now() })
  on('ui.log', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  // The kit has no bottom for $.store: one in memory per test.
  const store: Record<string, unknown> = {}
  on('store.get', (_, e) => ({ value: store[String(e.key)] }))
  on('store.set', (_, e) => {
    store[String(e.key)] = e.value
    return { value: undefined }
  })
  on('mcp.call', async (_, e) => {
    if (own.isAutoMode) {
      const refusal = `PreToolUse:mcp__${e.server}__${e.tool} hook error: Not run: in auto mode Claude Desktop doesn’t run this tool when a plugin’s own code calls it. Have Claude make the call.`
      // As an error result. (The app may also reject the call with the same words, which
      // the mod reads the same way; a test hook that throws is skipped, so it cannot show that.)
      return { value: { content: [{ type: 'text', text: refusal }], isError: true } }
    }
    switch (e.tool) {
      case 'list_sessions':
        return mcpAnswer(JSON.stringify(SESSIONS))
      case 'get_session':
        // As when the app first asks the person whether to allow the call.
        if (own.selfAfterMs) await clock.sleep(own.selfAfterMs)
        // Not on the allow list unless a test says the app answers: refused, as auto mode refuses it.
        return own.self
          ? mcpAnswer(JSON.stringify(own.self))
          : {
              value: {
                content: [{ type: 'text', text: 'refused: The server-side auto mode classifier gave no verdict' }],
                isError: true,
              },
            }
      case 'list_scheduled_tasks':
        return typeof tasksAnswer === 'string'
          ? mcpAnswer(tasksAnswer)
          : { value: { content: [{ type: 'text', text: tasksAnswer.error }], isError: true } }
      case 'list_events':
        return mcpAnswer('[user] plot the TRM score on the matrix\n[assistant] Done: the matrix now plots it.')
      case 'archive_session':
        archived.push(String(e.args.session_id))
        return mcpAnswer('Archived.')
      case 'searchJiraIssuesUsingJql':
        // The count of the whole sprint, then a page of its open issues.
        return mcpAnswer(
          e.args.searchResultMode === 'count'
            ? JSON.stringify({ issues: { totalCount: 5, nodes: [] } })
            : JIRA_PAGE,
        )
      default:
        return mcpAnswer('[]')
    }
  })
  on('fs.read', (_, e) => {
    if (absolute(String(e.path)) && String(e.path).endsWith('issues.json')) return { value: ISSUES }
    throw new Error('ENOENT: no such file or directory')
  })
  // Only butterfield_rrt has an issues file; the other project is on Jira.
  on('fs.list', (_, e) => ({
    value: absolute(String(e.path)) && String(e.path).includes('butterfield')
      ? [{ name: 'issues.json', kind: 'file', size: 1, mtimeMs: 0, isLink: false }]
      : [],
  }))
  const usage = { input_tokens: 10, output_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }
  on('model.complete', (_, e) => {
    if (/robotic gerbil/.test(String(e.system ?? ''))) {
      named.push(String(e.prompt))
      return {
        value:
          own.gerbilName === null
            ? { isAnswered: false, reason: 'aborted', usage }
            : { isAnswered: true, text: JSON.stringify({ name: own.gerbilName ?? 'Rivet' }), usage },
      }
    }
    return {
      value: {
        isAnswered: true,
        text: '{"synopsis": "Plot the TRM score on the matrix", "hours": 1.5, "status": "wip"}',
        usage,
      },
    }
  })
  return { clock, store, named }
}

const typed = (text: string) => ({ text, wait: false, origin: { kind: 'composer' } }) as const

test('the pane shows the project, its issues, the gerbil and a session row', async ($, on) => {
  standForTheApp(on, [])
  await $.session.start({ cwd: CWD, surface: 'desktop', isInteractive: true })

  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    // The headline is two runs: the count raised, dim, and the open count in colour.
    expect((await ui.find({ type: 'Text', text: /3 raised/ }))?.text).toBe('3 raised')
    expect((await ui.find({ type: 'Text', text: /2 open/ }))?.text).toBe('2 open')
    expect(await ui.find({ type: 'Text', text: /UAT_QRY-25/ })).toBeDefined()
    // The gerbil's line, whatever rule the day picks.
    expect(await ui.find({ type: 'Text', text: /open|weekly|in progress|Quiet|running/i })).toBeDefined()
    // A session of the selected project only: the SeekerScrapers one is not drawn.
    expect(await ui.find({ key: 'done:local_a' })).toBeDefined()
    expect(await ui.find({ key: 'done:local_c' })).toBeUndefined()
    await ui.unmount()
  }
})

test('marking a session done keeps it in today and archives it', async ($, on) => {
  const archived: string[] = []
  standForTheApp(on, archived)
  await $.session.start({ cwd: CWD, surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'done:local_a' })
  expect(archived).toEqual(['local_a'])
  // A badge: the label padded by a space each side.
  expect((await ui.find({ type: 'Text', text: /1 done/ }))?.text).toBe(' 1 done ')
  await ui.unmount()
})

test('marking done a session last worked on before today puts it away, not into today', async ($, on) => {
  const archived: string[] = []
  standForTheApp(on, archived)
  await $.session.start({ cwd: CWD, surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  // The weekly report was last worked on in October: carried, not today.
  expect(await ui.find({ key: 'done:local_b' })).toBeDefined()
  await ui.press({ key: 'done:local_b' })
  expect(archived).toEqual(['local_b'])
  expect(await ui.find({ key: 'done:local_b' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /1 done/ })).toBeUndefined()
  await ui.unmount()
})

test('today is what was worked on today; done does not bring a session into it', async () => {
  const today = '2026-11-12'
  const at = (day: number, hour: number) => new Date(2026, 10, day, hour).toISOString()
  const row = (id: string, lastActivityAt: string, extra: Partial<typeof EMPTY_RECORD> & { isArchived?: boolean } = {}) => ({
    id,
    title: id,
    project: 'butterfield_rrt',
    cwd: CWD,
    isSelf: false,
    isRunning: false,
    isArchived: false,
    pinned: false,
    lastActivityAt,
    ...EMPTY_RECORD,
    ...extra,
  })
  const done = { status: 'done' as const, statusSource: 'manual' as const, doneOn: today }
  const r = rollup(
    [
      row('worked', at(12, 9), { status: 'wip' }),
      row('worked-and-done', at(12, 10), { ...done, isArchived: true, hours: 1 }),
      row('carried-then-done', at(11, 16), { ...done, isArchived: true, hours: 2 }),
      row('carried-then-done-not-archived', at(10, 16), { ...done, hours: 3 }),
      row('carried', at(11, 15), { status: 'wip' }),
      row('archived-in-the-app', at(12, 8), { status: 'wip', isArchived: true }),
    ],
    today,
  )
  expect(r.today.map(x => x.id)).toEqual(['worked-and-done', 'worked'])
  expect(r.doneToday).toBe(1)
  expect(r.hoursToday).toBe(1)
  expect(r.carried.map(x => x.id)).toEqual(['carried'])
  expect(r.rest).toEqual([])
})

test('a project on Jira shows its open sprint', async ($, on) => {
  standForTheApp(on, [], OTHER)
  await $.session.start({ cwd: OTHER, surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /Go-live Prep/ }))?.text).toBe('Go-live Prep')
  expect(await ui.find({ type: 'Text', text: /5 issues/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /2 open/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /single cadastre/ })).toBeDefined()
  // Jira issues are read here, not closed: no done button on the row.
  expect(await ui.find({ key: 'issue-done:SKR-919' })).toBeUndefined()
  await ui.unmount()
})

test('each project has its own named gerbil, renamed and recoloured in the pane', async ($, on) => {
  standForTheApp(on, [])
  await $.session.start({ cwd: CWD, surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  // butterfield_rrt's gerbil, from the setting's default.
  expect((await ui.find({ type: 'Text', text: /^Butterscotch$/ }))?.text).toBe('Butterscotch')
  // The bubble names the gerbil and its mood, not its coat: the coat shows when choosing.
  expect(await ui.find({ type: 'Text', text: /argente golden/ })).toBeUndefined()

  // The clan picks the project: there is no project dropdown, and no Select until the gerbil is edited.
  expect(await ui.findAll({ type: 'Select' })).toHaveLength(0)
  await ui.press({ key: 'gerbil-edit' })
  expect((await ui.find({ key: 'gerbil-coat' }))?.props.value).toBe('argente-golden')
  await ui.select({ key: 'gerbil-coat', value: 'dove' })
  expect((await ui.find({ key: 'gerbil-coat' }))?.props.value).toBe('dove')
  await ui.input({ key: 'gerbil-name', text: 'Biscuit' })
  expect((await ui.find({ type: 'Text', text: /^Biscuit$/ }))?.text).toBe('Biscuit')
  await ui.press({ key: 'gerbil-edit' })
  expect(await ui.find({ key: 'gerbil-coat' })).toBeUndefined()

  // The command reads the same gerbil, and a coat by a breeder's other name.
  const shown = await $.command.run({ command: 'overview', args: 'gerbil' })
  expect(shown.text).toMatch(/Biscuit, the dove gerbil/)
  const recoloured = await $.command.run({ command: 'overview', args: 'gerbil coat black-eyed white' })
  expect(recoloured.text).toMatch(/Biscuit, the black-eyed white gerbil/)

  // The clan: every project's gerbil, SeekerScrapers' Digger among them; picking one selects its project.
  const clan = await $.command.run({ command: 'overview', args: 'clan' })
  expect(clan.text).toMatch(/Biscuit\s+black-eyed white\s+butterfield_rrt/)
  expect(clan.text).toMatch(/Digger\s+black\s+SeekerScrapers/)
  const digger = await ui.find({ type: 'Button', text: /^Digger$/ })
  expect(digger?.key).toMatch(/^clan-pick:/)
  await ui.press({ key: digger!.key! })
  expect((await ui.find({ type: 'Text', text: /^Digger$/ }))?.text).toBe('Digger')
  expect(await ui.find({ type: 'Text', text: /^Biscuit$/ })).toBeUndefined()
  await ui.unmount()
})

test('on a Mac, ~/RiderProjects groups a session by its project folder', async ($, on) => {
  const MAC = '/Users/amy/RiderProjects/bragi/src'
  standForTheApp(on, [], MAC, { HOME: '/Users/amy' })
  await $.session.start({ cwd: MAC, surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  // The project is bragi, not src: its gerbil from the setting's default.
  expect((await ui.find({ type: 'Text', text: /^Skald$/ }))?.text).toBe('Skald')
  const shown = await $.command.run({ command: 'overview', args: 'gerbil' })
  expect(shown.text).toMatch(/Skald, the Burmese gerbil, is PM for bragi/)
  await ui.unmount()
})

// A device with no scheduled tasks at all, each way it can say so: no Scheduled card,
// no error, and the gerbil does not worry about reaching scheduled tasks.
const NO_TASKS: [string, string | { error: string }, string[]?][] = [
  ['the server answers a sentence', 'No scheduled tasks found. Use create_scheduled_task to add one.'],
  ['the server answers an empty list', '[]'],
  ['the server answers nothing', ''],
  ['the server lists none in an object', JSON.stringify({ tasks: [] })],
  ['the device has no scheduled-tasks server, and says so', { error: 'MCP server "scheduled-tasks" is not connected' }],
  ['the device has no scheduled-tasks server, and lists none of its tools', { error: 'Something went wrong' }, []],
]
for (const [how, answer, tools] of NO_TASKS) {
  test(`no scheduled tasks on the device (${how}) is quiet, not an error`, async ($, on) => {
    standForTheApp(on, [], CWD, {}, answer, tools)
    await $.session.start({ cwd: CWD, surface: 'desktop', isInteractive: true })

    const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
    expect(await ui.find({ type: 'Text', text: /^Scheduled$/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /scheduled tasks:|couldn't reach|no JSON in the answer/ })).toBeUndefined()
    const dump = await $.command.run({ command: 'overview', args: 'dump' })
    expect(dump.text).toMatch(/tasks: none on this device/)
    expect(dump.text).toMatch(/errors: none/)
    await ui.unmount()
  })
}

test('a refused or failing scheduled-tasks call on a device that has the server is still an error', async ($, on) => {
  standForTheApp(on, [], CWD, {}, {
    error: '$.mcp.call(scheduled-tasks, list_scheduled_tasks) refused: The server-side auto mode classifier gave no verdict',
  })
  await $.session.start({ cwd: CWD, surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const dump = await $.command.run({ command: 'overview', args: 'dump' })
  expect(dump.text).toMatch(/errors: scheduled tasks: .*classifier gave no verdict/)
  await ui.unmount()
})

test('a device whose tasks are all for other projects shows the card, empty', async ($, on) => {
  const elsewhere = [{ taskId: 'backup', title: 'Nightly backup', schedule: 'daily at 02:00', enabled: true }]
  standForTheApp(on, [], CWD, {}, JSON.stringify(elsewhere))
  await $.session.start({ cwd: CWD, surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /^Scheduled$/ }))?.text).toBe('Scheduled')
  expect(await ui.find({ type: 'Text', text: /No scheduled tasks for this project/ })).toBeDefined()
  await ui.unmount()
})

test('on a Mac, the issues file is read from the project folder and the UAT button shows', async ($, on) => {
  const MAC = '/Users/amy/RiderProjects/butterfield_rrt'
  standForTheApp(on, [], MAC, { HOME: '/Users/amy' })
  await $.session.start({ cwd: MAC, surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /3 raised/ }))?.text).toBe('3 raised')
  expect(await ui.find({ key: 'quick:uat' })).toBeDefined()
  const dump = await $.command.run({ command: 'overview', args: 'dump' })
  expect(dump.text).toMatch(/^project: butterfield_rrt \[\/users\/amy\/riderprojects\/butterfield_rrt\]/)
  await ui.unmount()
})

test('pied coats: a self-coloured base keeps its dark underside, an agouti-type base its tummy', async () => {
  const TUMMY = 'M60 62 C 49 62'
  const BLAZE = 'M56.5 25 Q60 23.5'
  for (const id of ['pied', 'mottled-black', 'pied-lilac', 'pied-burmese']) {
    expect(coatById(id).id).toBe(id)
    const svg = gerbilSvg('idle', coatById(id))
    expect(svg).toContain(BLAZE)
    expect(svg).not.toContain(TUMMY)
  }
  // The self colours have no lighter tummy either; the agouti-type ones do.
  for (const id of ['black', 'dove', 'lilac', 'burmese', 'siamese', 'slate']) {
    expect(gerbilSvg('idle', coatById(id))).not.toContain(TUMMY)
  }
  for (const id of ['pied-agouti', 'pied-argente', 'argente-golden', 'agouti', 'nutmeg', 'honey']) {
    expect(gerbilSvg('idle', coatById(id))).toContain(TUMMY)
  }
  // Mottled has more white than spotted.
  const spots = (id: string) => gerbilSvg('idle', coatById(id)).split('<ellipse').length
  expect(spots('mottled-black')).toBeGreaterThan(spots('pied'))
  expect(findCoat('spotted lilac')?.id).toBe('pied-lilac')
  expect(findCoat('mottled')?.id).toBe('mottled-black')
  expect(findCoat('pied black')?.id).toBe('pied')
})

test('a snapshot an earlier version stored is declined', async ($, on) => {
  on('state.get', () => ({ value: { value: { projects: [{ key: 'x' }] }, version: 1 } }))
  mock.clock(on, { now: Date.now() })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /Reading your sessions|No sessions found/ })).toBeDefined()
  await ui.unmount()
})

// This session as the app answers `get_session self`: its real id and its name.
const ME = {
  sessionId: 'local_me',
  title: 'Gerbil mod improvements',
  cwd: CWD,
  isArchived: false,
  isRunning: true,
  lastActivityAt: new Date().toISOString(),
  link: 'claude://claude.ai/epitaxy/local_me',
}

test('this session goes by its own name, and its clock moves as time passes', async ($, on) => {
  const { clock, store } = standForTheApp(on, [], CWD, {}, '[]', undefined, {
    self: ME,
    messages: [
      { role: 'user', text: 'tidy the matrix page' },
      { role: 'assistant', text: 'Done: the page is tidy.' },
    ],
  })
  await $.session.start({ cwd: CWD, surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  // Its name as the app has it, and nothing to allow; no time counted before the first prompt.
  expect(await ui.find({ text: /^Gerbil mod improvements$/ })).toBeDefined()
  expect(await ui.find({ text: /^This session$/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /get_session/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /^0m$/ })).toBeDefined()

  // A prompt and a turn: the clock counts while the turn runs, minute by minute.
  await $.prompt.submit(typed('tidy the matrix page'))
  await $.turn.start({ text: 'tidy the matrix page', turnId: 't1' })
  await clock.advance(3 * 60_000)
  expect(await ui.find({ type: 'Text', text: /^3m$/ })).toBeDefined()
  expect((await ui.find({ type: 'Text', text: /live/ }))?.text).toBe(' live ')
  // The day's total takes the minutes in: the other session's hour and a half, and these three.
  expect(await ui.find({ type: 'Text', text: /^1h 33m$/ })).toBeDefined()
  // Worked in, so in progress: a guess (the question mark) until a status is picked.
  expect((await ui.find({ key: 'status-pick:local_me' }))?.text).toBe('wip?')

  // After the turn it runs on for the idle allowance (five minutes), then pauses.
  await $.turn.complete({ answer: 'Done.', durationMs: 180_000, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.advance(2 * 60_000)
  expect(await ui.find({ type: 'Text', text: /^5m$/ })).toBeDefined()
  await clock.advance(10 * 60_000)
  expect(await ui.find({ type: 'Text', text: /^8m$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /here, paused/ })).toBeDefined()

  // Its synopsis comes from its own conversation, and its time is in its record under its real id.
  const dump = await $.command.run({ command: 'overview', args: 'dump' })
  expect(dump.text).toMatch(/Gerbil mod improvements \[this session\] — Plot the TRM score/)
  expect(dump.text).toMatch(/this session: Gerbil mod improvements; clock 8m/)
  const records = () => store.records as Record<string, { hours: number; hoursSource: string; status: string }>
  expect(records().local_me).toEqual(expect.objectContaining({ hoursSource: 'tracked', status: 'wip' }))
  expect(records().local_self).toBeUndefined()

  // Typing hours on this row sets the clock, which counts on from there.
  await ui.press({ key: 'edit:local_me' })
  await ui.input({ key: 'hours:local_me', text: '2' })
  expect(await ui.find({ type: 'Text', text: /^2h 00m$/ })).toBeDefined()
  expect(records().local_me).toEqual(expect.objectContaining({ hours: 2, hoursSource: 'tracked' }))
  await clock.advance(60_000)
  expect(await ui.find({ type: 'Text', text: /^2h 01m$/ })).toBeDefined()
  await ui.unmount()
})

test('with get_session refused, this session goes by its first prompt and the pane says what to allow', async ($, on) => {
  standForTheApp(on, [], CWD, {}, '[]', undefined, {
    messages: [
      { role: 'user', text: '<system-reminder>context</system-reminder>\nplot the TRM score on the matrix\nand tidy up' },
    ],
  })
  await $.session.start({ cwd: CWD, surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /^plot the TRM score on the matrix$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /allow mcp__ccd_session_mgmt__get_session/ })).toBeDefined()
  // A hint, not an error: the gerbil does not worry about it.
  const dump = await $.command.run({ command: 'overview', args: 'dump' })
  expect(dump.text).toMatch(/errors: none/)
  await ui.unmount()
})

test('a late answer to get_session does not hold the pane up: the name arrives when it does', async ($, on) => {
  const { clock } = standForTheApp(on, [], CWD, {}, '[]', undefined, { self: ME, selfAfterMs: 60_000 })
  await $.session.start({ cwd: CWD, surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  // The refresh gives the app a moment, then goes on without the name.
  expect(await ui.find({ type: 'Text', text: /Reading your sessions/ })).toBeDefined()
  await clock.advance(3_000)
  expect(await ui.find({ type: 'Text', text: /^This session$/ })).toBeDefined()
  expect(await ui.find({ key: 'done:local_a' })).toBeDefined()
  // Once the app answers, the pane is read again with it.
  await clock.advance(60_000)
  expect(await ui.find({ text: /^Gerbil mod improvements$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^This session$/ })).toBeUndefined()
  await ui.unmount()
})

test('calling a gerbil by name tells Claude its project folder, and turns the pane to it', async ($, on) => {
  standForTheApp(on, [])
  await $.session.start({ cwd: CWD, surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  // An ordinary prompt carries nothing, and nobody is on duty.
  expect((await $.prompt.submit(typed('plot the TRM score'))).context).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /^on duty$/ })).toBeUndefined()

  // The prompt goes in as typed; what Claude reads beside it names the folder and how to get there.
  const sent = await $.prompt.submit(typed('Hey, Digger, why did the nightly scrape fail?'))
  expect(sent.text).toBe('Hey, Digger, why did the nightly scrape fail?')
  expect(sent.context).toHaveLength(1)
  expect(sent.context?.[0]).toMatch(/called on Digger by name/)
  expect(sent.context?.[0]).toContain('the project folder C:\\Users\\amyjm\\RiderProjects\\SeekerScrapers.')
  expect(sent.context?.[0]).toMatch(/change_directory/)
  expect((await ui.find({ type: 'Text', text: /^Digger$/ }))?.text).toBe('Digger')
  expect(await ui.find({ type: 'Text', text: /^on duty$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Claude is working in SeekerScrapers/ })).toBeDefined()

  // Where the move is refused (auto mode's check can refuse it), Claude is told to read on and say so.
  expect(sent.context?.[0]).toMatch(/Where the move is refused/)
  expect(sent.context?.[0]).toMatch(/permission rule for mcp__ccd_directory__change_directory/)

  // A new session's first prompt, as the desktop app hands it over: its reminder first, then the words.
  const first = await $.prompt.submit(
    typed('<system-reminder>\nThe user started this session without choosing a project folder.\n</system-reminder>\n\n@digger what got done today?'),
  )
  expect(first.context?.[0]).toMatch(/called on Digger by name/)

  // A gerbil whose project this session is already in: no move asked for.
  const here = await $.prompt.submit(typed('butterscotch: the UAT report'))
  expect(here.context?.[0]).toMatch(/already working in that folder/)
  expect(here.context?.[0]).not.toMatch(/change_directory/)

  // Another session's message naming a gerbil calls nobody; nor does a name that only begins a sentence.
  const peer = await $.prompt.submit({ text: 'Hey, Digger, ping', wait: false, origin: { kind: 'peer' } })
  expect(peer.context).toBeUndefined()
  expect((await $.prompt.submit(typed('Scout the repo for dead code'))).context).toBeUndefined()
  await ui.unmount()
})

test('clicking a gerbil puts it on duty: Claude hears with the next prompt, once', async ($, on) => {
  standForTheApp(on, [])
  await $.session.start({ cwd: CWD, surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  const digger = await ui.find({ type: 'Button', text: /^Digger$/ })
  await ui.press({ key: digger!.key! })
  expect(await ui.find({ type: 'Text', text: /^listening$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Your next message goes to SeekerScrapers/ })).toBeDefined()

  const sent = await $.prompt.submit(typed('why did the nightly scrape fail?'))
  expect(sent.context?.[0]).toMatch(/picked Digger in their project overview pane/)
  expect(sent.context?.[0]).toContain('SeekerScrapers')
  expect(await ui.find({ type: 'Text', text: /^on duty$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^listening$/ })).toBeUndefined()
  // Told once: the next prompt carries nothing.
  expect((await $.prompt.submit(typed('and the one before?'))).context).toBeUndefined()

  // A click taken back before a prompt tells Claude nothing; Digger stays on duty.
  const butterscotch = await ui.find({ type: 'Button', text: /^Butterscotch$/ })
  await ui.press({ key: butterscotch!.key! })
  expect(await ui.find({ type: 'Text', text: /Your next message goes to butterfield_rrt/ })).toBeDefined()
  await ui.press({ key: 'duty-cancel' })
  expect((await $.prompt.submit(typed('carry on'))).context).toBeUndefined()
  const dump = await $.command.run({ command: 'overview', args: 'dump' })
  expect(dump.text).toMatch(/on duty: Digger \(SeekerScrapers\)/)

  // The selected gerbil's own button calls it without a trip to the clan.
  await ui.press({ key: 'duty-call' })
  const again = await $.prompt.submit(typed('now the UAT report'))
  expect(again.context?.[0]).toMatch(/picked Butterscotch/)
  expect(again.context?.[0]).toMatch(/already working in that folder/)
  await ui.unmount()
})

test('a status is yours once picked: kept, shown solid, and handed back with auto', async ($, on) => {
  const archived: string[] = []
  const { clock } = standForTheApp(on, archived)
  await $.session.start({ cwd: CWD, surface: 'desktop', isInteractive: true })

  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    // The estimate's guess wears a question mark; the picker opens from it.
    expect((await ui.find({ key: 'status-pick:local_b' }))?.text).toBe('wip?')
    expect(await ui.find({ key: 'set:blocked:local_b' })).toBeUndefined()
    await ui.press({ key: 'status-pick:local_b' })
    expect(await ui.find({ type: 'Text', text: /a guess, until you pick/ })).toBeDefined()
    await ui.press({ key: 'set:blocked:local_b' })
    // A solid badge now (its label padded), and the picker has closed.
    expect((await ui.find({ key: 'status-pick:local_b' }))?.text).toBe(' blocked ')
    expect(await ui.find({ key: 'set:blocked:local_b' })).toBeUndefined()
    // Handed back: the next refresh estimates it again.
    await ui.press({ key: 'status-pick:local_b' })
    await ui.press({ key: 'set:auto:local_b' })
    await clock.settle()
    expect((await ui.find({ key: 'status-pick:local_b' }))?.text).toBe('wip?')
    await ui.unmount()
  }

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  // Done from the picker stamps the day and archives nothing: that is the row's own done button.
  await ui.press({ key: 'status-pick:local_a' })
  await ui.press({ key: 'set:done:local_a' })
  expect(archived).toEqual([])
  expect((await ui.find({ type: 'Text', text: /1 done/ }))?.text).toBe(' 1 done ')

  // By command: a session named by words of its title, or this one when none is named.
  const set = await $.command.run({ command: 'overview', args: 'status blocked weekly status' })
  expect(set.text).toMatch(/Weekly status report: blocked, set by you/)
  expect((await ui.find({ key: 'status-pick:local_b' }))?.text).toBe(' blocked ')
  const mine = await $.command.run({ command: 'overview', args: 'status wip' })
  expect(mine.text).toMatch(/This session: wip, set by you/)
  const usage = await $.command.run({ command: 'overview', args: 'status paused' })
  expect(usage.text).toMatch(/^Usage: \/overview status/)
  await ui.unmount()
})

test('with statuses yours only, the estimate writes the synopsis and leaves the status alone', async ($, on) => {
  const { store } = standForTheApp(on, [])
  // What the pane's switch stored in an earlier session.
  store.prefs = { autoStatus: false }
  await $.session.start({ cwd: CWD, surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /Plot the TRM score on the matrix/ })).toBeDefined()
  expect((await ui.find({ key: 'status-pick:local_a' }))?.text).toBe('planned')
  expect((await ui.find({ key: 'auto-status' }))?.text).toBe('statuses: yours only')
  await ui.press({ key: 'auto-status' })
  expect((await ui.find({ key: 'auto-status' }))?.text).toBe('statuses: guessed for you')
  expect(store.prefs).toEqual({ autoStatus: true })
  const off = await $.command.run({ command: 'overview', args: 'auto off' })
  expect(off.text).toMatch(/yours only/)
  expect(store.prefs).toEqual({ autoStatus: false })
  await ui.unmount()
})

test('a gerbil is called by a greeting anywhere, or by its name set off at the start', async () => {
  const clan = ['Butterscotch', 'Scout', 'Digger', 'butterscotch']
  expect(calledGerbil('Hey, Butterscotch', clan)?.name).toBe('Butterscotch')
  expect(calledGerbil('hey butterscotch can you check the tracker', clan)?.name).toBe('Butterscotch')
  expect(calledGerbil('Scout, find the dead code', clan)?.name).toBe('Scout')
  expect(calledGerbil('@digger rerun the scrape', clan)?.name).toBe('Digger')
  expect(calledGerbil('Right. Hi Digger - rerun it', clan)?.name).toBe('Digger')
  // An ordinary word, a mention in passing, a longer word: no call.
  expect(calledGerbil('Scout the repo for dead code', clan)).toBe(null)
  expect(calledGerbil('ask Butterscotch about it', clan)).toBe(null)
  expect(calledGerbil('Hey, Scouting party', clan)).toBe(null)
  expect(calledGerbil('ok, scout around the repo', clan)).toBe(null)
  // `@name` calls from anywhere; an address that happens to hold a name does not.
  expect(calledGerbil('what got done today, @butterscotch?', clan)?.name).toBe('Butterscotch')
  expect(calledGerbil('mail amy@scout.gg about it', clan)).toBe(null)
  // The desktop app sends its reminder in front of a new session's first prompt: the start is
  // the start of what was typed. A name inside a reminder or a paste calls nobody.
  const reminder = '<system-reminder>\nThe user started this session without choosing a project folder.\n</system-reminder>\n\n'
  expect(calledGerbil(`${reminder}@butterscotch what got done today?`, clan)?.name).toBe('Butterscotch')
  expect(calledGerbil(`${reminder}Scout, find the dead code`, clan)?.name).toBe('Scout')
  expect(calledGerbil('<system-reminder>Hey, Digger</system-reminder>\nwhat got done today?', clan)).toBe(null)
  expect(calledGerbil('<pasted_content id="a1">@digger rerun</pasted_content> summarise this', clan)).toBe(null)

  expect(isWithin('C:\\Users\\amyjm\\RiderProjects\\bragi\\src', 'c:/users/amyjm/riderprojects/bragi')).toBe(true)
  expect(isWithin('C:\\Users\\amyjm\\RiderProjects\\bragi2', 'c:/users/amyjm/riderprojects/bragi')).toBe(false)
  // The gerbil of the sessions with no folder names no project, and a Mac path keeps its slashes.
  const nomad = environmentNote({
    gerbil: 'Nomad',
    project: { name: 'No folder', cwd: '' },
    sessionCwd: '/tmp/x',
    how: 'named',
  })
  expect(nomad).toMatch(/names no project/)
  const mac = environmentNote({
    gerbil: 'Skald',
    project: { name: 'bragi', cwd: '/Users/amy/RiderProjects/bragi' },
    sessionCwd: '/Users/amy/scratch',
    how: 'picked',
  })
  expect(mac).toContain('the project folder /Users/amy/RiderProjects/bragi.')
})

test('the clock counts to each beat and runs on for the idle allowance, no further', async () => {
  const idle = 5 * 60_000
  const start = 1_000_000
  let c = { ms: 0, beatAt: 0 }
  // Nothing before the first sign of life.
  expect(clockMs(c, start, idle)).toBe(0)
  c = beatClock(c, start, idle)
  expect(clockMs(c, start + 60_000, idle)).toBe(60_000)
  // An hour away from the desk counts five minutes, and the next beat keeps exactly what was shown.
  expect(clockMs(c, start + 60 * 60_000, idle)).toBe(idle)
  c = beatClock(c, start + 60 * 60_000, idle)
  expect(c.ms).toBe(idle)
  expect(fmtSpan(c.ms)).toBe('5m')
  expect(fmtSpan(65 * 60_000)).toBe('1h 05m')
  expect(fmtSpan(0)).toBe('0m')
})

test('a picked status is kept, done stamps the day, auto hands it back; a session is found by its title', async () => {
  const guessed = { ...EMPTY_RECORD, status: 'wip' as const, statusSource: 'model' as const, estimatedFor: 'x' }
  const picked = withStatus(guessed, 'done', '2026-11-09')
  expect(picked).toEqual(expect.objectContaining({ status: 'done', statusSource: 'manual', doneOn: '2026-11-09' }))
  const reopened = withStatus(picked, 'wip', '2026-11-10')
  expect(reopened.doneOn).toBeUndefined()
  const back = withStatus(reopened, 'auto', '2026-11-10')
  expect(back).toEqual(expect.objectContaining({ status: 'wip', statusSource: 'model' }))
  expect(back.estimatedFor).toBeUndefined()

  const rows = [
    { id: 'local_1', title: 'Weekly status report', isArchived: true, lastActivityAt: '2026-11-08T10:00:00Z' },
    { id: 'local_2', title: 'Weekly status report', isArchived: false, lastActivityAt: '2026-11-01T10:00:00Z' },
    { id: 'local_3', title: 'Risk factors', isArchived: false, lastActivityAt: '2026-11-09T10:00:00Z' },
  ]
  expect(findSession(rows, 'local_3')?.id).toBe('local_3')
  expect(findSession(rows, 'STATUS weekly')?.id).toBe('local_2')
  expect(findSession(rows, 'nothing like it')).toBeUndefined()
  const said = [
    { role: 'assistant', text: 'hi' },
    { role: 'user', text: '\n  fix the login page\nplease' },
  ]
  expect(firstPromptTitle(said)).toBe('fix the login page')
})

// A project the gerbils setting does not name: it is new to the clan.
const NEW = 'C:\\Users\\amyjm\\RiderProjects\\tidewater'
const SET_GERBIL = 'mcp__project-overview__set_gerbil'
const FEED = 'mcp__project-overview__feed'
// The coats the setting's default already gives out.
const WORN = ['argente-golden', 'agouti', 'black', 'burmese', 'dove', 'lilac', 'cream', 'bew', 'slate', 'pied']
const tidewater = (store: Record<string, unknown>) =>
  Object.entries(store.gerbils as Record<string, { name: string; coat: string; source: string; proposal?: string }>).find(([key]) =>
    key.endsWith('tidewater'),
  )?.[1]

test('a new gerbil gets a coat no project wears, at random, and its folder name until the model names it', async () => {
  const all = COATS.map(c => c.id)
  expect(freeCoat(all.filter(id => id !== 'nutmeg'), () => 0.99)).toBe('nutmeg')
  // Every coat worn: any coat, shared.
  expect(all).toContain(freeCoat(all, () => 0.5))
  const set = parseGerbilMap('bragi=Skald/burmese')
  const g = assignGerbils([{ key: 'k/bragi', name: 'bragi' }, { key: 'k/tidewater', name: 'tidewater' }], {}, set, () => 0)
  expect(g['k/bragi']).toEqual({ name: 'Skald', coat: 'burmese', source: 'config' })
  expect(g['k/tidewater']).toEqual({ name: 'Tidewater', coat: 'agouti', source: 'auto', proposal: 'naming' })
  // What the user picked wins over the setting; a suggestion kept is kept, proposal and all.
  const stored = {
    'k/bragi': { name: 'Bea', coat: 'dove', source: 'manual' as const },
    'k/tidewater': { name: 'Rivet', coat: 'nutmeg', source: 'auto' as const, proposal: 'named' as const },
  }
  const kept = assignGerbils([{ key: 'k/bragi', name: 'bragi' }, { key: 'k/tidewater', name: 'tidewater' }], stored, set)
  expect(kept['k/bragi']).toEqual(stored['k/bragi'])
  expect(kept['k/tidewater']).toEqual(stored['k/tidewater'])
})

test("the model's name is one fresh word; the prompt carries the project and the names taken", async () => {
  expect(parseName('{"name": "rivet"}', [])).toBe('Rivet')
  expect(parseName('Rivet', [])).toBe('Rivet')
  expect(parseName('{"name": "Hazel"}', ['hazel'])).toBeNull()
  expect(parseName('{"name": "Two words"}', [])).toBeNull()
  expect(parseName('Sure! How about Rivet?', [])).toBeNull()
  expect(parseName('{"name": "Tidewater"}', [], 'tidewater')).toBeNull()
  expect(placeholderName('butterfield_rrt')).toBe('Butterfield')
  const prompt = buildNamePrompt({ folder: 'tidewater', about: '# Tidewater\nTide tables.', titles: ['Fix the tide chart'], taken: ['Scout', 'Digger'] })
  expect(prompt).toMatch(/Project folder: tidewater/)
  expect(prompt).toMatch(/Tide tables/)
  expect(prompt).toMatch(/- Fix the tide chart/)
  expect(prompt).toMatch(/do not use\): Scout, Digger/)
})

test("a new project's gerbil is suggested and put to the user once; their answer is kept as theirs", async ($, on) => {
  const { store, named } = standForTheApp(on, [], NEW, {}, '[]', undefined, { gerbilName: 'Rivet' })
  await $.session.start({ cwd: NEW, surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  // The model was asked once, with the folder and the names already taken.
  expect(named).toHaveLength(1)
  expect(named[0]).toMatch(/Project folder: tidewater/)
  expect(named[0]).toMatch(/Butterscotch/)
  const suggested = tidewater(store)!
  expect(suggested.name).toBe('Rivet')
  expect(WORN).not.toContain(suggested.coat)
  expect((await ui.find({ type: 'Text', text: /^Rivet$/ }))?.text).toBe('Rivet')

  // The first prompt carries the question for Claude to put to the user.
  const sent = await $.prompt.submit(typed('set up the tide tables'))
  expect(sent.text).toBe('set up the tide tables')
  expect(sent.context).toHaveLength(1)
  expect(sent.context?.[0]).toContain(`"Meet Rivet, a ${coatById(suggested.coat).label} gerbil for this project. Keep, or give me a name and colour?"`)
  expect(sent.context?.[0]).toContain(SET_GERBIL)
  // Asked once: the suggestion now stands as it is, and the next prompt carries nothing.
  expect(tidewater(store)).toEqual({ name: 'Rivet', coat: suggested.coat, source: 'auto' })
  expect((await $.prompt.submit(typed('keep going'))).context).toBeUndefined()

  // The user answers; Claude saves it as their pick, kept over everything.
  const saved = await $.tool.call({ tool: SET_GERBIL, name: 'Tide', coat: 'polar fox', confirmed: true })
  expect(String(saved.result)).toMatch(/Tide, the polar fox gerbil, is PM for tidewater, as the user chose/)
  expect(tidewater(store)).toEqual({ name: 'Tide', coat: 'polar-fox', source: 'manual' })
  expect((await ui.find({ type: 'Text', text: /^Tide$/ }))?.text).toBe('Tide')
  // A colour the mod does not know is refused, naming the coats.
  const wrong = await $.tool.call({ tool: SET_GERBIL, coat: 'tartan' })
  expect(wrong.result).toBeUndefined()
  expect(tidewater(store)?.coat).toBe('polar-fox')
  await ui.unmount()
})

test('where the model gives no name, Claude is asked to think of one', async ($, on) => {
  const { store } = standForTheApp(on, [], NEW, {}, '[]', undefined, { gerbilName: null })
  await $.session.start({ cwd: NEW, surface: 'desktop', isInteractive: true })

  const sent = await $.prompt.submit(typed('set up the tide tables'))
  expect(sent.context?.[0]).toMatch(/could not ask a model for a name/)
  expect(sent.context?.[0]).toMatch(/"confirmed": false/)
  expect(sent.context?.[0]).toMatch(/already taken\): .*Butterscotch/)
  // Meanwhile it goes by its folder's name.
  expect(tidewater(store)).toEqual(expect.objectContaining({ name: 'Tidewater', source: 'auto' }))
  // Claude saves its own suggestion as one, not as the user's pick.
  await $.tool.call({ tool: SET_GERBIL, name: 'Ebb', confirmed: false })
  expect(tidewater(store)).toEqual(expect.objectContaining({ name: 'Ebb', source: 'auto' }))
})

test('with nobody to ask (a scheduled run), the suggestion stands without a question', async ($, on) => {
  const { store } = standForTheApp(on, [], NEW, {}, '[]', undefined, { gerbilName: 'Rivet' })
  await $.session.start({ cwd: NEW, surface: 'desktop', isInteractive: true })

  const run = await $.prompt.submit({ text: 'nightly tide check', wait: false, origin: { kind: 'scheduled-trigger' } } as never)
  expect(run.context).toBeUndefined()
  expect(tidewater(store)).toEqual(expect.objectContaining({ name: 'Rivet', source: 'auto' }))
  expect(tidewater(store)?.proposal).toBeUndefined()
  // Settled: a later prompt asks nothing either.
  expect((await $.prompt.submit(typed('what did the run find?'))).context).toBeUndefined()
})

test("Claude Desktop's auto-mode refusal is recognised, and only that", async () => {
  const text = "PreToolUse:mcp__ccd_session_mgmt__get_session hook error: Not run: in auto mode Claude Desktop doesn't run this tool when a plugin's own code calls it. Have Claude make the call."
  expect(isAutoModeRefusal(text)).toBe(true)
  expect(isAutoModeRefusal(text.replace(/'/g, '\u2019'))).toBe(true)
  expect(isAutoModeRefusal('refused: The server-side auto mode classifier gave no verdict')).toBe(false)
  const note = feedNote({ hasTasks: false })
  expect(note).toMatch(/list_sessions/)
  expect(note).not.toMatch(/list_scheduled_tasks/)
  const ask = gerbilProposalNote({ project: 'p', name: 'Rivet', coat: 'nutmeg', coatLabel: 'nutmeg', isUnnamed: false, taken: [], coats: ['nutmeg'] })
  expect(ask).toMatch(/Meet Rivet, a nutmeg gerbil for this project/)
})

test('in auto mode the refused calls are no error: Claude is asked for the data, and what it hands over is shown', async ($, on) => {
  standForTheApp(on, [], CWD, {}, '[]', undefined, { isAutoMode: true })
  await $.session.start({ cwd: CWD, surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  // Nothing read, nothing red: the foot of the pane says where the data will come from.
  const before = await $.command.run({ command: 'overview', args: 'dump' })
  expect(before.text).toMatch(/errors: none/)
  expect(before.text).toMatch(/note: auto mode: data comes from Claude, asked for with your next message/)
  expect(await ui.find({ type: 'Text', text: /auto mode: data comes from Claude/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /allow mcp__ccd_session_mgmt__get_session/ })).toBeUndefined()
  expect(await ui.find({ key: 'done:local_a' })).toBeUndefined()

  // The next prompt asks Claude to make the calls and hand the answers over; once, not every prompt.
  const sent = await $.prompt.submit(typed('plot the TRM score'))
  expect(sent.context).toHaveLength(1)
  for (const want of ['list_sessions', 'get_session', 'list_scheduled_tasks', FEED]) expect(sent.context?.[0]).toContain(want)
  expect((await $.prompt.submit(typed('and the legend'))).context).toBeUndefined()

  // Claude hands over what the app answered it, as text.
  const fed = await $.tool.call({
    tool: FEED,
    sessions: JSON.stringify(SESSIONS),
    self: JSON.stringify(ME),
    scheduled_tasks: 'No scheduled tasks found. Use create_scheduled_task to add one.',
  })
  expect(String(fed.result)).toMatch(/3 sessions, this session and 0 scheduled tasks/)
  await $.command.run({ command: 'overview', args: 'refresh' })
  expect(await ui.find({ key: 'done:local_a' })).toBeDefined()
  expect(await ui.find({ text: /^Gerbil mod improvements$/ })).toBeDefined()
  const after = await $.command.run({ command: 'overview', args: 'dump' })
  expect(after.text).toMatch(/errors: none/)
  expect(after.text).toMatch(/note: auto mode: data comes from Claude, last handed over at \d\d:\d\d/)

  // The same by command, and a usage line for what is not JSON.
  expect((await $.command.run({ command: 'overview', args: 'feed nonsense' })).text).toMatch(/^Usage: \/overview feed/)
  const typedFeed = await $.command.run({ command: 'overview', args: `feed {"sessions": ${JSON.stringify(SESSIONS.slice(0, 1))}}` })
  expect(typedFeed.text).toMatch(/1 sessions/)
  await ui.unmount()
})
