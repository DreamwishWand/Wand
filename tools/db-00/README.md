# DB-00 — common game-data core

This code adds a versioned static game database. The existing SvelteKit Collection and its local user tracking remain supported. Supabase staging is intentionally not modified; account, community, and user-owned data stay outside this database.

## Baseline and source trust

- Public baseline: existing SHA-256-sharded static/ddv/collection/v1.25, Nintendo Switch game v1.25.0, build ID 52BD625D9B4E0053, 12,552 Collection records, eight locale positions.
- Private current extraction: SRC-01 Steam v1.26.2, 13,202 native items from four pinned categories only. The manifest.json and items.jsonl are in the private Drive SRC-01 ITEMS folder. Steam build ID remains unknown, localized names are unverified, and this dataset must not be made public.
- Private source inventory: SRC-00 Steam v1.26.2 scan, 22,281 files, under Drive SRC-00 SOURCE. Do not copy the source inventory, native item rows, source binaries, secrets, or unauthorized assets into GitHub.
- The two sets have different coverage scopes. Never interpret their counts as an added/deleted-item delta.

## Runtime contracts

src/lib/game-db/model.mjs owns these versioned schemas:

- wand.game-db.snapshot@1: immutable snapshot (id, target, coverage, sources, releases, items, publishable).
- wand.game-db.patch@1: per-Stream integration input (target, complete normalized items[], optional sources[] and releases[]). Conflicts are rejected, not overwritten.
- wand.game-db.release@1: SHA-256-verified public index and immutable items-000.json shards.
- wand.game-db.active@1: the single switching pointer. Old releases remain available.
- wand.game-db.diff@1: added, changed, reclassified, removed, oldOnlyUnverified and coverage comparability.

All Item IDs are canonical decimal strings, even when old Collection rows use numbers. Preserve IDs across versions. The eight locale keys (in order) are en, fr, it, de, es-ES, ja, zh-CN, pt-BR. Only source-verified localized labels belong in item.names; the native rawNameField is not an official label. Unknown game versions and build IDs are null, not guessed.

Each item includes id, names, nameStatus, category, subcategory, worlds, universes, contentIds, releaseIds, relations (referenced Item IDs), and sourceRefs. Every sourceRefs entry must resolve to a source record, every releaseId to a release, and every relation to an Item ID. A record can refer to multiple free updates, expansions, and adventure packs at once. Content pack IDs are not release IDs.

coverage.scope, coverage.complete, and coverage.categories control differential claims. Incompatible coverage produces comparable:false. When either snapshot is incomplete, removed is empty; unmatched old IDs go to oldOnlyUnverified. This prevents four-category SRC-01 extraction from falsely deleting old Collection records.

source.visibility is private or public_reference. Public output is forbidden while any source is private or any item nameStatus is unverified. Raw game bytes stay in Drive.

## Reproducible commands (Node 22+)

From the repository root:

    node tools/db-00/cli.mjs import-legacy --catalog static/ddv/collection/v1.25 --out /tmp/wand-legacy.json
    node tools/db-00/cli.mjs validate --snapshot /tmp/wand-legacy.json
    node tools/db-00/cli.mjs build --snapshot /tmp/wand-legacy.json --out /tmp/wand-release --public
    node tools/db-00/cli.mjs verify-build --dir /tmp/wand-release
    node tools/db-00/cli.mjs diff --old /tmp/wand-legacy.json --new /tmp/wand-legacy.json --out /tmp/wand-diff.json

Private SRC-01 handoff, run only where the two files are available:

    node tools/db-00/cli.mjs import-native --manifest /private/SRC-01/manifest.json --items /private/SRC-01/items.jsonl --out /private/db00-steam-1262.json

Never place private output in static/ or commit it. The native import verifies itemsSha256 against the input. It never synthesizes localized names.

Integrate a Stream patch using the structure from contracts/patch.example.json:

    node tools/db-00/cli.mjs merge --snapshot /private/baseline.json --patch /private/db01.patch.json --out /private/merged.json

