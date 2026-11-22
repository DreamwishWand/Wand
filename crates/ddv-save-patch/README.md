# DB-05 SAVE — Rust existing-quantity patch draft

This independent crate provides a deliberately narrow **Rust-first JSON draft** for
two *already-existing* Save structures:

- Inventory: Player.ListInventories[inventoryId].Inventory[itemId].Amount
- Chest: Player.ContainerInventories[containerId].Inventory[slotIndex].Amount
  (requires the saved slot ItemID to equal the caller's expected item ID)

Both are synthetically tested against the DB-05 schema-643 observed field
templates, but this crate does **not** assert that every game save uses them.
It never inserts a new item, changes a container's slot count, clears a stack,
changes item identity, edits entitlement/quest/world state, or deletes data.
Missing or differently typed fields fail closed.

## Byte-preserving draft, NOT a P1G Writer

The parser walks JSON string bytes and rejects duplicate semantic object keys
(including differently escaped aliases), malformed syntax, malformed strings,
unsafe target quantities and unexpected target types. It locates the numeric
token under the **exact** target path, verifies the caller-supplied original
quantity (optimistic concurrency), and replaces **only that token** in memory.

Unknown keys/values, arbitrary additional fields, member ordering, whitespace,
string escapes and untouched number literals are never reserialized.
The caller's input is never modified. The resulting QuantityDraft explicitly
reports writer_authorized=false and export_authorized=false.

This operation provides a narrow *lexical preservation guarantee* only. It does
not verify the Save schema's semantic invariants or the validity of specific
quantity values. The independent strict P1G/JSON decoder, original ZIP envelope
handling, cryptographic repacking, provenance, game reload and genuinely
lossless full-save Writer are not implemented here. The only consumer today is
synthetic Rust regression tests; do not expose the draft to production save
downloads or claims of save safety. Save originals remain owner-private.

Run:

    cargo test --manifest-path crates/ddv-save-patch/Cargo.toml
    cargo build --manifest-path crates/ddv-save-patch/Cargo.toml --target wasm32-unknown-unknown --features wasm --release

The optional WASM exports have explicit "preview" names. They produce a
patched JSON string **inside the invoking execution context**, not a P1G save;
they must not be posted to UI diagnostics, external services, or logs.

## Remaining gates before any production Writer

1. Verify the legacy authoritative Rust P1G/ZIP Codec or implement a strictly
   equivalent Rust/WASM lossless Codec with independent real encrypted-save
   round-trip evidence and preservation of untouched ZIP metadata.
2. Tie requested changes to a local SaveSession and expected original bytes;
   validate item/catalog identities, quantity caps and slot semantics with
   real native evidence, including incomplete or user-modified saves.
3. Ensure all edits stay inside the Worker and all outputs require explicit
   user export. Never implicitly overwrite a supplied Save original.
4. Compare decoded before/after changes and repacked/decrypted round-trips.
   Verify against genuine private fixture copies; only anonymous counts
   and synthetic tests may enter GitHub.
