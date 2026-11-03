// Pure helpers: no `$`, nothing async. Everything the pane computes from the
// app's answers lives here so a test can check it without a surface.
import type {
  OverviewIssue,
  OverviewIssueState,
  OverviewIssues,
  OverviewProject,
  OverviewSessionRow,
  OverviewSprint,
  OverviewStatus,
  OverviewTaskRow,
} from '../types'

// What the app's MCP servers answer, as far as the mod reads them.
export type RawSession = {
  sessionId: string
  title?: string
  cwd?: string
  isArchived?: boolean
  isRunning?: boolean
  lastActivityAt?: string
  pinned?: boolean
  link?: string
}

export type RawTask = {
  taskId: string
  title?: string
  description?: string
  path?: string
  schedule?: string
  enabled?: boolean
  nextRunAt?: string
  lastRunAt?: string
}

export type RawRun = {
  session_id: string
  status?: string
  started_at?: string
  summary?: string
  error?: string
}

// What the mod keeps per session in `$.store` under `records`.
export type SessionRecord = {
  status: OverviewStatus
  statusSource: 'model' | 'manual' | 'none'
  synopsis: string
  hours: number
  hoursSource: 'model' | 'manual' | 'none'
  estimatedFor?: string
  doneOn?: string
  archived?: boolean
  issueKey?: string
  /** The row as last seen, kept when marked done: an archived session may leave the app's list. */
  kept?: { title: string; project: string; cwd: string; lastActivityAt: string; link?: string }
}

export type Records = Record<string, SessionRecord>

export const EMPTY_RECORD: SessionRecord = {
  status: 'planned',
  statusSource: 'none',
  synopsis: '',
  hours: 0,
  hoursSource: 'none',
}

const pad2 = (n: number) => String(n).padStart(2, '0')

/** Local calendar day of `ms` as `YYYY-MM-DD`: the boundary every rollover rule uses. */
export function dayKey(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

export function dayOf(iso: string | undefined): string | null {
  const ms = iso ? Date.parse(iso) : NaN
  return Number.isNaN(ms) ? null : dayKey(ms)
}

/** The day before `key`. */
export function previousDay(key: string): string {
  const [y = 1970, m = 1, d = 1] = key.split('-').map(Number)
  return dayKey(new Date(y, m - 1, d - 1).getTime())
}

/** Monday 00:00 of the week `ms` falls in, local time. */
export function startOfWeek(ms: number): number {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d.getTime()
}

function segments(path: string): string[] {
  return path.replace(/\\/g, '/').replace(/\/+$/, '').split('/').filter(Boolean)
}

export const NO_FOLDER = 'no-folder'

/**
 * The projects roots a setting names, separated by `;` or new lines; a root
 * starting with `~` is under the home folder. Never empty: with no home
 * folder known, the roots that need one are left out, and the text itself
 * stands if nothing is left.
 */
export function parseRoots(text: string, home: string | undefined): string[] {
  const roots = text
    .split(/[;\n]/)
    .map(s => s.trim())
    .filter(Boolean)
    .map(r => {
      if (r !== '~' && !r.startsWith('~/') && !r.startsWith('~\\')) return r
      return home ? home.replace(/[\\/]+$/, '') + r.slice(1) : ''
    })
    .filter(Boolean)
  return roots.length ? roots : [text.trim()]
}

/** The root a cwd lies under, else the first: `projectOf` groups by it. */
export function rootFor(cwd: string, roots: readonly string[]): string {
  return roots.find(r => isUnderRoot(cwd, r)) ?? roots[0] ?? ''
}

/** The app's scratch workspaces ("No folder" sessions) form one pseudo-project with no cwd. */
export function isScratchFolder(cwd: string): boolean {
  return segments(cwd).some(seg => seg.toLowerCase() === 'scratch-workspaces')
}

/** Whether `cwd` lies under the projects root (so its first folder there is a project). */
export function isUnderRoot(cwd: string, root: string): boolean {
  const p = segments(cwd)
  const r = segments(root)
  return p.length > r.length && r.every((seg, i) => seg.toLowerCase() === p[i]?.toLowerCase())
}

/** Which project a cwd belongs to: the first folder under `root`, else the folder itself. */
export function projectOf(cwd: string, root: string): Omit<OverviewProject, 'lastActivityMs'> {
  if (!cwd || isScratchFolder(cwd)) return { key: NO_FOLDER, name: 'No folder', cwd: '' }
  const p = segments(cwd)
  const r = segments(root)
  const own = isUnderRoot(cwd, root) ? p.slice(0, r.length + 1) : p
  const folder = own.join('/')
  return { key: folder.toLowerCase(), name: own[own.length - 1] ?? cwd, cwd: folder }
}

export function joinPath(folder: string, relative: string): string {
  const sep = folder.includes('\\') ? '\\' : '/'
  return folder.replace(/[\\/]+$/, '') + sep + relative.replace(/[\\/]/g, sep)
}

export function applyRecord(row: OverviewSessionRow, rec: SessionRecord): OverviewSessionRow {
  return {
    ...row,
    status: rec.status,
    statusSource: rec.statusSource,
    synopsis: rec.synopsis,
    hours: rec.hours,
    hoursSource: rec.hoursSource,
    estimatedFor: rec.estimatedFor,
    doneOn: rec.doneOn,
    archived: rec.archived,
    issueKey: rec.issueKey,
  }
}

export const ISSUE_STATES: OverviewIssueState[] = ['new', 'wip', 'testing', 'closed']
export const ISSUE_BAR_ORDER: OverviewIssueState[] = ['closed', 'testing', 'wip', 'new']
export const ISSUE_COLOR: Record<OverviewIssueState, string> = {
  closed: '#7CB342',
  testing: '#42A5F5',
  wip: '#FFB300',
  new: '#B0BEC5',
}

const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined)

