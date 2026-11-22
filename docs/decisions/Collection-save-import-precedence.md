# Collection: manual mode and save import precedence

Status: **confirmed owner decision** (2026-11-22). Applies to Dreamwish Wand (Disney Dreamlight Valley).

## User-facing contract

- Collection is fully usable with **no save selected**. Users can edit statuses manually in the active local workspace.
- Loading a save must not disable manual Collection editing. Users may still adjust statuses afterwards.
- When an importer can *verify* the meaning of a saved item's status, that saved value takes precedence over an earlier manual status for the **same catalog item**.
- Each new verified save import replaces the relevant previous statuses, including statuses edited after an earlier import. Manual editing between imports remains available.
- **Omitted, unrecognized, or unverified item IDs are not assumed to be missing.** Their existing manual statuses remain as-is.
- An explicit verified `unknown` status clears a previous manual status for that ID.
- Only fields actually verified by the save adapter may be overwritten. The current status-only adapter preserves manual favorite, quantity, and discovered metadata; further verified fields require a separately specified import contract.
- Edits affect the active local workspace only. Other workspaces, backup import/export and normal editing work without a save.
- Save import updates Wand's IndexedDB collection state, **not the DDV save file**.
- Import commits atomically through Rust/WASM and the existing IndexedDB compare-and-swap mechanism; concurrency conflicts must not silently overwrite another tab.

## Evidence boundary

The P1G preview reports:
`Player.CollectionSets[].GroupData[].GroupsCollectionItems` map keys and JSON value-type counts.

**Native finding:** Switch v1.24.13 and v1.25.0 directly establish that these map **boolean values are Collection discovery history**, with `false` explicitly saved for valid undiscovered candidates. This history is **NOT equivalent to owning a physical inventory item**, having an unlock entitlement or the game's own percentage.

For schema 643 (current Steam v1.26.2) and historical 624, the dedicated local Worker projects only exact boolean values into `{itemId,discovered}`. The current Steam executable was **not independently proven native-instruction-equivalent to Switch v1.25.0**. The support decision is limited to this established field with compatible structural shape; any non-boolean value, invalid key or conflicting true/false values across groups is excluded rather than guessed. Unknown schema versions are not imported automatically.

When a save is chosen the validated discovery projection is applied **automatically** to the active local workspace via Rust/WASM+IndexedDB. Its boolean flags override manual `discovered` values on matched catalog IDs; IDs missing from the save or the partial native catalog remain untouched. A later save overrides earlier manually edited discoveries. Users can still edit or clear their Collection state without a save. This does not overwrite manual `status`, `quantity`, or `favorite`.

**Important:** The discovery projection is not a verified `owned`/`missing`/`unlocked` projection and never invokes the status import method.

Internal adapter `CollectionRuntime.applyMappedSaveStatuses()` accepts
`{schema:"wand.collection.mapped-save-status@1",entries:[{itemId:number,status:"owned"|"missing"|"unknown"}]}`
**only after** DB-05/native game-save inspection has established each mapped value's semantics. The Rust engine revalidates the payload, catalog ID, uniqueness and bounds before changing any record.

The adapter is already implemented and tested; automatic P1G-to-status application remains disabled until authoritative native semantics have been established. No change of save format or game version alone is treated as evidence of ownership or corruption.

## Positive ListInventory ownership projection (2026-11-22)

A second **positive-only** import path reads exact Item ID map keys under
`Player.ListInventories/{role}/Inventory/{itemId}` **only when** the saved
`Amount` is a positive integer, and the saved role ID, compatible item type
descriptor and Item ID type prefix match the known native model. Initially
supports 12 of the 13 verified historical native roles:

| Saved inventory key | Role | Item type |
|---|---|---|
| 0 | Furniture (Catalog) | 4 |
| 1 | Clothing (Wardrobe) | 5 |
| 2 | ActivityItem (Pantry) | 3 |
| 3 | Makeup | 14 |
| 4 | Trimming | 16 |
| 5 | Building | 2 |
| 7 | Skin | 17 |
| 8 | BoardGame (Figurines) | 18 |
| 9 | AvatarFeature | 7 |
| 10 | PhotoMode | 19 |
| 11 | MountGear | 21 |
| 12 | Environment (EnvironmentFx) | 6 |

**Current publication coverage:** The approved Steam v1.26.2 DB-00 release
currently contains 13,202 items across only four Collection families:
`Source Activity Items` (4,050), `Furniture` (6,746),
`Clothing` (2,041) and `Wallpaper & Flooring` (365). The 12-role
reader is prepared for later verified DB-00 families, but only existing
catalog IDs are currently mutable. Native role 4 `Trimming` must map
to the published `Wallpaper & Flooring` family (and role 2
`ActivityItem` to `Source Activity Items`); native role names cannot
be compared directly to public UI family names. A public DB-00 ID still
must be present for any imported status.

**Intentionally excluded**: role 6 TouchOfMagic (type 10). Native
TouchOfMagic definitions include both collectible DecalItemData and
non-collectible TextureItemData. A type prefix and inventory role alone do
not prove that a specific ID is a normal Collection unlock; a concrete
source-definition predicate is required first.

The key-to-role map is a conservative *read-only projection guard* for the
historically cross-platform verified 0..12 role identities, not a general
inventory writer algorithm. Future schema versions and nonmatching roles
remain fail-closed rather than being silently reassigned.
Any other inventory, unknown role, invalid amount or incompatible type is
unverified and skipped; this does not touch physical backpack/chest slots.

