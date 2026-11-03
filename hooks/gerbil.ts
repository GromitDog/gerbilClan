// The gerbil PM: what it says and how it feels, from the snapshot alone.
import type { OverviewIssue, OverviewSessionRow, OverviewTaskRow } from '../types'
import { fmtAgo, fmtHours, isHigh, openIssues } from './data'

export type Mood = 'happy' | 'busy' | 'worried' | 'sleepy' | 'idle'

export type GerbilInput = {
  projectName: string
  errors: string[]
  tasks: OverviewTaskRow[]
  /** The project's issues, or null when it has no issues file. */
  issues: OverviewIssue[] | null
  today: OverviewSessionRow[]
  carried: OverviewSessionRow[]
  hoursToday: number
  doneToday: number
  hasWeeklyReportThisWeek: boolean
  /** 0 = Sunday … 6 = Saturday. */
  weekday: number
  nowMs: number
  /** The project's open Jira sprint, if it has one. */
  sprint?: { name: string; endDate?: string; open: number }
}

export type GerbilLine = { mood: Mood; line: string }

const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`

/** First rule that applies wins. */
export function gerbilSays(i: GerbilInput): GerbilLine {
  if (i.errors.length > 0) {
    const first = i.errors[0] ?? ''
    return { mood: 'worried', line: `I couldn't reach ${first.split(':')[0]?.trim() || 'something'}.` }
  }

  const failed = i.tasks.find(t => t.lastRun?.status === 'failed')
  if (failed) {
    const why = failed.lastRun?.summary || failed.lastRun?.error
    return { mood: 'worried', line: `${failed.title} failed last time${why ? `: ${why}` : '.'}` }
  }

  if (i.sprint?.endDate && Date.parse(i.sprint.endDate) < i.nowMs) {
    return {
      mood: 'worried',
      line: `Sprint ${i.sprint.name} ended ${fmtAgo(i.sprint.endDate, i.nowMs)} ago with ${plural(i.sprint.open, 'issue')} open.`,
    }
  }

  const open = i.issues ? openIssues(i.issues) : []
  const high = open.filter(isHigh)
  if (high.length >= 3) {
    return {
      mood: 'worried',
      line: `${open.length} open, ${high.length} High — oldest is ${high[0]?.key}.`,
    }
  }

  const running = i.today.find(r => r.isRunning && !r.isSelf)
  if (running) {
    return {
      mood: 'busy',
      line: `${running.title} is running; ${plural(i.carried.length, 'more carried forward', 'more carried forward')}.`,
    }
  }

  if ((i.weekday === 5 || i.weekday === 6) && !i.hasWeeklyReportThisWeek) {
    return { mood: 'idle', line: 'No weekly status report yet this week.' }
  }

  if (i.doneToday >= 1) {
    return {
      mood: 'happy',
      line: `${plural(i.doneToday, 'thing', 'things')} done today, ${fmtHours(i.hoursToday)} logged. Nice.`,
    }
  }

  if (i.today.length === 0 && i.carried.length > 0) {
    return {
      mood: 'sleepy',
      line: `Quiet so far. ${plural(i.carried.length, 'session')} carried forward.`,
    }
  }

  const wip = i.today.filter(r => r.status === 'wip').length + i.carried.length
  const issuesPart = i.issues ? `${open.length} open, ` : ''
  return { mood: 'idle', line: `${issuesPart}${plural(wip, 'session')} in progress on ${i.projectName}.` }
}
