# SRC-01 Steam v1.26.2 format probe (round 2)

The preceding Steam v1.26.2 extraction produced 13,202 native items with verified Item IDs from ActivityItem, Furniture, Clothing, and Trimming. Its eight-language names remain unverified. The new read-only `probe_formats.py` inspects binary structure for the remaining `itemlist/*.json` files and samples selected `*.locbin` entries from all eight `LocDB` archives. It makes no guessed semantic mappings.

Run from any PowerShell working directory (Python 3.10+):

```powershell
py -3 probe_formats.py --game "C:\Program Files (x86)\Steam\steamapps\common\Disney Dreamlight Valley" --out "$env:USERPROFILE\Desktop\DreamwishWand\SRC-01 ITEMS\Steam-v1.26.2\format-probe.json"
```

Output `format-probe.json` includes the versioned input provenance, a limited Base64 sample of original binary bytes per relevant definition and localization entry, and provisional protobuf wire profiles. None of these profiles identifies an authoritative item/name relationship. The tool never writes into the game or touches Collection UI.

Upload `format-probe.json` to the existing private `Dreamwish Wand / Development / Sources / SRC-01 ITEMS` Google Drive folder. Following the source sample inspection, implement only validated parsers, preserve each original Item ID and every locale-specific name's source evidence, and reconcile the 13,202 native definitions against the old 12,552-item Switch 1.25.0 reference without equating the two coverage sets. `--sample-bytes` defaults to 4096; max 16384.

Run synthetic tests using `py -3 -m unittest discover -s tools/src-01-items -p "test_*.py" -v` from a clone (not required for extracting on the user's PC).
