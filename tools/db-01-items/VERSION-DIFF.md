# DB-01 ITEMS — source-safe version comparison

`compare_versions.py` compares two **private, completed extraction snapshots**.
It is deliberately not a substitute for running extraction on the target game's original files. It does not download assets, run game code, check save ownership, publish licensed game-derived content, or invent missing metadata.

## Usage

```powershell
py -3 tools/db-01-items/compare_versions.py `
  --old "D:\WandData\DB-01\steam-1.26.2\catalog" `
  --new "D:\WandData\DB-01\steam-1.26.3\catalog" `
  --out "D:\WandData\DB-01\diff-1262-to-1263"
```

Replace the second path with a directory generated **after** the next version's extractor is ported, pinned to that version's complete source files and tested. The current `run-all.ps1`, `steam1262.py`, `localize1262.py`, and `extend1262.py` are deliberately pinned to Steam **1.26.2** and will refuse a different source version. Do not bypass those source checks to manufacture a comparison.

The tool supports the canonical private `wand.db01.items@1` compiler output and the separately marked November 2026 `wand.db01.partial-manifest@2` private dataset. Inputs must have `manifest.json` and `items.jsonl`. The SHA-256 recorded for the JSONL must match its actual bytes. The comparison verifies row counts, source category, source path, source version, row provenance, all eight name verification states, four-class native icon GUIDs, and refuses unverified current taxonomy / world / attribute values.

## Output contract

- `version-diff.json`: `wand.db01.version-diff@1`, versioned source fingerprints and classification of observed differences.
- `manifest.json`: `wand.db01.version-diff-manifest@1`, input SHA-256 fingerprints and output SHA-256. Publication status is **private/not approved**.

A native category is *comparable* only when both snapshots have a full-file-evidenced extraction for that category. The tool uses five distinct notions:

1. `observedNewInComparableCategories`: new Item IDs **observed inside a category present in both versions**. Not proven newly added to the entire game.
2. `absentInCurrentComparableCategory`: formerly observed IDs now absent in a category whose full source file was compared. **Not proven deleted from the game**; it may have moved to a different, unextracted source.
3. `newlyCoveredCategoryIds`: IDs newly visible because the newer dataset contains a category absent from the older dataset.
4. `lostCategoryCoverageIds`: IDs missing only because the newer dataset no longer includes a previously available source category.
5. `categoryMoves`: the same ID appears in both datasets with different native source categories. This is not a game entitlement/ownership or item semantic change.

`verifiedNameChanges` requires verified, non-placeholder values **in both** snapshots for the same locale and Item ID. Merely gaining or losing verified language coverage is counted separately. `verifiedIconGuidChanges` requires verified native icon GUIDs on both sides. `sourceChangedCategories` reports differences of full source-file SHA-256 for categories where both actual source fingerprints are present.

`gameWideRemovedIds`, `gameWideAddedIds`, `itemSemanticChanges` and `dlcMembershipChanges` remain **null**, by design. Even a full itemlist file only proves the scope of that source, not global removal, ownership, DLC eligibility, or semantic identity.

## Private source evidence and future releases

`format-probe.json` contains incomplete prefixes for 28 large native categories. Their 1,482 diagnostic rows (`wand.src01.prefix-evidence@1`) and the 429 main-class locale-prefix observations (`wand.src01.locale-prefix-evidence@1`) **are rejected as comparison snapshots**. A future game update or expansion requires a new source-backed extraction with full file SHA-256, complete locale ZIP/member provenance, and a version-specific manifest; only then compare old/new snapshots.

The 2026-11-21 private Steam 1.26.2 partial snapshot contains 13,334 definitions across ten fully recovered categories and only 66 verified eight-language names. Self-comparison checks of this actual private bundle find 13,334 shared IDs, no spurious differences, and all ten categories classified as category-comparable. That test does **not** prove all game categories were extracted.

No private output is committed to the public `DreamwishWand/Wand` repository or auto-deployed to GitHub Pages.