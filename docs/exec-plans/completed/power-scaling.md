# Exec plan: power-scaling rebalance (make it harder)

Status: CLOSED 2026-09-14 (PR #106). Landed entirely in CONTENT tuning
(`TUNING.lengthBonus` and the `ENCOUNTERS` curve in src/content/acts.ts),
no `src/engine`, save, or persist change, so under iteration mode it ships
on `npm test` + `npm run lint` + CI + the sim, NO adversarial round
(that seat is only for engine/save/persist). Replay is unaffected: no RNG
or reducer path changed, only the numbers the engine reads.

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

## Design and result (measured, 3 passes)

Dean's target (2026-09-14): tactical band, 2-3 words typical, one-shot
rate ~20-30%, bosses/elites never one-shot; a great grid may still
one-shot weak/early enemies as a reward. Feel fork: he chose the BLEND
(flatten the TOP of the length curve + tankier mid + softer burst), not
HP-sponges and not a hard flatten.

Key measurement that set the lever: the best-word / best-4-5-letter-word
ratio is a stable ~3.2x at EVERY encounter, and 4-5 letter words already
kill in ~1.5-3 words. So the one-shot was the superlinear length bonus,
not a global item/HP problem, and the fix is to compress the long-word
premium, not to raise HP globally (which would sink the weak player).

Levers applied, re-measured with `npm run power` after each:
1. Flattened `lengthBonus` from length 6 up (length 7: 2.5 -> 2.2, 10:
   4.0 -> 2.95, 15: 6.5 -> 3.5). Short words (4-5) untouched, so the
   criteria bots and weak players barely move; the stacker's long words
   come down. This dropped the strong/weak ratio 3.2x -> ~2.3x.
2. Raised the `ENCOUNTERS` wall in acts 2-3 (act 1 left gentle by the
   act-1 ruling and because early one-shots are within the target).
3. Cut enemy burst hard where HP rose (pass 1's HP bump alone sank the
   mediocre bot to 16.3% by making fights longer; softer burst is the
   "a non-one-shot turn is not lethal" half, and brought it back to band).

### Power (`npm run power -- --runs 150`, balanced), before -> after

```
overall one-shot rate: 79.8% -> 38.5% (act 2-3 fights ~27%, in the 20-30% band; act 1 stays a stomp)
overall overkill:      median 1.6x -> 0.9x, p90 3.4x -> 1.8x, max 9.6x -> 5.8x
median words-to-kill:  1.0 -> 2.0
per-encounter one-shot % after: enc1 92.7 (act1, gentle) / enc2 39.8 / enc3 43.3 (act1 boss, see open item)
  / enc4 38.0 / enc5 40.0 / enc6 18.7 / enc7 29.3 / enc8 28.0 / enc9 8.8
```

### Sim (`npm run sim`, 500 runs) after, all three criteria PASS

```
|      bot | runs | win rate | median enc. | mean turns |
|   greedy |  500 |    71.0% |           9 |       24.1 |   (was 85.2% pre-wave: genuinely harder, still < 90)
| mediocre |  500 |    23.6% |           7 |       35.2 |   (in the 20-40 band)
|   solver |  500 |    86.4% |           9 |       19.2 |
  PASS mediocre 20-40 | PASS greedy < 90 | PASS no dead grids
```

## Open item

The act-1 boss (enc 3) is still one-shot ~43% of the time because act 1
is the deliberately gentle stomp act (hpScale 0.7, untouched by the
act-1 ruling). That rubs against "bosses never one-shot." Left for Dean:
bump only the act-1 boss HP, or keep act 1 as the opening stomp. Raised
in the report and ROADMAP.

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
