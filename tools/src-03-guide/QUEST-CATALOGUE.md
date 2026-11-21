# DB-03 — compact, source-typed quest catalogue

**Goal:** Guide list/detail selection should not require reading the full ~98 MB original `guide/quests.json` projection on every first request. The full source-backed quest dataset remains available in owner-private storage for detailed steps and objectives. This additional index is an **offline derived summary**, not an altered game archive or an assertion of user progress.

## Private output

`quest_catalogue.py` produces `guide/quest-catalogue.json` (`wand.db03.quest-catalogue@1`), integrated into `native_guide.py`. It carries every native Mission definition as one of three *distinct* record classes:

- `missions`: **733** playable quest definitions, with source-defined 8-locale names where present, group/character ID, update group, type, number of steps/substeps/objectives, an objective type histogram, source-configured reward currencies / friendship ranges, unlock-condition **presence and source wire fingerprint**, activation policy definition counts and item-flow definition counts.
- `questGroups`: **289** `MissionQuestItemData` groups, each with source-verified child mission IDs; they must not be shown as standalone playable quests.
- `unclassified`: **8** ambiguous native records retained explicitly. They must not silently become playable quests.

All records retain the exact native definition SHA-256 and the original `itemlist/Mission.json` SHA-256, plus the source version/platform. A name missing from the game's supplied locale archives remains missing; the index does **not** invent an English/Japanese translation. No static condition, source reward or activation policy is evaluated as the user's completion/availability/entitlement.

## Steam v1.26.1 full-source validation

- **1,030** native Mission definitions; **733** missions, **289** groups, **8** unclassified.
- All **733** mission group references point to a native quest group in the same build.
- **7,878** native mission steps and **11,782** objective definitions summarized.
- **26** quest definitions have no source-resolved localized display name; retained as source IDs and raw names with `names={}`, not silently translated.
- Full detailed private `guide/quests.json`: **97,990,330 bytes**.
- New compact private `guide/quest-catalogue.json`: **1,623,889 bytes** (approximately **98.34%** fewer bytes).
- Same original Steam v1.26.1 source re-extracted and compared across **15 Guide families**: `COMPARED` with **0 added / 0 removed / 0 changed**.

Use the compact index for category/list/group filtering; load full quest details **only when necessary**. The output is still an owner-private, derived game-data file, not authorized for automatic public GitHub publication. User-facing availability/live activity must be verified separately.

The module rejects missing/mixed source fingerprints, unsupported record kinds, duplicate IDs, wrong step counts and malformed locale fields. It can also rebuild from an existing private `guide/quests.json` without reprocessing the original native game archive:

```sh
python tools/src-03-guide/quest_catalogue.py --input /private/guide/quests.json --output /private/guide/quest-catalogue.json
```

Execute synthetic offline regression tests:

```sh
python -m unittest discover -s tools/src-03-guide -p 'test_*.py' -q
```

**82** unit tests passed locally. Actual current Steam v1.26.2 original Guide source and current Star Path season response are still unavailable in the owner-provided data; DB-03 overall `PARTIAL`.
