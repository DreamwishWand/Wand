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

## Authenticated 2026-11-22 Steam cache snapshot (first real seasons)

The owner supplied a Steam v1.26.2 environment copy of `Cache/liveops/battlepasses.dat` in the **private** Drive `2026_11_22` folder. Its observed size is **186,442 bytes**, SHA-256 `4168d6ec580b04893f701dec5f0509589d39fb2e838d08bac724a9720caecf14`. Unlike the preceding protobuf snapshot parser, this is an outer `{"Data": {"<OnlineId>": "<escaped JSON BattlePassSeasonData>"}}` transport cache. It contains two season definitions. A cache may be incomplete, stale, or owner-specific: its `Active` field, last update timestamp, record presence and expiry conditions are **not** authoritative current live status or entitlement.

The public **curated static projection** lives in `static/guide/public/starpath-cache-2026-11-22.json`, generated by `starpath-cache.mjs` from the precise SHA-pinned original private bytes. It has its own pinned published SHA-256 `78819b4d36042e3c60b576583149e58541d3ca297fa0c3ba8a9a775009614198`. Only the two season IDs, English source titles, version/min-version, UTC configured date boundaries, currency label and configured premium price, slot counts, typed reward-item references, token prices, static page purchase thresholds, short direct task descriptions, weekly localization key indicators, objective *kinds* and token rewards are published. No raw task AST/filter, avatar/save progress, player entitlements, online currency UUIDs, resource addresses, source files, account identifiers, or other private cache content are included.

- Haunting Elegance: 6 normal pages/34 normal rewards; 4 bonus pages/9 bonus slots; 7 vault slots; 121 normal tasks and 7×3=21 weekly task definitions.
- Seafaring Star Path: 2 normal pages/10 normal rewards; 1 bonus page/1 bonus slot; 6 vault slots; 25 normal tasks and 6×3=18 weekly task definitions.
- Full static snapshot: **67 reward slots**, **146 normal + 39 weekly = 185 task definitions**.
- All 39 weekly descriptions are unresolved `Liveops.*` localization keys; show kind/ID without fabricating localized instructions. Native reward item IDs are **not** verified DB-01 name joins or player ownership.
- Date `FinishDate` and `EndDate` use `IntOperator_LessThan`, so the published UTC limits are **exclusive**, not inclusive “end of day” claims.
- No file chooser is required on the public `/guide/star-path/` page. The page checks the released JSON raw-byte SHA-256 before parsing. Navigation from the homepage/header is public.

Rebuild using the owner-private original outside Git:

```sh
node tools/src-03-guide/starpath-cache.mjs /private/Cache/liveops/battlepasses.dat static/guide/public/starpath-cache-2026-11-22.json
node --test tests/guide-starpath-cache.test.mjs
```

Regeneration for a later capture requires a **new SHA pin, revalidated counts, explicit archive identity and separate published artifact**, not silent replacement of this snapshot or artificial promotion to a complete live catalogue. No current player state/claims or actual seasonal entitlement is inferred.


## Exact original weekly texts and DB-01 reward names (2026-11-22)

The same verified cache contains **39** unique `Liveops.*_Description` weekly-task keys, not usable human-facing instructions in the cache. Steam v1.26.2 owner's **eight** `Localization/LocDB_*.zip` game originals were verified by SHA-256 and their protobuf `Liveops.locbin` entries were read without a third-party translator. All **312** original weekly descriptions exist. `starpath-weekly-locales.py` reproduces the curated 15,252-byte text-only projection: `static/guide/public/starpath-weekly-locales-2026-11-22.json`, SHA-256 `6efa52893a3b3a475e00987940e50b0815f39904350e1e76731aac823ca71507`. Removal of formatting-only `<nobr>`, U+200B, U+00AD, and U+2060 leaves linguistic content untouched; the browser renders as plain text, never game HTML.

The public `public-starpath-locales.mjs` consumer verifies that byte count/hash **before parsing**, checks the strict 39-key closure against the already SHA-validated season definition, and requires all eight locale values. UI supports Japanese, English, French, Italian, German, Spanish, Brazilian Portuguese, and simplified Chinese. Normal/daily task descriptions remain the *English cache text*, because the cache contains literal English sentences rather than the 39 resolved weekly localization keys. A user-selected locale does not imply machine-translated daily instructions. Original localized discrepancies are preserved, e.g. Seafaring week 3 task 1 refers to **20** fish in German but **25** fish in Japanese and English. Do not silently reconcile without new original-source evidence.

