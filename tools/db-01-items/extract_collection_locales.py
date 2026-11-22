"""Extract current-version Collection labels directly from Steam LocDB archives.

All game-original inputs and outputs stay OWNER-PRIVATE. The public repository
contains only this offline Python producer and synthetic tests. This reuses the
existing current LocDB decoder rather than inventing a second binary parser.

A native CollectionSubMenu enum and the 21 actual Collection tab-title keys are
separate source dimensions; no mapping between them is inferred here.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src-01-items"))
from localize1262 import (  # type: ignore
    LOCALES, MAX_LOC_FILE_BYTES, decode_locbin, verified_display_name,
)

SCHEMA = "wand.db01.collection-original-locales.private@1"
SHA = re.compile(r"[a-f0-9]{64}")
NAMESPACE = "CollectionSet."
EXPECTED_SETS = 305
EXPECTED_TABS = 21
EXPECTED_AREAS = 7


def require(ok: object, code: str) -> None:
    if not ok:
        raise ValueError("DB01_COLLECTION_ORIGINAL_LOCALES_" + code)


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def read_pinned_zip(path: Path, sha: str) -> zipfile.ZipFile:
    require(SHA.fullmatch(sha) is not None and path.is_file(),
            "MISSING_TRUSTED_ZIP_PIN")
    require(digest(path.read_bytes()) == sha, "ZIP_SOURCE_SHA256_MISMATCH")
    return zipfile.ZipFile(path)


def read_locbin(archive: zipfile.ZipFile, member: str) -> dict[str, str]:
    require(sum(x.filename == member for x in archive.infolist()) == 1,
            "MISSING_OR_DUPLICATE_LOCBIN")
    record = archive.getinfo(member)
    require(0 < record.file_size <= MAX_LOC_FILE_BYTES, "LOCBIN_SIZE")
    decoded = decode_locbin(archive.read(member))
    require(isinstance(decoded, dict), "LOCBIN_ENTRIES")
    return decoded


def inside_repo(path: Path) -> bool:
    return any((parent / ".git").exists() or (
        (parent / "package.json").is_file() and (parent / "src").is_dir()
    ) for parent in (path, *path.parents))


def extract(
    menu_zip: Path,
    locale_dir: Path,
    expected_menu_sha256: str,
    expected_locale_sha256: dict[str, str],
    output: Path,
) -> dict:
    menu_zip, locale_dir, output = (
        Path(x).expanduser().resolve() for x in (menu_zip, locale_dir, output)
    )
    require(not inside_repo(output) and not output.exists() and
            locale_dir.is_dir() and output != menu_zip and
            output not in menu_zip.parents and
            menu_zip not in output.parents,
            "PRIVATE_NEW_OUTPUT_OUTSIDE_REPOSITORY")
    require(set(expected_locale_sha256) == set(LOCALES) and
            all(SHA.fullmatch(x) is not None
                for x in expected_locale_sha256.values()),
            "EIGHT_INDEPENDENT_LOCALE_SHA_PINS")
    with read_pinned_zip(menu_zip, expected_menu_sha256) as archive:
        require(set(archive.namelist()) == {
            "manifest.json", "menus.json", "direct-items.json"
        }, "ORIGINAL_MENU_FILE_SET")
        manifest_bytes = archive.read("manifest.json")
        manifest = json.loads(manifest_bytes)
        menu_bytes = archive.read("menus.json")
        menus = json.loads(menu_bytes)
    require(manifest.get("schema") == "wand.db01.collection-menu-direct@1" and
            manifest.get("platform") == "Steam" and
            manifest.get("gameVersion") == "1.26.2" and
            manifest.get("privateOnly") is True and
            manifest.get("publicationAuthorized") is False and
            manifest.get("collectionSetDefinitions") == EXPECTED_SETS and
            manifest.get("catalogDefinitions") == 39067 and
            manifest.get("dynamicSelectorsUnresolved") == 262 and
            SHA.fullmatch(manifest.get("sourceItemsSha256", "")) is not None and
            SHA.fullmatch(manifest.get("sourceCollectionSetSha256", "")) is not None and
            digest(menu_bytes) == manifest["files"]["menus.json"]["sha256"] and
            len(menu_bytes) == manifest["files"]["menus.json"]["bytes"] and
            len(menus) == manifest["files"]["menus.json"]["count"] ==
            EXPECTED_SETS,
            "CURRENT_MENU_SOURCE_REQUIRED")
    label_keys: dict[str, dict] = {}
    seen_ids: set[int] = set()
    for menu in menus:
        label = menu.get("collectionLabelKey")
        require(isinstance(label, str) and label.startswith(NAMESPACE) and
                len(label) > len(NAMESPACE) and
                type(menu.get("setId")) is int and
                menu["setId"] > 0 and menu["setId"] not in seen_ids and
                isinstance(menu.get("setKey"), str) and menu["setKey"] and
                menu.get("gameUiVisibilityVerified") is False,
                "ORIGINAL_MENU_IDENTITY_OR_LABEL_KEY")
        seen_ids.add(menu["setId"])
        key = label[len(NAMESPACE):]
        require(key not in label_keys, "DUPLICATE_COLLECTION_LABEL_KEY")
        label_keys[key] = menu
    require(len(label_keys) == EXPECTED_SETS, "SET_CENSUS")
    names_by_locale = {}
    tabs_by_locale = {}
    areas_by_locale = {}
    expected_tab_keys = None
    expected_area_keys = None
    member_sha256 = {}
    for locale, suffix in LOCALES.items():
        locale_path = locale_dir / ("LocDB_" + suffix + ".zip")
        with read_pinned_zip(locale_path, expected_locale_sha256[locale]) as archive:
            full_set = read_locbin(archive, "CollectionSet.locbin")
            collection = read_locbin(archive, "collection.locbin")
            member_sha256[locale] = {
                "CollectionSet.locbin": digest(archive.read("CollectionSet.locbin")),
                "collection.locbin": digest(archive.read("collection.locbin")),
            }
        require(set(full_set) == set(label_keys), "CURRENT_LOCALE_SET_KEYS")
        names_by_locale[locale] = {
            key: verified_display_name(full_set[key]) for key in label_keys
        }
        tabs = {k: verified_display_name(v) for k, v in collection.items()
                if k.startswith("tab_title_")}
        areas = {k: verified_display_name(v) for k, v in collection.items()
                 if k.startswith("area_title_")}
        require(len(tabs) == EXPECTED_TABS and len(areas) == EXPECTED_AREAS and
                all(isinstance(v, str) and v.strip() == v and v
                    for v in (*tabs.values(), *areas.values())),
                "CURRENT_COLLECTION_TAB_AREA_NAMES")
        if expected_tab_keys is None:
            expected_tab_keys = set(tabs)
            expected_area_keys = set(areas)
        require(set(tabs) == expected_tab_keys and
                set(areas) == expected_area_keys, "LOCALE_TAB_AREA_KEY_DRIFT")
        tabs_by_locale[locale] = tabs
        areas_by_locale[locale] = areas
    sets = [
        {
            "setId": m["setId"],
            "setKey": m["setKey"],
            "collectionLabelKey": m["collectionLabelKey"],
            "names": {locale: names_by_locale[locale][
                m["collectionLabelKey"][len(NAMESPACE):]]
                      for locale in LOCALES},
        }
        for m in sorted(menus, key=lambda x: x["setId"])
    ]
    named_all = sum(all(row["names"][locale] is not None for locale in LOCALES)
                    for row in sets)
    unavailable = sorted(m["setId"] for m in sets
                         if any(m["names"][locale] is None for locale in LOCALES))
    require(named_all == 304 and len(unavailable) == 1 and
            all(sum(row["names"][locale] is not None for row in sets) == 304
                for locale in LOCALES), "NON_DISPLAY_MARKER_CENSUS")
    tabs = [
        {"key": key, "names": {locale: tabs_by_locale[locale][key]
                              for locale in LOCALES}}
        for key in sorted(expected_tab_keys)
    ]
    areas = [
        {"key": key, "names": {locale: areas_by_locale[locale][key]
                              for locale in LOCALES}}
        for key in sorted(expected_area_keys)
    ]
    payload = {
        "schema": SCHEMA, "platform": "Steam", "gameVersion": "1.26.2",
        "privateOnly": True, "publicationAuthorized": False,
        "sourceItemsSha256": manifest["sourceItemsSha256"],
        "sourceCollectionSetSha256": manifest["sourceCollectionSetSha256"],
        "sourceMenuArchiveSha256": expected_menu_sha256,
        "sourceMenuManifestSha256": digest(manifest_bytes),
        "sourceMenuRowsSha256": digest(menu_bytes),
        "localeZipSha256": dict(sorted(expected_locale_sha256.items())),
        "localeMembersSha256": member_sha256,
        "coverage": {
            "collectionSetDefinitions": EXPECTED_SETS,
            "sourceLocalizedSetsAllEight": named_all,
            "nonDisplaySetIds": unavailable,
            "originalCollectionTabTitles": EXPECTED_TABS,
            "originalCollectionAreaTitles": EXPECTED_AREAS,
        },
        "sets": sets, "tabTitles": tabs, "areaTitles": areas,
        "sourceLabelKeyVerified": True,
        "originalUiTabNameVerified": True,
        "originalUiAreaNameVerified": True,
        "sourceSubmenuToUiTabMappingVerified": False,
        "actualCollectionUiMembershipVerified": False,
        "dlcEntitlementVerified": False,
    }
    data = (json.dumps(payload, ensure_ascii=False, separators=(",", ":"),
                       sort_keys=True) + "\n").encode("utf-8")
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("xb") as stream:
        os.chmod(output, 0o600)
        stream.write(data)
    return {
        "output": str(output),
        "sha256": digest(data),
        "bytes": len(data),
        "sets": len(sets),
        "namedAllEight": named_all,
        "tabTitles": len(tabs),
        "areaTitles": len(areas),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--menu-zip", type=Path, required=True)
    parser.add_argument("--expected-menu-zip-sha256", required=True)
    parser.add_argument("--locale-dir", type=Path, required=True)
    parser.add_argument("--locale-pin", action="append", required=True,
                        help="One per locale: en=<64-char SHA256>, etc.")
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    try:
        pins = {}
        for entry in args.locale_pin:
            locale, separator, sha = entry.partition("=")
            require(separator == "=" and locale not in pins,
                    "DUPLICATE_OR_BAD_LOCALE_PIN")
            pins[locale] = sha
        result = extract(args.menu_zip, args.locale_dir,
                         args.expected_menu_zip_sha256, pins, args.out)
    except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError,
            zipfile.BadZipFile) as exc:
        parser.exit(1, "DB-01 collection locales extraction failed: " +
                    str(exc) + "\n")
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
