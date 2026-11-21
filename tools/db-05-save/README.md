# DB-05 SAVE — read-only, versioned mapping

This is a **standalone schema contract**, not a replacement for the legacy DreamwishWand/web Rust P1G Codec, Worker/SaveSession, or Writer. There is no connected production Save Editor in the current DreamwishWand/Wand main branch. Keep DB-05 independent of concurrent DB-00 and SRC-06 branches until interfaces are merged.

## Verified and unverified evidence

- data/ddv/save/registry.v1.json registers historical Switch schema 624/626 and Steam schema 626 Build **candidates** from the old Rust Core. They are not independently verified against current game builds.
- Two Switch .profile files are labelled v626/v643; labels are filename-only evidence. The inspected Switch file named profile.json contains binary data, not JSON text. Do not infer a decoded structure from its extension.
- SRC-01 contains 13,202 native Steam v1.26.2 item IDs in four item families with a SHA-256-pinned manifest. This catalog provenance does not imply save-schema compatibility.
- Historical Rust structural evidence covers GameInfo.Version, GameInfo, Player, and World only. Inventory, Chest, Wardrobe, Appearance, Quest, Grid and World placement remain unresolved.
- All rights, ownership, Writer and export authorizations stay false. Unknown fields MUST be preserved using the original bytes, not by reconstructing a JSON object.


## Historical schema 626 field map (66 paths)

`data/ddv/save/legacy626-fields.v1.json` captures **66 source-code-supported field path candidates**, not a decoded-current-save survey. Every record is version 626 scoped, lists exact legacy build candidate(s), includes an original Rust file provenance, and sets `observedStatus=legacy_source_code_only` and `writable=false`. The mapping is also exported by `getLegacySaveFields()` in JS/TypeScript and `legacy_fields()` in Rust. Domains:

- Inventory: `Player.ListInventories` route IDs, `CompatibleItemType`, item IDs, `Amount`.
- Chest: `Player.ContainerInventories`, `BelongsToPlayer`, `ParentItemID`, `Size`, indexed slots, `ItemID`, `Amount` (source-backed Steam626 and exact scoped Switch626 paths; no generic Writer grant).
- Collection: `Player.CollectionSets`, `CollectionDefinitionID`, `GroupData`, `GroupsCollectionItems` and saved `State`.
- World: `World.GridCollection.DiffGrids`, grid IDs, default layout references, saved modified/removed objects (legacy Steam 626 only).

- Appearance: `Player.AvatarIsMale`, male/female avatar, hair colors, saved clothing slots, incompatible clothes, makeup, eyeball and customization map. These are old scoped readset candidates, not generalized editing or proof of rights.

17 historical ID-reference positions are annotated in the field map: 14 candidate Item ID positions with `catalog=DB-01`, plus CollectionDefinition, Grid and World Object IDs with **no catalog alignment**. The adapter exposes `getLegacySaveIdReferences(namespace?)`; Rust exposes the nested `LegacyIdReference` type. Every reference has `join=exact_numeric_only`, `currentCatalogCoverageVerified=false`. A saved grid ID is **not** automatically a DB-04 World ID; a Collection Definition is **not** a DB-03 Quest ID. No reference closure is claimed.

The existing Rust source scopes and limits remain authoritative for their own historical operations. The DB does not infer Item/Quest/World ID coverage, award eligibility or ownership, and does not relax the existing Writer permissions.

## Source integration

The JS/TypeScript adapter at src/lib/save/registry.mjs exports matchSaveBuild, inspectDecodedSave, borrowUntouchedDecodedSave, makeGameIdIndex, matchGameId and diffSaveWitnesses. The declarations are in registry.d.ts. The adapter consumes **strictly decoded** documents only; it is not a Codec.

The isolated Rust/WASM-compatible crate at crates/ddv-save-schema exposes typed BuildCandidate, DeclaredBuild, ReadOnlyAssessment and inspect_decoded. It borrows the decoded JSON object after legacy strict validation; there is no parser, decryption, SaveSession, Writer, save serialization or feature flag that would grant edits. Cargo verification command:

    cargo test --manifest-path crates/ddv-save-schema/Cargo.toml

Both JSON registries are recursively immutable when loaded by the JS adapter. The database never authorizes writes. A positive shape witness is neither a strict Codec proof nor an external Build proof.

## Compatibility policy — decoded structure first

**Ignore platform, game-version and Build-ID differences when classifying save-data structure.** Retain those identifiers only as provenance and historical regression evidence. A save's `GameInfo.Version` value is also observed metadata, not an equality gate. The Codec (outside DB-05) must still strictly decode the original save, and no shape observation alone authorizes writing.

