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

The existing P1G preview reports:
`Player.CollectionSets[].GroupData[].GroupsCollectionItems` **map keys**, and JSON value-type counts, without ownership semantics.

This is **not yet a verified owned/unowned/unlocked projection** and must **not** invoke the status import method.

Internal adapter `CollectionRuntime.applyMappedSaveStatuses()` accepts
`{schema:"wand.collection.mapped-save-status@1",entries:[{itemId:number,status:"owned"|"missing"|"unknown"}]}`
**only after** DB-05/native game-save inspection has established each mapped value's semantics. The Rust engine revalidates the payload, catalog ID, uniqueness and bounds before changing any record.

The adapter is already implemented and tested; automatic P1G-to-status application remains disabled until authoritative native semantics have been established. No change of save format or game version alone is treated as evidence of ownership or corruption.
