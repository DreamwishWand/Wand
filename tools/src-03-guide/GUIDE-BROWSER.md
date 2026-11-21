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
