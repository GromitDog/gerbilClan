// How the gerbil looks: one SVG per mood for surfaces that draw `Svg`, and a
// three-row ASCII gerbil for the terminal.
//
// A gerbil, not a mouse and not a hamster: slim and upright, sitting on long
// hind feet with its front paws held together, small ears set to the side,
// chubby cheeks, a short nose and a long tail with a tuft on the end.
// Robotic: goggle-lens eyes, panel seams, rivets, a belly screen, an antenna
// and a tail that is a cable ending in a fibre-optic tuft. Fixed colours on a
// tinted disc, so it reads on a light or dark pane. Coloured classic agouti.
import type { Mood } from './gerbil'

// Classic agouti: golden brown on top with dark ticking, cream underneath.
const AGOUTI = '#C9A064'
const AGOUTI_DARK = '#7E5A2E'
const AGOUTI_LIGHT = '#E9CF99'
const CREAM = '#F7EEDC'
const INK = '#1E2A30'
const LED = '#5CF2C8'
const PINK = '#F8A5B8'

/** The antenna light, the eye glow and the disc the gerbil sits on, per mood. */
const TINT: Record<Mood, { light: string; disc: string; eye: string }> = {
  idle: { light: '#7C9CFF', disc: '#7C9CFF', eye: LED },
  happy: { light: '#FFD54F', disc: '#66D9A2', eye: LED },
  busy: { light: '#4FC3F7', disc: '#4FC3F7', eye: LED },
  worried: { light: '#FF8A65', disc: '#FFB74D', eye: '#FFD54F' },
  sleepy: { light: '#B0BEC5', disc: '#B0BEC5', eye: '#9FB3BD' },
}

// Eyes sit inside two goggle lenses centred at (48,42) and (72,42).
const EYES: Record<Mood, string> = {
  idle:
    `<circle cx="48" cy="42" r="3.4" fill="${LED}"/><circle cx="72" cy="42" r="3.4" fill="${LED}"/>` +
    '<circle cx="49.2" cy="40.8" r="1.1" fill="#FFFFFF" opacity="0.9"/><circle cx="73.2" cy="40.8" r="1.1" fill="#FFFFFF" opacity="0.9"/>',
  happy:
    `<path d="M43.5 43.5 q4.5 -6 9 0" stroke="${LED}" stroke-width="2.6" fill="none" stroke-linecap="round"/>` +
    `<path d="M67.5 43.5 q4.5 -6 9 0" stroke="${LED}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`,
  busy:
    `<circle cx="48" cy="42" r="4.2" fill="${LED}"/><circle cx="72" cy="42" r="4.2" fill="${LED}"/>` +
    `<circle cx="48" cy="42" r="1.8" fill="${INK}"/><circle cx="72" cy="42" r="1.8" fill="${INK}"/>` +
    '<circle cx="49.6" cy="40.4" r="1.1" fill="#FFFFFF" opacity="0.9"/><circle cx="73.6" cy="40.4" r="1.1" fill="#FFFFFF" opacity="0.9"/>',
  worried:
    '<path d="M43.5 39 L52 43" stroke="#FFD54F" stroke-width="2.6" stroke-linecap="round"/>' +
    '<path d="M76.5 39 L68 43" stroke="#FFD54F" stroke-width="2.6" stroke-linecap="round"/>' +
    // a sweat drop by the right lens
    '<path d="M85 27 q4 6 0 9 q-4 -3 0 -9 z" fill="#81D4FA"/>',
  sleepy:
    `<path d="M43.5 42.5 h9" stroke="${'#9FB3BD'}" stroke-width="2.6" stroke-linecap="round"/>` +
    `<path d="M67.5 42.5 h9" stroke="${'#9FB3BD'}" stroke-width="2.6" stroke-linecap="round"/>` +
    '<text x="90" y="24" font-size="11" font-weight="700" font-family="sans-serif" fill="#9FB3BD">z</text>' +
    '<text x="100" y="16" font-size="8" font-weight="700" font-family="sans-serif" fill="#9FB3BD">z</text>',
}

// The mouth under the nose: a gerbil's little "w", flat when worried, an "o" when asleep.
const MOUTH: Record<Mood, string> = {
  idle: `<path d="M55 57.5 q2.5 3 5 0 q2.5 3 5 0" stroke="${INK}" stroke-width="1.6" fill="none" stroke-linecap="round"/>`,
  happy: `<path d="M54 56.5 q6 6 12 0" stroke="${INK}" stroke-width="1.8" fill="none" stroke-linecap="round"/>`,
  busy: `<path d="M55 57.5 q2.5 3 5 0 q2.5 3 5 0" stroke="${INK}" stroke-width="1.6" fill="none" stroke-linecap="round"/>`,
  worried: `<path d="M55.5 58 h9" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/>`,
  sleepy: `<circle cx="60" cy="58" r="1.8" fill="${INK}" opacity="0.7"/>`,
}

