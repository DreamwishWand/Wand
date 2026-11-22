# DB-05 P1G — native Rust interoperability laboratory

This crate is a source-only, synthetic-fixture-first Rust implementation
of the game's existing AES-256-ECB + PKCS7 packaged-profile envelope and
single-profile ZIP layout. It does not add another JavaScript writer.

Scope:
- decrypt P1G locally, require exactly one ZIP entry called profile
- support stored (0) or raw deflate (8) entry
- reject multi-file ZIP, encryption flags, data descriptors, ZIP64, missing
  or malformed headers, inconsistent CRC/length and malformed JSON
- validate GameInfo.Version, Player and World roots without comparing a Steam
  or Switch build number
- no-op returns the exact original encrypted bytes (not recompressed)
- native-only opt-in laboratory function combines the existing Rust exact
  Amount-token patch with ZIP CRC/length updates and AES re-encryption
- immediately decrypt/reopen every generated synthetic candidate and compare
  the patched JSON bytes exactly
- keeps unknown JSON members/escaping/ordering/number formatting unchanged
  and preserves original ZIP header metadata, filename, extra and comment

Run:
    cargo test --manifest-path crates/ddv-p1g-codec/Cargo.toml --features native-p1g-lab

The native-p1g-lab feature is compiled OUT of the wasm32 target by design.
No browser UI, product save download, live Writer, save replacement, ownership
authorization or real-save validation exists in this feature.

