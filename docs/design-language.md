# Design language: Plasma

Chosen by Dean on 2026-09-08 from three directions (Agar, Specimen,
Plasma). Saturated pixels, hard shadows, Earthbound in the veins. Loud
on purpose, crisp, never cartoony. The tokens live in
`src/ui/theme.css`; this file is the rules for using them. A component
never invents a colour, a face, a radius or a duration: if it needs
one that is not here, add the token here first, with a role.

## Pillars it serves

1. Long word equals event: the biggest, brightest things on screen are
   the damage number and the word line.
2. Attrition is the tension: HP bars and damage taken are always in
   the harm hue, never softened.
3. Vocabulary is the character: letters are set in the pixel face at
   the largest size on screen; words are the hero, not the chrome.

## Colour by role

| Token | Means | Never used for |
|---|---|---|
| `--ground` | the page | panels |
| `--panel` | any card: arena, offers, sheets | tiles |
| `--ink`, `--muted` | text, secondary text | fills |
| `--line`, `--shade` | hairlines; the hard shadow colour | text |
| `--life` | your HP, a valid word, the good button | anything enemy |
| `--score` | damage dealt, the missed word, vowel tiles | HP |
| `--harm` | enemy HP, damage taken, the danger button | tiles |
| `--venom` | venom, only venom | any other hazard |
| `--rare` | K J X Q Z tiles, rare items | selection |
| `--select` | a selected tile that is not yet a word | valid words |

Act palettes for the arena backdrop are the one place hue varies by
context; they are defined on the arena and stay inside it.

## Type

- `--font-hud` (Silkscreen): tile letters, numbers, labels, the word
  line. Sizes are multiples of 8 px only (`--hud-s` 8, `--hud-m` 16,
  `--hud-l` 24, `--hud-xl` 32). At other sizes it aliases.
- `--font-ui` (Space Grotesk): sentences, buttons, descriptions,
  definitions. 13 to 16 px for reading.
- Two faces, no third. Both vendored under `public/fonts` with their
  Open Font License texts; nothing loads from a third party.

## Shape

- Corners `--radius` (4 px). Nothing is a pill.
- Every raised thing carries the hard shadow: `--shadow` for panels
  and buttons, `--shadow-tile` for tiles. Pressing a button moves it
  onto its shadow (`--shadow-press`). No soft shadows, no blur, no
  gradients outside the arena backdrop.
- Borders are 2 px `--shade` on controls, `--tile-line` on tiles.

## Motion

- State changes (select, valid, press) step in `--dur-state` with
  `--ease-step`; they do not ease. Pixels snap.
- Movement (tiles settling, numbers rising) takes `--dur-settle` with
  `--ease-settle`.
- Idle motion (bob, backdrop drift) is `--dur-idle` or slower.
- Transform, opacity and filter only. `prefers-reduced-motion` zeroes
  the state and settle durations and stops idle loops.

## Component rules

- Tiles: `--tile` fill, letter in `--font-hud` at the largest size the
  grid allows, tier by border colour (vowel fill `--score`, mid edge
  `--mid`, rare edge `--rare` with a glow), selection overrides tier
  (`--select` fill, then `--life` fill when the word is valid), locked
  tiles dashed and dimmed, venom edge `--venom` with a glow and a
  count in `--font-hud`.
- Buttons: `.btn` plus a role class (`life`, `harm`, `select`). The
  primary action is `life` when it will succeed and `harm` when it
  costs something.
- Panels: `.panel`. Text on the arena backdrop sits on a scrim.
- Report lines: damage dealt in `--score`, taken in `--harm`, venom in
  `--venom`, praise in `--life`.

## What "slop" looks like, so it stays out

A component with its own hex values. A third font. A pill button. A
soft drop shadow. A gradient on a card. An easing curve on a state
change. Text under 13 px in the UI face. Emoji as icons.
