# DB-03 — one-folder owner-private Steam v1.26.2 Guide import

## Delivered private bundle

The owner-private ZIP `Wand-Guide-Steam-v1.26.2-private.zip` is retained in `SRC-03 GUIDE DATA/Steam-v1.26.2`. The ZIP is **16,683,577 bytes**, complete-file SHA-256 `9dcf0efbeb4b70fcf4222a295a43690ae6a04fb1ee12a169dc8031f062600d6f`; it contains exactly **41** files, all independently checked after ZIP roundtrip. It is not committed to the public repository.

Contents of the extracted root directory:

```text
Wand-Guide-Steam-v1.26.2/
  guide/
    quest-search.json                 # v1.26.1 original, source-equivalent to 1.26.2
    characters.json                   # same 1.26.1 original-source projection
    quest-catalogue.json              # same 1.26.1 original-source projection
    quest-shards/
      part-00.json ... part-31.json   # full 32 exact original lazy shards
  condition-native-index-v2.json
  condition-native-index-manifest-v2.json
  source-proof/
    guide-shards-friendship-audit.private.json
    guide-source-composite-1.26.2-v2.json
  OWNER-PRIVATE-BUNDLE-MANIFEST.json
  README.txt
```

The v1.26.1 quest index has **733** native searchable missions plus 289 separate group and 8 unclassified records; the 32 original shard files total **98,001,716 uncompressed bytes** and match all original full-file and 733 individual quest-record digests from the audited owner archive. The genuine v1.26.2 Condition v2 index contains **5,440** definitions and **4,960** source-typed Mission mentions. The zip does **not** contain the original Steam binary game source, live account/saves, or online season responses.

Every embedded file has a SHA-256 in `OWNER-PRIVATE-BUNDLE-MANIFEST.json`, and the packager verifies the pinned original audit report, source composite report, quest index, original character and catalogue projections, all 32 original shard full-file digests, v2 Condition and v2 manifest before producing the ZIP. Files retain their original 1.26.1 versus current 1.26.2 source-provenance fields. Do not rename or change original target version metadata.

## Use in Guide

1. **Extract** the private ZIP on the device; do not attempt to import the compressed file itself.
2. Open Wand → Guide → **Guideデータのフォルダを選択**.
3. Select the extracted **Wand-Guide-Steam-v1.26.2** folder once. The browser imports the original SHA-256 verified quest index, attaches the 32 original lazy shard files, and **automatically** imports the two v1.26.2 Condition v2 files after verifying their full index fingerprint, original sources, native counts and manifest.
4. Search the 733 quests and open details. Individual quest details are read only on demand. The static nine-family source composite appears once both source classes are verified.

The former manual import of the two Condition JSON files remains available for an old Guide-only folder. All imports are local to the browser with **no network uploads**.

## Browser import security

`src/lib/guide/client.mjs` detects current Condition pairs only **at the exact sibling root** of the discovered `guide/quest-search.json`; it does not scan arbitrary unrelated folders or infer data provenance from filenames. The two files must both be present and of the same format. A partial pair, duplicate or mixed pair fails closed. If full v1 and v2 pairs coexist, v2 is preferred; neither is interpreted before the separate, byte-pinned `importCurrentGuideConditions` gate.

`src/routes/guide/+page.svelte` does not expose a partially imported folder if Condition authentication fails: it first validates the quest index, current Condition pair and bridge and then atomically installs them into the UI state. A Guide-only folder continues to import without Condition sidecars. Selecting a new folder invalidates prior source and in-progress imports.

## Rebuild (owner-local, only when source files already exist)

Public source-only `tools/src-03-guide/guide_private_bundle.py` can regenerate this private ZIP from the archived Guide projection and independent current v1.26.2 Condition/proof files:

```sh
python tools/src-03-guide/guide_private_bundle.py \
  --guide-dir /private/Steam-v1.26.1/guide \
  --condition-dir /private/SRC-03/Steam-v1.26.2 \
  --shard-audit /private/SRC-03/Steam-v1.26.2/guide-shards-friendship-audit.private.json \
  --source-composite /private/SRC-03/Steam-v1.26.2/guide-source-composite-1.26.2-v2.json \
  --out /private/SRC-03/Steam-v1.26.2/Wand-Guide-Steam-v1.26.2-private.zip
```

The output must not exist and must not reside in the source directories or a public checkout. The tool uses source-verified SHA-256 pins, deterministic internal ZIP paths/timestamps, conservative maximum file limits and a full ZIP readback check. Synthetic, game-data-free tests are in `test_guide_private_bundle.py` and `tests/guide-browser.test.mjs`.

## Evidence boundaries

This is the **verified static Guide scope**, not a full live Guide. It does not claim all runtime Condition consumers, mandatory prerequisites, current player save progress, online Star Path seasons, active events, or DLC entitlements. Data in this ZIP includes owner-private proprietary game-derived names and descriptions: do not redistribute through public GitHub, GitHub Pages, or unauthenticated download links.
