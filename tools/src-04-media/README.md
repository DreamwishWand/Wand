# SRC-04 MEDIA

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
