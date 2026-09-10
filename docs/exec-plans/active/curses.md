# Variety wave step 6: curses

Branch: `feat/curses`. Merge base: main at 95af908. PR #76.

This wave touches `src/engine` and the save schema, so it is a full wave:
exec plan, tests in every engine and persist commit, sim tables pasted
from real runs, adversarial reviewer at the end.

## Goal

Sometimes an item offer arrives cursed: about one in five normal
post-fight (and post-boss) offers after act 1. In a cursed offer every
option grants its boon AND an attached curse; the player takes one pair
(boon plus curse) or leaves the whole offer. Normal offers are unchanged
and stay mandatory. A curse is a real tradeoff, not a trap: pickup should
be sometimes-not-always, and the win rate must not be higher with curses
available.

## Dean's decisions (from intake, do not re-litigate)

1. A cursed offer REPLACES a normal offer, about 1 in 5, only AFTER act 1.
2. Every option in a cursed offer grants its boon and an attached curse;
   the player takes one pair or LEAVES the whole offer (a skip).
3. A curse is an ItemDef with a `curse: true` flag and negative/self-harm
   hooks built from EXISTING effect verbs only. No new verb.
4. About 8 to 10 curses, using inverted existing verbs.
5. Any tier of boon can appear in a cursed offer.
6. Elite, event, rest and starting offers are NOT cursable. Only the
   normal post-fight offer and the post-boss offer are.
7. Cursed offers are SEEDED off the run RNG (byte-identical replay) and
   PERSIST across a reload (save bump to v10).

## Design

### What is cursable, and when

`makeOffer` gains a `cursable` boolean. It is passed true from exactly two
call sites:

- The normal post-fight offer in `endEncounter` (NOT the elite offer,
  which stays a guaranteed-rare, non-cursable offer).
- The post-boss offer. The post-boss offer is emitted by `pickTrait`
  (after a trait is chosen) in the common case and by `makeEvolve` (the
  no-traits-left fallback); BOTH pass `cursable=true`, so the post-boss
  offer is cursable however it is reached. (The task named `makeEvolve`;
  the offer in practice comes through `pickTrait`, so both must pass the
  flag or the design does not hold.)

All other `makeOffer` calls (starting kit in `newRun`, event rare-pick in
`eventChoice`) default `cursable=false`. Rest offers are built by
`startRest` (via `drawOffer` directly, never `makeOffer`), so they are
never cursable.

Inside `makeOffer`:

```
const cursePool = ctx.content.items.filter((i) => i.curse);
const act = encounterDefFor(ctx.content, state.encounterIndex).act;
const eligible = cursable && act >= 2 && cursePool.length > 0;
```

Only when `eligible` do we draw the 1-in-5 roll (`nextInt(rng, 5) === 0`),
threading rng. Non-cursable and act-1 offers draw NOTHING extra, so their
RNG stream is unchanged relative to a would-be no-curse branch. (Adding
the feature does change the RNG stream of cursable act-2+ offers on the
main branch by one draw each; that is expected and unavoidable for any
feature that consumes rng, and every replay/determinism test re-verifies
against the new code.)

When the roll hits and `cursePool.length >= offer.length`, draw one curse
per boon slot WITHOUT replacement (uniform `pick`, threaded), aligned by
index with `offer`, and store them in `RunState.curses` (else `curses`
stays null and the offer is a normal one). With 10 curses and an offer of
at most 3 slots, alignment is always satisfiable.

### State, action, pick and skip

- `RunState.curses: readonly string[] | null`. Non-null ONLY during a
  cursed `pick` phase, aligned 1:1 with `offer`. `null` everywhere else.
- `pickItem`: when `curses` is non-null, append BOTH `offer[index]` and
  `curses[index]` to `player.items` (boon first, then curse), fire both
  `onPick` in that order, then clear `offer` and `curses`.
- New action `skipOffer`: valid only in phase `pick` with `curses` not
  null; clears `offer`+`curses` and advances (a skip forgoes the offer
  entirely). Rejected on a normal offer.
- `drawOffer`'s pool filter gains `&& !i.curse`, so curses never appear as
  normal boons (covers the guaranteed-rare path too, which draws from the
  same pool).

### Death before heals

A curse can be onTurnStart `damagePlayer`. `turnStart` applies onTurnStart
effects then checks player death after the venom bite, before any later
turn. A curse that brings HP to 0 at turn start is a loss (there is no
player heal between the drain and the death check). `turnStart` now also
adds `a.playerDamage` to `stats.damageTaken` so the drain is counted (no
shipped boon produces onTurnStart player damage, so existing runs are
unaffected).

### Turn-start dead-grid guard (robustness)

