# Exec plan: consequence scaling (make endless a race that ends)

Status: CLOSED 2026-09-15. The endless curve shipped as PR #108 / build 110
(engine, adversarial APPROVE); the "encouraged to keep going" encouragement
shipped as PR #109 / build 111 (UI: the endless end screen shows the deepest
dive ever and "New best!" when beaten, from the local run history; in scope,
no leaderboard). No gentle finite tweak was needed - the finite game was left
as the power fantasy per Dean. Both measured with `npm run power` / `npm run sim`.

## The ask

Dean, 2026-09-15, after playtesting the reverted build: the original was
"overpowered but fun, and I liked that, but then it felt too overpowered
after a point." "I kind of like endless feeling endless it just didn't
scale with consequence." "A fun curve that doesn't make it too boring or
too hard to even get to endless." He asked to research Balatro / Slay the
Spire / Binding of Isaac, then: "let's pivot."

## Decisions

1. **No build-aware rubber-banding.** Research (below) is decisive: none
   of Balatro / STS / Isaac scale enemy HP to the player's build, and the
   design consensus is that doing so is an anti-pattern (it punishes the
   core loop of getting strong; strong and weak builds converge). Dropped.
2. **Depth-based curves.** Difficulty is keyed to how deep you are, fixed
   and pre-authored, so a strong build is FELT because it beats a fixed bar.
3. **Keep the finite game a power fantasy.** "Too hard to get to endless"
   is the failure to avoid; reaching slot 9 stays accessible/fun. At most a
   gentle act-3 ramp so late finite fights are ~2 words, not 1.
4. **The consequence lives in ENDLESS.** Rebuild the endless curve as a
   Balatro-style super-linear race: a victory lap for a strong build, then
   an accelerating wall that provably overtakes any build and ends the run
   at a satisfying depth. Reward = depth reached, not a win.

## Research (Balatro / STS / Isaac), the transferable principles

- Scale to DEPTH, not build. Balatro ante base-chips are a steep hand-authored
  table (300, 800, 2k, 5k, 11k, ... front-loaded ~2.5x then settling to ~1.5x);
  endless switches to a faster-than-exponential formula (~x^(x^2)) that always
  kills the run (~ante 39 overflow). STS HP is fixed per act/floor (act 1 normals
  ~40-50, elites ~80-110, bosses 140-250; act 3 bosses 300-460), never build-scaled;
  Ascension is a static opt-in dial. Isaac scales HP by floor depth only and PLATEAUS
  (Stage HP stops at floor 11), preserving the late-run power fantasy; threat late
  comes from density/champions/patterns, not HP that chases your damage.
- Let a good build outpace the curve, a weak one fall behind. Front-load steepness,
  then settle. Separate finite (winnable ~40-60% for good play) from endless (a
  survival race that ends). Never claw back overkill. Escalate via composition/variance,
  not only bigger numbers.

## Design

- **Finite (acts 1-3):** stay close to the restored curve J (the fun baseline).
  Optionally a gentle act-3 HP bump so a strong build spends ~2 words there, WITHOUT
  making it hard to reach endless. Measured against greedy/mediocre (criteria hold)
  and the stacker (should still reach endless comfortably).
- **Endless (`encounterDefFor`, index past the content list):** replace the fixed
  `base.hpScale * endlessHpGrowth^past` with a super-linear curve whose growth rate
  itself rises with `past`, e.g. `base.hpScale * (g0 + c*past)^past` (Balatro shape),
  keeping damage growth ahead of HP so deep fights end rather than becoming HP-sponge
  slogs (the existing rationale). Pure, no RNG, deterministic -> replay-safe. Add a
  hard depth cap / terminal condition so the run always resolves (Balatro's overflow
  analogue), no 600-turn tails.

## The one knob (Dean's, pure feel) — ANSWERED

Dean 2026-09-15: "that sounds right" (the ~5-10 lap, ends by 20-30) + "I want people to
be encouraged somehow to keep going." Implemented as `endlessLap = 8`,
`endlessHpAccel = 0.02` (fit on the first try). The encouragement (chase your deepest
endless run, a personal best from run history; no leaderboard, in scope) is the immediate
follow-up PR so the ending reads as an achievement, not a nerf.

## Measured result (stacker, `npm run power -- --mode endless`)

Baseline (flat 1.06^past): the stacker one-shot 93.6% of fights even at slot 40, overkill
median 2.4x, and 0/25 runs ever ended (all hit the depth cap). Endless never scaled with
consequence. After (endlessLap 8 / endlessHpAccel 0.02):

```
Endless depth reached (slot the run ended on): median 24, p90 30, max 30, min 9. 0/40 lapped the cap.
slots 10-20 stay a one-shot-heavy VICTORY LAP (overkill 1.6-3.5x); slot 21 overkill drops to 0.8
(wall bites); slots 22-24 overkill 0.3-1.0; slots 25-30 overkill ~0 (HP 4k -> 97k) and the run ends.
```

~10 slots of power fantasy past the ninth, wall bites ~slot 21, every run ends by ~24-30 (median
24), none lap the curve. The finite game is untouched (the endless branch of `encounterDefFor`
only fires past the content list).

## Tooling

Extend `npm run power` (or the sim) to drive the STACKER in ENDLESS and report the
depth reached and the overkill-per-slot curve, so the lap length and terminal depth
are measured, not guessed. The sim already supports `--mode endless` (reports median
encounter reached).

## Tasks (each measured)

1. Endless measurement: stacker in endless, depth + per-slot overkill.
2. The super-linear endless curve + terminal cap in `encounterDefFor` (+ any TUNING
   knobs). Tests: determinism/replay of an endless run; the curve is monotonic and
   terminates; a strong build's lap length matches the knob.
3. Optional gentle finite act-3 ramp if the finite game is a pure 1-word cruise.
4. Recheck `npm run sim` criteria (finite unaffected or mild); paste tables.

## Risks

- Endless formula is engine + determinism: keep it pure, seed-stable; the adversarial
  seat breaks replay. It will move the endless determinism test (fight length -> RNG ->
  slot kinds); recapture/adjust with the reviewer, as in the power-scaling wave.
- Overshoot: endless too steep (no lap, boring) or too shallow (never ends). Measure
  the lap and terminal depth against the knob before shipping.

## Acceptance

- Finite game still reachable/fun (criteria hold; stacker reaches endless comfortably).
- Endless: a measured victory lap ~ the knob, then an accelerating wall that ends the
  run at a bounded depth; no rubber-banding; overkill never clawed back mid-lap.
- `npm test`, `npm run lint`, CI green; sim + power tables pasted; adversarial APPROVE.
