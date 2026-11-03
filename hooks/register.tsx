import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions, Register, Timer } from 'claude-code'

import type {
  OverviewGerbil,
  OverviewIssue,
  OverviewIssues,
  OverviewProject,
  OverviewSessionRow,
  OverviewSnapshot,
  OverviewStatus,
  OverviewTaskRow,
  OverviewView,
} from '../types'
import {
  EMPTY_RECORD,
  ISSUE_BAR_ORDER,
  ISSUE_COLOR,
  applyRecord,
  dayKey,
  dayOf,
  errorMessage,
  fmtAgo,
  fmtDay,
  fmtHours,
  fmtTime,
  isHigh,
  isUnderRoot,
  issueCounts,
  joinPath,
  mcpText,
  openIssues,
  parseIssuesFile,
  parseJiraMap,
  parseJiraSearch,
  parseRoots,
  previousDay,
  projectOf,
  rollup,
  rootFor,
  serializeIssuesFile,
  sprintCounts,
  startOfWeek,
  tieTasks,
  type RawJiraSearch,
  type RawRun,
  type RawSession,
  type RawTask,
  type Records,
  type SessionRecord,
} from './data'
import { ESTIMATE_SYSTEM, buildEstimatePrompt, parseEstimate } from './estimate'
import {
  COATS,
  DEFAULT_GERBILS,
  assignGerbils,
  coatById,
  findCoat,
  parseGerbilMap,
} from './coats'
import { gerbilSays } from './gerbil'
import { gerbilAscii, gerbilSvg, moodColor } from './gerbil-svg'

const PANE = 'project-overview'
const TITLE = 'Projects'
// The desktop app's own MCP servers, by the key their tool names carry.
const SESSIONS = 'ccd_session_mgmt'
const TASKS = 'scheduled-tasks'

const EMPTY_SNAPSHOT: OverviewSnapshot = {
  at: 0,
  isRefreshing: false,
  projects: [],
  sessions: [],
  tasks: [],
  issues: {},
  errors: [],
  estimating: null,
  gerbils: {},
}

// Bump a shape tag when the value's fields change: a reload then starts over
// instead of reading what the old code stored.
const snapshot = atom({ plugin: 'project-overview', key: 'snapshot' } as const, EMPTY_SNAPSHOT, {
  shape: 'snapshot-3',
})
const view = atom(
  { plugin: 'project-overview', key: 'view' } as const,
  { project: null, editing: null, showAll: false } satisfies OverviewView,
  { shape: 'view-2' },
)

type Options = {
  projectsRoot: string
  issuesFile: string
  estimateModel: string
  refreshMinutes: number
  maxEstimatesPerRefresh: number
  openOnStart: boolean
  jiraServer: string
  jiraCloudId: string
  jiraProjects: string
  gerbils: string
}

function readOptions(o: PluginOptions): Options {
  const text = (key: string, fallback: string) =>
    typeof o[key] === 'string' && o[key] ? String(o[key]) : fallback
  const num = (key: string, fallback: number) =>
    typeof o[key] === 'number' && Number.isFinite(o[key]) ? Number(o[key]) : fallback
  return {
    projectsRoot: text('projectsRoot', 'C:\\Users\\amyjm\\RiderProjects; ~/RiderProjects'),
    issuesFile: text('issuesFile', '.claude/overview/issues.json'),
    estimateModel: text('estimateModel', 'haiku'),
    refreshMinutes: num('refreshMinutes', 5),
    maxEstimatesPerRefresh: num('maxEstimatesPerRefresh', 4),
    openOnStart: o.openOnStart !== false,
    jiraServer: text('jiraServer', 'a42b580c-4d22-425e-906d-bc95104ad94d'),
    jiraCloudId: text('jiraCloudId', '9ce04f13-82f3-4067-bc19-3027caf13167'),
    jiraProjects: text('jiraProjects', 'bragi=BRAG, databasemanager=DBM, seeker=SKR, SeekerScrapers=SKR'),
    gerbils: text('gerbils', DEFAULT_GERBILS),
  }
}

type Dollar = EngineInterface

// Module state: lost on a hot reload, which is fine for these.
let opts: Options = readOptions({})
let timer: Timer | null = null
let refreshing = false
let refreshQueued = false
let selfId = ''
// The projects roots, `~` expanded once the home folder is read at session start.
let roots: string[] = parseRoots(opts.projectsRoot, undefined)

/** The project a cwd belongs to, under whichever projects root holds it. */
function projectAt(cwd: string) {
  return projectOf(cwd, rootFor(cwd, roots))
}

