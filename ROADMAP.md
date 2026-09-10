# Roadmap

The phases and their exit criteria live in
`docs/lexicell-architecture-pack.md` (Implementation Roadmap); this file
does not repeat them. It tracks what is open and what shipped, honestly:
what the gate caught and what is still open ships disclosed here.

Status: Phase 0 (headless engine + sim harness) closed 2026-09-08; Phase
1 (walking skeleton) built 2026-09-08, its exit checks still owed by Dean
(see Open). Shipped is one line per merge, newest first, in the same
order and count as the in-game release notes (`src/ui/release-notes.ts`).

Every PR updates this file before it merges: move an item from Open to
Shipped when it lands, or add a Shipped line. See CLAUDE.md, iteration
mode rule 7.

## Open

Ordered by Dean's priority.

### Phase 1 exit, Dean's own checks

The Phase 1 exit is Dean's alone; the plan moves to `completed/` when he
ticks it. Owed:

- HTTPS on the NUC.
- The `DOCKER_USERNAME` and `DOCKER_PASSWORD` secrets on the repo (the
  publish workflow builds, smokes and pushes the image once they exist).
- The home-screen install.
- Offline / airplane-mode play.
- iPhone portrait and landscape.

### harness/enforcement review

The enforcement layer of the harness (PreToolUse staging block,
session-start hook, `.claude/settings.json`, pre-commit sim smoke,
pre-push hook, the Node built-ins lint ban) sits on branch
`harness/enforcement` awaiting Dean's own review. Dean's rule: the agent
does not merge changes to its own constraints. Until it merges, CLAUDE.md
and CONTRIBUTING describe hooks that are not yet installed. Tech-debt #1
and #2 close with it.

### "Is it fun enough?"

A measured answer on word length and the letter pool, then whatever it
points at. Not yet started.

### Open disclosed residuals

- **Diatom (defensive) mediocre rate sits about 10.6 points over
  Amoeba** (35.0% against 24.4% on the shipped modes tables), just
  outside the ten-point rule. Dean's tuning call, not a bug.
- **The enrage / stun clock is a backstop, not a lever** (variety wave
  step 1). PR #66 closed the permanent stun lock (tech-debt #8: past
  `tuning.enrageAfter` a stunned enemy now attacks through the stun), so
  a stall ends with the clock; the clock still only guarantees an end
  while the enemy attacks.
