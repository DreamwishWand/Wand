# DB-02 Native Tag evidence — exact Steam v1.26.2, private only

`Tag.json` was recovered from the owner's real Steam v1.26.2 game-source archive
under `ddv_Data/StreamingAssets/itemlist/Tag.json`. The full 38,824 bytes match
independent SRC-01 format-probe SHA-256
`bc537ad3278483cb6b64a344fa70f73dca7e66ff146b1e0d032e2f209ba813a4`.
The source was **not** merely inferred from the first 8192 bytes.

The public code's `extract_tag_evidence.py` validates complete source SHA,
SHA-pinned SRC-02 r5 manifest and its recipe/ingredient-member files, and
parses each native frame using SRC-01's canonical varint reader. A verified
Steam v1.26.1 IL2CPP `TagItemData` type supplies field names, while exact
Steam v1.26.2 original bytes supply **values**:

| field | meaning | treatment |
| --- | --- | --- |
| 1 | `ID` | source-exact numeric tag identity |
| 2 | `Name` | native raw tag key, **not** a translated localized name |
| 3 | `DisplayName` | localization key, **not** the user's on-screen text |

Source-backed results: **409** native TagItemData definitions. All **13**
recipe-selector Tag IDs and **21** unique ingredient-membership Tag IDs are
present in the original; their union has **32** distinct referenced Tag IDs.
This does not mean that all 409 tags are valid cooking categories. The
matching 13/21 sets are extracted from the separately pinned SRC-02 r5, not
from tag name heuristics.

```sh
python tools/src-02-acquisition/extract_tag_evidence.py \
  --tag OWNER_GAME/ddv_Data/StreamingAssets/itemlist/Tag.json \
  --src02 OWNER_PRIVATE/Steam-v1.26.2-ACQ-r5-current-condition-20261121 \
  --out OWNER_PRIVATE/Steam-v1.26.2-DB02-native-tag-evidence
```

This creates a **private** JSONL, manifest and report, refuses output inside
Git and never rewrites originals. To consume, use
`loadVerifiedNativeTagEvidence(manifestBytes, rowsBytes,
{expectedManifestSha256:<independently audited manifest SHA>})` with a
trusted hash from outside the selected payload. Each manifest and rows blob
is SHA-256 verified; inputs are bounded; IDs, frame offsets, full-row shape,
exact parent r5 provenance and reference counts are validated. Results are
immutable and read-only. All Source rows, native names, localization keys,
translated assets and game binaries remain **off public GitHub/Pages**.

Source-exact translated Tag labels are now provided by the separate private
8-locale supplement (`TAG-LOCALES.md`), backed by full SHA-verified original
Steam **v1.26.2** `LocDB_*` ZIP files and exact `Tag.locbin` key joins.
Native `Name` and `DisplayName` fields remain identity/key evidence only; the
separate locale overlay returns the independently verified translated text.
No live recipe eligibility, current inventory, DLC rights, or Collection
ownership can be inferred from this evidence.

The r5 SRC-02 snapshot and `LATEST.json` remain unchanged by this supplemental
Tag dictionary. Do not silently upgrade it to complete game coverage.