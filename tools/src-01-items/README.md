# SRC-01 ITEMS — local Windows extraction preparation

Requires Python 3.10 or newer. No third-party Python packages, internet access, game writes, or Unity decoding are required. All generated output stays in the explicitly selected local directory. Run from the \`Wand\` repository root in PowerShell.

## 1. Survey actual game / extracted files (run this first)

\`\`\`powershell
py -3 tools/src-01-items/src01_items.py survey --input "D:\Games\Disney Dreamlight Valley" --out "D:\WandData\SRC-01\steam-survey" --platform Steam --game-version 1.26.1
\`\`\`

Switch extracted files can be inspected with the same command using a different \`--input\`, \`--out\` and \`--platform "Nintendo Switch"\`. Use \`--build-id\` only if verified. The tool does **not** infer a version from paths or filenames. If the exact game version is unknown, omit \`--game-version\`.

For a short trial, add \`--max-files 100\`. For subsequent runs, unchanged files reuse the \`inventory.jsonl\` cache based on size and modification time; use \`--no-resume\` for a fresh probe. SHA-256 is collected for files up to 8 MiB, adjustable through \`--hash-max-mb\`. JSON structure probing is also capped at 8 MiB (\`--probe-max-mb\`). This cache is a performance hint, not a cryptographic change detector.

Survey output: \`manifest.json\`, \`inventory.jsonl\`, \`report.json\`, \`unresolved.json\`. **No item data is invented** while raw game-file schemas remain unverified. JSON/CSV key listings and Unity filename tags are discovery hints, not validated mappings. ZIP files are listed without extraction. Nintendo Switch package formats and Unity binary formats are not parsed by this tool.

## 2. Export the verified existing Collection reference data

\`\`\`powershell
py -3 tools/src-01-items/src01_items.py from-collection --catalog "static\ddv\collection\v1.25" --out "D:\WandData\SRC-01\reference-v1.25"
\`\`\`

This verifies all 18 existing Collection shards against their stored byte lengths and SHA-256 hashes, then emits:

- \`items.jsonl\`: stable integer Item IDs, eight cleaned localized display names, existing category, state semantics, worlds, universes, expansions, source evidence; unverified \`internalIdentifier\` / \`subcategory\` are null, \`attributes\` is empty.
- \`manifest.json\`: exact source claim (Switch v1.25.0, Build ID), locale contract, per-shard checksums, import status.
- \`report.json\`: counts, missing locale names, possible same-name/multiple-ID cases.
- \`unresolved.json\`: explicit missing evidence and fields requiring original game data.

**Important:** This is an import of the already available Collection reference, **not** fresh extraction from game binaries. No new classification, DLC entitlement, quest acquisition source or image mapping is asserted.

## 3. Compare versioned exports by Item ID

\`\`\`powershell
py -3 tools/src-01-items/src01_items.py diff --old "D:\WandData\SRC-01\reference-v1.25\items.jsonl" --new "D:\WandData\SRC-01\other-version\items.jsonl" --out "D:\WandData\SRC-01\item-diff.json"
\`\`\`

Alternatively, add \`--compare-to "D:\WandData\SRC-01\previous\items.jsonl"\` to the \`from-collection\` invocation; this saves \`comparison.json\` in the export folder. Matching display names do not imply duplicate definitions; stable Item IDs are never automatically remapped.

## 4. Tests

\`\`\`powershell
py -3 -m unittest discover -s tools/src-01-items -p "test_*.py" -v
\`\`\`

## Schema and remaining gate

\`wand.src01.survey@1\` scans structure only. \`wand.item@1\` in \`items.jsonl\` is a reference record containing provenance and nullable, unverified fields. The final game-source parser is intentionally **not** implemented until the owner supplies the survey output or representative files verifying the source schema and localized string linkage. The full acceptance condition (reproducible extraction from actual game files) remains open until that parser is implemented and tested against real input.

Ownership/stock/source details belong to SRC-02/SRC-03. Media and game images belong to SRC-04. Collection UI is untouched. Run imports and extraction into separate, versioned output folders and never publish unverified game-asset content.
