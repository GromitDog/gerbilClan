// Each project has its own gerbil: a name, and a coat after the colours gerbil
// breeders name. The drawing takes its colours from the coat; the names and
// coats come from the `gerbils` setting, or from what Amy picks in the pane,
// or are dealt out (no two projects alike) and then kept.
import type { OverviewGerbil } from '../types'

export type Coat = {
  id: string
  /** As a breeder says it. */
  label: string
  /** Top coat: head, body and ears. */
  fur: string
  /** Outline, ticking and the tail cable. */
  dark: string
  /** Helmet and body seams. */
  light: string
  /** The underside: the tummy, muzzle, paws and hind feet unless a point colours them. */
  belly: string
  /**
   * The plate the belly screen sits on: a steel bezel on the tummy (light steel if
   * not set), or the rounded plate of a coat with no tummy (the belly colour if not set).
   */
  plate?: string
  /** Pointed coats (Burmese, Siamese): darker nose, ears, feet and tail. */
  muzzle?: string
  ears?: string
  feet?: string
  tail?: string
  /** The mouth line, where the usual ink would not show on the muzzle. */
  mouth?: string
  /** Agouti-type coats: dark tips on the hairs, drawn as short strokes at this opacity. */
  ticking?: number
  /** Ticking stroke colour, if not the outline colour. */
  tick?: string
  /** Red-eyed coats: ruby goggle glass and a pink glow. */
  ruby?: boolean
  /**
   * False for a self-coloured coat, whose underside is the same colour as its back
   * (black, slate, lilac, dove, Burmese, Siamese and their pied forms): no lighter
   * tummy is drawn. Agouti-type coats (golden agouti, argente, nutmeg, honey, polar
   * fox) show theirs.
   */
  tummy?: false
  /** White patches (pied): a blaze down the face and spots on the body. */
  patches?: string
  /** How much white a pied coat has: `spotted` (the default) or `mottled`, with more spots. */
  pattern?: 'spotted' | 'mottled'
}

const WHITE = '#FAF8F4'

