# SHA-verified reuse of Steam v1.26.1 originals for the v1.26.2 DB-01 catalog

**Status:** Source-backed private extraction, not a public game database release. `recover_unchanged1262.py` was run against the owner's Drive-preserved original Steam **v1.26.1** game files and the independently captured Steam **v1.26.2** `format-probe.json`. The entire source bytes of **38 of 39** `itemlist/*.json` files have identical SHA-256 values in the two versions. `Condition.json` differs and is **not** reused. No new PC extraction is required for those 38 files; it is still required for the changed `Condition.json` and any future changed sources.

## Verification boundary

1. Require the exact byte SHA-256 of archived `FullVersion.txt` with the `-v1.26.1-` marker. Require the SHA-256 of the **independent current** `format-probe.json`, which records the SHA-256 for each v1.26.2 itemlist source.
2. Independently verify that the four native itemlist source files in the archived 1.26.1 game match the **current 1.26.2** native `manifest.json` SHA-256 and that the current native 13,202-row `items.jsonl` checksum matches its own manifest.
3. For the 35 additional category source files, require **full-file byte-for-byte SHA-256 equality** between the archived original file and the v1.26.2 probe's declared hash; also verify full frame lengths, frame keys, field-1 Item IDs, and three sampled native frame IDs using `extend1262.pinned_category`.
4. Refuse reuse of the changed `Condition.json`; its 1.26.1 bytes must never be labeled 1.26.2. The fully verified empty `ItemCondition.json` is counted as a source category with zero records.
5. Reuse the **current** v1.26.2 `probe_complete.py` output for BoardGame and PhotoMode localized names only after exact current-probe checksum, current item IDs, native keys and source-hash agreement. Additionally, decode **every fully embedded** v1.26.2 `.locbin` member in `format-probe.json` with exact captured-byte length, member CRC-32, and key matching. This expands validated current-name coverage for AvatarFeature, Makeup, MountGear, Character and Tool without interpreting truncated members as complete. **Do not use any v1.26.1 localization archives as current names.** All eight full localization ZIP hashes differ between versions.
6. Reject duplicate or overlapping Item IDs, conflicting localized names, unexpected missing categories or changed source bytes, and writing the output under any input directory. No file is uploaded automatically, and no game source bytes are committed.

## Proven results (2026-11-21)

| Scope | Count |
| --- | ---: |
| All Steam itemlist source categories | 39 |
| Full source files SHA-identical to v1.26.2 | **38** |
| Changed and excluded current source categories | **1** (`Condition`) |
| Full additional category files decoded | 33 nonempty + one empty |
| Additional source-verified definitions | **20,425** |
| Existing current four native categories | 13,202 |
| Union of current verified definitions | **33,627** |
| Source-ID collisions with native four | 0 |
| Definitions with all eight current-game names fully verified | **241** |
| Definitions with at least one current-game name fully verified | **506** |
| Complete v1.26.2 locale members independently decoded | **53** across eight archives |

These are **definitions**, not 33,627 collectible or inventory items. Source classification, DLC/world membership, ownership, screenshots, and current `Condition` content remain unresolved. The current ZIP-member records are not evidence that **all** names in the current eight full archives are known. The 1.26.1 archive's full eight-locale ZIPs are not a valid replacement for the current ZIPs, even if their displayed names appear similar.

## Private CLI

Run inside a GitHub checkout, with existing owner-private source directories provided on disk:

```powershell
py -3 tools/src-01-items/recover_unchanged1262.py `
  --baseline "D:\PrivateGames\Steam-v1.26.1" `
  --probe "D:\WandData\SRC-01\Steam-v1.26.2\format-probe.json" `
  --native "D:\WandData\SRC-01\Steam-v1.26.2" `
  --complete-probe "D:\WandData\SRC-01\Steam-v1.26.2-complete-probe" `
  --out "D:\WandData\SRC-01\Steam-v1.26.2-exact-reused-extended"
```

Output `definitions.jsonl` + `manifest.json` + `report.json` belongs **only** in private Drive. `manifest.json` is `wand.src01.extended@1`, includes precise SHA-256 source evidence and `unresolvedCategories: ["Condition"]`, and can be passed to the existing `tools/db-01-items/build.py --extended` once a local, SHA-checked Switch Collection reference is available. Do not append the previous 132 definitions: they are already part of the 20,425 and the compiler rejects collisions.

**Tests:** `python -m unittest discover -s tools/src-01-items -p 'test_*.py' -v`. This CI test suite uses only synthetic data. The exact 39-source/8-locale validation is also run separately against the owner's non-public archive and probe; neither source bytes nor localized strings are checked in.