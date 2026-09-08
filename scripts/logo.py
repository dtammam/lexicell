"""
The Lexicell mark: the Bookends (Dean's pick, 2026-09-08, round four of the logo pages). The
name starts and ends with L; the first L is the top-left corner of a cell wall, the last L is
flipped into the bottom-right corner, EXICEL sits inside the membrane the two Ls imply, and
the dot of the I is the nucleus. Nothing is drawn that is not a letter.

One drawing, three outputs, all from this file so nothing drifts:
  public/logo/bookends-wordmark.svg   the full name, for the title screen and print
  public/logo/bookends-mark.svg       the two Ls and the nucleus, the square mark
  public/icons/*.png, public/favicon.ico   the mark at every size the PWA and browsers ask for

Run: python3 scripts/logo.py   (Pillow, already used by scripts/sprites.py)
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
GOLD = (0xFF, 0xE6, 0x6D)
GOLD2 = (0xD9, 0xB5, 0x3A)
MAGENTA = (0xFF, 0x4F, 0xA3)
GROUND = (0x1B, 0x0F, 0x3A)

# 5x7 pixel capitals, heavy verticals.
FONT = {
    "L": ["XX...", "XX...", "XX...", "XX...", "XX...", "XXXXX", "XXXXX"],
    "E": ["XXXXX", "XX...", "XX...", "XXXX.", "XX...", "XX...", "XXXXX"],
    "X": ["XX.XX", "XX.XX", ".XXX.", "..X..", ".XXX.", "XX.XX", "XX.XX"],
    "I": ["XXXXX", "..X..", "..X..", "..X..", "..X..", "..X..", "XXXXX"],
    "C": [".XXXX", "XX...", "XX...", "XX...", "XX...", "XX...", ".XXXX"],
}

Grid = list[list[tuple[int, int, int] | None]]


def blank(w: int, h: int) -> Grid:
    return [[None] * w for _ in range(h)]


def rect(g: Grid, x0: int, y0: int, w: int, h: int, col: tuple[int, int, int]) -> None:
    for y in range(y0, y0 + h):
        for x in range(x0, x0 + w):
            if 0 <= y < len(g) and 0 <= x < len(g[0]):
                g[y][x] = col


def disc(g: Grid, cx: float, cy: float, r: float, col: tuple[int, int, int]) -> None:
    for y in range(len(g)):
        for x in range(len(g[0])):
            dx, dy = x + 0.5 - cx, y + 0.5 - cy
            if dx * dx + dy * dy <= r * r:
                g[y][x] = col


def stamp(g: Grid, glyph: list[str], x0: int, y0: int, col: tuple[int, int, int]) -> None:
    for y, row in enumerate(glyph):
        for x, ch in enumerate(row):
            if ch == "X":
                rect(g, x0 + x, y0 + y, 1, 1, col)


def wordmark() -> Grid:
    """52 x 13: the two Ls as corners, EXICEL between, the I's dot as the nucleus."""
    g = blank(52, 13)
    rect(g, 0, 0, 3, 13, GOLD)
    rect(g, 0, 10, 8, 3, GOLD)
    rect(g, 49, 0, 3, 13, GOLD)
    rect(g, 44, 0, 8, 3, GOLD)
    x = 10
    for ch in "EXICEL":
        stamp(g, FONT[ch], x, 3, GOLD2 if ch == "I" else GOLD)
        x += 6
    disc(g, 10 + 12 + 2.5, 6.5, 1.3, MAGENTA)
    return g


def mark32() -> Grid:
    """32 x 32: the two Ls and the nucleus."""
    g = blank(32, 32)
    rect(g, 2, 2, 6, 28, GOLD)
    rect(g, 2, 24, 16, 6, GOLD)
    rect(g, 24, 2, 6, 28, GOLD)
    rect(g, 14, 2, 16, 6, GOLD)
    disc(g, 16, 16, 3, MAGENTA)
    return g


def mark16() -> Grid:
    """16 x 16 by hand: three-pixel Ls, a two-pixel nucleus, so the favicon stays crisp."""
    g = blank(16, 16)
    rect(g, 1, 1, 3, 14, GOLD)
    rect(g, 1, 12, 8, 3, GOLD)
    rect(g, 12, 1, 3, 14, GOLD)
    rect(g, 7, 1, 8, 3, GOLD)
    rect(g, 7, 7, 2, 2, MAGENTA)
    return g


def to_svg(g: Grid) -> str:
    h, w = len(g), len(g[0])
    rects = []
    for y in range(h):
        for x in range(w):
            c = g[y][x]
            if c:
                rects.append(f'<rect x="{x}" y="{y}" width="1" height="1" fill="#{c[0]:02x}{c[1]:02x}{c[2]:02x}"/>')
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" shape-rendering="crispEdges">' + "".join(rects) + "</svg>\n"


def to_image(g: Grid, scale: int, pad: int = 0, bg: tuple[int, int, int] | None = None) -> Image.Image:
    h, w = len(g), len(g[0])
    mode = "RGBA" if bg is None else "RGB"
    img = Image.new(mode, ((w + 2 * pad) * scale, (h + 2 * pad) * scale), (0, 0, 0, 0) if bg is None else bg)
    px = img.load()
    for y in range(h):
        for x in range(w):
            c = g[y][x]
            if not c:
                continue
            for yy in range((y + pad) * scale, (y + pad + 1) * scale):
                for xx in range((x + pad) * scale, (x + pad + 1) * scale):
                    px[xx, yy] = c if bg is not None else (*c, 255)
    return img


def main() -> None:
    logo = ROOT / "public" / "logo"
    icons = ROOT / "public" / "icons"
    logo.mkdir(parents=True, exist_ok=True)
    icons.mkdir(parents=True, exist_ok=True)
    (logo / "bookends-wordmark.svg").write_text(to_svg(wordmark()))
    (logo / "bookends-mark.svg").write_text(to_svg(mark32()))
    m32, m16 = mark32(), mark16()
    # PWA icons on the ground colour (a transparent icon gets a white plate on some launchers).
    to_image(m32, 6, bg=GROUND).save(icons / "icon-192.png", optimize=True)  # 32*6 = 192
    to_image(m32, 16, bg=GROUND).save(icons / "icon-512.png", optimize=True)  # 32*16 = 512
    # Maskable: the mark inside the safe zone, 4 grid cells of padding each side: (32+8)*12.8 is not integral, so 40*12 = 480 then resize.
    to_image(m32, 12, pad=4, bg=GROUND).resize((512, 512), Image.NEAREST).save(icons / "icon-512-maskable.png", optimize=True)
    to_image(m32, 5, pad=2, bg=GROUND).save(icons / "apple-touch-icon-180.png", optimize=True)  # (32+4)*5 = 180
    fav32 = to_image(m32, 1, bg=GROUND)
    fav16 = to_image(m16, 1, bg=GROUND)
    fav32.save(ROOT / "public" / "favicon.ico", sizes=[(16, 16), (32, 32)], append_images=[fav16])
    fav32.save(icons / "favicon-32.png", optimize=True)
    fav16.save(icons / "favicon-16.png", optimize=True)
    for p in sorted(list(logo.iterdir()) + list(icons.iterdir())) + [ROOT / "public" / "favicon.ico"]:
        print(f"wrote {p.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
