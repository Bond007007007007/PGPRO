#!/usr/bin/env python3
"""Generate GATE-CBT launcher icons (legacy PNGs + adaptive foreground PNG).

Pure-python PNG writer (zlib/struct) — no PIL needed.
Motif: two DNA-helix strands (blue + green circles) on the app's navy bg.
"""
import math
import os
import struct
import zlib

NAVY = (15, 23, 42)
BLUE = (56, 189, 248)    # --accent
GREEN = (34, 197, 94)    # --green
TRANSPARENT = (0, 0, 0, 0)


def png_chunk(tag, data):
    c = struct.pack(">I", len(data)) + tag + data
    c += struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    return c


def write_png(path, w, h, rgba):
    raw = b"".join(
        b"\x00" + b"".join(bytes(rgba[y * w + x]) for x in range(w))
        for y in range(h)
    )
    ihdr = struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)
    png = b"\x89PNG\r\n\x1a\n" + png_chunk(b"IHDR", ihdr) + \
        png_chunk(b"IDAT", zlib.compress(raw, 9)) + png_chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)


def make_helix(size, bg, inset=0.0):
    """Return RGBA buffer: rounded-rect bg (if bg) + helix motif centered."""
    bg_rgba = None if bg is None else (*bg, 255)
    px = [bg_rgba if bg_rgba else TRANSPARENT] * (size * size)
    # rounded-rect mask on navy background
    if bg:
        r = size * 0.18
        for y in range(size):
            for x in range(size):
                # corner rounding
                cx = min(max(x, r), size - 1 - r)
                cy = min(max(y, r), size - 1 - r)
                if (x - cx) ** 2 + (y - cy) ** 2 > r * r:
                    px[y * size + x] = TRANSPARENT
    cx = size / 2.0
    cy = size / 2.0
    amp = size * (0.22 - 0.06 * inset)
    rad = size * (0.055 + 0.02 * inset)
    span = size * (0.56 - 0.10 * inset)
    x0 = cx - span / 2.0
    k = 2.0 * math.pi / span * 1.5
    steps = max(40, int(span / 2.0))
    for i in range(steps + 1):
        x = x0 + span * i / steps
        for strand, phase, color in ((0, 0.0, BLUE), (1, math.pi, GREEN)):
            yy = cy + amp * math.sin(k * (x - x0) + phase)
            for dy in range(-2, 3):
                for dx in range(-2, 3):
                    if dx * dx + dy * dy > 4:
                        continue
                    sx, sy = int(round(x + dx)), int(round(yy + dy))
                    if 0 <= sx < size and 0 <= sy < size:
                        px[sy * size + sx] = (*color, 255)
    # thin joiners (rungs) between strands every half wave
    for i in range(steps + 1):
        if i % 8 != 0:
            continue
        x = x0 + span * i / steps
        y1 = cy + amp * math.sin(k * (x - x0))
        y2 = cy + amp * math.sin(k * (x - x0) + math.pi)
        steps2 = max(3, int(abs(y2 - y1)))
        for j in range(steps2 + 1):
            yy = int(round(y1 + (y2 - y1) * j / steps2))
            if 0 <= yy < size:
                px[yy * size + int(round(x))] = (148, 163, 184, 255)  # --muted
    return px


def main():
    base = os.path.join(os.path.dirname(os.path.abspath(__file__)), "res")
    legacy = {
        "mipmap-mdpi": 48, "mipmap-hdpi": 72, "mipmap-xhdpi": 96,
        "mipmap-xxhdpi": 144, "mipmap-xxxhdpi": 192,
    }
    for folder, size in legacy.items():
        out = os.path.join(base, folder)
        os.makedirs(out, exist_ok=True)
        write_png(os.path.join(out, "ic_launcher.png"), size, size,
                  make_helix(size, NAVY, inset=0.0))
    # adaptive foreground: transparent bg, motif in the 66/108 safe zone
    fg_size = 432
    out = os.path.join(base, "drawable")
    os.makedirs(out, exist_ok=True)
    write_png(os.path.join(out, "ic_launcher_fg.png"), fg_size, fg_size,
              make_helix(fg_size, None, inset=0.22))
    print("icons written OK")


if __name__ == "__main__":
    main()