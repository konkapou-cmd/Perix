#!/usr/bin/env python3
"""
Perix Mobility - GTFS-Realtime sync worker.

Polls the public GTFS.de realtime feed (TripUpdates, ~10s refresh) and
pushes delays for MVB trips to Perix:
    POST /mobility/network/realtime
    header: X-Perix-Sync-Key

Requires:
    pip install gtfs-realtime-bindings

Config (config.json):
{
  "perix_api": "https://app.perixapp.com/api",
  "sync_api_key": "mobility-sync-key",
  "realtime_url": "https://realtime.gtfs.de/realtime-free.pb",
  "interval_seconds": 10,
  "network_refresh_seconds": 900
}
"""
import argparse
import json
import time
import urllib.request

from google.transit import gtfs_realtime_pb2

def log(msg):
    print(f"[realtime_sync] {msg}")

def fetch(url, timeout=60):
    req = urllib.request.Request(url, headers={"User-Agent": "PerixMobilitySync/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()

def known_trip_ids(cfg):
    try:
        req = urllib.request.Request(
            f"{cfg['perix_api']}/mobility/network",
            headers={"X-Perix-Sync-Key": cfg["sync_api_key"]},
        )
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read().decode())
        ids = set()
        for route in data.get("routes", []):
            for trip in route.get("trips", []):
                if trip.get("trip_id"):
                    ids.add(trip["trip_id"])
        return ids
    except Exception as e:
        log(f"network fetch failed: {e}")
        return set()

def push(cfg, updates):
    if not updates:
        return
    body = json.dumps({"updates": updates}).encode()
    req = urllib.request.Request(
        f"{cfg['perix_api']}/mobility/network/realtime",
        data=body,
        method="POST",
        headers={
            "X-Perix-Sync-Key": cfg["sync_api_key"],
            "Content-Type": "application/json",
        },
    )
    try:
        urllib.request.urlopen(req, timeout=60)
        log(f"pushed {len(updates)} trip updates")
    except Exception as e:
        log(f"push failed: {e}")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", default="config.json")
    args = ap.parse_args()

    with open(args.config, encoding="utf-8") as f:
        cfg = json.load(f)

    trip_ids = set()
    last_network_refresh = 0.0
    interval = cfg.get("interval_seconds", 10)
    network_refresh = cfg.get("network_refresh_seconds", 900)

    log(f"Starting. realtime={cfg.get('realtime_url')} interval={interval}s")

    while True:
        started = time.time()
        try:
            now = time.time()
            if not trip_ids or now - last_network_refresh > network_refresh:
                trip_ids = known_trip_ids(cfg)
                last_network_refresh = now
                log(f"{len(trip_ids)} known trip ids")

            raw = fetch(cfg["realtime_url"])
            feed = gtfs_realtime_pb2.FeedMessage()
            feed.ParseFromString(raw)

            updates = []
            for entity in feed.entity:
                tu = entity.trip_update
                if not tu or not tu.trip.trip_id:
                    continue
                trip_id = tu.trip.trip_id
                if trip_id not in trip_ids:
                    continue
                delay = 0
                for stu in tu.stop_time_update:
                    d = None
                    if stu.HasField("departure") and stu.departure.HasField("delay"):
                        d = stu.departure.delay
                    elif stu.HasField("arrival") and stu.arrival.HasField("delay"):
                        d = stu.arrival.delay
                    if d is not None and d > delay:
                        delay = d
                updates.append({
                    "trip_id": trip_id,
                    "delay_seconds": max(0, int(delay)),
                    "source": "GTFS_RT",
                })
            push(cfg, updates)
        except Exception as e:
            log(f"cycle error: {e}")

        elapsed = time.time() - started
        if elapsed < interval:
            time.sleep(interval - elapsed)

if __name__ == "__main__":
    main()