export const COATS: readonly Coat[] = [
  { id: 'agouti', label: 'golden agouti', fur: '#C9A064', dark: '#7E5A2E', light: '#E9CF99', belly: '#F7EEDC', ticking: 0.7 },
  { id: 'black', label: 'black', fur: '#2E2E33', dark: '#0F0F12', light: '#4C4C55', belly: '#45454D', plate: '#CFD8DC', muzzle: '#5A5A63', mouth: '#0A0A0C', tummy: false },
  { id: 'argente-golden', label: 'argente golden', fur: '#E3A35E', dark: '#A4652B', light: '#F4CB92', belly: '#FFFDF8', ticking: 0.4, ruby: true },
  { id: 'cream', label: 'argente cream', fur: '#EDD5AA', dark: '#B08A5C', light: '#FAEEDB', belly: '#FFFFFF', ruby: true },
  { id: 'bew', label: 'black-eyed white', fur: '#FAF8F4', dark: '#8E877B', light: '#FFFFFF', belly: '#FFFFFF' },
  { id: 'dove', label: 'dove', fur: '#CBC4CF', dark: '#8A8290', light: '#E3DEE6', belly: '#F3F0F4', ruby: true, tummy: false },
  { id: 'lilac', label: 'lilac', fur: '#9F93A8', dark: '#66596E', light: '#C0B5C7', belly: '#B9AFC0', ruby: true, tummy: false },
  {
    id: 'burmese', label: 'Burmese', fur: '#5B3F2F', dark: '#2B1B12', light: '#7B5A45', belly: '#6E4E3B',
    plate: '#C9B8A8', muzzle: '#3E2A1F', ears: '#2E1D14', feet: '#3E2A1F', tail: '#2E1D14', mouth: '#120A06', tummy: false,
  },
  {
    id: 'siamese', label: 'Siamese', fur: '#E9D5BA', dark: '#9A7A5E', light: '#F4E6D3', belly: '#F3E6D4',
    muzzle: '#8A6448', ears: '#6B4A36', feet: '#7A5640', tail: '#6B4A36', mouth: '#2A1A10', tummy: false,
  },
  { id: 'slate', label: 'slate', fur: '#5D656F', dark: '#30363D', light: '#7C8590', belly: '#69717B', plate: '#CFD8DC', muzzle: '#78808A', mouth: '#15191D', tummy: false },
  { id: 'nutmeg', label: 'nutmeg', fur: '#B9672F', dark: '#6B3714', light: '#D88E57', belly: '#E7C9A6', ticking: 0.7 },
  { id: 'honey', label: 'dark-eyed honey', fur: '#E9A24C', dark: '#AD6A22', light: '#F6CA8C', belly: '#FFFDF8' },
  { id: 'polar-fox', label: 'polar fox', fur: '#F3EFEA', dark: '#858C94', light: '#FFFFFF', belly: '#FFFFFF', ticking: 0.6, tick: '#7D848C' },
  // Pied: white patches on a base coat. A self-coloured base (black, lilac, Burmese)
  // keeps its dark underside; an agouti-type base keeps its light tummy.
  { id: 'pied', label: 'pied black', fur: '#2E2E33', dark: '#0F0F12', light: '#4C4C55', belly: WHITE, plate: '#E6ECEF', patches: WHITE, tummy: false },
  {
    id: 'mottled-black', label: 'mottled black', fur: '#2E2E33', dark: '#0F0F12', light: '#4C4C55', belly: WHITE,
    plate: '#E6ECEF', patches: WHITE, tummy: false, pattern: 'mottled',
  },
  {
    id: 'pied-agouti', label: 'pied golden agouti', fur: '#C9A064', dark: '#7E5A2E', light: '#E9CF99', belly: '#F7EEDC',
    feet: WHITE, ticking: 0.7, patches: WHITE,
  },
  {
    id: 'pied-argente', label: 'pied argente golden', fur: '#E3A35E', dark: '#A4652B', light: '#F4CB92', belly: '#FFFDF8',
    ticking: 0.4, ruby: true, patches: WHITE,
  },
  {
    id: 'pied-lilac', label: 'pied lilac', fur: '#9F93A8', dark: '#66596E', light: '#C0B5C7', belly: WHITE,
    plate: '#E6ECEF', ruby: true, patches: WHITE, tummy: false,
  },
  {
    id: 'pied-burmese', label: 'pied Burmese', fur: '#5B3F2F', dark: '#2B1B12', light: '#7B5A45', belly: WHITE,
    plate: '#E6ECEF', ears: '#2E1D14', tail: '#2E1D14', mouth: '#120A06', patches: WHITE, tummy: false,
  },
]

// Other ways of saying a coat, all lower-cased with hyphens.
const ALIASES: Record<string, string> = {
  'golden-agouti': 'agouti',
  argente: 'argente-golden',
  'golden-argente': 'argente-golden',
  'argente-cream': 'cream',
  ivory: 'cream',
  'black-eyed-white': 'bew',
  white: 'bew',
  'dark-eyed-honey': 'honey',
  deh: 'honey',
  polar: 'polar-fox',
  spotted: 'pied',
  'spotted-black': 'pied',
  'pied-black': 'pied',
  mottled: 'mottled-black',
  'spotted-agouti': 'pied-agouti',
  'spotted-golden-agouti': 'pied-agouti',
  'pied-golden-agouti': 'pied-agouti',
  'spotted-argente': 'pied-argente',
  'pied-argente-golden': 'pied-argente',
  'spotted-lilac': 'pied-lilac',
  'spotted-burmese': 'pied-burmese',
}

/** The coat with this id; golden agouti for one this version does not know. */
export function coatById(id: string | undefined): Coat {
  return COATS.find(c => c.id === id) ?? COATS[0]!
}