- **The four RNG-gated grid selection guards in PR #65** (`goldTiles`
  and `crackTiles` never re-mark or pick an already-played tile; a
  crumble is computed after the lock tick) are covered by the statistical
  cracks probe (839 turns, all counters zero) rather than seed-fixed unit
  tests (tech-debt #9, OPEN). A regression would show as a non-zero
  counter over many turns, not a failed fixed-seed case.
- **The effects wave still owes a 10,000-run per-item impact table.** The
  3000-run tables catch degenerate and never-picked items only; the
  two-point reskin rule is not measurable at that sample.
- **Act-2 / E9 tuning deferred from the Phase 0 spike.** Largely
  addressed since by curves C (PR #19) and D (PR #41) and revisited every
  wave (G, H, J); carried here as the residual the Phase 0 close named.
- **Phase 0 engine commits (through 9f63d34) landed before the harness**
  (tech-debt #1, OPEN), staged with `git add -A` and no reviewer gate.
  Closes with the harness/enforcement review above.

### Backlog / future ideas (Dean, 2026-09-10, recorded not scheduled)

Not on the plan, not costed, not committed. Written down so they are not
lost.

- **Vary the item sprite pool.** Addressed (PR #79, build 81). The
  templated glyph kinds ignored the per-item seed, so 210 item PNGs held
  only 101 unique images (five kinds - drop, wave, spike, star, shield -
  were byte-identical across every item that used them). `template_rows`
  now reads the seed in every branch (jittered size, count, position,
  emblem and highlight accents), keeping the programmatic placeholder
  style Dean likes. After regeneration all 210 PNGs are unique by md5
  (101 -> 210, zero residual duplicates). Still placeholder art; real art
  is a separate future job.
- **Sound.** Shipped. The audio engine and Sound / volume control landed
  in build 82 (PR #80); the effects were resynthesized soft and calm and
  the background music track ("Before the Surge") landed in build 83
  (PR #81), looped gaplessly and mixed low under the effects. Native Web
  Audio, no dependency. Future polish (per-screen tracks, more effects) is
  optional and unscheduled.
- **A custom domain or redirect for the play link** (for example
  lexi.cell), instead of the raw github.io URL.
- **Publish to an app store** of some kind.
- **A public leaderboard**, for the public online (GitHub Pages) version
  only. Explicitly not part of the self-hosted build.

## Shipped

One line per merge, newest first, matching `src/ui/release-notes.ts` in
order and count. Sim tables and full gate narratives live in the exec
plans (`docs/exec-plans/completed/`) and the release notes; this list is
the honest index.

- **build 85 / PR #83** - Always-available Settings page (UI only, no engine or RunState-save change; audio.ts is UI): a Plasma gear in the persistent top bar opens Settings from every screen (title, cell pick, fight, pick, summary, help), sitting beside Menu on the run screen at matching height so the fight footprint and the 100svh no-scroll budget (PR #67) are untouched. The audio engine's single master mute/volume is split into independent sound-effects and music buses, each with its own user gain and mute (setSfxMuted/setSfxVolume/setMusicMuted/setMusicVolume); music level is MUSIC_LEVEL * musicVolume, and changes settle with setTargetAtTime so nothing clicks. The gapless loop, lazy AudioContext and soft synthesis are unchanged. Settings hosts sound-effects mute + volume, music mute + volume, the legible-text switch (moved off How to play, which is pure instructions now), and a Submit a bug mailto to dean@tamm.am prefilled with a template and the build + sha. The per-device settings blob is now { readable, sfxMuted, sfxVolume, musicMuted, musicVolume }; loadSettings maps an old { readable, sound, volume } blob onto both buses (sound:false mutes both, volume fills both) and a { readable }-only blob still loads, all validated and clamped per field. Verified fitting 390x844 with no scroll and the gear present on the title and in a fight via the headless render harness. npm test 335/335, npm run lint clean.
- **build 84 / PR #82** - Seamless music loop (UI/asset only, no engine or save change): theme.mp3 ("Before the Surge") is through-composed - a quiet fade-in, a long dynamic body, then an outro fade to silence - so wrapping end to start restarted the intro every ~3.5 minutes. A self-similarity analysis of the decoded waveform (RMS envelope plus a zero-crossing-constrained cross-correlation over the body) picked loop points, now set on the AudioBufferSourceNode: `loopStart = 6.440862`, `loopEnd = 200.685669` (both seconds), starting playback at offset 0 so the intro plays once, then [6.44s, 200.69s] repeats forever and the ending is never reached. The 194.24s loop is 94% of the body; both endpoints are rising zero-crossings at matched loudness (0% level jump), so the wrap does not click. Guarded to fall back to looping the whole buffer if it is ever shorter than loopEnd. Also bumped `MUSIC_LEVEL` 0.28 -> 0.37 (Dean: a touch louder). `npm test` and `npm run lint` green. Only Dean's ear can confirm the loop is inaudible.
- **build 83 / PR #81** - Sound effects resynthesized soft and calm (Dean: the first pass was too bleepy and abrupt): sine bodies, muffled filtered noise, gentle envelopes, a bus lowpass and a small reverb. Also lands the background music track (public/audio/theme.mp3, "Before the Surge"), looped gaplessly and mixed low under the effects.
- **build 82 / PR #80** - Audio engine (UI only, no engine or save change): a native Web Audio singleton (`src/ui/audio.ts`), no third-party audio dependency. The AudioContext is created lazily on the first pointer/click (iOS Safari blocks audio before a gesture); every method no-ops where Web Audio is absent, so importing it in a test does nothing. Ten procedural sound effects synthesized from oscillators plus a filtered-noise buffer with fast ADSR envelopes, in a single per-effect params table: tileSelect, tileDeselect, wordLand, damage, defeat, win, lose, itemPick, curseTaken, tap. A pure `sfxForTransition(prev, next)` in `src/ui/audio-events.ts` maps a state delta to effect names and is unit tested without any audio. Music is decode-then-loop (fetch + decodeAudioData into an AudioBuffer, looped gaplessly), fetched from `${BASE_URL}audio/theme.mp3`; the track file is not in the repo, so music stays silently off until Dean drops `public/audio/theme.mp3` (README there). A Sound on/off toggle and a volume slider on the How to play screen persist per device in Settings (v-less, back-compatible with old `{readable}`-only blobs). `npm test` and `npm run lint` green.
- **build 81 / PR #79** - Sprite variety (content/tooling only, no engine, save or UI logic): `scripts/sprites.py` `template_rows` now derives real per-item variation from the seed in every kind - ring radius/thickness/core, blob and cluster counts, rod lean and cap, tilted drop tails, wave amplitude/period/phase, radial spike and star counts and rotation, shield width and an engraved emblem, plus up-left highlight accents and an occasional mirror. Five kinds (drop, wave, spike, star, shield) had been byte-identical across every item that used them. Regenerating all item PNGs took md5-unique glyphs from 101/210 to 210/210 (zero duplicates), keeping the same placeholder pixel style. `npm test` 315/315, `npm run lint` clean.
- **build 80 / PR #78** - Variety wave step 8, daily challenge (UI plus a history-schema bump, no engine or RunState-save change): the title now offers a daily run on a deterministic seed derived from the date (a uint32 multiplicative hash of the same day number the word of the day uses, so both flip together at UTC midnight; same day means the same run on every device). It starts the default cell in normal mode, Wordle-style. One run per day: a single localStorage slot (`lexicell.daily`) holding the day number is written the moment the daily starts, so starting then abandoning still counts and it cannot be farmed; the control shows a locked "done" state with the outcome until the date rolls over. History marks daily runs (`readonly daily: boolean`), so HISTORY_VERSION bumped 1 -> 2 with a migration that fills `daily:false` on old entries. This closes the variety wave: steps 1-8 all shipped (PRs #61, #62, #64, #65, #66, #76, #77, #78). Verified fitting 390x844 with no scroll in both the available and done states via the headless render harness.
- **build 79 / PR #77** - Variety wave step 7, share card and copy-seed (UI only, no engine or save change): the post-run summary is now a screenshot-ready card tinted by the act reached, wearing the cell's body sprite for that act, showing the seed, the best word and its damage, the organelles as glyphs, and the best word's definition. A Copy button copies the seed (navigator.clipboard with a synchronous textarea/execCommand fallback); a Share button calls navigator.share with a one-line result summary and the play link, falling back to copying that line where the API is absent. The cell picker gains an optional Seed input (blank or invalid rolls a random seed as before, a run of digits clamps to uint32), and the summary gains Replay this seed, so copy-seed and new-run-from-seed round-trip: same seed and cell replays the same run. No canvas, no generated image (both out of scope). Card and picker verified fitting 390x844 with no scroll via the headless render harness.
- **build 78 / PR #76** - Variety wave step 6, curses: after act 1 about one in five normal post-fight and post-boss offers arrives cursed (seeded off the run RNG, save bumped to v10), every option carrying a boon AND an attached curse built from ten inverted existing verbs; take one pair or Leave it. Elite, event, rest and starting offers are never cursable. Sim (500 runs/bot, seeds 0..499, balanced): all exit criteria PASS - mediocre 23.4% (band), greedy 83.4% (< 90), no dead grids; pickup sometimes-not-always (greedy 49.8%, mediocre 99.4%, solver 62.7%) and every balanced delta negative (curses never raise the win rate). Tuning during the wave: the compounding curses were softened (Hemorrhage 1/turn, Thin Skin +2/hit, Shackle 1 tile) and the mediocre bot's curse margin went negative once the sim showed that leaving a cursed offer, which replaces a normal one, forfeits the boon and hurts the weak player more than the curse does. Disclosed residual (tracker #10): the gambler cell greedy sits ~11pp above Amoeba, a PRE-EXISTING cell-balance gap (11.0pp in the no-curse baseline), not caused by curses.
- **build 76 / PR #74** - Title-screen logo enlarged (the wordmark CSS width no longer collapses against its shrink-wrapped parent); the title build number now reads from RELEASE_NOTES so it matches the Release notes page on both the Pages and Docker builds (was the Pages CI run count, e.g. 59, versus the Docker count).
- **build 75 / PR #73** - GitHub Pages deploy concurrency fixed: `cancel-in-progress: false` so back-to-back merges queue instead of orphaning a deployment (builds 72-74 had been blocked on the play link; the Docker image was always current). Cause and manual recovery documented in `docs/deploy.md`.
- **build 73 / PR #71** - README intro restructured to say what the game
  is, what inspired it (word games plus Binding of Isaac, Balatro and
  Slay the Spire, a Plague Inc theme, an Earthbound look) and how it was
  built. Docs only, no game change.
- **build 72 / PR #70** - README cover image cleaned up: the wordmark on
  a solid ground with no stray white border. Docs only.
- **build 71 / PR #69** - README intro tells where the game came from.
  Docs only.
- **build 70 / PR #68** - A real README: cover image, phone screenshots,
  a short guide to running your own copy. Docs only.
- **build 69 / PR #67** - Portrait phone fit: the whole game fits a
  portrait phone with no scroll, iOS Safari chrome included; a long enemy
  name ellipsizes instead of shoving the HP number out of its box.
- **build 68 / PR #66** - Endless mode, chosen with the cell (save v9; a
  v8 save migrates as normal). Endless generates every slot past the nine
  from act 3's pools, a boss every third, HP and damage grown per slot.
  Gate (adversarial, engine + save): Endless surfaced three engine bugs,
  all fixed here. An on-hit heal fired before the death check, so every
  "heal when hit" organelle made the player unkillable by attacks (every
  balance table before this entry was tuned against that bug); curve J
  re-tunes acts 2-3, and the strong bot's Amoeba rate rose 67% to 84%,
  disclosed as the honest cost. A stun past enrage now attacks through
  (tech-debt #8 closed). A turn-start redraw that leaves a dead grid now
  scrambles. Disclosed: Spore FAILs both criteria (mediocre 19.8, greedy
  95.6, a lever for Dean); Endless runs out of traits after twelve;
  sprites and palettes clamp to act 3.
- **build 67 / PR #65** - Gold and cracked tiles (save v8; a v7 save
  migrates plain). A gold tile adds damage when played (Midas Membrane
  trait); a cracked tile is a timer that refills on crumble (Diatom Swarm
  cracks two every second turn). Also fixed a long enemy name overrunning
  its HP figure.
- **build 66 / PR #64** - Evolution: a trait pick after each boss, three
  offered, twelve traits (save v7; a v6 save migrates with none). Gate
  (adversarial, REQUEST CHANGES then fixed): a trait id content later
  drops would throw from every hook of a saved run; persist now drops
  item and trait ids content no longer has and refuses an empty pick or
  evolve. Four unbound tests and chooseTrait bound; 17,569 replayed steps
  with 0 mismatches, 607 real v6 saves migrated, 26 mutants killed.
- **build 65 / PR #63** - The in-game Release notes page: every merge
  since the first commit, newest first, with PR and build numbers, in
  `src/ui/release-notes.ts` behind a test that keeps the order and
  numbering honest. Added CLAUDE.md iteration rule 6 (every PR adds its
  note at the top before merging).
- **build 64 / PR #62** - Encounter types (save v6; a v5 save migrates as
  fights): one elite, one rest and one event inside the nine, placed by
  the seed; eight event trades in `src/content/events.ts`. Gate
  (adversarial, REQUEST CHANGES then fixed): a save on a dropped event id
  soft-locked the run (now the walk-away); event effects moved to written
  order; a max-HP cut no longer counts as damage taken; two unbound tests
  bound; 120 runs with 0 mismatches, 45 real v5 saves migrated. Disclosed:
  a turn-start self-damage organelle can kill at 1 HP after a trade;
  forged saves can misplace a kind.
- **build 63 / PR #61** - Twelve enemies in three act pools, three
  bosses, three enemy traits (armour, regen, hunger), damage rolls inside
  a seed-replayable range, an enrage clock past turn 20. No save change.
  Gate (adversarial, REQUEST CHANGES then fixed): the damage preview
  ignored armour (bots saw 11 where 5 landed against Tardigrade King);
  seven mutants bound. Open at the time: the enrage clock only guarantees
  an end while the enemy attacks (tech-debt #8, since closed by #66);
  Mycelium's mediocre rate at the ten-point band edge.
- **build 62 / PR #60** - The variety plan: nine levers on paper in
  Dean's order (enemies, ranges, encounter types, evolution, grid rules,
  Normal and Endless, curses, a share card, a daily seed). Plan
  `docs/exec-plans/active/variety-wave.md`.
- **build 61 / PR #59** - Phone fit, second pass: the after-a-word state
  fits a 390x780 phone (one stat per row, a two-line report, a shorter
  stage). Rendered before and after.
- **build 60 / PR #58** - Phone fit: shorter status-row labels and intent
  strings, badges hidden on small grids; the first change verified with a
  real 390x780 headless render instead of a guess.
- **build 59 / PR #57** - Cellular sprites: membrane, nucleus and
  organelle dots on every creature, and a body per starting cell per act,
  from `scripts/sprites.py`.
- **build 58 / PR #56** - Best and worst word HUD (save v5; a v4 migrates,
  v3 chains through). Gate: a migrated save showed an empty WORST until
  the next word (now a dash); ties and zero-damage words bound; persist
  type-checks the stats. Disclosed: a migrated run's worst word covers
  only words played after the update; history and CSV carry the best word
  only.
- **build 57 / PR #55** - Clarity: an enemy intent line, names shown once,
  a veil over the backdrop, the report stepping one line per turn, grafts
  glowing when they fire; prose moved to DotGothic16.
- **build 56 / PR #54** - Paperwork: two finished plans filed under
  completed. No game change.
- **build 55 / PR #53** - Starting cells (save v4; a v3 save loads as
  Amoeba, the first migration on record): five cells with stats and
  always-on hooks. Gate (adversarial, two rounds): no runtime defect;
  four binding gaps closed; one design gap fixed (a cell's starting items
  now fire onPick); 300 runs byte-identical to base on the balanced cell.
- **build 54 / PR #52** - The Bookends mark: a gold pixel wordmark and
  square mark from `scripts/logo.py`; favicon, apple-touch and PWA icons,
  the wordmark on the title.
- **build 53 / PR #51** - Run history with export (`lexicell.history` v1,
  cap 200): JSON and CSV downloads, a History screen, per-run detail;
  reducer and RunState untouched. Fixed the title still offering Continue
  after a finished run. Gate: adversarial round on history.ts and the
  store hook.
- **build 52 / PR #50** - The missed-word reveal names only words gone
  from the new grid, never one still spellable (it had read as a cheat).
- **build 51 / PR #49** - "Tiles do not need to touch" said outright on
  the How to play card and the first-fight hint (a tester had played
  Boggle rules).
- **build 50 / PR #48** - Two plans on paper (run history, starting
  cells) with numbered questions for Dean.
