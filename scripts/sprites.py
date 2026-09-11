#!/usr/bin/env python3
"""Placeholder pixel sprites (Dean, 2026-09-08: generated art now, real art later).

Each sprite is a 16x16 symmetric blob grown from a seeded random walk, drawn in a
two-tone palette with a one-pixel outline, then scaled 4x with nearest-neighbour so it
stays crisp. Deterministic per id: re-running this script reproduces the same files.

    python3 scripts/sprites.py            # writes public/sprites/*.png
"""
import math
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
    # Variety wave (2026-09-09): three act pools and three bosses.
    "rotifer": ((200, 200, 90), (250, 250, 170), (80, 80, 20)),
    "hydroid": ((90, 190, 120), (170, 250, 200), (25, 70, 40)),
    "diatom-swarm": ((140, 200, 230), (220, 245, 255), (40, 80, 110)),
    "anemone": ((240, 120, 170), (255, 200, 225), (110, 30, 70)),
    "nudibranch": ((250, 150, 60), (255, 220, 150), (110, 50, 10)),
    "lamprey": ((150, 130, 110), (220, 200, 180), (60, 45, 35)),
    "siphonophore": ((120, 210, 255), (220, 245, 255), (30, 80, 120)),
    "tardigrade-king": ((170, 160, 120), (240, 230, 190), (70, 60, 30)),
    "cuttle": ((200, 100, 220), (245, 200, 255), (80, 30, 100)),
    "leviathan-larva": ((90, 120, 200), (180, 200, 255), (30, 40, 100)),
    "abyssal-mat": ((70, 60, 110), (150, 140, 200), (25, 20, 50)),
    # Challenge wave (2026-09-11): four more per act. Act 1 warm pond tones, act 2 reef, act 3 the deep.
    "stentor": ((100, 190, 150), (190, 250, 210), (30, 75, 55)),
    "ostracod": ((190, 170, 110), (240, 225, 170), (80, 65, 30)),
    "vorticella": ((150, 200, 130), (220, 250, 190), (50, 80, 40)),
    "gastrotrich": ((215, 210, 130), (250, 250, 200), (90, 85, 35)),
    "zoanthid": ((240, 140, 120), (255, 210, 190), (110, 45, 35)),
    "sponge": ((235, 150, 90), (255, 215, 170), (110, 60, 25)),
    "barnacle": ((150, 175, 190), (220, 235, 245), (55, 75, 90)),
    "mantis-shrimp": ((80, 200, 170), (180, 255, 230), (25, 85, 70)),
    "anglerfish": ((70, 90, 140), (170, 190, 240), (25, 30, 70)),
    "giant-isopod": ((150, 140, 170), (215, 210, 235), (60, 55, 85)),
    "viperfish": ((60, 130, 140), (150, 220, 230), (20, 55, 65)),
    "vampire-squid": ((140, 60, 100), (220, 150, 190), (60, 20, 45)),
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


# ---------------------------------------------------------------------------------------------
# Cellular sprites (tester via Dean, 2026-09-08: "make the cells more cellular"; per starting
# cell, 2026-09-09). Same seeded blob, then the parts a cell has: a membrane (a lighter band
# inside the outline), a nucleus (a dark 2x2 off centre), organelle dots, and a silhouette per
# cell: spikes for the Predator, a boxy frustule for the Diatom, spore dots for the Spore,
# threads for the Mycelium. The body grows per act like the player did: 56, 78, 96 cells.
# ---------------------------------------------------------------------------------------------

# cell id -> (fill, membrane, outline, nucleus)
CELL_PALETTE = {
    "balanced": ((90, 201, 138), (200, 255, 220), (30, 80, 55), (30, 80, 55)),
    "aggro": ((230, 90, 70), (255, 190, 150), (100, 25, 20), (60, 15, 20)),
    "defensive": ((110, 170, 220), (210, 240, 255), (30, 60, 110), (25, 45, 90)),
    "gambler": ((190, 110, 230), (240, 200, 255), (70, 25, 100), (55, 20, 80)),
    "tinkerer": ((70, 200, 190), (255, 230, 120), (20, 80, 80), (120, 90, 20)),
}
CELL_ACT_CELLS = {1: 56, 2: 78, 3: 96}
# silhouette: (limbs per act, spikes, boxy, spores)
CELL_SHAPE = {
    "balanced": (lambda act: act - 1, False, False, False),
    "aggro": (lambda act: 0, True, False, False),
    "defensive": (lambda act: 0, False, True, False),
    "gambler": (lambda act: 0, False, False, True),
    "tinkerer": (lambda act: act + 1, False, False, False),
}