Patch merging adds verified names, relations, release associations and formerly unknown classifications to existing IDs, preserving both source references. Conflicting values for an already verified locale or classification fail closed. Reconcile the evidence before merging.

To create a candidate pointer after a validated, publishable build:

    node tools/db-00/cli.mjs activate --dir /tmp/wand-release --path ddv/game-db/releases/legacy-switch-1.25.0/index.json --out /tmp/next-active.json

This writes a candidate only; it does not change the active pointer or deploy. Archive the previous active JSON and immutable release, deploy new shards first, then change static/ddv/game-db/active.json. Roll back by restoring the previous pointer without deleting historical data.

## SvelteKit

src/lib/game-db/client.mjs exports loadCurrentGameDatabase(base, fetchImpl), loadActiveCollectionRuntime(base, fetchImpl), and loadActivePointer(base, fetchImpl). The client checks pointer, immutable release-index digest, every shard byte length and SHA-256, and all Item ID references.

The existing Collection page now loads through loadActiveCollectionRuntime. Today's pointer references the existing public legacy corpus, leaving its UI and numeric local Item IDs unchanged. A future db_snapshot pointer is adapted to the Collection view while local entries stay intact. SvelteKit base paths are supported.

## Minimum handoff for DB-01..05 and SRC-04

Provide a wand.game-db.patch@1 with exact platform, gameVersion, buildId (null if unknown), source manifest SHA-256, stable numeric-string Item IDs, a public/private source ledger, and verified fields only. Do not invent names, categories, release dates, ownership, images, or build IDs. Media references are content-addressed approved URLs and digests, not Unity asset binaries.

Retain the private source manifest in Drive, record its version and SHA-256, and compare only to a compatible baseline. Keep old snapshots and release assets. Switch active.json only after verify-build and SvelteKit tests.

## Verification

npm test covers actual 12,552-record import, deterministic repeat builds, digest verification, comparable same-version diff, browser fetch simulation, referential integrity, multi-release records, partial-coverage semantics, and the non-public native import gate. Existing .github/workflows/collection.yml runs these tests on pull requests; no duplicate QA workflow is introduced.

## SRC-00 original source registration

The SRC-00 source inventory is never committed. Where its source-manifest.json and source-report.json are available, register a small private provenance record:

    node tools/db-00/cli.mjs register-source --manifest /private/SRC-00/source-manifest.json --report /private/SRC-00/source-report.json --out /private/source-registration.json

Registration requires a completed error-free scan, one SHA-256 per source file, and a valid dataset fingerprint. It computes the source manifest and report SHA-256 without copying any original file list into the record. Version and build ID come only from the SRC-00 evidence states. For the currently verified Steam v1.26.2 scan the build ID is null (unconfirmed).

Published release builds also emit a separate SHA-pinned inverted search index for each of the eight game locales. The SvelteKit client can retrieve one via loadCurrentSearchIndex(base, locale, fetchImpl). The legacy Collection remains searchable through its already-published runtime.

## Private DB-01 SQLite v2 → DB-00 ingester (no duplicated parser)

DB-01 owns extraction, SQLite v2 and the typed, SHA-checking TypeScript shard client. DB-00 now supplies only an offline adapter that reuses the existing src/lib/items/index.ts and src/lib/items/db00-join.ts rather than parsing SQLite a second time. Run on the audited owner's private, extracted DB-01 v2 shard directory; do not commit either the inputs or output.

    node --experimental-strip-types tools/db-00/import-db01-v2.mjs \
      --shards /owner/private/db01-v2/private-shards \
      --audit /owner/private/db01-v2/private-v2-identity-audit.json \
      --expected-manifest-sha256 <independently pinned manifest digest> \
      --expected-sqlite-sha256 <independently pinned SQLite digest> \
      --expected-source-items-sha256 <original verified DB-01 JSONL digest> \
      --out /owner/private/db00-steam-1262-<digest>.json

All three expected SHA arguments are required. Obtain them from the owner's separately trusted release ledger; hashes stored inside the same untrusted bundle do not establish independent authenticity. The adapter checks the v2 schema, immutable private-release audit, manifest, four original Item categories through the existing SHA-checking TypeScript client, exact current localized names, and the number of unclassified definitions excluded. It refuses overwrite, output into Git, symlinked shard files and corrupted assets.

