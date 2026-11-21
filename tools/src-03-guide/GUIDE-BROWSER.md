# DB-03 to SvelteKit Guide integration — local-first

The `/guide/` route is a functional, client-side Guide reader, not a public publication of extracted game text. It accepts owner-held `quest-search.json` (`wand.db03.quest-search@1`), produced from the same-version original Mission definitions and the verified `quest-detail-shard-index.json`. It then accepts one or more `part-XX.json` full-detail files, loads only the selected quest's shard, and verifies that quest's canonical SHA-256 and native-wire fingerprint against the original search index before showing static quest steps and source-defined objective categories. The browser never uploads the selected files, stores them in a server/session, or contacts a user/game API.

The route retains exact source game version and platform, supports all eight provided locales, Japanese NFKC normalization, character/group/update/objective filtering, 40-row pagination, and English/internal source-name fallback labels. Quest groups and unclassified raw definitions never appear as playable quests. The UI explicitly disclaims progress, event activity, DLC entitlements and player rewards.

## Data boundary

Keep `quest-search.json`, the original ~98 MB `quests.json`, all 32 `part-XX.json` files, and original localized game text **owner-private** unless separately approved for public serving. The public site initially offers a file selector with a clear unconfigured state. The guide route and runtime use no fake sample data in production. Users can select the existing private JSON downloads manually; this is a client-side proof of the real source-to-UI integration, **not** an automatic Drive connector, public data deployment, or backend API. An authorized distribution mechanism can be added later without changing the source contract.

## Validation

Synthetic Node tests: `node --test tests/guide-browser.test.mjs`. Original Steam v1.26.1 validation on the owner's local extracts: all **733** `quest-search.json` mission records produced the identical SHA-256 digest to their canonical complete record in one of 32 `quest-shards/part-XX.json` files. The entire original catalogue still contains 1,030 native Mission records, including the 289 group definitions and 8 unclassified definitions. Browser retrieval requires the user to select the correct shard and uses the byte-level source/provenance contract from DB-03.

The Steam v1.26.2 Guide originals and real GetBattlePasses season snapshots remain unprovided; do not treat these v1.26.1 definitions as confirmed current state. Browser bundling, SvelteKit prerender and accessibility should be tested in CI. The overall Guide source completeness remains PARTIAL.