The 60 distinct reward/alternate reward ID references were joined exactly against the immutable, published DB-01 `steam-1.26.2-native-itemlist-v1` release index SHA-256 `06912b156823d920d1b3a2b937ebff3d06e1ca670043db616c907c683b46599f` and its 14 SHA-checked item shards: **43** have public `nameStatus=verified` eight-locale original item names, **17** have no verified public match and retain their source IDs. `starpath-reward-names.mjs` is generated from precisely those public DB-01 rows and tested against every pinned shard in CI. This names-only join does **not** imply ownership, grant, cache semantics of a currency/placeholder, or proven image matches. Existing public game-image pins cover only three unrelated IDs; do not manufacture reward images or use unverified screenshot/icon associations.

Regenerate in private environment (never commit game ZIP archives or raw caches):

```sh
python tools/src-03-guide/starpath-weekly-locales.py \
  --cache /PRIVATE/Cache/liveops/battlepasses.dat \
  --locales-dir /PRIVATE/Localization \
  --output static/guide/public/starpath-weekly-locales-2026-11-22.json
node --test tests/guide-starpath-locales.test.mjs
```

The source ZIP and release-index hashes must be reviewed and changed explicitly for any subsequent original game version. No collection of private translation ZIPs, raw game assets, personal save/profile, server-origin metadata or unverified AI translations is placed in the repository.


## Native Steam v1.26.2 daily-task translations (2026-11-22)

**Previously unlocalized 146 normal tasks are now independently verified in all eight original game locales.** The private 186,442-byte `Cache/liveops/battlepasses.dat` source contains literal English daily descriptions instead of localization keys. Each `<SeasonOnlineId>_<TaskInternalName>_Description` key was found in the *same version's* `StreamingAssets/Localization/LocDB_*.zip` → `Liveops.locbin`. All **146/146 English entries match the source cache text**, including non-breaking whitespace normalization. All **1,168/1,168** expected original localized daily descriptions exist with no blank/missing keys.

Source ZIP SHA-256 evidence is pinned in `starpath-weekly-locales.py` and reused in `starpath-daily-locales.py`; cache SHA-256 is pinned in both. The new source-verified CLI also pins the exact expected source season IDs and the daily task census (Haunting Elegance 121, Seafaring 25). It reads only the required liveops localization keys. Original Japanese `<nobr>` markup and U+200B/U+00AD/U+2060 layout control characters are stripped while words, punctuation and source-specific quantities are preserved. French `<nbsp>` becomes a non-breaking space. Neither source ZIP nor full liveops tables are published.

Static source projections, with exact original-source closure and immutable browser SHA-256 validation:

| Source season | Published file | Original tasks | Language values | Bytes | SHA-256 |
| --- | --- | ---: | ---: | ---: | --- |
| HauntingElegance2026 | `starpath-daily-haunting-2026-11-22.json` | 121 | 968 | 45,280 | `5cb5a3809eec14be3cc24191b6bd8f39a20624c69eafcc57e61246bd85ffaddc` |
| Seafaring2026 | `starpath-daily-seafaring-2026-11-22.json` | 25 | 200 | 10,315 | `6d308bd67caceea376054ae18f4b6e8953cecfdd8aff2507bc9dae058dd45beb` |

Together with the existing 39×8 weekly descriptions, the public `/guide/star-path/` now resolves **185 task definitions × 8 languages = 1,480 original translation values**, with no machine translations, fake effective duty quantities, entitlement state, or user progress. The selected language controls task search and description display. The original cache English remains provenance metadata only and is independently compared with every `en-US` daily translation in tests.

Reproduce from the private cache and original ZIPs without uploading them:

```sh
python tools/src-03-guide/starpath-daily-locales.py \
  --cache /PRIVATE/Cache/liveops/battlepasses.dat \
  --locales-dir /PRIVATE/StreamingAssets/Localization \
  --output-dir static/guide/public
node --test tests/guide-starpath-daily-locales.test.mjs
```