- **build 49 / PR #47** - The item pool reaches 200 (90 / 60 / 38 / 12),
  curve F, the one final-pool tuning pass. The 3000-run table caught a
  lifesteal family and Pressure; fractions and heals trimmed. Left open:
  a 10,000-run per-item table for the two-point reskin rule. Effects wave
  closed; plan in `completed/`.
- **build 48 / PR #46** - Readable: two-signal tiles (yellow vowel, pink
  rare edge), a How to play card, a Readable type toggle, ligatures off
  ("find" had read as "And").
- **build 47 / PR #45** - Organelles batch two: 45 items in synergy pairs
  to 157; harness fixes (a shuffles column split from scrambles,
  `scripts/item-impact.ts`). The per-item table caught three degenerate
  items and four traps, all trimmed.
- **build 46 / PR #44** - Landscape fit: two columns and no scrolling to
  reach the Attack button. Not verified on a device.
- **build 45 / PR #43** - Bookkeeping: the Open list rewritten in Dean's
  order; three design pillars written into the pack.
- **build 44 / PR #42** - Keyboard play on desktop: type the letters,
  Backspace undoes, Enter attacks, Escape clears.
- **build 43 / PR #41** - Effects on screen, batch one: the shield on the
  HP bar, poison and stun badges, a free shuffle; 40 items to 112; acts
  2-3 harder (curve D). The per-item table caught Paralytic (a permanent
  lock, now every second turn). Tech-debt #7 closed. Greedy fell 78% to
  66%, disclosed.
