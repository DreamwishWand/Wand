# DB-03: native DDV Guide extraction

`native_guide.py` is a **separate, source-validated binary extraction path**. The older `guide.py` and `rules.json` support generic exported JSON shapes and should not be used on Steam's native `itemlist/*.json`, which contain length-framed protobuf-wire messages despite the `.json` extension.

## Source material

Tested with the owner-held Steam **v1.26.1** Game Source Archive: `ddv_Data/StreamingAssets/itemlist/{Mission,Character,Story,Scene,DutyAch,RecurringEvent,Condition,ConditionalEvent,Ftue}.json`, the corresponding eight `Localization/LocDB_*.zip`, optional `friendship_levels_default.json` and per-definition `Condition/*.json` / `ConditionalEvent/*.json`, and the SRC-01 native item-index JSONL. The source bytes are **never committed to GitHub**. The extracted snapshot is version-bound; matching some file SHA-256 digests in the v1.26.2 format survey does not establish that all contents, localizations, or live events in v1.26.2 are identical.

The parser validates every framing length, repeated frame offset, canonical varint, protobuf-wire syntax, native ID and offset arithmetic. It computes source hashes and keeps original localization keys, all eight exact key-matched `locbin` values, and cleaned display strings separately. No machine translation or inferred availability is used. Missing name keys are left unresolved.

Mappings observed against native source:

- `Mission`: field 1 native ID, field 2 native identifier, field 3 localized title key, fields 30/31/42 narrative keys, repeated field 40 mission-step submessages; field 7 resolves to `Character` native ID; field 13 resolves to another Mission definition (group). Those links are **not** interpreted as the full prerequisite graph.
- `Character`: ID/name/title key; field 14 resolves to `Scene` native ID. Field 13 is retained as an **unverified code**, never a validated Story ID.
- `Story`, `Scene`, `DutyAch`, `RecurringEvent`, `Condition`, `ConditionalEvent`, `Ftue`: static definition records; optional localized keys only when actually present. The duty description is field 7.
- Nested integer matches against known native IDs are written only to `candidate-refs.json` as **candidates**, not verified prerequisites or rewards.
- The default friendship-level table provides explicit reward ID, amount, stage, level and XP. These are **global default friendship rewards**, not per-character quest rewards. The original structured JSON conditions are joined to native records **only** when both ID and exact raw name agree; observed `MissionStepStatus.Mission` yields a condition-to-quest edge. Mismatched definitions are reported, never silently joined.

## Run

Python 3.10+ standard library only. On Windows, from the repository root:

```powershell
py -3 tools/src-03-guide/native_guide.py --input "C:\Program Files (x86)\Steam\steamapps\common\Disney Dreamlight Valley" --output "D:\WandData\DB-03\Steam-v1.26.2" --version 1.26.2 --platform Steam --item-index "D:\WandData\SRC-01\items.jsonl"
```

The output must be outside the input directory. `--item-index` and `--previous` are optional. Update comparison example:

```powershell
py -3 tools/src-03-guide/native_guide.py --input "D:\DDV-vNext" --output "D:\WandData\DB-03\vNext" --version vNext --previous "D:\WandData\DB-03\Steam-v1.26.1"
```

Outputs: `guide/{quests,characters,stories,worlds,duties,events,conditions,conditionalEvents,tutorials,rewards}.json`, `database/relations.json`, `database/candidate-refs.json`, `manifest.json`, `report.json`, `unresolved.json`, and `diff.json` (baseline marker or normalized version-to-version change list, including default friendship rewards). The documented output status **PARTIAL** is deliberate: Star Path/liveops schemas, quest completion and item reward decoding, prerequisites, entitlement boundaries, and server-side event status are not yet semantically verified. Treat unresolved as an explicit work queue, not empty content.

Test:

```powershell
py -3 -m unittest discover -s tools/src-03-guide -p "test_*.py" -v
```

Do not promote candidate links to gameplay facts or publish proprietary game-localization dumps to the public repository. Source and derived dataset access should remain in the owner-controlled Drive area; Guide UI and Community Help Center are outside DB-03's scope.

**Archive discrepancy:** Two inspected Expansion04 per-definition JSON files in the v1.26.1 archive do not join unambiguously to the v1.26.1 native `Condition` / `ConditionalEvent` index. The resolver records an ID/name mismatch or missing native ID in `unresolved.json`. It does not replace, assign, or infer the mismatched record.
