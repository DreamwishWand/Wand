# DB-03 — owner-private multilingual quest search and detail lookup

**Baseline:** source-backed Steam v1.26.1 Guide projections. `quest_search.py` is a **static Guide navigation index**, not a player quest tracker, authoritative current availability listing, DLC ownership checker or online feed. No source-extracted game text or generated search JSON is committed to the public repository.

## Contract

- **Input:** exact same-target `guide/quest-catalogue.json` and `database/quest-detail-shard-index.json`. The exporter checks source Mission SHA-256, target platform/game version, ID and record-kind census (all native missions, groups and unclassified rows), native-wire fingerprints and canonical detail locator metadata. It fails rather than accepting mixed versions, path escapes, missing IDs or invalid source provenance.
- **Output:** `guide/quest-search.json`, schema `wand.db03.quest-search@1`, containing **only playable mission definitions**. Each row has source ID, 8-locale exact provided names, source update group, group/character IDs, mission type code, source scope tags, objective type facets, and a `detail` object with `quest-shards/part-XX.json`, SHA-256 of the original **full** quest record and source native-wire SHA-256.
- **Queries:** Unicode `NFKC` normalization and casefold, including half-width/full-width Japanese characters, literal substring/space-separated-term search, native numeric ID exact-match. Default search covers the requested locale and English as an explicitly labeled fallback; `all_locales=True` opts into all verified source translations. Source internal names are searched only if explicitly requested. Deterministic name/ID sorting, pagination 1–100 results per page, and source-defined filters for `character`, `group`, `update_group`, `objective_kind` and `scope_token`.
- **No invented data:** Missing names remain missing. A client may **display** English or the original internal name if the selected locale is absent; it must accurately indicate the displayed source. A source update group or expansion token is **not** a claim that an owner purchased, can unlock, or has completed anything.
- **Delivery:** An authorized Guide consumer can load this search file, select a record, then load only its corresponding private/approved shard file and compare the canonical full record digest. `quest_detail_shards.py --verify` verifies all shard files against the index and, optionally, `quests.json`. The search module itself does not serve game-derived content publicly or provide browser authentication.

## Build without reparsing game archives

```sh
python tools/src-03-guide/quest_search.py \
  --catalogue /private/guide/quest-catalogue.json \
  --shards /private/database/quest-detail-shard-index.json \
  --output /private/guide/quest-search.json
```

Example offline lookup (also rewrites the private derived search index):

```sh
python tools/src-03-guide/quest_search.py \
  --catalogue /private/guide/quest-catalogue.json \
  --shards /private/database/quest-detail-shard-index.json \
  --output /private/guide/quest-search.json \
  --query 'パーティー' --locale ja --limit 20
```

The full native `native_guide.py` extraction also builds the same search index automatically. For regression tests, run `python -m unittest discover -s tools/src-03-guide -p 'test_*.py' -q` (no proprietary game bytes in fixtures).

**Source limitations:** the owner's Steam v1.26.2 Guide original update folder is not yet populated; a full Star Path season response is not available. Steam v1.26.1 static search records must never be represented as confirmed v1.26.2 updates or current online season availability. Overall extraction `PARTIAL`.
