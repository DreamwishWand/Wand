# DB-03 — Steam 1.26.2 provenance-preserving static Guide source composite

## Original-source reconciliation (2026-11-21)

The owner-private artifact **`guide-source-composite-1.26.2.json`** has schema
`wand.db03.guide-source-composite@1`, exactly **8,748 bytes**, SHA-256
`c38c436bddc0bab2f1d6237fd5536e14c778bf39159e55e3c081c74182fe2d38`.

It reconciles exact original-source fingerprints across the owner-held Steam **v1.26.1** native Guide manifest and independent Steam **v1.26.2** format probe. No game text, source binary, save or account content is published.

| Native itemlist source | Exact full-file v1.26.1 vs v1.26.2 |
| --- | --- |
| Mission.json (1,030) | Identical |
| Character.json (142) | Identical |
| Story.json (54) | Identical |
| Scene.json (194) | Identical |
| DutyAch.json (635) | Identical |
| RecurringEvent.json (602) | Identical |
| ConditionalEvent.json (2,216) | Identical |
| Ftue.json (575) | Identical |
| Condition.json | **Changed**: 5,439 → 5,440 definitions; v1.26.2 current source **re-extracted** |

The eight unchanged families are verified by exact **full-file SHA-256 and byte length**, not merely by matching native IDs. The changed Condition file is independently SHA-pinned and represented by the complete, owner-private `condition-native-index-v2.json`, containing **5,440** current definitions, **9,861** static condition nodes and **4,960** source-typed native Mission mentions.

Eight localization ZIP archive byte hashes **changed**, but every decompressed `.locbin` member path and payload in all **142,816** members are byte-identical to baseline. The original Steam `protoDb.bin` is exactly identical (1,335,720 bytes, 2,246 archived entries) and contributes only archived static definitions, **not** active/live Star Path seasons.

## Critical provenance boundary

The original private `guide/quest-search.json` is **still a Steam v1.26.1 output**, fingerprint
`26c29bc0df15161602d75578c9842c5b7cca56caee0d6dd1031180949cceb30d`. It includes **733** searchable missions, **289** group definitions excluded from standalone search and **8** unclassified records. It references **32** lazy quest-detail shard paths. Their records are SHA-256 verified **when an individual shard is opened**; this composite does **not** pretend to verify all 32 full shard-file byte digests.

The exact underlying Mission original and eight-language decompressed source content match v1.26.2, so these previously generated quest search definitions may be reused as **source-equivalent data**. The old output files are not rewritten or incorrectly relabelled to `1.26.2`. The owner-private current Condition **v2** index and its manifest retain genuine Steam v1.26.2 provenance. The composite is a cross-version **source provenance manifest**, not a newly extracted complete Guide export, not a data migration and not a player progress validator.

Other Guide input families (including the global `friendship_levels_default.json` file), complete Quest detail shard file-level digests, all possible reward/gameplay semantics, live Star Path season feed, server events, exact runtime condition consumers, actual quest unlocking and account entitlement are **not established by this proof**.

## Machine-readable source files

The proof is generated with public `guide_source_composite.py` and pinned to:

| Private source file | Exact SHA-256 |
| --- | --- |
| `Steam-v1.26.1/manifest.json` | `cd9cdd00db16445d4ab6f604f08d1e1f2bd2c304c6f2d1d387783b89433adf26` |
| `Steam-v1.26.2/format-probe.json` | `07fd8ebb1c528f852a0e00ce54cf4964f93931b9155bc9e2aab1bd857986d00a` |
| `Steam-v1.26.1/guide/quest-search.json` | `26c29bc0df15161602d75578c9842c5b7cca56caee0d6dd1031180949cceb30d` |
| Locale payload equality report | `4f185a7a02af11c9a84502c5f0c104949ae4e8cf563b646f8d456891a316312e` |
| ProtoDB identity report | `dcf79a666f16aa64a2cfa9505c4e6f309d160a16db7190c550bd415a3acbeab9` |
| v1.26.2 Condition v2 manifest | `fc1bcae901a41da9ae66a6f31faa7161889ebc7c7887ac6cda82f90718068890` |
| v1.26.2 Condition v2 full index | `aa04c61c973874881443a370a50009f5ad6156d9e1b83ec4553045561c41b08f` |

`guide_source_composite.py` rejects mixed versions, changed additional native families, a fabricated claim of unchanged Condition source, changed localization member payloads, stale ProtoDB evidence, non-exact search/shard source IDs, missing/altered original input hashes, and changed Condition v2 source/manifest digests. All original validation input artifacts are private.

Reproduce from the public repository, supplying the actual owner-private files and an output path outside Git checkout:

```sh
python tools/src-03-guide/guide_source_composite.py \
  --baseline-manifest /private/Steam-v1.26.1/manifest.json \
  --target-probe /private/Steam-v1.26.2/format-probe.json \
  --baseline-search /private/Steam-v1.26.1/guide/quest-search.json \
  --locale-bridge /private/Steam-v1.26.2/locale-payload-bridge.private.json \
  --protodb-bridge /private/Steam-v1.26.2/protodb-source-bridge.private.json \
  --condition-v2-manifest /private/Steam-v1.26.2/condition-native-index-manifest-v2.json \
  --condition-v2-index /private/Steam-v1.26.2/condition-native-index-v2.json \
  --out /private/Steam-v1.26.2/guide-source-composite-1.26.2.json
```

The generated owner-private output was uploaded to
`SRC-03 GUIDE DATA/Steam-v1.26.2/guide-source-composite-1.26.2.json`,
**re-fetched**, and independently confirmed to be byte-identical to the generated file.

## Browser consumption (no additional file selection)

`src/lib/guide/source-composite.ts` exposes a read-only, bounded claim when and **only when** the local browser already holds:

1. The exact original Steam v1.26.1 `quest-search.json` read through `importGuideSearch` (an out-of-band raw-file SHA-256 gate), and
2. The independently verified Steam v1.26.2 Condition **v2** index and manifest imported through `importCurrentGuideConditions` (raw index SHA-256, count, native original-source and manifest gates).

The Guide page displays a scoped **static source-composite notice** without requiring the user to manually select the composite report itself. Quest and Condition data provenance remains distinct; neither is uploaded. Missing or untrusted input, or older Condition **v1**, cannot activate the composite notice.

**Do not** infer player progress, a mandatory quest prerequisite DAG, live event availability, current DLC ownership, full coverage of all possible Guide families or publication rights.

## Regression gates

- `python -m unittest discover -s tools/src-03-guide -p 'test_*.py' -v` includes 9 new public, source-free tests for exact source families, archive payloads, original index, changed Condition, current v2 manifest, Star Path limitations, source-fingerprint mismatch and unsafe version mixing.
- `npm test` runs `tests/guide-source-composite.test.mjs` for the browser-side static-composite display and fail-closed conditions.

Keep the original/derived game data in owner-private Drive. Public repository contains only typed contracts, test fixtures **without game text**, source SHA-256 fingerprints and documentation.
