"""Import the supplied Syros/Mykonos atlas without geocoding or moving points.

Requires Pillow, numpy and opencv-python. Artwork is separated by connected
component ownership, not rectangular cell cuts (which can clip trees/buildings).
Usage: python scripts/import-island-landmarks.py path/to/source.zip
"""
import argparse
import hashlib
import io
import json
from pathlib import Path
from urllib.parse import quote
import zipfile

import cv2
import numpy as np
from PIL import Image, ImageDraw


def sha(data):
    return hashlib.sha256(data).hexdigest()


def extract_sheet(data, records, output):
    pixels = np.array(Image.open(io.BytesIO(data)).convert('RGBA'))
    alpha = pixels[:, :, 3]
    count, labels, stats, _ = cv2.connectedComponentsWithStats((alpha > 128).astype('uint8'), 8)
    main = [label for label in range(1, count)
            if stats[label, 4] > 4000 and stats[label, 2] > 70 and stats[label, 3] > 55]
    assert len(main) == len(records), 'Atlas needs manual component review'
    # Match each metadata cell to its main illustration, but do not trim to it.
    owners = {}
    for record in records:
        c = record['crop']
        assert 0 <= c['x'] < c['x'] + c['width'] <= pixels.shape[1]
        assert 0 <= c['y'] < c['y'] + c['height'] <= pixels.shape[0]
        region = labels[c['y']:c['y']+c['height'], c['x']:c['x']+c['width']]
        votes = np.bincount(region.ravel(), minlength=count)
        label = max(main, key=lambda value: int(votes[value]))
        assert votes[label] > stats[label, 4] / 2 and label not in owners
        owners[label] = record
    main_mask = np.isin(labels, main).astype('uint8')
    distance, nearest = cv2.distanceTransformWithLabels(
        1-main_mask, cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_CCOMP)
    _, nearest_opaque = cv2.distanceTransformWithLabels(
        (alpha <= 128).astype('uint8'), cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_CCOMP)
    first_pixels = {}
    for label in range(1, count):
        x, y, w, h, _ = map(int, stats[label])
        yy, xx = np.where(labels[y:y+h, x:x+w] == label)
        first_pixels[label] = (y+int(yy[0]), x+int(xx[0]))
    nearest_owner = {int(nearest[first_pixels[label]]): label for label in main}
    assignments = {label: [label] for label in main}
    for label in range(1, count):
        if label in owners:
            continue
        x, y, w, h, _ = map(int, stats[label])
        local = labels[y:y+h, x:x+w] == label
        assert float(distance[y:y+h, x:x+w][local].min()) <= 26, 'Detached artwork needs review'
        votes = nearest[y:y+h, x:x+w][local]
        owner = nearest_owner[int(np.bincount(votes).argmax())]
        assignments[owner].append(label)
    # Discard only the atlas's disconnected low-alpha matte, keeping fringes.
    _, soft_labels, _, _ = cv2.connectedComponentsWithStats((alpha > 8).astype('uint8'), 8)
    soft_art = np.isin(soft_labels, np.unique(soft_labels[alpha > 128])) & (alpha > 8)
    covered = np.zeros(alpha.shape, 'uint8')
    results = []
    for label, record in owners.items():
        opaque_ids = [int(nearest_opaque[first_pixels[value]]) for value in assignments[label]]
        keep = np.isin(nearest_opaque, opaque_ids) & soft_art
        halo = cv2.dilate(keep.astype('uint8'), np.ones((5, 5), 'uint8')) > 0
        keep |= halo & (alpha > 0) & (alpha <= 8)
        protected = np.isin(labels, assignments[label])
        assert np.all(keep[protected]), 'Opaque artwork lost'
        covered[protected] += 1
        ys, xs = np.where(keep & (alpha > 0))
        x0, x1, y0, y1 = int(xs.min()), int(xs.max()+1), int(ys.min()), int(ys.max()+1)
        tile = pixels[y0:y1, x0:x1].copy()
        tile[:, :, 3] = np.where(keep[y0:y1, x0:x1], tile[:, :, 3], 0)
        sprite = Image.new('RGBA', (x1-x0+16, y1-y0+16))
        sprite.paste(Image.fromarray(tile), (8, 8))
        icon_id = f"GR-{record['island'].upper()}-{record['icon_id']:03}"
        filename = icon_id.lower()+'.webp'
        target = output / filename
        sprite.save(target, 'WEBP', lossless=True, exact=True, method=6)
        decoded = np.array(Image.open(target).convert('RGBA'))
        visible = decoded[:, :, 3] > 0
        assert np.array_equal(decoded[visible], np.array(sprite)[visible])
        c = record['crop']
        inside = np.zeros(alpha.shape, bool)
        inside[c['y']:c['y']+c['height'], c['x']:c['x']+c['width']] = True
        results.append(dict(id=icon_id, iconId=record['icon_id'], imageFile=filename,
                            sourceFile=record['png_file'], sourceBox=[x0, y0, x1, y1],
                            opaquePixels=int(protected.sum()),
                            restoredOutsideCell=int((protected & ~inside).sum()),
                            size=list(sprite.size), sha256=sha(target.read_bytes())))
    assert np.all(covered[alpha > 128] == 1), 'Every opaque source pixel must be preserved exactly once'
    return results


