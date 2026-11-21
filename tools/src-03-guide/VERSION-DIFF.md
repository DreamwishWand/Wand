# DB-03 — conservative source-aware Guide version diffs

`version_diff.py` is called by `native_guide.py --previous <prior-output>` after the new output and `manifest.json` have been written. It does **not** infer live server events, activity schedules, entitlements or player progression.

## Compared families

`quests`, `characters`, `stories`, `worlds`, `duties`, `events`, `conditions`, `conditionalEvents`, `tutorials`, default `rewards`, static `designChallenges` and `starPathFtue` (the last two are **archived, non-live** ProtoDB definitions).

A family is compared only when the matching native source exists in **both** manifests and the corresponding projected JSON files and per-record fingerprints are available. A missing Steam itemlist, optional default-friendship table or `protoDb.bin` is **not evidence of removed game content**. The affected family appears in `uncomparedFamilies` with an explicit reason and is excluded from `added`, `removed`, and `changed`. When both snapshots lack an optional family, it is simply not compared; nothing is claimed about that family. Cross-platform comparisons are rejected.

## Fingerprints, not extractor revisions

For native records, compare the per-definition `nativeWireSha256` and source-extracted, stable top-level and original step-localized text; for ProtoDB definitions, the typed payload SHA and static exact translated text. Do not compare the entire derived JSON object: newly implemented objective decoders, item cross-reference annotations, or a global file SHA would otherwise create thousands of spurious “game changes” even when native source bytes were identical. Default friendship rewards compare level, XP, stage, reward ID and amount.

Deep objective-description translations newly exposed by later parser revisions are **not** independently compared if the native wire payload is unchanged. That is an explicit limitation to keep comparisons independent of schema implementation changes. A native localization-key change *is* included in the native wire fingerprint.

Legacy projections without a native per-record SHA are marked `native_wire_fingerprint_unavailable` and excluded rather than pretending they can be compared. `diff.json.status` is `COMPARED`, `PARTIAL_COMPARISON`, or `NOT_COMPARABLE`, with `comparedFamilies` and `uncomparedFamilies`. The previous version's `manifest.json` is mandatory. Different game versions must be independently verified; a `--version` string does not prove archive completeness.

## Baseline validation

Full Steam v1.26.1 snapshot compared with a freshly regenerated v1.26.1 snapshot: all 12 source-present families compared, **0 added, 0 removed, 0 changed**. This validates that extractor-only changes do not report game-version changes. Synthetic unit tests also verify a real wire change, localization-only change, missing-source family, missing native fingerprint, ProtoDB static changes and platform mismatch rejection.

The owner's Game Source Archive Steam v1.26.2 folder did not contain a Guide source export at the time of this implementation, so **no verified v1.26.2 Guide difference is asserted**.

Standard-library tests: `python -m unittest discover -s tools/src-03-guide -p 'test_*.py' -v`. Proprietary raw/derived game data remain in private Drive, not the public GitHub repository.
