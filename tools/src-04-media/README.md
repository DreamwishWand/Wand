# SRC-04 MEDIA: Steam v1.26.2 one-click workflow

**Recommended for the confirmed Windows Steam installation.** Download the [SRC04-MEDIA.cmd](SRC04-MEDIA.cmd) file from this development branch and double-click it. Python 3 with the Windows py launcher and initial internet access to install dependencies are required. **No local Git clone or manual path selection is required.**

The launcher downloads **one bundled start.ps1** (Raw URL with public GitHub Contents API fallback), then unpacks the embedded source files into %LOCALAPPDATA%\DreamwishWand\SRC-04\code without further GitHub source requests. It installs Pillow/UnityPy if needed, and uses:

- Input: C:\Program Files (x86)\Steam\steamapps\common\Disney Dreamlight Valley (read-only).
- Local output (automatically created): %USERPROFILE%\Documents\DreamwishWand\SRC-04 MEDIA\Steam-v1.26.2.
- Two SRC-00 pinned bundles for smoke testing, followed by all **40** generated-icon bundles (approximately 625 MB of bundle input). No full 22,281-file extraction.
- The existing SRC-01 steam1262.py parser, verifying four known protobuf itemlists and the game version; 13,202 Item IDs and their native GUIDs. No replacement decoder.
- The focused SRC-00-derived source-index-1262.csv, pinning bundle filenames, byte sizes, and SHA-256 hashes.
- UnityPy's Sprite/Texture2D decoder for native source pixel dimensions and 128px/512px no-upscale WebP derivatives.
- Exact GUID matches only (asset's original serialized name or Unity AssetBundle container key), with common GUIDs mapped to multiple Item IDs. No fuzzy filename/name guessing.
- A bounded Addressables catalog structural probe (catalog JSON shape, binary headers and GUID byte offsets), persisted privately in evidence/catalog-probe.json. A GUID seen in binary data is not yet evidence of its precise Sprite binding.
- Incremental bundle checkpoints, resume, hash verification, corruption/resolution findings, and conflict rejection.
- Native manifests and reports: manifest-native.json, report-native.json. Both use publicationApproved=false.

When Google Drive for Desktop syncs an **existing** exact Dreamwish Wand/Development/Sources/SRC-04 MEDIA folder under a standard My Drive root, the launcher copies only the manifest/report/catalog-probe JSONs there. It never copies game images or source binaries to Drive or GitHub. If that sync folder does not exist, it keeps the reports locally and says so.

**Observed Steam v1.26.2 result (2026-11-21):** the user-provided native report confirms 40/40 bundles, 23,021 decoded images, zero decode failures, and 9,542 as-yet-unmapped GUIDs. The catalog probe shows all 9,542 GUID strings in both `catalog.keyData.bin` and `catalog.InternalIds.bin`, but mere presence does not prove the GUID-to-Sprite relation. The additional read-only `catalog_link.py` tool decodes GUID keys through bucket and entry tables to inspect exact internal IDs and only accepts exact equality with Unity container paths. The public Wand media interface still does not expose private derived images.

**No image re-extraction needed for catalog analysis:** download the `SRC04-Catalog-Link.zip` package (or run the repository's Python script) and execute:

    py -3 tools/src-04-media/catalog_link.py --game "C:\Program Files (x86)\Steam\steamapps\common\Disney Dreamlight Valley" --out "%USERPROFILE%\Documents\DreamwishWand\SRC-04 MEDIA\Steam-v1.26.2"

The linked catalog is verified against the four SHA-256 digests recorded in the submitted `catalog-probe.json`. Outputs are `catalog-link-report.json` (small diagnostic evidence) and `catalog-links-private.json` (local unpublished exact matches). If the target catalog has changed, this command fails closed rather than mixing incompatible sources. No UnityPy, Pillow, bundle scanning, PNG/WebP conversion, upload, or publication is performed. Upload only `catalog-link-report.json` for follow-up analysis.

For sample only, run start.ps1 with -SampleOnly. To preserve full-resolution source pixels separately when larger than 512px, use start.ps1 -KeepOriginals; the standard double-click run generates thumbnail/detail only.

Synthetic checks:

    py -3 -m unittest discover -s tools/src-04-media -p "test_*.py" -v
    node --test tests/media-artwork.test.mjs

## Catalog dependency evidence (2026-11-21)

The user-provided catalog-dependency-report.json confirms all 9,542 SRC-01 icon GUIDs have valid catalog keys and 239 dependency groups. 9,182 GUIDs resolve to one of 24 extracted generated-icon bundles; the remaining 360 refer to other groups. No GUID-to-image identity links have been verified. A shared AssetBundle is not proof of any particular image identity.

The generated icon bundles contain 21,209 candidate images: furniture contains 4,750 related GUIDs, clothing 2,026, and requestitem 1,004. Neither bundle order nor similar image names may be used to assign item IDs. Existing 23,021 decoded images remain intact; no repeat pixel extraction is required.

Next targeted local diagnostic is serialized AssetBundle.m_Container / UnityPy Environment.container metadata for four small bundles, using an exact GUID key and exact (assets_file, path_id) pointer to establish any image identity. Standalone SRC04-IDENTITY.cmd was supplied for the Windows operator; empirical result is still pending. Never upload or publish the derived game images. Keep publicationApproved=false.

## SRC-04 identity resolution revision 2 (2026-11-21)

The user-supplied catalog-identity-report.json validated four generated-icon bundles:

- AssetBundle container keys: 331 entries, 113 unique catalog-scoped item GUIDs, 1 GUID-to-image link retained by the old algorithm.
- 56 Sprite and 56 Texture2D objects in accessory; 11+11 in buffelixir; 82 Sprite and 83 Texture2D in fish; 16+16 in wallpaper.
- Each normal GUID has *two different exact Unity path IDs* (Sprite and Texture2D). The original probe falsely treated these class-distinct pointers as conflicting identities.

**Fix:** `catalog_identity_probe.py` revision 2 resolves distinct object classes under the same exact GUID. It chooses the Sprite image for display when one exists, otherwise the single Texture2D, and records both object identities when paired. Multiple distinct Sprites or multiple distinct Texture2D objects still fail closed. The tool never substitutes bundle order, names, image appearance, or platform/version labels for an exact serialized object ID.

The Windows standalone runner [SRC04-IDENTITY-V2.cmd](SRC04-IDENTITY-V2.cmd) invokes the read-only metadata probe on all **24 catalog-linked extracted icon bundles**, ordered by checkpoint image count. It does **not** re-decode pixels or modify game files. The runner emits `catalog-identity-report.json` (diagnostic, shareable) and `catalog-identity-links-private.json` (unpublished local GUID-to-image mapping), plus `catalog-identity-v2-console.log`. Results are flushed after each inspected bundle. It preserves all source image data from the previously finished 40-bundle extraction.

Run only the v2 CMD; do not rerun the full media extraction. For verification, upload `catalog-identity-report.json`. The expected final mapping count has **not** been confirmed on Windows; the synthetic tests (7) pass. Never publish unverified identities or derived images. All outputs retain `publicationApproved=false`.

---

## Remaining 360 GUIDs: targeted source-location audit

The missing set has 360 GUIDs affecting 2,416 Item IDs. A single placeholder-like shared GUID is used by 2,028 items, mostly quest/furniture definitions; its role is NOT asserted as a confirmed placeholder until traced. Other unresolved entries include 348 Trimming items (wallpaper/flooring) and a handful of clothing definitions.

The separate `catalog_missing_probe.py` utility reads only the installed SHA-pinned Addressables catalog, previously completed SRC-01 item cache, and the `catalog-identity-links-private.json` identity map. It follows GUID key -> catalog entry -> dependency group -> exact bundle location. It writes `catalog-missing-report.json`, containing candidate source group names, counted GUIDs, and metadata-only locations. No icon decoding, file uploads, or game asset changes.

Exact reference is NOT a verified image identity; do not fill the 360 gaps from colocation alone. Source SHA mismatch aborts and asks for a new source snapshot instead of mixing versions.

On Windows the operator can run the one-click `SRC04-MISSING.cmd` (standalone embedded Python, no ZIP or network) against the existing Steam-v1.26.2 output directory. Upload ONLY `catalog-missing-report.json`, or the saved `catalog-missing-console.log` if it fails. Do not rerun the completed 40-bundle extraction.

---
## Private SRC-04 to DB-01 media overlay (2026-11-21)

The complete privately joined SRC-04 Item ID map has now been exported into **256 content-hashed ID buckets** with a SHA-256 manifest, without copying image bytes to GitHub. The verified snapshot has **13,202 native items; 10,786 exact image links; 2,416 unresolved items; 9,182 unique resolved GUIDs; 360 unresolved GUIDs**.

Implemented code:

- `tools/src-04-media/export_private_overlay.py`: source- and join-hash checked, fail-closed, Python-standard-library exporter; no overwrite, no output inside Git repositories, no guessed mappings.
- `src/lib/items/media-overlay.ts`: private-only TypeScript DB-01 read adapter. Lazy one-ID-bucket loading, SHA-256 byte verification, exact DB-01 `verifiedIconGuid` correspondence, explicit unresolved status. It returns local provenance paths, not public URLs. Optional `readVerifiedImage()` checks the image bytes against their pinned hashes before use. No publish/deploy/save-write actions.
- `tools/src-04-media/test_export_private_overlay.py` and `src/lib/items/media-overlay.test.mjs`: synthetic tests for lazy loads, SHA mismatch, bad provenance/path, and public-activation rejection.

The operator-private package `SRC04-private-media-overlay-20261121.zip` contains manifest plus 256 shards, **no WebP, no raw Unity bundles, no original save data**. The archive is an evidence artifact, **not** a public static deployable. Never put the files in `static/` or a public repository. Media source platform/version values remain provenance-only; source item SHA and GUID are the identity checks.

To reproduce this snapshot from the exact private SRC-01 and SRC-04 files (outside a Git checkout):

    python tools/src-04-media/export_private_overlay.py --source-items /private/SRC-01/items.jsonl --source-manifest /private/SRC-01/manifest.json --map /private/SRC-04/SRC04-item-icon-map.jsonl --join-report /private/SRC-04/SRC04-item-icon-join-report.json --out /private/SRC-04/db01-media-overlay

Source images are still only on the owner PC. The output may be consumed by an explicitly provided local/private byte reader, but public media serving requires a separate rights, asset-byte integrity, and destination approval gate. Future updates must regenerate the exact source/manifest joins, never quietly reuse stale assets.

---
## Verified Item-ID join outcome (2026-11-21)

The full 9,182-GUID identity map was supplied and successfully joined with the original, SHA-verified 13,202-item SRC-01 JSONL dataset. Source file SHA-256: `3ff0043692c88699d1cb44f4a953095c5f5fcd1afd700761396f13cca96851bf`. Input identity map SHA-256: `401d3b0fd1c24ddad255b0948889ffceeb344e14fb16ca13c3952ee6a69a1172`.

- Exact GUID resolution: **9,182 / 9,542 = 96.23%**.
- Exact Item-ID icon coverage: **10,786 / 13,202 = 81.70%**. Unresolved: **2,416 Item IDs across 360 GUIDs**.
- Verified Item IDs: ActivityItem 3,680, Clothing 2,037, Furniture 5,052, Trimming 17.
- Unresolved Item IDs: ActivityItem 370, Clothing 4, Furniture 1,694, Trimming 348.
- One **shared unresolved GUID** (`04495f960b1edba4181ec51efa5e07d9`) is referenced by **2,028** Item IDs, so the number of missing Item IDs is not the number of distinct absent icons.
- 563 sampled GUID/image identities embedded in the 24-bundle diagnostic report match the full private mapping exactly.

The local item map was generated in both JSONL and a human-readable CSV, with a separate unresolved-GUID JSON and checksum-bearing join report. These outputs are **not checked into the public repository**. WebP paths refer to existing operator-local image files; their bytes have not been re-read or uploaded for this join. Keep `publicationApproved=false`. No fresh extraction is required.

The next discovery problem is the remaining 360 unique GUIDs, especially 348 unresolved Trimming Item IDs. Resolve by exact source relationships outside the existing 24 generated-icon bundles; do not infer mappings by image names, platform, or game-version labels.

---
## Final two GUIDs resolved — full Item-ID icon coverage (2026-11-21)

The owner-uploaded `catalog-last-two-report.json` (SHA-256 `2b482001fc2aea84c020f99f38661bb6fcac87909add82c2551be3ca50e222e8`) records **602/602 SHA-pinned bundles scanned** with zero errors, zero conflicting identity candidates, and both previously unresolved GUIDs recovered by exact `AssetBundle.m_Container` key plus local serialized `Texture2D` path ID. Both belong to `houses_assets_assets/playerhouse_cottageaviary_4c9e1e93.bundle`, source SHA-256 `6b9876d620aacb97e942d958d70b7103958bbb512f10f4d65e1677d45233299e`:

- `160000214` / `CottageAviaryHouseWallpaper!color01`: `c98d99e05824631469c50afe67b4d841`, path ID `-4079636770385994334`.
- `160100144` / `CottageAviaryHouseFloor!color01`: `db4746eaf4051004d901485113f0c812`, path ID `-6765701721341310771`.

The local report confirms both image objects decoded and states `sourceFilesModified=false`, `publicationApproved=false`, with **13,202/13,202 native Item IDs mapped**, **9,542/9,542 icon GUIDs mapped**, and zero unresolved items/GUIDs in this SRC-01 corpus. The final private item map `item-icon-map-final-private.jsonl` has operator-reported SHA-256 `80772618dad8ff8e26a581119c95cfb5a122499fd7252f9c163d9fe8da0a2cad`. The private 256-bucket `private-media-overlay-latest/manifest.json` has operator-reported SHA-256 `3e85aee5b34d7f20c7384fb5b2d83c21c33be83ec9f8ac3fffa807f72e98f5a0`. These are **local operator report claims**: neither complete private file nor image bytes were uploaded for independent verification.

The runtime-generated manifest deliberately keeps `coverage.complete=false` and `scope=four_native_item_categories_partial_icon_coverage` as conservative *broader media scope* metadata, even though `verifiedItems=totalItems=13202` and `unresolvedItems=unresolvedGuids=0` for this exact item-list corpus. The DB-01 consumer should expose a separate derived `itemIconCoverageComplete` boolean; never use the broad scope bit as an image publication permit.

A separate main-based integration PR (not part of this historical branch) adds the SHA-pinned private DB-01 media reader, tests, and a derived corpus coverage indicator. The public media resolver still requires explicit `publicationApproved=true`; no game-derived images have been deployed or public source data introduced.

---
## SRC-04 358-pixel recovery confirmed (2026-11-21)

The owner's `catalog-missing-pixels-report.json` is a **completed runtime report** with schema `wand.src04.missing-pixels@1`: `214/214` target bundles finished, `failedBundleCount=0`, 358 new exact GUIDs and 2,414 newly mapped Item IDs; 9,540/9,542 unique icon GUIDs and 13,200/13,202 Item IDs now verified (99.98% coverage), with 2 GUIDs / 2 Item IDs remaining. Existing decoded images were not replaced. The report asserts `sourceFilesModified=false`, `publicationApproved=false`, and a completed local `item-icon-map-extended-private.jsonl` with SHA-256 `6fc23756874818c66661d322221b38ccae5328ecbf398b890b934714e3968ca8`. The private file's bytes have NOT been uploaded here: that digest is an operator-runtime claim, not an independently rehashed attached artifact.

Unresolved exact source records (Steam 1.26.2, `Trimming.json`):

- Item ID `160000214`, `CottageAviaryHouseWallpaper!color01`, GUID `c98d99e05824631469c50afe67b4d841`.
- Item ID `160100144`, `CottageAviaryHouseFloor!color01`, GUID `db4746eaf4051004d901485113f0c812`.

Both GUIDs have an unusually broad catalog dependency group of 686 bundle *names*, which is not direct image identity. 602 SHA-pinned candidate bundle files were present in the supplied verified SRC-00 Steam source manifest (total approximately 2.44 GiB); 84 dependency names are absent from that local source manifest. The most distinctive available candidate is `ddv_Data/StreamingAssets/aa/win/houses_assets_assets/playerhouse_cottageaviary_4c9e1e93.bundle` (10,837,441 bytes; SHA-256 `6b9876d620aacb97e942d958d70b7103958bbb512f10f4d65e1677d45233299e`). This is a **priority search hypothesis**, not an inferred GUID->image match.

`SRC04-LAST-TWO.cmd` is a standalone local follow-up runner. It checks the exact previous runtime report, the already-completed 13,200-item private map hash and SRC-01 cache before touching output, then scans only Unity serialized metadata across the available candidates (prioritized house first) with per-bundle SHA-256 verification and resumable checkpoints. Only an exact unique GUID key -> local path ID -> single Sprite or Texture2D can authorize a new pixel decode. Global cross-bundle ambiguity fails closed. The runner creates a separate `item-icon-map-final-private.jsonl` only if at least one previously unresolved GUID is newly verified; it never modifies the old 13,200-row map or the preexisting 23,021 images. Diagnostic output is `catalog-last-two-report.json`. The same run also constructs a SHA-verified 256-shard DB-01-compatible `private-media-overlay-latest/` from whichever of the two private item maps is current, without copying image bytes. It reports the overlay manifest SHA-256 and private verified/unresolved Item-ID counts. All outputs remain private and `publicationApproved=false`.

**Current authoritative achieved coverage is 13,200/13,202**. Full coverage is not assumed until the last-two report proves it. No public media deployment is authorized.

---
## Missing GUID location audit and targeted object scan (2026-11-21)

The owner-provided `catalog-missing-report.json` (schema `wand.src04.missing-locations@1`) verifies that all **360** unresolved GUIDs have Addressables bundle dependencies; this is **not** evidence that those bundles contain displayable images. Of the **2,416** affected Item IDs:

- **346 distinct Trimming GUIDs / 348 items** refer mostly to individual wall/floor/material bundles. They may represent a Unity Material, scene object, texture, or other non-Sprite asset; do not automatically treat any matching texture as its official item icon.
- **14 other GUIDs / 2,068 items** include the shared `04495f960b1edba4181ec51efa5e07d9` GUID referenced by 2,028 Item IDs. Its location group includes `usedplaceholders_assets_all.bundle`; this suggests a shared placeholder or utility asset but is not independently proven.
- The report mentions **873 unique bundle filenames** because **two** GUIDs have dependency groups of **686** bundles. These are too broad to scan naively and are deferred.

`missing_plan.py` compiles the SHA-pinned *private* SRC-00 source inventory and the checked missing-location report to a narrow, deterministic `wand.src04.missing-object-plan@1`: **220 distinct primary AssetBundles covering 358 GUIDs**, with the 2 broad-dependency GUIDs explicitly skipped. The pinned bundle input sizes total **725,242,696 bytes**. Shader, MonoScript and other shared runtime dependency bundles are excluded only as *search-priority hints*; their existence does not prove or disprove item-image identity. The tool does not extract images.

Run locally with private source inventory (outside the repository):

```bash
python tools/src-04-media/missing_plan.py --missing /private/catalog-missing-report.json --source-manifest /private/src00/source-manifest.json --out /private/src04/missing-object-plan.json
```

A one-click Windows CMD derived from the completed private plan is supplied to the owner separately, with SHA-256 pins and UnityPy read-only container inspection. It records exact GUID-bearing serialized container keys and local object *types* (e.g. Sprite, Material, GameObject), without reading/decoding pixel arrays, producing `catalog-missing-object-report.json` and resumable per-bundle checkpoints. **The result remains a diagnostic**: a matching Material, dependency group, or scene object must not be silently converted into a verified icon mapping or published to the live website. No new verified item-icon count is claimed pending the user's runtime report.

---

## SRC-04 missing-object metadata audit (2026-11-21)

The user-supplied `catalog-missing-object-report.json` is a completed, SHA-verified local metadata scan of **220 / 220** planned AssetBundles, with **zero failed bundles**. All **360** previously unresolved icon GUIDs are accounted for: **358** have an exact serialized AssetBundle key -> local Unity path_id -> image object link; **2** belong to broad dependency groups and remain unscanned. Exactly **344** image GUIDs point to `Texture2D` alone, while **14** point to both a `Sprite` and a `Texture2D`. These are metadata identities, **not decoded or byte-verified WebP images**.

The 358 exact identities occur in **214** of the inspected bundles; six inspected bundles contain no exact match needed for pixel decoding. They cover **2,414** of the currently unresolved **2,416** Item IDs, including the one placeholder GUID reused by **2,028** Item IDs. If all targeted pixels decode and are stored correctly, the combined private Item-ID icon coverage would become **13,200 / 13,202**, leaving two GUIDs and two Item IDs unresolved. This is a **projection** pending Windows pixel decoding, not a verified current result.

The local follow-up `SRC04-MISSING-PIXELS.cmd` produced outside the GitHub tree accepts only the exact uploaded report SHA-256 `b97deb80a60315e2734fa7193f92922626a16195453b8c180fa0743684ae7807` and the SRC-01 item cache SHA-256 `3ff0043692c88699d1cb44f4a953095c5f5fcd1afd700761396f13cca96851bf`. It attempts pixel extraction **only for the 358 exact objects from 214 SHA-pinned bundles**, validates source bundle hashes, checkpoints each bundle, writes thumbnail/detail WebP into the existing local content-addressed layout without replacing previous content, and writes `catalog-missing-pixels-report.json` plus `catalog-missing-pixels-links-private.json`. On completion it also attempts a separate `item-icon-map-extended-private.jsonl` from the exact original identity mapping, without overwriting the previous JSONL or private overlay.

Keep every derived image and GUID image record local/private (`publicationApproved=false`). No repo image commit, cloud upload, public Pages display, or API publication is implied. The other two GUIDs remain unresolved until more selective evidence exists.

---

## Confirmed GUID image identity coverage (2026-11-21)

The user's complete `catalog-identity-report.json` from revision 2 confirms:

- `processedBundleCount=targetBundleCount=24`; `totalVerifiedUniqueGuids=9,182` of 9,542 unique SRC-01 icon GUIDs (96.23%); 360 GUIDs have references outside the 24 generated-icon bundles.
- All 9,182 verified GUIDs have exact Unity `AssetBundle.m_Container` keys and matching checkpoint `path_id`s; 9,130 are Sprite-backed and 52 Texture2D-only; zero missing object pointers, ambiguous GUIDs, cross-bundle conflicts, errors, or warnings.
- The 23,021-image extraction was already complete and need not be repeated. The 24 identity-scanned bundles contain 21,209 decoded Sprite/Texture2D objects, not necessarily the same number of distinct icons.
- **The shared report is not the complete 9,182-row mapping**: `verifiedGuidToImage` is intentionally truncated to at most 40 examples per bundle. The full mapping is saved locally at `catalog-identity-links-private.json`; do not infer complete item mappings from report examples.

`join_item_icons.py` now implements the exact GUID -> Item ID join using the existing SRC-01 cache (`source-items/items.jsonl` plus SHA-256 manifest), the local full identity-links file, and its completed 24-bundle audit report. It does not read or modify game files or PNG/WebP images. The script validates all 9,182 identities and verifies that the reports and source cache match. It writes `item-icon-map-private.jsonl` (all 13,202 Item IDs, exact image refs or explicit unresolved), `item-icon-unresolved-private.json` (unresolved GUID list + associated Item IDs) and `item-icon-join-report.json` (counts and source checksums). All outputs are private and `publicationApproved=false`.

Run against the existing output directory without re-extraction:

    py -3 tools/src-04-media/join_item_icons.py --out "%USERPROFILE%\Documents\DreamwishWand\SRC-04 MEDIA\Steam-v1.26.2"

The source game-version and platform labels are carried as provenance only, never used as the mapping identity or compatibility key. New icon bundles in future source builds should be selected by verified structural provenance and source hashes rather than a platform label.

---
## Advanced manual workflow and historical R39 compatibility

Windows-compatible, local-only source image inspection and conversion for Dreamwish Wand. This tool never modifies the game's files, the site's static assets, GitHub Pages, or R2. The operator specifies an independent local output directory.

## Install (PowerShell, repository root)

    py -3 -m pip install -r tools/src-04-media/requirements.txt

To extract native Unity Sprite and Texture2D objects:

    py -3 -m pip install -r tools/src-04-media/requirements-unity.txt

## Initial small sample

Replace both example folders and the platform/version with the actual locally verified values.

Extract up to 20 images from up to two Unity containers:

    py -3 tools/src-04-media/media.py extract --input "C:\Games\Disney Dreamlight Valley" --output "D:\WandMedia" --platform "Steam Windows" --game-version "1.26.1" --limit-files 2 --limit-images 20

Inspect exported images, formats, real dimensions and SHA-256:

    py -3 tools/src-04-media/media.py scan --input "D:\WandMedia\extracted" --output "D:\WandMedia" --platform "Steam Windows" --game-version "1.26.1" --limit 20

Convert a small sample, even when no verified Item ID link exists yet:

    py -3 tools/src-04-media/media.py build --input "D:\WandMedia\extracted" --output "D:\WandMedia" --include-unmapped --limit 20

Merge the local reporting artifacts. The Collection catalog is optional:

    py -3 tools/src-04-media/media.py merge --output "D:\WandMedia" --catalog "static\ddv\collection\v1.25"

Inspect D:\WandMedia\report.json, manifest.json, and images\. A limited sample must report complete=false.

## Item ID provenance

The historical index at assets\ddv\r39 contains query-index.partNN fragments. Use --r39-index "assets\ddv\r39" during build. A link is accepted only if the local source image file's actual SHA-256 equals a source PNG SHA-256 from the verified R39 query-index; no filename/appearance/asset-name inference is used. Historical mapping provenance is Switch v1.24.13 and cannot establish cross-version parity by itself.

An optional UTF-8 mapping.csv can have the columns:

    item_id,source_sha256,asset_id,source_path,evidence

One selector (source_sha256, asset_id or source_path) must be present. Use Unity asset IDs recorded in evidence\unity-*.json for native mapping and attach the source evidence. Supplied mapping claims are explicitly recorded as unverified even if the evidence column is populated. The tool will not silently equate an asset path ID with an Item ID.

Example verified-byte-identity mapping build:

    py -3 tools/src-04-media/media.py build --input "D:\WandMedia\extracted" --output "D:\WandMedia" --r39-index "assets\ddv\r39" --mapping "D:\WandMedia\mapping.csv"

Omit --include-unmapped for normal matched-only generation. When the original image's hash differs from R39, the relation stays unknown unless another verified relationship is supplied.

## Shards and resuming

16 deterministic shards are selected by the first hex digit of the SHA-256 of the source-relative path. Only a single shard is processed with --shard 0 through --shard f; omit --shard for all shards. Run 0 to f separately for production conversion rather than one giant batch. Example for shard 0:

    py -3 tools/src-04-media/media.py scan --input "D:\WandMedia\extracted" --output "D:\WandMedia" --platform "Steam Windows" --game-version "1.26.1" --shard 0

    py -3 tools/src-04-media/media.py build --input "D:\WandMedia\extracted" --output "D:\WandMedia" --r39-index "assets\ddv\r39" --shard 0 --keep-originals

Repeat for shards 1 to f, then run merge again. Alternatively, the Windows driver runs the complete 16-shard scan/build/merge sequence, stopping on a failed shard:

    .\tools\src-04-media\run-shards.ps1 -SourceDirectory "D:\WandMedia\extracted" -OutputDirectory "D:\WandMedia" -Platform "Steam Windows" -GameVersion "1.26.1" -R39Index "assets\ddv\r39" -Catalog "static\ddv\collection\v1.25"

The PowerShell driver does not extract Unity bundles; run a bounded native extraction first and verify the results. Full conversion remains local. The inspect/build stage stores per-shard manifests. Unchanged derivatives are reused by source-content digest, transformation recipe and output size. Add --verify-existing to hash/check reused derivatives. If an input's SHA-256 changes, rerun scan for the affected shard; build refuses stale inventory. For Unity extraction, incomplete container indexes can be resumed by increasing --limit-images (for example 200) without overwriting completed PNGs. Native texture extraction can still fail for formats unsupported by UnityPy; failures are recorded, not concealed.

## Outputs

- inventory/shard-X.json: real file hashes, formats, dimensions, source platform/version/build and inspection statuses.
- evidence/unity-<container SHA>.json: Unity native asset filename, path ID, object class, container SHA and decoded PNG hashes, preserving source provenance.
- images/thumbnail/<prefix>/<source SHA>.webp: lossless, maximum 128 px edge, no upscaling.
- images/detail/<prefix>/<source SHA>.webp: lossless, maximum 512 px edge, no upscaling.
- images/original/<prefix>/<source SHA>.png: full original decoded pixel resolution, when --keep-originals and source maximum edge is greater than 512 px.
- manifest/shard-X.json and report/shard-X.json: per-shard mapping, failures, resolution shortfall, duplicates, unmapped images and source integrity findings.
- manifest.json and report.json: merged local results, catalog coverage and conflicting Item IDs. Conflicted IDs are withheld from the merged item lookup.

R39 images have a 160px maximum edge; they are not legitimate 512px sources. Different underlying assets can legitimately share one visual. Hash identity, object identity and Item ID are separate fields.

## Gates

All output manifests set publicationApproved=false. A successful local extraction is not permission to commit, publish, or upload copyrighted game images. Source images and derivatives must not be committed to the Wand repository without separate explicit authorization.

Run synthetic unit tests on Windows:

    py -3 -m unittest discover -s tools/src-04-media -p "test_*.py"
