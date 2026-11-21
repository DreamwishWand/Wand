# DB-01 ITEMS — final implementation contract

**Status:** production-architecture code; source datasets remain owner-private. No
unverified labels, inferred rights, shop/availability claims or writer permissions.

- **Extraction/evidence:** Python (offline, on verified Steam originals), no rewrite planned.
- **Operational catalog:** versioned, normalized, read-only SQLite; source SHA-256 and
  original-version provenance are retained, and historic names cannot enter exact names.
- **Runtime API:** **TypeScript**, `src/lib/items/index.ts` and `db00-join.ts`.
  It fetches only an ID bucket, category or locale index from a private asset source,
  SHA-256-verifies every requested file, and never loads the entire 38.7MB JSONL.
- **UI:** Svelte 5 + TypeScript (already chosen in the application).
- **Save binary processing:** Rust/WASM (separate Save Editor ownership).
- No JavaScript DB-01 runtime to port later; all active DB-01 consumer code is TS.

## Owner-private build, from repository root

First generate the verified private source JSONL using the source/version-specific
SRC-01 readers (`steam1262.py`, `localize1262.py`, `recover_unchanged1262.py`
when source-hash matches) and `build_recovered_partial.py` or the more general
`build.py`. For v1.26.2 there are **33,627** distinct definitions, but 38/39
files are SHA-verified, **not** a complete game corpus.

From its private output:

```powershell
py -3 tools/db-01-items/sqlite_store.py `
  --catalog 'D:\WandData\DB-01\Steam-v1.26.2-recovered-33627' `
  --history 'D:\WandData\DB-01\Steam-v1.26.2-historical-locale-candidates' `
  --out 'D:\WandData\DB-01\steam-1.26.2.sqlite'

py -3 tools/db-01-items/export_shards.py `
  --sqlite 'D:\WandData\DB-01\steam-1.26.2.sqlite' `
  --out 'D:\WandData\DB-01\steam-1.26.2-shards' `
  --include-historical
```

`--history` and `--include-historical` are optional. Historical candidates remain
explicit and are never returned unless a caller sets `allowHistorical:true`.
The one-shot `tools/db-01-items/run-all.ps1` also creates private SQLite and
non-historical read-shards after the complete source extraction passes all gates.
On later versions, the same SQLite+TypeScript layer consumes independently
verified **`wand.db01.items@1`** output without hardcoded 1.26.2 checks.

```ts
import { createDb01CatalogClient } from '$lib/items/index.ts';
import { createDb01Db00Patch } from '$lib/items/db00-join.ts';

// Private-origin/local File loader; caller is responsible for access controls.
const client = createDb01CatalogClient(privateManifest, async (relativePath) =>
  new Uint8Array(await privateFileProvider(relativePath)));
const item = await client.getItem(30000031);   // one SHA-checked ID bucket
const matches = await client.getItems([30000031, 30000032, 30000031]);
// Bounded 4096-ID request, up to eight concurrent unique ID buckets;
// returns ordered (Db01Item | null)[] for Save, Guide and Collection joins.
const items = await client.getCategory('Furniture'); // one category shard
const labels = await client.searchExactNames('Belle', 'en'); // one locale index
const official = await client.getName(10000001, 'ja'); // null if unverified
const maybeOld = await client.getName(10000001, 'ja', {allowHistorical:true});
```

Never place generated `*.sqlite`, shard folders, source JSONL, localization ZIPs
or game-derived indexes in GitHub or `static/` without explicit rights approval.
The files are local/private by default; neither the CLI nor the TS API publishes.

## Verification and legacy evidence

```bash
python -m unittest discover -s tools/db-01-items -p 'test_*.py' -v
node --experimental-strip-types --test src/lib/items/*.test.mjs
npm run check
```

Older `.mjs` DB-01 runtime modules were removed in the TS cutover. Their source
is preserved in Git history, **not** maintained as a parallel implementation.
Original-source instructions and evidence limits remain documented in:

- [`RECOVERED-PARTIAL.md`](RECOVERED-PARTIAL.md) — 33,627 source-verified IDs,
  13,202 four-category items and 20,425 unclassified definitions.
- [`HISTORICAL-LOCALE-CORRELATIONS.md`](HISTORICAL-LOCALE-CORRELATIONS.md) —
  12,883 eight-language historical candidates; 120 CRC/prefix matches do not
  establish current-version whole-member SHA equality.
- [`VERSION-DIFF.md`](VERSION-DIFF.md) — honest coverage-aware source version
  comparison, including no invented game removals.
- [`../src-01-items/RECOVER-UNCHANGED-1262.md`](../src-01-items/RECOVER-UNCHANGED-1262.md)
  — exact 38/39 SHA-identical originals from the prior Steam archive.

**Remaining original-data gaps:** changed v1.26.2 `Condition.json` and eight
complete current LocDB ZIPs. DLC, ownership, collectibility, world relationships
and current classification are unresolved until evidence is acquired.

## Runtime manifest ledger integrity (without original-game upload dependency)

The TypeScript client validates the SHA-256/size/count ledger before any private
asset is fetched. In particular, the sum of all 256 ID bucket counts and the
sum of native-category counts must both equal `definitions`; the four verified
item-native categories must equal `currentNativeItemDefinitions`. Per-locale
entry counts cannot exceed definitions; optional historical entry counts
cannot exceed eight candidates per definition. A fully parsed corpus cannot
declare missing verified sources. These are **metadata consistency checks**,
not evidence of complete v1.26.2 original-game upload.

