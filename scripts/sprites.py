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


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    specs = {"player": (60, 0), "player-1": (56, 0), "player-2": (78, 2), "player-3": (96, 4), "amoeba": (70, 0), "flagellate": (52, 0), "polyp": (84, 0), "colony": (110, 0), "unknown": (64, 0)}
    for name, (cells, limbs) in specs.items():
        sprite(name, cells, limbs=limbs).save(OUT / f"{name}.png", optimize=True)
        print(f"wrote {name}.png ({cells} cells, {limbs} limbs)")


if __name__ == "__main__":
    main()
