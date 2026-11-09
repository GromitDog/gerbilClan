// The project-overview mod's state contract: what it keeps in `$.state` for
// the pane to draw, and the record shapes those values are built from.

export type OverviewStatus = 'planned' | 'wip' | 'blocked' | 'done'

export type OverviewProject = {
  /** Lower-cased, forward-slashed project folder: the identity. */
  key: string
  /** The folder's name, as shown. */
  name: string
  /** The project folder as the session reported it. */
  cwd: string
  /** Newest `lastActivityAt` among its sessions (ms). */
  lastActivityMs: number
}

export type OverviewSessionRow = {
  id: string
  title: string
  project: string
  cwd: string
  isSelf: boolean
  isRunning: boolean
  isArchived: boolean
  pinned: boolean
  lastActivityAt: string
  link?: string
  status: OverviewStatus
  /** `manual`: picked in the pane or by command, and kept; `model`: the estimate's guess; `none`: never set. */
  statusSource: 'model' | 'manual' | 'none'
  synopsis: string
  hours: number
  /** `tracked`: counted by the session's own clock while it ran with the mod; kept over the estimate's. */
  hoursSource: 'model' | 'manual' | 'tracked' | 'none'
  estimatedFor?: string
  doneOn?: string
  archived?: boolean
  issueKey?: string
}

export type OverviewIssueState = 'new' | 'wip' | 'testing' | 'closed'

export type OverviewIssue = {
  key: string
  title: string
  state: OverviewIssueState
  priority?: string
  owner?: string
  sessionId?: string
  openedOn?: string
  closedOn?: string
  /** A web link to the issue (Jira); the pane draws the key as a link. */
  url?: string
}

/** The open sprint of a Jira project: counts, and how many of its open issues the snapshot lists. */
export type OverviewSprint = {
  name: string
  endDate?: string
  total: number
  done: number
  listed: number
}

export type OverviewIssues = {
  /**
   * `file`: read from the issues file; `jira`: a Jira project (named by the file or
   * by the `jiraProjects` setting), `issues` then holds its open sprint's open
   * issues; `none`: no file and no Jira project.
   */
  kind: 'file' | 'jira' | 'none'
  path: string
  issues: OverviewIssue[]
  jira?: { projectKey?: string; cloudId?: string; sprint?: OverviewSprint; error?: string }
}

export type OverviewTaskRun = {
  sessionId: string
  status: 'running' | 'succeeded' | 'failed'
  startedAt?: string
  summary?: string
  error?: string
}

export type OverviewTaskRow = {
  taskId: string
  title: string
  schedule: string
  enabled: boolean
  nextRunAt?: string
  lastRunAt?: string
  /** Project keys this task belongs to (by its runs' sessions, or its SKILL.md naming the folder). */
  projects: string[]
  lastRun?: OverviewTaskRun
}

export type OverviewSnapshot = {
  /** When the snapshot was taken (ms); 0 before the first refresh. */
  at: number
  isRefreshing: boolean
  projects: OverviewProject[]
  sessions: OverviewSessionRow[]
  tasks: OverviewTaskRow[]
  /** By project key. */
  issues: Record<string, OverviewIssues>
  errors: string[]
  /** The session id whose synopsis is being estimated now, if any. */
  estimating: string | null
  /** Each project's gerbil PM, by project key. */
  gerbils: Record<string, OverviewGerbil>
  /** A quiet line for the foot of the pane: what a refresh could not read, and what would let it. Never an error. */
  hint: string | null
}

/**
 * A project's gerbil: its name and coat (an id from hooks/coats.ts). `manual`:
 * picked in the pane or by command, and kept; `config`: from the `gerbils`
 * setting; `auto`: dealt out when the project first appeared.
 */
export type OverviewGerbil = {
  name: string
  coat: string
  source: 'manual' | 'config' | 'auto'
}

export type OverviewView = {
  /** Selected project key; null until the first refresh picks one. */
  project: string | null
  /**
   * What is being edited: a session row's id (its hours), `status:<row id>`
   * (its status, the picker open), or `gerbil:<project key>` (that project's
   * gerbil's name and coat); null for nothing.
   */
  editing: string | null
  /** Show every session of the project, not only today's and carried-forward ones. */
  showAll: boolean
  /**
   * The project whose gerbil is on duty in this session: the one last clicked
   * in the clan or called by name in a prompt. Its folder is the environment
   * Claude is told to work in. Null until one is called.
   */
  called: string | null
  /** The project Claude was last told of; differs from `called` while a click waits for the next prompt. */
  told: string | null
  /** Whether the estimate may set a session's status. False: a status is only ever what was picked. */
  autoStatus: boolean
}

/** This session's own clock: the time it has been worked in, counted as it passes. */
export type OverviewClock = {
  /** Time counted up to `beatAt`, in milliseconds. */
  ms: number
  /** The last sign of life (a prompt, a turn starting or ending, a minute of a running turn); 0 before the first. */
  beatAt: number
  /** A turn is running: the clock counts without a pause. */
  isTurnRunning: boolean
  /** Whether the time an earlier run of this session counted has been added back (once per run). */
  isRestored: boolean
  /** Bumped each minute, so the pane's times are drawn again. */
  tick: number
}

declare module 'claude-code' {
  interface PluginState {
    'project-overview': {
      snapshot: Shaped<OverviewSnapshot>
      view: Shaped<OverviewView>
      clock: Shaped<OverviewClock>
    }
  }
}
