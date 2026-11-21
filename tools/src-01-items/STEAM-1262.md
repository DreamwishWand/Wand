# SRC-01 Steam v1.26.2 native item extraction

Run `steam1262.py` using Python 3.10+ from anywhere on Windows. It does not require cloning the repository. Input files are always read-only; all outputs go to `--out`, which must be outside the game folder.

Example:

```powershell
py -3 steam1262.py --game "C:\Program Files (x86)\Steam\steamapps\common\Disney Dreamlight Valley" --out "$env:USERPROFILE\Desktop\DreamwishWand\SRC-01 ITEMS\Steam-v1.26.2"
```

Validated from SRC-00's completed Steam v1.26.2 manifest (22,281 source files, all SHA-256 checked, no scan errors). The exact four binary files `ActivityItem.json`, `Furniture.json`, `Clothing.json` and `Trimming.json` retain the byte-for-byte hashes observed for Steam v1.26.1 and independently verified in the Steam v1.26.2 manifest. The already-reviewed protobuf frame model reads field 1 as Item ID, field 2 as a raw name string, and field 4 as an icon GUID. A source digest mismatch terminates extraction without replacing previous output.

Outputs: `manifest.json`, `items.jsonl`, `unresolved.json`, `report.json`, and `localization-structure.json`.

This is a **partial game-native extraction**, not a complete current Collection release. It provides the verified native IDs and provenance for four categories. Raw name-field strings are not asserted to be eight-language official display names or internal identifiers. The ZIP directory structure of all eight `LocDB` archives is inspected without extracting their contents or claiming an unverified mapping. Other source categories, DLC/world/universe mappings, subcategories, official names, and comparisons to the historical Switch v1.25.0 Collection remain to be implemented from verified source evidence.

Check the output in the user-owned private `Dreamwish Wand / Development / Sources / SRC-01 ITEMS` Google Drive folder. Do not commit generated game-derived data or raw game assets to this GitHub repository.

Test:

```powershell
py -3 -m unittest discover -s tools/src-01-items -p "test_*.py" -v
```
