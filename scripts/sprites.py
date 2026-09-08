#!/usr/bin/env python3
"""Placeholder pixel sprites (Dean, 2026-09-08: generated art now, real art later).

Each sprite is a 16x16 symmetric blob grown from a seeded random walk, drawn in a
two-tone palette with a one-pixel outline, then scaled 4x with nearest-neighbour so it
stays crisp. Deterministic per id: re-running this script reproduces the same files.

    python3 scripts/sprites.py            # writes public/sprites/*.png
"""
import random
from pathlib import Path

from PIL import Image

OUT = Path(__file__).resolve().parent.parent / "public" / "sprites"
SIZE = 16
SCALE = 4

# id -> (fill, highlight, outline)
PALETTE = {
    "player": ((90, 201, 138), (200, 255, 220), (30, 80, 55)),
    # The player evolves per act (Dean, 2026-09-08): same green, more body each act.
    "player-1": ((90, 201, 138), (200, 255, 220), (30, 80, 55)),
    "player-2": ((80, 190, 160), (190, 255, 235), (25, 75, 65)),
    "player-3": ((70, 180, 190), (180, 245, 255), (20, 65, 80)),
    "amoeba": ((224, 90, 90), (255, 170, 160), (90, 30, 30)),
    "flagellate": ((120, 110, 220), (190, 180, 255), (40, 35, 90)),
    "polyp": ((230, 160, 70), (255, 220, 160), (100, 60, 20)),
    "colony": ((190, 70, 140), (255, 160, 220), (80, 20, 60)),
    "unknown": ((120, 120, 140), (190, 190, 210), (50, 50, 60)),
}


def blob(seed: str, cells: int) -> set[tuple[int, int]]:
    rng = random.Random(seed)
    half = SIZE // 2
    alive = {(half - 1, half), (half, half), (half - 1, half - 1), (half, half - 1)}
    while len(alive) < cells:
        x, y = rng.choice(sorted(alive))
        dx, dy = rng.choice([(1, 0), (-1, 0), (0, 1), (0, -1)])
        nx, ny = x + dx, y + dy
        if 1 <= nx < SIZE - 1 and 1 <= ny < SIZE - 1:
            alive.add((nx, ny))
            alive.add((SIZE - 1 - nx, ny))  # mirror left-right so it reads as a creature
    return alive