**No negative ownership inference:** A map key with `Amount == 0` is valid
persistent native state, and a furniture item with zero available unplaced
stock may still have been unlocked or placed. Missing keys, missing roles and
items absent from a partial catalog cannot prove `missing` or `locked`.
Only exact positive rows that map to current public catalog entries are
promoted to `status:owned`; existing manual `missing` for those exact IDs is
overridden when a save is read. User-entered quantities and favorites are not
overwritten, because an available/unplaced-stock amount need not represent
the same abstract personal Collection quantity.

The local P1G Worker emits only `itemId` and verified role identity, never
raw Amount/Marker/other save payload fields. Import combines positive
ownership and separate discovery-history projection in **one atomic
Rust/WASM and IndexedDB transaction**, preserving all unrelated manual state.

Evidence comes from native Switch DDV v1.24.13/v1.25.0
`ListInventory.GetItemAmount`, `HasItem` and role-accessor comparisons,
plus observed save structures 624/643. Steam v1.26.2 native executable
semantic equivalence and full item definition variation/canonicalization
are NOT independently established; mappings with ambiguous routes are not
converted into negative statuses. No DDV save writer is enabled.

## Read-only world furniture references (2026-11-22)

The saved GridObject observation path reads:
- `World.GridCollection.Grids/{id}/Objects/{id}/ItemID` for full grid records;
- `World.GridCollection.DiffGrids/{id}/ModifiedObjects/{id}/ItemID`
  **only when the same object ID is NOT in `RemovedObjects`**.

It projects per-furniture Item ID bounded counts for these two distinct
source families. A DiffGrid is an *overlay* over native default grid source
data: unmodified default objects are not in the saved `ModifiedObjects`.
Therefore these counts are strictly **saved object references**, not full
effective placed counts. A modified record can also be a moved/modified
default-world object; it need not be a player-placed purchase. Full-grid
object references can equally represent world/quest/system objects. The
native game source (DB-04 default GridData) plus source/placement transaction
semantics are required before reporting total placements or owner inventory
reconciliation.

**Crucial safety invariant:** saved GridObject references NEVER set
`status:'owned'`, NEVER set `discovered`, and NEVER increment manual
`quantity`. They cannot make a zero `ListInventory.Amount` into negative
ownership evidence, and cannot confer DLC/unlock rights.

This projected snapshot remains ephemeral in the Svelte page and inspector:
not persisted in IndexedDB, not included in backups, no mutation of the
source P1G save. The local Worker exposes only `itemId`, bounded counts
and fixed diagnostics; no grid/object IDs, placement coordinates,
orientation, source flags, object states, or personal profile fields.

The evidence derives from native Switch v1.24.13 grid and inventory
transaction analysis and the structurally observed Steam v1.26.2 schema
643 paths. Exact current Steam-native executable parity and complete
DB-04 default-grid source joins remain unverified.

## Optional DB-04 exact-grid source join (2026-11-22)

Collection's read-only P1G preview now accepts an **optional separate local
Steam v1.26.2 DB-04 `package_snapshot.py` ZIP**. The existing DB-04 ZIP
reader verifies manifest-referenced SHA-256 for every included JSON member
and structural source evidence in an isolated, one-shot Worker. A second
strict P1G read occurs in that Worker: no decoded private profile, source ZIP
records, grid/object IDs or coordinates are returned to the page.

**Fail-closed join**: source `nativeGridCollection` layout ID must equal
the save grid's exact `GridDefaultLayoutPath`; a unique
`nativeGridEntries[].gridDataPath` must equal its `GridDataPath`; the
source's declared `defaultObjectCount` must exactly equal its extracted
`layoutObjectsByGrid` record count. A save-local Grid ID is never compared
or normalized to a native layout Grid ID. No filename suffix/ordinal/area
heuristics, automatic aliases or guessed source identity are used. Only
Steam v1.26.2 source metadata and observed schema 643 are admitted for this
specific optional analysis; an equal version number is **not source
authenticity proof**.

For each uniquely matched Grid, a full saved `Objects` map is the
materialized snapshot; a `DiffGrids[].ModifiedObjects` map instead
overlays the DB-04 default object map. In the latter case, exclude
`RemovedObjects` identities, then apply valid modifications/additions,
so an unmodified default reference remains visible and a stale removed
modified record is not counted. All object identities, map key agreements,
Item ID fields and source completeness are validated; ambiguous, partial
or structurally malformed grids are **excluded**, not treated as empty.

The join reports, by furniture Item ID, counts of native default source
records, matched-grid effective saved references, saved-only object
identities, removed native identities and changed native identities. It
also reports matched/unmatched grid counts. **This is not an ownership,
purchase, unlock or player-placement classifier.** An unmatched local
ZIP might lack whole regions; a validated ZIP is self-consistent but
cannot be authenticated as the original current game installation.
Even an apparently matching GridObject ID can have been repurposed.
The result therefore does not claim a global placed count, update
`status`, `quantity` or `discovered`, or change the P1G. It is held
ephemerally in the Collection UI, never in IndexedDB or backups.

Current DDV v1.26.2 real-save and exact current DB-04 original-source
pairing remains outside the public CI synthetic fixtures. Native default
coverage and per-grid route alignment must be verified on that original
input before making user ownership statements.
