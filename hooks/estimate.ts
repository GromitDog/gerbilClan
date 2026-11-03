// The synopsis + effort estimate: what the model is asked, and how its
// answer is read. The call itself is made in register.tsx.

export const ESTIMATE_SYSTEM = [
  'You summarise one Claude Code session for a project overview pane.',
  'Answer with one JSON object only, no prose, no code fence:',
  '{"synopsis": "...", "hours": 1.25, "status": "wip"}',
  'synopsis: at most 12 words, what the session is doing or did; no trailing full stop.',
  "hours: the person's own working time this session stands for, in 0.25 steps, from 0.25 to 8;",
  'size it from what was produced, not from how long the transcript is.',
  'status: "done" when the work was finished and nothing is left to do,',
  '"blocked" when it waits on someone or something, otherwise "wip".',
].join('\n')

export const TRANSCRIPT_CHARS = 6000

export function buildEstimatePrompt(title: string, project: string, transcript: string): string {
  const tail = transcript.length > TRANSCRIPT_CHARS ? '…' + transcript.slice(-TRANSCRIPT_CHARS) : transcript
  return `Project: ${project}\nSession title: ${title}\n\nRecent transcript (newest last):\n${tail}`
}

export type Estimate = { synopsis: string; hours: number; status: 'wip' | 'done' | 'blocked' }

/** The first JSON object in the reply, checked field by field; null when there is none. */
export function parseEstimate(text: string): Estimate | null {
  const match = text.match(/\{[\s\S]*?\}/)
  if (!match) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(match[0])
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const o = parsed as Record<string, unknown>
  const synopsis = typeof o.synopsis === 'string' ? o.synopsis.trim().replace(/\.$/, '').slice(0, 90) : ''
  const raw = typeof o.hours === 'number' ? o.hours : Number(o.hours)
  const hours = Number.isFinite(raw) ? Math.min(24, Math.max(0, Math.round(raw * 4) / 4)) : 0
  const status = o.status === 'done' || o.status === 'blocked' ? o.status : 'wip'
  if (!synopsis && !hours) return null
  return { synopsis, hours, status }
}
