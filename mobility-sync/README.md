# Perix Mobility Sync

Στατικός GTFS sync worker για το Magdeburg (MVB).

## Ροή

```
MVB GTFS zip (GovData / GTFS.de)
        │
        ▼
static_sync.py
   │  download → SHA256 (skip αν δεν άλλαξε)
   │  upload στο Perix: POST /mobility/network/import-gtfs
   │  health checks (min γραμμές/δρομολόγια)
   ▼
Perix → νέα network version → [auto-activate αν υγιές]
```

## Χρήση

```bash
cp config.example.json config.json   # βάλε sync_token + gtfs_url
python static_sync.py --config config.json [--date YYYY-MM-DD]
```

Σε production: cron κάθε 1-6 ώρες:

```
0 */3 * * * cd /opt/perix/mobility-sync && python static_sync.py --config config.json >> sync.log 2>&1
```

## Realtime (GTFS-RT)

Το Perix δέχεται TripUpdates στο `POST /mobility/network/realtime`
(`{ updates: [{ trip_id, delay_seconds, source }] }`). Μόλις η MVB/NASA
διαθέσει το RT feed, ένα `realtime_sync.py` στέλνει εκεί τις καθυστερήσεις
κάθε ~10s και τα estimated markers γίνονται `REALTIME_ESTIMATE`.

## Σημειώσεις

- Το `sync_token` είναι session token ενός Mobility operator account.
- Sanity check: ~9 tram + 14 bus γραμμές για το MVB.
- Με μεγάλες αλλαγές (>25% γραμμές) το `auto_activate` πρέπει να μένει false.
