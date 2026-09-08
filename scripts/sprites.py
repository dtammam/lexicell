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


def sprite(name: str, cells: int, eyes: bool = True) -> Image.Image:
    fill, hi, outline = PALETTE.get(name, PALETTE["unknown"])
    body = blob(name, cells)
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
    specs = {"player": 60, "amoeba": 70, "flagellate": 52, "polyp": 84, "colony": 110, "unknown": 64}
    for name, cells in specs.items():
        sprite(name, cells).save(OUT / f"{name}.png", optimize=True)
        print(f"wrote {name}.png ({cells} cells)")


if __name__ == "__main__":
    main()