/** Reads an issues file. Throws on malformed JSON; a file holding only `jira` names a Jira project. */
export function parseIssuesFile(text: string, path: string): OverviewIssues {
  const data = JSON.parse(text) as { issues?: unknown; jira?: unknown }
  const jira =
    data.jira && typeof data.jira === 'object' ? (data.jira as OverviewIssues['jira']) : undefined
  if (!Array.isArray(data.issues)) return { kind: jira ? 'jira' : 'file', path, issues: [], jira }
  const issues: OverviewIssue[] = []
  for (const raw of data.issues as Record<string, unknown>[]) {
    if (!raw || typeof raw.key !== 'string') continue
    const state = ISSUE_STATES.includes(raw.state as OverviewIssueState)
      ? (raw.state as OverviewIssueState)
      : 'new'
    issues.push({
      key: raw.key,
      title: typeof raw.title === 'string' ? raw.title : '',
      state,
      priority: str(raw.priority),
      owner: str(raw.owner),
      sessionId: str(raw.sessionId),
      openedOn: str(raw.openedOn),
      closedOn: str(raw.closedOn),
    })
  }
  return { kind: 'file', path, issues, jira }
}

/** The file written back: every other field kept, `issues` replaced. */
export function serializeIssuesFile(text: string, issues: OverviewIssue[]): string {
  const data = JSON.parse(text) as Record<string, unknown>
  const clean = issues.map(i =>
    Object.fromEntries(Object.entries(i).filter(([, v]) => v !== undefined)),
  )
  return JSON.stringify({ ...data, issues: clean }, null, 2) + '\n'
}

export type IssueCounts = {
  total: number
  open: number
  byState: Record<OverviewIssueState, number>
}

export function issueCounts(issues: OverviewIssue[]): IssueCounts {
  const byState: Record<OverviewIssueState, number> = { new: 0, wip: 0, testing: 0, closed: 0 }
  for (const i of issues) byState[i.state] += 1
  return { total: issues.length, open: issues.length - byState.closed, byState }
}

const PRIORITY_RANK: Record<string, number> = {
  critical: 0,
  highest: 0,
  high: 0,
  medium: 1,
  low: 2,
  lowest: 2,
}

export function priorityRank(priority: string | undefined): number {
  return PRIORITY_RANK[(priority ?? '').toLowerCase()] ?? 3
}

