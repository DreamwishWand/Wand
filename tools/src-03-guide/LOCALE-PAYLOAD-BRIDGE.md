# DB-03 — v1.26.1 → v1.26.2 exact localization payload bridge

## Verified owner-original inputs (2026-11-21)

Steam v1.26.1 original: `Game Source Archive / Steam / Baselines / v1.26.1__2026-11-18 / 06_Steam_Build_Assets / ddv_Data / StreamingAssets / Localization`.

Steam v1.26.2 original: `Game Source Archive / Steam / Baselines / v1.26.2__2026-11-21 / ddv_Data / StreamingAssets / Localization`.

Each version contains the eight native `LocDB_*.zip` archives used by the existing 8-locale Guide extractor. The baseline `wand.db03.native-guide@1` manifest supplies an independent per-locale old ZIP SHA-256. The independently extracted target `wand.src01.format-probe@1` supplies the current ZIP SHA-256, relative source file and native archive-entry count. Both are checked **before** inspecting member bytes.

The ZIP container byte SHA-256 differs for **all eight** languages even though the size is unchanged. Crucially, a complete path-by-path comparison of the **decompressed contents** finds identical member name sets, identical uncompressed member bytes, and no additional, missing or changed members in every archive.

| Locale | Native archive | Member payloads | Added / removed / changed |
| --- | --- | ---: | ---: |
| en | LocDB_en-US.zip | 17,852 | 0 / 0 / 0 |
| fr | LocDB_fr.zip | 17,852 | 0 / 0 / 0 |
| it | LocDB_it.zip | 17,852 | 0 / 0 / 0 |
| de | LocDB_de.zip | 17,852 | 0 / 0 / 0 |
| es-ES | LocDB_es.zip | 17,852 | 0 / 0 / 0 |
| ja | LocDB_ja.zip | 17,852 | 0 / 0 / 0 |
| zh-CN | LocDB_zh-CN.zip | 17,852 | 0 / 0 / 0 |
| pt-BR | LocDB_pt-BR.zip | 17,852 | 0 / 0 / 0 |
| **Total** | **8 archives** | **142,816** | **0 / 0 / 0** |

Result: `PAYLOAD_IDENTICAL_ALL_EIGHT_LOCALES`, the **original localized text payloads** are reusable across these exact Steam builds. This does **not** mean the ZIP archive bytes are identical. It does not automatically verify every derived Guide field, unrelated binary files, executable/gameplay semantics or server state.

## Reproducible private verifier

`locale_payload_bridge.py` reads all eight pairs, validates their complete original ZIP SHA against the independent manifests, validates archive entry counts, blocks path traversal/duplicates/encrypted/oversized entries, and recomputes a deterministic SHA-256 Merkle-like flat digest over the **sorted, length-delimited UTF-8 member names and exact 32-byte SHA-256 payload digests**. The resulting private JSON includes only archive hashes, member counts/aggregate payload digests and delta counts; it does not include licensed game text or member names.

```sh
python tools/src-03-guide/locale_payload_bridge.py \
  --baseline-loc-dir /private/v1.26.1/Localization \
  --target-loc-dir /private/v1.26.2/Localization \
  --baseline-manifest /private/v1.26.1/manifest.json \
  --target-probe /private/v1.26.2/format-probe.json \
  --out /private/v1.26.2/locale-payload-bridge.private.json
```

If a single original member changes, the status becomes `PAYLOAD_CHANGED_REEXTRACT_REQUIRED` and localized data must not be silently reused. A missing ZIP, wrong target hash, mismatched archive census, duplicate file name or unsafe ZIP path is rejected. No ZIP entry is extracted onto the filesystem.

Current owner-private audit report is saved in `SRC-03 GUIDE DATA/Steam-v1.26.2/locale-payload-bridge.private.json`. It has independent source/probe file SHA-256 pins, all eight per-locale content-tree hashes, exact comparisons and a local-only distribution boundary.

## Interaction with the separately verified Mission and Condition families

The exact original Steam v1.26.2 `Mission.json` is byte-identical to v1.26.1 and retains **733 playable missions, 289 quest groups, 8 unclassified records** (see `MISSION-SOURCE-BRIDGE.md`). Therefore, **Mission definitions + eight localization payloads** support source-equivalent reuse of the older quest texts for this exact version pair, provided the derived data pipeline verifies both source contracts. Do not merely change version strings on old public or private records.

The original `Condition.json` is **not** identical: a separate native SHA-pinned comparison of 5,439 vs 5,440 Condition IDs found one added (`2130007038`) and one changed (`2130006145`) native wire definition, with zero removals. That is a record-level wire result, not a validated change in player prerequisites or live unlock eligibility. Guide condition evaluation remains disabled.

Star Path live season availability, DLC entitlements, player progression and granting rewards still require independent evidence.

Tests: `python -m unittest discover -s tools/src-03-guide -p 'test_*.py' -v`. Seven new synthetic tests verify metadata-only ZIP differences, actual payload changes, member additions, target SHA/census mismatch, wrong platform, unsafe/duplicate ZIP entries and owner-private report output.
