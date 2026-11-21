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
- Chest: `Player.ContainerInventories`, `BelongsToPlayer`, `ParentItemID`, `Size`, indexed slots, `ItemID`, `Amount` (legacy Steam 626 only).
- Collection: `Player.CollectionSets`, `CollectionDefinitionID`, `GroupData`, `GroupsCollectionItems` and saved `State`.
- World: `World.GridCollection.DiffGrids`, grid IDs, default layout references, saved modified/removed objects (legacy Steam 626 only).

- Appearance: `Player.AvatarIsMale`, male/female avatar, hair colors, saved clothing slots, incompatible clothes, makeup, eyeball and customization map. These are old scoped readset candidates, not generalized editing or proof of rights.

The existing Rust source scopes and limits remain authoritative for their own historical operations. The DB does not infer Item/Quest/World ID coverage, award eligibility or ownership, and does not relax the existing Writer permissions.

## Source integration

The JS/TypeScript adapter at src/lib/save/registry.mjs exports matchSaveBuild, inspectDecodedSave, borrowUntouchedDecodedSave, makeGameIdIndex, matchGameId and diffSaveWitnesses. The declarations are in registry.d.ts. The adapter consumes **strictly decoded** documents only; it is not a Codec.

The isolated Rust/WASM-compatible crate at crates/ddv-save-schema exposes typed BuildCandidate, DeclaredBuild, ReadOnlyAssessment and inspect_decoded. It borrows the decoded JSON object after legacy strict validation; there is no parser, decryption, SaveSession, Writer, save serialization or feature flag that would grant edits. Cargo verification command:

    cargo test --manifest-path crates/ddv-save-schema/Cargo.toml

Both JSON registries are recursively immutable when loaded by the JS adapter. The database never authorizes writes. A positive shape witness is neither a strict Codec proof nor an external Build proof.

## Read-only private SRC-06 handoff

Use only the private redacted SRC-06 save-structure.json, never a personal raw save. Run:

    python tools/db-05-save/ingest.py --structure /private/save-structure.json --out /private/new-db05-run

Optional SHA-pinned SRC-01 manifest verification and cross-version root witness diff:

    python tools/db-05-save/ingest.py --structure /private/save-structure.json --previous /private/old-save-structure.json --items /private/src01/items.jsonl --items-manifest /private/src01/manifest.json --out /private/new-db05-run

The output db05-private-summary.json is private. Store it in an owner-private Drive folder after review. This utility reports only four allowlisted root paths and redacts deeper paths. Source save files are never modified.

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
