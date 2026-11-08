# Area selection: minimal backend delta

Baseline staging: `fd42aaba-c78c-441f-b908-cbf39b11a373`.
Area-selection staging: `12d03485-566c-4aec-8834-0c5f51a4e278`.
Promoted to production as `a7360ffb-4c82-4f16-bacc-bd7861111c5e` with a rebuilt
production-targeted frontend. See the frontend production release record.

Only backend application change: `routes/places.py` permits anonymous read-only
address suggestions, so choosing an origin does not require GPS or login.
It retains the existing provider throttle and server rate limits, adds a
bounded 120-second/256-key cache and validates input/coordinate bounds.
Reverse geocoding and protected account/business endpoints remain protected.
No motion engine, vehicle/GPS data, journey identity/importer, database,
environment, island service or paid Google Routes changes are included.

The shared backend tree contains older unrelated WIP. Never deploy it or apply
this patch over it. To replay against a hash-verified baseline **context**:

```powershell
python replay.py --baseline <verified-context> --destination <new-directory>
```

The new destination must not exist. All baseline/patch/reconstructed hashes
are checked. The replay intentionally retains the old frontend archive;
the new frontend must be built separately. See
`../../../frontend/LOCATION_MODE_2026-10-24.md` for UI semantics, validation
and evidence limitations.
