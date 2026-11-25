# SRC-05 LIVEOPS — local Shop collection

Requires Python 3.10+ (standard library only). Read-only ingestion of the Steam game’s already received `stores.dat` JSON envelope, including backups. No game network calls, credentials, save parsing, or game modification.

## Weekly workflow (PowerShell)

1. Open the Premium Shop normally in Steam DDV; close the game after the cache has been updated. Use the existing cache file or a copied archive. Do not change the system clock or game/account state.
2. Run from a Wand checkout. Keep the database and all exports outside Git (e.g. Documents or the private Drive folder). Use the actual source version if known, not the newest version for older backups.

```powershell
$tool = "tools/src-05-liveops/collect_shop.py"
$db = "$HOME/Documents/Wand-LiveOps/catalog.sqlite"
py -3 $tool --db $db ingest --cache "C:\path\to\stores.dat" --game-version 1.26.2
py -3 $tool --db $db summary
py -3 $tool --db $db export --out "$HOME/Documents/Wand-LiveOps/catalog-20261125.private.json"
```

For an archive, pass `--cache-root` pointing only to the cache archive directory; it selects `stores.dat*` and skips symlinks. Multiple `--cache` arguments work. Omit `--game-version` if the source version is unknown or mixed. Import runs incrementally; duplicate bytes do not add observations. An invalid file does not partially import, and other valid files in the batch still import. The CLI reports nonzero on any failure. Back up the closed SQLite database to private Drive.

## Integration

Private schema `wand.liveops.private-shop-catalog@1`: sources (SHA-256), snapshots (native metadata), offers keyed by exact native offer ID with exact native revisions, observations with category/store and source IDs, itemToOffers. Native offer payloads retain language, title, description, contents/quantity, prices where present, tags, image/background and layout adjustments. No invented values. Snapshot dates describe configuration, not necessarily an actual sale. Revisions are exact native payload hashes, so locale, price or metadata changes may create separate revisions. Observations do not certify a completed sale or live availability. Missing entries are not deletions.

SRC-04 may use native offer image fields for its existing resolver; DB-01 may use itemToOffers and exact contents after review. No independent Item DB. Public release is separate: use the existing reviewed price-free projection contract (`tools/src-02-acquisition/extract_shop_catalog_source.py`); never publish this private export, raw cache or SQLite file.

Historical completeness, older native static format, runtime recommendation/pinned formats, all-bundle server availability, and actual Steam client capture are not established by this collector. No direct server request or access-control bypass is implemented.

Tests: `python -m unittest discover -s tools/src-05-liveops -p "test_*.py"`.
