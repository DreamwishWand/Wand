# DB-01 SQLite → TypeScript shard release gate

This is the **final source-to-consumer integrity gate**, not a game-data
publication command. It operates entirely on the owner's private local files,
uses the Python standard library, and works for later Steam versions supported
by the SQLite store. It does not implement a second browser API.

## One-shot flow

`tools/db-01-items/run-all.ps1` now runs the audit automatically **after**
`sqlite_store.py` builds the private SQLite database and `export_shards.py`
builds its immutable, versioned TypeScript read assets. The existing
`--expected-source-items-sha256` value comes from the private DB-01 compiler's
`manifest.json`, not from the untrusted shard manifest.

To verify an existing private release directly:

```sh
python tools/db-01-items/audit_shards.py \
  --sqlite /owner/private/db01-<fingerprint>.sqlite \
  --shards /owner/private/db01-<fingerprint>-shards \
  --expected-source-items-sha256 <64-lowercase-hex-source-JSONL-SHA> \
  --report /owner/private/db01-<fingerprint>-audit.json
```

For an independently pinned release, also pass
`--expected-sqlite-sha256 <64-lowercase-hex>` and/or
`--expected-manifest-sha256 <64-lowercase-hex>` from a **trusted private source**.
These pins defend against the database and asset manifest being substituted
together. Source SHA strings inside the same untrusted manifest are not a
cryptographic signature or independent trust anchor.

## Required acceptance evidence

The audit independently reconstructs the exact canonical JSON bytes expected
for **every** ID-bucket, category, current-locale and opt-in historical-locale
shard from the SQLite database. Each file must match the independently
reconstructed bytes **and** the shard manifest's path, byte count, row count
and SHA-256. The auditor also checks:

- SQLite structural integrity, foreign keys and private-only source contract.
- Game platform/version, source manifest and source item JSONL SHA consistency.
- Exact same ID/domain/category/provenance and source SHA throughout records.
- Only the four proven native classes are exposed as item definitions; no
  other class is silently promoted into collectible/ownership semantics.
- Current exact names agree *both ways* between source `record_json` and
  the SQLite `exact_name` index. No placeholder marker counts as a name.
- Historical candidate names remain separate, must not conflict with a verified
  current name, and are excluded entirely unless intentionally exported.
- All expected shard files are present; extra, stale or symlinked assets are
  rejected. Source input modifications during a running audit are rejected.
- Reports are private mode `0600`, never written inside the checkout or shard
  tree; reruns reuse an unchanged report, but reject a stale conflicting report.

A **PASS** report records the version, audited exact source and SQLite SHA-256
values, shard manifest SHA-256, files/definitions/current name/historical entry
counts, and whether source coverage is complete. For Steam v1.26.2,
`sourceCoverageComplete` **must remain `false`**: `Condition.json` and complete
current-language LocDB archives are unresolved. The audit does not claim to
resolve those missing originals or grant rights to deploy game-derived data.

## Release boundary

Publishing `static/ddv` files or enabling save writing is **not** part of this
command. The report is an owner-private verification artifact and must not be
treated as an authorization for public data disclosure. Retain source and
version-specific audit reports separately for the approximately eight-week
free-update cycle and annual expansions/adventure packs.