The self-lock (`onTurnStart lockTiles`), self-venom and occasional-scramble
curses can, in principle, leave a dead grid at turn start. The existing
turn-start guard only scrambled when a redraw had happened
(`a.redrawn.length > 0 && isDead`). It is broadened to `isDead` alone.
This is provably safe for existing content: entering `turnStart` the grid
is always live (endTurn's guard), and no shipped onTurnStart effect can
kill playability (redraws are already guarded; venom/gold/crack do not
remove playable tiles; no shipped item locks at turn start). So the
broadened guard adds scrambles ONLY in the new curse scenarios and leaves
every existing replay byte-identical.

### Curses (content, 10, existing verbs only)

| id | verb (inverted) | effect |
|----|-----------------|--------|
| curse-dull | onWordScored addFlat negative | every word deals less |
| curse-weak | onWordScored addMult negative | words deal a % less |
| curse-lumber | onWordScored condition minLength 6 -> addMult negative | long words punished |
| curse-thin-skin | onDamageTaken reduceDamage negative | basic attacks hit harder (specials/venom unaffected; said in the description) |
| curse-bleed | onTurnStart damagePlayer | lose HP each turn |
| curse-frail | onPick maxHp negative | lose max HP when taken |
| curse-drought | onTileDraw vowelWeight < 1 | vowels drawn less often |
| curse-shackle | onTurnStart lockTiles (count small, turns 1) | tiles lock each turn |
| curse-fester | onTurnStart venomTiles (value <= venomMax) | a tile turns venomous each turn |
| curse-tremor | onTurnStart condition turnEvery N -> scramble | the grid scrambles periodically |

### Save schema

`SAVE_VERSION = 10`, `RunState.v: 10`. `newRun` writes `curses: null`.
persist: `RUN_STATE_KEYS` gains `curses`; `looksLikeRunState` validates
`curses` is null or a `string[]` and, on a `pick` with non-null curses,
requires `curses.length === offer.length`; migrate v9->v10 sets
`curses: null`; `dropUnknownIds` filters offer and curses as ALIGNED
PAIRS (drop a pair if the boon is unknown or the curse is not a known
curse), and an empty resulting offer drops the save via the existing
non-empty-offer rule.

## Task commits

1. **curse flag + curse content + sprites.** `ItemDef.curse?: true`; ~10
   curses in items.ts; curse glyph tone + generation in sprites.py;
   content.test.ts extended.
2. **engine: cursed-offer generation + skip + save bump.** reducer +
   types, SAVE_VERSION 10, reducer.test.ts. Draws the reviewer.
3. **persist: migration + validation.** persist.ts + persist.test.ts.
4. **UI.** Pick.svelte (cursed offer signalling + Leave it), Compendium
   (Curses section, draftable count), test updates.
5. **sim + bots + tables.** curseCost heuristic, bot curse policy,
   instrumentation, `--no-curses` baseline, pasted tables.

## Risks

- RNG stream shift on cursable act-2+ offers changes seed-to-outcome for
  the main branch. Mitigated: all determinism tests re-verify against the
  new code; only the cursable path draws the extra roll.
- A curse creating a dead grid at turn start. Mitigated by the broadened
  turn-start guard and by keeping the self-lock mild; the sim's
  no-dead-grids criterion is the backstop.
- Curse balance breaking an exit criterion. Mitigated: retune curse
  values or the number of curses, re-paste the sim tables.

## Acceptance

- [ ] `ItemDef.curse` added; ~10 curses with `curse: true`, negative/cost
      hooks from existing verbs, description + flavor, a sprite each;
      boons stay unflagged. No new effect verb.
- [ ] Curses never appear in a normal offer; cursed offers only act 2+;
      1-in-5 off the rng; byte-identical replay; both pickItem grants
      fire onPick; skipOffer advances and is rejected on a normal offer.
- [ ] onTurnStart damagePlayer to 0 HP is a loss.
- [ ] SAVE_VERSION 10; v9->v10 migration; mid-cursed-pick save round-trips;
      misaligned/forged curses dropped; key set binds to newRun.
- [ ] Pick.svelte shows the curse on each option and a Leave it button on
      cursed offers only; Compendium has a Curses section and the "N to
      find" count excludes curses.
- [ ] Full sims pasted (balanced + 4 cells): curse pickup sometimes (not
      0%, not 100%), win rate NOT higher with curses available, and the
      exit criteria preserved (mediocre 20-40, greedy < 90, no dead grids,
      cells within 10 of Amoeba on balanced).

## Sim results (pasted from `npx tsx scripts/sim.ts`; filled in commit 5)

_pasted after the sim runs; measured, never typed._
