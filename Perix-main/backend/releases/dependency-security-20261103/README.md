# Dependency audit remediation — SDK 54 retained

## Outcome

The original **59 production-scope npm audit package records** are reduced to
**zero known npm advisories** in the accepted clean install. Both
`npm audit --json` (including development dependencies) and
`npm audit --omit=dev --json` exit **0**, with zero critical/high/moderate/low
records. The working checkout was updated from the tested package and also
passed a fresh install, audit, TypeScript and the 72 selected frontend tests.

This is **not a blanket security certification**: npm does not assess private
adapter/backport source, platform-native binaries, application authorization or
the entire deployed Python stack. The private code has explicit provenance,
regression tests and maintenance obligations below; it was not hidden behind
an advisory ignore list or an invented upstream patched version.

The user explicitly selected **SDK 54 with reviewed patches/adapters**, rather
than an Expo/React Native major migration. No `audit fix --force`, production
deployment, APK/IPA build, OTA publication, source importer or paid Routes
traffic activation occurred.

## Accepted source and exact artifacts

Root:

`C:\Users\PC\AppData\Local\Temp\opencode\perix-dependency-upgrade-20261103-v4\`

- Parent: the frozen type-corrected visual candidate, not the dirty checkout.
- **741 source files**, **84 total changed/new files** against Git baseline
  `082be7d5c2851c74c5420eaa4d4be2f3d8434d4b`.
- Source tree SHA-256:
  `da243d46565d302717704d439324b572a8bcc9e384dfa1486d0ba9d6d83bb6f6`.
- Reviewed full delta SHA-256:
  `33bffe25fb4696e75b284e760e69f1ddbc7cbe3a2d43f99eedfd18c205bde9e1`.
- All **741 files** reproduced exactly by baseline + patch, using
  `git -c core.autocrlf=false apply`.
- New npm lock SHA-256:
  `7018362584696467e23263eaede22ceea256ad2f0a44e1e5bf32dcc695aaa49f`.
- Runtime tree SHA-256:
  `2fd33dd4cc0ed53e11503718efb592dce30f3dcf43371770d81b18d484dadd61`.
- Runtime ZIP SHA-256:
  `05cae34cb9279f249475dd29e6aca29bc101bb243bee4e4409e189476ff4ab3c`.
- Web entry: `entry-d469c8bcad21c86a71ad19f1c8ca7894.js`, SHA-256
  `3bee43025a4bfaf8260a5e109b4e230b7c03ccd2464eb46c889f02e1fba27855`.

Incremental source changes are restricted to dependency declarations/lock,
`.npmrc`, private vendor sources/notices, two regression test files and a
**type-only** timer-handle portability change in `lib/city/fleetPoller.ts`.
That companion fix accepts browser/native numbers and Node Timeout objects;
the scheduler, cadence, cancellation behavior and progress equations are not
changed. Existing unrelated dirty work and backend WIP exclusions remain.

Only **`backend/webdist.dat`** differs from the previous runtime package.
Backend application bytes remain unchanged. The runtime excludes source/test
control apps, node_modules, old releases, raw captures and `.env*` files.
The private vendor directory and lock must accompany source builds, but no
Node tooling is installed into the hosted Python runtime.

## Upgrade strategy and package boundaries

- Expo moved **54.0.37 → 54.0.38**, within SDK 54. React remains **19.1.0**;
  React Native remains **0.81.5**.
- Removed the redundant direct **Expo CLI 56** declaration. Expo SDK 54
  supplies its matched **CLI 54.0.28**, rather than retaining two CLI families.
  `expo install --check` in online mode reports dependencies up to date.
- Reproducible tested toolchain: **Node 24.13.1 / npm 11.10.0**. The project
  now records npm 11.10.0 as packageManager and compatible Node engine ranges.
  The existing `legacy-peer-deps=true` is unchanged. `install-links=true`
  makes local private dependencies packed installations instead of mutable
  directory links. `npm ls --all --json` exits 0 with no problems.
- Compatible public updates include **protobufjs 7.6.6**, **shell-quote
  1.12.0**, **websocket-driver 0.7.5**, **@grpc/grpc-js 1.14.7**, **postcss
  8.5.32**, **yaml 1.10.3** for old 1.x consumers and patched brace-expansion
  versions in each retained major family.

Some upstream security fixes change module shape or old callable APIs. The
private packages in `frontend/vendor/` retain only the project's tested
compatibility boundaries and delegate implementation to fixed, pinned public
packages:

| Private layer | Real implementation / reason |
|---|---|
| query-string compatibility | `query-string@9.5.1`, fixed `decode-uri-component@0.5.1`; preserves seven named CJS/ESM methods |
| minimatch compatibility | `minimatch@11.0.4`; callable legacy interface plus modern named exports |
| glob compatibility | `glob@14.0.3`; delegates walking too, rather than coupling glob 7's old RegExp internals to minimatch 11's state-machine matchers |
| image-size compatibility | `image-size@2.0.4`; callable/named, Buffer, bounded sync-file and official asynchronous-file paths |
| uuid compatibility | `uuid@11.1.1`; default v4, named exports and legacy version subpaths, with fixed buffer validation |
| deepmerge backport | actual reviewed local source change; there is **no published patched deepmerge version** for this advisory |

The glob bridge preserves POSIX-shaped legacy paths on Windows, callback and
sync calls, the used match/end event surface and immediate cancellation. It
does not claim to implement every undocumented internal of glob 7. Modern glob
consumers resolve the actual public modern package. Tests exercise real bounded
fixture trees and the actual React Navigation core, not only fake parsers.

## Actual deepmerge repair, not an audit rename

Fork identity: `@perix/deepmerge-safe@4.3.1-perix.1`, private. It derives from
MIT-licensed deepmerge 4.3.1; the upstream licence is retained. Original compiled
source SHA-256:
`2e5160f84a1141bd927264afe4d15766f1e6cf07daef182b37ff53fea121de7d`.

For **GHSA-gcqx-w48m-w2h4**, writes to the newly allocated merge destination
use `Object.defineProperty` with own writable/enumerable/configurable **data**
properties instead of invoking an inherited `__proto__` setter. Both initial
target copying and subsequent source merging are repaired. The existing clone,
array, customMerge, Date/RegExp and symbol policies are retained.

A local A/B reproduction used the real unpatched 4.3.1 implementation and the
backport. In **both** target-copy and null-prototype-target cases, the upstream
returned object inherited the supplied poison; the backport retained
`Object.prototype` and no inherited poison. Global Object.prototype remained
untouched throughout. Normal merge/custom/clone behaviors have separate tests.
This evidence is in `deepmerge-backport-repro.json` and the regression suite.

## Clean-install and audit evidence

Accepted v4 was installed from its own source/lock with **`npm ci`**, not a
shared dirty node_modules directory. The working checkout subsequently ran the
same clean install. All **six installed private entry files and versions**
matched their reviewed vendor sources after clean installation.

Audit results are retained for:

1. All installed dependency scopes: **0**.
2. `--omit=dev` scope, matching the original 59-record scope: **0**.
3. Updated working checkout: **0**.
4. An independent alias-free probe using the **actual public names** glob,
   minimatch, query-string, image-size and uuid at the selected versions: **0**.
   This avoids relying only on how npm interprets local packages/aliases.

No audit threshold was lowered and no advisory was ignored. The registry cannot
evaluate the custom bridges/backport themselves; source review/tests, including
those of this known prototype-poisoning path, remain necessary.

Earlier experimental candidates are retained, not approved:

- A package-lock-only local-override experiment reported zero advisories but
  **failed clean installation**. It was rejected, not called a successful fix.
- File-link/lock/cache issues required a packed local-package policy and a fresh
  resolution. A prototype installed glob bridge was edited only for diagnosis;
  it is **not** release input. The accepted candidate was recreated from source
  and passed clean `npm ci` without those edits.
- A Windows path-separator regression was caught and corrected in the legacy
  glob bridge. Its version was incremented to **1.0.1** before final packaging.
- Updated timer declarations exposed one TypeScript union mismatch; the accepted
  candidate includes the narrow type-only correction, with full checks rerun.

Never edit a local package without updating its version and regenerating the
lock appropriately: npm can reuse a previous local package from its integrity
cache even when a directory's source has been edited. Always check installed
bytes against the reviewed source as well as running a clean install.

## Validation results

| Check | Result |
|---|---|
| Clean npm install / ci, candidate and working checkout | Passed |
| npm audit, all and production scopes | **0 advisories, exit 0** |
| Alias-free canonical upstream audit | **0 advisories, exit 0** |
| npm dependency tree | **No reported problems** |
| Full TypeScript, candidate and checkout | **Passed** |
| Frontend/security/compatibility regressions | **72 passed** in both trees |
| Selected backend regressions on frozen source | **275 passed, 1 skipped** |
| Existing four-worker HTTP captures through upgraded client helpers | **103 previews accepted, 12 endpoint checks** |
| SDK dependency check, online mode | **Dependencies up to date** |
| Staging-origin web export | **Passed** |
| Android and iOS JS/Hermes exports | **Passed** |
| Exact baseline+patch replay | **741/741 files** |

Native export artifacts are real Hermes bytecode:

- iOS: **8,942,544 bytes**, SHA-256
  `a1bccb0d7779eefdc29143d293d58e72eb8ea8e7155a885a07430f03a36c688c`.
- Android: **8,955,446 bytes**, SHA-256
  `cb05e545cc6500ae657cc5aa98227ec8ccee4cb2a43fef396727806d5e464f33`.

**These are not APK/IPA builds, installed-device tests, signing validation or
native ABI approval. No OTA/mobile release was performed.** The previous
four-worker backend capture was reused because backend bytes are unchanged;
it must not be relabeled as a new hosted four-worker/load test.

## Staging-only deployment

Deployed to the existing dedicated QA service/database after identity checks and
preserving a code/settings rollback capture:

- Deployment **`20731f2c-1ee6-487c-8059-91922c188e4e`**, status SUCCESS.
- Runtime verification: **181/181 matching files**, one actual Uvicorn process,
  Python 3.11.18, expected QA database and feature environment.
- Ordinary actual browser `/app` and `/locator?tab=mobility` pages loaded the
  new entry. The browser independently fetched/hashed it and matched the
  expected entry SHA-256 above. Google Maps JS loaded, application API requests
  stayed on staging, and no captured console errors occurred in either clean
  page. Locator also opened with a percent-encoded Greek query parameter.
- Existing QA trips remain canceled. This smoke checks routing/render bootstrap
  on the retained synthetic dataset, not new real-feed ingestion or active-fleet
  capacity. No additional application data was seeded for this update.
- Mobility background importers remain disabled, auto-activation remains false,
  paid Routes traffic remains disabled; settings were checked, not changed.

Production was not deployed or configured by this work. No Git commit/push was
made. Native JS export output is kept as validation evidence, not included in
the web runtime archive or published through an OTA channel.

## Maintenance and remaining production gates

The known npm advisory gate is addressed for this locked snapshot. Private
patches require continued review and an owner; prefer removing them when SDK
upstreams adopt fixed compatible packages. Automated registry audit alone is
not sufficient for future changes.

Previous public-path p95 failures, representative hosted capacity/multi-worker
validation, controlled real source ingestion/provenance/licensing, complete
production backup/restore and native binary/device/accessibility checks remain
separate gates. Faster internet was not treated as proof that previous latency
failures disappeared, and no higher-load test was run here. Production approval
remains separate. These exports have staging origins and must not be promoted
unchanged into production.

Exported evidence/manifests:
`backend/releases/dependency-security-20261103/`.
