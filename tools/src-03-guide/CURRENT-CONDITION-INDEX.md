# DB-03 — complete Steam 1.26.2 original Condition index (owner-private)

## Goal and scope

`current_condition_catalog.py` produces a complete native-ID-keyed **static Condition definition index** from the **actual owner-held Steam v1.26.2** original `ddv_Data/StreamingAssets/itemlist/Condition.json`.

**This is not a quest progress evaluator**, runtime truth table, currently active event feed, ownership detector, or unconditional prerequisite graph. It captures source definition trees without attempting to decide whether any player meets a predicate.

The reader refuses non-Steam/non-v1.26.2, altered or unpinned inputs. It requires the independently captured source probe SHA-256 `07fd8ebb1c528f852a0e00ce54cf4964f93931b9155bc9e2aab1bd857986d00a`, including source-file identity, and validates the exact 571,341-byte Condition original SHA-256 `9eb5e7800a2485b1dfb3e148a7bcff5d6c6b6ed72797ed2331a902ab44188f4c`.

## Verified original-data output (2026-11-21)

| Metric | Current Steam 1.26.2 |
| --- | ---: |
| Original native Condition definitions | **5,440 / 5,440** |
| Source-typed condition kinds observed, including nested subconditions | **68** |
| Static leaf/predicate nodes, including nested groups | **9,861** |
| MissionStepStatus source-typed leaves | **3,102** |
| Source-typed CommonConditions reference leaves | **275** |
| Unique referenced mission IDs among explicit MissionStepStatus leaves | **421** |
| Current Condition original coverage | **Complete for this source file** |
| Complete Guide / live Star Path / player state coverage | **Not established** |

The original source contains 87 known `ConditionOneOf` source-defined field names in the Steam IL2CPP schema; **68 are actually observed in this original static source**, including nested condition kinds. This does not mean only 68 condition kinds are supported by the game.

Every output Condition row preserves the original numeric native ID, original source name, frame index, source-wire SHA-256 and its AND/OR/NOT tree. Each oneof child records the original numeric tag, source-defined kind when known, and raw payload SHA-256. Native `SubConditions` are recursive, bounded and **not flattened into a prerequisite list**.

Source `MissionStepStatus` field **285** exposes **only explicitly encoded** `missionId`, `stepId` and `statusCode` scalar values. When the wire format omits an optional field, the output records `omittedSourceFields`, **not a fabricated value**; unexpected fields preserve the opaque hash and are not promoted. `CommonConditions` field 5 preserves only source-typed pointers. Unknown future oneof tags remain opaque with hashes, never silently discarded.

The output is **owner-private**, under Drive:
`SRC-03 GUIDE DATA/Steam-v1.26.2/condition-native-index.json` and
`condition-native-index-manifest.json`.

The native-index JSON is approximately **3.89 MB**; its manifest independently binds the generated index SHA-256, byte length, original source full-file SHA, exact target game version, and count/typed-kind census. Raw original binaries, full derived Condition definitions and localized licensed strings are **not** committed to the public repository or embedded in the site bundle.

## Invocation

```sh
python tools/src-03-guide/current_condition_catalog.py \
  --condition /private/Steam-v1.26.2/Condition.json \
  --target-probe /private/Steam-v1.26.2/format-probe.json \
  --output-dir /private/SRC-03/Steam-v1.26.2
```

The tool refuses output inside a public Git checkout, output colliding with original inputs, SHA mismatches, mismatched game version, invalid native record census, unsafe native payload structures or excessive nested condition depth. Writes are atomic private JSON files, not partial in-place mutation of existing game originals.

## Cross-service contract

This is the **new actual-source-backed Condition 1.26.2 data family**, not v1.26.1 Condition data with edited version labels. DB-01, DB-02 and Guide consumers can use this **only after verifying the private manifest/source binding and their own join invariants**. An ID mention or raw string is not a proven unconditional quest dependency, and a source predicate is never player state.

The separately verified unchanged Mission, eight-language uncompressed locale payloads and ProtoDB archives are documented in `MISSION-SOURCE-BRIDGE.md`, `LOCALE-PAYLOAD-BRIDGE.md` and `PROTO-DB-GUIDE-CATALOG.md`; their equality **does not imply** unchanged Condition data. `CONDITION-SEMANTIC-DELTA.md` details the two native changed records `2130006145` and `2130007038`.

Six source-free regression tests cover nested Boolean trees, original scalar fields, optional-omission handling, unknown and novel wire payloads, typed CommonConditions references and source verification boundaries. Run the full DB-03 Python test suite with
`python -m unittest discover -s tools/src-03-guide -p 'test_*.py' -q`.