The current Steam 1.26.2 audit records 33,627 native definitions, 13,202 four-class Item IDs, 20,425 unclassified definitions and 557 SHA-pinned private shards. The output has 13,202 Item records with only genuinely verified current names (some item records may have no names); it NEVER turns unrelated mission/condition/guide records into collection items or converts 103,064 historical locale candidates into current names. It preserves both original native-manifest and DB-01 compiled-manifest SHA provenance, an unknown build ID (null), and publishable:false. It does not modify static/ddv/game-db/active.json.

Important: the adapter targets the same four-category original game files as DB-01; other DB Streams own acquisition, quest, world and save facts, and DB-00 must not reinterpret their category identities. Normalized private snapshot data is an integration input, not a public Collection release. A new game version needs a separately audited private DB-01 v2 release; never reuse the old manifest/SHA pins across updates.


## SHA-256 verified paged reader for UI virtualization

For a scroll-driven SvelteKit Collection, import
`openCurrentGameDatabasePages` from `src/lib/game-db/client.mjs`.
The API fetches the small active pointer and its **SHA-pinned immutable release index** first; it does **not** fetch the 13,202 item records at startup. Use `loadPage({offset,limit})` when an IntersectionObserver requests the next slice (limit 1–500), and continue at `nextOffset` until `done` is true. A page crossing a 1000-item file boundary retrieves only the intersecting shards. Concurrent/adjacent requests share in-memory verified shard reads. A failed checksum is not cached.

This is **transport-level paging**, not game availability, player ownership, or completion proof. It validates every retrieved item and its release/source references but cannot establish global relational closure from shards not yet read. Keep using `loadCurrentGameDatabase` for full-snapshot validation and DB-01/DB-02/DB-03/DB-04/DB-05 validation where complete evidence is necessary. The immutable index's `coverage.complete` applies only to its declared categories, not every type of item in the game. For previous 1.25 legacy pointers with no seekable index the same API uses an explicitly `eager_legacy` fallback so rollback remains usable.

Example:

```js
const catalog = await openCurrentGameDatabasePages(base, fetch);
let offset = 0;
async function loadVisibleSlice() {
  const page = await catalog.loadPage({ offset, limit: 80 });
  appendItems(page.items); // your existing Svelte scroll state
  offset = page.nextOffset ?? catalog.itemCount;
  return !page.done;
}
```

Do not add a "Load more" button. Let the Collection UI schedule the next request from scroll intersection; this API intentionally does not dictate UI rendering or restore unsaved player data.

## Cross-stream target source fingerprint

`applyPatch` requires exact `platform`, `gameVersion`, `buildId` **and** `sourceSha256` equality between a patch and its base snapshot. A matching game version alone does not prove the source file set is the same, especially across Steam hotfixes and archived v1.26.1/v1.26.2 inputs. The shared target fingerprint is the release anchor; each DB-01/02/03/04/05 stream's own file/probe hashes belong in additional `patch.sources` records. Never replace the target fingerprint with a stream-specific file digest to bypass this gate.


## Cross-service typed Item ID and verified fact API

Use `openSharedGameDatabase(base, fetch, {includeHistoricalCandidates:true})` from `src/lib/game-db/integrated.ts` in Collection, Guide, Save, World, Decorate and other services. The active Steam release is loaded from the existing SHA-pinned public manifest; no per-user ZIP import is needed. `getItem(itemId)` returns verified names, a display-only current category hint, and typed `facts` for category, subcategory, worlds, universes, DLC, acquisition, star paths, events, media, world regions and save references. `coverage()` reports verified, explicitly not-applicable, unverified, not-covered and historical-candidate counts over the exact current Item ID set.

The current public Steam 1.26.2 source has **13,202 items** and **zero verified worlds/universes/DLC semantic assignments**. Their empty arrays are `unverified`, **not** verified absence. The public coarse category label is not promoted to verified semantic category because its source declares `semanticCategoriesVerified:false`.

