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
