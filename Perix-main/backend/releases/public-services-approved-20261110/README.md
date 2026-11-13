# Magdeburg public directory — published 2026-11-10

## Outcome

- Production: https://app.perix.eu/public-services
- 82 explicitly approved records inserted and published, across all 16 canonical subcategories.
- The other 8 source records were not imported, and their detail URLs return 404.
- Both staging and production passed category counts, all 82 detail reads, pagination (50 + 32), and default map bounds (82 records).
- All 164 approved profile/cover images were downloaded from the public site and verified by SHA-256 against the local assets.
- Browser check of BürgerBüro Mitte confirmed its profile/cover images loaded and its description, contact details, opening hours and map were rendered.
- No frontend rebuild, mobile release, environment-variable changes or changes to unrelated database collections.

## Scope and safeguards

The source is `public_services/staging/perix_90_candidates.json`, SHA-256:
`6687ce55eac6b7637fd961b9caf59d5d5b8af57f0a64de53e6332cb364ce9ae3`.

`public_services/approved_import.py` selects records only when publication, source verification, biography, publication rights and coordinates are explicitly approved. It validates stable identities, canonical categories, coordinates, descriptions and local images without promoting any review status.

The deployment was constructed from each environment's captured live runtime, changing only:

- `public_services/models.py`
- `public_services/repository.py`
- `public_services/taxonomy.json`
- `routes/public_services.py`

The response model now explicitly excludes candidate coordinates and internal geographic review fields, including during FastAPI serialization. The live web archive was preserved byte-for-byte. Runtime verification checked all 184 staging and 185 production captured files against the expected hashes.

Each import started with an empty directory, added a unique `service_id` index, inserted only the approved records as hidden, and published them only after the entire batch was present and validated. Every inserted record has `import_batch=magdeburg-approved-20261110-v1`. A partially inserted hidden batch can be resumed without overwriting existing records.

## Deployments

- Staging: `e195cb47-2503-48b4-9461-1732dd3a4229`
- Production: `cc08d80a-2fd0-4704-adb1-ddc7b8efeb7f`
- Original production: `fb24be78-963a-4e11-bf28-0c8debfb0b42`

Railway's production upload request timed out client-side but was accepted. The deployed runtime and all expected hashes were subsequently verified directly; no further deployment was submitted after discovering the accepted build.

## Tests and evidence

- Backend: 25 passing tests in `test_approved_import.py` and `test_staging_import.py`.
- Frontend: 9 passing tests in `public-services.test.cjs` and `public-service-pages.test.cjs`.
- The broader pre-existing public-services test suite could not collect `test_gateway.py` because its `test_directory` dependency is absent; that unrelated test was not modified.
- API/runtime verification summaries and asset counts are stored alongside this document.

## Private rollback captures and operational commands

Captures, candidate trees and detailed import manifests are kept outside the repository at:

`C:\Users\PC\AppData\Local\Temp\opencode\perix-public-services-approved-20261110`

Each environment has an immutable original `rollback.zip` and `before.json`. Credentials never leave Railway. These captures are not committed.

To recheck the published directory from `Perix-main/backend`:

```powershell
python tools/public_services_release.py verify production --release C:\Users\PC\AppData\Local\Temp\opencode\perix-public-services-approved-20261110
```

If withdrawal is explicitly required, the following hides only the 82 manifest IDs tagged with this batch; it deletes nothing and leaves other data untouched:

```powershell
python tools/public_services_release.py withdraw production --release C:\Users\PC\AppData\Local\Temp\opencode\perix-public-services-approved-20261110
```

Do not recapture over the existing rollback files or rerun a completed import. Use `verify` for completed batches. Runtime rollback requires reviewing and packaging the captured original runtime; `withdraw` changes visibility only.
