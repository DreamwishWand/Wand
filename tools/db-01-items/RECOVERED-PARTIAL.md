# DB-01: private 33,627-definition source-recovered catalog

This release-specific, nonpublic DB-01 baseline reuses **only** original Steam
1.26.1 itemlist bytes independently proved identical to the corresponding
Steam **1.26.2** SHA-256 source entries. See
[`tools/src-01-items/RECOVER-UNCHANGED-1262.md`](../src-01-items/RECOVER-UNCHANGED-1262.md)
and the resulting owner-private SRC-01 manifest for source identities.

## Exact evidence boundary

- **38/39 original itemlist files** are byte-for-byte SHA-256 matches between
  the installed v1.26.1 archival baseline and the independent current v1.26.2
  source hash ledger. The changed `Condition.json` cannot be reused.
- Four native itemlist types: **13,202** source-backed Item IDs with icon GUIDs.
  These IDs are **not** proof of player ownership, collectibility, unlock status,
  world membership, DLC rights, or shop availability.
- 33 additional *nonempty* native definition types: **20,425** records, with
  source-verifiable Item IDs but **unclassified semantics**. `ItemCondition.json`
  is a verified-empty 34th extended file.
- **33,627** distinct current-version source-defined IDs across 37 nonempty
  classes. The 132 recovered small-category records already belong to those
  20,425; **do not append** the earlier partial 132-row extension again.
- **53 fully captured current v1.26.2 LocDB members** with member CRC checks
  provide **241** definitions with all eight exact official names and **506**
  with at least one. German has 380 matched; Japanese has 241; the remaining
  six locales have 506. All eight older *whole* ZIPs differ from the target
  and **must not be reused**. Unknown target names stay `null`.
- Old Switch 1.25.0 Collection records are intentionally not joined. Their
  taxonomy, worlds, DLC and translated labels remain historical only.

## Build owner-private normalized snapshot

Python 3.10+ standard library, from repository root:

```powershell
py -3 tools/db-01-items/build_recovered_partial.py `
  --native 'D:\WandData\SRC-01\Steam-v1.26.2' `
  --extended 'D:\WandData\SRC-01\Steam-v1.26.2-sha-reused-extended' `
  --out 'D:\WandData\DB-01\Steam-v1.26.2-recovered-33627'
```

`--native` refers to the existing 13,202-row SRC-01 Steam v1.26.2 native
extraction (must include its `manifest.json`). `--extended` refers **only** to
full SHA-verified output from `recover_unchanged1262.py` (20,425 rows). The
compiler verifies the source and extension hashes and per-record fields
through the existing `build.py` loader. It checks the 38/39 provenance,
source categories, localization counts and Item ID uniqueness, then emits:

- `items.jsonl`: 33,627 normalized source-defined records; source version,
  individual file SHA-256, per-name verification, fields explicitly unresolved.
- `manifest.json`: `wand.db01.partial-manifest@3` with source manifest digests,
  full-file reuse evidence, exact locale evidence, output SHA-256 and
  `PRIVATE_ONLY_NO_PUBLIC_ITEMS` publication state.
- `unresolved.json`: explicit category/name coverage and nonclaims.

The build reuses a matching private manifest/output fingerprint when unchanged,
recomputes on input changes, and fails if input/output directories overlap.
**No file is emitted into a public repository or uploaded automatically.**
The generated output must remain private to the owner.

## Load and query without publishing

`src/lib/items/catalog.mjs` accepts this **exact private source contract**:

```js
import { openPrivateItemCatalog } from './src/lib/items/catalog.mjs';
const catalog = await openPrivateItemCatalog(manifest, jsonlBytes);
const item = catalog.getDisplayItem(30000031, 'ja');
```

`openPrivateItemCatalog` hashes the raw JSONL, verifies the private manifest,
checks all source and locale claims, and keeps the returned records immutable.
The DB-00 adapter `createDb01Db00Patch` offers only the four source-verified
native types as **private candidate references**; it excludes the unclassified
20,425 definitions. A Save Editor, Collection, Decorate or Guide consumer must
not infer permissions or current taxonomy from this index.

## Compare with the preceding partial 13,334-record baseline

```powershell
py -3 tools/db-01-items/compare_versions.py `
  --old 'D:\WandData\DB-01\Steam-v1.26.2-partial-13334' `
  --new 'D:\WandData\DB-01\Steam-v1.26.2-recovered-33627' `
  --out 'D:\WandData\DB-01\coverage-diff'
```

These are **the same game version** but have different verified source coverage.
The result contains 13,334 shared IDs and 20,293 newly covered IDs. This
is not evidence that 20,293 new game entities were added in an update.
The diff leaves game-wide added/removed IDs and semantic changes `null`.

## Acceptance tests

```powershell
py -3 -m unittest discover -s tools/db-01-items -p 'test_*.py' -v
node --test src/lib/items/*.test.mjs
```

The recovered script and synthetic tests are safe to publish; original raw
itemlist files, LocDB member bytes, 33,627 generated records, full matching
manifests and version diff reports must remain owner-private. A complete
v1.26.2 itemlist snapshot still requires the **changed target `Condition.json`**.
Complete localization requires the eight **target** localization ZIPs.
