# DB-03 — Steam 1.26.2 native Condition semantic delta

## Exact original source evidence (2026-11-21)

This audit is scoped **only** to owner-original `ddv_Data/StreamingAssets/itemlist/Condition.json` for Steam **v1.26.1 → v1.26.2**. The two full files were acquired from the owner's archived installed game files. Version, platform, original full-file SHA and census are all checked; the target SHA is also independently pinned to `wand.src01.format-probe@1`.

| File | v1.26.1 | v1.26.2 |
| --- | ---: | ---: |
| Condition.json bytes | 571,256 | 571,341 |
| Native Condition definitions | 5,439 | 5,440 |
| Added IDs | — | 1 |
| Changed existing IDs | — | 1 |
| Removed IDs | — | 0 |
| Unchanged IDs | — | 5,438 |

The existing `condition_native_diff.py` established byte-level native record IDs and canonical protobuf-wire SHA-256. The new `condition_semantic_delta.py` **does not guess names from IDs or infer a gameplay trigger**. It reads the source-confirmed `ConditionOneOf.MissionStepStatus` protobuf tag **285** and the source-confirmed `MissionStatusOperator` enum, retaining the adjacent `DialogueFlag` leaf only as an opaque fingerprint. The separately SHA-verified, byte-identical Steam v1.26.2 `Mission.json` is used to validate the target mission ID and actual native **step IDs**, not to infer completion state or the order of play.

### Precisely identified changes

**Target Mission ID** `2070001661`, original named identifier
`Village!Pirates!CaptJackSparrow!VLG_Capt_040`, update scope `Expansion04Main`.
The game's verified Japanese localization gives this mission the title
**「ずるい海賊たち」**. The source `Mission.json` SHA is
`f13958b52234f4cda92f0dd0bfff50be8a7f6625c8478785e2a077a5c7933d24`.

| Condition source record | v1.26.1 static predicate | v1.26.2 static predicate | Native mission step exists? |
| --- | --- | --- | --- |
| `2130006145` (`..._ShipwreckActive`) | MissionStepStatus Mission `2070001661`, **stepId=6**, status code 4 (**Completed**) | **stepId=9**, status code 4 (**Completed**) | Yes; source `Group06` → `Group10` |
| `2130007038` (`..._AttentionVFX`) | absent | MissionStepStatus Mission `2070001661`, **stepId=12**, status code 2 (**OnGoing**) | Yes; source `Group11` |

The first existing condition retains its other `DialogueFlag` source wire payload **byte-for-byte**. Neither its boolean connective nor the existing status code changes: this is a **referenced native mission step ID change**, not the player completing or failing a quest. The second condition is a new source definition, not a known new quest definition.

There are **zero source-typed `CommonConditions` pointers to either changed ID within the 5,440 target Condition definitions**. This does **not** prove that the game never consumes either condition ID: other native source families, prefab/runtime lookups and game/server logic are outside this direct-reference scan. The target `Mission.json` is unchanged and still contains 1,030 definitions (733 playable missions, 289 groups, 8 unclassified).

### Reproducible private audit

```sh
python tools/src-03-guide/condition_semantic_delta.py \
  --baseline-condition /private/v1.26.1/Condition.json \
  --target-condition /private/v1.26.2/Condition.json \
  --mission /private/v1.26.1/Mission.json \
  --target-probe /private/v1.26.2/format-probe.json \
  --out /private/SRC-03/Steam-v1.26.2/condition-semantic-delta.private.json
```

The tool requires exact source/probe SHA-256 fingerprints and counts, rejects mixed versions, absent/duplicate mission steps and new unforeseen condition changes, and writes only to an owner-private location outside a GitHub checkout. The verified owner-private report is at
`SRC-03 GUIDE DATA/Steam-v1.26.2/condition-semantic-delta.private.json`.

Eight synthetic tests check source-native status/step decoding, changed vs added conditions, step ID vs array position, source-typed CommonConditions references, opaque unknown tags, unexpected protobuf fields, wrong SHA/probe/versions, and unsafe/missing source paths.

### Guide integration boundary

- **Safe current metadata**: Native Condition source version/count, the exact two changed source records, and their static MissionStepStatus references. The v1.26.1 Quest index may be reused **only** in the previously proven source-equivalent Mission + eight-language localization scope; do not simply relabel it.
- **Requires a current-version projection**: The full v1.26.2 Condition record set and any condition-facing Guide/DB-01/DB-02 consumers must use independently verified current Condition source, never the old condition bytes.
- **Not established**: runtime truth of predicates, mandatory quest prerequisites, actual player status, reward grants, online-event availability or DLC entitlement.

Original game contents, private source index and full condition records are **not** committed to public GitHub.