The optional Switch 1.25.0 history is joined by exact Item ID but remains under `historical`, marked `historical_candidate` with its distinct platform/version/build. No historical assignment can overwrite or verify a Steam fact.

Source-domain streams can contribute only independently SHA-256-pinned `verifyFactOverlay(bytes, expectedSha256)` payloads. `attachOverlay` rejects mismatched platform/gameVersion/buildId/sourceManifestSHA, duplicate IDs, conflicting facts, and violations of field ownership: DB-01 item properties and scope, DB-02 acquisition, DB-03 events/star paths, DB-04 world regions, DB-05 static save references, SRC-04 media. A verified empty list requires explicit `emptyVerified:true`, and a confirmed non-applicable fact requires `absenceVerified:true`; missing facts remain `not_covered` or `unverified`. Source stream extraction is not reimplemented here. Private facts are **not automatically made public** by being bound to a UI object; release publication remains a separate approval step.

The legacy `model.mjs` and `client.mjs` backend remain in service during their subsequent typed TypeScript migration; the new cross-service API itself is fully typed and independently tested. The active pointer is not modified by this change.


**Independent original-source pins:** The trusted application must pass `verifiedOriginalSourcePins` to `openSharedGameDatabase`, keyed by stream (DB-01..05/SRC-04) and containing source SHA-256 values verified against an independent release/source ledger. Overlay bytes must *also* pass `verifyFactOverlay(bytes, independentlyTrustedOverlaySha256)`. Either hash check failing blocks insertion. The overlay's own `sourceSha256` is not accepted as a self-authenticating proof. Without independently pinned originals the API remains read-only over the SHA-verified public DB and optional historical candidates.


### Shared facet searches (not Collection-only)
Use the same already-verified `SharedGameDatabase` instance across Guide,
Gallery, World Editor, Collection and Save consumers. `db.getItems(ids)` preserves
requested Item ID order with explicit `null` for unrepresented IDs;
`db.queryItems(filters,{offset,limit})` supplies bounded (1–500) pages and
full matching counts. All filters combine with AND, each multi-value filter
can choose `match: 'any' | 'all'`; arrays support multiple worlds, universes,
DLCs and events without collapsing links to one value. The reverse index is
cached and invalidated after verified current or historical updates.

A current verified world filter is
`{scope:'current',field:'worlds',values:['IsDreamlightValley']}`. Missing
classification cannot match this filter: use
`{scope:'current',field:'worlds',state:'unverified'}` to find items requiring
current-source verification. To **explicitly inspect** older Switch candidates
instead, use
`{scope:'historical_candidate',field:'worlds',values:['IsDreamlightValley']}`.
These sources never merge implicitly and no missing or empty array is treated
as a verified negative answer. Results contain the same per-field source/version
and original verification status as `getItem`.

The loader copies validated source rows into immutable records, so UI mutation
cannot silently alter source-backed facts or search indexes. No private source
data, save file or live entitlement information is exposed by these queries.


### Source-aware facet summaries for every service

Use `db.summarizeFacet({scope:'current',field:'worlds'}, filters)` to build
World selectors from the same validated matching Item IDs as `queryItems`.
The result contains `matchedItems`, a complete `states` count for
`verified`, `unverified`, `not_covered`, and `not_applicable`, and
a `values` list of `{value,itemCount}` entries. Multi-valued relationships
count each Item ID at most once for a value. Values are sorted by descending
Item count then lexical key. An empty verified array does not create a
fabricated "none" selector option. The `media` field is excluded from text
facet aggregation.

`db.summarizeFacet({scope:'historical_candidate',field:'worlds'}, filters)`
is explicitly different: it returns `candidateItems`,
`missingCandidates` and historical candidate values, without marking them
as current-version facts. Supported historical facets are category, worlds,
universes and DLC. Both APIs accept the identical AND / any / all filter
semantics of the shared search API. No extra Collection-specific index or
private original game-data publication is necessary.

Steam v1.26.2's public snapshot currently has no source-verified native
World membership, so a current-world summary intentionally returns an empty
`values` array and `unverified` counts until the owning DB-01 stream
supplies independently verified current-source overlays. Prior Switch
Collection classifications must not be silently promoted into them.

