# DB-03 to SvelteKit Guide integration — local-first

The `/guide/` route is a functional, client-side Guide reader, not a public publication of extracted game text. It accepts owner-held `quest-search.json` (`wand.db03.quest-search@1`), produced from the same-version original Mission definitions and the verified `quest-detail-shard-index.json`. It then accepts one or more `part-XX.json` full-detail files, loads only the selected quest's shard, and verifies that quest's canonical SHA-256 and native-wire fingerprint against the original search index before showing static quest steps and source-defined objective categories. The browser never uploads the selected files, stores them in a server/session, or contacts a user/game API.

The route retains exact source game version and platform, supports all eight provided locales, Japanese NFKC normalization, character/group/update/objective filtering, 40-row pagination, and English/internal source-name fallback labels. Quest groups and unclassified raw definitions never appear as playable quests. The UI explicitly disclaims progress, event activity, DLC entitlements and player rewards.

## Data boundary

Keep `quest-search.json`, the original ~98 MB `quests.json`, all 32 `part-XX.json` files, and original localized game text **owner-private** unless separately approved for public serving. The public site initially offers a file selector with a clear unconfigured state. The guide route and runtime use no fake sample data in production. Users can select the existing private JSON downloads manually; this is a client-side proof of the real source-to-UI integration, **not** an automatic Drive connector, public data deployment, or backend API. An authorized distribution mechanism can be added later without changing the source contract.

## Validation

Synthetic Node tests: `node --test tests/guide-browser.test.mjs`. Original Steam v1.26.1 validation on the owner's local extracts: all **733** `quest-search.json` mission records produced the identical SHA-256 digest to their canonical complete record in one of 32 `quest-shards/part-XX.json` files. The entire original catalogue still contains 1,030 native Mission records, including the 289 group definitions and 8 unclassified definitions. Browser retrieval requires the user to select the correct shard and uses the byte-level source/provenance contract from DB-03.

The Steam v1.26.2 Guide originals and real GetBattlePasses season snapshots remain unprovided; do not treat these v1.26.1 definitions as confirmed current state. Browser bundling, SvelteKit prerender and accessibility should be tested in CI. The overall Guide source completeness remains PARTIAL.

## Folder import (DB-03, 2026-11-21)

The browser route now provides an optional **single directory selection** using an
HTML file input with `webkitdirectory` (the existing individual-file inputs remain
available under an expandable fallback for browsers without directory support).
Point it at the privately downloaded `guide` directory, containing
`guide/quest-search.json` and `guide/quest-shards/part-XX.json`, or the enclosing
versioned extraction directory containing that exact nested layout.

`importGuideFolder(files)` checks all *relative* `File.webkitRelativePath`
strings and accepts exactly one `guide/quest-search.json`. It validates its
schema, original version/platform, source fingerprint and searchable mission
census, then registers only matching shard files from the **same folder prefix**.
Cross-folder substitutions, duplicate matching shard paths, traversal, oversized
files, excessive directory enumeration and missing indexes are rejected. It does
not require every shard to be present, but displays exact provided/required shard
counts and never invents missing records. Importantly, no original `quests.json`,
other files, or shard contents are eagerly read; the selected quest's full
record hash is still verified on demand. A `loadEpoch`/`detailEpoch` UI guard
prevents delayed imports or detail reads from overwriting newer selections.

All source-derived JSON remains **owner-private**. Directory selection does not
publish the 733 mission names, download from Drive, send to a server, or authorize
public redistribution. The Guide is a local-first test of the real data contract.

Verified against the existing original Steam v1.26.1 owner-private extract: the
folder input identified **733** searchable mission definitions and **32/32**
matching detail shards; five widely spaced real mission IDs were loaded and their
full canonical record hashes checked. **14** synthetic Node Guide tests pass,
including seven new directory-import/security regressions. The new input does not
claim current live game version or player progress.

## Source-backed objective descriptions in the browser (DB-03, 2026-11-21)

