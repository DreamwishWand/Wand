# DB-02 ACQUISITION — source-pinned extraction

SRC-02 uses the **existing** SRC-01 `steam1262.varint` and `steam1262.parse_category` decoders and the SRC-01 `itemId` records; it does not re-implement item definition parsing. Python 3.10+ standard library; Node 22+ for consumers. No writes to game files. Run from the Wand repository root:

```powershell
py -3 tools/src-02-acquisition/acquisition.py extract `
  --activity "C:\Program Files (x86)\Steam\steamapps\common\Disney Dreamlight Valley\ddv_Data\StreamingAssets\itemlist\ActivityData.json" `
  --activity-item "C:\Program Files (x86)\Steam\steamapps\common\Disney Dreamlight Valley\ddv_Data\StreamingAssets\itemlist\ActivityItem.json" `
  --loot "C:\Program Files (x86)\Steam\steamapps\common\Disney Dreamlight Valley\ddv_Data\StreamingAssets\itemlist\LootTable.json" `
  --building "C:\Program Files (x86)\Steam\steamapps\common\Disney Dreamlight Valley\ddv_Data\StreamingAssets\itemlist\Building.json" `
  --condition "C:\Program Files (x86)\Steam\steamapps\common\Disney Dreamlight Valley\ddv_Data\StreamingAssets\itemlist\Condition.json" `
  --items "D:\WandData\SRC-01\Steam-v1.26.2\items.jsonl" `
  --src01-manifest "D:\WandData\SRC-01\Steam-v1.26.2\manifest.json" `
  --out "D:\WandData\SRC-02\Steam-v1.26.2"
```

**Version contract:** Exactly Steam v1.26.2 and byte-for-byte verified `ActivityData.json`, `LootTable.json`, `ActivityItem.json`, `Building.json`, and `Condition.json` are supported in this revision. The earlier four source hashes match the Steam v1.26.2 SRC-01 probe. `Condition.json` is separately SHA-pinned against the Steam v1.26.2 source (`f9716fd7e80631213812ed2c93f802ee7ef73a0874214044d8e4304c555dc150`). No cross-version condition-byte equivalence is assumed. Extraction aborts before writing if the source hashes or SRC-01 manifest do not match. A later game version needs a new verified source profile and decoder compatibility review, not an unchecked version flag.

**Verified field mappings:** Steam IL2CPP `dump.cs` types `RecipeItemData`, `CraftingRecipeItemData`, `FishingDataItemData`, `MiningDataItemData`, `TimeBendingDataItemData`, `LootTableItemData`, `SubLootTable`, `ItemWithState`, `SeedItemData`, `StallBuildingItemData`, `UpgradeData`, `ItemAmount`, `ConditionItemData`, `ConditionsList`, `ConditionOneOf`, `ConditionCommon`, and `BoolOperator`. They provide numeric protobuf field contracts; source frames are identified by their `ID` field and the validated `2050000000 + key` / `2090000000 + key` / `20000000 + key` rules, and SRC-01 validates `30000000 + key` for seeds. `Formula.json` is an arithmetic formula database, not a cooking recipe file.

Outputs (private, upload to SRC-02 Drive):

- `recipes.jsonl`: cooking and crafting definitions, explicit ingredients or alternatives, exact Item IDs and known quantities, source definition IDs, condition digests, explicit appearance flags.
- `acquisitions.jsonl`: fishing/mining/timebending/growing result links and explicit loot-table candidate references. Loot candidates **do not prove** availability, probability or spawn context.
- `loot-tables.jsonl`: weighted subgroups and fixed candidate item IDs; dynamic filters remain unresolved.
- `stall-sources.jsonl`: verified `StallBuildingItemData` records linking stall Item IDs to ordered slot loot-table IDs and their static unlock / upgrade cost definitions. Native `ShopData` is a **string key**; its referenced shop configuration and current stock are not resolved. A cost with `amount: null` has no serialized amount and must **not** be displayed as a verified zero/free cost. `getPossibleStallsForItem` deduplicates stalls for display while `getPossibleStallSlotsForItem` preserves exact slot references. Both find only candidate sources through those linked loot tables; it does **not** prove the item is currently for sale.
- `shop-offers.jsonl`: currently empty **because authoritative shop offers are not verified**, not because no shop offers exist.
- `condition-gates.jsonl`: SHA-addressed `ConditionsList` trees actually referenced by the extracted cooking/crafting, fishing, timebending and loot definitions; preserves `and/or/not` operators, typed protobuf predicate tags, opaque leaf digests and exact source usage. No runtime evaluation or guessed availability.
- `condition-definitions.jsonl`: the subset of native `ConditionItemData` definitions reached from these gates through `ConditionCommon` references. Recursive resolution rejects missing or cyclic references. The 5,439-source-condition corpus is scanned for integrity but not copied here (DB-03 owns broader Guide condition data); 220 distinct source-relevant predicates and 13 linked definition rows were verified for Steam v1.26.2.
- `related-items.jsonl`: reverse lookup by stable SRC-01 Item ID; `inSrc01=false` means absent from the *partial* SRC-01 extraction, not absent from the game.
- `manifest.json`, `report.json`, `unresolved.json`, optional `version-diff.json`. The manifest carries a SHA-256 for each emitted dataset, including stall sources and condition indexes. Seed and stall source data are SHA-pinned, not guessed from filename patterns alone.