export function isHigh(issue: OverviewIssue): boolean {
  return priorityRank(issue.priority) === 0
}

/** Open issues, highest priority first, then oldest, then by key. */
export function openIssues(issues: OverviewIssue[]): OverviewIssue[] {
  return issues
    .filter(i => i.state !== 'closed')
    .sort(
      (a, b) =>
        priorityRank(a.priority) - priorityRank(b.priority) ||
        (a.openedOn ?? '9999').localeCompare(b.openedOn ?? '9999') ||
        a.key.localeCompare(b.key, undefined, { numeric: true }),
    )
}

/** A Jira project key per project folder name: `bragi=BRAG, seeker=SKR`. */
export function parseJiraMap(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of text.split(/[,;\n]/)) {
    const [name, key] = part.split('=').map(s => s.trim())
    if (name && key) out[name.toLowerCase()] = key.toUpperCase()
  }
  return out
}

/** What the Jira connector's `searchJiraIssuesUsingJql` answers, as far as the mod reads it. */
export type RawJiraSearch = {
  issues?: {
    totalCount?: number
    nodes?: Array<{
      key?: string
      webUrl?: string
      fields?: {
        summary?: string
        status?: { name?: string; statusCategory?: { key?: string } }
        priority?: { name?: string }
        assignee?: { displayName?: string } | null
        /** The Sprint field: every sprint the issue has been in, the open one `active`. */
        customfield_10020?: Array<{ name?: string; state?: string; endDate?: string }>
      }
    }>
  }
}

/** Jira's status category as an issue state; a testing-flavoured status name is `testing`. */
export function stateFromJira(statusName: string | undefined, category: string | undefined): OverviewIssueState {
  if (category === 'done') return 'closed'
  if (category === 'new') return 'new'
  return /test|review|qa|uat|verif/i.test(statusName ?? '') ? 'testing' : 'wip'
}

export type JiraPage = {
  issues: OverviewIssue[]
  /** The query's total, when the answer carries one; else how many it listed. */
  count: number
  sprint?: { name: string; endDate?: string }
}

/** The issues of a search answer, and the active sprint they name. */
export function parseJiraSearch(raw: RawJiraSearch): JiraPage {
  const issues: OverviewIssue[] = []
  let sprint: JiraPage['sprint']
  for (const n of raw.issues?.nodes ?? []) {
    if (!n.key) continue
    const f = n.fields ?? {}
    issues.push({
      key: n.key,
      title: f.summary ?? '',
      state: stateFromJira(f.status?.name, f.status?.statusCategory?.key),
      priority: str(f.priority?.name),
      owner: str(f.assignee?.displayName),
      url: str(n.webUrl),
    })
    if (!sprint) {
      const sprints = f.customfield_10020 ?? []
      const active = sprints.find(s => s.state === 'active') ?? sprints[0]
      if (active?.name) sprint = { name: active.name, endDate: str(active.endDate) }
    }
  }
  return { issues, count: raw.issues?.totalCount ?? issues.length, sprint }
}

/** Counts for a sprint: its done issues are a number, its open ones a (possibly partial) list. */
export function sprintCounts(sprint: OverviewSprint, listed: OverviewIssue[]): IssueCounts {
  const byState: Record<OverviewIssueState, number> = { new: 0, wip: 0, testing: 0, closed: sprint.done }
  let shown = 0
  for (const i of listed) {
    if (i.state === 'closed') continue
    byState[i.state] += 1
    shown += 1
  }
  const open = Math.max(sprint.total - sprint.done, shown)
  byState.new += open - shown
  return { total: Math.max(sprint.total, open + sprint.done), open, byState }
}

export type Rollup = {
  today: OverviewSessionRow[]
  carried: OverviewSessionRow[]
  rest: OverviewSessionRow[]
  hoursToday: number
  doneToday: number
}

const byRecent = (a: OverviewSessionRow, b: OverviewSessionRow) =>
  (Date.parse(b.lastActivityAt) || 0) - (Date.parse(a.lastActivityAt) || 0)

/**
 * The day's view of one project's sessions: touched or marked done today go
 * in `today`; untouched work in progress is `carried`; anything else that is
 * not archived or done is `rest` (shown only under "all"). Done before today
 * is gone, which is the rollover.
 */