### Cross-service source join (source-specific evidence, no UI membership inference)

\`joinCurrentGameSources(db, {origins, rewards, nativeScope, nativeScopePins})\`
in \`src/lib/game-db/source-join.ts\` reuses existing DB-02 \`OriginDatabase\`,
DB-03 SHA-pinned \`GuideRewardIndex\`, and DB-04 private
\`Db04NativeItemScopeClient\`. The DB-00 input must be the exact published
Steam 1.26.2 13,202-item release. DB-04 requires separately trusted audit
and row hashes even after the owning stream has validated its bytes.
All source inputs are optional; absent input returns \`null\` or
\`not_loaded\`, **not a verified negative**. Out-of-scope Item IDs stay
explicitly outside the published catalog while optional Guide/DB-02 evidence
may still resolve. \`byNativeWorldTag\` joins native tag reverse-index IDs
without classifying them as Collection UI worlds. No new source extraction,
private file publication, DLC/entitlement or player-state assumptions.


### Public-only, one-call cross-service Item ID API (Steam 1.26.2)

Use \`openPublicSharedGameSources('/Wand')\` from
\`src/lib/game-db/public-sources.ts\` on GitHub Pages, or pass a compatible
fetcher for local tests. It calls the existing source-pinned DB-00 ItemList,
DB-02 public origin catalog (Star Path, Quest, Event, Friendship, two native
Shop captures and IAP), and DB-03 Star Path reward index. No owner-private
game files or Save imports are required.

The returned object exposes \`getItem(id)\`, \`getItems(ids)\`,
\`queryItems(filters, page)\`, \`summarizeFacet(request, filters)\` and the
underlying \`database\`, \`joined\`, \`acquisition\` and \`guide\` readers.
Items outside the 13,202 published ItemList scope may still carry a
DB-02/03 reward route, but have \`catalog: null\`. Source tag evidence is
\`not_loaded\` (no owner-private DB-04 file) and current world/universe
membership remains \`unverified\`, never guessed from the old Switch version.
Online name-only matches stay in the DB-02 candidate API, not confirmed
ItemOrigin links. Static reward/offer configuration does not prove live
availability, redemption, entitlement or personal ownership.

The first-party readers continue to validate their own pinned bytes.
One response-cloning, per-invocation fetch cache deduplicates identical
concurrent GETs, including the 14 ItemList shards and Star Path cache. The
cache is discarded after each call so a later active pointer is freshly read.
Synthetic/local-asset tests assert **23 unique public fetches**, the published
Steam ItemList and 1,255 source routes, and corrupt-public-data rejection.


### Optional owner-local DB-01/DB-04 joins (never auto-fetch private data)

\`joinLocalGameSources(publicSources, {db01, expectedDb01SourceItemsSha256,
nativeScope, nativeScopePins})\` in \`src/lib/game-db/local-sources.ts\`
accepts existing SHA-checked local readers, not raw or publicly hosted
game files. DB-01's complete Steam 1.26.2 native 39,067-definition
\`Db01SharedItemClient\` can provide original types, raw Tags and
CollectionSet predicate candidates. DB-04's 13,202-item native source
reader may also be attached with **independently trusted** audit/rows
SHA-256 values. Both sources are optional individually, but at least one
must be supplied. A DB-01 source-items SHA-256 must always be provided
independently (not copied from its client).

\`getItem\`, \`getItems\`, \`queryPublishedItems\` and \`byNativeWorldTag\`
return local-only original evidence beside the existing DB-00/02/03
public data. Published ItemList IDs must match the DB-01 native identity
exactly, and when both DB-01 original Tag evidence and DB-04 source
Tags are available, direct World Tag disagreements fail closed. Native
types and CollectionSet candidates are **not** runtime screen
categories/subcategories or DLC ownership. The returned private read
model is not publishable, and the public DB-00 verified-fact index is
never silently modified. No local private bytes are uploaded.


### Public Item ID/name and acquisition-origin search

\`openPublicSharedGameSources('/Wand').searchItems({locale, text, originKinds,
routeStatus, starPathSeasonId, offset, limit})\` searches the current published
13,202 Steam ItemList definitions without any owner-private source files.
The locale-specific text query matches original published names (Unicode
NFKC/case-normalized) or an Item ID prefix. \`originKinds\` limits results to
**exact source ItemOrigin links**, with separate
\`confirmed_source_link\` / \`static_candidate_only\` filtering. It does not
treat name-only Twitch/Code/Premium Shop campaign candidates as proven Item
links. \`starPathSeasonId\` uses only the pinned DB-03 source-configured primary
rewards, never premium-access currency or unawarded Vault alternatives.

Results paginate *after* applying all requested constraints, sorted by
numeric Item ID, and contain the original linked source evidence with explicit
\`sourceCoverageComplete:false\`, \`liveAvailabilityVerified:false\` and
\`playerOwnershipVerified:false\`. Premium Shop matching means an Item ID was
present in an observed source offer, **not** today's sale, personal ownership
or price. World/Universe/DLC UI membership is not inferred. Published scope
does not claim to enumerate every native game definition.


### Source-native static container templates (DB-02, Steam 1.26.2)

The public and optional owner-local Item ID readers now attach the SHA-pinned
DB-02 \`staticContainerSource\` to DB-00's \`getItem(id)\` and \`getItems(ids)\`
via \`staticContainerCandidates\`. These are **146 configured source slots in
88 original container definitions (115 distinct Item IDs)**. Their original
\`loot\` origin kind and \`static_candidate_only\` status are retained in a
**separate array**: they are not added to the existing 1,255 general
\`origins\`, nor inferred to be actual chest contents, guaranteed drops,
live player storage, instantiation, current availability or ownership.

\`staticContainerCandidates === null\` means the source was not supplied;
\`[]\` means no slot in the loaded source. The shared public API always supplies
the verified DB-02 static source, and
\`searchItems({staticContainerCandidate:true})\` restricts to those source
candidates **within the current published 13,202 Item IDs**. Out-of-ItemList
IDs remain reachable through direct \`getItem(id)\`. This is independent of
\`originKinds:['loot']\`, which continues to mean only the conventional DB-02
origin ledger.

The new evidence is not attached to the verified DB-00 \`worlds\`,
\`universes\`, \`dlc\` or \`acquisition\` fact state. Source-side SHA-256 checking
must succeed, and fabricated copies of the source reader are rejected.


### Source-pinned Quest objective Item references

The public DB-00 loader uses DB-03's existing SHA-pinned 1.26.2
\`public-quest-target-reverse\` index: **4,897 original target-candidate
occurrences for 2,551 Item IDs, across 627 source Quests**. The already-loaded
public Quest catalogue HTTP response is reused by DB-02, so only the target
projection adds a network asset. The DB-03 reader independently verifies both
the complete Quest catalogue and the original target projection SHA-256.

\`getItem(id).questTargetCandidates\` retains each original Quest ID, step
position, and \`direct\` versus \`alternative\` role; null means this optional
reader was absent and [] means no source record. The same source is retained
when owner-local DB-01/DB-04 readers are attached. For public ItemList results,
\`searchItems({questTargetCandidate:true})\`, \`searchItems({questTargetQuestId})\`
and \`searchItems({questTargetRole:'direct'|'alternative'})\` support
cross-service lookup with ordinary filters and post-filter pagination.

**Original static objective references are only candidates**. Neither direct
nor alternative roles establish that an item is a mandatory quest requirement,
currently accessible, collected, consumed or completed by a player. These
relations never alter the verified DB-00 category, World, DLC or acquisition
facts. Out-of-ItemList source IDs are not fabricated into Collection membership;
they can still be read through direct \`getItem\` by their Item ID.


### Pinned native default-inventory templates

DB-00 now includes DB-02's SHA-256-verified \`Meta.DefaultInventories\`
source as distinct \`getItem(id).configuredDefaultInventoryCandidates\`:
**289 entries / 288 Item IDs / 15 original inventory groups**, including
Backpack, HomeStorage, Wardrobe, Decals and others. The source is included
in public and owner-local joins without loading private saves.

\`searchItems({configuredDefaultInventoryCandidate:true})\` filters the
published 13,202-Item subset. For native group-level queries, use
\`searchItems({configuredDefaultInventoryGroup:'Wardrobe'})\` (also combine
with names, quest targets or source origin filters). As with other readers,
\`null\` means the source was not supplied and \`[]\` means no recorded
entry. Outside-published-scope IDs remain queryable through direct
\`getItem(id)\`.

Configured default records do **not** prove initial grants, actual storage
contents, player ownership, DLC entitlements or any runtime quantity.
Configured amounts are preserved, never treated as owned stacks. They are
**not merged** into the existing DB-02 acquisition \`origins\` ledger or
into verified DB-00 Collection facts.


### Source-authenticated Event ↔ Quest / Duty / Scene navigation

\`openPublicSharedGameSources('/Wand').guideEvents\` combines four existing
SHA-pinned DB-03 Steam v1.26.2 public readers into one version-compatible
cross-service reference view. It exposes 23 user-facing Mini Events/Floating
Festivals (excluding internal \`TestEv\`), 62 static Event–Quest refs, 79
Event–Duty refs, 17 Festival scene/subscene refs and six expansion village-scene
refs. The already requested Quest catalogue and Event reward bytes are fetched
only once; this integration requires three additional public SHA-pinned files.

\`guideEvents.getEvent('mini_event', id)\` returns source metadata plus its
Quest, Duty and Scene links. Reverse lookups
\`getQuestEvents(questId)\`, \`getDutyEvents(dutyId)\` and
\`getSceneReferences(sceneId)\` let Save, Guide and World consumers navigate
the same native IDs. \`getExpansionScene(expansionId)\` provides source
expansion-to-scene evidence without inferring DLC ownership.

Every result is **static original configuration**. No reference establishes
an event is currently active, a quest is mandatory/unlocked/completed, a
Duty is fulfilled, a Scene belongs to a verified World/accessible location,
or an expansion is owned. This API neither edits saves nor publishes private
game originals.


### Public source-linked Item IDs outside the published ItemList

The verified Steam 1.26.2 DB-00 ItemList has **13,202 published definitions**.
DB-02 acquisition references and DB-03 Star Path / Mission targets can
identify original numeric Item IDs **outside** that published scope. These
are NOT invented Collection items; the original full owner-local DB-01
39,067-definition catalogue is never uploaded or exposed here.

Call \`openPublicSharedGameSources(...).searchOutsideSourceItems(request)\`
to discover these otherwise hidden **positive-source-linked ID references**
separately from the published \`searchItems\` API. Results carry
\`scope:'source_linked_outside_published_itemlist'\`,
\`item.catalogStatus:'outside_published_item_scope'\`, explicit
\`evidenceFamilies\`, stable numeric ID pagination and the exact source-joined
Item reference. Filter by \`idPrefix\`, any
\`evidenceFamilies:['acquisition_origin'|'static_container_template'|
'default_inventory_template'|'starpath_relation'|'quest_target_reference']\`,
\`originKinds\` and \`questTargetQuestId\`.

The index is built lazily **only from the already independently verified
DB-00/02/03 public readers**. It enumerates all 733 source Quest IDs to recover
4,897 source objective links rather than omitting Quest-only Item IDs. It adds
zero network requests and does not contaminate the published Collection
search. Absence from these indexed sources is **unknown coverage**, not
"does not exist" or "unobtainable"; a native source reference does not prove
game UI membership, ownership, actual Quest requirements, event availability,
or a confirmed grant. Every result explicitly sets
\`collectionUiMembershipVerified:false\`, \`playerOwnershipVerified:false\` and
\`sourceCoverageComplete:false\`.


### Official campaign reward names are *unverified* Item candidates

DB-02 already retains original official campaign publications and their
English reward names, including Twitch Drops and redeem codes. DB-00 now
attaches **unique exact published English-name matches** to
\`getItem(id).officialCampaignNameCandidates\`, with explicit
\`officialCampaignAcquisitionLinkVerified:false\`. The source is optional:
\`null\` means not loaded; \`[]\` means no uniquely matched official name.

\`searchItems({officialCampaignNameCandidate:true})\` locates the
published ItemList subset with source-name-only matches. Further narrow
by \`officialCampaignKind:'twitch_drop'|'redeem_code'|...\` or
\`officialCampaignId:'twitch:...'\`, with existing Item name, paging
and *independent* verified \`originKinds\` filters.

**Crucially, an exact English name is not a native Item-ID acquisition
link.** These candidates never enter DB-02 \`origins\` or
\`originKinds\`, or acquire an inferred grant, redeemed code, active
Twitch campaign, Premium Shop offer or player ownership status.
Unmatched/ambiguous official reward names stay available in the existing
DB-02 \`acquisition.nameCandidates.getCampaignRewardResolution(id)\`
reader rather than receiving invented Item IDs. Community Premium Shop
observations, prices, sale dates and weekly histories are **not**
projected into the DB-00 item candidate field or search index.
No additional network requests or private original data are involved.


### On-demand native Companion source categories

DB-02 now provides a 2-KB, SHA-256-pinned public projection of the
Steam 1.26.2 original \`PetItemData.Source\` enum field. DB-00 exposes it
via \`await openPublicSharedGameSources(...).loadNativeCompanionSources()\`.
Loading the ordinary DB-00 Item search still performs **no** extra request;
the native companion projection is fetched once only when this optional API
is called, and is shared with DB-02's own lazy reader.

The returned typed reader searches **134 companion Item IDs** by six native
source categories: \`quest\` (8), \`timebending\` (1), \`event\` (9),
\`star_path\` (7), \`premium_shop\` (95), and \`exclusive_promotion\`
(14). Use \`reader.search({category:'premium_shop',locale:'ja',text:'',
publishedOnly:true,offset:0,limit:100})\` to intersect those static
classifications with the **published** DB-00 ItemList. Omit
\`publishedOnly\` to retain native source IDs outside the 13,202 published
definitions. \`reader.getItem(id)\` returns both DB-02 classification and
the existing DB-00 source-joined Item record, without mutating either.

**Do not treat PetItemData.Source as a particular shop offer, Twitch
Drops campaign, redeem code, live availability, player acquisition, DLC
entitlement or Collection UI membership.** An unclassified source ID is
not a verified negative. No source classification is added to the DB-02
\`origins\` ledger. The owner-local original Companion.json, private
saves, shop sale dates and prices are never published by this integration.


### On-demand native Item OnlineCategory, nine source families

DB-02's SHA-pinned Steam 1.26.2 \`ItemData.OnlineCategory\` projection
is now available through
\`await openPublicSharedGameSources(...).loadNativeOnlineCategories()\`.
The original nine JSON source files and owner-private data are **not**
published. The **22,925-byte** projection is requested only if consumers
explicitly load this index, with DB-02's byte-verified loader reused and
cached; ordinary public DB-00 calls retain their existing request count.

The typed reader indexes **2,198 original category rows** across Furniture,
Clothing, Trimming, MountGear, Makeup, Tool, Character, Companion and Skin:
\`premium\` (1,830) and \`time_limited\` (368). Call
\`reader.search({family:'Furniture',category:'premium',locale:'ja',
publishedOnly:true,offset:0,limit:100})\` for source/native filters
intersected with the published DB-00 localized name and ItemList.
By default the native source Item IDs outside the 13,202 public ItemList
remain visible; these do **not** become verified Collection items.
\`reader.getItem(itemId)\` returns the DB-02 category and the existing
DB-00 Item join. An ID with no explicit classification has no evidence
in this projection, not proof of a never-online / nonpremium item.

**Native \`premium\` does not prove a specific Premium Shop sale;
\`time_limited\` does not prove Twitch Drops, campaign codes, expiry
dates or current availability.** These source categories never become
\`ItemOrigin\` entries, published world/DLC facts, player acquisitions,
shop offer identifiers, pricing or sale histories.
