# DB-03 — public, source-typed quest item candidates (Steam v1.26.2)

## Released contracts

The public Quest Guide has **4,869 objectives containing an original source-typed ItemSelector** and **4,897 candidate-item occurrences** (4,641 direct and 256 alternatives) across **2,551 unique item IDs**. Exactly **159 selectors have no explicit item candidate**, so the Guide must not invent an ID for those dynamic/filter cases. This is a static *source configuration*, not a player's active quest requirement, a guaranteed reward, or inventory progress.

Published artifacts under `static/guide/public/`:

- `quest-targets-index.json`: exact source provenance, full SHA-256/byte ledger for eight partitions, and a **2,059-ID** name lookup joined against the already-public Steam 1.26.2 DB-00 game-data release.
- `quest-targets-00.json` … `quest-targets-07.json`: compact positional original-quest item selectors and static amounts. Parts use the same original 32-shard grouping as `quest-details-00..07.json`; no original native game blobs or non-Guide narrative are included.
- Source ID coverage: 2,059 IDs have verified current Steam names; **492 IDs lack verified names in the published 13,202-definition category snapshot** and are displayed only as IDs/「名称未確認」. This does not imply they are invalid.
- The original complete 32-shard private audit is owner-only and exact SHA-pinned by `guide_public_targets.py`. Public source equivalence for Mission remains Steam 1.26.1 → 1.26.2, while item name normalization comes specifically from published Steam 1.26.2.

## Browser integration

`src/lib/guide/public-targets.mjs` checks the source scope, expected exact counts, name provenance and **each lazily fetched partition's raw-byte SHA-256** before checking every selector against the corresponding already-validated public objective index/type. The public page loads item target metadata only after opening a quest. Existing quest details remain available even if this optional overlay cannot be validated, with a visible warning. No Save files or private import needed.

One fixed `mode=item` selector with one `direct` candidate **and a separately verified current item name** can replace the UI placeholder `{ItemName}`/ `{itemName}`. A statically sourced numeric amount can replace `{TargetAmount}`. Weighted alternatives and dynamic filters must **never** be converted into guaranteed required items; they remain explicit candidates or unresolved. The target chips always show original candidate item IDs and mark alternative candidates.

## Reproducible regeneration

Requires the owner-private exact Guide bundle (16,683,577 bytes, SHA-256 `9dcf0efbeb4b70fcf4222a295a43690ae6a04fb1ee12a169dc8031f062600d6f`) and public source files from the same repository checkout:

```bash
python tools/src-03-guide/guide_public_targets.py \
  --bundle /private/Wand-Guide-Steam-v1.26.2-private.zip \
  --public-index static/guide/public/quest-index.json \
  --published-item-index static/ddv/game-db/releases/steam-1.26.2-native-itemlist-v1/index.json \
  --published-item-shards static/ddv/game-db/releases/steam-1.26.2-native-itemlist-v1 \
  --out /tmp/quest-targets-output
```

Original ZIP digest, 32 original full-file shard digests, all 733 quest IDs, all 11,782 objective positions, public item release index SHA, all 14 published item-shard SHA-256s and official names are validated independently. New versions must regenerate source-authenticated outputs and update the declared source pins; relabelling is prohibited. Production release verification now checks all eight quest target partitions in addition to original public quest detail parts.

Tests: `node --test tests/guide-public-targets.test.mjs`, `python -m unittest discover -s tools/src-03-guide -p 'test_*.py'`, `node browser/guide-smoke.mjs`.
