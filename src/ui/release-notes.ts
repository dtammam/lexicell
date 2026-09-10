/**
 * Release notes (Dean, 2026-09-09): every merge to main since the first commit, newest first,
 * in plain words. Each entry names its pull request and the build number the title screen
 * shows for it (the Docker publish run number; one run per merge, so the next merge is the
 * last build plus one). The first sixteen merges predate the publish workflow and carry no
 * build. Maintained by hand: every PR adds its entry at the TOP before it merges; the test
 * beside this file keeps the order and the numbering honest.
 */
export interface ReleaseNote {
  /** Docker publish run number, what the title screen calls "build N"; null before builds existed. */
  readonly build: number | null;
  /** GitHub pull request number; null for the branch merges before the repository used PRs. */
  readonly pr: number | null;
  /** Short sha of the merge (or the commit) on main. */
  readonly sha: string;
  /** ISO date of the merge. */
  readonly date: string;
  readonly title: string;
  /** One to three plain sentences for a player. */
  readonly notes: string;
}

export const RELEASE_NOTES: readonly ReleaseNote[] = [
  { build: 79, pr: 77, sha: 'pending', date: '2026-09-10', title: 'Share your run', notes: "The end-of-run summary is now a card you can screenshot, tinted by the act you reached and showing your cell, best word and organelles. Copy the seed or hit Share, and start a run from a pasted seed so two people can play the exact same run." },
  { build: 78, pr: 76, sha: 'ec243f0', date: '2026-09-10', title: 'Curses', notes: "After act 1, an offer sometimes comes cursed: every option drags a downside along with it, so you take the good with the bad or leave the whole offer. The compendium lists the ten curses in their own section." },
  { build: 77, pr: 75, sha: '95af908', date: '2026-09-10', title: 'Logo in the header', notes: "The app header now shows the Lexicell logo instead of the word, at the same size, so it reads at a glance during a run. Nothing else changed in the game." },
  { build: 76, pr: 74, sha: '4833fd9', date: '2026-09-10', title: 'Bigger logo', notes: "The Lexicell logo on the title screen is a proper size now, and the build number shown there matches the release notes on every version. Nothing else changed in the game." },
  { build: 75, pr: 73, sha: '3ef5bce', date: '2026-09-10', title: 'Deploys stop colliding', notes: "Fixed the web deploy so back-to-back updates no longer block each other; a few builds had been slow to reach the play link. Nothing changed in the game." },
  { build: 74, pr: 72, sha: '11aaf3d', date: '2026-09-10', title: 'Honest roadmap', notes: "The roadmap is accurate again and there is a public backlog of what is coming. Nothing changed in the game." },
  { build: 73, pr: 71, sha: '92e74f6', date: '2026-09-10', title: 'What, why, how', notes: "The README intro now says what the game is, what inspired it (word games plus Binding of Isaac, Balatro and Slay the Spire, with a Plague Inc theme and an Earthbound look), and how it was built. Nothing changed in the game." },
  { build: 72, pr: 70, sha: '4e054df', date: '2026-09-10', title: 'Cleaner cover', notes: 'The README cover image is cleaner now: the wordmark on a solid ground with no stray white border. Nothing changed in the game.' },
  { build: 71, pr: 69, sha: 'f9f234c', date: '2026-09-10', title: 'The story behind it', notes: "The README's intro now tells where the game came from: the Bookworm Adventures loop, roguelike run variety from Binding of Isaac and Balatro, a Plague Inc theme, a Plasma look with Earthbound in it, and the word-game pull of Wordle and Words With Friends. Nothing changed in the game." },
  { build: 70, pr: 68, sha: 'dd8b5f6', date: '2026-09-10', title: 'A proper README', notes: 'The project has a real README now, with a cover image, phone screenshots and a short guide to running your own copy. Nothing changed in the game itself.' },
  { build: 69, pr: 67, sha: 'a91d9d6', date: '2026-09-10', title: 'Fits your phone', notes: 'The whole game now fits a portrait phone screen without scrolling, even in iOS Safari with its address bar and toolbar showing. Long enemy names no longer shove the HP number out of its box; the name trims with an ellipsis instead.' },
  { build: 68, pr: 66, sha: '45b5d31', date: '2026-09-10', title: 'Endless mode', notes: 'Pick Normal or Endless with your cell. Normal is the nine encounters you know. Endless keeps going past the ninth: the deep sends its creatures on a curve that grows every fight, a boss every third, an evolution after each, until the deep takes you. History records how far you got.' },
  { build: 67, pr: 65, sha: '5371400', date: '2026-09-09', title: 'Gold tiles and cracked tiles', notes: 'The grid learns two new tricks. A gold tile adds damage when you play it (the Midas Membrane trait makes one each turn). A cracked tile is on a timer: play it before it crumbles and a fresh letter drops in its place. The Diatom Swarm cracks two tiles every third turn.' },
  { build: 66, pr: 64, sha: '38ef168', date: '2026-09-09', title: 'Evolution', notes: 'Beat a boss and your body changes. Three traits are offered, you keep one for the run: a thicker membrane, venom glands, a taste for rare letters, an adrenal rush below 40% HP. A trait is always on and applies before your organelles.' },
  { build: 65, pr: 63, sha: '5aade7a', date: '2026-09-09', title: 'Release notes', notes: 'This page. Every build since the first commit, newest on top, in plain words. Scroll down for the archaeology.' },
  { build: 64, pr: 62, sha: 'ab36539', date: '2026-09-09', title: 'Elites, rests and events', notes: 'Nine encounters are no longer nine fights. Each run hides one elite (a creature from the next act, with a rare organelle for beating it), one quiet pool where you heal or take an organelle, and one small trade you can take or leave. The seed decides where they fall.' },
  { build: 63, pr: 61, sha: '1a9e1cf', date: '2026-09-09', title: 'Twelve enemies, three bosses, damage ranges', notes: 'Four enemies per act and a boss for each, with traits: armour halves short words, regen heals between turns, hunger hits harder every turn. Enemy hits now roll inside a range you can read on the intent line. Fights that drag past turn twenty get an enrage clock.' },
  { build: 62, pr: 60, sha: '257fd04', date: '2026-09-09', title: 'The variety plan', notes: 'Testers were finishing runs and asking for more. Nine levers went on paper in the order Dean chose: enemies, ranges, encounter types, evolution, grid rules, Normal and Endless modes, curses, a share card, a daily seed.' },
  { build: 61, pr: 59, sha: '9120458', date: '2026-09-08', title: 'Phone fit, second pass', notes: 'After a word the report, the definition and the missed word all fit a 390 pixel phone. One stat per row, a two-line report, a shorter stage.' },
  { build: 60, pr: 58, sha: 'b280271', date: '2026-09-08', title: 'Phone fit', notes: 'An iPhone screenshot showed the grid squeezed to its floor by a wrapping status row. Shorter labels, shorter intent strings, badges hidden on small grids. The first change verified with a real phone-sized render instead of a guess.' },
  { build: 59, pr: 57, sha: 'e3a645c', date: '2026-09-08', title: 'Cellular sprites', notes: 'Membranes, nuclei and organelle dots on every creature, and a body of your own for each starting cell in each act. Predator spikes, Diatom facets, Spore dots, Mycelium threads.' },
  { build: 58, pr: 56, sha: 'cc8808b', date: '2026-09-08', title: 'Best and worst word', notes: 'The arena keeps score of your best word and your worst. Your worst gets its own line on the summary too, which is only fair.' },
  { build: 57, pr: 55, sha: '52fc4f3', date: '2026-09-08', title: 'Clarity', notes: 'The enemy tells you its next move. Names appear once. A veil calms the backdrop. The turn report steps in one line at a time, and the organelles that fire for your selected word glow gold. Prose moved to a face you can actually read.' },
  { build: 56, pr: 54, sha: 'ad0dc1f', date: '2026-09-08', title: 'Paperwork', notes: 'Two finished plans filed under completed. Nothing changed in the game.' },
  { build: 55, pr: 53, sha: '86ac2a7', date: '2026-09-08', title: 'Starting cells', notes: 'Pick who you are before the first fight: Amoeba, Predator, Diatom, Spore or Mycelium, each with its own HP and a built-in quirk. All five tuned to win within ten points of each other.' },
  { build: 54, pr: 52, sha: 'ac6a0cc', date: '2026-09-08', title: 'The Bookends', notes: 'Lexicell has a mark: a gold pixel emblem, the wordmark on the title, icons for your home screen. Dean picked it from four rounds of candidates.' },
  { build: 53, pr: 51, sha: '4b12e37', date: '2026-09-08', title: 'Run history', notes: 'Every finished run is remembered on your device: outcome, encounters reached, best word, organelles, seed. Export as JSON or CSV. Abandoned runs count too.' },
  { build: 52, pr: 50, sha: '61200c3', date: '2026-09-08', title: 'No more free hints', notes: 'The "best word that was there" reveal only names words that are gone now. Dean noticed it was quietly cheating for you.' },
  { build: 51, pr: 49, sha: '391e974', date: '2026-09-08', title: 'Tiles do not need to touch', notes: 'Said out loud on the How to play card and in the first fight. A tester had been playing Boggle rules the whole time.' },
  { build: 50, pr: 48, sha: '817bd82', date: '2026-09-08', title: 'Two plans', notes: 'Run history and starting cells on paper, with numbered questions for Dean.' },
  { build: 49, pr: 47, sha: 'bd73879', date: '2026-09-08', title: 'Two hundred organelles', notes: 'The pool reaches 200: 90 common, 60 uncommon, 38 rare, 12 mythic. A 3000-run table caught a lifesteal engine and a permanent stun lock before you did.' },
  { build: 48, pr: 46, sha: 'ff6fc15', date: '2026-09-08', title: 'Readable', notes: 'Tiles carry two signals only (yellow is a vowel, a pink edge is a rare letter), a How to play card with the legend, a Readable type toggle for anyone the pixel face fights, and no more ligatures turning "find" into "And".' },
  { build: 47, pr: 45, sha: 'd8e9bed', date: '2026-09-08', title: 'Organelles, batch two', notes: 'Forty-five more organelles built in pairs that want each other. 157 in the pool.' },
  { build: 46, pr: 44, sha: 'a3f6866', date: '2026-09-08', title: 'Landscape fits', notes: 'A phone held sideways gets two columns and no scrolling to find the Attack button.' },
  { build: 45, pr: 43, sha: '81ba057', date: '2026-09-08', title: 'Bookkeeping', notes: 'The open list rewritten in Dean’s order and three design pillars written into the pack.' },
  { build: 44, pr: 42, sha: 'd96ca14', date: '2026-09-08', title: 'Keyboard play', notes: 'On a desktop, type the letters. Backspace undoes, Enter attacks, Escape clears.' },
  { build: 43, pr: 41, sha: '262af8d', date: '2026-09-08', title: 'Effects on screen, batch one', notes: 'Shields ride the HP bar, poison and stun badge the enemy, a free shuffle costs nothing. Forty new organelles bring the pool to 112, and acts 2 and 3 got harder to match.' },
  { build: 42, pr: 39, sha: 'ebe4f67', date: '2026-09-08', title: 'The effects engine', notes: 'Nine new verbs (poison, stun, shield, lifesteal, free shuffles, redraws, letter weights, max HP, per-thing scaling) and seven conditions. Organelles can finally bend the rules instead of only adding numbers. Offers never hold three commons.' },
  { build: 41, pr: 38, sha: 'aa5c1a1', date: '2026-09-08', title: 'Type by role', notes: 'Dean’s pick from the type lab: Press Start 2P for tiles, the word line, HUD and buttons; Pixelify Sans for headings and prose.' },
  { build: 40, pr: 37, sha: 'bdf9bbc', date: '2026-09-08', title: 'A log line', notes: 'The type lab written into the playtest log.' },
  { build: 39, pr: 36, sha: '23a847a', date: '2026-09-08', title: 'Numbers you can read', notes: 'DotGothic16 for every number, no digit under 16 pixels, tabular digits. Dean could not tell a 3 from an 8.' },
  { build: 38, pr: 35, sha: 'a12ab06', date: '2026-09-08', title: 'CI once per commit', notes: 'The push twin of every check run had been running everything twice and once failed for no reason. Pull requests only now.' },
  { build: 37, pr: 34, sha: '460e2d7', date: '2026-09-08', title: 'Fit any viewport', notes: 'An iPhone 17 lost the top in portrait and the buttons in landscape. Hidden scrollbars as a fallback, a two-column landscape, a grid floor, no double-tap zoom.' },
  { build: 36, pr: 33, sha: 'f748a42', date: '2026-09-08', title: 'Two hundred is the number', notes: 'Scope change: the item pool goes to 200 for v1. The effects wave plan opens with six questions.' },
  { build: 35, pr: 32, sha: '46172ee', date: '2026-09-08', title: 'LONG WORD HITS HARD', notes: 'The intro grid had been spelling something else in its third row. Fixed before too many people noticed.' },
  { build: 34, pr: 31, sha: 'a909283', date: '2026-09-08', title: 'Mythics', notes: 'A fourth rarity, rare enough to be an event and strong enough to build around. 72 organelles.' },
  { build: 33, pr: 30, sha: '247f52a', date: '2026-09-08', title: 'Fifty organelles', notes: 'From 24 to 50, each with its own glyph drawn by a script.' },
  { build: 32, pr: 29, sha: 'eb1b6f5', date: '2026-09-08', title: 'Grafts', notes: 'Every organelle you carry is grafted onto your body in the arena. You look like what you have picked.' },
  { build: 31, pr: 28, sha: 'd2bf3eb', date: '2026-09-08', title: 'Shiver', notes: 'Pixel body text, a shiver on a few tiles, and an intro that spells its own lesson.' },
  { build: 30, pr: 27, sha: '1727188', date: '2026-09-08', title: 'Flavor', notes: 'Every organelle gets one line of voice, kept apart from what it does.' },
  { build: 29, pr: 26, sha: '2c2a0ef', date: '2026-09-08', title: 'The compendium', notes: 'Organelles on the title screen: every item with its icon and text, grouped by rarity.' },
  { build: 28, pr: 25, sha: 'a9aad7d', date: '2026-09-08', title: 'No scrollbar', notes: 'The fight screen clips instead of scrolling; the grid absorbs the difference.' },
  { build: 27, pr: 24, sha: 'a910774', date: '2026-09-08', title: 'Twenty-four organelles', notes: 'Fourteen more from the existing vocabulary, rares trimmed, flat bonuses raised. The casual bot learned to read an offer.' },
  { build: 26, pr: 23, sha: '680eda4', date: '2026-09-08', title: 'The pixel voice', notes: 'The pixel face in regular weight is the game’s voice; a system sans for running text.' },
  { build: 25, pr: 22, sha: 'f00e783', date: '2026-09-08', title: 'Item icons', notes: 'Ten hand-drawn glyphs, toned by rarity, on offers, the panel and the strip.' },
  { build: 24, pr: 21, sha: '20b1592', date: '2026-09-08', title: 'Legibility', notes: 'Letters, words and names in Atkinson Hyperlegible; pixels for numbers only. It did not last, but it was a fair try.' },
  { build: 23, pr: 20, sha: 'fe975b0', date: '2026-09-08', title: 'Plasma', notes: 'A design language with a name: tokens every component uses, deep violet ground, cyan life, gold score.' },
  { build: 22, pr: 19, sha: 'b1f79aa', date: '2026-09-08', title: 'The tuning wave', notes: 'The boss lock finally lands on tiles that survive the turn. Venom: a tile that bites you every turn until you spend it. Acts 2 and 3 retuned so a strong run can still die at the end.' },
  { build: 21, pr: 18, sha: '56da53c', date: '2026-09-08', title: 'Deploy note', notes: 'A merge to main deploys to Docker Hub and GitHub Pages by itself. Written down so nobody forgets.' },
  { build: 20, pr: 17, sha: 'bcb25a4', date: '2026-09-08', title: 'The intro scene', notes: 'Pond, portal, arrival, with the sprites. Something ate your pond.' },
  { build: 19, pr: 16, sha: '78f556c', date: '2026-09-08', title: 'An intro', notes: 'One screen after New run says what the pick and the fight are.' },
  { build: 18, pr: 15, sha: '534cf2d', date: '2026-09-08', title: 'GitHub Pages', notes: 'The same bundle at dtammam.github.io/lexicell on every merge. Public, no container needed.' },
  { build: 17, pr: 14, sha: 'b402d28', date: '2026-09-08', title: 'Earthbound pass', notes: 'Louder palettes that cycle, seamless layers, enemies that float their own way.' },
  { build: 16, pr: 13, sha: '0143a74', date: '2026-09-08', title: 'The word you missed', notes: 'After each attack, the best word that grid held. Educational and slightly cruel.' },
  { build: 15, pr: 12, sha: '58135af', date: '2026-09-08', title: 'Damage preview', notes: 'The word line and the Attack button show what the word will do before you commit.' },
  { build: 14, pr: 11, sha: '9043d6e', date: '2026-09-08', title: 'You evolve', notes: 'Three player forms, one per act, more body and limbs each time.' },
  { build: 13, pr: 10, sha: '8171ca0', date: '2026-09-08', title: 'Build numbers', notes: 'The build stamp reads "build N" with the sha, so a screenshot says which version it came from.' },
  { build: 12, pr: 9, sha: 'a1b0b52', date: '2026-09-08', title: 'The playtest log', notes: 'Every perception and request, with a next step. The list this game is built from.' },
  { build: 11, pr: 8, sha: 'b13da15', date: '2026-09-08', title: 'Items named for a cell', notes: 'Organelles get names a cell would carry: Flagellum, Vacuole, Plasmid.' },
  { build: 10, pr: 7, sha: '271ea05', date: '2026-09-08', title: 'Battle backdrop', notes: 'An Earthbound-style backdrop behind the arena.' },
  { build: 9, pr: 6, sha: '25dd550', date: '2026-09-08', title: 'Tiles at a glance', notes: 'Colour by letter class, serif capitals.' },
  { build: 8, pr: 5, sha: '03ab5f1', date: '2026-09-08', title: 'The game never scrolls', notes: 'One viewport tall; the grid takes whatever is left.' },
  { build: 7, pr: 4, sha: 'ff38b59', date: '2026-09-08', title: 'Build stamp', notes: 'A sha on the title screen.' },
  { build: 6, pr: 3, sha: '9b66d30', date: '2026-09-08', title: 'Gravity', notes: 'Survivors rise, fresh tiles land below and animate in. Value badges gone.' },
  { build: 5, pr: 2, sha: '968da23', date: '2026-09-08', title: 'Docker context fix', notes: 'The image build could not see scripts/lib. Now it can, and pull requests build the image too.' },
  { build: 4, pr: 1, sha: '442ba11', date: '2026-09-08', title: 'The feel wave', notes: 'The first pull request: definitions for the word you played, a title screen, an arena, a shuffle that costs the turn, and a dependency diet. Iteration mode begins: small PRs, merged when green.' },
  { build: 3, pr: null, sha: '4a1b751', date: '2026-09-08', title: 'Dev build on the LAN', notes: 'The dev build reachable through code-server’s proxy, so a phone on the same network could play before anything was published.' },
  { build: 2, pr: null, sha: '4b4194b', date: '2026-09-08', title: 'Local play', notes: 'Dev and preview servers bind every interface; the paths written down.' },
  { build: 1, pr: null, sha: '94a60d6', date: '2026-09-08', title: 'Walking skeleton', notes: 'The first thing you could play: a Svelte shell over the engine, a saved run in localStorage, a PWA manifest and service worker, an nginx image, and the publish workflow. Build 1.' },
  { build: null, pr: null, sha: '052ef0f', date: '2026-09-08', title: 'Act 1 eased, Phase 0 closed', notes: 'A starting kit so no fight is fought with nothing, act 1 softened, the greedy bot capped at seven letters. The headless engine met its exit criteria.' },
  { build: null, pr: null, sha: '1d833a2', date: '2026-09-06', title: 'Rulings on record', notes: 'Dean’s decisions written into the docs, not only into a session’s memory.' },
  { build: null, pr: null, sha: '68986d9', date: '2026-09-06', title: 'Handoff', notes: 'Branch state, next step and a resume prompt for a paused session.' },
  { build: null, pr: null, sha: 'a6ec1bd', date: '2026-09-06', title: 'Lean mode', notes: 'How the work works: reviewer seats, exec plans, a tech-debt tracker, explicit staging, no em dashes.' },
  { build: null, pr: null, sha: '9f63d34', date: '2026-09-06', title: 'Length bonus in content', notes: 'The length-bonus table moved beside the HP curve, where tuning lives.' },
  { build: null, pr: null, sha: '24efb16', date: '2026-09-06', title: 'Candidates', notes: 'Every playable word with its damage, effects resolved once, tiles mapped only for the word chosen. The sim got fast.' },
  { build: null, pr: null, sha: 'da454bc', date: '2026-09-06', title: 'The sim harness', notes: 'Two bots, seeded runs, exit criteria printed under the table. Every balance claim since has been a number from here.' },
  { build: null, pr: null, sha: '32490cb', date: '2026-09-06', title: 'The reducer', notes: 'The full run loop through one mutation path. Seed plus actions equals the run, forever.' },
  { build: null, pr: null, sha: '79adb44', date: '2026-09-06', title: 'The grid', notes: 'Frequency-weighted draws, a vowel floor, and fresh grids checked by the solver so you always have a word.' },
  { build: null, pr: null, sha: '95d0cf8', date: '2026-09-06', title: 'Enemies as content', notes: 'Enemies, a boss and the encounter curve as data, not engine.' },
  { build: null, pr: null, sha: 'c96905c', date: '2026-09-06', title: 'Hooks and ten items', notes: 'Items hook into the turn; acquisition order in, fixed order out.' },
  { build: null, pr: null, sha: '50dc9d4', date: '2026-09-06', title: 'Effects and scoring', notes: 'The effect vocabulary and the scoring formula, in a fixed order, conditions flattened before they apply.' },
  { build: null, pr: null, sha: '209addf', date: '2026-09-06', title: 'The solver', notes: 'A multiset scan with precomputed masks, no trie. It finds every word sixteen letters can spell.' },
  { build: null, pr: null, sha: '97f215d', date: '2026-09-06', title: 'The dictionary', notes: 'A filtered ENABLE word list shipped as text, its source hash pinned.' },
  { build: null, pr: null, sha: '2c1698e', date: '2026-09-06', title: 'The RNG', notes: 'Seed and counter carried in state, advanced in constant time. Replays are exact because of this commit.' },
  { build: null, pr: null, sha: '134f4c5', date: '2026-09-06', title: 'First commit', notes: 'A headless TypeScript engine with lint rules that keep it pure. No screen yet, only the idea.' },
];
