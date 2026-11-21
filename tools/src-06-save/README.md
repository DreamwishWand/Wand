# SRC-06 SAVE DATA — local read-only evidence

Standalone Windows Python 3.10+ tool. No dependencies, networking, decryptor, Writer, or engine integration. All code is confined to this directory.

## Windows commands

In PowerShell, from the repository root:

```powershell
py -3 tools/src-06-save/scan.py --game-root "D:\Games\Disney Dreamlight Valley" --out "$env:LOCALAPPDATA\WandSrc06\static-001"
```

The game folder can instead point to your locally extracted `dump.cs`/C# metadata folder. To scan a separately provided save **only if it is already JSON**:

```powershell
py -3 tools/src-06-save/scan.py --save "D:\Private\DDV\decoded-save.json" --out "$env:LOCALAPPDATA\WandSrc06\save-001" --platform steam-windows
```

To inspect both simultaneously:

```powershell
& tools/src-06-save/run.ps1 -GameRoot "D:\Games\Disney Dreamlight Valley" -Save "D:\Private\DDV\decoded-save.json" -Out "$env:LOCALAPPDATA\WandSrc06\combined-001"
```

`--build-id` adds an **operator declaration** (not a verified Build ID); use the exact string if available. Omit it if unknown. Each `--out` must be a **new nonexistent directory**, outside the save directory and game root. An original encrypted/packed save can be selected: its format will be reported as `unknown_or_encoded_container`, without attempting decryption. Never rename an encrypted file to `.json` to imply it is decoded.

## Output (local only)

- `manifest.json`: provenance separation, platform/Build declarations, status and denial flags
- `static-types.json` (when game provided): Unity file indicators and conservative C# type/field candidates
- `save-structure.json` (when save provided): safe, aggregate JSON structural paths and unknown-key buckets
- `rust-type-candidates.json`: `serde_json::Value` placeholders and observed JSON types, not authoritative Rust types
- `version-matrix.json`: **historical** source registry candidates for schema 624/626, not validated current compatibility

All reports intentionally exclude save scalar values, raw strings, original account identifiers, save hashes, absolute input paths, and unknown raw field names. Numeric map keys are collapsed into `{id}`. Large array elements share a `[]` path. Unknown field names are collapsed into `{redacted}`. Reports **still may reveal structural information**; keep them private and inspect before sharing. Do not publish output or add actual save data to Git.

The scanner verifies a bounded **lexical JSON structure**, not strict UTF-8 for all string values, duplicate keys, external Build provenance, P1G decryption, reference closure, valid ownership, or any form of round-trip / Writer safety. Results do not authorize edits, DLC ownership changes, receipts, premium currency edits, or production integration.

C# regex candidates are not proof of their on-disk save representation. IL2CPP binaries are detected by filename, not decoded. Export a `dump.cs` from your own legitimately obtained game installation using your preferred local tools before scanning if you need richer type candidates. False positives remain possible.

Legacy Rust evidence: [`product_session.rs`](https://github.com/DreamwishWand/web/blob/main/crates/ddv-save-core/src/product_session.rs), [`strict_document.rs`](https://github.com/DreamwishWand/web/blob/main/crates/ddv-save-core/src/strict_document.rs), [`indexed_read.rs`](https://github.com/DreamwishWand/web/blob/main/crates/ddv-save-core/src/indexed_read.rs). The version registry includes legacy Switch schema 624 candidate and exact schema 626 Switch/Steam candidates, none of which confer Writer permissions.

## Tests

```powershell
py -3 -m unittest discover -s tools/src-06-save/tests -v
```

These are synthetic-only tests; actual Windows paths/game data are not available in CI or the development runtime. No genuine save was read for this deliverable. The output `validation.status` remains `REPORT_ONLY`.