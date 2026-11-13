"""Crop the supplied civic/jobs artwork, excluding captions without redrawing it."""
import argparse
import hashlib
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw

PUBLIC_IDS = ["citizen-services", "immigration-citizenship", "civil-registry", "business-licensing",
              "family-youth", "social-housing", "public-health", "mobility-transport", "building-infrastructure",
              "education-culture", "waste-recycling", "government-administration", "employment-careers",
              "courts-justice", "tax-finance", "police-security", "ps-sos"]
JOBS = ["Vollzeit", "Teilzeit", "Vertrag", "Praktikum", "Remote"]


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def crop(source, box):
    rgb = np.array(source.crop(box).convert("RGB"))
    # Remove only near-white background connected to the crop boundary.
    # Enclosed white artwork (windows/paper) remains intact.
    white = ((rgb.min(2) >= 238) & (rgb.max(2).astype(int) - rgb.min(2) <= 16)).astype("uint8")
    _, labels = cv2.connectedComponents(white, connectivity=8)
    edge = set(np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]])).tolist()) - {0}
    alpha = np.where(np.isin(labels, list(edge)), 0, 255).astype("uint8")
    # A few crowded cells contain a thin clipped fragment of their neighbour.
    # Remove only small detached pieces touching a vertical crop boundary;
    # detached details inside the cell (flags, rays, handles) remain intact.
    count, parts, stats, _ = cv2.connectedComponentsWithStats((alpha > 0).astype("uint8"), 8)
    largest = max(stats[1:, cv2.CC_STAT_AREA], default=0)
    for label in range(1, count):
        x, y, width, height, area = stats[label]
        if (x == 0 or x + width == alpha.shape[1]) and area < largest * .06:
            alpha[parts == label] = 0
    rgba = Image.fromarray(np.dstack([rgb, alpha]))
    trim = rgba.getbbox()
    assert trim is not None
    rgba = rgba.crop(trim)
    result = Image.new("RGBA", (rgba.width + 20, rgba.height + 20))
    result.paste(rgba, (10, 10))
    return result, trim


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input-dir", type=Path, default=Path.home() / "Downloads")
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parents[1] / "assets/illustrations/civic-jobs-v1")
    parser.add_argument("--preview", type=Path, required=True)
    args = parser.parse_args()
    public = args.input_dir / "Handcrafted Public Services Icon Sheet.png"
    jobs = args.input_dir / "Handcrafted Civic Services and Jobs Icons.png"
    images = {"public": Image.open(public).convert("RGB"), "jobs": Image.open(jobs).convert("RGB")}
    assert images["public"].size == (1448, 1086) and images["jobs"].size == (2032, 774)
    # Hand-reviewed cell boundaries, stopping before the English captions.
    top = [4, 191, 345, 488, 648, 804, 964, 1118, 1278, 1448]
    bottom = [4, 196, 360, 540, 720, 891, 1063, 1241, 1448]
    cells = [("public", key, (top[i] - ({1: 6, 7: 15, 8: 10}.get(i, 0)), 230, top[i + 1], 460)) for i, key in enumerate(PUBLIC_IDS[:9])]
    cells += [("public", key, (bottom[i], 618, bottom[i + 1] + ({0: 15, 5: 7, 6: 9}.get(i, 0)), 870)) for i, key in enumerate(PUBLIC_IDS[9:])]
    job_edges = [(80, 445), (464, 799), (814, 1170), (1175, 1530), (1535, 1970)]
    cells += [("jobs", key, (job_edges[i][0], 385, job_edges[i][1], 664)) for i, key in enumerate(JOBS)]
    records = []
    review = Image.new("RGB", (6 * 210, 4 * 232), "#edf3f7")
    draw = ImageDraw.Draw(review)
    for index, (sheet, key, box) in enumerate(cells):
        sprite, trim = crop(images[sheet], box)
        folder = "public-services" if sheet == "public" else "jobs"
        path = args.output / folder / (key + ".webp")
        path.parent.mkdir(parents=True, exist_ok=True)
        sprite.save(path, "WEBP", lossless=True, exact=True, method=6)
        records.append({"id": key, "sheet": sheet, "box": box, "trim": trim,
                        "file": path.relative_to(args.output).as_posix(), "size": sprite.size, "sha256": sha(path)})
        thumb = sprite.copy()
        thumb.thumbnail((190, 188), Image.Resampling.LANCZOS)
        x, y = index % 6 * 210, index // 6 * 232
        review.paste(thumb, (x + (210 - thumb.width) // 2, y + (194 - thumb.height) // 2), thumb)
        draw.text((x + 5, y + 200), key, fill="#064472")
    manifest = {"sources": {"public": {"file": public.name, "sha256": sha(public)},
                            "jobs": {"file": jobs.name, "sha256": sha(jobs)}},
                "method": "caption-free hand-reviewed crop; edge-connected white removal; original RGB artwork preserved", "icons": records}
    (args.output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    args.preview.parent.mkdir(parents=True, exist_ok=True)
    review.save(args.preview)
    print(json.dumps({"icons": len(records), "preview": str(args.preview), "output": str(args.output)}))


if __name__ == "__main__":
    main()