**Media publication boundary:** SRC-04 has privately staged about 19,054 source-verified image files and 13,202 Item ID associations in R2, but its public distribution candidate is still `candidate_unpublished` with publication authorization disabled. No public URL or manifest can be inferred from the private storage prefix. Do not show fabricated image paths or expose private bucket resources; use only an explicitly published, immutable and verified public media release when available.


## Previously unresolved reward IDs — source closure (2026-11-22)

The 17 Star Path reward or alternative reward IDs not covered by the public `steam-1.26.2-native-itemlist-v1` release **do exist** in the exact source-backed owner-private DB-01 SQLite v2. That public release included only four major game categories, so it did **not** establish that these IDs were missing from the game. Reinspection of the source-pinned original **33,627-definition** private SQLite v2 package (ZIP SHA-256 `0a1286655a0c4d2ceb91aa61a06c257d2cf485076c8a11dbf3484ad3b7bb5f25`) verifies all 17 source IDs, their native categories and original source files. That catalogue recorded **38/39** verified source files, not a full-game claim; the nine relevant category source records pass direct category/path/row validation.

Source categories: 8 `TouchOfMagic` (motif records with no localization key), 2 `Companion`, 2 `PhotoMode`, 1 each `Building`, `Currency`, `Tool`, `Makeup`, and `Skin`. The nine entries with original localization keys resolve in **all eight verified Steam v1.26.2 `LocDB_*.zip`** files via native `<Category>.locbin` entries, giving **72 exact current-version names** (not historic candidates). Examples:

| Source ID | Verified native class | Exact original Japanese label |
| --- | --- | --- |
| 20500163 | Building | トリック&トリート・ハウス |
| 80100000 | Currency | ムーンストーン |
| 110800069 | Tool | エレガントなナイトメアアンブレラ |
| 120000253 | Companion | サル（大尉） |
| 120000263 | Companion | ウサギ（ゴス） |
| 140500052 | Makeup | クモの巣フェイスペイント |
| 170000115 | Skin | スケルトン・スクルージ |
| 190000033 | PhotoMode | フォトフレーム（カボチャ） |
| 190000034 | PhotoMode | フォトフレーム（黒バラ） |

The eight `TouchOfMagic` original records have **no game-native display-name localization key**. They are displayed as an *unnamed motif category*, never as a fabricated named motif, nor by misrepresenting their original code symbol as the game's formal display name.

The curated `static/guide/public/starpath-reward-extras-2026-11-22.json` contains only 17 native categories, nine `names` records in eight languages, and explicit nulls for the eight unnamed motifs. Its public immutable SHA-256 is `e8e720ce43610e4e049baa31270ae586d1d03313c85a0c7833083eff5acd8ab2` (4,075 bytes). The other 43 reward IDs already have verified original names in the published four-category DB-01. The complete static Star Path reference now resolves **52 named rewards + 8 unnamed motifs**, all 60 IDs with verified native provenance. This is a reference classification, not user entitlement, reward claim, ownership or public media availability.

The `starpath-reward-extras.py` offline reproducer requires the exact 10,226,751-byte owner-private ZIP and eight original localization ZIPs, verifies all source hashes, native schema, source path, 17 ID keys, names and zero unmatched categories, then fails closed if its public output SHA differs:

```sh
python tools/src-03-guide/starpath-reward-extras.py \
  --db01-private-zip /PRIVATE/db01-steam-v1262-sqlite-typescript-native-key-v2-private.zip \
  --locales-dir /PRIVATE/StreamingAssets/Localization \
  --out static/guide/public/starpath-reward-extras-2026-11-22.json
node --test tests/guide-starpath-reward-extras.test.mjs
```

The public browser checks the added file's byte length and SHA-256 **before parsing**, validates exact crosswalk closure against the original source-pinned 60-item reward set, and switches exact source names with the user's current display language. Premium currency ID `80100000` may now be correctly labeled ムーンストーン / Moonstone from its `Currency.Gem_DisplayName` original localization key. No raw SQLite, personal save, private item shards, private R2 object URL, or unauthorized image bytes are published.