After validation, the client freezes an independent in-memory copy of its
manifest and all file SHA/size/count entries. A caller mutating its original
manifest during later asynchronous reads cannot retarget hash verification.
A separately trusted manifest provenance/SHA and the complete independent
`audit_shards.py` release audit are still required: consistent but forged
source metadata cannot be authenticated by runtime self-consistency alone.

## Production release-integrity gate

`tools/db-01-items/audit_shards.py` is the independent **private pre-release
verification gate** for the final SQLite + TypeScript implementation. It
reconstructs every ID, category, locale and optional historical shard from
SQLite and checks byte-for-byte content, separate file SHA-256, counts,
source-version and original JSONL provenance. It rejects stale, missing,
extra, or conflicting assets, reports SHA-bound PASS evidence in a local
private file, and never publishes game-derived assets.

`run-all.ps1` now invokes this gate automatically after SQLite/shard creation
and fails the one-shot pipeline if a previous report is stale. The auditor
also supports a separately trusted SQLite SHA-256 pin. See
[`AUDIT-RELEASE.md`](AUDIT-RELEASE.md) for CLI, requirements and boundaries.


## Source-native identity for cross-service joins (SQLite/TypeScript v2)

Every original source definition has a verified `nativeNameField` (wire field 2).
The SQLite store records it as a unique composite identity
`(native_category, native_key)`; the same TypeScript client exposes
`getByNativeKey(category, nativeKey)`. This exact source identity is useful for
DB-02 Acquisition, DB-03 Guide, DB-04 World and DB-05 Save, but is **not**
evidence of a relationship, collectibility, ownership, DLC entitlement, or a
current localized name.

The final SQLite and private read-shards schemas are now
`wand.db01.sqlite@2` and `wand.db01.private-shards@2`. Rebuild older v1
private assets from the trusted source catalog before use; v1 assets are not
silently accepted as v2 and no parallel runtime API is maintained. The
release audit enforces source-record identity, original category, and
unique native key across the entire version.

## P0 DB-02 cross-version Condition source gate (2026-11-21)

The independent Steam v1.26.2 SRC-01 format probe (SHA-256
`07fd8ebb1c528f852a0e00ce54cf4964f93931b9155bc9e2aab1bd857986d00a`)
records `Condition.json` SHA-256 `9eb5e7800a2485b1dfb3e148a7bcff5d6c6b6ed72797ed2331a902ab44188f4c`. Earlier SRC-02 code
mistakenly pinned the archived Steam v1.26.1 SHA-256 `f9716fd7e80631213812ed2c93f802ee7ef73a0874214044d8e4304c555dc150` as
current. The SRC-02 extractor now rejects that old source. Any previously
published/privately exported acquisition-condition references based on the
older source must be treated as **not verified for v1.26.2** and cannot be
joined to DB-01's current catalog. Current `Condition.json` remains missing;
this change is a source-integrity repair, not condition data completion.


## DB-01 → DB-02 private static source join

The final TypeScript runtime now provides `src/lib/items/db02-join.ts`.
It accepts only the existing DB-01 v2 private catalog plus an independently
trusted, byte-SHA-checked DB-02 manifest and a separately verified same-version
`Condition.json` source SHA. The required Steam 1.26.2 Condition SHA from
`format-probe.json` is
`9eb5e7800a2485b1dfb3e148a7bcff5d6c6b6ed72797ed2331a902ab44188f4c`;
the older 1.26.1 source SHA is forbidden. The join leaves availability,
ownership, DLC entitlement, save writing and publication all **false**.

Until genuine current Steam 1.26.2 Condition bytes are obtained, DB-02 cannot
be fully re-extracted and this bridge must not be activated against previously
mislabeled condition outputs. See [`DB02-JOIN.md`](DB02-JOIN.md).


## Source-exact DB-04 Furniture / Building overlay (private)

[DB04-NATIVE-EVIDENCE.md](DB04-NATIVE-EVIDENCE.md) describes the permanent
Python offline corroborator and typed TypeScript runtime bridge. Two complete
original itemlist files, Furniture.json and Building.json, are byte-identical
between the independently checked Steam v1.26.1 world snapshot and the Steam
v1.26.2 SQLite source. Only those two definition families are eligible:
7,224 exact ID/native-name joins, 6,746 restored Furniture localization
**keys** (not translated names), 7,140 original-footprint dimensions, 84
Building footprints absent. The owner-private overlay has 256 SHA-verified
on-demand files and is separate from the canonical SQLite and 557 item shards;
no source recompilation, competing runtime, world-coordinate inference,
placement permission, ownership, or public publishing is authorized.


## DB-01 ↔ DB-03 original-Mission-source static item references

[`DB03-QUEST-ITEM-REFERENCES.md`](DB03-QUEST-ITEM-REFERENCES.md) documents
the offline, source-SHA-verified private join to DB-03 Guide. The same original
`Mission.json` bytes are SHA-256-identical for source Steam v1.26.1 and
DB-01 target Steam v1.26.2. A permanent Python verifier checks all the
source pins, all **6,414** source-configured quest item references and **3,287**
distinct referenced Item IDs, including **509** occurrences absent from DB-03's
older partial SRC-01 item index. The output is a separate, owner-private
256-bucket lookup. The typed `src/lib/items/db03-evidence.ts` reads one
source-pinned bucket per Item ID and never promotes alternatives, additional
loot, static handoffs or cleanup references to guaranteed rewards/requirements.
No SQLite migration, second runtime, licensed text publication, inferred
player state, or placement/save permissions.