- **build 42 / PR #39** - The effects engine: nine verbs, seven
  conditions, the onPick hook, save v3 (v2 dropped), at most two commons
  per offer. Gate (adversarial, two rounds): a perUnit cap bug and six
  binding gaps fixed. The mediocre criterion FAILed with the unchanged 72
  items (tech-debt #7, closed by #41). Disclosed: the bots' free-shuffle
  rule is nearly inert and the scrambles column conflates shuffles (S7,
  harness work).
- **build 41 / PR #38** - Type by role: Press Start 2P for tiles, the
  word line, HUD and buttons; Pixelify Sans for headings and prose.
- **build 40 / PR #37** - A log line: the type lab written into the
  playtest log.
- **build 39 / PR #36** - Numbers you can read: DotGothic16 for every
  digit, none under 16px, tabular figures.
- **build 38 / PR #35** - CI once per commit (pull_request only); the push
  twin of a green run had failed jobless and tripped the merge watcher.
- **build 37 / PR #34** - Fit any viewport after an iPhone 17 playtest: a
  hidden-scrollbar fallback, a two-column landscape, a grid floor, no
  double-tap zoom. Not verified on the device.
- **build 36 / PR #33** - Scope change: the v1 item pool goes to 200; the
  effects wave plan opened with six questions for Dean.
- **build 35 / PR #32** - The intro grid reads LONG WORD HITS HARD (it had
  spelled something else).
