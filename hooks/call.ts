// Calling on a gerbil: which one a prompt names, and what Claude is then told.
// A gerbil stands for its project, so calling one ("Hey, Butterscotch", or a
// click in the clan) names the environment for the work that follows: the
// project's folder. Pure: no `$`, nothing async.
import { ownWords } from './data'

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Words that greet: with one before it, a gerbil's name is a call wherever it
 * stands in the prompt. Not `ok`: "ok, scout the repo" is plain English.
 */
const GREETING = '(?:hey|hi|hiya|hello|yo|oi|psst|dear)'
/** The name must end there: `Scout` is not called by `Scouting`. */
const END = '(?![\\p{L}\\p{N}_])'

export type GerbilCall = {
  /** The gerbil's name as the clan spells it. */
  name: string
}

/**
 * The gerbil a prompt calls on, if it calls one:
 *
 * - `@Butterscotch`, anywhere in the prompt;
 * - greeted, anywhere in the prompt: `Hey, Butterscotch`, `hi scout: …`;
 * - the bare name at the start, set off from the task: `Butterscotch, …`,
 *   `Scout: …`, `Digger - …`, or the name alone.
 *
 * A bare name that just begins a sentence is no call (`Scout the repo for
 * dead code`), since a gerbil's name may be an ordinary word.
 *
 * Only the person's own words are read. The desktop app hands a prompt over
 * with its reminders in front (a new session's first prompt sits behind a
 * long one) and a paste in a block of its own: "the start" is the start of
 * what was typed, and a name inside a reminder or a paste calls nobody.
 */
export function calledGerbil(text: string, names: readonly string[]): GerbilCall | null {
  const said = ownWords(text)
  const seen = new Set<string>()
  const clan = names
    .map(n => n.trim())
    .filter(n => n && !seen.has(n.toLowerCase()) && !!seen.add(n.toLowerCase()))
    .sort((a, b) => b.length - a.length)
  let best: { name: string; at: number } | null = null
  for (const name of clan) {
    const n = escapeRegExp(name)
    if (new RegExp(`^${n}${END}(?:\\s*[,:;!\\u2013\\u2014]\\s*|\\s+-\\s+|\\s*$)`, 'iu').test(said)) return { name }
    // `@name`, or a greeting and the name, wherever they stand (an address such as amy@scout.gg is neither).
    const hit = new RegExp(`(^|[^\\p{L}\\p{N}_@.])(?:@${n}|${GREETING}[\\s,]+@?${n})${END}`, 'iu').exec(said)
    if (hit && (!best || hit.index < best.at)) best = { name, at: hit.index }
  }
  return best ? { name: best.name } : null
}

const segments = (path: string) => path.replace(/\\/g, '/').replace(/\/+$/, '').split('/').filter(Boolean)

/** Whether `path` is `folder` or lies inside it, however the two spell their slashes and case. */
export function isWithin(path: string, folder: string): boolean {
  const p = segments(path)
  const f = segments(folder)
  return f.length > 0 && p.length >= f.length && f.every((seg, i) => seg.toLowerCase() === p[i]?.toLowerCase())
}

export type EnvironmentCall = {
  /** The gerbil's name. */
  gerbil: string
  /** The project it stands for; an empty `cwd` is the gerbil of the sessions with no folder. */
  project: { name: string; cwd: string }
  /** Where the session is working now. */
  sessionCwd: string
  /** `named`: called by name in the prompt itself; `picked`: clicked in the pane before it. */
  how: 'named' | 'picked'
}

/**
 * What Claude reads beside the prompt (the person never sees it) when a gerbil
 * goes on duty: which project that is, where its folder is, and how to get there.
 */
export function environmentNote(call: EnvironmentCall): string {
  const { gerbil, project, sessionCwd, how } = call
  const lead =
    how === 'named'
      ? `The user called on ${gerbil} by name`
      : `Before sending this message the user picked ${gerbil} in their project overview pane`
  if (!project.cwd) {
    return [
      `[project-overview] ${lead}. ${gerbil} is the gerbil that looks after sessions with no project folder,`,
      `so this names no project: do what they ask in this session's own folder (${sessionCwd}).`,
      how === 'named' ? `The greeting only names the gerbil: it is not part of the task and needs no answer of its own.` : '',
    ]
      .filter(Boolean)
      .join(' ')
  }
  // The folder spelled as this machine spells paths: a project's key keeps forward slashes.
  const folder = sessionCwd.includes('\\') ? project.cwd.replace(/\//g, '\\') : project.cwd
  const where = isWithin(sessionCwd, project.cwd)
    ? `This session is already working in that folder (${sessionCwd}), so do the task here.`
    : [
        `This session's working directory is ${sessionCwd}, which is not in that project.`,
        `Before reading or changing anything for the task, move the session into the project folder with the change_directory tool`,
        `(mcp__ccd_directory__change_directory; load it through ToolSearch if it is deferred), passing that folder's absolute path:`,
        `calling the gerbil is the user asking for that move.`,
        `Where the session has no such tool, work with absolute paths under the folder instead.`,
        `Where the move is refused (auto mode's permission check can refuse it), do not stop there: read what the task needs by absolute path under the folder, as far as the session is allowed to, change no file there,`,
        `and tell the user the move was refused and that a permission rule for mcp__ccd_directory__change_directory in their Claude settings lets it through.`,
      ].join(' ')
  const tail =
    how === 'named'
      ? `The greeting ("Hey, ${gerbil}") only names the environment: it is not part of the task and needs no answer of its own.`
      : `If the message plainly continues earlier work that belongs to another project, finish that where it was, and say that ${gerbil}'s project is ready for whatever comes next.`
  return [
    `[project-overview] ${lead}. ${gerbil} is the gerbil PM of the project "${project.name}", and in the user's setup the gerbil on duty names the environment for the work they ask for:`,
    `the project folder ${folder}.`,
    where,
    tail,
  ].join(' ')
}
