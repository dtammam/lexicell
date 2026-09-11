# Resist enemy trait (challenge groundwork)

Thread 2 of the variety/challenge design plan. Engine wave: full gate, the
adversarial reviewer briefed to break replay. One PR (#86), branch
`feat/resist`, off main at b8c304c.

## Goal

Give an enemy the ability to demand a word property and shrug off words that
do not meet it. This is the challenge lever: a fight that is not just "spell
the biggest word" but "spell a word that clears this bar or hit for half".
Ship the mechanism now, replay-neutral, so the enemies that use it can be
authored as pure content in the next wave.

## Dean's decision (approved plan 2A)

- Reuse the existing Condition system. NO new effect verb, NO new Condition
  kind, NO save bump. If the grammar cannot express a demand, STOP and report
  rather than add a kind.
- Additive to armour. Do not refactor armour into resist in this wave; resist
  is a new, parallel mechanism. Folding the two together is deferred (see
  Deferred).
- Replay-neutral: no shipped enemy sets `resist`, so every existing Normal and
  Endless seed must play byte-identically to main.

## Design

- `EnemyTraits.resist?: { when: Condition; factor: number }` (types.ts). A
  submitted word that FAILS `when` deals only `factor` of its damage to that
  enemy, floored; a word that passes takes full damage. `when` is the existing
  `Condition` union (effects.ts): minLength, maxLength, containsLetter,
  startsWith, endsWith, uniqueLetters, repeatLetter, minVowels are the
  word-shaped demands. No new kind is added.
- `resistHit(damage, resist, ctx)` (reducer.ts) evaluates `resist.when` with
  the existing `evaluateCondition` against the same per-word `ConditionContext`
  the scoring effects already build (`conditionCtx(state, ctx, word)`). No new
  evaluator. `undefined` resist returns the damage unchanged.
- Damage path: applied in `submitWord` immediately after `armourHit`, on the
  same `score.damage + gold` value, so the number that lands is
  `resistHit(armourHit(...), resist, cctx)`. Armour halves first (floored),
  then resist takes its fraction (floored). The armour code is untouched.
- Preview parity: BOTH preview paths mirror the same two-step calc in the same
  order:
  - `scoreSelection` (the "Attack for N" number), and
  - `candidates.candidateWords` (the per-word candidate list / compendium).
  So the shown number equals the landed number, exactly as armour already did.
- Intent line: `resistLabel(resist)` (reducer.ts, a pure string map over the
  Condition kind) feeds the Arena trait row, kept under ~20 chars for a 390px
  phone ("resist <6", "resist no Z", "resist repeats", ...). Dormant until an
  enemy uses it, but correct and unit-tested.

## Task commits

One commit for the wave (engine module + its tests together, iteration mode
rule 3, one task per PR):

1. `feat: resist enemy trait` - types.ts (`resist` on EnemyTraits, import
   Condition), reducer.ts (`resistHit`, `resistLabel`, apply in submitWord and
   scoreSelection), candidates.ts (apply in candidateWords), Arena.svelte
   (intent label), reducer.test.ts (unit + integration + label tests), the
   release notes and ROADMAP entries, this plan.

## Risks

- **Replay drift.** The whole safety claim is that nothing sets `resist`, so
  `resistHit` is called with `undefined` on every shipped enemy and returns the
  damage as-is. Guarded by the byte-identical sim table (below) and the
  existing per-mode replay tests. The reviewer is briefed to break exactly
  this.
- **Preview divergence.** Two preview paths (scoreSelection, candidateWords)
  plus the landed hit must agree. Covered by a test that asserts all three
  return the same reduced number for a failing word and the same full number
  for a passing word, on a fixture enemy that carries resist.
- **Floor order with armour.** armour-floor-then-resist-floor is the pinned
  order; a test asserts `floor(floor(raw/2) * factor)` on a fixture with both.

## Acceptance

- A word failing the demand deals `floor(damage * factor)`; a word passing
  deals full; no resist is a no-op. (unit)
- Each word-shaped Condition kind works as a resist (minLength, containsLetter,
  uniqueLetters, minVowels, repeatLetter tested). (unit)
- scoreSelection and candidateWords both return the SAME reduced number that
  submitWord lands, for pass and fail. (integration)
- resist and armour stack in the pinned floored order on a fixture with both.
- A control enemy with no resist is unchanged.
- `resistLabel` is correct per kind and every label is <= 20 chars.
- `npm test` and `npm run lint` green; `npx tsx scripts/sim.ts` still runs and
  the balanced table is byte-identical to main (replay-neutral).

## Deferred (not done here)

- Folding `armour` into `resist` (armour is `resist { when: minLength N, factor
  0.5 }`). Left alone this wave to keep the change additive and the replay
  proof clean. Revisit when an enemy actually ships resist.
- Authoring enemies that use resist. Next wave; pure content, no engine change.