export function rollup(rows: OverviewSessionRow[], today: string): Rollup {
  const out: Rollup = { today: [], carried: [], rest: [], hoursToday: 0, doneToday: 0 }
  for (const r of rows) {
    const doneToday = r.doneOn === today
    const touched = dayOf(r.lastActivityAt) === today
    if (touched || doneToday) {
      if (r.isArchived && !doneToday) continue
      out.today.push(r)
      out.hoursToday += r.hours
      if (r.status === 'done') out.doneToday += 1
      continue
    }
    if (r.isArchived || r.status === 'done') continue
    if (r.status === 'wip' || r.status === 'blocked') out.carried.push(r)
    else out.rest.push(r)
  }
  out.today.sort(byRecent)
  out.carried.sort(byRecent)
  out.rest.sort(byRecent)
  out.hoursToday = Math.round(out.hoursToday * 4) / 4
  return out
}

export function fmtHours(h: number): string {
  if (!h) return '–'
  const q = Math.round(h * 4) / 4
  return `${q.toFixed(2).replace(/\.?0+$/, '')}h`
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function fmtDay(iso: string | undefined): string {
  const ms = iso ? Date.parse(iso) : NaN
  if (Number.isNaN(ms)) return '?'
  const d = new Date(ms)
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`
}

export function fmtTime(iso: string | undefined): string {
  const ms = iso ? Date.parse(iso) : NaN
  if (Number.isNaN(ms)) return '?'
  const d = new Date(ms)
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

/** `3m`, `2h`, `yesterday`, `4d`: how long since `iso`. */
export function fmtAgo(iso: string | undefined, nowMs: number): string {
  const ms = iso ? Date.parse(iso) : NaN
  if (Number.isNaN(ms)) return ''
  const mins = Math.max(0, Math.round((nowMs - ms) / 60_000))
  if (mins < 60) return `${mins}m`
  const hours = Math.round(mins / 60)
  if (hours < 24 && dayKey(ms) === dayKey(nowMs)) return `${hours}h`
  const days = Math.round((startOfDay(nowMs) - startOfDay(ms)) / 86_400_000)
  return days <= 1 ? 'yesterday' : `${days}d`
}

function startOfDay(ms: number): number {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

const normFolder = (p: string) => segments(p).join('/').toLowerCase()

/**
 * Ties each scheduled task to projects: by the project of the sessions its
 * runs started, and by its SKILL.md naming a project folder.
 */
export function tieTasks(
  tasks: RawTask[],
  runsByTask: Record<string, RawRun[]>,
  skillTexts: Record<string, string>,
  sessionProject: Record<string, string>,
  projects: Pick<OverviewProject, 'key' | 'cwd'>[],
): OverviewTaskRow[] {
  return tasks.map(t => {
    const keys = new Set<string>()
    const runs = runsByTask[t.taskId] ?? []
    for (const run of runs) {
      const key = sessionProject[run.session_id]
      if (key) keys.add(key)
    }
    const text = (skillTexts[t.taskId] ?? '').replace(/\\/g, '/').toLowerCase()
    for (const p of projects) if (p.cwd && text.includes(normFolder(p.cwd))) keys.add(p.key)
    const last = runs[0]
    return {
      taskId: t.taskId,
      title: t.title ?? t.taskId,
      schedule: t.schedule ?? '',
      enabled: t.enabled !== false,
      nextRunAt: t.nextRunAt,
      lastRunAt: t.lastRunAt,
      projects: [...keys],
      lastRun: last
        ? {
            sessionId: last.session_id,
            status:
              last.status === 'succeeded' || last.status === 'failed' || last.status === 'running'
                ? last.status
                : 'running',
            startedAt: last.started_at,
            summary: last.summary,
            error: last.error,
          }
        : undefined,
    }
  })
}

/** The text blocks of an MCP result, joined. */
export function mcpText(result: { content: { type: string; text?: string }[] }): string {
  return result.content
    .filter(b => b.type === 'text')
    .map(b => b.text ?? '')
    .join('\n')
    .trim()
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
