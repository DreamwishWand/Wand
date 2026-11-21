# DB-03 — static ProtoDB Guide definitions

Steam v1.26.1 ships `ddv_Data/StreamingAssets/protoDb.bin`, a protobuf-wire collection of typed definitions. `protodb_static.py`, invoked by `native_guide.py` when this file exists, extracts **static** `Definitions.DesignChallengeData` and `Definitions.StarPathFtueConfig` entries. All source bytes stay in the owner's private Game Source Archive; generated definitions stay in private SRC-03 Drive.

## Verified source contract

- ProtoDB: repeated outer field 1, each message with record-name field 1 and typed envelope field 2. Envelope fields 2/3/4/5/6 are update group, name, source path, definition class and definition payload.
- `Definitions.DesignChallengeData` (Steam v1.26.1 IL2CPP `dump.cs`): Title=2, Description=3, ShortDescription=4, MinGameVersion=5, Type=6, DecorReward=7, OutfitReward=8, static Active=9, Offline=10, date-condition payloads=11/12/13/14, reward=30.
- `Definitions.StarPathFtueConfig`: Title=1, Description=2, ShortDescription=3, CurrencyName=4, FreeActiveTaskCount=6, PremiumActiveTaskCount=7, PremiumCurrencyGrant=8, RewardsPages=9, TaskConfig=10, WeeklyTasksConfig=11, Resources=12, FtueQuestMission=13, StarPathIntroFtue=15.
- `Liveops.locbin` uses field-1 records containing a required key field 1 and an **optional** localized text field 2. The observed key-only records are treated as missing strings, not fabricated values. Other localization categories continue using the earlier strict format.

## Outputs

- `guide/design-challenges.json`: all source-backed design-challenge entries, including DreamSnaps and a separate non-DreamSnaps onboarding definition; exact localized title/description/short-description where present, static reward IDs, minimum game version and SHA-256 of date/tag payloads.
- `guide/starpath-ftue.json`: **tutorial/FTUE** configuration only. Reward page contents and tasks remain opaque, identified by SHA-256; mission links use the native ID. This is **not** a catalog of current or historical full Star Path seasons.
- `protodb-static-manifest.json` / `protodb-static-unresolved.json`: source hash, counts, unresolved exact localization.
- Root `manifest.json` includes `protoDbStatic` coverage (or `not_present` when source unavailable).

**Do not interpret archived `Active`, `Offline`, or date fields as a current event schedule.** Current DreamSnaps submissions/voting windows, season status, live Star Path rewards, and server-side event availability are not verifiable from a local ProtoDB snapshot. No current availability is asserted.

Validation: `python -m unittest discover -s tools/src-03-guide -p 'test_*.py' -v` (standard-library Python 3.10+).
