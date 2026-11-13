"""PERIX GLB spike pipeline: verified footprints (+measured heights only) -> OUR .glb.
Core glTF PBR only (no extensions): baseColorFactor, metallicFactor 0, roughness 0.95.
No new dependencies (struct + json + math). One file per asset; placement + clicks
happen in the map layer via Model3DInteractiveElement (perixId preserved).
Roofs: gabled/hipped ONLY with verified roofHeightM; else flat top. Never invented.
"""
import io, sys, json, math, struct
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
from pathlib import Path

ASSETS = Path(r'C:\Users\PC\Downloads\Perix1\Perix-main\frontend\assets\perix-3d\perix-3d-assets.json')
OUT = Path(r'C:\Users\PC\Downloads\Perix1\Perix-main\frontend\assets\perix-3d\glb')
OUT.mkdir(parents=True, exist_ok=True)

PALETTE = {'wall': (0.98, 0.965, 0.933), 'roof': (0.55, 0.42, 0.33)}


def to_local(ring, lat0, lng0):
    kx = 111320 * math.cos(lat0 * math.pi / 180)
    return [((x - lng0) * kx, (y - lat0) * 111320) for x, y in ring]


def cross(ax, ay, az, bx, by, bz):
    return (ay*bz - az*by, az*bx - ax*bz, ax*by - ay*bx)


def norm(v):
    l = math.sqrt(sum(c*c for c in v)) or 1.0
    return tuple(c / l for c in v)


class Mesh:
    def __init__(self):
        self.tris = []  # (p1, p2, p3) each (x, y, z)

    def quad(self, a, b, c, d):
        self.tris.append((a, b, c))
        self.tris.append((a, c, d))

    def tri(self, a, b, c):
        self.tris.append((a, b, c))


def build(a):
    ring = a['footprint']
    h = float(a['heightM'])
    rh = float(a.get('roofHeightM') or 0)
    shape = (a.get('roofShape') or '').lower()
    pts = to_local([(x, y) for x, y in ring], a['latitude'], a['longitude'])
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    x0, x1, z0, z1 = min(xs), max(xs), min(ys), max(ys)
    w, d = x1 - x0, z1 - z0
    m = Mesh()
    # walls from actual ring (true footprint, not bbox)
    n = len(pts)
    for i in range(n - 1 if pts[0] == pts[-1] else n):
        ax, az = pts[i]
        bx, bz = pts[(i + 1) % n] if pts[0] == pts[-1] else pts[(i + 1) % n]
        # local: x east, z south (map y=north -> -z below)
        m.quad((ax, 0, -az), (bx, 0, -bz), (bx, h, -bz), (ax, h, -az))
    # floor cap
    for i in range(1, len(pts) - 1):
        ax, az = pts[0]
        m.tri((ax, 0, -az), (pts[i][0], 0, -pts[i][1]), (pts[i+1][0], 0, -pts[i+1][1]))
    use_roof = rh > 0 and shape in ('gabled', 'hipped') and (x1 - x0) > 1 and (z1 - z0) > 1
    if use_roof:
        r = h + rh
        along_x = w >= d
        if shape == 'gabled':
            if along_x:
                zm = (z0 + z1) / 2
                m.quad((x0, h, -z0), (x1, h, -z0), (x1, r, -zm), (x0, r, -zm))
                m.quad((x1, h, -z1), (x0, h, -z1), (x0, r, -zm), (x1, r, -zm))
                m.tri((x0, h, -z0), (x0, r, -zm), (x0, h, -z1))
                m.tri((x1, h, -z0), (x1, h, -z1), (x1, r, -zm))
            else:
                xm = (x0 + x1) / 2
                m.quad((x0, h, -z0), (x0, h, -z1), (xm, r, -z1), (xm, r, -z0))
                m.quad((x1, h, -z0), (xm, r, -z0), (xm, r, -z1), (x1, h, -z1))
                m.tri((x0, h, -z0), (x1, h, -z0), (xm, r, -z0))
                m.tri((x0, h, -z1), (xm, r, -z1), (x1, h, -z1))
        else:
            ix = min(w, d) * 0.22
            if along_x:
                cx0, cx1, cz = x0 + ix, x1 - ix, (z0 + z1) / 2
                m.quad((x0, h, -z0), (x1, h, -z0), (cx1, r, -cz), (cx0, r, -cz))
                m.quad((x1, h, -z1), (x0, h, -z1), (cx0, r, -cz), (cx1, r, -cz))
                m.tri((x0, h, -z0), (cx0, r, -cz), (x0, h, -z1))
                m.tri((x1, h, -z0), (x1, h, -z1), (cx1, r, -cz))
            else:
                cz0, cz1, cx = z0 + ix, z1 - ix, (x0 + x1) / 2
                m.quad((x0, h, -z0), (x0, h, -z1), (cx, r, -cz1), (cx, r, -cz0))
                m.quad((x1, h, -z0), (cx, r, -cz0), (cx, r, -cz1), (x1, h, -z1))
                m.tri((x0, h, -z0), (cx, r, -cz0), (x1, h, -z0))
                m.tri((x0, h, -z1), (x1, h, -z1), (cx, r, -cz1))
        # wall-top cap under roof
        m.quad((x0, h, -z0), (x1, h, -z0), (x1, h, -z1), (x0, h, -z1))
    else:
        # flat top cap at wall height
        for i in range(1, len(pts) - 1):
            ax, az = pts[0]
            m.tri((ax, h, -az), (pts[i+1][0], h, -pts[i+1][1]), (pts[i][0], h, -pts[i][1]))
    return m