`probeSaveStructure(decoded)` checks 66 known historical path candidates in five independently assessed domains: inventory, chests, collection, grids and appearance. It reports observed path counts, explicit type conflicts, missing/untested domains and bounded sampling. Missing optional fields are **not** treated as incompatible; conflicts in actually observed paths yield `shape_conflict`. The result is only `shape_candidate` or `sampled_candidate`, never an asserted full compatibility or Codec guarantee. Historical `builds` arrays document source evidence, not per-platform reader enablement.

`inspectDecodedSave(decoded, optionalBuild)` checks the required structural root (`GameInfo.Version` as unsigned integer, `Player` and `World` objects). It reports optional historical Build metadata without rejecting unregistered builds, newer save schema numbers or different platforms. The original object stays untouched. Decode/round-trip proof and Writer permission remain external.

`src/lib/save/db00-join.mjs` accepts any **validated DB-00 `wand.game-db.snapshot@1`** plus a decoded Save passing the root structure check. Its exact positive decimal Item-ID join intentionally does **not** compare catalog platform, release version or Build ID to the save. Missing IDs in a partial catalog remain `unresolved_in_partial_catalog`; an ID absent from a complete snapshot is `not_in_catalog_snapshot`. A catalog match does not imply historical availability, current native validity, entitlement, Save Codec safety or Writer authorization.

Keep DB-00's provenance/version fields for catalog accuracy, but never use them as hard gates for structural Save compatibility. Use explicit structural mismatch and external Codec/Writer safety checks as separate concerns.

## Read-only private SRC-06 handoff

Use only the private redacted SRC-06 save-structure.json, never a personal raw save. Run:

    python tools/db-05-save/ingest.py --structure /private/save-structure.json --out /private/new-db05-run

Optional SHA-pinned SRC-01 manifest verification and cross-version root witness diff:

    python tools/db-05-save/ingest.py --structure /private/save-structure.json --previous /private/old-save-structure.json --items /private/src01/items.jsonl --items-manifest /private/src01/manifest.json --out /private/new-db05-run

The output db05-private-summary.json is private. Store it in an owner-private Drive folder after review. The utility now recognizes the four legacy root fields plus 66 published Rust-source legacy schema-626 field paths, mapping numeric dictionary keys to their canonical placeholders (for example, /{id} to /{containerId}). It never emits the original dictionary key values, unknown field names, or other unrecognized paths; those are counted only. A cross-version comparison reports **observed witness differences**, not proof of native schema migration or deletion; SRC-06 scanner redaction, array/map coverage and player-specific structures can affect observed paths. Source save files are never modified.

## Synthetic tests

    node --test tests/save-schema.test.mjs
    python -m unittest discover -s tools/db-05-save -p 'test_*.py' -v

Real decoded-save validation, Rust compilation and production integration are separate, currently unverified gates.

## Remaining work (not silently authorized)

1. SRC-06 actual strictly decoded, redacted witnesses with exact Build provenance; never publish private save content.
2. Codec boundary for duplicate keys, UTF-8 and versioned Build admission.
3. DB-01/03/04 exact Item/Quest/World save reference path evidence, with an explicit source version; no heuristic ID remapping.
4. Deep inventory, chests, ownership, quantity, wardrobe, appearance, progress, placement and version-diff field maps.
5. Lossless unknown-field byte preservation and genuine fixture contract regression before any Writer feature can separately be admitted.

## Structural comparison — DB-05 read-only candidate witness

`compareSaveStructures(previous, current)` compares two decoded in-memory save objects. It **does not** compare Switch/Steam identifiers, Build IDs, `GameInfo.Version` values, item quantities, names, or other scalar save values.

The comparison returns `wand.db05.save-structure-comparison@1` with per-domain classifications: `same_known_field_shape`, `observed_shape_drift`, `structural_conflict`, `insufficient_evidence`, or `sampled_inconclusive`. The overall result may be `invalid_root` or `inconclusive`. Observed fields and differences contain only **public historical field templates and JSON type names**, never map-key identifiers, user-defined field names or save values.

All structural candidates are bounded to 66 **historical** Rust-backed field definitions. Missing optional fields are not automatically conflicts; malformed observed nested containers and JSON type changes are. Arrays/maps beyond the sampling limit yield inconclusive evidence, never full compatibility assertions. If two saves share the same known shape, they may still differ in unrecognized/new fields, Codec layout, DLC rights or required Writer semantics. Consequently these results are **read-only diagnostics**, not permission to re-encode, export or overwrite a save.

Example:
```js
import { compareSaveStructures } from './src/lib/save/registry.mjs';
// Inputs must already be decoded by an independently validated Codec:
const diagnostic = compareSaveStructures(decodedBefore, decodedAfter);
if (diagnostic.status === 'structural_conflict') {
  // Use the per-domain conflictingKnownPaths in a non-sensitive diagnostic.
}
```

