"""Render the app icons (two overlapping discs, SR blue + MK red) as PNGs.
Pure stdlib so it runs anywhere: python3 tools/make_icons.py"""
import struct, zlib, os

BG = (13, 15, 20)
SR = (91, 140, 255)
MK = (240, 68, 79)
OUT = os.path.join(os.path.dirname(__file__), '..', 'icons')

def png(path, w, h, px):
    raw = b''.join(b'\0' + bytes(px[y * w * 3:(y + 1) * w * 3]) for y in range(h))
    chunk = lambda t, d: struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d))
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0))
                + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))

def cover(x, y, cx, cy, r, s):
    # fraction of a pixel inside a disc, 4x4 supersampled
    n = 0
    for i in range(4):
        for j in range(4):
            dx, dy = x + (i + .5) / 4 - cx, y + (j + .5) / 4 - cy
            n += dx * dx + dy * dy <= r * r
    return n / 16

def render(size):
    s = size / 512
    discs = [(206 * s, 256 * s, 112 * s, SR), (306 * s, 256 * s, 112 * s, MK)]
    px = []
    for y in range(size):
        for x in range(size):
            c = BG
            for cx, cy, r, col in discs:
                if abs(x - cx) > r + 1 or abs(y - cy) > r + 1:
                    continue
                a = cover(x, y, cx, cy, r, s)
                if col is MK:
                    a *= .88  # red disc slightly translucent so the overlap reads
                c = tuple(round(c[k] * (1 - a) + col[k] * a) for k in range(3))
            px.extend(c)
    return px

for size in (180, 192, 512):
    png(os.path.join(OUT, f'icon-{size}.png'), size, size, render(size))
    print('wrote', size)
