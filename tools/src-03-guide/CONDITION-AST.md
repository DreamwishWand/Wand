# DB-03 — source-typed condition AST and Guide condition index

Source baseline: owner-held Steam v1.26.1 `Il2CppDump/dump.cs` and `ddv_Data/StreamingAssets/itemlist/Mission.json`, with stable native ID and SHA-256 provenance. No original game assets or derived licensed game strings are committed to GitHub.

## Contract

- `condition_schema.py` enumerates the **87** `Definitions.Conditions.ConditionOneOf` field tags and the source-named `IntOperator`, `MissionState`, `EventAvailability` and `VillageAreaType` enums. A recognized tag only identifies a static condition *kind*; it does not evaluate truth, define prerequisites or establish live event status.
- `mission_semantics.condition_tree` retains each AND/OR/NOT node including all nested `SubConditions`, its original wire SHA-256, and unrecognized oneof payload hashes. `ConditionOneOf.CommonConditions` refers to a *Condition* ID, **not** necessarily a completed quest.
- `condition_semantics.py` decodes only confirmed `Condition*` protobuf field numbers for `CharacterUnlocked`, `CharacterFriendship`, `CharacterLockedInVillage`, `CommonConditions`, `CurrentScene`, `CurrentVillage`, `BuildingUnlocked`, `ToolUnlocked`, `RealmUnlocked`, `FTUEEventCompleted`, `Inventory`, `HasEverOwned`, `PlayerLevel`, `MissionStatus`, `AreaUnlocked`, `Expansion`, `EventTime`, and `StoryCompleted`. Source `ConditionAreaUnlocked.VillageArea` is protobuf enum `0` (Beach) when omitted, and the projection explicitly flags this default. Comparisons use native `IntOperator` values. `ConditionEventTime.Status` represents an archived *requested* availability predicate, never actual server state.
- Source-typed edges go into `database/relations.json`: 579 CharacterUnlocked, 292 CharacterFriendship, 71 CommonConditions, 44 CurrentVillage and 15 CurrentScene relations **added** to the existing relation set. Other item/building/universe/FTUE IDs are retained as typed fields without guessing a target database family.
- `database/condition-ast.json` is a compact read-only index for `mission` records only, preserving both `availableConditions` and `unlockConditions` ASTs and per-mission/native-source SHA-256. Quest groups and unclassified records are excluded. It is **not** a simplified dependency DAG, a list of guaranteed prerequisites or a player progress evaluator.

## Verified baseline

Owner Steam v1.26.1 native source: 1,030 `Mission.json` definitions, including 733 missions, 289 quest groups and 8 unclassified. The AST contains **31 distinct source-observed condition kinds**, all named from the 87 source-defined oneof fields. Source-typed `database/relations.json` edges: **4,074**, **0 unresolved** in this baseline, of which 1,001 are newly decoded. Item candidate links remain **4,897**. Same raw v1.26.1 data versus previous extracted baseline: 12 comparable Guide families, 0 added/removed/changed; extractor changes are not game changes.

Validate with `python -m unittest discover -s tools/src-03-guide -p 'test_*.py' -q` (30 local standard-library tests). `status=PARTIAL`: current Star Path seasons, dynamic server event scheduling, actual player progress and independently verified Steam v1.26.2 source are outside this evidence. Never use missing v1.26.2 source to infer removals.
