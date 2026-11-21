# DB-02 ACQUISITION — source-pinned extraction

SRC-02 uses the **existing** SRC-01 `steam1262.varint` and `steam1262.parse_category` decoders and the SRC-01 `itemId` records; it does not re-implement item definition parsing. Python 3.10+ standard library; Node 22+ for consumers. No writes to game files. Run from the Wand repository root:

```powershell
py -3 tools/src-02-acquisition/acquisition.py extract `
  --activity "C:\Program Files (x86)\Steam\steamapps\common\Disney Dreamlight Valley\ddv_Data\StreamingAssets\itemlist\ActivityData.json" `
  --activity-item "C:\Program Files (x86)\Steam\steamapps\common\Disney Dreamlight Valley\ddv_Data\StreamingAssets\itemlist\ActivityItem.json" `
  --loot "C:\Program Files (x86)\Steam\steamapps\common\Disney Dreamlight Valley\ddv_Data\StreamingAssets\itemlist\LootTable.json" `
  --items "D:\WandData\SRC-01\Steam-v1.26.2\items.jsonl" `
  --src01-manifest "D:\WandData\SRC-01\Steam-v1.26.2\manifest.json" `
  --out "D:\WandData\SRC-02\Steam-v1.26.2"
```

**Version contract:** Exactly Steam v1.26.2 and byte-for-byte verified `ActivityData.json`, `LootTable.json` and `ActivityItem.json` are supported in this revision. All three SHA-256 values match the Steam v1.26.2 SRC-01 format probe and the archived Steam v1.26.1 bytes, which were identical. Extraction aborts before writing if the source hashes or SRC-01 manifest do not match. A later game version needs a new verified source profile and decoder compatibility review, not an unchecked version flag.

**Verified field mappings:** Steam IL2CPP `dump.cs` types `RecipeItemData`, `CraftingRecipeItemData`, `FishingDataItemData`, `MiningDataItemData`, `TimeBendingDataItemData`, `LootTableItemData`, `SubLootTable`, `ItemWithState`, `SeedItemData`. They provide numeric protobuf field contracts; source frames are identified by their `ID` field and the validated `2050000000 + key` / `2090000000 + key` rule, and SRC-01 validates `30000000 + key` for seeds. `Formula.json` is an arithmetic formula database, not a cooking recipe file.

Outputs (private, upload to SRC-02 Drive):

- `recipes.jsonl`: cooking and crafting definitions, explicit ingredients or alternatives, exact Item IDs and known quantities, source definition IDs, condition digests, explicit appearance flags.
- `acquisitions.jsonl`: fishing/mining/timebending/growing result links and explicit loot-table candidate references. Loot candidates **do not prove** availability, probability or spawn context.
- `loot-tables.jsonl`: weighted subgroups and fixed candidate item IDs; dynamic filters remain unresolved.
- `shop-offers.jsonl`: currently empty **because authoritative shop offers are not verified**, not because no shop offers exist.
- `related-items.jsonl`: reverse lookup by stable SRC-01 Item ID; `inSrc01=false` means absent from the *partial* SRC-01 extraction, not absent from the game.
- `manifest.json`, `report.json`, `unresolved.json`, optional `version-diff.json`.

Use `createAcquisitionDatabase` from `src/lib/acquisition/index.mjs` with verified data loaded from a private DB-00 data provider. The consumer accepts normalized rows and supports item-to-recipe, item-to-source, seed-to-crop, ingredient-to-recipe and loot queries. **No proprietary records should be committed to the public repository.** In particular, do not expose files from the private Drive through Pages until licensed/publishing review approves distribution.

Version diff:

```powershell
py -3 tools/src-02-acquisition/acquisition.py diff --old "D:\WandData\SRC-02\old" --new "D:\WandData\SRC-02\new" --out "D:\WandData\SRC-02\diff.json"
```

For recipes, prices, stock limits or conditional offers, diffs compare exact *verified* source rows. They never infer currently live inventory, events or server-controlled availability. Unverified terms and fields stay null or in `unresolved.json` rather than being backfilled from websites.

Tests:

```powershell
py -3 -m unittest discover -s tools/src-02-acquisition -p "test_*.py" -v
npm test
```