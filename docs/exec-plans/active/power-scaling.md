# Exec plan: power-scaling rebalance (make it harder)

Status: ACTIVE, opened 2026-09-14. Touches balance and likely `src/engine`
(enemy HP scaling and/or the scoring path), so it takes a plan, a sim
rerun, and one adversarial round under iteration mode, the adversarial
seat briefed to break replay determinism.

## The ask

phuzion (via Dean), 2026-09-14: powerups feel OP; longwordmaxxing
one-shot 25+ enemies in a row, an 8000-point 6-letter word. Dean: "if you
can one-shot you're good, but if you can't in 1-2 words you're just
straight dead," and "rich get richer" (vowel + flat + mult items compound
to thousands against enemy HP). "Let's make it harder." First real
power-scaling pass.

## Dean's decisions (numbered questions, 2026-09-14)

1. Direction: **tactical band**. Scale enemy HP with depth so a strong
   word does big-but-not-total damage; soften enemy burst so a turn you
   do not one-shot is not lethal; trim the top offense stackers. Fights
   become a 2-4 turn band, killing both "one-shot" and "dead."
2. Process: **measure first**. The exit-criteria sim never modelled a
   scoring-item stacker (greedy caps at 7 letters and drafts at random),
   so it could not see this. Add a stacker bot + a one-shot / overkill
   metric, quantify the problem, then tune against it.

## Diagnosis (measured)

Enemy HP is nearly flat in the raw content (act 1 40-65, act 2 50-70, act
3 55-80, bosses 120-150) while offense compounds with items: 113 of 210
items touch damage (67 addFlat, 32 addMult, 14 letterBonus), and
`mult = 1 + sum(addMult)`, so flats, letter-bonuses and vowel pushes all
stack.

## Instrumentation (task 1, this commit)

- `stacker` bot (`scripts/lib/bots.ts`): longwordmaxxing (best word of any
  length, like the solver) + greedy offense drafting (`stackerPickScore`
  ranks addMult > letterBonus/vowel > addFlat, takes the most damage on
  offer, eats curses for it). Opt-in: NOT in `BOT_NAMES`, so the default
  table and the exit criteria are unchanged; `ALL_BOT_NAMES` allows
  `--bot stacker`.
- `scripts/power-scaling.ts` (`npm run power`): drives a bot and reports,
  per encounter, the one-shot rate, overkill (raw first-word damage /
  enemy max HP, from the candidate preview, NOT the HP-clamped
  lastTurn.damage), and words-to-kill.

### Baseline (`npm run power -- --runs 150`, balanced cell, before any tuning)

```
| enc | fights | one-shot % | overkill x (median) | overkill x (p90) | enemy HP | first-word dmg (median) |
|   1 |    150 |       98.7 |                 2.1 |              3.5 |       39 |                      73 |
|   2 |     93 |       68.8 |                 1.2 |              2.3 |       72 |                      84 |
|   3 |    150 |       70.0 |                 1.2 |              2.5 |       84 |                     102 |
|   4 |     92 |       97.8 |                 2.2 |              5.0 |       74 |                     166 |
|   5 |     90 |       95.6 |                 2.3 |              5.1 |       86 |                     198 |
|   6 |    150 |       81.3 |                 1.7 |              3.5 |      144 |                     238 |
|   7 |     92 |       77.2 |                 1.7 |              3.9 |      164 |                     260 |
|   8 |     83 |       79.5 |                 1.6 |              3.1 |      187 |                     285 |
|   9 |    150 |       57.3 |                 1.1 |              2.2 |      285 |                     326 |
Overall one-shot rate: 79.8% of 1050 fights.
Overall overkill: median 1.6x, p90 3.4x, max 9.6x. Median words-to-kill: 1.0.
```

The stacker one-shots ~80% of fights; the median first word is 1.1-2.3x
the enemy's HP, the p90 up to 5x mid-run. This is phuzion's report,
quantified. (Enemy HP already grows more than the raw table via existing
per-encounter scaling; the offense still outruns it.)

## Design (task 2+, tuning, TBD and measured)

Target band: median words-to-kill ~2-3 for the stacker, one-shot rate
well down (a stretch goal to define with Dean once the first tuning pass
has numbers), while the existing criteria hold (mediocre 20-40%, greedy
< 90%, no dead grids). Levers, in the order I will try them and
re-measure with `npm run power` after each:
1. Enemy HP scales with depth (raise the wall so a good word does not lap
   it). The existing scaling knob is where this lands; find it and steepen.
2. Soften enemy burst where HP goes up, so a non-one-shot turn is
   survivable (the "dead" half of the swing).
3. Trim the top offense stackers (the +2 addMult items, the heaviest
   letterBonus stacks) if HP scaling alone leaves the p90 absurd.
Diminishing returns on mult stacking is a fallback if 1-3 are not enough;
it is an engine change to `scoring.ts` and would get the closest scrutiny.

## Risks

- Overshoot into a slog (words-to-kill too high, mediocre falls out of
  band). Re-measure both `npm run power` and `npm run sim` after every
  change; the criteria are the guardrail.
- HP scaling or a scoring-curve change is engine and could touch replay
  determinism. Keep it pure and seed-stable; the adversarial seat breaks
  replay. If only content numbers (enemy HP, item values) change, it is a
  content/tuning change (sim rerun, no reviewer) per iteration mode; a
  formula change in the engine gets the reviewer.

## Acceptance

- `npm run power` shows the one-shot rate and overkill down to the agreed
  band, re-measured and pasted here.
- `npm run sim` still passes all three criteria (table pasted).
- `npm test`, `npm run lint`, CI green.