/** The colour of a mood: the disc the gerbil sits on, for the bubble beside it. */
export function moodColor(mood: Mood): string {
  return TINT[mood].disc
}

/**
 * A slim agouti robot gerbil sitting up on a mood-tinted disc: goggle eyes, a
 * belly screen, paws held together, long hind feet, an antenna and a thin
 * cable tail with a tuft of light on the end.
 */
export function gerbilSvg(mood: Mood): string {
  const tint = TINT[mood]
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="96" height="96">' +
    // the disc it sits on
    `<circle cx="60" cy="62" r="56" fill="${tint.disc}" opacity="0.18"/>` +
    `<circle cx="60" cy="62" r="56" fill="none" stroke="${tint.disc}" stroke-width="1.5" opacity="0.35"/>` +
    // tail: a long thin cable sweeping out behind, with a fibre-optic tuft on the end
    `<path d="M82 100 C 102 104, 116 90, 109 72" stroke="${AGOUTI_DARK}" stroke-width="4" fill="none" stroke-linecap="round"/>` +
    `<path d="M82 100 C 102 104, 116 90, 109 72" stroke="${AGOUTI}" stroke-width="1.6" fill="none" stroke-linecap="round"/>` +
    `<path d="M95 101 l0.5 -3.5 M105 97 l-2 -3 M111 86 l-3.5 -1.5" stroke="${AGOUTI_DARK}" stroke-width="1.4" stroke-linecap="round"/>` +
    `<circle cx="109" cy="72" r="3" fill="${AGOUTI_DARK}"/>` +
    `<path d="M109 70 l-5 -8 M109 70 l0.5 -9.5 M109 70 l6 -7.5" stroke="${tint.light}" stroke-width="2" stroke-linecap="round"/>` +
    `<circle cx="104" cy="62" r="1.6" fill="${tint.light}"/><circle cx="109.5" cy="60.5" r="1.6" fill="${tint.light}"/><circle cx="115" cy="62.5" r="1.6" fill="${tint.light}"/>` +
    // hind feet: long, flat, pointing forward
    `<ellipse cx="43" cy="107" rx="12" ry="4.5" fill="${CREAM}" stroke="${AGOUTI_DARK}" stroke-width="1.6"/>` +
    `<ellipse cx="77" cy="107" rx="12" ry="4.5" fill="${CREAM}" stroke="${AGOUTI_DARK}" stroke-width="1.6"/>` +
    `<path d="M34 106 v3 M38 105 v4 M86 106 v3 M82 105 v4" stroke="${AGOUTI_DARK}" stroke-width="1.2" stroke-linecap="round"/>` +
    // body: an upright oval, narrower than the head
    `<path d="M60 50 C 43 50, 35 66, 35 84 C 35 100, 46 108, 60 108 C 74 108, 85 100, 85 84 C 85 66, 77 50, 60 50 Z" fill="${AGOUTI}" stroke="${AGOUTI_DARK}" stroke-width="2"/>` +
    `<path d="M40 76 Q60 70 80 76" stroke="${AGOUTI_LIGHT}" stroke-width="1.6" fill="none" stroke-linecap="round"/>` +
    `<path d="M39.5 64 l2 -3 M43 58 l2 -3 M80.5 64 l-2 -3 M77 58 l-2 -3 M38 88 l2 -3 M82 88 l-2 -3" stroke="${AGOUTI_DARK}" stroke-width="1.3" stroke-linecap="round" opacity="0.7"/>` +
    // belly screen with a pixel heart
    `<rect x="47" y="72" width="26" height="20" rx="8" fill="${CREAM}" stroke="${AGOUTI_DARK}" stroke-width="1.2"/>` +
    `<rect x="51" y="75.5" width="18" height="13" rx="3" fill="${INK}"/>` +
    `<path d="M57 79 h2 v-1 h2 v1 h2 v-1 h2 v1 h-1 v1 h1 v1 h-1 v1 h-1 v1 h-1 v1 h-1 v1 h-2 v-1 h-1 v-1 h-1 v-1 h-1 v-1 h-1 v-1 h1 v-1 h1 z" fill="${tint.light}"/>` +
    `<circle cx="50" cy="75" r="1" fill="${AGOUTI_DARK}"/><circle cx="70" cy="75" r="1" fill="${AGOUTI_DARK}"/>` +
    // front paws held together under the screen
    `<rect x="50.5" y="93" width="9" height="6" rx="3" fill="${CREAM}" stroke="${AGOUTI_DARK}" stroke-width="1.2"/><rect x="60.5" y="93" width="9" height="6" rx="3" fill="${CREAM}" stroke="${AGOUTI_DARK}" stroke-width="1.2"/>` +
    `<path d="M53.5 94.5 v3 M56.5 94.5 v3 M63.5 94.5 v3 M66.5 94.5 v3" stroke="${AGOUTI_DARK}" stroke-width="1" stroke-linecap="round"/>` +
    // ears: small speaker discs at the sides of the head
    `<circle cx="39" cy="21" r="8" fill="${AGOUTI}" stroke="${AGOUTI_DARK}" stroke-width="2"/>` +
    `<circle cx="81" cy="21" r="8" fill="${AGOUTI}" stroke="${AGOUTI_DARK}" stroke-width="2"/>` +
    `<circle cx="39" cy="21" r="4" fill="${PINK}"/><circle cx="81" cy="21" r="4" fill="${PINK}"/>` +
    `<circle cx="39" cy="21" r="1.2" fill="${AGOUTI_DARK}"/><circle cx="81" cy="21" r="1.2" fill="${AGOUTI_DARK}"/>` +
    // head: smaller than before, a short muzzle at the bottom
    `<path d="M60 18 C 42 18, 34 30, 35 44 C 36 58, 46 66, 60 66 C 74 66, 84 58, 85 44 C 86 30, 78 18, 60 18 Z" fill="${AGOUTI}" stroke="${AGOUTI_DARK}" stroke-width="2"/>` +
    `<ellipse cx="60" cy="56" rx="11" ry="7" fill="${CREAM}" stroke="${AGOUTI_DARK}" stroke-width="1"/>` +
    // helmet seam and rivets
    `<path d="M41 31 Q60 23 79 31" stroke="${AGOUTI_LIGHT}" stroke-width="2" fill="none" stroke-linecap="round"/>` +
    `<path d="M50 25.5 l1.5 -3 M56 23 l1.5 -3 M62.5 23 l1.5 -3 M68.5 25.5 l1.5 -3 M38 40 l2 -3 M82 40 l-2 -3" stroke="${AGOUTI_DARK}" stroke-width="1.3" stroke-linecap="round" opacity="0.7"/>` +
    `<circle cx="43" cy="34" r="1.2" fill="${AGOUTI_DARK}"/><circle cx="77" cy="34" r="1.2" fill="${AGOUTI_DARK}"/>` +
    // antenna
    `<path d="M60 18 v-6" stroke="${AGOUTI_DARK}" stroke-width="2.5" stroke-linecap="round"/>` +
    `<circle cx="60" cy="9.5" r="6.5" fill="${tint.light}" opacity="0.3"/>` +
    `<circle cx="60" cy="9.5" r="3.8" fill="${tint.light}"/>` +
    // goggle lenses, small and set wide
    `<circle cx="48" cy="42" r="7.2" fill="${INK}" stroke="${AGOUTI_DARK}" stroke-width="2.2"/>` +
    `<circle cx="72" cy="42" r="7.2" fill="${INK}" stroke="${AGOUTI_DARK}" stroke-width="2.2"/>` +
    `<path d="M55.5 42 h9" stroke="${AGOUTI_DARK}" stroke-width="2.2" stroke-linecap="round"/>` +
    EYES[mood] +
    // cheeks, nose, mouth
    `<circle cx="42" cy="53" r="4.5" fill="${PINK}" opacity="0.55"/><circle cx="78" cy="53" r="4.5" fill="${PINK}" opacity="0.55"/>` +
    `<path d="M57 51.5 q3 -2 6 0 q-1.5 3.5 -3 4 q-1.5 -0.5 -3 -4 z" fill="${PINK}"/>` +
    `<circle cx="58.5" cy="52" r="0.8" fill="#FFFFFF" opacity="0.8"/>` +
    MOUTH[mood] +
    '</svg>'
  )
}

const FACES: Record<Mood, string> = {
  idle: '( •ᴗ• )',
  happy: '( ^ᴗ^ )',
  busy: '( ●ᴗ● )',
  worried: '( ╥ᴗ╥ )',
  sleepy: '( -ᴗ- )z',
}

/** Three rows; the terminal draws these in a Text. */
export function gerbilAscii(mood: Mood): string {
  return ['  (\\_/)', ` ${FACES[mood]}`, ' /|___|\\'].join('\n')
}
