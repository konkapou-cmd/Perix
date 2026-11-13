"""Remove only exterior near-white background; preserve the supplied compass.

Run from frontend: python scripts/transparent-compass.py
The original crop is never overwritten. Enclosed white dial pixels stay intact.
"""
from collections import deque
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[1] / "assets" / "brand"
source = Image.open(root / "perix-compass.png").convert("RGBA")
result = source.copy()
width, height = source.size
pixels = source.load()
outside = set()
queue = deque([(x, y) for x in range(width) for y in (0, height - 1)]
              + [(x, y) for y in range(height) for x in (0, width - 1)])
while queue:
    x, y = queue.popleft()
    if not (0 <= x < width and 0 <= y < height) or (x, y) in outside:
        continue
    r, g, b, alpha = pixels[x, y]
    if alpha and not (min(r, g, b) >= 235 or (min(r, g, b) >= 215 and max(r, g, b) - min(r, g, b) < 15)):
        continue
    outside.add((x, y))
    queue.extend(((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)))
output = result.load()
for x, y in outside:
    r, g, b, _ = pixels[x, y]
    output[x, y] = (r, g, b, 0)
result.save(root / "perix-compass-transparent.png", optimize=True)
print(f"{width}x{height}: removed {len(outside)} exterior background pixels; original unchanged")