`detailStepRows(record, locale)` now uses the original `structured.stepsDetailed[]`
source projection to show each step's `stepDescription` (never the unrelated
`ongoingRequestButton` UI prompt); its optional `storyDescription` is presented
only inside a collapsed spoiler warning. Each actual `subSteps[].objectives[]`
gets its own source `stepDescription` / mobile fallback. Where absent, the
substep description is shown once only, not duplicated across objectives; when
no supported source description exists, the UI indicates it is unavailable.
The precise localization source is preserved: requested locale first, original
English only as a *labeled* fallback, no synthetic translation. Source markup
`<nobr>`, `<smallcaps>`, `<br>` etc. is normalized to readable plain text, with
Svelte auto-escaping all data as text (no raw HTML injection).

For objectives carrying `wand.db03.mission-items@1` selectors, the UI shows the
native configured **numeric** amount only if `amount.kind == value`; unknown or
dynamic expressions remain null. Individual item IDs are explicitly labeled
**source candidates** (direct reference versus selector alternative), never
asserted to be a complete required-items checklist. Only the first 32 distinct
candidate entries are displayed to bound the UI, with the full count disclosed;
item names and inventory/progress are not inferred. These are **static game
rules**, not current player state, availability or server-side reward outcomes.

Independent local validation used owner-private Steam v1.26.1 originals: all
**733/733** mission full-record SHA-256 digests still match the source index
across **32** shards. The enhanced renderer traversed **7,878** native steps,
**11,782** typed objectives; **10,571** objectives showed authored localized
text (including strictly source-derived substep-description fallbacks), **4,817**
showed source-configured integer quantities, **4,710** had source item candidate
IDs, and **1,905** steps offered a story-description panel. Six additional
synthetic tests bring focused Guide browser tests to **20**, without embedding
any private game data. The source baseline and status remain unchanged:
Steam **v1.26.1**, `PARTIAL`.

## Source character labels on the Guide filter (DB-03, 2026-11-21)

When a user selects the private Guide extraction directory, the browser now
optionally reads `guide/characters.json` (a ~219KB static native projection) and
uses its **exact source-localized names** next to IDs in the character facet and
quest inspector. The native document is accepted only with the same game-version
and platform, the expected `wand.db03.native-guide@1` schema, `characters`
family, source `Character.json` identity, stable 64-digit SHA-256 fingerprints,
unique native IDs and exact supported locales. The UI falls back to the native
numeric ID whenever this optional document or a locale is absent; unknown names
are never invented. Misplaced same-name data from another selected folder is
ignored, while duplicates and invalid same-folder native character documents
fail closed.

No original game assets are sent to a server; selecting this folder reads only
the compact `quest-search.json` and optional `characters.json` (~219KB), not the
~98MB full quest source nor its 32 shards. Original Steam v1.26.1 sample verified
**86/86** distinct quest-associated character IDs with native character name
entries, **733** missions and **32/32** shard references while reading **zero**
shard files. The focused Guide browser tests now total **23** synthetic tests.
An identical target version does not independently establish that the original
character and Mission archives came from the exact same game build: this is
local optional label enrichment, not a claim of independently signed source
matching or of game progress/availability.


## Optional source quest-group lookup and same-group navigation (2026-11-21)

When a private directory includes **`guide/quest-catalogue.json`**, the browser reads this existing
~1.6MB optional source index, checks that it has exactly the same Steam/source `Mission.json` SHA-256,
version, source census, original native mission wire hashes and recorded group memberships as
`guide/quest-search.json`. Invalid/mixed-source catalogue information fails closed. It never
requires the catalogue to browse existing quests and never reads the ~98MB original or any detail
shard until a quest is selected.

The group filter displays the **source `rawName`** (delimiters made readable), which is an
*internal source identifier*, not an official localized game name. The selected quest may show
other quests whose original `QuestGroup.missionIds` list includes it, in that source array order.
**This is only a static group membership and listing order, not verified unlock prerequisites,
chronology, save progress, or a recommended play order.** Search can optionally match exact
same-source character labels and group internal identifiers as well as mission names; the match
source is explicitly labeled in the search result and original quest ID is unchanged.

No game source texts are introduced into the public repository, static deployment, or requests.
All existing security checks for local folder boundaries and per-record SHA-256 still apply.
