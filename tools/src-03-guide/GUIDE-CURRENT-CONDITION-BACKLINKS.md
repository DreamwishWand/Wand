# DB-03 Guide — source-pinned Steam 1.26.2 Condition references

The Guide browser can read the **complete owner-private Steam 1.26.2 Condition index** alongside the separately source-verified Steam 1.26.1 quest-search index, without publishing game files or silently changing the recorded quest-search version.

## Local workflow

1. Select the private Guide directory with `guide/quest-search.json` and `guide/quest-shards/` (or import the search index manually). The Guide UI's original-index byte SHA-256 gate requires the previously verified Steam 1.26.1 733-mission search file, whose Mission definitions and eight locale payloads were separately proven identical in Steam v1.26.2.
2. In **Steam 1.26.2の静的Condition定義**, select exactly **both** `condition-native-index.json` and `condition-native-index-manifest.json` from owner-private `SRC-03 GUIDE DATA/Steam-v1.26.2/`.
3. The browser verifies the private index's complete raw-file SHA-256 (`d1b43f2f62746c2b8aa9a0d4f8a8a7d35467e498e8b27bf815ea0659d71e7b69`), actual native Condition original SHA-256 (`9eb5e7800a2485b1dfb3e148a7bcff5d6c6b6ed72797ed2331a902ab44188f4c`), independent v1.26.2 source-probe SHA, exact file size, platform/version, 5,440 native IDs and complete 9,861-leaf/source-kind census.
4. Selecting any quest displays the current native Condition **MissionStepStatus** definitions referring to that quest's native Mission ID. Source Condition ID/name, nested AND/OR/NOT path, and explicitly encoded status and step fields are preserved. The current Conditions section works without loading any quest-detail shard.

Original `quest-search.json` and shards remain **v1.26.1** rather than being relabelled. The v1.26.2 Condition registry is a separate, independently source-pinned data family. There are no remote uploads, online calls, save edits or progress evaluations.

## Semantics and boundaries

- **Source mention, not direction:** A Condition whose `MissionStepStatus` refers to Quest A is *not* proof that it is a prerequisite for Quest A, nor that Quest A consumes the Condition. Mandatory prerequisites, quest ordering, runtime consumers and player status remain unverified.
- **Exact oneof types only:** Unknown/future oneof fields remain opaque; `CommonConditions` points to Condition IDs rather than Mission IDs; AND/OR/NOT groups remain nested.
- **Omitted source properties:** Absent protobuf scalars are not filled with guessed defaults. Only explicit source step ID and expected status code are displayed.
- **No published game data:** Owner-private Condition records, raw game originals, licensed strings and saves are not committed to GitHub.

### Verified v1.26.2 source example

For mission `2070001661` (the Jack Sparrow mission), original Condition `2130006145` now refers to native step **9** with status code **4 Completed** (not old v1.26.1 step 6), and newly added Condition `2130007038` refers to native step **12** with code **2 OnGoing**.

## Validation

`node --test tests/guide-current-conditions.test.mjs` covers nested OR references, optional omitted fields, unknown opaque predicates, duplicate source IDs, malformed AST and unverified/forged input rejection. One additional test reads *actual owner-private files only when available* via `DB03_PRIVATE_CONDITION_DIR`, and verifies all 5,440 definitions and these two v1.26.2 mission references. Public CI skips the private-fixture test rather than distributing source data.

The Guide's existing SHA-gated lazy quest-shard import remains unchanged, as do DB-03 source-contract and Collection CI gates.

## Source-verified quest step descriptions (2026-11-21)

When the user opens an individual quest detail shard, the browser has already verified that detail record against its exact private search-index record SHA-256. In this state, `withVerifiedConditionStepDetails` may associate a current Condition `MissionStepStatus.stepId` with an **identical original numeric step ID** in the already-selected mission's `structured.stepsDetailed`.

The displayed step ordinal, native `stepName` and localized description come **only** from this verified original mission detail. The join checks the source Mission SHA, exact mission ID, original numeric step ID (not an array position or fallback) and the matching locally displayed step row. Ambiguous duplicate step IDs, missing protobuf step fields, wrong Mission source or unselected detail files leave the annotation blank. This does not imply the player is presently on that step or that the Condition is an enforced prerequisite.

Synthetic tests cover genuine numeric-ID joins, alternate-language descriptions, missing source IDs, wrong version/hash, wrong mission ID and duplicate native IDs.
