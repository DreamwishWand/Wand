**8-locale Guide navigation/search:** [`QUEST-SEARCH.md`](QUEST-SEARCH.md) and `quest_search.py` derive owner-private `guide/quest-search.json` directly from the **same-version** compact quest catalogue and verified detail shard index. Steam v1.26.1 source gives 733 mission search rows (~772 KB), excludes 289 quest groups and 8 unclassified native records, preserves 26 unresolved names, supports Japanese Unicode NFKC/casefold and source-character/group/update/objective/scope filters, and provides per-quest shard file + full record SHA-256 for on-demand details. No player state or online availability inferred, and no licensed game text committed to public GitHub.

**On-demand quest details:** [`QUEST-DETAIL-SHARDS.md`](QUEST-DETAIL-SHARDS.md) and `quest_detail_shards.py` partition the **1,030 complete Steam v1.26.1 Mission records** into 32 verified, owner-private detail files (largest **4,964,703 bytes**) with a ~315KB `database/quest-detail-shard-index.json`. Every native record can be retrieved without loading ~98MB of JSON; the original `quests.json` is preserved. SHA-256 integrity, exact 1,030-record coverage and full original round-trip are checked. No source-derived content is committed publicly.

**Compact Guide quest list:** [`QUEST-CATALOGUE.md`](QUEST-CATALOGUE.md) and `quest_catalogue.py` derive private `guide/quest-catalogue.json` (Steam v1.26.1: **1,623,889 bytes** vs full `guide/quests.json` **97,990,330 bytes**, 98.34% fewer bytes). Lists **733** mission definitions, **289** groups, **8** ambiguous native definitions; exact 8-source-locale names, verified group membership and static reward/condition summary without inferring player progress. The original detailed quest export stays intact and owner-private.

**Static cross-service event references:** [`GUIDE-EVENT-LINKS.md`](GUIDE-EVENT-LINKS.md) and `guide_event_links.py` emit owner-private `database/guide-event-links.json` (381 source-typed Steam v1.26.1 quest/duty/world/item references). Every link retains ProtoDB field provenance and native source SHA-256; rewards remain *candidate* definitions, and the optional SRC-01 item index is explicitly partial. A missing ProtoDB never produces a false empty catalogue.

**Full Star Path source contract (not a season feed):** [`STAR-PATH-SNAPSHOT.md`](STAR-PATH-SNAPSHOT.md) identifies `GetBattlePasses.Types.Response.BattlePassesUpdated` and documents offline raw protobuf snapshot import (`starpath_seasons.py`), archived `protoDb.bin` source coverage auditing (`starpath_source_audit.py`), and the strict separation of configured rewards/dates from live availability and player state. Do not publish account/source snapshots or mistake partial updates for a complete season catalogue.

**Archived Guide events and expansions:** [`PROTO-DB-GUIDE-CATALOG.md`](PROTO-DB-GUIDE-CATALOG.md) adds static MiniEventData, FloatingFestivalData and ExpansionData catalogues, plus a safe 15-family version-diff contract. No event availability, reward grant or DLC entitlement is inferred.

**Static quest item flows:** [`QUEST-ITEM-FLOWS.md`](QUEST-ITEM-FLOWS.md) describes the source-typed intro item selectors, substep BringItem handoff settings, packed post-mission cleanup IDs, and weighted/conditional additional reward loot. `database/quest-item-flows.json` is a private read-only candidate/reference index, **not** verified inventory changes or guaranteed rewards.

**Quest activation policies:** [`QUEST-ACTIVATION.md`](QUEST-ACTIVATION.md) documents separate source-defined auto-accept choices, UI-unlock conditions and conditional owner overrides. The read-only private `database/quest-activation-policies.json` is not a prerequisite DAG, live progress state or entitlement check.

**Condition AST:** [`CONDITION-AST.md`](CONDITION-AST.md) documents 87 source-defined condition kinds, nested AND/OR/NOT semantics and typed character/scene/common-condition references. The private `database/condition-ast.json` index is static and read-only; it does not prove live availability, progress, or automatic prerequisites.

**Source-aware diffs:** [`VERSION-DIFF.md`](VERSION-DIFF.md) documents conservative `version_diff.py`: missing native source never means deleted game content; the comparison covers versioned quest/character/event families, default rewards, and static ProtoDB definitions, using native wire fingerprints and exact source localization. `diff.json` explicitly reports `comparedFamilies` and `uncomparedFamilies`.

**Mission item selectors:** [`MISSION-ITEM-TARGETS.md`](MISSION-ITEM-TARGETS.md) documents source-typed `mission_items.py` and `database/item-objective-links.json` (fixed items, alternatives, dynamic filters and source-configured amounts/ranges). A selector candidate is **not** a guarantee the item is required; SRC-01 ID membership is partial and not independently verified across game versions.

