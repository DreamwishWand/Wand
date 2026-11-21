# DB-03 — archived ProtoDB Guide catalogue

**Baseline:** owner-held Steam **v1.26.1** `ddv_Data/StreamingAssets/protoDb.bin` and exact eight `LocDB_*.zip` locale archives. Static native schema is verified against this build's IL2CPP `dump.cs`. This is an **offline historical/source configuration catalogue** — **not** current liveops availability, a schedule feed, player entitlements, an ownership checker, or a promise of rewards.

## New static families

- `guide/mini-events.json`: `Definitions.MiniEventData` (19 records). Keeps exact title/description localization keys and available texts, archived `ConditionDate` teasing/start/end predicates (including operator, timestamp, optional local-time flag), six archived event segments, repeated source IDs for quest/duty references and their *native index membership*, and `MiniEventReward` item IDs with configured amounts/priority. Names such as 2026 event keys in this original game archive do not establish that the event is currently running. Static reward entries are **candidate definitions**, not evidence of actual distribution.
- `guide/floating-festivals.json`: `Definitions.FloatingFestivalData` (5 records). Keeps archived protobuf timestamps, typed target scene and sub-scene references, puzzle definitions (31) with time and completion-condition SHA fingerprints, resource identifiers, and reward definitions (31) with item IDs and static configured amounts. No puzzle is marked currently open or completed.
- `guide/expansions.json`: `Definitions.ExpansionData` (6 records, including a base-game definition). Keeps static item-tag ID, linked village scene, internal commerce/IAP reference string, IAP-pack definition SHA fingerprints, visited-condition SHA, menu visibility and priority. `entitlement=not_evaluated` explicitly prevents treating these as DLC purchases, ownership or access.

The existing `design-challenges.json` (183 records, including 182 DreamSnaps) and `starpath-ftue.json` (1 *introduction-only* definition) are unchanged. The full active Star Path **season catalogue is still not present** in the examined static ProtoDB; its absence is not evidence that a season is unavailable in-game.

## Schema and validation

`protodb_guide_catalog.py` implements the verified protobuf field contracts for `MiniEventData`, `MiniEventReward`, `EventSegment`, `ConditionDate`, `Timestamp`, `FloatingFestivalData`, `FloatingFestivalPuzzleData`, `FloatingFestivalReward`, and `ExpansionData`. All records retain the original `nativeWireSha256`, archive source SHA-256, envelope metadata and exact eight-locale strings (when available). Repeated duty/quest/subscene int32 references support both packed and unpacked protobuf representations with strict canonical varint checking. Unknown conditions and embedded IAP packs remain fingerprinted, not evaluated.

**Source audit:** 2,246 ProtoDB entries; 19 mini events; 84 duty references (**84 present** in native DutyAch index); 66 quest references (**66 present** in native Mission index); 171 mini-event item reward definitions; 5 floating festivals; 31 puzzles, 31 festival reward definitions; 5/5 festival target scenes and 6/6 expansion village scenes present in the native scene index; 6 expansions. Exact native membership is **not** event state or entitlement. The `protoDbStatic.issues` count remains 0.

`version_diff.py` now supports 15 source-backed Guide families, including the new three ProtoDB catalogues. A genuinely missing older *extractor projection* is marked `static_projection_unavailable_in_previous_snapshot`, not mistaken for a game source deletion. A fresh v1.26.1 output compared to another independently re-extracted v1.26.1 output returns `COMPARED`: **15 families; 0 added, 0 removed, 0 changed**. Comparing to the old 12-family output appropriately skips the three new families as extractor-only expansion.

**52** Python standard-library synthetic source-contract tests protect the schema, bad protobuf values, localizations and source-aware diffs. Run `python -m unittest discover -s tools/src-03-guide -p 'test_*.py' -q`. No raw game data, player saves or generated licensed text is committed to public GitHub; derived catalogues stay in private SRC-03 Drive.

**Remaining:** Steam **v1.26.2** Guide original archive folder is empty in owner Drive at this point; no independent v1.26.2 comparison is claimed. Current seasonal Star Path, dynamic online events and account-dependent expansion entitlement require separately verified evidence. Overall `status=PARTIAL`.