- **build 34 / PR #31** - Mythic tier: a fourth rarity, eight rule-bending
  mythics to 72 items. Gate (adversarial, one round): the reduceDamage
  floor, Sheath's odd/even turns and the mythic offer weight all bound.
  Disclosed: "22% pick a mythic" is a bot artefact (tech-debt #6, closed
  by #39).
- **build 33 / PR #30** - Item pool 24 to 50, each with a scripted glyph;
  three sustain items trimmed.
- **build 32 / PR #29** - Grafts: every carried organelle shows on your
  body in the arena.
- **build 31 / PR #28** - Shiver: pixel body text, a shiver on a few
  tiles, an intro that spells its own lesson.
- **build 30 / PR #27** - Flavor: one line of voice per organelle, kept
  apart from what it does.
- **build 29 / PR #26** - The compendium: every organelle on the title
  screen, grouped by rarity.
- **build 28 / PR #25** - No scrollbar: the fight screen clips instead of
  scrolling; the grid absorbs the difference.
- **build 27 / PR #24** - Item pool 10 to 24: fourteen items; sustain
  trimmed, flat items raised; the mediocre bot learned to read an offer.
  Disclosed: mediocre 17.8% at 500 runs, 2.2 under the band.
- **build 26 / PR #23** - The pixel voice: the pixel face as the game's
  voice, a system sans for running text.
- **build 25 / PR #22** - Item icons: ten hand-drawn glyphs toned by
  rarity.
- **build 24 / PR #21** - Legibility: Atkinson Hyperlegible for letters,
  words and names, pixels for numbers. Later reverted.
- **build 23 / PR #20** - Plasma: a design language with tokens every
  component uses, a deep violet ground, cyan life, gold score.
- **build 22 / PR #19** - The tuning wave: the boss lock lands on
  surviving tiles (tech-debt #5 closed), venom (the Polyp), acts 2-3
  retuned (curve C), save v2 (v1 dropped). All three measurable Phase 0
  criteria pass at 500 runs for the first time.
- **build 21 / PR #18** - Deploy note: a merge to main deploys to Docker
  Hub and GitHub Pages by itself.
- **build 20 / PR #17** - The intro scene: pond, portal, arrival, with the
  sprites.
- **build 19 / PR #16** - An intro: one screen after New run naming the
  pick and the fight.
- **build 18 / PR #15** - GitHub Pages: the same bundle at
  dtammam.github.io/lexicell on every merge.
- **build 17 / PR #14** - Earthbound pass: cycling palettes, seamless
  layers, enemies that float their own way.
- **build 16 / PR #13** - The word you missed: after each attack, the best
  word the grid held.
- **build 15 / PR #12** - Damage preview: the word line and Attack button
  show the hit before you commit.
- **build 14 / PR #11** - You evolve: three player forms, one per act.
- **build 13 / PR #10** - Build numbers: the build stamp reads "build N"
  with the sha.
- **build 12 / PR #9** - The playtest log: every perception and request
  with a next step.
- **build 11 / PR #8** - Items named for a cell: Flagellum, Vacuole,
  Plasmid.
- **build 10 / PR #7** - Battle backdrop: an Earthbound-style backdrop
  behind the arena.
- **build 9 / PR #6** - Tiles at a glance: colour by letter class, serif
  capitals.
- **build 8 / PR #5** - The game never scrolls: one viewport tall, the
  grid takes whatever is left.
- **build 7 / PR #4** - Build stamp: a sha on the title screen.
- **build 6 / PR #3** - Gravity: survivors rise, fresh tiles land below
  and animate in; value badges gone. Gate (one adversarial round) found
  the boss lock lost on most specials (tech-debt #5, fixed by #19).
- **build 5 / PR #2** - Docker context fix: the image build could not see
  scripts/lib; PR CI now builds the image too.
- **build 4 / PR #1** - The feel wave: definitions for played words, a
  title screen, an arena, a shuffle that costs the turn, a dependency diet
  (557 to 233 packages). Gate (one adversarial round): five findings
  fixed; 40,276 replayed steps with 0 mismatches. Iteration mode begins
  here.
- **build 3** - Dev build on the LAN via code-server's proxy.
- **build 2** - Local play: the dev and preview servers bind every
  interface.
- **build 1 / walking skeleton** - A Svelte shell over the engine, a saved
  run in localStorage, a PWA manifest and service worker, an nginx image,
  the publish workflow. Gate (one adversarial round, APPROVE with two
  warnings then re-APPROVE): a mistyped save loaded and threw (now
  refused); binding gaps closed. The Docker image is unbuilt until Dean
  adds the repo secrets. The Phase 1 exit is Dean's.
- **Act 1 eased, Phase 0 closed** (052ef0f) - A starting kit, act 1
  softened, greedy capped at 7. The headless engine met its exit criteria.
  Gate (act-1 wave, one adversarial round): three binding gaps fixed.
  Greedy 91.0% against the sub-90% bar, ruled noise at n=500.
- **Rulings on record** (1d833a2) - Dean's decisions written into the
  docs, not only into a session's memory.
- **Handoff** (68986d9) - Branch state, next step and a resume prompt for
  a paused session.
- **Lean mode** (a6ec1bd) - The reviewer seats, exec plans, a tech-debt
  tracker, explicit staging, no em dashes. The harness docs; enforcement
  still sits on its own branch (Open).
- **Length bonus in content** (9f63d34) - The length-bonus table moved
  beside the HP curve, where tuning lives.
- **Candidates** (24efb16) - Effects resolved once, tiles mapped only for
  the chosen word. The sim got fast.
- **The sim harness** (da454bc) - Two bots, seeded runs, exit criteria
  printed under the table.
- **The reducer** (32490cb) - The full run loop through one mutation path.
- **The grid** (79adb44) - Frequency-weighted draws, a vowel floor,
  solver-checked fresh grids.
- **Enemies as content** (95d0cf8) - Enemies, a boss and the encounter
  curve as data, not engine.
- **Hooks and ten items** (c96905c) - Items hook into the turn;
  acquisition order in, fixed order out.
- **Effects and scoring** (50dc9d4) - The effect vocabulary and scoring
  formula, in a fixed order, conditions flattened before they apply.
- **The solver** (209addf) - A multiset scan with precomputed masks, no
  trie.
- **The dictionary** (97f215d) - A filtered ENABLE list shipped as text,
  its source hash pinned.
- **The RNG** (2c1698e) - Seed and counter carried in state, advanced in
  constant time; replays are exact because of this commit.
- **First commit** (134f4c5) - A headless TypeScript engine with lint
  rules that keep it pure.

The Phase 0 engine commits (through 9f63d34) landed before the harness
existed; see tech-debt #1, still open.
