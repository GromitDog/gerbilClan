import { expect, mock, test } from 'claude-code/testing'

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

const mcpAnswer = (text: string) => ({ value: { content: [{ type: 'text', text }], isError: false } })

// Nothing sits beneath the plugin: each hook here stands for the app.
function standForTheApp(
  on: Parameters<Parameters<typeof test>[1]>[1],
  archived: string[],
  cwd = CWD,
  env: Record<string, string> = {},
  tasksAnswer = '[]',
) {
  on('env.get', (_, e) => ({ value: env[e.name] }))
  on('command.register', () => ({ value: { command: 'overview' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: cwd }))
  on('session.id', () => ({ value: 'self' }))
  // A clock in memory: `clock.now` reads it, and the refresh timer waits for an advance that never comes.
  mock.clock(on, { now: Date.now() })
  on('ui.log', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  // The kit has no bottom for $.store: one in memory per test.
  const store: Record<string, unknown> = {}
  on('store.get', (_, e) => ({ value: store[String(e.key)] }))
  on('store.set', (_, e) => {
    store[String(e.key)] = e.value
    return { value: undefined }
  })
  on('mcp.call', (_, e) => {
    switch (e.tool) {
      case 'list_sessions':
        return mcpAnswer(JSON.stringify(SESSIONS))
      case 'list_scheduled_tasks':
        return mcpAnswer(tasksAnswer)
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
    if (String(e.path).endsWith('issues.json')) return { value: ISSUES }
    throw new Error('ENOENT: no such file or directory')
  })
  // Only butterfield_rrt has an issues file; the other project is on Jira.
  on('fs.list', (_, e) => ({
    value: String(e.path).includes('butterfield')
      ? [{ name: 'issues.json', kind: 'file', size: 1, mtimeMs: 0, isLink: false }]
      : [],
  }))
  on('model.complete', () => ({
    value: {
      isAnswered: true,
      text: '{"synopsis": "Plot the TRM score on the matrix", "hours": 1.5, "status": "wip"}',
      usage: {
        input_tokens: 10,
        output_tokens: 10,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      },
    },
  }))
}

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

test('an account with no scheduled tasks is quiet, not an error', async ($, on) => {
  // The scheduled-tasks server answers an empty list with a sentence, not JSON.
  standForTheApp(on, [], CWD, {}, 'No scheduled tasks found. Use create_scheduled_task to add one.')
  await $.session.start({ cwd: CWD, surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /No scheduled tasks for this project/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /couldn't reach|no JSON in the answer/ })).toBeUndefined()
  await ui.unmount()
})

test('a snapshot an earlier version stored is declined', async ($, on) => {
  on('state.get', () => ({ value: { value: { projects: [{ key: 'x' }] }, version: 1 } }))
  mock.clock(on, { now: Date.now() })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /Reading your sessions|No sessions found/ })).toBeDefined()
  await ui.unmount()
})
