# DB-03 — archived events and expansions cross-service references

Source: original owner-held **Steam v1.26.1** `ddv_Data/StreamingAssets/protoDb.bin`, joined only to the **same-version** `Mission.json` (quests), `DutyAch.json` (duties), and `Scene.json` (worlds) native indexes. Optional SRC-01 item membership is a **partial index**, not an exhaustive same-version item census.

`guide_event_links.py` converts already extracted private `guide/mini-events.json`, `guide/floating-festivals.json`, and `guide/expansions.json` into the compact, owner-private `database/guide-event-links.json` (`wand.db03.guide-event-links@1`). It runs inside `native_guide.py` **only when the original source ProtoDB is available**. Missing source input is reported, never converted to a false empty event catalogue.

## Verified typed relations and candidate references

| Native definition | Relation kind | Steam v1.26.1 references |
|---|---|---:|
| `MiniEventData.Duties` (protobuf 10) | static mini-event → duty | 84 |
| `MiniEventData.Quests` (protobuf 11) | static mini-event → quest | 66 |
| `MiniEventData.FeaturedRewards.ItemID` (protobuf 12→2) | **possible** item reward candidate | 171 |
| `FloatingFestivalData.TargetScene` (protobuf 10) | static festival → scene | 5 |
| `FloatingFestivalData.TargetSubScenes` (protobuf 11) | static festival → subscene | 12 |
| `FloatingFestivalData.Rewards.ItemID` (protobuf 21→1) | **possible** item reward candidate | 31 |
| `ExpansionData.VillageScene` (protobuf 6) | static expansion → scene | 6 |
| `ExpansionData.TagItem` (protobuf 3) | static expansion → **tag** item | 6 |
| **Total** | | **381** |

All **84 duty references**, **66 quest references**, and **23 scene/subscene references** resolve against the provided same-version native indexes. Of the **208 explicit item references**, 156 are present and 52 absent in the *optional partial* SRC-01 index. Absent from that index does **not** mean an item is missing from the game. Source path, definition SHA-256, and referenced entry SHA-256 are preserved for audit; references retain the original ProtoDB field path.

This output does **not** mean an archived event is currently scheduled/running, a reward is guaranteed or has been received, a DLC is purchased, or a player has a tag/item. To avoid overclaiming, mini-event/festival item references have candidate kinds and expansion tag items are **classification references**.

The parser validates projected original source hashes, expected native classes, target game version, unique event keys and index membership. Stale or incompatible definitions fail closed. Comparisons of two independently generated extracts from the unchanged Steam v1.26.1 source cover **15** Guide families with **0 added / 0 removed / 0 changed**. The new *derived* relation index does not count as a game-source update.

Offline tests use synthetic data and no licensed originals; execute:

```shell
python -m unittest discover -s tools/src-03-guide -p 'test_*.py' -q
```

Current full suite: **75** tests. Do not commit `database/guide-event-links.json` or generated translations/originals to public GitHub. Store source-derived outputs in owner-private Drive. Real Steam v1.26.2 Guide source and actual `GetBattlePasses` season response are not yet available; overall stream status remains `PARTIAL`.
