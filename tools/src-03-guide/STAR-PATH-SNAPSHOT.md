# DB-03 — Star Path (BattlePass) offline source snapshots

**Source contract:** owner-held Steam **v1.26.1** IL2CPP protobuf definitions in `Il2CppDump/dump.cs`; standalone source scan of the same build's `ddv_Data/StreamingAssets/protoDb.bin`. This is a **read-only** parser for separately obtained Protobuf *source snapshots*, not an authenticated API client or a way to obtain data without its original source.

## Where the season data lives

The game declares `GetBattlePasses.Types.Response`, with `BattlePassesUpdated` = protobuf map field **4** (`string -> BattlePassSeasonData`), `BattlePassIdsNotFound` = repeated string field **6**, and `OnlineIdsRemapping` = string-to-string map field **7**. Field **1** is Result and field **3** is PlayFabResult. The name `BattlePassesUpdated` is important: an individual response may contain **only updates**, not an exhaustive season catalogue. A `not found` identifier is NOT proof a season has been removed from the game, and an empty response is NOT proof that no season exists.

`BattlePassSeasonData` contains `Version` (1), `MinGameVersion` (2), `Active` (3: archived snapshot flag only), `StartDate`/`FinishDate`/`EndDate` (4–6: `ConditionDate`), source `Title`/`Description`/`ShortDescription` (7–9), repeated Tags (10), price and active slot configuration (13–19), `RewardsPages` (21), `BonusRewards` (22), `VaultRewards` (23), `TaskConfig` (24), `WeeklyTasksConfig` (25), `OnlineId`/currency ID/type/language (30–33), archived last-update condition (34), image/resource references (50–51), platform filter fingerprint (52), and optional referenced config (53). `BattlePassRewardsPage` has its own oneof unlock policy (5–8) plus rewards (10). `BattlePassTask.Objective` (4) uses **Definitions.ObjectiveData**, a distinct objective oneof from `MissionObjectiveData`, and the source-typed oneof kind is retained with its protobuf payload SHA-256.

`starpath_seasons.py` decodes candidate reward item IDs, static quantities and prices, premium/recurrent/bonus markers, page unlock thresholds, bonus/vault reward definitions, daily/week task definitions, available-on-day values, the source version and condition dates. Unknown objectives/filters keep source fingerprints; no effective player state is computed. The importer never calls any game/API server, and never evaluates `Active`, availability, ownership, premium entitlement, purchased rewards or task progress.

## Source audit — what was actually available

`starpath_source_audit.py` audited the **2,246** original ProtoDB records. It found **one** `Definitions.StarPathFtueConfig` introductory record and **zero** `Definitions.BattlePassSeasonData` definitions inside **this ProtoDB**. This does **not** imply there is no active Star Path; the seasonal content is supplied by a different liveops response. The owner-private `database/starpath-source-coverage.json` captures the audited source SHA-256 and counts. No genuine `GetBattlePasses` response has been supplied, so no actual season record or current catalogue is claimed.

## How to import an owner-provided snapshot

These commands require **genuine** bytes obtained lawfully by the owner; generated fixture bytes are only for tests. Keep both source and output on the owner's private storage.

```shell
python tools/src-03-guide/starpath_seasons.py --input /private/GetBattlePasses.response.bin --format response --output /private/guide/starpath-season-snapshot.json
python tools/src-03-guide/starpath_seasons.py --input /private/BattlePassSeasonData.bin --format season --id SOURCE_KEY --output /private/guide/starpath-season-snapshot.json
python tools/src-03-guide/starpath_source_audit.py --input /private/Steam/ddv_Data/StreamingAssets/protoDb.bin --version 1.26.1 --output /private/database/starpath-source-coverage.json
```

Output is `wand.db03.battlepass-source-snapshot@1`. A source SHA-256 identifies the exact input; each season, reward, task and condition keeps fingerprints. `coverage=partial_response_updates_only_not_complete_season_catalog`. Never merge separate response snapshots as if a missing item meant deletion; preserve source/version/language provenance when combining. Any public UI consumer must retain historical/unknown status until independent authoritative live evidence is available.

Synthetic tests use no original game bytes or private saves: `python -m unittest discover -s tools/src-03-guide -p 'test_*.py' -q`. **66** tests passed in the expanded local suite. `status=PARTIAL` until a real season response, authoritative Steam v1.26.2 Guide source and live availability are independently verified. Code and synthetic fixtures belong on public GitHub; source responses, parsed contents and the audit artifact belong only in owner-private Drive.
