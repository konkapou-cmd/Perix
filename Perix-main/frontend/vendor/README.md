# Security compatibility packages (Expo SDK 54)

These are private, source-controlled compatibility layers, not published
upstream packages and not audit exclusions. They exist because the SDK 54
dependency graph still uses older callable/CommonJS APIs while the fixed
upstream releases use different exports. Upstream implementation code is
loaded from the pinned npm aliases below; vulnerable old parsers/generators
must not be bundled alongside them.

| Local package | Actual implementation | Compatibility boundary |
|---|---|---|
| `query-string-compat` | `query-string@9.5.1` with fixed `decode-uri-component` | v7's seven named CJS/ESM namespace methods |
| `minimatch-compat` | `minimatch@11.0.4` | callable CJS plus modern named exports |
| `glob-compat` | `glob@14.0.3` | glob 7 sync/callback/event callers delegate walking too; no legacy RegExp-internal walker |
| `image-size-compat` | `image-size@2.0.4` | callable/named entry, bounded legacy sync path read, modern async file reader |
| `uuid-compat` | `uuid@11.1.1` | callable v4, named exports and legacy v1/v3/v4/v5 subpaths |
| `deepmerge-safe` | reviewed local backport from `deepmerge@4.3.1` | destination writes are own data properties, never inherited prototype setters |

The deepmerge fork retains its upstream MIT licence. Original compiled source:
`https://unpkg.com/deepmerge@4.3.1/dist/cjs.js`, SHA-256
`2e5160f84a1141bd927264afe4d15766f1e6cf07daef182b37ff53fea121de7d`.
The security difference addresses **GHSA-gcqx-w48m-w2h4**, including the initial
target-copy path and null-prototype inputs, not just ordinary source merging.
The merge policy, clone, array, customMerge, Date/RegExp and symbol behavior
are checked separately. Do not silently substitute an unpatched published
deepmerge release or present this fork as an upstream fix.

Maintenance obligations:

1. Keep exact versions and lockfile integrity, and use clean installs with the
   repository's `install-links` setting. Test `npm ci`, not only `npm install`.
2. Run query-string and dependency-security compatibility tests, full TypeScript,
   existing application tests and web/native JS exports after any update.
3. Test actual routing and asset generation. An audit count of zero does not
   establish API compatibility, and the registry cannot assess private code.
4. Revisit these layers when Expo/React Native upstreams adopt fixed versions.
   Prefer removing an adapter over expanding its scope indefinitely.
5. Native JS export is not an Android/iOS binary build or real-device test.
   No production, APK or OTA release follows automatically from these checks.

No advisory is ignored and no audit level is lowered to hide results. Root
dependency overrides and this directory must travel together in a release.
