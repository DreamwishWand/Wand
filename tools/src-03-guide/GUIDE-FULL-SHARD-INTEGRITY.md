# DB-03 — complete original Guide shard and friendship source integrity (Steam v1.26.2)

## Source scope and authoritative private proofs

The owner-original Steam **v1.26.1** Guide search index and 32 deferred quest-detail shards were audited from their actual privately archived bytes. The underlying `Mission.json` file and all eight decompressed localization payload trees are independently source-equivalent to original **Steam v1.26.2**. The search index and deferred shard output metadata correctly remain v1.26.1, rather than being deceptively relabelled.

**New owner-private audit** `guide-shards-friendship-audit.private.json`:
- Schema `wand.db03.guide-shard-source-audit@1`;
- Exact SHA-256 `99a539aad1884c92cc92337f52c6651879dc2f27493a9185dec36ff05863c4bf`;
- Byte length **8,013**;
- Full file-level SHA-256 individually recorded for **all 32** original `part-00.json` ... `part-31.json` shards, total **98,001,716 bytes**;
- Complete original native record census: **1,030** distinct IDs, including **733 mission records** with all **733/733** exact per-record canonical SHA-256 matches to `quest-search.json`, plus 289 quest groups and 8 unclassified. Zero duplicate IDs, wrong bucket paths or search-index locator mismatches;
- Owner-original full-file `friendship_levels_default.json` **2,095 bytes** byte-identical between original Steam v1.26.1 and v1.26.2 archives, exact SHA-256 `90c16a1b54bd6e0aac6176bcd164493295f867cfe536d272638b7841a651db22`.

**New owner-private source-composite v2** `guide-source-composite-1.26.2-v2.json`:
- Schema `wand.db03.guide-source-composite@2`;
- Exact SHA-256 `96f937c8c07ac6d8b799458299a3014fc1b94d005df172dba03b6d76d298a88c`;
- Byte length **12,664**;
- Strictly extends, and **does not replace or modify**, previous `guide-source-composite-1.26.2.json` (v1 SHA `c38c436bddc0bab2f1d6237fd5536e14c778bf39159e55e3c081c74182fe2d38`) with full-shard and friendship proof.
- Reuses the same original source-evidenced nine static Guide itemlist families (8 full original family files unchanged and genuine changed v1.26.2 Condition with all 5,440 native definitions and 4,960 static mission references), eight locale member-payload trees, archived ProtoDB and exact original 733-quest search index.
- Neither the composite nor its component evidence claims current Star Path seasons, live events, runtime prerequisite consumption, actual player progression, DLC entitlement, or complete interpretation of every quest mechanic.

Both new private JSON outputs were independently **re-fetched from owner-controlled Google Drive and byte-SHA verified**. Folder: `SRC-03 GUIDE DATA/Steam-v1.26.2` (do not commit the derived records or original files to public GitHub).

## Public extractor and reproducibility

`guide_shard_source_audit.py` consumes the **actual 32** original source outputs, original old Guide manifest and index, independent target source probe, and two full original friendship files.

```sh
python tools/src-03-guide/guide_shard_source_audit.py \
  --baseline-manifest /private/Steam-v1.26.1/manifest.json \
  --baseline-search /private/Steam-v1.26.1/guide/quest-search.json \
  --target-probe /private/Steam-v1.26.2/format-probe.json \
  --baseline-friendship /private/Steam-v1.26.1/friendship_levels_default.json \
  --target-friendship /private/Steam-v1.26.2/friendship_levels_default.json \
  --shard-dir /private/Steam-v1.26.1/guide/quest-shards \
  --out /private/Steam-v1.26.2/guide-shards-friendship-audit.private.json
```

`guide_composite_integrity_v2.py` checks the exact SHA-256 fingerprints and source/version cross-joins of the existing static v1 composite and new shard/friendship audit. It produces a **separate** private v2 static composite.

```sh
python tools/src-03-guide/guide_composite_integrity_v2.py \
  --baseline-composite /private/Steam-v1.26.2/guide-source-composite-1.26.2.json \
  --shard-audit /private/Steam-v1.26.2/guide-shards-friendship-audit.private.json \
  --out /private/Steam-v1.26.2/guide-source-composite-1.26.2-v2.json
```

The scripts reject altered/duplicate/extra/missing shards, a duplicate/foreign native record, changed original quest source identity, a canonical record hash mismatch, mixed versions, fabricated friendship equality, invalid source-probe, or unexpectedly changed file census. Neither writes into the public Git checkout.

## Browser behavior

`src/lib/guide/shard-fingerprints.mjs` stores only **public-safe fingerprints** for the 32 originals, not any original shard content. The existing `Guide` browser accepts the same local `quest-search.json` and deferred details without new file-selection steps:

- When the selected search index is **exactly** the original owner-private 1.26.1 search (confirmed from its actual JSON raw bytes in an out-of-band WeakMap plus source/version checks), opening an original detail shard first requires **full selected file-byte SHA-256** equality against the matching original shard. Only then is JSON decoded and the existing native quest record SHA-256 checked.
- For separately generated user/test indexes without the owner-original raw search SHA, the preexisting per-record canonical digest/source/schema validation is unchanged. A custom shard is never falsely presented as owner-original.
- The source composite UI requires the separately source-hash-pinned v1.26.2 Condition **v2** index and the authentic owner quest index. The notice now attests complete owner-original **32-file digest coverage** and exact friendship original content equality. It does not claim to have already verified arbitrary user-selected files before they are opened.

## Tests and limitations

`test_guide_shard_source_audit.py`: **9** synthetic regression tests; `test_guide_composite_integrity_v2.py`: **5** tests. `tests/guide-shard-fingerprints.test.mjs` checks exact 32 digest entries, invalid/missing names and optional real originals only when the source fixture is privately available. Existing browser source composite tests assert the new v2 private attestation while retaining the v1 provenance constants.

Original game assets remain in Google Drive. Public GitHub contains only source-typed scripts, verification hashes, synthetic tests, and documents.
