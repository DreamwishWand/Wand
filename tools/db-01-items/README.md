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