/** The coat a person named: its id, its label or a breeder's other name for it. */
export function findCoat(text: string): Coat | undefined {
  const k = text.trim().toLowerCase().replace(/[\s_]+/g, '-')
  if (!k) return undefined
  const id = ALIASES[k] ?? k
  return COATS.find(c => c.id === id || c.label.toLowerCase().replace(/\s+/g, '-') === k)
}

/** Names dealt to a project the setting does not name, in this order from a start its folder picks. */
const NAMES = [
  'Pip', 'Sprocket', 'Biscuit', 'Widget', 'Hazel', 'Rivet', 'Toffee', 'Gizmo', 'Clover',
  'Bramble', 'Sesame', 'Cog', 'Juniper', 'Pepper', 'Fennel', 'Quill', 'Maple', 'Bolt',
]

/** Amy's projects as first named: folder=Name/coat, comma-separated. */
export const DEFAULT_GERBILS =
  'butterfield_rrt=Butterscotch/argente-golden, rat=Butterscotch/argente-golden, seeker=Scout/agouti, SeekerScrapers=Digger/black, ' +
  'bragi=Skald/burmese, databasemanager=Ledger/dove, teamManagement=Roster/lilac, GUMS=Gumdrop/cream, ' +
  'tinkerbell=Pixie/bew, no-folder=Nomad/pied'

export type GerbilSetting = { name?: string; coat?: string }

/** Reads `folder=Name/coat` pairs; either half may be left out (`bragi=Skald`, `bragi=/dove`). */
export function parseGerbilMap(text: string): Record<string, GerbilSetting> {
  const out: Record<string, GerbilSetting> = {}
  for (const part of text.split(/[,;\n]/)) {
    const eq = part.indexOf('=')
    if (eq < 0) continue
    const folder = part.slice(0, eq).trim().toLowerCase()
    const [name = '', coat = ''] = part
      .slice(eq + 1)
      .split('/')
      .map(s => s.trim())
    const found = coat ? findCoat(coat) : undefined
    if (folder && (name || found)) out[folder] = { name: name || undefined, coat: found?.id }
  }
  return out
}

function hash(text: string): number {
  let h = 0
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0
  return h
}

function pick<T>(list: readonly T[], start: number, free: (x: T) => boolean): T {
  for (let i = 0; i < list.length; i++) {
    const x = list[(start + i) % list.length]!
    if (free(x)) return x
  }
  return list[start % list.length]!
}

/**
 * Every project's gerbil. What Amy picked in the pane wins, then the setting,
 * then what was dealt before; a project with none is dealt a coat and a name
 * no other project has, starting from a place its folder picks.
 */
export function assignGerbils(
  projects: readonly { key: string; name: string }[],
  stored: Readonly<Record<string, OverviewGerbil>>,
  configured: Readonly<Record<string, GerbilSetting>>,
): Record<string, OverviewGerbil> {
  const out: Record<string, OverviewGerbil> = {}
  const coats = new Set<string>()
  const names = new Set<string>()
  const pending: { key: string; name: string }[] = []
  for (const p of projects) {
    const kept = stored[p.key]
    const set = configured[p.name.toLowerCase()] ?? configured[p.key]
    const g: OverviewGerbil | undefined =
      kept?.source === 'manual'
        ? kept
        : set
          ? { name: set.name ?? kept?.name ?? '', coat: set.coat ?? kept?.coat ?? '', source: 'config' }
          : kept
            ? { ...kept, source: 'auto' }
            : undefined
    if (g) {
      out[p.key] = g
      if (g.coat) coats.add(g.coat)
      if (g.name) names.add(g.name.toLowerCase())
    }
    if (!g?.name || !g.coat) pending.push(p)
  }
  for (const p of pending) {
    const g: OverviewGerbil = out[p.key] ?? { name: '', coat: '', source: 'auto' }
    const start = hash(p.key)
    const coat = g.coat || pick(COATS.map(c => c.id), start, id => !coats.has(id))
    const name = g.name || pick(NAMES, start, n => !names.has(n.toLowerCase()))
    coats.add(coat)
    names.add(name.toLowerCase())
    out[p.key] = { ...g, name, coat }
  }
  return out
}
