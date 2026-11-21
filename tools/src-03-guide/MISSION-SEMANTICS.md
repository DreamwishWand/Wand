# DB-03 — source-backed mission semantics

The native Steam v1.26.1 `Mission.json` itemlist mixes `MissionItemData` and `MissionQuestItemData`. The catalog deliberately retains all native IDs for compatibility but marks every record as `mission`, `questGroup`, or `unclassified`, and emits `database/mission-record-kinds.json`. Never interpret a `questGroup`/`unclassified` row as a playable quest.

## Field evidence

The field numbers in `mission_schema.py` were checked against the owner-held Steam v1.26.1 `Il2CppDump/dump.cs` and validated with `itemlist/Mission.json`:

- `Definitions.Items.MissionItemData`: `AvailableConditions=20`, `UnlockConditions=21`, `Steps=40`, `RewardsXP=62`, `OwnerCharacter=7`, `QuestId=13`, `Type=9`, `UICategory=15`.
- `Definitions.Items.MissionStepData`: `StepID=15`, `StepName=16`, `SubSteps=20`.
- `Definitions.Items.MissionSubStepData`: `SubStepID=1`, `StepName=2`, `Objectives=50`.
- `Definitions.Items.MissionObjectiveData`: `ObjectiveID=8`, `StepName=9`, and the named oneof objective fields (e.g. `BringItem=80`, `TalkToCharacter=270`, `UnlockCharacter=280`).
- `Definitions.Conditions.ConditionsList`: `Operator=1`, `Conditions=2`. `ConditionOneOf` encodes named alternatives, including mission status predicates. Preserve the whole AND/OR/NOT tree.
- `Definitions.Missions.MissionReward`: `FriendshipOverride=1`, `Currency=3`; `MissionCurrencyReward` contains `CurrencyId=1` and `Amount=2` (`Min=1`, `Max=2`).

Each mission now has `structured.questMeta`, `structured.conditions`, `structured.stepsDetailed` and `structured.rewardsDecoded`. Objectives have native IDs, source-backed kind labels, descriptions (only exact eight-language localization key matches), and SHA-256 fingerprints even if their internal payload semantics are not yet decoded. `structured.stepsDetailed[]` contains `subSteps[]`, then `objectives[]`.

`database/relations.json` separates static `condition_reference` and `objective_reference` edges from the legacy character/group/scene references. A link marked `resolved` means the target native ID exists; it does **not** mean its gameplay condition is satisfied. Unknown oneof fields remain opaque, and absent localization remains absent. A `MissionCompleted` predicate nested below OR/NOT must not be flattened into a required predecessor. This code never evaluates current game progress, live Star Paths, entitlements, or DreamSnaps server status.

### Validation

Run `python -m unittest discover -s tools/src-03-guide -p 'test_*.py' -v` (Python 3.10+). The tests cover a fully nested mission step, conditional AND/OR trees, typed objective references, currency/friendship ranges, localization, binary safety, and diffs. Source-derived definitions stay in the owner's SRC-03 Drive folder, not the public repository.

This remains a **PARTIAL** extractor. Star Path seasons and server-managed event schedules require separately verified game-native source schemas. Do not infer such schedules from recurring-event IDs or gameplay descriptions.