def sprite(name: str, cells: int, eyes: bool = True, limbs: int = 0) -> Image.Image:
    fill, hi, outline = PALETTE.get(name, PALETTE["unknown"])
    body = blob(name, cells)
    # Limbs: mirrored one-pixel-wide stalks growing out of the body, more each act.
    rng_l = random.Random(name + "limbs")
    for _ in range(limbs):
        x, y = rng_l.choice(sorted(body))
        dx = 1 if x >= SIZE // 2 else -1
        for step in range(1, 4):
            nx = x + dx * step
            if 1 <= nx < SIZE - 1:
                body.add((nx, y))
                body.add((SIZE - 1 - nx, y))
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    px = img.load()
    for (x, y) in body:
        px[x, y] = (*fill, 255)
    # outline: transparent neighbours of body pixels
    for (x, y) in list(body):
        for dx, dy in [(1, 0), (-1, 0), (0, 1), (0, -1)]:
            nx, ny = x + dx, y + dy
            if 0 <= nx < SIZE and 0 <= ny < SIZE and (nx, ny) not in body:
                px[nx, ny] = (*outline, 255)
    # highlight: top-left interior pixels
    for (x, y) in body:
        if (x - 1, y - 1) in body and (x - 2, y - 2) not in body and x < SIZE // 2:
            px[x, y] = (*hi, 255)
    if eyes:
        rng = random.Random(name + "eyes")
        row = SIZE // 2 - rng.randint(0, 2)
        for ex in (SIZE // 2 - 3, SIZE // 2 + 2):
            if (ex, row) in body:
                px[ex, row] = (20, 20, 30, 255)
    return img.resize((SIZE * SCALE, SIZE * SCALE), Image.NEAREST)


# Item icons: 16x16 ASCII maps, two tones plus an outline. "#" body, "o" highlight, "." empty.
# Edit the characters to redraw an item; the file name is the item id. Tone by rarity.
ITEM_TONES = {
    "common": ((90, 201, 138), (200, 255, 220), (18, 8, 38)),
    "uncommon": ((53, 224, 216), (200, 255, 250), (18, 8, 38)),
    "rare": ((255, 79, 163), (255, 200, 230), (18, 8, 38)),
    "mythic": ((255, 230, 109), (255, 255, 240), (60, 40, 0)),
}
ITEMS = {
    "sharp-pen": ("common", [  # Flagellum: a whip trailing from a bud
        "................",
        "..........oo....",
        ".........o##....",
        "........o###....",
        ".......o###.....",
        "......o###......",
        ".....o###.......",
        "....o###........",
        "....###.........",
        "...###..........",
        "...##...........",
        "..o##...........",
        "..###...........",
        "..###...........",
        "...#............",
        "................"]),
    "lens": ("uncommon", [  # Photoreceptor: an eye
        "................",
        "................",
        ".....######.....",
        "...##oo####.##..",
        "..#oo##.....##..",
        ".#o###.###...##.",
        ".####.#####..##.",
        ".####.##o##..##.",
        ".####.#####..##.",
        ".#####.###..##..",
        "..###.......##..",
        "...##......##...",
        ".....######.....",
        "................",
        "................",
        "................"]),
    "long-fuse": ("rare", [  # Ribosome: a chain of beads
        "................",
        "..oo............",
        ".o##o...........",
        ".####...oo......",
        "..##...o##o.....",
        ".......####.....",
        "........##..oo..",
        "...........o##o.",
        "...........####.",
        "....oo......##..",
        "...o##o.........",
        "...####.....oo..",
        "....##.....o##o.",
        "...........####.",
        "............##..",
        "................"]),
    "vowel-magnet": ("common", [  # Vacuole: a bubble with a glint
        "................",
        ".....######.....",
        "...##......##...",
        "..#..........#..",
        ".#....oo......#.",
        ".#...o........#.",
        "#....o.........#",
        "#..............#",
        "#..............#",
        "#..............#",
        ".#............#.",
        ".#............#.",
        "..#..........#..",
        "...##......##...",
        ".....######.....",
        "................"]),
    "bandage": ("common", [  # Mitosis: two cells pinching apart
        "................",
        "................",
        "...####..####...",
        "..#oo##..##oo#..",
        ".#o####..####o#.",
        ".######..######.",
        ".######..######.",
        ".######..######.",
        ".######..######.",
        ".######..######.",
        ".######..######.",
        "..####....####..",
        "...##......##...",
        "................",
        "................",
        "................"]),
    "thick-skin": ("uncommon", [  # Membrane: a thick ring
        "................",
        ".....######.....",
        "...####oo####...",
        "..###oo..oo###..",
        ".###........###.",
        ".##..........##.",
        "###..........###",
        "###..........###",
        "###..........###",
        "###..........###",
        ".##..........##.",
        ".###........###.",
        "..###......###..",
        "...####..####...",
        ".....######.....",
        "................"]),
    "rare-ink": ("uncommon", [  # Enzyme: a key
        "................",
        "...####.........",
        "..#oo##.........",
        ".#o####.........",
        ".######.........",
        ".######.........",
        "..####..........",
        "...##...........",
        "...##...........",
        "...##...........",
        "...####.........",
        "...##...........",
        "...####.........",
        "...##...........",
        "...###..........",
        "................"]),
    "leech": ("uncommon", [  # Cilia: a comb of hairs on a body
        "................",
        ".o.o.o.o.o.o.o..",
        ".#.#.#.#.#.#.#..",
        ".#.#.#.#.#.#.#..",
        ".#.#.#.#.#.#.#..",
        ".##############.",
        ".##############.",
        ".#############..",
        "..############..",
        "..###########...",
        "...#########....",
        ".....#####......",
        "................",
        "................",
        "................",
        "................"]),
    "spores": ("common", [  # Spores: a cloud of dots
        "................",
        "....o...........",
        "...###......o...",
        "...###.....###..",
        "....#......###..",
        "........o...#...",
        ".......###......",
        ".o.....###......",
        "###.....#.......",
        "###.........o...",
        ".#.....o...###..",
        "......###..###..",
        "..o...###...#...",
        ".###...#........",
        ".###............",
        "..#............."]),
    "lysosome": ("common", [  # Lysosome: a small jagged sac
        "................",
        "................",
        "......#..#......",
        ".....######.....",
        "....#oo#####....",
        "...#o########...",
        "...##########...",
        "..############..",
        "..############..",
        "...##########...",
        "...##########...",
        "....########....",
        ".....######.....",
        "......#..#......",
        "................",
        "................"]),
    "pilus": ("common", [  # Pilus: a hooked hair
        "................",
        "..............#.",
        ".............##.",
        "............##..",
        "...........##...",
        "..........##....",
        ".........##.....",
        "........##......",
        ".......##.......",
        "......##........",
        ".....##.........",
        "...o##..........",
        "..o###..........",
        "..####..........",
        "...##...........",
        "................"]),
    "chloroplast": ("common", [  # Chloroplast: a lens with stacked discs
        "................",
        "................",
        "....########....",
        "..##oo########..",
        ".#o##..##..###.#",
        ".###.##..##.####",
        "###..##..##..###",
        "###.##..##..####",
        "###..##..##..###",
        ".###.##..##.###.",
        ".####..##..####.",
        "..##########.#..",
        "....########....",
        "................",
        "................",
        "................"]),
    "cell-wall": ("common", [  # Cell wall: bricks
        "................",
        "################",
        "#..#..#..#..#..#",
        "#..#..#..#..#..#",
        "################",
        ".#..#..#..#..#..",
        ".#..#..#..#..#..",
        "################",
        "#..#..#..#..#..#",
        "#..#..#..#..#..#",
        "################",
        ".#..#..#..#..#..",
        ".#..#..#..#..#..",
        "################",
        "................",
        "................"]),
    "nucleus": ("common", [  # Nucleus: a ring with a core
        "................",
        ".....######.....",
        "...##......##...",
        "..#..........#..",
        ".#............#.",
        ".#....oo......#.",
        "#....o###......#",
        "#....#####.....#",
        "#....#####.....#",
        "#.....###......#",
        ".#............#.",
        ".#............#.",
        "..#..........#..",
        "...##......##...",
        ".....######.....",
        "................"]),
    "plasmid": ("common", [  # Plasmid: a small loop of DNA
        "................",
        "................",
        "......####......",
        "....##o...##....",
        "...#o.......#...",
        "..#..........#..",
        "..#..........#..",
        "..#..........#..",
        "..#....##....#..",
        "...#..#..#..#...",
        "....##....##....",
        "................",
        "................",
        "................",
        "................",
        "................"]),
    "peroxisome": ("uncommon", [  # Peroxisome: a crystal in a sac
        "................",
        "......####......",
        "....##....##....",
        "...#........#...",
        "..#....o.....#..",
        "..#...o#.....#..",
        ".#...o###.....#.",
        ".#...#####....#.",
        ".#....###.....#.",
        ".#.....#......#.",
        "..#..........#..",
        "..#..........#..",
        "...#........#...",
        "....##....##....",
        "......####......",
        "................"]),
    "golgi": ("uncommon", [  # Golgi body: stacked curved sacs
        "................",
        "................",
        "....########....",
        "...#oooooooo#...",
        "................",
        "...##########...",
        "..#oooooooooo#..",
        "................",
        "..############..",
        ".#oooooooooooo#.",
        "................",
        "...##########...",
        "..#oooooooooo#..",
        "................",
        "................",
        "................"]),
    "centriole": ("uncommon", [  # Centriole: a barrel of tubes
        "................",
        "....########....",
        "...#o#o#o#o##...",
        "...#.#.#.#.##...",
        "...#.#.#.#.##...",
        "...#.#.#.#.##...",
        "...#.#.#.#.##...",
        "...#.#.#.#.##...",
        "...#.#.#.#.##...",
        "...#.#.#.#.##...",
        "...#.#.#.#.##...",
        "...#.#.#.#.##...",
        "....########....",
        "................",
        "................",
        "................"]),
    "tentacle": ("uncommon", [  # Tentacle: a curling arm with suckers
        "................",
        "..........oo....",
        ".........o###...",
        "........o####...",
        ".......####.....",
        "......####......",
        ".....####.......",
        "....####........",
        "...####.........",
        "..####..........",
        "..###...........",
        "..##............",
        "..###...........",
        "...####.........",
        ".....###........",
        "................"]),
    "symbiont": ("uncommon", [  # Symbiont: two cells fused
        "................",
        "................",
        "...####.........",
        "..#oo##.####....",
        ".#o#####oo##....",
        ".########o####..",
        ".#############..",
        ".#############..",
        "..###########...",
        "...##..######...",
        ".......####.....",
        "................",
        "................",
        "................",
        "................",
        "................"]),
    "apex": ("rare", [  # Apex membrane: a crown of spikes
        "................",
        ".#....#....#....",
        ".##..###..##....",
        ".###.###.###....",
        ".############...",
        ".############...",
        ".#oo#########...",
        ".#o##########...",
        ".############...",
        ".############...",
        "..##########....",
        "...########.....",
        "................",
        "................",
        "................",
        "................"]),
    "regeneration": ("rare", [  # Regeneration: a cell with a budding arm
        "................",
        "......####......",
        "....##oo..##....",
        "...#oo......#...",
        "..#..........#..",
        "..#..........#.#",
        "..#..........###",
        "..#.........###.",
        "..#........###..",
        "...#......###...",
        "....##..###.....",
        "......###.......",
        ".......#........",
        "................",
        "................",
        "................"]),
    "thin-membrane": ("rare", [  # Thin membrane: a fragile ring, cracked
        "................",
        ".....######.....",
        "...##......##...",
        "..#..........#..",
        ".#............#.",
        ".#............#.",
        "#..............#",
        "#..............#",
        "#..............#",
        "#..............#",
        ".#............#.",
        ".#............#.",
        "..#..........#..",
        "...##......##...",
        ".....##..##.....",
        "................"]),
    "second-wind": ("rare", [  # Cyst: a hard shell with a seam
        "................",
        "......####......",
        "....##oo..##....",
        "...#oo......#...",
        "..#o.........#..",
        "..#..........#..",
        ".#............#.",
        ".#.....##.....#.",
        ".#....#..#....#.",
        ".#....#..#....#.",
        "..#....##....#..",
        "..#..........#..",
        "...#........#...",
        "....##....##....",
        "......####......",
        "................"]),
}


# Procedural glyphs for the second expansion: a template per item, seeded by id, so 26 items
# get distinct organelle shapes without 26 hand-drawn maps. Replace any with an ASCII map in
# ITEMS above when it deserves a hand.
TEMPLATED = {
    "microtubule": ("common", "rod"), "cytoplasm": ("common", "blob"), "contractile-vacuole": ("common", "ring"),
    "osmosis": ("common", "drop"), "histone": ("common", "cluster"), "ribbon": ("common", "wave"),
    "stinger": ("common", "spike"), "spine": ("common", "star"), "mucus": ("common", "blob"), "buoyancy": ("common", "ring"),
    "chitin-plate": ("uncommon", "shield"), "toxin-sac": ("uncommon", "drop"), "flagellar-motor": ("uncommon", "star"),
    "hemoglobin": ("uncommon", "cluster"), "antibody": ("uncommon", "spike"), "catalase": ("uncommon", "rod"),
    "lure": ("uncommon", "wave"), "membrane-pump": ("uncommon", "ring"), "spore-cloud": ("uncommon", "cluster"), "ganglion": ("uncommon", "star"),
    "metamorphosis": ("rare", "shield"), "hydra": ("rare", "spike"), "bioluminescence": ("rare", "star"),
    "apoptosis": ("rare", "blob"), "quorum": ("rare", "cluster"), "stem-cell": ("rare", "ring"),
    "cilium-array": ("common", "wave"), "thylakoid": ("common", "rod"), "pseudopod": ("common", "drop"), "sheath": ("common", "shield"), "carotenoid": ("common", "cluster"),
    "mycelium": ("uncommon", "wave"), "barb": ("uncommon", "spike"), "kinetochore": ("uncommon", "star"), "nematocyst": ("uncommon", "rod"), "endospore": ("uncommon", "ring"),
    "lateral-line": ("rare", "wave"), "nucleolus": ("rare", "ring"), "exoskeleton": ("rare", "shield"), "lysozyme": ("rare", "drop"),
    "apex-genome": ("mythic", "star"), "immortal-line": ("mythic", "ring"), "plague": ("mythic", "cluster"), "tardigrade": ("mythic", "blob"),
    "lexicon": ("mythic", "shield"), "mirror-membrane": ("mythic", "spike"), "primordial-soup": ("mythic", "drop"), "hydrothermal-vent": ("mythic", "rod"),
    # Effects wave, batch 1.
    "venom-gland": ("common", "drop"), "numbing-barb": ("common", "spike"), "capsule": ("common", "shield"), "siphon": ("common", "wave"),
    "flick": ("common", "wave"), "molt": ("common", "ring"), "chemotaxis": ("common", "cluster"), "growth-factor": ("common", "blob"),
    "vesicle": ("common", "ring"), "polymerase": ("common", "rod"), "capsid": ("common", "star"), "tail-fiber": ("common", "rod"),
    "diploid": ("common", "cluster"), "haploid": ("common", "blob"), "primer": ("common", "spike"), "coagulant": ("common", "shield"),
    "tannin": ("common", "drop"), "scavenger": ("common", "star"), "digestive-vacuole": ("common", "ring"), "pulse": ("common", "wave"),
    "keratin": ("uncommon", "shield"), "neurotoxin": ("uncommon", "drop"), "carapace": ("uncommon", "shield"), "hemolymph": ("uncommon", "drop"),
    "telomere": ("uncommon", "rod"), "kinesin": ("uncommon", "wave"), "coccus": ("uncommon", "blob"), "sporangium": ("uncommon", "cluster"),
    "ink-sac": ("uncommon", "blob"), "amylase": ("uncommon", "star"), "cnidocyte": ("uncommon", "spike"), "antitoxin": ("uncommon", "ring"),
    "opsonin": ("rare", "cluster"), "cortex": ("rare", "shield"), "paralytic": ("rare", "spike"), "zooxanthellae": ("rare", "star"),
    "reflex-arc": ("rare", "wave"), "blastula": ("rare", "blob"), "chrysalis": ("rare", "ring"),
    "ouroboros": ("mythic", "ring"),
    # Effects wave, batch 2.
    "venom-reservoir": ("common", "drop"), "antivenin": ("common", "drop"), "lockpick": ("common", "rod"), "crust": ("common", "shield"),
    "adrenaline": ("common", "spike"), "circadian-clock": ("common", "ring"), "consonant-coat": ("common", "shield"), "vowel-sac": ("common", "blob"),
    "rare-earth": ("common", "cluster"), "spit": ("common", "drop"), "opener": ("common", "wave"), "sprint": ("common", "wave"),
    "patience": ("common", "ring"), "relay": ("common", "rod"), "gill": ("common", "wave"), "mantle": ("common", "shield"),
    "twin": ("common", "cluster"), "singleton": ("common", "star"), "leftover": ("common", "blob"), "bait": ("common", "drop"),
    "rasp": ("common", "spike"), "jolt": ("common", "star"),
    "pheromone": ("uncommon", "cluster"), "hardshell": ("uncommon", "shield"), "venom-loop": ("uncommon", "ring"), "metronome": ("uncommon", "rod"),
    "reaper": ("uncommon", "spike"), "overclock": ("uncommon", "star"), "deep-breath": ("uncommon", "wave"), "chelator": ("uncommon", "star"),
    "lantern": ("uncommon", "ring"), "buffer": ("uncommon", "shield"), "eater": ("uncommon", "blob"), "frenzy": ("uncommon", "spike"), "tuning-fork": ("uncommon", "rod"),
    "ambush": ("rare", "spike"), "hive": ("rare", "cluster"), "bastion": ("rare", "shield"), "venom-crown": ("rare", "star"),
    "hourglass": ("rare", "drop"), "leviathan": ("rare", "wave"), "phage": ("rare", "rod"), "osmoregulator": ("rare", "ring"),
    "singularity": ("mythic", "star"), "eternal-return": ("mythic", "ring"),
    # Effects wave, batch 3: the last forty-three, to 200.
    "flagellin": ("common", "rod"), "mucilage": ("common", "blob"), "kelp": ("common", "wave"), "thorn": ("common", "spike"),
    "ballast": ("common", "drop"), "filament": ("common", "rod"), "echo": ("common", "ring"), "gullet": ("common", "blob"),
    "pebble": ("common", "cluster"), "lichen": ("common", "cluster"), "spiracle": ("common", "ring"), "tremor": ("common", "star"),
    "sap": ("common", "drop"), "bristle": ("common", "spike"), "cocoon": ("common", "shield"), "nerve-net": ("common", "wave"),
    "tide": ("common", "wave"), "seed": ("common", "drop"), "talon": ("common", "spike"), "grit": ("common", "shield"),
    "burrow": ("common", "ring"), "glow": ("common", "star"),
    "venom-fang": ("uncommon", "spike"), "warden": ("uncommon", "shield"), "lodestone": ("uncommon", "cluster"), "pressure": ("uncommon", "drop"),
    "anchor": ("uncommon", "shield"), "syncopation": ("uncommon", "rod"), "long-arm": ("uncommon", "rod"), "slipstream": ("uncommon", "wave"),
    "ricochet": ("uncommon", "star"), "pulsar": ("uncommon", "star"), "mimic": ("uncommon", "blob"), "oracle": ("uncommon", "ring"),
    "colossus": ("rare", "shield"), "venom-heart": ("rare", "drop"), "clockwork": ("rare", "ring"), "glutton": ("rare", "blob"),
    "scalpel": ("rare", "rod"), "wellspring": ("rare", "wave"), "tectonic": ("rare", "cluster"), "keystone": ("rare", "star"),
    "protocell": ("mythic", "blob"),
}


def template_rows(kind: str, seed: str) -> list[str]:
    rng = random.Random(seed)
    grid = [["." for _ in range(SIZE)] for _ in range(SIZE)]
    c = SIZE // 2
    def put(x, y, ch="#"):
        if 0 <= x < SIZE and 0 <= y < SIZE:
            grid[y][x] = ch
    def disc(cx, cy, r, ch="#"):
        for y in range(SIZE):
            for x in range(SIZE):
                if (x - cx + 0.5) ** 2 + (y - cy + 0.5) ** 2 <= r * r:
                    put(x, y, ch)
    if kind == "ring":
        r = rng.choice([5, 6])
        disc(c, c, r); disc(c, c, r - 2, ".")
        put(c - 2, c - r + 1, "o"); put(c - 3, c - r + 2, "o")
    elif kind == "blob":
        for _ in range(3):
            disc(c + rng.randint(-2, 2), c + rng.randint(-2, 2), rng.randint(3, 5))
        put(c - 2, c - 3, "o"); put(c - 3, c - 2, "o")
    elif kind == "rod":
        w = rng.choice([2, 3])
        for y in range(2, SIZE - 2):
            for x in range(c - w + 1, c + w):
                put(x, y)
        for y in range(2, 6):
            put(c - w + 1, y, "o")
    elif kind == "drop":
        disc(c, c + 2, 5)
        for i in range(5):
            for x in range(c - i // 2, c + i // 2 + 1):
                put(x, 2 + i)
        put(c - 2, c + 1, "o"); put(c - 2, c + 2, "o")
    elif kind == "cluster":
        for _ in range(rng.randint(4, 6)):
            disc(rng.randint(3, SIZE - 4), rng.randint(3, SIZE - 4), rng.choice([1, 2]))
        put(4, 4, "o")
    elif kind == "wave":
        for x in range(1, SIZE - 1):
            y = c + int(round(3 * ((x * 0.8) % 2 - 1))) if False else c + [0, 1, 2, 2, 1, 0, -1, -2, -2, -1][x % 10]
            put(x, y); put(x, y + 1)
        put(2, c - 1, "o")
    elif kind == "spike":
        for i in range(6):
            put(c + i, c - i); put(c + i + 1, c - i); put(c - i, c + i); put(c - i - 1, c + i)
        disc(c, c, 2)
        put(c - 1, c - 1, "o")
    elif kind == "star":
        for i in range(-6, 7):
            put(c + i, c); put(c, c + i)
            if abs(i) <= 4:
                put(c + i, c + i); put(c + i, c - i)
        disc(c, c, 2); put(c - 1, c - 1, "o")
    elif kind == "shield":
        for y in range(2, 13):
            half = 6 if y < 8 else 6 - (y - 8)
            for x in range(c - half, c + half):
                put(x, y)
        for y in range(3, 7):
            put(c - 4, y, "o")
    return ["".join(r) for r in grid]


def item_icon(rarity: str, rows: list[str]) -> Image.Image:
    fill, hi, outline = ITEM_TONES[rarity]
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    px = img.load()
    body = {(x, y) for y, row in enumerate(rows) for x, ch in enumerate(row) if ch in "#o"}
    for (x, y) in body:
        px[x, y] = (*(hi if rows[y][x] == "o" else fill), 255)
    for (x, y) in list(body):
        for dx, dy in [(1, 0), (-1, 0), (0, 1), (0, -1)]:
            nx, ny = x + dx, y + dy
            if 0 <= nx < SIZE and 0 <= ny < SIZE and (nx, ny) not in body:
                px[nx, ny] = (*outline, 255)
    return img.resize((SIZE * SCALE, SIZE * SCALE), Image.NEAREST)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    specs = {"player": (60, 0), "player-1": (56, 0), "player-2": (78, 2), "player-3": (96, 4), "amoeba": (70, 0), "flagellate": (52, 0), "polyp": (84, 0), "colony": (110, 0), "unknown": (64, 0)}
    for name, (cells, limbs) in specs.items():
        sprite(name, cells, limbs=limbs).save(OUT / f"{name}.png", optimize=True)
        print(f"wrote {name}.png ({cells} cells, {limbs} limbs)")
    items_dir = OUT / "items"
    items_dir.mkdir(parents=True, exist_ok=True)
    for item_id, (rarity, rows) in ITEMS.items():
        assert len(rows) == SIZE and all(len(r) == SIZE for r in rows), item_id
        item_icon(rarity, rows).save(items_dir / f"{item_id}.png", optimize=True)
        print(f"wrote items/{item_id}.png ({rarity})")
    for item_id, (rarity, kind) in TEMPLATED.items():
        item_icon(rarity, template_rows(kind, item_id)).save(items_dir / f"{item_id}.png", optimize=True)
        print(f"wrote items/{item_id}.png ({rarity}, {kind})")


if __name__ == "__main__":
    main()