def boxy_blob(seed: str, cells: int) -> set[tuple[int, int]]:
    """A frustule: grow in straight runs so the outline reads as facets, mirrored left-right."""
    rng = random.Random(seed)
    half = SIZE // 2
    alive = {(half - 1, half), (half, half), (half - 1, half - 1), (half, half - 1)}
    while len(alive) < cells:
        x, y = rng.choice(sorted(alive))
        dx, dy = rng.choice([(1, 0), (-1, 0), (0, 1), (0, -1)])
        for step in range(1, 4):
            nx, ny = x + dx * step, y + dy * step
            if 1 <= nx < SIZE - 1 and 2 <= ny < SIZE - 2:
                alive.add((nx, ny))
                alive.add((SIZE - 1 - nx, ny))
    return alive


def cell_sprite(cell_id: str, act: int) -> Image.Image:
    fill, membrane, outline, nucleus = CELL_PALETTE[cell_id]
    limbs_of, spikes, boxy, spores = CELL_SHAPE[cell_id]
    seed = f"cell-{cell_id}-{act}"
    body = boxy_blob(seed, CELL_ACT_CELLS[act]) if boxy else blob(seed, CELL_ACT_CELLS[act])
    rng_l = random.Random(seed + "limbs")
    for _ in range(limbs_of(act)):
        x, y = rng_l.choice(sorted(body))
        dx = 1 if x >= SIZE // 2 else -1
        for step in range(1, 4):
            nx = x + dx * step
            if 1 <= nx < SIZE - 1:
                body.add((nx, y))
                body.add((SIZE - 1 - nx, y))
    if spikes:
        # Short spikes out of the rim, every third rim pixel, mirrored.
        rim = sorted((x, y) for (x, y) in body if any((x + dx, y + dy) not in body for dx, dy in [(1, 0), (-1, 0), (0, 1), (0, -1)]))
        for i, (x, y) in enumerate(rim):
            if i % 3 == 0 and x <= SIZE // 2:
                dx = -1 if x < SIZE // 2 else 1
                dy = -1 if y < SIZE // 2 else 1
                for nx, ny in ((x + dx, y), (x, y + dy)):
                    if 0 < nx < SIZE - 1 and 0 < ny < SIZE - 1 and (nx, ny) not in body:
                        body.add((nx, ny))
                        body.add((SIZE - 1 - nx, ny))
                        break
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    px = img.load()
    for (x, y) in body:
        px[x, y] = (*fill, 255)
    neighbours = [(1, 0), (-1, 0), (0, 1), (0, -1)]
    # Outline outside; membrane band just inside.
    for (x, y) in list(body):
        for dx, dy in neighbours:
            nx, ny = x + dx, y + dy
            if 0 <= nx < SIZE and 0 <= ny < SIZE and (nx, ny) not in body:
                px[nx, ny] = (*outline, 255)
    rim = {(x, y) for (x, y) in body if any((x + dx, y + dy) not in body for dx, dy in neighbours)}
    for (x, y) in rim:
        px[x, y] = (*membrane, 255)
    interior = sorted(body - rim)
    # Nucleus: a 2x2 (3x3 from act 2) a little up and left of centre, mirrored so the cell stays symmetric.
    if interior:
        size = 2 if act == 1 else 3
        cx, cy = SIZE // 2 - 2, SIZE // 2 - 1
        for x in range(cx, cx + size):
            for y in range(cy, cy + size):
                if (x, y) in body:
                    px[x, y] = (*nucleus, 255)
    # Organelle dots: a few interior pixels in the membrane tone (spores: many, tiny, both sides).
    rng_d = random.Random(seed + "dots")
    dots = 8 if spores else 2 + act
    pool = [p for p in interior if not (SIZE // 2 - 3 <= p[0] <= SIZE // 2 + 1 and SIZE // 2 - 2 <= p[1] <= SIZE // 2 + 2)]
    for (x, y) in rng_d.sample(pool, min(dots, len(pool))):
        px[x, y] = (*membrane, 255)
        px[SIZE - 1 - x, y] = (*membrane, 255)
    return img.resize((SIZE * SCALE, SIZE * SCALE), Image.NEAREST)


# Item icons: 16x16 ASCII maps, two tones plus an outline. "#" body, "o" highlight, "." empty.
# Edit the characters to redraw an item; the file name is the item id. Tone by rarity.
ITEM_TONES = {
    "common": ((90, 201, 138), (200, 255, 220), (18, 8, 38)),
    "uncommon": ((53, 224, 216), (200, 255, 250), (18, 8, 38)),
    "rare": ((255, 79, 163), (255, 200, 230), (18, 8, 38)),
    "mythic": ((255, 230, 109), (255, 255, 240), (60, 40, 0)),
    # Curse (variety wave step 6): a dark, warning tone, distinct from every boon rarity. Dried
    # blood over near-black, with a sickly amber highlight, so a cursed option reads as a cost.
    "curse": ((122, 24, 40), (214, 120, 66), (10, 2, 6)),
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

# Curses (variety wave step 6): rendered with the dark "curse" tone rather than a rarity tone, so
# a cursed option is unmistakable next to a boon. Each maps to a template kind seeded by its id.
CURSES = {
    "curse-dull": "spike", "curse-weak": "wave", "curse-lumber": "rod", "curse-thin-skin": "shield",
    "curse-bleed": "drop", "curse-frail": "blob", "curse-drought": "ring", "curse-shackle": "cluster",
    "curse-fester": "star", "curse-tremor": "wave",
}


def template_rows(kind: str, seed: str) -> list[str]:
    """A per-kind glyph that reads the seed for real variation (Dean, 2026-09-10: many
    templated items shared one glyph; keep the style, make each one distinct). Every branch
    jitters position, size, count and accents from rng, so ~200 items spread across the kinds
    are visually distinct while staying in the 16x16 two-tone blobby style. Deterministic per
    id: random.Random(seed) is stable, so regeneration reproduces the same files."""
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
    def ray(cx, cy, ang, r0, r1, ch="#"):
        for step in range(r0, r1 + 1):
            put(cx + round(step * math.cos(ang)), cy + round(step * math.sin(ang)), ch)
    if kind == "ring":
        r = rng.choice([4, 5, 6])
        th = rng.choice([1, 2])
        cx, cy = c + rng.randint(-1, 1), c + rng.randint(-1, 1)
        disc(cx, cy, r); disc(cx, cy, r - th, ".")
        if rng.random() < 0.5:  # a nucleus-like core inside the ring
            disc(cx, cy, rng.choice([1, 2]))
        for _ in range(rng.randint(0, 2)):  # satellite beads on the rim
            ang = rng.uniform(0, 2 * math.pi)
            put(cx + round(r * math.cos(ang)), cy + round(r * math.sin(ang)))
    elif kind == "blob":
        for _ in range(rng.choice([2, 3, 4])):
            disc(c + rng.randint(-3, 3), c + rng.randint(-3, 3), rng.randint(2, 4))
    elif kind == "rod":
        w = rng.choice([2, 3])
        top, bot = rng.randint(1, 3), rng.randint(SIZE - 4, SIZE - 2)
        drift = rng.choice([-2, -1, 0, 0, 1, 2])  # a lean over the length
        for y in range(top, bot + 1):
            frac = (y - top) / max(1, bot - top)
            cx = c + round(drift * frac)
            for x in range(cx - w + 1, cx + w):
                put(x, y)
        if rng.random() < 0.5:  # a nub cap on one end
            for x in range(c - w, c + w):
                put(x, top - 1 if rng.random() < 0.5 else bot + 1)
    elif kind == "drop":
        r = rng.choice([4, 5])
        cx = c + rng.randint(-1, 1)
        cy = SIZE - r - rng.randint(1, 3)
        disc(cx, cy, r)
        tip = rng.randint(1, 3)
        topx = cx + rng.choice([-2, -1, 0, 0, 1, 2])  # tilt the tail
        for y in range(tip, cy):
            frac = (y - tip) / max(1, cy - tip)
            halfw = round(frac * (r - 1))
            base = round(topx + (cx - topx) * frac)
            for x in range(base - halfw, base + halfw + 1):
                put(x, y)
    elif kind == "cluster":
        for _ in range(rng.randint(4, 7)):
            disc(rng.randint(3, SIZE - 4), rng.randint(3, SIZE - 4), rng.choice([1, 2, 3]))
    elif kind == "wave":
        amp = rng.choice([2, 3])
        period = rng.choice([5, 6, 8, 10])
        phase = rng.randint(0, period - 1)
        th = rng.choice([1, 2])
        cy = c + rng.randint(-2, 2)
        for x in range(1, SIZE - 1):
            y = cy + round(amp * math.sin(2 * math.pi * (x + phase) / period))
            for t in range(th):
                put(x, y + t)
    elif kind == "spike":
        n = rng.choice([4, 5, 6, 8])
        length = rng.randint(4, 6)
        cx, cy = c + rng.randint(-1, 1), c + rng.randint(-1, 1)
        rot = rng.uniform(0, math.pi)
        r0 = rng.choice([2, 3])
        disc(cx, cy, r0)
        for k in range(n):  # thick radial spikes off a solid core
            ang = rot + 2 * math.pi * k / n
            ray(cx, cy, ang, r0, r0 + length)
            ray(cx, cy, ang + 0.12, r0, r0 + length - 1)
    elif kind == "star":
        pts = rng.choice([4, 6, 8])
        arm = rng.randint(4, 6)
        cx, cy = c + rng.randint(-1, 1), c + rng.randint(-1, 1)
        rot = rng.uniform(0, math.pi)
        disc(cx, cy, rng.choice([1, 2]))
        for k in range(pts):  # thin starburst rays
            ray(cx, cy, rot + 2 * math.pi * k / pts, 1, arm)
    elif kind == "shield":
        w = rng.choice([5, 6])
        top = rng.randint(1, 3)
        taper = rng.randint(7, 9)
        bot = rng.randint(12, 14)
        for y in range(top, bot + 1):
            half = w if y < taper else max(1, w - (y - taper))
            for x in range(c - half, c + half):
                put(x, y)
        emblem = rng.choice(["bar", "cross", "dot", "chevron", "none"])
        ey = (top + bot) // 2
        if emblem == "bar":
            for x in range(c - 2, c + 2):
                put(x, ey, ".")
        elif emblem == "cross":
            for d in range(-2, 3):
                put(c + d, ey, "."); put(c, ey + d, ".")
        elif emblem == "dot":
            put(c - 1, ey, "."); put(c, ey, ".")
        elif emblem == "chevron":
            for i, dy in enumerate((0, 1, 2, 1, 0)):
                put(c - 2 + i, ey + dy, ".")
    if rng.random() < 0.3:  # occasionally mirror so leaning shapes point either way
        grid = [list(reversed(r)) for r in grid]
    # Highlight accents: a few body pixels lit in the "o" tone, biased up-left for a steady
    # light. Reading the rng here guarantees two same-silhouette items still differ.
    body = [(x, y) for y in range(SIZE) for x in range(SIZE) if grid[y][x] == "#"]
    if body:
        upleft = [(x, y) for (x, y) in body if x <= c and y <= c]
        pool = upleft if len(upleft) >= 3 else body
        for (x, y) in rng.sample(pool, min(rng.randint(1, 3), len(pool))):
            grid[y][x] = "o"
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
    specs = {
        "player": (60, 0), "player-1": (56, 0), "player-2": (78, 2), "player-3": (96, 4),
        "amoeba": (70, 0), "flagellate": (52, 0), "polyp": (84, 0), "rotifer": (58, 2),
        "hydroid": (64, 3), "diatom-swarm": (90, 0), "anemone": (76, 4), "nudibranch": (66, 1),
        "lamprey": (48, 0), "siphonophore": (100, 2), "tardigrade-king": (96, 4), "cuttle": (72, 5),
        "colony": (110, 0), "leviathan-larva": (118, 3), "abyssal-mat": (126, 0),
        # Challenge wave (2026-09-11): the twelve new enemies.
        "stentor": (58, 2), "ostracod": (66, 0), "vorticella": (54, 3), "gastrotrich": (50, 1),
        "zoanthid": (72, 4), "sponge": (82, 0), "barnacle": (64, 0), "mantis-shrimp": (70, 3),
        "anglerfish": (88, 2), "giant-isopod": (92, 4), "viperfish": (68, 1), "vampire-squid": (78, 5),
        "unknown": (64, 0),
    }
    for name, (cells, limbs) in specs.items():
        sprite(name, cells, limbs=limbs).save(OUT / f"{name}.png", optimize=True)
        print(f"wrote {name}.png ({cells} cells, {limbs} limbs)")
    for cell_id in CELL_PALETTE:
        for act in (1, 2, 3):
            cell_sprite(cell_id, act).save(OUT / f"cell-{cell_id}-{act}.png", optimize=True)
            print(f"wrote cell-{cell_id}-{act}.png")
    items_dir = OUT / "items"
    items_dir.mkdir(parents=True, exist_ok=True)
    for item_id, (rarity, rows) in ITEMS.items():
        assert len(rows) == SIZE and all(len(r) == SIZE for r in rows), item_id
        item_icon(rarity, rows).save(items_dir / f"{item_id}.png", optimize=True)
        print(f"wrote items/{item_id}.png ({rarity})")
    for item_id, (rarity, kind) in TEMPLATED.items():
        item_icon(rarity, template_rows(kind, item_id)).save(items_dir / f"{item_id}.png", optimize=True)
        print(f"wrote items/{item_id}.png ({rarity}, {kind})")
    for item_id, kind in CURSES.items():
        item_icon("curse", template_rows(kind, item_id)).save(items_dir / f"{item_id}.png", optimize=True)
        print(f"wrote items/{item_id}.png (curse, {kind})")


if __name__ == "__main__":
    main()