def glb(mesh, wall_color, roof_color=None):
    pos, nrm, idx = [], [], []
    base = 0
    # split: wall tris (first N) vs roof tris — caller passes single mesh; color per-vertex? keep 2 materials via groups is complex; use wall color for all + roof tint via second mesh in caller.
    for (ax, ay, az), (bx, by, bz), (cx, cy, cz) in mesh.tris:
        n = norm(cross(bx-ax, by-ay, bz-az, cx-ax, cy-ay, cz-az))
        for p in ((ax, ay, az), (bx, by, bz), (cx, cy, cz)):
            pos.extend(p)
            nrm.extend(n)
            idx.append(base)
            base += 1
    return pos, nrm, idx


def write_glb(path, positions, normals, indices, base_color):
    pos_b = struct.pack('<%df' % len(positions), *positions)
    nrm_b = struct.pack('<%df' % len(normals), *normals)
    idx_b = struct.pack('<%dI' % len(indices), *indices)
    while len(pos_b) % 4: pos_b += b'\x00'
    while len(nrm_b) % 4: nrm_b += b'\x00'
    while len(idx_b) % 4: idx_b += b'\x00'
    blob = pos_b + nrm_b + idx_b
    gltf = {
        'asset': {'version': '2.0', 'generator': 'PERIX-glB-spike'},
        'scene': 0, 'scenes': [{'nodes': [0]}],
        'nodes': [{'mesh': 0}],
        'meshes': [{'primitives': [{'attributes': {'POSITION': 0, 'NORMAL': 1}, 'indices': 2, 'material': 0}]}],
        'materials': [{'pbrMetallicRoughness': {'baseColorFactor': [*base_color, 1.0], 'metallicFactor': 0.0, 'roughnessFactor': 0.95}}],
        'accessors': [
            {'bufferView': 0, 'componentType': 5126, 'count': len(positions)//3, 'type': 'VEC3', 'max': [max(positions[0::3]), max(positions[1::3]), max(positions[2::3])], 'min': [min(positions[0::3]), min(positions[1::3]), min(positions[2::3])]},
            {'bufferView': 1, 'componentType': 5126, 'count': len(normals)//3, 'type': 'VEC3'},
            {'bufferView': 2, 'componentType': 5125, 'count': len(indices), 'type': 'SCALAR'},
        ],
        'bufferViews': [
            {'buffer': 0, 'byteOffset': 0, 'byteLength': len(pos_b)},
            {'buffer': 0, 'byteOffset': len(pos_b), 'byteLength': len(nrm_b)},
            {'buffer': 0, 'byteOffset': len(pos_b)+len(nrm_b), 'byteLength': len(idx_b)},
        ],
        'buffers': [{'byteLength': len(blob)}],
    }
    js = json.dumps(gltf, separators=(',', ':')).encode()
    while len(js) % 4: js += b' '
    out = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(blob))
    out += struct.pack('<II', len(js), 0x4E4F534A) + js
    out += struct.pack('<II', len(blob), 0x004E4942) + blob
    Path(path).write_bytes(out)


def main(limit=10):
    assets = json.load(open(ASSETS, encoding='utf-8'))['assets']
    cands = [a for a in assets if a.get('level') == 'C' and a.get('heightM') and a.get('footprint')]
    print('level-C candidates:', len(cands))
    done = []
    for a in cands[:limit]:
        mesh = build(a)
        pos, nrm, idx = glb(mesh, PALETTE['wall'])
        path = OUT / f"{a['perixId']}.glb"
        write_glb(str(path), pos, nrm, idx, PALETTE['wall'])
        done.append((a['perixId'], len(mesh.tris), path.stat().st_size))
    for d in done:
        print(d)


if __name__ == '__main__':
    main()