def main(archive, frontend):
    output = frontend / 'assets/landmarks/islands'
    assert not output.exists(), 'Refusing to overwrite an existing island import'
    with zipfile.ZipFile(archive) as source:
        raw = source.read('syros_mykonos_all_222.json')
        data = json.loads(raw)
        records = data['locations']
        assert len(records) == 222
        assert len({r['id'] for r in records}) == len({r['icon_id'] for r in records}) == 222
        assert {r['island'] for r in records} == {'Syros', 'Mykonos'}
        output.mkdir(parents=True)
        sources = output / 'sources'
        sources.mkdir()
        (sources / 'locations.json').write_bytes(raw)
        (sources / 'README.txt').write_bytes(source.read('README.txt'))
        icons, sheets = [], []
        for filename in dict.fromkeys(r['png_file'] for r in records):
            content = source.read(filename)
            (sources / filename).write_bytes(content)
            icons.extend(extract_sheet(content, [r for r in records if r['png_file'] == filename], output))
            sheets.append(dict(file=filename, sha256=sha(content)))
    icons.sort(key=lambda icon: icon['iconId'])
    manifest = dict(sourceZip=archive.name, sourceZipSha256=sha(archive.read_bytes()),
                    locationsSha256=sha(raw), sheets=sheets, icons=icons,
                    method='connected component ownership; source RGBA retained; 8px transparent padding')
    (output / 'manifest.json').write_text(json.dumps(manifest, indent=2)+'\n', encoding='utf-8')
    locations = []
    for record, icon in zip(records, icons):
        assert record['icon_id'] == icon['iconId']
        lat, lng = record['latitude'], record['longitude']
        assert 36 < lat < 39 and 24 < lng < 26
        name = record.get('display_name') or record.get('name') or record['icon_label']
        locations.append(dict(id=icon['id'], name=name, island=record['island'],
                              category=record['category'], latitude=lat, longitude=lng,
                              address=record.get('address') or '',
                              googleMapsUrl='https://www.google.com/maps/search/?api=1&query='+quote(f'{lat},{lng}', safe=''),
                              sourceUrl=record['source_url'], sourceId=record['id'],
                              coordinateStatus=record['coordinate_validation'],
                              coordinateNote=record['coordinate_notes'], imageFile=icon['imageFile']))
    lib = frontend / 'lib/city'
    header = '// Generated by scripts/import-island-landmarks.py; source coordinates are unchanged.\n'
    typedef = ('export type IslandLandmark = {\n'
               '  id: string; name: string; island: "Syros" | "Mykonos"; category: string;\n'
               '  latitude: number; longitude: number; address: string; googleMapsUrl: string;\n'
               '  sourceUrl: string; sourceId: string; coordinateStatus: string; coordinateNote: string; imageFile: string;\n'
               '};\n\n')
    (lib / 'islandLandmarks.generated.ts').write_text(
        header+typedef+'export const ISLAND_LANDMARKS: IslandLandmark[] = '+json.dumps(locations, ensure_ascii=False, indent=2)+';\n', encoding='utf-8')
    image_lines = [f"  '{icon['id']}': require('../../assets/landmarks/islands/{icon['imageFile']}')," for icon in icons]
    (lib / 'islandLandmarkImages.generated.ts').write_text(
        header+'export const ISLAND_LANDMARK_IMAGES: Record<string, any> = {\n'+'\n'.join(image_lines)+'\n};\n', encoding='utf-8')
    preview = Image.new('RGB', (8*180, 28*164), '#edf3f7')
    draw = ImageDraw.Draw(preview)
    for index, icon in enumerate(icons):
        sprite = Image.open(output / icon['imageFile']).convert('RGBA')
        sprite.thumbnail((170, 140), Image.Resampling.LANCZOS)
        x, y = index % 8 * 180, index // 8 * 164
        preview.paste(sprite, (x+(180-sprite.width)//2, y+(140-sprite.height)//2), sprite)
        draw.text((x+4, y+144), icon['id'], fill='#18334a')
    preview.save(output / 'review.jpg', quality=90)
    print(json.dumps(dict(icons=len(icons), restoredOutsideCells=sum(i['restoredOutsideCell'] for i in icons), output=str(output))))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archive', type=Path)
    parser.add_argument('--frontend', type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    main(args.archive, args.frontend)
