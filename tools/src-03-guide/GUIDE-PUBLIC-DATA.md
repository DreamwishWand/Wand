# DB-03 GUIDE — public quest information policy and release

## Owner decision (2026-11-22)

**Quest information is public-facing Guide data.** Being derived from a game file is not itself a reason for a Guide feature to require a private file or local import. The existing one-folder original-source ZIP remains an internal **verification/build input**, not the end-user distribution mechanism. Publish useful, extracted **quest names, IDs, characters, source update facets, steps, objectives, concise in-game objective instructions and configured static rewards** on the site, with source-version provenance.

The public route is **`/guide/quests/`**. It downloads the source-verified public catalog without requiring a Drive account, game installation, private archive, save data or local file selection. The original-source audit/development route remains `/guide/` for engineers and owner-only verification.

## Scope of the first public output

Steam v1.26.2 source-equivalent Guide data (the originally extracted Steam v1.26.1 Mission and all eight locale payload trees have been independently proven byte-identical between 1.26.1 and 1.26.2):

- 733 original searchable missions, 289 source quest groups and character labels, eight supported languages;
- 7,878 native quest steps, 11,782 native objective definitions, concise source text where available;
- source-typed objective kinds, original item/character IDs where represented, static configured friendship amounts when explicitly encoded;
- one ~400 KB public index, **eight SHA-256-pinned lazy JSON detail partitions** totaling ~5 MB, served as normal static files on GitHub Pages;
- the original source projection version (`1.26.1`) is retained in provenance alongside verified target Steam `1.26.2`, rather than rewriting old original metadata;
- 26 quests with absent source-localized names keep their original ID/internal name: missing names are never guessed.

Generator: [`guide_public_quests.py`](guide_public_quests.py). It reads the previously authenticated owner-original private search index, 32 detail shards, character/group catalogues and complete SHA-pinned shard audit. It verifies the original full-file hashes and complete native source counts before producing `static/guide/public/quest-index.json` and eight `quest-details-00..07.json` files. The browser revalidates the manifest and SHA-256 of each fetched detail partition; no account information or file uploads.

## Excluded from **public factual output**, not excluded from the Guide plan

- Raw Steam `itemlist` binary files, source archives, complete proprietary narrative/dialogue strings, and the 98 MB unfiltered owner-original detail shards: these are **not necessary for Guide users** and not part of this curated public dataset.
- Player saves, personal progress, access tokens, private account snapshots or DLC entitlements: these belong to private/account and Save Editor boundaries.
- Unverified live Star Path seasons, online events, inferred runtime prerequisites: never present static definitions as observed live state.

There is **no blanket rule** that all game-derived content must be hidden. The original full quest ZIP is kept as a build/provenance artifact; it is **not** the required path for players to use Guide. The generated text and names are rightsholder game content; source acknowledgement and a nonofficial fan-guide disclaimer remain visible. This engineering policy is not a claim of transfer of intellectual-property ownership.

## Rebuild the public release

```sh
python tools/src-03-guide/guide_public_quests.py \
  --search /private/Steam-v1.26.1/guide/quest-search.json \
  --audit /private/SRC-03/Steam-v1.26.2/guide-shards-friendship-audit.private.json \
  --characters /private/Steam-v1.26.1/guide/characters.json \
  --groups /private/Steam-v1.26.1/guide/quest-catalogue.json \
  --shards /private/Steam-v1.26.1/guide/quest-shards \
  --out /checkout/static/guide/public
```

Publication requires normal source-integrity review and successful GitHub CI. New game versions must be compared to their actual original source, not blindly relabelled.

## Quest links and browser history (2026-11-22)

The public Guide accepts `/guide/quests/?quest=<original-native-quest-id>` (with the deployment base path, such as `/Wand`). Only a single syntactically valid ID that exists in the **already validated 733-quest index** opens a detail partition. Unknown, malformed or repeated `quest` parameters are ignored; no unverified source is fetched for them. Clicking a quest updates the address, and browser Back/Forward restores the selected quest. The detail header offers a reusable direct link, enabling future Collection and Acquisition cross-links without exposing owner-private source bundles. These links refer to static quest definitions only, never to live availability, unlock truth, progress, ownership or account data. Source-free unit and Playwright browser regressions cover the link contract.
