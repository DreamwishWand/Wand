# DB-01 historical locale correlations — private evidence tier

This utility does **not** fill the 1.26.2 official/current `names` field. It produces a separate, owner-private opt-in historical candidate lookup from *Steam v1.26.1 original LocDB ZIP files*.

## What is known

- DB-01 has 33,627 SHA-verified source definitions for Steam 1.26.2 from 38/39 itemlist files. `Condition.json` is still unverified for 1.26.2.
- The Steam 1.26.1 baseline has all eight complete original `LocDB_{locale}.zip` files.
- The independent Steam 1.26.2 `format-probe.json` stores ZIP archive SHA-256 claims plus each inspected member's **size, CRC32 and first 8,192 bytes**, *not the full bytes of all members*.
- For exactly 15 itemlist categories across each of eight locales (**120 category-member pairs**), the full old ZIP member matches the recorded current-version member **size + CRC32 + prefix**. **This is not cryptographic proof that each entire current ZIP member is unchanged**: CRC32 is not SHA-256 and the target ZIP archives differ in full.
- A strict Item ID + exact per-category key join yields **12,883 definitions with all eight historical name candidates**. **3,657** pairs (current officially verified values) were compared and matched exactly; **zero** conflict. Other names are *candidates from the old source version*, not verified 1.26.2 official labels.

## Build using owner-private raw sources

```powershell
py -3 tools/db-01-items/build_correlated_names.py `
  --catalog "D:\WandData\DB-01\Steam-v1.26.2-33627" `
  --historical-game "D:\WandData\GameArchive\Steam-v1.26.1" `
  --target-probe "D:\WandData\SRC-01\Steam-v1.26.2\format-probe.json" `
  --out "D:\WandData\DB-01\Steam-v1.26.2-historical-locale-candidates"
```

The script checks pinned SHA-256 for both version evidence files, all eight archived ZIP originals, and SHA-256 of the current DB-01 catalog. It verifies each of the 120 member comparisons and rejects any disagreement with previously officially verified current labels. Output directories must not overlap input directories. ZIPs are read, never modified.

Generated owner-private outputs:

- `historical-locale-candidates.jsonl` — only candidate records, each with `baselineGameVersion: "1.26.1"`, `targetGameVersion: "1.26.2"`, eight historical names, exact native keys, `currentExactSourceVerifiedLocales` and `mergeIntoCanonicalPermitted:false`.
- `manifest.json` — `wand.db01.historical-locale-correlations@1`, hashes, 120 size/CRC/prefix proof entries, `PRIVATE_ONLY`, and current catalog SHA pin.
- `report.json` — category and locale coverage, number of current values compared, limitation statements.

No historic name ever overwrites a verified current name. No public GitHub/Pages dataset is generated.

## Final TypeScript consumer API

The owner-private historical JSONL is imported into the separate
`historical_name_candidate` table by `sqlite_store.py --history`; its source
version and SHA-256 remain recorded. `export_shards.py --include-historical`
creates **separate** SHA-checked historical ID buckets, never official locale
indexes. `src/lib/items/index.ts` returns only current exact verified names by
default. **`getName(itemId, locale, {allowHistorical:true})`** is required to
view a candidate, whose response evidence is explicitly
`historical_prefix_crc_correlated_unverified_current`. No game rights,
classification, ownership or current translation is inferred. No public
Collection runtime is activated.

Current game full eight-locale ZIP originals must be obtained and verified separately before historical candidates can be promoted to actual 1.26.2 names. Do not use this overlay to mark current names verified or to publish localized assets.