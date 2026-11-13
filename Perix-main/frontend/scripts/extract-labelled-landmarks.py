"""Extract the supplied labelled atlas by alpha-component masks, not grid cuts.

Developer tool: Pillow, numpy, opencv-python. No model/redraw or geocoding.
Writes a NEW review directory only; never overwrites the atlas or live assets.
Example: python scripts/extract-labelled-landmarks.py --sheet PATH --output NEW_DIR
"""
import argparse
import hashlib
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def extract(sheet_path, output, padding=8):
    source = Image.open(sheet_path).convert("RGBA")
    pixels = np.array(source)
    alpha = pixels[:, :, 3]
    # Opaque cores separate captions from artwork even where low-alpha halos
    # touch. Voronoi ownership below recovers the original antialiased edge;
    # simply using alpha>8 joins eight captions to their illustrations.
    count, labels, stats, _ = cv2.connectedComponentsWithStats((alpha > 128).astype("uint8"), 8)
    components = []
    for label in range(1, count):
        x, y, w, h, area = map(int, stats[label])
        if area > 7000 and w > 100 and h > 65:
            components.append(dict(label=label, x=x, y=y, w=w, h=h, area=area))
    rows = []
    for comp in sorted(components, key=lambda c: (c["y"], c["x"])):
        if not rows or comp["y"] - min(c["y"] for c in rows[-1]) > 55:
            rows.append([comp])
        else:
            rows[-1].append(comp)
    assert len(components) == 70 and [len(row) for row in rows] == [7] * 10, "Unexpected atlas layout: manual review required"
    ordered = [comp for row in rows for comp in sorted(row, key=lambda c: c["x"])]
    main_ids = {c["label"] for c in ordered}
    main_mask = np.isin(labels, list(main_ids)).astype("uint8")
    distance, nearest = cv2.distanceTransformWithLabels(1 - main_mask, cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_CCOMP)
    owners = {}
    opaque_ids = {}
    _, nearest_opaque = cv2.distanceTransformWithLabels((alpha <= 128).astype("uint8"), cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_CCOMP)
    for comp in ordered:
        yy, xx = np.where(labels == comp["label"])
        owners[int(nearest[yy[0], xx[0]])] = comp["label"]
    for label in range(1, count):
        yy, xx = np.where(labels == label)
        opaque_ids[label] = int(nearest_opaque[yy[0], xx[0]])
    additions = {label: [] for label in main_ids}
    for label in range(1, count):
        if label in main_ids:
            continue
        x, y, w, h, area = map(int, stats[label])
        if area > 350:
            continue
        local = labels[y:y+h, x:x+w] == label
        distances = distance[y:y+h, x:x+w][local]
        if not len(distances) or float(distances.min()) > 3:
            continue
        votes = nearest[y:y+h, x:x+w][local]
        owner = owners.get(int(np.bincount(votes).argmax()))
        if owner is None:
            continue
        comp = next(c for c in ordered if c["label"] == owner)
        # Detached spire/cross/foliage details may belong to the artwork.
        # Captions below the painted base NEVER qualify. OCR rectangles are
        # deliberately not used to erase any pixels of a main illustration.
        if x >= comp["x"]-3 and x+w <= comp["x"]+comp["w"]+3 and y >= comp["y"]-16 and y+h <= comp["y"]+comp["h"]:
            additions[owner].append(label)

    output.mkdir(parents=True, exist_ok=False)
    icons, masks = output / "icons", output / "masks"
    icons.mkdir(); masks.mkdir()
    sheet_preview = Image.new("RGB", (7*180, 10*174), "#edf3f7")
    draw = ImageDraw.Draw(sheet_preview)
    report = dict(source_name=sheet_path.name, source_sha256=sha(sheet_path), source_size=list(source.size),
                  method="opaque cores + antialias ownership masks; no OCR/grid erasure",
                  core_alpha_threshold=128, matte_alpha_threshold=8, padding=padding, icons=[])
    for index, comp in enumerate(ordered, 1):
        icon_id = f"legacy-{index:03}"
        kept_labels = [comp["label"], *additions[comp["label"]]]
        keep = np.isin(nearest_opaque, [opaque_ids[label] for label in kept_labels]) & (alpha > 8)
        # Recover only the original weak-alpha antialias fringe within 2px.
        halo = cv2.dilate(keep.astype("uint8"), np.ones((5, 5), "uint8")) > 0
        keep |= halo & (alpha > 0) & (alpha <= 8)
        ys, xs = np.where(keep & (alpha > 0))
        x0, x1, y0, y1 = int(xs.min()), int(xs.max()+1), int(ys.min()), int(ys.max()+1)
        cropped = pixels[y0:y1, x0:x1].copy()
        cropped[:, :, 3] = np.where(keep[y0:y1, x0:x1], cropped[:, :, 3], 0)
        out = Image.new("RGBA", (x1-x0+2*padding, y1-y0+2*padding))
        out.paste(Image.fromarray(cropped), (padding, padding))
        mask = out.getchannel("A")
        bbox = mask.getbbox()
        assert bbox and min(bbox[0], bbox[1], out.width-bbox[2], out.height-bbox[3]) >= padding
        main_local = labels[y0:y1, x0:x1] == comp["label"]
        assert np.array_equal(cropped[:, :, 3][main_local], alpha[y0:y1, x0:x1][main_local]), "Main artwork was erased"
        target = icons / f"{icon_id}.webp"
        out.save(target, "WEBP", lossless=True, exact=True, method=6)
        mask.save(masks / f"{icon_id}.png", optimize=True)
        decoded = np.array(Image.open(target).convert("RGBA"))
        visible = decoded[:, :, 3] > 0
        assert np.array_equal(decoded[visible], np.array(out)[visible]), "Export altered original artwork pixels"
        report["icons"].append(dict(id=icon_id, source_box=[x0,y0,x1,y1], original_component_pixels=comp["area"],
                                    preserved_component_pixels=int(main_local.sum()), detached_components=additions[comp["label"]],
                                    size=list(out.size), alpha_bbox=list(bbox), sha256=sha(target), mask_sha256=sha(masks/f"{icon_id}.png"),
                                    source_boundary_touch=x0==0 or y0==0 or x1==source.width or y1==source.height))
        thumb = out.copy(); thumb.thumbnail((170, 144), Image.Resampling.LANCZOS)
        x, y = ((index-1)%7)*180, ((index-1)//7)*174
        sheet_preview.paste(thumb, (x+(180-thumb.width)//2, y+4+(144-thumb.height)//2), thumb)
        draw.text((x+8,y+151), icon_id, fill="#18334a")
    assert len(report["icons"]) == 70
    (output/"mask-manifest.json").write_text(json.dumps(report,indent=2),encoding="utf-8")
    sheet_preview.save(output/"all-70-review.png")
    assert sha(sheet_path) == report["source_sha256"], "Source atlas changed"
    print(json.dumps(dict(output=str(output),icons=70,source_unchanged=True,all_main_pixels_preserved=True)))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sheet", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    extract(args.sheet, args.output)