async function callJson<T>(
  $: Dollar,
  server: string,
  tool: string,
  args: Record<string, unknown> = {},
  // Some tools answer an empty list with a sentence instead of JSON (the scheduled-tasks
  // server: "No scheduled tasks found. Use create_scheduled_task..."): that is `value`, not an error.
  emptyAs?: { when: RegExp; value: T },
): Promise<T> {
  const result = await $.mcp.call(server, tool, args)
  const text = mcpText(result)
  if (result.isError) throw new Error(`${tool}: ${text.slice(0, 160) || 'failed'}`)
  let body = text
  let start = body.search(/[[{]/)
  if (start < 0) {
    // Past the engine's size cap a result is replaced by a note naming the file it was saved to.
    const saved = /saved to\s+(\S.*?)\s*$/m.exec(text)?.[1]
    for (const path of saved ? [saved, saved.replace(/\.$/, '')] : []) {
      try {
        body = await $.fs.read(path)
        start = body.search(/[[{]/)
        break
      } catch {
        // Try the next spelling.
      }
    }
  }
  if (start < 0) {
    if (emptyAs && emptyAs.when.test(text)) return emptyAs.value
    const blocks = result.content.map(b => b.type).join(',') || 'none'
    throw new Error(`${tool}: no JSON in the answer (blocks: ${blocks}): ${text.slice(0, 200) || '(empty)'}`)
  }
  return JSON.parse(body.slice(start)) as T
}

async function callText(
  $: Dollar,
  server: string,
  tool: string,
  args: Record<string, unknown> = {},
): Promise<string> {
  const result = await $.mcp.call(server, tool, args)
  const text = mcpText(result)
  if (result.isError) throw new Error(`${tool}: ${text.slice(0, 160) || 'failed'}`)
  return text
}

async function loadRecords($: Dollar): Promise<Records> {
  const value = await $.store.get('records')
  return value && typeof value === 'object' ? (value as Records) : {}
}

/** Changes one session's record in the store and reflects it in the snapshot. */
async function saveRecord(
  $: Dollar,
  id: string,
  change: (record: SessionRecord) => SessionRecord,
): Promise<SessionRecord> {
  const records = await loadRecords($)
  const next = change(records[id] ?? EMPTY_RECORD)
  records[id] = next
  await $.store.set('records', records)
  await update($, snapshot, s => ({
    ...s,
    sessions: s.sessions.map(row => (row.id === id ? applyRecord(row, next) : row)),
  }))
  return next
}

/** The gerbils dealt or picked so far, by project key (projects not seen lately included). */
async function loadGerbils($: Dollar): Promise<Record<string, OverviewGerbil>> {
  const value = await $.store.get('gerbils')
  return value && typeof value === 'object' ? (value as Record<string, OverviewGerbil>) : {}
}

/** The gerbil a project has now: the snapshot's, or worked out the way a refresh would. */
function gerbilOf(s: OverviewSnapshot, project: OverviewProject): OverviewGerbil {
  return (
    s.gerbils[project.key] ??
    assignGerbils([project], {}, parseGerbilMap(opts.gerbils))[project.key] ?? {
      name: 'Gerbil',
      coat: 'agouti',
      source: 'auto',
    }
  )
}

/** Renames or recolours a project's gerbil; what Amy picks is kept over the setting. */
async function saveGerbil(
  $: Dollar,
  project: OverviewProject,
  change: { name?: string; coat?: string },
): Promise<OverviewGerbil> {
  const s = await read($, snapshot)
  const now = gerbilOf(s, project)
  const next: OverviewGerbil = {
    name: change.name?.trim().slice(0, 24) || now.name,
    coat: change.coat ?? now.coat,
    source: 'manual',
  }
  const stored = await loadGerbils($)
  await $.store.set('gerbils', { ...stored, [project.key]: next })
  await update($, snapshot, cur => ({ ...cur, gerbils: { ...cur.gerbils, [project.key]: next } }))
  return next
}

async function readIssues(
  $: Dollar,
  project: Pick<OverviewProject, 'name' | 'cwd'>,
  errors: string[],
): Promise<OverviewIssues> {
  const path = project.cwd ? joinPath(project.cwd, opts.issuesFile) : ''
  const none: OverviewIssues = { kind: 'none', path, issues: [] }
  if (!path) return none
  // No folder or no file is the usual case (the issues are on Jira), never an error:
  // list the folder first and read only a file the listing shows.
  const cut = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  let entries: Array<{ name: string }>
  try {
    entries = await $.fs.list(path.slice(0, cut))
  } catch {
    return none
  }
  if (!entries.some(e => e.name === path.slice(cut + 1))) return none
  let text: string
  try {
    text = await $.fs.read(path)
  } catch (err) {
    errors.push(`issues of ${project.name}: ${errorMessage(err)}`)
    return none
  }
  try {
    return parseIssuesFile(text, path)
  } catch (err) {
    errors.push(`issues of ${project.name}: ${errorMessage(err)}`)
    return none
  }
}

// How many of a sprint's open issues one refresh lists: each is a few KB in the
// connector's answer, and past the engine's cap a result goes to a file.
const JIRA_PAGE = 20

/** The open sprint of a Jira project: how many issues, how many done, and the open ones. */
async function readJiraSprint($: Dollar, set: OverviewIssues, projectKey: string): Promise<OverviewIssues> {
  const cloudId = set.jira?.cloudId || opts.jiraCloudId
  const base = `project = ${projectKey} AND sprint in openSprints()`
  const jira = { ...set.jira, projectKey, cloudId, sprint: undefined, error: undefined }
  try {
    const whole = await callJson<RawJiraSearch>($, opts.jiraServer, 'searchJiraIssuesUsingJql', {
      cloudId,
      jql: base,
      searchResultMode: 'count',
    })
    const total = whole.issues?.totalCount ?? 0
    if (total === 0) return { ...set, kind: 'jira', issues: [], jira }
    const page = parseJiraSearch(
      await callJson<RawJiraSearch>($, opts.jiraServer, 'searchJiraIssuesUsingJql', {
        cloudId,
        jql: `${base} AND statusCategory != Done ORDER BY priority DESC, status ASC, created ASC`,
        fields: ['summary', 'status', 'priority', 'assignee', 'customfield_10020'],
        maxResults: JIRA_PAGE,
        searchResultMode: 'all',
      }),
    )
    const open = Math.max(page.count, page.issues.length)
    return {
      ...set,
      kind: 'jira',
      issues: page.issues,
      jira: {
        ...jira,
        sprint: {
          name: page.sprint?.name ?? 'Open sprint',
          endDate: page.sprint?.endDate,
          total,
          done: Math.max(0, total - open),
          listed: page.issues.length,
        },
      },
    }
  } catch (err) {
    return { ...set, kind: 'jira', issues: [], jira: { ...jira, error: errorMessage(err) } }
  }
}

/** Re-reads sessions, tasks and issues; then estimates the selected project's sessions. */
async function refresh($: Dollar, why: string): Promise<void> {
  if (refreshing) {
    refreshQueued = true
    return
  }
  refreshing = true
  $.ui.log(`project-overview: refresh (${why})`, { to: 'debug' })
  const errors: string[] = []
  try {
    await update($, snapshot, s => ({ ...s, isRefreshing: true }))
    const now = await $.clock.now()
    const records = await loadRecords($)
    const selfCwd = await $.session.cwd()
    const engineId = await $.session.id()

    let raw: RawSession[] = []
    try {
      // 80 rows stay under the engine's cap on a tool result; archived ones included so a
      // session archived today is still in reach.
      raw = await callJson<RawSession[]>($, SESSIONS, 'list_sessions', {
        limit: 80,
        include_archived: true,
      })
    } catch (err) {
      errors.push(`sessions: ${errorMessage(err)}`)
    }
    if (!Array.isArray(raw)) raw = []
    // The app leaves this session out of its list; add it under its own id.
    const self = raw.find(s => s.sessionId.endsWith(engineId))
    if (!self) {
      raw.push({
        sessionId: `local_${engineId}`,
        title: 'This session',
        cwd: selfCwd,
        isRunning: true,
        isArchived: false,
        lastActivityAt: new Date(now).toISOString(),
      })
    }
    selfId = self?.sessionId ?? `local_${engineId}`

    const projectsByKey = new Map<string, OverviewProject>()
    const rows: OverviewSessionRow[] = []
    for (const s of raw) {
      const p = projectAt(s.cwd || selfCwd)
      const ms = Date.parse(s.lastActivityAt ?? '') || 0
      const known = projectsByKey.get(p.key)
      if (!known) projectsByKey.set(p.key, { ...p, lastActivityMs: ms })
      else if (ms > known.lastActivityMs) known.lastActivityMs = ms
      const base: OverviewSessionRow = {
        id: s.sessionId,
        title: s.title || s.sessionId,
        project: p.key,
        cwd: s.cwd ?? '',
        isSelf: s.sessionId === selfId,
        isRunning: !!s.isRunning,
        isArchived: !!s.isArchived,
        pinned: !!s.pinned,
        lastActivityAt: s.lastActivityAt ?? new Date(0).toISOString(),
        link: s.link,
        ...EMPTY_RECORD,
      }
      rows.push(applyRecord(base, records[s.sessionId] ?? EMPTY_RECORD))
    }
    // A session marked done today may have left the list once archived: draw it from its kept row.
    const todayKey = dayKey(now)
    for (const [id, rec] of Object.entries(records)) {
      if (rec.doneOn !== todayKey || !rec.kept || rows.some(r => r.id === id)) continue
      const p = projectAt(rec.kept.cwd || selfCwd)
      const ms = Date.parse(rec.kept.lastActivityAt) || 0
      if (!projectsByKey.has(p.key)) projectsByKey.set(p.key, { ...p, lastActivityMs: ms })
      const base: OverviewSessionRow = {
        id,
        title: rec.kept.title,
        project: p.key,
        cwd: rec.kept.cwd,
        isSelf: false,
        isRunning: false,
        isArchived: true,
        pinned: false,
        lastActivityAt: rec.kept.lastActivityAt,
        link: rec.kept.link,
        ...EMPTY_RECORD,
      }
      rows.push(applyRecord(base, rec))
    }
    const projects = [...projectsByKey.values()].sort((a, b) => b.lastActivityMs - a.lastActivityMs)

    const tasks: OverviewTaskRow[] = []
    try {
      const rawTasks = await callJson<RawTask[]>($, TASKS, 'list_scheduled_tasks', {}, {
        when: /no scheduled tasks/i,
        value: [],
      })
      const runsByTask: Record<string, RawRun[]> = {}
      const skillTexts: Record<string, string> = {}
      for (const t of Array.isArray(rawTasks) ? rawTasks : []) {
        try {
          const runs = await callJson<RawRun[] | { runs?: RawRun[] }>(
            $,
            TASKS,
            'list_task_runs',
            { taskId: t.taskId, limit: 3 },
            { when: /no runs/i, value: [] },
          )
          runsByTask[t.taskId] = Array.isArray(runs) ? runs : (runs.runs ?? [])
        } catch (err) {
          errors.push(`runs of ${t.title ?? t.taskId}: ${errorMessage(err)}`)
        }
        if (t.path) {
          try {
            skillTexts[t.taskId] = await $.fs.read(t.path)
          } catch {
            // Unreadable prompt file: the task is tied by its runs alone.
          }
        }
      }
      const sessionProject = Object.fromEntries(rows.map(r => [r.id, r.project]))
      tasks.push(
        ...tieTasks(
          Array.isArray(rawTasks) ? rawTasks : [],
          runsByTask,
          skillTexts,
          sessionProject,
          projects,
        ),
      )
    } catch (err) {
      errors.push(`scheduled tasks: ${errorMessage(err)}`)
    }

    const issues: Record<string, OverviewIssues> = {}
    for (const p of projects) issues[p.key] = await readIssues($, p, errors)

    const current = await read($, view)
    let selected = current.project
    if (!selected || !projectsByKey.has(selected)) {
      // A default is a real project folder: never the app's "No folder" scratch workspaces.
      const defaultable = (key: string | undefined | null): key is string => {
        const p = key ? projectsByKey.get(key) : undefined
        return !!p && p.cwd !== '' && roots.some(r => isUnderRoot(p.cwd, r))
      }
      const stored = (await $.store.get('view')) as { project?: string } | undefined
      const storedKey = stored?.project
      const own = projectAt(selfCwd).key
      selected = defaultable(storedKey)
        ? storedKey
        : defaultable(own)
          ? own
          : (projects.find(p => defaultable(p.key))?.key ?? projects[0]?.key ?? null)
      await update($, view, v => ({ ...v, project: selected }))
    }

    // Projects with no issues file may be on Jira: the setting names their key,
    // and the selected one's open sprint is read (the others on selection).
    const jiraMap = parseJiraMap(opts.jiraProjects)
    for (const p of projects) {
      const set = issues[p.key]
      if (!set || set.kind === 'file' || set.jira?.projectKey) continue
      const key = p.cwd ? jiraMap[p.name.toLowerCase()] : undefined
      if (key) issues[p.key] = { ...set, kind: 'jira', jira: { ...set.jira, projectKey: key } }
    }
    const selectedSet = selected ? issues[selected] : undefined
    if (selected && selectedSet?.kind === 'jira' && selectedSet.jira?.projectKey) {
      issues[selected] = await readJiraSprint($, selectedSet, selectedSet.jira.projectKey)
    }

    // Each project's gerbil: picked, set, or dealt once and then kept.
    const storedGerbils = await loadGerbils($)
    const gerbils = assignGerbils(projects, storedGerbils, parseGerbilMap(opts.gerbils))
    const keptGerbils = { ...storedGerbils, ...gerbils }
    if (JSON.stringify(keptGerbils) !== JSON.stringify(storedGerbils)) {
      await $.store.set('gerbils', keptGerbils)
    }

    await update($, snapshot, s => ({
      ...s,
      at: now,
      isRefreshing: false,
      projects,
      sessions: rows,
      tasks,
      issues,
      errors,
      gerbils,
    }))

    if (selected) {
      const name = projectsByKey.get(selected)?.name ?? selected
      await estimateSessions($, selected, name, rows)
    }
  } catch (err) {
    await update($, snapshot, s => ({
      ...s,
      at: s.at || Date.now(),
      isRefreshing: false,
      errors: [...s.errors, `refresh: ${errorMessage(err)}`].slice(-5),
    }))
  } finally {
    refreshing = false
    if (refreshQueued) {
      refreshQueued = false
      void refresh($, 'queued')
    }
  }
}

/** One short completion per session that changed since its last estimate, capped per refresh. */
async function estimateSessions(
  $: Dollar,
  projectKey: string,
  projectName: string,
  rows: OverviewSessionRow[],
): Promise<void> {
  const candidates = rows
    .filter(
      r =>
        r.project === projectKey &&
        !r.isArchived &&
        !r.isSelf &&
        r.hoursSource !== 'manual' &&
        r.estimatedFor !== r.lastActivityAt,
    )
    .sort((a, b) => Date.parse(b.lastActivityAt) - Date.parse(a.lastActivityAt))
    .slice(0, Math.max(0, opts.maxEstimatesPerRefresh))
  for (const row of candidates) {
    await update($, snapshot, s => ({ ...s, estimating: row.id }))
    try {
      const transcript = await callText($, SESSIONS, 'list_events', {
        session_id: row.id,
        limit: 30,
      })
      const reply = await $.model.complete({
        model: opts.estimateModel,
        system: ESTIMATE_SYSTEM,
        prompt: buildEstimatePrompt(row.title, projectName, transcript),
        maxTokens: 200,
      })
      if (!reply.isAnswered) throw new Error(`model: ${reply.reason}`)
      const est = parseEstimate(reply.text)
      if (!est) throw new Error('model: no JSON in the reply')
      await saveRecord($, row.id, r => {
        const status = r.statusSource === 'manual' ? r.status : est.status
        return {
          ...r,
          synopsis: est.synopsis || r.synopsis,
          hours: r.hoursSource === 'manual' ? r.hours : est.hours,
          hoursSource: r.hoursSource === 'manual' ? 'manual' : 'model',
          status,
          statusSource: r.statusSource === 'manual' ? 'manual' : 'model',
          doneOn: status === 'done' ? (r.doneOn ?? dayOf(row.lastActivityAt) ?? undefined) : r.doneOn,
          estimatedFor: row.lastActivityAt,
        }
      })
    } catch (err) {
      await update($, snapshot, s => ({
        ...s,
        errors: [...s.errors, `estimate "${row.title}": ${errorMessage(err)}`].slice(-5),
      }))
    }
  }
  await update($, snapshot, s => ({ ...s, estimating: null }))
}

/** Marks a session done today and archives it; this session is marked only. */
async function markDone($: Dollar, id: string, today: string): Promise<void> {
  const row = (await read($, snapshot)).sessions.find(r => r.id === id)
  // Keep the row's identity: once archived it may fall outside the list the app returns.
  const kept = row
    ? {
        title: row.title,
        project: row.project,
        cwd: row.cwd,
        lastActivityAt: row.lastActivityAt,
        ...(row.link ? { link: row.link } : {}),
      }
    : undefined
  await saveRecord($, id, r => ({
    ...r,
    status: 'done',
    statusSource: 'manual',
    doneOn: today,
    ...(kept ? { kept } : {}),
  }))
  if (!row || row.isSelf || row.isArchived) {
    $.ui.toast(row?.isSelf ? 'Marked done; this session stays open.' : `Marked ${row?.title ?? id} done.`)
    return
  }
  try {
    const result = await $.mcp.call(SESSIONS, 'archive_session', {
      session_id: id,
      reason: 'Marked done in the project overview',
    })
    const text = mcpText(result)
    if (result.isError) {
      $.ui.toast(`Done, but not archived: ${text.slice(0, 140)}`)
      return
    }
    await saveRecord($, id, r => ({ ...r, archived: true }))
    await update($, snapshot, s => ({
      ...s,
      sessions: s.sessions.map(r => (r.id === id ? { ...r, isArchived: true } : r)),
    }))
    $.ui.toast(`Done and archived: ${row.title}`)
  } catch (err) {
    $.ui.toast(`Done, but archive failed: ${errorMessage(err)}`)
  }
}

/** Closes an issue in the project's issues file; its linked session is marked done too. */
async function markIssueDone(
  $: Dollar,
  projectKey: string,
  key: string,
  today: string,
): Promise<void> {
  const set = (await read($, snapshot)).issues[projectKey]
  if (!set || set.kind !== 'file') return
  try {
    const text = await $.fs.read(set.path)
    const parsed = parseIssuesFile(text, set.path)
    const issues = parsed.issues.map(i =>
      i.key === key ? { ...i, state: 'closed' as const, closedOn: today } : i,
    )
    await $.fs.write(set.path, serializeIssuesFile(text, issues))
    await update($, snapshot, s => ({
      ...s,
      issues: { ...s.issues, [projectKey]: { ...set, issues } },
    }))
    const issue = parsed.issues.find(i => i.key === key)
    if (issue?.sessionId) await markDone($, issue.sessionId, today)
    else $.ui.toast(`${key} closed`)
  } catch (err) {
    $.ui.toast(`Could not close ${key}: ${errorMessage(err)}`)
  }
}

const NEXT_STATUS: Record<OverviewStatus, OverviewStatus> = {
  planned: 'wip',
  wip: 'blocked',
  blocked: 'planned',
  done: 'wip',
}

const STATUS_COLOR: Record<OverviewStatus, string> = {
  planned: '#78909C',
  wip: '#FFB300',
  blocked: '#EF5350',
  done: '#7CB342',
}

// The text on a status badge: dark on amber, white on the rest.
const STATUS_FG: Record<OverviewStatus, string> = {
  planned: '#FFFFFF',
  wip: '#1E2A30',
  blocked: '#FFFFFF',
  done: '#FFFFFF',
}

const STATUS_GLYPH: Record<OverviewStatus, string> = {
  planned: '○',
  wip: '●',
  blocked: '◍',
  done: '✓',
}

function quickPrompt(kind: 'today' | 'weekly' | 'uat', project: string): string {
  switch (kind) {
    case 'today':
      return `Summarise today's work on ${project}: what was produced (from git and the session history), an hours estimate per workstream with a category split, and offer to add the rows to TimeCheck.xlsx dated today.`
    case 'weekly':
      return `Write this week's Vendor Weekly Status Report for ${project} from the last issued version in cortex/PM: accomplishments, plan for next week, tracker updates and RAG. Flag anything I should check before it goes out.`
    case 'uat':
      return `Regenerate the RRT UAT Test - Status Overview page from the latest issue tracker in cortex/PM with cortex/scratch/uat-status-overview/build_overview.py, diff it against the previous tracker, and summarise what changed.`
  }
}

export const register: Register = (on, options) => {
  opts = readOptions(options)
  roots = parseRoots(opts.projectsRoot, undefined)

  on('session.start', async ($, e, next) => {
    // `~` in the projects roots: the home folder (USERPROFILE on Windows, HOME on a Mac).
    try {
      const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME'))
      roots = parseRoots(opts.projectsRoot, home)
    } catch {
      roots = parseRoots(opts.projectsRoot, undefined)
    }
    await $.command.register({
      name: 'overview',
      description:
        'Project overview pane: open, refresh, all, dump, done <session id>, backdate <session id>, clan, gerbil [name <Name>|coat <coat>|coats|reset]',
      argumentHint: '[open|refresh|all|dump|done <id>|backdate <id>|clan|gerbil …]',
    })
    if (opts.openOnStart) void $.ui.open({ id: PANE, title: TITLE })
    void refresh($, 'start')
    timer?.cancel()
    timer = $.clock.every(Math.max(1, opts.refreshMinutes) * 60_000, () => void refresh($, 'timer'))

    return next(e)
  })

  on('command.run', { command: 'overview' }, async ($, e) => {
    const [verb = 'open', ...rest] = e.args.trim().split(/\s+/).filter(Boolean)
    const arg = rest.join(' ')
    const today = dayKey(await $.clock.now())
    switch (verb) {
      case 'open': {
        const opened = await $.ui.open({ id: PANE, title: TITLE, focus: true })
        return {
          text: opened.isPlaced
            ? 'Project overview pane opened.'
            : `Project overview pane is open but not drawn: ${opened.reason}`,
        }
      }
      case 'refresh': {
        await refresh($, 'command')
        const s = await read($, snapshot)
        const errors = s.errors.length ? `; ${s.errors.length} errors: ${s.errors.join('; ')}` : ''
        return {
          text: `Refreshed: ${s.projects.length} projects, ${s.sessions.length} sessions, ${s.tasks.length} scheduled tasks${errors}.`,
        }
      }
      case 'all': {
        const v = await update($, view, v => ({ ...v, showAll: !v.showAll }))
        return {
          text: v.showAll
            ? 'Showing every session of the project.'
            : 'Showing today and carried-forward sessions.',
        }
      }
      case 'done': {
        if (!arg) return { text: 'Usage: /overview done <session id>' }
        await markDone($, arg, today)
        return { text: `Marked ${arg} done.` }
      }
      case 'backdate': {
        if (!arg) return { text: 'Usage: /overview backdate <session id>' }
        const day = previousDay(today)
        await saveRecord($, arg, r => ({ ...r, doneOn: day }))
        return { text: `${arg}: doneOn set to ${day}, to test the rollover.` }
      }
      case 'dump': {
        // What the pane holds, as text: a check that needs no screen.
        const s = await read($, snapshot)
        const v = await read($, view)
        const key = v.project ?? s.projects[0]?.key ?? null
        const project = s.projects.find(p => p.key === key)
        const rows = s.sessions.filter(r => r.project === key)
        const r = rollup(rows, today)
        const set = key ? s.issues[key] : undefined
        const open = set ? set.issues.filter(i => i.state !== 'closed').length : 0
        const tasks = s.tasks.filter(t => key !== null && t.projects.includes(key))
        const lines = [
          `project: ${project?.name ?? '(none)'} [${key ?? '-'}]; projects: ${s.projects.map(p => p.name).join(', ') || 'none'}`,
          `updated: ${s.at ? new Date(s.at).toISOString() : 'never'}${s.isRefreshing ? ' (refreshing)' : ''}; estimating: ${s.estimating ?? 'nothing'}`,
          `issues: ${set ? `${set.kind}; ${set.issues.length} raised, ${open} open` : 'none'}`,
          `today: ${r.today.length} sessions, ${fmtHours(r.hoursToday)}, ${r.doneToday} done; carried: ${r.carried.length}; other: ${r.rest.length}`,
          ...rows
            .slice(0, 12)
            .map(
              x =>
                `  ${x.status.padEnd(7)} ${fmtHours(x.hours).padStart(6)}  ${x.title} — ${x.synopsis || '(no synopsis)'}${x.isArchived ? ' [archived]' : ''}${x.doneOn ? ` done ${x.doneOn}` : ''}`,
            ),
          `tasks: ${tasks.map(t => `${t.title} (${t.schedule})`).join('; ') || 'none for this project'}`,
          `clan: ${s.projects.map(p => `${p.name}=${gerbilOf(s, p).name}/${gerbilOf(s, p).coat}`).join(', ') || 'none'}`,
          `errors: ${s.errors.join('; ') || 'none'}`,
        ]
        return { text: lines.join('\n') }
      }
      case 'clan': {
        // Every project's gerbil.
        const s = await read($, snapshot)
        if (!s.projects.length) return { text: 'No clan yet: try again after the first refresh.' }
        return {
          text: [
            `The clan, ${s.projects.length} gerbils:`,
            ...s.projects.map(p => {
              const g = gerbilOf(s, p)
              return `  ${g.name.padEnd(14)} ${coatById(g.coat).label.padEnd(17)} ${p.name}`
            }),
          ].join('\n'),
        }
      }
      case 'gerbil': {
        // The selected project's gerbil: show it, rename it, recolour it, or hand it back to the setting.
        const s = await read($, snapshot)
        const v = await read($, view)
        const project = s.projects.find(p => p.key === v.project) ?? s.projects[0]
        const coats = COATS.map(c => c.id).join(', ')
        if (!project) return { text: 'No project yet: try again after the first refresh.' }
        const [what = '', ...words] = rest
        const value = words.join(' ')
        const say = (g: OverviewGerbil) =>
          `${g.name}, the ${coatById(g.coat).label} gerbil, is PM for ${project.name}.`
        switch (what) {
          case '':
            return {
              text: `${say(gerbilOf(s, project))} Change it with /overview gerbil name <Name> or /overview gerbil coat <coat>.`,
            }
          case 'coats':
            return { text: `Coats: ${COATS.map(c => `${c.id} (${c.label})`).join(', ')}.` }
          case 'name':
            if (!value) return { text: 'Usage: /overview gerbil name <Name>' }
            return { text: say(await saveGerbil($, project, { name: value })) }
          case 'coat': {
            const coat = findCoat(value)
            if (!coat) return { text: `No coat "${value}". Coats: ${coats}.` }
            return { text: say(await saveGerbil($, project, { coat: coat.id })) }
          }
          case 'reset': {
            const stored = await loadGerbils($)
            delete stored[project.key]
            await $.store.set('gerbils', stored)
            await refresh($, 'command')
            return { text: say(gerbilOf(await read($, snapshot), project)) }
          }
          default:
            return { text: 'Usage: /overview gerbil [name <Name>|coat <coat>|coats|reset]' }
        }
      }
      default:
        return {
          text: `Unknown "${verb}". Use open, refresh, all, dump, done <id>, backdate <id>, clan or gerbil.`,
        }
    }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const { Box, Text, Button } = els
    const Svg = 'Svg' in els ? els.Svg : null
    const Select = 'Select' in els ? els.Select : null
    const Input = 'Input' in els ? els.Input : null
    const Link = 'Link' in els ? els.Link : null

    const snap = await read($, snapshot)
    const v = await read($, view)
    const now = await $.clock.now()
    const today = dayKey(now)
    const cols = Math.max(32, e.props.bodyColumns)
    const project = snap.projects.find(p => p.key === v.project) ?? snap.projects[0]

    if (!project) {
      return (
        <Box flexDirection="column" padding={1}>
          <Text dimColor>
            {snap.isRefreshing || snap.at === 0 ? 'Reading your sessions…' : 'No sessions found.'}
          </Text>
          {snap.errors.map(err => (
            <Text color="#EF5350">{err}</Text>
          ))}
        </Box>
      )
    }

    const rows = snap.sessions.filter(r => r.project === project.key)
    const roll = rollup(rows, today)
    const issueSet = snap.issues[project.key]
    const jira = issueSet?.kind === 'jira' ? issueSet.jira : undefined
    const sprint = jira?.sprint
    const issues = issueSet && (issueSet.kind === 'file' || sprint) ? issueSet.issues : null
    const counts = !issues ? null : sprint ? sprintCounts(sprint, issues) : issueCounts(issues)
    const open = issues ? openIssues(issues) : []
    const tasks = snap.tasks.filter(t => t.projects.includes(project.key))
    const weekStart = startOfWeek(now)

    // What a project's gerbil says, by the same rules for every member of the clan
    // (another project's Jira sprint is read only once it is selected).
    const saysFor = (p: OverviewProject) => {
      const pRows = p.key === project.key ? rows : snap.sessions.filter(r => r.project === p.key)
      const pRoll = p.key === project.key ? roll : rollup(pRows, today)
      const set = snap.issues[p.key]
      const pSprint = set?.kind === 'jira' ? set.jira?.sprint : undefined
      const pIssues = set && (set.kind === 'file' || pSprint) ? set.issues : null
      const pCounts = !pIssues ? null : pSprint ? sprintCounts(pSprint, pIssues) : issueCounts(pIssues)
      return gerbilSays({
        projectName: p.name,
        errors: snap.errors,
        tasks: snap.tasks.filter(t => t.projects.includes(p.key)),
        issues: pIssues,
        today: pRoll.today,
        carried: pRoll.carried,
        hoursToday: pRoll.hoursToday,
        doneToday: pRoll.doneToday,
        hasWeeklyReportThisWeek: pRows.some(
          r => /weekly (status|report)/i.test(r.title) && Date.parse(r.lastActivityAt) >= weekStart,
        ),
        weekday: new Date(now).getDay(),
        nowMs: now,
        sprint:
          pSprint && pCounts
            ? { name: pSprint.name, endDate: pSprint.endDate, open: pCounts.open }
            : undefined,
      })
    }
    const gerbil = saysFor(project)

    const selectProject = (key: string) => {
      void update($, view, cur => ({ ...cur, project: key, editing: null }))
      void $.store.set('view', { project: key })
      void refresh($, 'select')
    }

    // Small pieces. Each is called, not written as a tag: a tree holds the
    // table's own elements only.
    const badge = (label: string, fg: string, bg: string) => (
      <Text size="caption" weight="semibold" color={fg} backgroundColor={bg}>
        {` ${label} `}
      </Text>
    )
    const statusBadge = (status: OverviewStatus) =>
      badge(status, STATUS_FG[status], STATUS_COLOR[status])
    const heading = (title: string, meta: JSX.Element | null) => (
      <Box gap={1} alignItems="center" justifyContent="space-between">
        <Text size="heading" weight="semibold">
          {title}
        </Text>
        {meta}
      </Box>
    )
    const card = (key: string, children: unknown[], borderColor?: string) => (
      <Box
        key={key}
        flexDirection="column"
        borderStyle="round"
        paddingX={1}
        {...(borderColor ? { borderColor } : { borderDimColor: true })}
      >
        {children}
      </Box>
    )
    const empty = (text: string) => (
      <Text dimColor italic>
        {text}
      </Text>
    )

    const sessionRow = (row: OverviewSessionRow, isCarried: boolean) => {
      const editing = v.editing === row.id
      const title = row.title.length > cols - 14 ? row.title.slice(0, cols - 17) + '…' : row.title
      return (
        <Box key={`row:${row.id}`} flexDirection="column">
          <Box gap={1} alignItems="center">
            <Button
              key={`status:${row.id}`}
              plain
              color={STATUS_COLOR[row.status]}
              label={STATUS_GLYPH[row.status]}
              onPress={() =>
                void saveRecord($, row.id, r => ({
                  ...r,
                  status: NEXT_STATUS[r.status],
                  statusSource: 'manual',
                }))
              }
            />
            <Box flexGrow={1} flexShrink={1}>
              {Link && row.link ? (
                <Link href={row.link} label={title} />
              ) : (
                <Text weight="medium" dimColor={row.status === 'done'} wrap="truncate-end">
                  {title}
                </Text>
              )}
            </Box>
            {row.isRunning && !row.isSelf && badge('running', '#FFFFFF', '#42A5F5')}
            {row.isSelf && (
              <Text size="caption" dimColor>
                this session
              </Text>
            )}
            <Text weight="semibold" tabular>
              {fmtHours(row.hours)}
            </Text>
            {statusBadge(row.status)}
            {isCarried && (
              <Text size="caption" dimColor>
                {fmtAgo(row.lastActivityAt, now)}
              </Text>
            )}
            {snap.estimating === row.id && (
              <Text size="caption" dimColor italic>
                estimating…
              </Text>
            )}
            {row.status !== 'done' && !row.isSelf && (
              <Button
                key={`done:${row.id}`}
                plain
                dimColor
                label="✓ done"
                onPress={() => void markDone($, row.id, today)}
              />
            )}
            {Input && (
              <Button
                key={`edit:${row.id}`}
                plain
                dimColor
                label={editing ? 'cancel' : 'edit'}
                onPress={() =>
                  void update($, view, cur => ({ ...cur, editing: editing ? null : row.id }))
                }
              />
            )}
          </Box>
          {row.synopsis ? (
            <Box paddingLeft={2}>
              <Text size="footnote" dimColor wrap="truncate-end">
                {row.synopsis}
              </Text>
            </Box>
          ) : null}
          {Input && editing ? (
            <Box paddingLeft={2}>
              <Input
                key={`hours:${row.id}`}
                label="hours"
                placeholder="1.25"
                value={row.hours ? String(row.hours) : ''}
                autoFocus
                onSubmit={value => {
                  const h = Number(value)
                  if (Number.isFinite(h) && h >= 0) {
                    void saveRecord($, row.id, r => ({
                      ...r,
                      hours: Math.round(h * 4) / 4,
                      hoursSource: 'manual',
                    }))
                  }
                  void update($, view, cur => ({ ...cur, editing: null }))
                }}
              />
            </Box>
          ) : null}
        </Box>
      )
    }

    const issueRow = (issue: OverviewIssue, canClose: boolean) => (
      <Box key={`issue:${issue.key}`} gap={1} alignItems="center">
        <Text color={ISSUE_COLOR[issue.state]}>{issue.state === 'new' ? '○' : '◐'}</Text>
        {Link && issue.url ? (
          <Link href={issue.url} label={issue.key} />
        ) : (
          <Text weight="semibold" color={ISSUE_COLOR[issue.state]} mono>
            {issue.key}
          </Text>
        )}
        <Box flexGrow={1} flexShrink={1}>
          <Text wrap="truncate-end">{issue.title}</Text>
        </Box>
        {issue.priority &&
          (isHigh(issue) ? (
            badge(issue.priority, '#FFFFFF', '#EF5350')
          ) : (
            <Text size="caption" dimColor>
              {issue.priority}
            </Text>
          ))}
        {issue.owner && (
          <Text size="caption" dimColor>
            {issue.owner}
          </Text>
        )}
        {canClose && (
          <Button
            key={`issue-done:${issue.key}`}
            plain
            dimColor
            label="✓ done"
            onPress={() => void markIssueDone($, project.key, issue.key, today)}
          />
        )}
      </Box>
    )

    const barWidth = Math.max(10, cols - 6)
    const bar = counts
      ? ISSUE_BAR_ORDER.map(state => ({
          state,
          count: counts.byState[state],
          cells: counts.total ? Math.round((counts.byState[state] / counts.total) * barWidth) : 0,
        })).filter(seg => seg.count > 0)
      : []
    const barAlt = bar.map(seg => `${seg.state} ${seg.count}`).join(', ')
    const svgBar = (() => {
      const width = Math.min(560, barWidth * 7)
      const height = 14
      let x = 0
      const rects = bar.map(seg => {
        const w = counts && counts.total ? (seg.count / counts.total) * width : 0
        const rect = `<rect x="${x.toFixed(1)}" y="0" width="${(w + 0.5).toFixed(1)}" height="${height}" fill="${ISSUE_COLOR[seg.state]}"/>`
        x += w
        return rect
      })
      return (
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">` +
        `<defs><clipPath id="bar"><rect x="0" y="0" width="${width}" height="${height}" rx="${height / 2}"/></clipPath></defs>` +
        `<g clip-path="url(#bar)"><rect x="0" y="0" width="${width}" height="${height}" fill="#37474F"/>${rects.join('')}</g>` +
        '</svg>'
      )
    })()

    const showUat = !!issues && issues.some(i => /^UAT/i.test(i.key))
    const mood = moodColor(gerbil.mood)
    const pet = gerbilOf(snap, project)
    const coat = coatById(pet.coat)
    const gerbilKey = `gerbil:${project.key}`
    const editingGerbil = v.editing === gerbilKey
    const canEditGerbil = !!(Input || Select)
    const wip = roll.carried.filter(r => r.status === 'wip').length
    const blocked = roll.carried.filter(r => r.status === 'blocked').length

    return (
      <Box flexDirection="column" paddingX={1} paddingY={1} gap={1}>
        <Box flexDirection="column" gap={1}>
          <Box gap={1} alignItems="center" justifyContent="space-between">
            <Box gap={1} alignItems="center">
              <Text size="caption" weight="semibold" dimColor>
                PROJECT
              </Text>
              {Select ? (
                <Select
                  key="project"
                  options={snap.projects.map(p => ({ value: p.key, label: p.name }))}
                  value={project.key}
                  onSelect={selectProject}
                />
              ) : (
                <Text size="title" weight="bold">
                  {project.name}
                </Text>
              )}
            </Box>
            <Button
              key="refresh"
              plain
              dimColor
              label={snap.isRefreshing ? '⟳ refreshing…' : '⟳ refresh'}
              onPress={() => void refresh($, 'button')}
            />
          </Box>
          {!Select && snap.projects.length > 1 && (
            <Box gap={1} flexWrap="wrap">
              {snap.projects
                .filter(p => p.key !== project.key)
                .map(p => (
                  <Button
                    key={`project:${p.key}`}
                    plain
                    dimColor
                    label={p.name}
                    onPress={() => selectProject(p.key)}
                  />
                ))}
            </Box>
          )}
          <Box gap={1} flexWrap="wrap" alignItems="center">
            <Button
              key="quick:today"
              variant="secondary"
              label="Today's progress"
              onPress={() => void $.prompt.fill({ text: quickPrompt('today', project.name), mode: 'replace' })}
            />
            <Button
              key="quick:weekly"
              variant="secondary"
              label="Weekly report"
              onPress={() => void $.prompt.fill({ text: quickPrompt('weekly', project.name), mode: 'replace' })}
            />
            {showUat && (
              <Button
                key="quick:uat"
                variant="secondary"
                label="UAT overview"
                onPress={() => void $.prompt.fill({ text: quickPrompt('uat', project.name), mode: 'replace' })}
              />
            )}
          </Box>
        </Box>

        {card('issues', [
          heading(
            sprint ? 'Sprint' : 'Issues',
            counts ? (
              <Box gap={1} alignItems="center">
                {sprint && (
                  <Text weight="semibold" wrap="truncate-end">
                    {sprint.name}
                  </Text>
                )}
                <Text dimColor>{`${counts.total} ${sprint ? 'issues' : 'raised'}`}</Text>
                <Text dimColor>·</Text>
                <Text weight="semibold" color={counts.open ? '#FFB300' : '#7CB342'}>
                  {`${counts.open} open`}
                </Text>
                {sprint?.endDate &&
                  (Date.parse(sprint.endDate) < now ? (
                    badge(`ended ${fmtDay(sprint.endDate)}`, '#1E2A30', '#FFB74D')
                  ) : (
                    <Text size="caption" dimColor>{`ends ${fmtDay(sprint.endDate)}`}</Text>
                  ))}
              </Box>
            ) : (
              empty(
                jira?.error
                  ? `Jira ${jira.projectKey ?? ''}: ${jira.error}`
                  : jira?.projectKey
                    ? `on Jira (${jira.projectKey}) — no open sprint`
                    : project?.cwd
                      ? `on Jira — no ${opts.issuesFile} in this project`
                      : 'none — these sessions have no project folder',
              )
            ),
          ),
          ...(counts
            ? [
                Svg ? (
                  <Svg source={svgBar} alt={`Issues by state: ${barAlt}`} height={14} />
                ) : (
                  <Text>
                    {bar.map(seg => (
                      <Text color={ISSUE_COLOR[seg.state]}>{'█'.repeat(seg.cells)}</Text>
                    ))}
                  </Text>
                ),
                <Box gap={2} flexWrap="wrap">
                  {bar.map(seg => (
                    <Box gap={1}>
                      <Text color={ISSUE_COLOR[seg.state]}>■</Text>
                      <Text size="caption" dimColor>{`${seg.state} ${seg.count}`}</Text>
                    </Box>
                  ))}
                  {bar.length === 0 && empty('no issues yet')}
                </Box>,
                ...open.slice(0, 8).map(issue => issueRow(issue, !sprint)),
                counts.open > Math.min(open.length, 8) ? (
                  <Text size="caption" dimColor>
                    {`… and ${counts.open - Math.min(open.length, 8)} more open`}
                  </Text>
                ) : null,
              ]
            : []),
        ])}

        <Box justifyContent="center" alignItems="center" gap={2} paddingY={1}>
          {Svg ? (
            <Svg
              source={gerbilSvg(gerbil.mood, coat)}
              alt={`${pet.name}, the ${coat.label} gerbil PM (${gerbil.mood}): ${gerbil.line}`}
              width={96}
              height={96}
            />
          ) : (
            <Text color={mood}>{gerbilAscii(gerbil.mood)}</Text>
          )}
          <Box
            flexDirection="column"
            borderStyle="round"
            borderColor={mood}
            paddingX={1}
            width={Math.min(52, cols - 20)}
          >
            <Box gap={1} alignItems="center" justifyContent="space-between">
              <Box gap={1} alignItems="center">
                <Text weight="semibold" color={mood}>
                  {pet.name}
                </Text>
                <Text size="caption" dimColor>
                  {`${coat.label} · ${gerbil.mood}`}
                </Text>
              </Box>
              {canEditGerbil ? (
                <Button
                  key="gerbil-edit"
                  plain
                  dimColor
                  label={editingGerbil ? 'done' : 'edit'}
                  onPress={() =>
                    void update($, view, cur => ({ ...cur, editing: editingGerbil ? null : gerbilKey }))
                  }
                />
              ) : null}
            </Box>
            <Text wrap="wrap">{gerbil.line}</Text>
            {editingGerbil ? (
              <Box flexDirection="column" gap={1}>
                {Input ? (
                  <Input
                    key="gerbil-name"
                    label="name"
                    placeholder={pet.name}
                    value={pet.name}
                    autoFocus
                    onSubmit={value => {
                      if (value.trim()) void saveGerbil($, project, { name: value })
                    }}
                  />
                ) : null}
                {Select ? (
                  <Select
                    key="gerbil-coat"
                    label="coat"
                    options={COATS.map(c => ({ value: c.id, label: c.label }))}
                    value={coat.id}
                    onSelect={id => void saveGerbil($, project, { coat: id })}
                  />
                ) : null}
              </Box>
            ) : null}
          </Box>
        </Box>

        {card('today', [
          heading(
            'Today',
            <Box gap={1} alignItems="center">
              <Text weight="semibold">
                {`${roll.today.length} ${roll.today.length === 1 ? 'session' : 'sessions'}`}
              </Text>
              <Text dimColor>·</Text>
              <Text weight="semibold" tabular>
                {fmtHours(roll.hoursToday)}
              </Text>
              {roll.doneToday > 0 && badge(`${roll.doneToday} done`, '#FFFFFF', '#7CB342')}
            </Box>,
          ),
          roll.today.length === 0 ? empty('Nothing touched yet today.') : null,
          ...roll.today.map(row => sessionRow(row, false)),
        ])}

        {card('carried', [
          heading(
            'Carried forward',
            <Box gap={1} alignItems="center">
              <Text weight="semibold" color={wip ? STATUS_COLOR.wip : undefined} dimColor={!wip}>
                {`${wip} wip`}
              </Text>
              <Text dimColor>·</Text>
              <Text weight="semibold" color={blocked ? STATUS_COLOR.blocked : undefined} dimColor={!blocked}>
                {`${blocked} blocked`}
              </Text>
            </Box>,
          ),
          roll.carried.length === 0 ? empty('Nothing in progress from before today.') : null,
          ...roll.carried.map(row => sessionRow(row, true)),
          roll.rest.length > 0 ? (
            <Button
              key="show-all"
              plain
              dimColor
              label={v.showAll ? `▴ hide ${roll.rest.length} other sessions` : `▾ ${roll.rest.length} other sessions`}
              onPress={() => void update($, view, cur => ({ ...cur, showAll: !cur.showAll }))}
            />
          ) : null,
          ...(v.showAll ? roll.rest.map(row => sessionRow(row, true)) : []),
        ])}

        {card('scheduled', [
          heading(
            'Scheduled',
            <Text dimColor>{`${tasks.length} ${tasks.length === 1 ? 'task' : 'tasks'}`}</Text>,
          ),
          tasks.length === 0 ? empty('No scheduled tasks for this project.') : null,
          ...tasks.map(task => (
            <Box key={`task:${task.taskId}`} flexDirection="column">
              <Box gap={1} alignItems="center">
                <Text color={task.enabled ? '#42A5F5' : '#90A4AE'}>{task.enabled ? '◷' : '◌'}</Text>
                <Box flexGrow={1} flexShrink={1}>
                  <Text weight="medium" wrap="truncate-end">
                    {task.title}
                  </Text>
                </Box>
                <Text size="caption" dimColor>
                  {task.schedule}
                </Text>
                {task.nextRunAt && badge(`next ${fmtTime(task.nextRunAt)}`, '#FFFFFF', '#546E7A')}
              </Box>
              {task.lastRun && (
                <Box paddingLeft={2} gap={1} alignItems="center">
                  {badge(
                    task.lastRun.status,
                    task.lastRun.status === 'failed' ? '#FFFFFF' : '#1E2A30',
                    task.lastRun.status === 'failed'
                      ? '#EF5350'
                      : task.lastRun.status === 'succeeded'
                        ? '#7CB342'
                        : '#42A5F5',
                  )}
                  <Text size="caption" dimColor>
                    {fmtDay(task.lastRun.startedAt ?? task.lastRunAt)}
                  </Text>
                  <Box flexGrow={1} flexShrink={1}>
                    <Text size="footnote" dimColor wrap="truncate-end">
                      {task.lastRun.summary ?? task.lastRun.error ?? ''}
                    </Text>
                  </Box>
                </Box>
              )}
            </Box>
          )),
        ])}

        {card('clan', [
          heading(
            'Clan',
            <Text size="caption" dimColor>
              {`${snap.projects.length} ${snap.projects.length === 1 ? 'gerbil' : 'gerbils'} · one per project`}
            </Text>,
          ),
          <Box flexWrap="wrap" gap={1}>
            {snap.projects.map(p => {
              const member = gerbilOf(snap, p)
              const memberCoat = coatById(member.coat)
              const memberMood = saysFor(p).mood
              const isHere = p.key === project.key
              return (
                <Box key={`clan:${p.key}`} flexDirection="column" alignItems="center" width={13}>
                  {Svg ? (
                    <Svg
                      source={gerbilSvg(memberMood, memberCoat)}
                      alt={`${member.name}, the ${memberCoat.label} gerbil of ${p.name} (${memberMood})`}
                      width={44}
                      height={44}
                    />
                  ) : null}
                  <Button
                    key={`clan-pick:${p.key}`}
                    plain
                    dimColor={!isHere}
                    color={isHere ? moodColor(memberMood) : undefined}
                    label={member.name}
                    onPress={() => {
                      if (!isHere) selectProject(p.key)
                    }}
                  />
                  <Text size="caption" dimColor wrap="truncate-end">
                    {p.name}
                  </Text>
                </Box>
              )
            })}
          </Box>,
        ])}

        {snap.errors.length > 0 &&
          card(
            'errors',
            snap.errors.map(err => (
              <Text color="#EF5350" wrap="truncate-end">
                {err}
              </Text>
            )),
            '#EF5350',
          )}

        <Text size="caption" dimColor>
          {snap.at ? `updated ${fmtAgo(new Date(snap.at).toISOString(), now)} ago` : ''}
          {' · /overview refresh · all · done <id>'}
        </Text>
      </Box>
    )
  })
}
