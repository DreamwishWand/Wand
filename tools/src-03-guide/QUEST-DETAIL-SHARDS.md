# DB-03 — owner-private on-demand quest detail shards

**Source:** verified original Steam **v1.26.1** `ddv_Data/StreamingAssets/itemlist/Mission.json` (source SHA-256 preserved in every record). All outputs are static historical game-definition projections, **not** quest progress, player rewards, live availability or DLC ownership.

## Why a separate detail index

The existing `guide/quest-catalogue.json` compact listing is **1,623,889 bytes** and keeps the 733 playable mission definitions separate from 289 quest groups and eight unclassified records. Previously a consumer that needed a single quest's nested steps/objectives would have to load the entire **97,990,330-byte** `guide/quests.json` detailed export. `quest_detail_shards.py` retains **every complete original record** in a stable 32-bucket partition, rather than discarding deep fields or requiring a ~98 MB request for one detail.

### Owner-private output layout

- `database/quest-detail-shard-index.json` (about **315 KB**): `byId` maps the original native decimal ID to its relative file, record class, source native-wire SHA-256 and complete record-content SHA-256. Includes target game version/platform, original Mission source SHA-256 and SHA-256 + byte size of every stored shard.
- `guide/quest-shards/part-00.json` through `part-31.json`: **32 separate JSON files** containing all 1,030 original full native record projections. IDs partition deterministically by the first 32 bits (big-endian) of `SHA-256(ASCII decimal native ID) % 32` and sort numerically within each file. Archive content is not uploaded to public GitHub.
- Original `guide/quests.json` remains **unchanged** on owner-private Drive, providing independent round-trip source verification.

Each shard is bounded by 16 MiB; any oversized generated shard is rejected. Source-provenance hash, a per-record native-wire hash and complete JSON record digest are checked against the index and optionally against the original full detailed projection. No claim of game-version change is derived from introducing this new transport format.

## Verified real source results (Steam v1.26.1)

- **1,030 of 1,030** original Mission native records reproduced without content modification: 733 missions, 289 quest groups, eight unclassified.
- **32** nonempty shard files; individual sizes **1,768,172 to 4,964,703 bytes**. Total shard JSON size: **98,001,716 bytes** (additional metadata, not an actual compression saving); index size **314,725 bytes**.
- An independent verifier reconstructed and compared every record against the original `guide/quests.json` and verified every file SHA-256. The 15 existing Guide source families remain subject to their own native-wire version diff; a code-only shard addition is not a game content change.

## Build and verify

```shell
python tools/src-03-guide/quest_detail_shards.py --input /private/guide/quests.json --output /private/DB03
python tools/src-03-guide/quest_detail_shards.py --output /private/DB03 --verify --input /private/guide/quests.json
```

The complete `native_guide.py` offline extractor also generates shards from the same in-memory original Mission records. `--verify` works without original input (source-shard checksum and coverage) or with `--input` (strict full-record original equality). A user-facing Guide can first load `quest-catalogue.json` and `quest-detail-shard-index.json`, then request only `index.byId[questId].file` from the corresponding private/approved source storage. Merely copying Drive files to an openly served public endpoint is **not** part of this implementation or a rights decision; serving licensed source-derived content requires the project's separate publishing policy.

## Reliability

- No group is mistaken for a playable quest; missing/partial original source cannot generate a deceptive empty catalogue.
- Mixed source versions/hashes, duplicate IDs, invalid IDs, invalid kinds, tampered sharded data, index path traversal, missing shards and original-content discrepancies all fail closed.
- **92** offline synthetic unit tests passed, including ten new tests for these contracts. Run `python -m unittest discover -s tools/src-03-guide -p 'test_*.py' -q`.

**Not yet sourced:** authoritative Steam **v1.26.2** Guide archive and a genuine full Star Path `GetBattlePasses` response. Guide remains `PARTIAL`, and 1.26.1 files must not be labeled as confirmed 1.26.2 content.
