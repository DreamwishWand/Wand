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