This codec deliberately refuses archives other than a minimal supported
single-profile ZIP; this is not a claim that all Steam/Switch save envelopes
are identical. Input size cap: 128 MiB. Before product release, run the
private real profile specimens through decrypt/no-op/edited roundtrip and
independently verify exact ZIP metadata, game reloading, numeric field
representability (not the game's stack caps) and access restrictions. Never commit original saves, decrypted JSON,
identifiers, private report values, or generated patched P1G copies.

Pending:
1. independently compare this native Codec with the mature JS read-only
   reference and owner-private genuine Steam 1.26.2 and Switch structures
2. implement a Worker-only Rust/WASM SaveSession with bounded chunk transfers
3. preserve multi-entry ZIP or fail closed in all unsupported cases
4. validate real game engine acceptance and semantic inventory/chest invariants
5. expose a user-initiated export ONLY after completing the above gates

## Browser Worker integration (read-only; independent native audit)

With `--features wasm`, `WasmP1gAudit` accepts an encrypted P1G in
at most 1 MiB chunks, with a total limit of 32 MiB. It independently
decrypts, parses the supported single-profile ZIP and verifies its CRC,
strict JSON keys and required roots. It emits only the SHA-256 of the
original validated UTF-8 profile **to its calling Worker**, never to a
page component.

`src/lib/save/save-native-p1g-audit.mjs` compares this private digest
with the output of the existing independently validated JS P1G read Codec,
then destroys the digest and emits only a fixed anonymous status:
`matched`, `diverged`, `rejected_by_rust`, `skipped_large_save`, or
`unavailable`. The existing diagnostics workflow is not blocked if
the new Rust reader rejects an uncommon ZIP envelope already accepted by
the legacy JS Codec; the result remains read-only. Rust/WASM is **not**
yet a replacement for the complete multi-entry-capable JS reader.

No private fingerprint, decrypted bytes, item IDs, personal values,
or arbitrary native exception text cross the Worker/page boundary.
The Rust code zeroizes owned encrypted/decrypted buffers when released,
although this does not guarantee erasure of copies managed by the browser.

Build:
```sh
wasm-pack build crates/ddv-p1g-codec --release --target web --out-dir ../../src/lib/save/wasm/p1g-pkg --features wasm
```
CI separately executes a synthetic encrypted P1G upload in a real
Chromium Worker and verifies that the compiled WASM module loaded and
returned an independently matching decode. This is not a genuine
Steam/Switch game-save round-trip and cannot authorize exporting edits.


## Rust/WASM amount preview (still no Writer/export)

The WasmAmountPreview class is Worker-local and accepts either:
- json: plaintext .profile / .json UTF-8 root with GameInfo, Player and World
- p1g: existing AES/ZIP packaged profile in the supported single-entry layout

The Worker transfers chunks of at most 1 MiB, calls finish_open(),
then previews one exact existing Inventory or Chest Amount using the
pre-existing Rust lexical-edit scanner and an optimistic expected-old
quantity. No creation, deletion or change to item identity/slot layout.

The Rust operation validates the changed document and, for P1G, rebuilds
the archive, encrypts it and decrypts/reopens the candidate internally
to check exact profile bytes. All candidate bytes are discarded.
The Worker emits only a fixed boolean receipt without IDs, amounts,
plaintext, fingerprints or downloadable bytes.

src/routes/save/preview/ is an unlinked development-only test surface,
not the production editor. If WASM does not accept the save or the target,
the preview fails closed and does not claim edit safety.

Actual Steam v643 observation, private and not committed: a provided
Steam .profile source was directly valid JSON, not encrypted P1G.
Thus src/lib/save/save-diagnostics-worker-core.mjs resolves .profile,
.dat and .bin contents inside the Worker rather than assuming a ZIP
envelope from the filename. Other originals may remain encrypted.
The observation alone does not establish independent provenance of the
Steam build or game-accepted edits.

Remaining work: genuine real-game reimport/acceptance, multi-entry ZIP
handling, storage-integer safety (normal game caps are intentionally bypassed),
production ownership/session/revision
policy, intentional explicit export, and safe close/zeroization lifecycle
for actual large edit sessions.


## Explicit experimental edited-copy export (DB-05 follow-up)

The unlinked developer route \`/save/preview/\` now provides an **explicit,
two-step opt-in download** after a successful Rust/WASM inventory/chest amount
preview. The site never overwrites the selected original file; downloads use
a different \`.wand-edited.profile\` (or corresponding original extension)
name. This is a local-only experimental test copy, **not** a production
Writer or a claim of game acceptance.

Under the separate one-shot Worker \`export-existing-amount-copy\` command:
1. Reload the same selected original \`File\`, verifying the previewed
   target and values have not changed.
2. Independently parse the original in Rust; require the exact existing
   inventory entry or chest slot item and expected positive old Amount.
3. Byte-patch only the Amount token; preserve unknown properties,
   whitespace and original order. Revalidate the entire document.
4. For encrypted P1G, reconstruct ZIP and AES, then independently
   decrypt and reopen the generated candidate; compare patched profile
   bytes verbatim. Unrecognized ZIP layouts still fail closed.
5. With a separate confirmation, stream at most 1 MiB chunks from
   Rust/WASM to the Worker, which transfers one bounded \`Uint8Array\`
   to the page. The page creates a local Blob URL; only the user clicks
   its download link. Closing/resetting revokes the URL.

For now the exported test copy is capped at 32 MiB. An unchanged or
ambiguous quantity, missing item or invalid expected value cannot be
downloaded through this path. A one-shot Rust instance prevents
repeated output. Raw profiles/digests remain private except for the
**edited copy explicitly requested by the user**. There is no network
upload, automatic replacement or cloud persistence.

CI includes Chromium synthetic actual downloads for plaintext JSON and
encrypted P1G, independently reopens both outputs and confirms original
bytes/other fields were not modified.

Still to verify before general release: real Steam/Switch roundtrip,
save import into the game, actual over-cap decoration placement/reload,
unknown format
families, backup/restore UX and long-running multi-edit SaveSession.

## Deliberate quantity override requirement

Owner-confirmed policy: Wand must permit inventory and chest counts above
normal in-game limits, including changing a one-owned decoration to multiple
owned copies for more flexible decorating. Do **not** add item catalog maxima,
a global 99 limit, or clamping to game limits. Accept only structurally
representable, valid numeric values; the current Worker accepts positive u32
amounts. User-selected over-cap changes are intentional, not automatically
invalid or evidence of save corruption.

This does not prove that setting an Amount above 1 actually permits duplicate
placement: the game can maintain unique-ownership flags or placement state
elsewhere. Future editing must investigate and handle those mechanisms rather
than enforce the original game cap. Test game reload, placement of multiple
copies, save-and-reload persistence, and whether the inventory count is
normalized. See ddv-save-patch README for the normative policy.
