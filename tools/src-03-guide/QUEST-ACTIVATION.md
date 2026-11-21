# DB-03 — conditional quest activation policies

Baseline: owner-held Steam v1.26.1 `Definitions.Items.MissionItemData` source-validated field contracts, `itemlist/Mission.json`, eight locale archives. These are **static** definitions, not evaluated gameplay conditions, automatic prerequisites, actual progression, or live server/entitlement status.

## Verified payloads

- `MissionItemData.AutoAccept` (field **23**) is repeated `MissionItemData.Types.AutoAcceptOption`: `Choice`=1 (`MissionChoice.Any`=0 through `Choice8`=8), `Conditions`=2 (`ConditionsList`). A missing enum is annotated `choiceFromProtoDefault=true` instead of assuming a player's choice.
- `MissionItemData.UIUnlockConditions` (field **22**) is repeated `UIUnlockCondition`: `Conditions`=1, localization `Text`=2. Decode the exact localization key only when available, and keep the entire AND/OR/NOT tree.
- `MissionItemData.OwnerOverrides` (field **19**) is repeated `OwnerOverride`: `Conditions`=1, **oneof** `Character`=2 or `Custom`=3. Only a typed `Character` ID becomes a character relation. The custom owner definition is retained by SHA-256 only, never treated as a character ID or evaluated.
- The nested condition decoder is shared with `condition-ast.json`; all condition references preserve their source field path and static condition kind. Auto-accept choice, UI visibility and conditional owner selection remain separate categories. No policy is converted into an unconditional quest dependency.

`mission_semantics.py` projects these to `structured.activationPolicies`. `database/quest-activation-policies.json` indexes only the source-proven `mission` records with at least one policy, retaining each mission/native source SHA-256 and each branch's nested condition AST. Quest groups/unclassified records are excluded, and the index explicitly says `evaluation=not_evaluated_static_source_only`.

## Full-source baseline and validation

Steam v1.26.1 raw mission source contains **336 auto-accept options**, **20 owner override branches** (19 opaque custom definitions, one source-typed character reference), **3 UI unlock conditions**, spanning **339 playable mission definitions**. The source-validated links across Guide increase from 4,074 to **4,110**, with **0 unresolved** IDs. The 4,897 candidate item references, 11,782 objectives, and 733 playable missions remain unchanged.

The same original Steam v1.26.1 source compared against previous projection across 12 source-present Guide families: **0 added, 0 removed, 0 changed**. Local Python 3.10+ standard-library unit tests: **36 passed**. The genuine Steam v1.26.2 Guide source, current server events/Star Path seasons and actual save progress are not claimed complete. The game's proprietary original/derived source is retained only in owner-private Drive.
