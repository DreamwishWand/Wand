# DB-01 ↔ DB-03 Guide — original-Mission-SHA-backed private item references

This is a **production offline SQLite + TypeScript integration**. It is not a
second game parser, an alternative database, or a replacement for DB-03 Guide.

## Source evidence and boundaries

- DB-01: owner-private final SQLite v2, Steam 1.26.2, 33,627 definitions and
  1,030 native `Mission` definitions.
- DB-03: owner-private Steam 1.26.1 `manifest.json`,
  `database/item-objective-links.json`, `database/quest-item-flows.json`, and
  the original `ddv_Data/StreamingAssets/itemlist/Mission.json`.
- **Both versions' entire original Mission.json file SHA-256 is
  `f13958b52234f4cda92f0dd0bfff50be8a7f6625c8478785e2a077a5c7933d24`.**
  This permits cross-version reuse of only source-identical static Mission
  references. It does **not** establish equality for Conditions, other source
  files, player quest state, live events or rewards.
- The old SRC-01 partial item index was missing some referenced IDs; current
  DB-01 resolves those source identities but does not change their semantics.

## Real owner-private source cross-join (2026-11-21)

| Evidence type | Occurrences | Resolved Item IDs | Unresolved occurrences |
| --- | ---: | ---: | ---: |
| Explicit mission objective candidates | 4,897 | 4,897 | 0 |
| Static mission item-flow references | 1,517 | 1,517 | 0 |
| **Total** | **6,414** | **6,414** | **0** |

There are **3,287 distinct referenced Item IDs**, and the original DB-03
partial SRC-01 membership ledger has **509** previously out-of-index
occurrences now matched in the final DB-01 catalog. All reference `questId`
values also match the original 1,030 `Mission` definitions.

- Of 4,897 objective candidates, **4,641 are direct selectors and 256 are
  alternative candidates**. Alternatives must not be summed as simultaneous
  quest requirements.
- The 1,517 flow references include **824 cleanup references, 330
  nonguaranteed additional reward loot candidates, 293 substep handoff
  definitions, and 70 intro grant candidates**. Neither cleanup references
  nor loot candidates prove a currently awarded/needed item.
- Exact payload fields (selector role, original wire field, configured amount,
  source wire SHA and original quest step) are retained; availability,
  ownership, unlock state, quest progress, prerequisite state and publisher
  rights remain explicitly unverified/false.

## Offline production generation

The Python standard-library importer **requires four separately trusted source
SHA pins** for the DB-01 SQLite, DB-03 manifest, both exported DB-03 indexes;
it also compares the entire original Mission.json bytes to the independent
DB-03 manifest original source SHA and to DB-01's `Mission` source file SHA.
Recomputing a hash from potentially compromised input and using that as an
*external* trusted pin is not independent authentication.

```powershell
py -3 tools/db-01-items/corroborate_guide_references.py `
  --sqlite 'D:\WandData\DB-01\steam-1.26.2.sqlite' `
  --guide-manifest 'D:\WandData\DB-03\manifest.json' `
  --objective-index 'D:\WandData\DB-03\database\item-objective-links.json' `
  --flow-index 'D:\WandData\DB-03\database\quest-item-flows.json' `
  --mission-original 'D:\WandData\GameSources\Steam-v1.26.1\Mission.json' `
  --sqlite-sha '<trusted original DB-01 SQLite SHA256>' `
  --manifest-sha '<trusted DB-03 manifest SHA256>' `
  --objective-sha '<trusted DB-03 item-objective-links SHA256>' `
  --flow-sha '<trusted DB-03 quest-item-flows SHA256>' `
  --out 'D:\WandData\DB-01\steam-1.26.2-guide-links'
```

The output is an **owner-private** `manifest.json` and 256 `id/xx.json`
read-shards. The canonical SQLite and current 557 DB-01 shards are unchanged.
Any future Steam update can be processed through this same code only if both
sources are verified independently and the complete original Mission.json
SHA still matches. Otherwise the cross-version join **refuses**.

## Typed runtime API

```ts
import { openDb01QuestReferences } from '$lib/items/db03-evidence.ts';

const questRefs = await openDb01QuestReferences(
  privateDb01Client,
  trustedPrivateQuestManifestBytes,
  independentlyTrustedManifestSha256,
  async (relativePath) => privateByteProvider(relativePath)
);
const rows = await questRefs.getForItem(30000031);
// rows === null means the Item ID itself is missing from DB-01.
// rows === [] means DB-01 knows the item, but this partial Guide index has no link.
// A row represents a source-configured static candidate/reference, NOT a current
// quest requirement, an awarded item, a verified unlock, or a published record.
```

Each TypeScript read loads **one SHA-checked ID bucket**, checks item/category
identity against the existing DB-01 client, preserves `alternative` and
`not_guaranteed` roles, and never retrieves source game files or exports them.
Both the code and tests contain synthetic data only. The private 6,414-link
index and archived originals stay in the owner-only Drive folder; no Pages
assets or source records are committed to the public repository.

## CI

```bash
python -m unittest discover -s tools/db-01-items -p 'test_*.py' -v
node --experimental-strip-types --test src/lib/items/*.test.mjs
npm run check
```