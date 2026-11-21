# DB-01 ⇄ DB-04 exact-original-source evidence (final SQLite + TypeScript)

**Scope:** read-only, owner-private, **static Furniture and Building definitions only**.
This is a production overlay, not an alternative catalog implementation. DB-01
retains its existing versioned SQLite v2 store, 33,627-row catalog and 557 read
shards; no full rebuild of those source assets is required.

## Why cross-version evidence is valid only for these two families

The independent Steam v1.26.2 SRC-01 game-file probe and the 33,627-record DB-01
SQLite identified original `itemlist/Furniture.json` and `itemlist/Building.json`
with full-file SHA-256 equal to the original Steam v1.26.1 files used by DB-04:

| Original itemlist source | Full original bytes SHA-256 |
| --- | --- |
| Furniture.json | `cde1b6e4dd37085e829c2e4548b89091bbf8d543cee92e6031b2f5bddc794196` |
| Building.json | `e8ee2f1637518b9f233c2e0b667493a44eee11ad5f137e182bc555f797c5f6e0` |

**Only those exact two original files are compatible across these two Steam versions.**
This does **not** establish version compatibility for GridData, SceneLayouts,
world graphs, player saves, live store availability, rights, collisions or
placement algorithms. `Condition.json` remains independently changed and is
never reused. `fullWorldHierarchyVerified` and `placementLegalityVerified`
are always `false`.

## Owner-private evidence build

`corroborate_world_objects.py` requires independent SHA-256 pins for both inputs.
It checks the original-file proof in the world archive's manifest, object-file
SHA, exact category/Item ID/native key/source path/unchanged source hash for
**every** current DB-01 Furniture/Building ID, the DB-01 SQLite integrity and
private schema, every native footprint's dimension/layer cardinality, and
source-label-key conflicts. Any incomplete/mismatched family fails closed.

```sh
python tools/db-01-items/corroborate_world_objects.py \
  --sqlite /private/db01/steam-1.26.2-v2.sqlite \
  --expected-sqlite-sha256 <independently-trusted-sha256> \
  --world-zip /private/db04/Steam-1.26.1-native-terrain-preview.zip \
  --expected-world-archive-sha256 <independently-trusted-sha256> \
  --out /private/db01/world-native-evidence
```

The output is a **separate**, private `wand.db01.db04-native-evidence@1`
manifest and 256 SHA-256-bound, ID-mod-256 lightweight shards. Each row contains
exact ID, native key, game-defined localization key, original source SHA, and
optional source-derived footprint dimension/flags metadata, **not** complete
cell masks or collision/placement permission. It must not be published or put
under the application's `static/` folder. The original DB-04 `objects.json`
is never rewritten.

## Actual private source result, 2026-11-21

- DB-01 SQLite: **33,627** current Steam v1.26.2 definitions.
- Owner-private DB-04 input: Steam v1.26.1 native terrain preview ZIP,
  source archive SHA-256 `44283ce354dc7f230e1a33489bf8b4f5c3ae44144600dca26b3df634d6577c88`.
- Source-exact joins: **7,224 of 7,224**, comprising 6,746 Furniture and 478 Building.
- Cross-family ID/native-key/source SHA differences: **zero**.
- Source-defined game localization keys recovered for DB-01: **6,746 Furniture**.
  Building's 478 keys already exist in DB-01 and match.
- Validated footprint dimensions: **7,140** (6,746 Furniture + 394 Building).
  **84** Building records have no native `GridAreaData` footprint; none invented.
- The native level's full `layerValues` remains only in private DB-04; the
  compact overlay contains a SHA-256 of the exact integer list, not a new
  collision/placement algorithm.
- Exact localization *keys* are **not translated display names**. Current
  verified eight-language `LocDB` names have not been extended by this join.

## Final TypeScript runtime interface

`src/lib/items/db04-evidence.ts` accepts the existing `Db01CatalogClient`,
**raw manifest bytes** and an external independently trusted SHA-256 of those
bytes (plus independent archive and SQLite SHA). It never trusts a digest taken
solely from the provider's own manifest. The byte-pinned, owner-private loader
fetches only one small overlay shard for a relevant Item ID and verifies its SHA
before parsing; it independently validates the ID/category/native key and
original SHA against DB-01's verified source. Unavailable/unrelated IDs are
`null` and do not imply that the item is absent from the game.

The returned `localizationKeyRecoveredFromWorld` is a **provenance flag**,
not a localization translation. `placementLegalityVerified`,
`worldCoordinatesVerified`, `saveStateOrOwnershipVerified` and
`publicationAuthorized` are always false. No page or writer integration is
activated by this change. The production DB-04 module remains owned by DB-04.

## Tests

```sh
python -m unittest discover -s tools/db-01-items -p 'test_*.py' -v
node --experimental-strip-types --test src/lib/items/*.test.mjs
npm run check
```

The synthetic Python tests cover source mutation, missing IDs, provenance
collisions, malformed footprints, tampered zip ledger, unsafe output paths and
independent SHA pins. The TypeScript tests cover lazy loading, exact ID/source
checks, manifest and file SHA pins, no rights/placement promotion, and spoofed
shards. The private end-to-end test also performed 7,224 actual item lookups
against the Steam source-corroborated preview and the live v2 DB-01 shards.