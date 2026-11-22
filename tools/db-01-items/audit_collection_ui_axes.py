"""Audit original Steam CollectionArea / CollectionSubMenu axes against
a SHA-pinned IL2CPP dump, original CollectionSet archive and private LocDB.

No original game bytes, localized values or private outputs are published.
The 20/7 code-name pairs are original IL2CPP evidence. The association of
their names with current LocDB labels is explicitly ONLY a source-name
correlation, not recovered runtime string-binding or visibility logic.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import re
import zipfile

SCHEMA = "wand.db01.collection-native-ui-axes-audit@1"
SHA = re.compile(r"^[0-9a-f]{64}$")
TS_AREAS = "DB01_ORIGINAL_COLLECTION_AREAS"
TS_SUBMENUS = "DB01_ORIGINAL_COLLECTION_SUBMENUS"


def require(ok: object, why: str) -> None:
    if not ok:
        raise ValueError("DB01_COLLECTION_UI_AXES_" + why)


def digest(path: Path) -> str:
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def enums(text: str, enum: str) -> dict[str, int]:
    match = re.search(r"public enum " + re.escape(enum) +
                      r"\b[^\n]*\n\{(.*?)\n\}", text, re.S)
    require(match is not None, "MISSING_NATIVE_" + enum)
    members = re.findall(r"public const " + re.escape(enum) +
                         r" (\w+) = (\d+);", match.group(1))
    require(len(members) == len(set(name for name, _ in members)) and
            len(members) == len(set(int(value) for _, value in members)),
            "DUPLICATE_NATIVE_" + enum)
    return {name: int(value) for name, value in members}


def snapshot(text: str, exported: str) -> dict[str, tuple[int, str]]:
    block = re.search(r"export const " + re.escape(exported) +
                      r"=Object\.freeze\(\[(.*?)\] as const\);", text, re.S)
    require(block is not None, "MISSING_TS_SOURCE_AXES_" + exported)
    rows = re.findall(r"\{code:(\d+),enumName:'([A-Za-z]+)',"
                      r"locDbKey:'([a-z_]+)'\}", block.group(1))
    require(rows and len(rows) ==
            len(set(code for code, _, _ in rows)) ==
            len(set(name for _, name, _ in rows)) ==
            len(set(key for _, _, key in rows)),
            "DUPLICATE_TS_AXES_" + exported)
    return {name: (int(code), key) for code, name, key in rows}


def audit_enum_wiring(il2cpp: str, ts: str) -> tuple[dict, dict]:
    """Pure structural check; also used with synthetic fixture snippets."""
    areas = enums(il2cpp, "CollectionArea")
    categories = enums(il2cpp, "CollectionSubMenu")
    area_snapshot = snapshot(ts, TS_AREAS)
    category_snapshot = snapshot(ts, TS_SUBMENUS)
    require(len(areas) == len(area_snapshot) == 7 and
            len(categories) == len(category_snapshot) == 20 and
            all(name in areas and areas[name] == code
                for name, (code, _) in area_snapshot.items()) and
            all(name in categories and categories[name] == code
                for name, (code, _) in category_snapshot.items()),
            "NATIVE_ENUM_CODE_DRIFT")
    require(areas.get("Honeywood") == 4097 and
            "Critters" not in categories and
            5 not in categories.values(),
            "NATIVE_ENUM_SPECIAL_VALUES")
    require(re.search(
        r"public class CollectionTabButton\b.*?"
        r"public CollectionArea CollectionArea;",
        il2cpp, re.S) is not None and
        re.search(
        r"public class CollectionTagFilterButton\b.*?"
        r"public CollectionSubMenu CollectionType;",
        il2cpp, re.S) is not None and
        re.search(
        r"private struct CollectionMenu\.CollectionPageConfig\b.*?"
        r"public CollectionSubMenu SubMenu;",
        il2cpp, re.S) is not None,
        "COLLECTION_UI_FIELD_WIRING")
    require(all(key.startswith("area_title_")
                for _, key in area_snapshot.values()) and
            all(key.startswith("tab_title_")
                for _, key in category_snapshot.values()) and
            "tab_title_critters" not in
            {key for _, key in category_snapshot.values()},
            "MISMATCHED_SOURCE_NAME_CORRELATION")
    return area_snapshot, category_snapshot


def audit(dump: Path, menu_zip: Path, locales: Path, source_ts: Path) -> dict:
    source_text = source_ts.read_text(encoding="utf-8")
    pin = re.search(
        r"DB01_COLLECTION_UI_IL2CPP_SHA256=\s*"
        r"'([0-9a-f]{64})' as const;", source_text)
    require(pin is not None and SHA.fullmatch(pin.group(1)) and
            digest(dump) == pin.group(1), "ORIGINAL_IL2CPP_SHA_MISMATCH")
    areas, categories = audit_enum_wiring(
        dump.read_text(encoding="utf-8"), source_text)
    overlay = json.loads(locales.read_text(encoding="utf-8"))
    require(overlay.get("schema") ==
            "wand.db01.collection-original-locales.private@1" and
            overlay.get("gameVersion") == "1.26.2" and
            overlay.get("privateOnly") is True and
            overlay.get("publicationAuthorized") is False and
            overlay.get("actualCollectionUiMembershipVerified") is False and
            overlay.get("sourceSubmenuToUiTabMappingVerified") is False and
            SHA.fullmatch(overlay.get("sourceMenuArchiveSha256", "")) and
            digest(menu_zip) == overlay["sourceMenuArchiveSha256"],
            "LOCALE_MENU_SOURCE_MISMATCH")
    with zipfile.ZipFile(menu_zip) as archive:
        menu_manifest = json.loads(archive.read("manifest.json"))
        original_menus = json.loads(archive.read("menus.json"))
    require(menu_manifest.get("sourceIl2cppDumpSha256") == pin.group(1) and
            menu_manifest.get("sourceCollectionSetSha256") ==
            overlay.get("sourceCollectionSetSha256") and
            menu_manifest.get("sourceItemsSha256") ==
            overlay.get("sourceItemsSha256") and
            len(original_menus) ==
            menu_manifest.get("collectionSetDefinitions") == 305,
            "PINNED_MENU_ORIGINAL_IDENTITY")
    seen_menus = set()
    category_set_counts = {code: 0 for code, _ in categories.values()}
    native_submenus = {code: name for name, (code, _) in categories.items()}
    for menu in original_menus:
        code = menu.get("submenuCode")
        require(isinstance(code, int) and
                menu.get("submenu") == native_submenus.get(code) and
                menu["setId"] not in seen_menus,
                "UNKNOWN_OR_DUPLICATE_COLLECTION_MENU")
        seen_menus.add(menu["setId"])
        category_set_counts[code] += 1
    require(sum(count > 0 for count in category_set_counts.values()) == 18 and
            category_set_counts.get(17) == 0 and
            category_set_counts.get(19) == 0,
            "ORIGINAL_MENU_SOURCE_COUNTS")
    tab_data = overlay.get("tabTitles")
    area_data = overlay.get("areaTitles")
    require(isinstance(tab_data, list) and len(tab_data) == 21 and
            isinstance(area_data, list) and len(area_data) == 7,
            "ORIGINAL_UI_TITLE_CENSUS")
    tab_keys = {row["key"] for row in tab_data}
    area_keys = {row["key"] for row in area_data}
    expected_tab_keys = {key for _, key in categories.values()}
    expected_area_keys = {key for _, key in areas.values()}
    require(len(tab_keys) == 21 and len(area_keys) == 7 and
            area_keys == expected_area_keys and
            tab_keys - expected_tab_keys == {"tab_title_critters"} and
            expected_tab_keys <= tab_keys,
            "ORIGINAL_LOCALE_KEY_COVERAGE")
    for entry in (*tab_data, *area_data):
        labels = entry.get("names")
        require(isinstance(labels, dict) and len(labels) == 8 and
                all(isinstance(v, str) and v.strip() for v in labels.values()),
                "INVALID_EIGHT_LANGUAGE_LABELS")
    report = {
        "schema": SCHEMA,
        "gameVersion": "1.26.2",
        "sourceIl2cppDumpSha256": pin.group(1),
        "sourceCollectionSetSha256": menu_manifest["sourceCollectionSetSha256"],
        "sourceLocaleOverlaySha256": digest(locales),
        "enumAreaCount": len(areas),
        "enumCategoryCount": len(categories),
        "sourceSets": len(original_menus),
        "sourceMenuCodesWithSets": sum(v > 0 for v in category_set_counts.values()),
        "unusedSourceMenuCodes": sorted(k for k, v in category_set_counts.items()
                                        if v == 0),
        "currentLocaleTabLabels": len(tab_keys),
        "currentLocaleAreaLabels": len(area_keys),
        "localeKeysWithoutSourceSubMenuEnum": sorted(tab_keys - expected_tab_keys),
        "originalClassCollectionTabButtonUsesArea": True,
        "originalClassCollectionTagFilterUsesSubmenu": True,
        "actualRuntimeStringBindingVerified": False,
        "actualGameUiVisibilityVerified": False,
        "gameWorldAvailabilityVerified": False,
    }
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--il2cpp-dump", type=Path, required=True)
    parser.add_argument("--menu-zip", type=Path, required=True)
    parser.add_argument("--locales", type=Path, required=True)
    parser.add_argument("--source-ts", type=Path,
                        default=Path(__file__).resolve().parents[2] /
                        "src/lib/items/collection-ui-axes.ts")
    args = parser.parse_args()
    try:
        report = audit(args.il2cpp_dump, args.menu_zip,
                       args.locales, args.source_ts)
    except (ValueError, OSError, KeyError, TypeError, UnicodeError,
            zipfile.BadZipFile) as error:
        parser.exit(1, str(error) + "\n")
    print(json.dumps(report, sort_keys=True, ensure_ascii=False))


if __name__ == "__main__":
    main()
