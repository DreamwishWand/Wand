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
