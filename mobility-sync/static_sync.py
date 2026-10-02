#!/usr/bin/env python3
"""
Perix Mobility - static GTFS sync worker.

Downloads the official Magdeburg (MVB) GTFS feed, uploads it to Perix
(POST /mobility/network/import-gtfs - the backend converts the zip), runs
sanity checks and optionally auto-activates the new network version.

Usage:
  python static_sync.py --config config.json

Config (config.json):
{
  "perix_api": "https://app.perixapp.com/api",
  "sync_token": "session_...",            # operator session token
  "gtfs_url": "https://.../mvb_gtfs.zip", # or the GTFS.de nationwide feed
  "state_file": ".last_sha256",
  "min_trips": 500,                        # sanity check before auto-activate
  "min_lines": 10,
  "auto_activate": true
}
"""
import argparse
import hashlib
import json
import sys
import urllib.request
import uuid

def log(msg):
    print(f"[static_sync] {msg}")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", default="config.json")
    ap.add_argument("--date", default=None, help="service date YYYY-MM-DD (default: today in Berlin)")
    args = ap.parse_args()

    with open(args.config, encoding="utf-8") as f:
        cfg = json.load(f)

    log("Downloading GTFS...")
    req = urllib.request.Request(cfg["gtfs_url"], headers={"User-Agent": "PerixMobilitySync/1.0"})
    data = urllib.request.urlopen(req, timeout=120).read()
    sha = hashlib.sha256(data).hexdigest()

    try:
        with open(cfg.get("state_file", ".last_sha256")) as f:
            last = f.read().strip()
    except FileNotFoundError:
        last = ""

    if last == sha:
        log("Feed unchanged - nothing to do.")
        return

    log(f"Feed changed ({last[:12] or 'none'} -> {sha[:12]}). Uploading to Perix...")
    boundary = uuid.uuid4().hex
    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="mvb_gtfs.zip"\r\n'
        "Content-Type: application/zip\r\n\r\n"
    ).encode() + data + f"\r\n--{boundary}--\r\n".encode()

    request = urllib.request.Request(
        f"{cfg['perix_api']}/mobility/network/import-gtfs",
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {cfg['sync_token']}",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=300) as resp:
            result = json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        log(f"Perix rejected the import: HTTP {e.code} {e.read().decode()[:300]}")
        sys.exit(1)

    summary = result.get("summary") or {}
    trips = summary.get("trips", 0)
    lines = (summary.get("bus_lines", 0) or 0) + (summary.get("tram_lines", 0) or 0)
    log(
        f"Imported version {result['version_id']}: {lines} lines, {trips} trips "
        f"({summary.get('service_date')}). diff: {result.get('diff')}"
    )

    if cfg.get("auto_activate") and trips >= cfg.get("min_trips", 500) and lines >= cfg.get("min_lines", 10):
        log("Health check passed - activating.")
        activate_body = json.dumps({"version_id": result["version_id"]}).encode()
        req2 = urllib.request.Request(
            f"{cfg['perix_api']}/mobility/network/activate",
            data=activate_body,
            method="POST",
            headers={"Authorization": f"Bearer {cfg['sync_token']}", "Content-Type": "application/json"},
        )
        try:
            urllib.request.urlopen(req2, timeout=60)
            log("Activated.")
        except urllib.error.HTTPError as e:
            log(f"Activate failed: HTTP {e.code}")
    else:
        log("Health check failed - leaving the version inactive for operator review.")

    with open(cfg.get("state_file", ".last_sha256"), "w") as f:
        f.write(sha)
    log("Done.")

if __name__ == "__main__":
    main()