Use `createAcquisitionDatabase` from `src/lib/acquisition/index.mjs` with verified data loaded from a private DB-00 data provider. The consumer accepts normalized rows and supports item-to-recipe, item-to-source, seed-to-crop, ingredient-to-recipe, loot, stall source, possible stall candidate queries, and `getRecipeCondition` / `getAcquisitionCondition` / `getConditionGate` / `getConditionDefinition` / `getLootGroupCondition`. Pass `stallSources` as the parsed `stall-sources.jsonl` rows alongside `lootTables`; the query API rejects missing slot-table references. **No proprietary records should be committed to the public repository.** In particular, do not expose files from the private Drive through Pages until licensed/publishing review approves distribution.

Version diff:

```powershell
py -3 tools/src-02-acquisition/acquisition.py diff --old "D:\WandData\SRC-02\old" --new "D:\WandData\SRC-02\new" --out "D:\WandData\SRC-02\diff.json"
```

For recipes, static stall configuration, prices, stock limits or conditional offers, diffs compare exact *verified* source rows. They never infer currently live inventory, events or server-controlled availability. An old pre-stall or pre-condition snapshot without the newly supported files compares against empty historical families; new snapshots require each emitted file. A missing dataset of any other family is an error. Duplicated record keys are rejected. Unverified terms and fields stay null or in `unresolved.json` rather than being backfilled from websites.

Tests:

```powershell
py -3 -m unittest discover -s tools/src-02-acquisition -p "test_*.py" -v
node --test tests/acquisition*.test.mjs
```

## DB-00 private bundle verification and exact-origin join

Before using a SRC-02 snapshot with any Collection/Guide consumer, verify every
private output against the snapshot's SHA-256 file ledger and the original
SRC-01 manifest:

```sh
node tools/src-02-acquisition/verify_bundle.mjs verify \
  --dir /private/SRC-02/Steam-v1.26.2 \
  --src01-manifest /private/SRC-01/Steam-v1.26.2/manifest.json
```

The verifier is read-only and dependency-free. It rejects modified files,
symlinks, wrong versions, missing/extra manifest ledger entries, duplicated
record keys, broken recipe/stall/loot references, and inconsistent extraction
counts. A one-newline, zero-record `shop-offers.jsonl` is valid and **not** an
assertion of no offers. The optional SRC-01 manifest is independently byte-hashed
and checked against source Item ID count, target, and item data digest.

For a private Node runtime use `loadVerifiedAcquisitionBundle(directory,
{ src01ManifestPath })` from `verify_bundle.mjs`. It returns the parsed records
and marks the bundle `privateSource: true`. Do not import this Node-only file in
a browser route or copy the private JSONL into `static/` or Pages.

For cross-stream use the platform-independent `createAcquisitionCatalogJoin(db00Snapshot,
verifiedBundle)` in `src/lib/acquisition/db00-join.mjs`. This requires the
**same platform, gameVersion and SRC-01 manifest SHA-256** as the DB-00 snapshot's
target. It uses DB-00 `canonicalId` and `validateSnapshot`, retaining DB-00
partial coverage semantics. Its classification concerns catalog membership
**only**, not whether an item can currently be purchased or collected. All
returned join objects are marked `publishable: false`, with verified sale,
price, event eligibility, entitlement and ownership states set to false or
unknown. `getRecipe` and `getPossibleStallsForItem` are explicit
static-source links, not live retail offers.

Tests: `node --test tests/acquisition*.test.mjs`. Full private Steam v1.26.2
source bundle was independently verified without copying a single proprietary
row into the public repository.

## Native condition data is structural evidence, not a player-state evaluator

Steam v1.26.2 `Condition.json` has 5,439 records. Only the 13 `ConditionItemData` records reached through explicit `ConditionCommon` pointers from 220 content-addressed, acquisition-relevant `ConditionsList` payloads are materialized. These 220 gates occur at 404 concrete source positions, including recipes and loot subgroup restrictions. The boolean tree shape and oneof predicate type are **native evidence**; individual predicate parameters remain SHA-only unless a field mapping is verified. A gate's `availabilityEvaluated=false` is mandatory, and never means the gate is false. In particular, do not show locked/unlocked, scheduled sale, event reward or required DLC ownership without live state evidence.

The verified private bundle loader (`verify_bundle.mjs`) checks both condition indexes and all condition-digest references from recipes, fishing paths and loot groups. It fails closed for a missing `ConditionCommon` definition, cyclic references, malformed trees, mismatched counts, and unknown digests. The DB-00 join forwards those condition query APIs without converting them into entitlement or stock evidence. Check `manifest.json`'s `conditionSha256` and count ledger before consuming a new snapshot.