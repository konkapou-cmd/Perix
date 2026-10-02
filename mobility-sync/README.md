# Perix Mobility Sync

Αυτόματο sync για το Magdeburg (MVB): στατικό GTFS + GTFS-Realtime.

## Ασφάλεια

Τα scripts ΔΕΝ χρησιμοποιούν user session tokens. Χρησιμοποιούν το
**περιορισμένο service credential** `MOBILITY_SYNC_API_KEY` (header
`X-Perix-Sync-Key`) που ξεκλειδώνει ΜΟΝΟ:
- `POST /mobility/network/import` / `import-gtfs` / `activate`
- `POST /mobility/network/realtime`

Το key ορίζεται σαν environment variable στον backend (Railway):
`MOBILITY_SYNC_API_KEY=...` (+ προαιρετικό `MOBILITY_SYNC_BUSINESS_ID`).

## Static

```bash
cp config.example.json config.json
python static_sync.py --config config.json [--date YYYY-MM-DD]
```

- Κατεβάζει το GTFS zip → SHA256 (skip αν δεν άλλαξε)
- Το ανεβάζει στο Perix (`/mobility/network/import-gtfs` — το backend κάνει τη μετατροπή)
- Health checks (min γραμμές/δρομολόγια) → auto-activate αν υγιές

Cron: `0 */3 * * * cd /opt/perix/mobility-sync && python static_sync.py >> sync.log 2>&1`

## Realtime

```bash
pip install gtfs-realtime-bindings
python realtime_sync.py --config config.json
```

- Polls `https://realtime.gtfs.de/realtime-free.pb` κάθε ~10s
- Φιλτράρει MVB trips (βάσει του ενεργού δικτύου)
- Σπρώχνει delays στο `/mobility/network/realtime` → τα markers γίνονται
  `REALTIME_ESTIMATE` με πραγματική καθυστέρηση

## Πηγές

- Static MVB: GovData/Mobilithek offer `620651164804734976`
  (https://mobilithek.info/offers/620651164804734976)
- Fallback static: GTFS.de nationwide feed + MVB φιλτράρισμα
- Realtime: https://realtime.gtfs.de/realtime-free.pb (SIRI Sachsen-Anhalt)

## Σημειώσεις

- Sanity check: ~9 tram + 14 bus γραμμές MVB.
- Με μεγάλες αλλαγές (>25% γραμμές) το `auto_activate` πρέπει να είναι false.
