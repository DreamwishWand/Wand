# DB-03 — current Steam v1.26.2 typed Mission-condition index v2

## Source evidence and backward compatibility

The original Steam v1.26.2 `Condition.json` and `Mission.json` archived by the owner are full-byte SHA-256-verified, and the independent owner-v1.26.2 `format-probe.json` is pinned. This work extends **existing original-source** Condition index v1, without replacing its files or mislabelling original 1.26.1 Mission/locale-derived search data.

| Source / output | Exact pinned SHA-256 |
| --- | --- |
| Steam 1.26.2 `Condition.json` | `9eb5e7800a2485b1dfb3e148a7bcff5d6c6b6ed72797ed2331a902ab44188f4c` |
| Steam 1.26.2 `Mission.json` | `f13958b52234f4cda92f0dd0bfff50be8a7f6625c8478785e2a077a5c7933d24` |
| Independent owner probe | `07fd8ebb1c528f852a0e00ce54cf4964f93931b9155bc9e2aab1bd857986d00a` |
| Owner-private `condition-native-index-v2.json` | `aa04c61c973874881443a370a50009f5ad6156d9e1b83ec4553045561c41b08f` |

V2 source and output contracts: `wand.db03.condition-native-index@2`,
`wand.db03.condition-native-index-manifest@2`. The generated private JSON
index has exactly **4,093,730 bytes**. Both v2 JSON files reside in
`SRC-03 GUIDE DATA/Steam-v1.26.2`, alongside **unchanged** original v1
`condition-native-index.json` and its manifest.

## Actual original-source census

- **5,440 native Condition definitions**, same as v1 index; **9,861 static Condition AST nodes**, same source-kind census, same nested AND/OR/NOT trees and original per-record wire digests.
- **4,960 explicit source-typed Mission predicate leaves** across the original Condition definitions, including **3,102** MissionStepStatus leaves already represented in v1, and **1,858 additional** previously opaque Mission references.
- Every one of the 4,960 mission IDs is present in the SHA-verified **1,030 original Mission definitions**; all explicitly referenced step IDs, substep IDs and objective IDs checked by the v2 generator resolve to native source entries. No array index is treated as a protobuf step ID.

| Confirmed source-named oneof kind | Native leaves |
| --- | ---: |
| `MissionAvailable` | 4 |
| `MissionCompleted` | 117 |
| `MissionOngoing` | 107 |
| `MissionStatus` | 704 |
| `MissionStepCompleted` | 293 |
| `MissionStepStatus` | 3,102 |
| `MissionObjectiveCompleted` | 24 |
| `MissionObjectiveStatus` | 608 |
| `MissionObjectiveProgression` | 1 |
| **Total** | **4,960** |

These nine kinds are the **observed** named source kinds in this original file; this is **not** a statement that the game supports only these kinds. `ConditionOneOf.MissionTypeStatus` is a separate schema type with different semantics and is **not** misclassified as a native Mission reference. Source fields that lack independently verified semantic names remain within the exact native payload SHA, not invented progress states.

Only source-confirmed scalar tags are promoted:
- field 1 is a native `missionId` for the listed predicate kinds;
- field 2 on step/objective kinds is an explicitly encoded **native step ID**;
- fields 3 and 4 on objective kinds are original substep/objective IDs if encoded;
- `MissionStatus` fields 2 and 3 retain the IL2CPP-confirmed comparison operator and requested mission state;
- `MissionCompleted`/`MissionOngoing`/`MissionAvailable` field 2 and `MissionStepCompleted` field 3 retain explicit source inversion flags;
- original `MissionStepStatus` expected-status codes are unchanged from the prior parser.

If a source scalar is omitted, it is **not** populated with a fabricated default. A source record's presence, reference, status comparison or inversion is **not** proof of a mandatory prerequisite, active quest, current player state or gameplay execution.

## Reproduce owner-private output

```sh
python tools/src-03-guide/current_condition_mission_v2.py \
  --condition /private/Steam-v1.26.2/Condition.json \
  --mission /private/Steam-v1.26.2/Mission.json \
  --target-probe /private/Steam-v1.26.2/format-probe.json \
  --output-dir /private/SRC-03/Steam-v1.26.2
```

The generator reprojects the exact current original source through `current_condition_catalog.build_index`, verifies every original source-tree and child-payload hash again, annotates typed scalar IDs and requires the exact source-kind census. Unknown Conditions remain opaque. It writes an independent, atomic private v2 index and manifest; v1 files are not modified.

## Browser Guide import

The Guide browser recognizes either exact pair, selected locally and processed without network calls:

- Preferred **v2**: `condition-native-index-v2.json` and `condition-native-index-manifest-v2.json` — full **4,960** source-typed Mission references;
- Existing **v1**: `condition-native-index.json` and `condition-native-index-manifest.json` — original **3,102** MissionStepStatus references; still supported.

A pair must use the **same format**. The browser independently verifies exact original private-output SHA-256 and size, original Condition and Mission source fingerprints, target source version/platform, all 5,440 IDs, all source kind counts, nine predicate kind counts, the unchanged previous source-census counts, and the non-evaluation policy. Forged or mixed-source imports fail closed.

The previous source-equivalence bridge for the selected original `guide/quest-search.json` must still pass; it is not rewritten or silently relabelled to 1.26.2. The UI displays static source condition mentions, kind, original conditional path, step/objectif IDs when encoded, and verified original quest-step descriptions when available from selected private shards. It never evaluates player progress, entitlement, server events, or claimed unconditional prerequisites.

## Regression gates

- `test_current_condition_mission_v2.py`: seven synthetic-only tests for typed IDs, requested state, inverted predicates, optional fields, nested source fingerprints, original step/substep/objective ID resolution and hash failures.
- `tests/guide-current-conditions.test.mjs`: validates v1 behavior, v2 named Mission types and fail-closed checks. An opt-in **owner-private fixture** (`DB03_PRIVATE_CONDITION_V2_DIR`) exercises the actual 5,440-record v2 index and all 4,960 references without committing private data to CI.
- Both DB-03 source-contract and Collection checks must pass at the submitted PR HEAD.
