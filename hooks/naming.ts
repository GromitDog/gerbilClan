// A name for a new project's gerbil: what the model is asked, and how its answer
// is read. The call itself is made in register.tsx, on the same route as the
// session estimates ($.model.complete). Pure: no `$`, nothing async.

/** The model asked for a name: Haiku (an alias, so it follows the newest Haiku, claude-haiku-5-5 now). */
export const NAME_MODEL = 'haiku'

export const NAME_SYSTEM = [
  'You name the robotic gerbil that acts as project manager for one software project, in a project overview pane.',
  'Answer with one JSON object only, no prose, no code fence: {"name": "..."}',
  'name: one word, 3 to 10 letters, short and friendly, easy to say and to type in a greeting ("Hey, <name>").',
  'Let it fit the project: its subject, its purpose or its spirit, but not its folder name itself.',
  'Never one of the names already taken, and nothing rude, branded or a real person.',
].join('\n')

/** How much of the README or CLAUDE.md the model reads. */
export const ABOUT_CHARS = 1500

export type NameContext = {
  /** The project's folder name. */
  folder: string
  /** The start of its README.md or CLAUDE.md, if it has one. */
  about?: string
  /** Its recent session titles, newest first. */
  titles?: readonly string[]
  /** Every gerbil name already in the clan. */
  taken: readonly string[]
}

export function buildNamePrompt(c: NameContext): string {
  const about = (c.about ?? '').trim()
  const titles = (c.titles ?? []).filter(Boolean).slice(0, 8)
  return [
    `Project folder: ${c.folder}`,
    about ? `\nFrom its README / CLAUDE.md:\n${about.slice(0, ABOUT_CHARS)}${about.length > ABOUT_CHARS ? '…' : ''}` : '',
    titles.length ? `\nRecent session titles:\n${titles.map(t => `- ${t}`).join('\n')}` : '',
    `\nNames already taken (do not use): ${c.taken.length ? c.taken.join(', ') : 'none'}`,
  ]
    .filter(Boolean)
    .join('\n')
}

const WORD = /^[A-Za-z][A-Za-z'-]{1,13}$/

/**
 * The name in the model's reply: `{"name": "Rivet"}`, or a reply of that one
 * word alone. One word of letters, capitalised; null when it is missing, too long,
 * the folder's own name, or taken already (any case).
 */
export function parseName(text: string, taken: readonly string[], folder = ''): string | null {
  let raw = ''
  const match = text.match(/\{[\s\S]*?\}/)
  if (match) {
    try {
      const o = JSON.parse(match[0]) as { name?: unknown }
      if (typeof o.name === 'string') raw = o.name
    } catch {
      // Read the words instead.
    }
  }
  // No JSON: only a reply that is one word and nothing else.
  if (!raw && !match) raw = text.replace(/["`*_]/g, '').trim()
  const word = raw.trim().replace(/[.!,]+$/, '')
  if (!WORD.test(word)) return null
  const name = word[0]!.toUpperCase() + word.slice(1)
  const lower = name.toLowerCase()
  if (taken.some(t => t.trim().toLowerCase() === lower)) return null
  if (folder && folder.toLowerCase() === lower) return null
  return name
}

/**
 * What a new gerbil is called while its name is being thought of, or where no
 * model could be asked: its folder's name, first word, capitalised.
 */
export function placeholderName(folder: string): string {
  const word = folder.split(/[^A-Za-z0-9]+/).find(Boolean) ?? ''
  if (!word) return 'Gerbil'
  return (word[0]!.toUpperCase() + word.slice(1)).slice(0, 14)
}
