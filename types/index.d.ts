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
  statusSource: 'model' | 'manual' | 'none'
  synopsis: string
  hours: number
  hoursSource: 'model' | 'manual' | 'none'
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
}

export type OverviewView = {
  /** Selected project key; null until the first refresh picks one. */
  project: string | null
  /** The session row whose hours are being edited, if any. */
  editing: string | null
  /** Show every session of the project, not only today's and carried-forward ones. */
  showAll: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'project-overview': {
      snapshot: Shaped<OverviewSnapshot>
      view: Shaped<OverviewView>
    }
  }
}