**Static DreamSnaps / Star Path introduction:** [`PROTO-DB-STATIC.md`](PROTO-DB-STATIC.md) describes source-backed `protoDb.bin` extraction through `protodb_static.py`. Archived event definitions and tutorial configuration do **not** establish current server-side event availability.

**Typed mission schema:** [`MISSION-SEMANTICS.md`](MISSION-SEMANTICS.md) documents the IL2CPP-verified quest/condition/objective mapping, mission-vs-group classification, source-backed reward ranges, and conservative reference edges. The source-backed `mission_schema.py` and `mission_semantics.py` are loaded by `native_guide.py` and require no external Python packages.

> **Steam native Guide sources (DB-03):** The real `ddv_Data/StreamingAssets/itemlist/*.json` files are binary framed protobuf-wire data, **not JSON documents**. For the source-backed extractor, use [`native_guide.py`](native_guide.py) and [`NATIVE-GUIDE.md`](NATIVE-GUIDE.md). The legacy `guide.py` and `rules.json` below apply only to separately exported, verified JSON schemas. The native Steam v1.26.1 snapshot remains **PARTIAL**; Star Path/reward semantics and live event availability are not inferred.

# SRC-03 Guide Data (offline Windows extractor)

Python 3.10+; standard library only. Reads files under a user-supplied game/export directory without writing to it. All generated files remain under the chosen output directory. Do not commit proprietary game files or generated source data.

## Start with format inspection

Run in PowerShell from the root of `DreamwishWand/Wand`:

```powershell
py -3 tools/src-03-guide/guide.py inspect --input "D:\DDV\export" --output "D:\WandData\src03-survey" --limit-files 40
```

Review `inspection.json`: extensions, Unity/IL2CPP file hints and actual JSON keys/array shapes. This tool does not decode native Unity `.assets`, AssetBundle, IL2CPP, or proprietary binary data; export such files to JSON/JSONL with an appropriate source-verified extractor first. For any source schema that differs, edit **only** a copy of `rules.json` and supply `--rules`. The supplied rules are tentative conventions, **not** a claim about DDV's actual native schema.

## Small-scale and full extraction

```powershell
py -3 tools/src-03-guide/guide.py extract --input "D:\DDV\export" --output "D:\WandData\src03\1.26.1\trial" --version 1.26.1 --platform Steam --small
py -3 tools/src-03-guide/guide.py extract --input "D:\DDV\export" --output "D:\WandData\src03\1.26.1\full" --version 1.26.1 --platform Steam --build-id YOUR_VERIFIED_BUILD_ID --resume
```

`--small` samples up to 10 matching files *per family*, at most 5 records per file. Inspect the trial records and reports before full execution. Use `--rules "D:\WandData\rules.json"` to provide actual source field paths, collection locations and file patterns after confirming the format. The default rules recognize common field names **only**. Quests, Star Paths and Events are not guaranteed to be encoded in matching JSON files.

Optional exact key-based localization files `en.json`, `fr.json`, `it.json`, `de.json`, `es-ES.json`, `ja.json`, `zh-CN.json`, `pt-BR.json` may be placed in a directory; each is a `{ "native.localization.key": "Localized name" }` object. Provide `--locales-dir "D:\DDV\locales-json"`. No approximate ID/name matching, machine translation or invented fallback is performed. If needed, validate a list of external item/reward IDs with `--reference-index "D:\WandData\native-reference-ids.json"`, JSON shape `{"items":[40,41],"rewards":[100,101]}`. Unknown external IDs are reported as `unchecked`, not presumed missing.

`--resume` reuses per-file atomic caches only where the input checksum, mapping, localization tables and record limit still match. A trial cache is *not* incorrectly reused for a full run. To compare two distinct output directories from different game versions, supply `--previous "D:\WandData\src03\1.26.0\full"` on the new full extraction; `diff.json` then compares normalized content independently of source paths and checksums.

Outputs:

- `guide/quests.json`, `guide/star-paths.json`, `guide/events.json`: version-bound, source-backed definitions with original selected nested field structures; never inferred play behavior or live event status.
- `database/relations.json`: native-ID references and whether each was resolved against imported definitions/optional external indexes.
- `manifest.json`, `report.json`, `unresolved.json`, `duplicates.json`, `missing-locales.json`, optional `diff.json`, `cache/files/*.json`.

`NEEDS_SOURCE_MAPPING` (exit code 2) means **no verified records were extracted**, not a successful empty catalog. `PARTIAL` means limited execution, mapping/read issues or conflicting IDs. `EXTRACTED_UNVERIFIED` means all matched JSON inputs were processed, **not** that runtime/gameplay semantics have been validated. The tool does not modify Guide UI or Community Help Center.

Test locally:

```powershell
py -3 -m unittest discover -s tools/src-03-guide -p "test_*.py" -v
```