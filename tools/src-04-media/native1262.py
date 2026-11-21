"""SRC-04 Steam 1.26.2 native-icon extraction.

Uses SRC-01's hash-pinned parser and UnityPy. No game writes, no network upload,
no publication, and no unverified name-based Item ID matching.
"""
import argparse
import csv
import importlib.util
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

from media import digest, generate_variant, save_json

GAME_DEFAULT = Path(r"C:\Program Files (x86)\Steam\steamapps\common\Disney Dreamlight Valley")
OUT_DEFAULT = Path.home() / "Documents" / "DreamwishWand" / "SRC-04 MEDIA" / "Steam-v1.26.2"
ICON_FOLDER = Path("ddv_Data/StreamingAssets/aa/win/ui-images-generatedicons_assets_assets")
CATALOG_FOLDER = Path("ddv_Data/StreamingAssets/aa")
GUID = re.compile(r"^guid:[0-9a-f]{32}$")
GUID_TOKEN = re.compile(r"(?<![a-zA-Z0-9])(?:guid:)?([0-9a-f]{32})(?![a-zA-Z0-9])", re.I)
SCHEMA = "wand.src04.steam-native@1"
FULLVERSION_SHA256 = "e0aad8c7c19ebd3f441161db4d27f7838dd62b261927a974793f54fc0a81fc98"
SRC00_FINGERPRINT = "374267a623c7f191d96f73f7f4240fe2a3d5a7349aa8e136537713b02a6cf09e"


def load_bundle_pins():
    index_file = Path(__file__).with_name("source-index-1262.csv")
    if not index_file.is_file():
        raise FileNotFoundError("Pinned SRC-00 1.26.2 bundle index is missing")
    pins = {}
    with index_file.open("r", encoding="utf-8", newline="") as stream:
        for row in csv.DictReader(stream):
            name, sha, size = row["bundle"], row["sha256"], int(row["bytes"])
            if (name in pins or not name.endswith(".bundle") or
                not re.fullmatch(r"[0-9a-f]{64}", sha) or size < 1):
                raise ValueError("Invalid or duplicate SRC-00 bundle pin")
            pins[name] = (sha, size)
    if len(pins) != 40:
        raise ValueError(f"SRC-00 icon index expected 40 bundles; got {len(pins)}")
    return pins


def steam_parser():
    script_dir = Path(__file__).resolve().parent
    candidates = [
        script_dir / "steam1262.py",
        script_dir.parent / "src-01-items" / "steam1262.py",
    ]
    for path in candidates:
        if path.is_file():
            spec = importlib.util.spec_from_file_location("wand_steam1262", path)
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            if module.GAME_VERSION != "1.26.2" or module.FULLVERSION_SHA256 != FULLVERSION_SHA256:
                raise ValueError("Unrecognized SRC-01 decoder provenance")
            return module
    raise FileNotFoundError("Verified SRC-01 steam1262.py must be next to this script or in tools/src-01-items/")


def verify_source(game, decoder):
    if not game.is_dir() or game.is_symlink():
        raise FileNotFoundError(f"Game directory is not accessible: {game}")
    version = game / "FullVersion.txt"
    if not version.is_file() or digest(version) != FULLVERSION_SHA256:
        raise ValueError("Game version digest differs from verified Steam 1.26.2")
    for name, (_, expected_sha) in decoder.CATEGORIES.items():
        path = game / "ddv_Data" / "StreamingAssets" / "itemlist" / (name + ".json")
        if not path.is_file() or path.is_symlink() or digest(path) != expected_sha:
            raise ValueError(f"SRC-01 native itemlist differs from verified Steam 1.26.2: {name}")


def read_items(game, output, decoder):
    folder = output / "source-items"
    items_file, manifest_file = folder / "items.jsonl", folder / "manifest.json"
    if items_file.exists() and manifest_file.exists():
        manifest = json.loads(manifest_file.read_text(encoding="utf-8"))
        if (manifest.get("schema") == decoder.SCHEMA and
            manifest.get("gameVersion") == "1.26.2" and
            manifest.get("itemsSha256") == digest(items_file)):
            print("SRC-01 verified item cache reused", flush=True)
        else:
            raise ValueError("Existing SRC-01 cache has mismatched provenance. Delete it after review.")
    else:
        if items_file.exists() != manifest_file.exists():
            raise ValueError("Incomplete SRC-01 cache. Inspect output/source-items before rerunning.")
        decoder.run(game, folder)
    result = defaultdict(list)
    item_ids = set()
    with items_file.open("r", encoding="utf-8") as stream:
        for line in stream:
            row = json.loads(line)
            guid = row["iconGuid"]
            item_id = str(row["itemId"])
            if not GUID.fullmatch(guid) or item_id in item_ids:
                raise ValueError("Unexpected SRC-01 GUID or duplicate Item ID")
            item_ids.add(item_id)
            result[guid[5:]].append(item_id)
    if len(item_ids) != 13202:
        raise ValueError(f"Unexpected SRC-01 row count: {len(item_ids)}")
    return dict(result), digest(items_file)


def catalog_probe(game, output, item_index):
    base = game / CATALOG_FOLDER
    catalog = base / "catalog.json"
    info = {"schema": SCHEMA, "kind": "addressables_catalog_probe",
            "catalog": CATALOG_FOLDER.joinpath("catalog.json").as_posix(),
            "sourceSha256": None, "keys": [], "matchedGuidTokens": [],
            "binaryParts": [], "publicationApproved": False}
    if catalog.is_file():
        info["sourceSha256"] = digest(catalog)
        try:
            doc = json.loads(catalog.read_text(encoding="utf-8-sig"))
            info["keys"] = list(doc.keys()) if isinstance(doc, dict) else []
            # Exact literal GUID tokens are observational evidence ONLY; an
            # Addressables GUID-to-resource mapping requires a decoded location.
            tokens = set(GUID_TOKEN.findall(catalog.read_text(encoding="utf-8-sig")))
            info["matchedGuidTokens"] = sorted(g.lower() for g in tokens if g.lower() in item_index)[:100]
            info["allGuidTokenCount"] = len(tokens)
        except (OSError, UnicodeError, ValueError) as exc:
            info["error"] = str(exc)[:200]
    pattern = re.compile(rb"(?<![A-Za-z0-9])(?:guid:)?([0-9a-fA-F]{32})(?![A-Za-z0-9])")
    for suffix in ["InternalIds", "bucketData", "entryData", "extraData", "keyData"]:
        path = base / ("catalog." + suffix + ".bin")
        if path.is_file():
            raw = path.read_bytes()
            samples = []
            unique = set()
            for match in pattern.finditer(raw):
                value = match.group(1).decode("ascii").lower()
                unique.add(value)
                if value in item_index and len(samples) < 30:
                    samples.append({
                        "guid": "guid:" + value, "offset": match.start(),
                        "before16Hex": raw[max(0, match.start() - 16):match.start()].hex(),
                        "after16Hex": raw[match.end():match.end() + 16].hex()
                    })
            info["binaryParts"].append({
                "file": path.relative_to(game).as_posix(),
                "sha256": digest(path),
                "bytes": len(raw), "first64Hex": raw[:64].hex(),
                "literalGuidCount": len(unique),
                "matchingItemGuidCount": len(unique & item_index.keys()),
                "matchingItemGuidSamples": samples
            })
    save_json(output / "evidence" / "catalog-probe.json", info)


def cached_outputs_ok(output, record, verify_existing=False, keep_originals=False):
    if keep_originals and max(record.get("sourceWidth", 0), record.get("sourceHeight", 0)) > 512:
        if "original" not in record.get("variants", {}):
            return False
    for variant in record.get("variants", {}).values():
        candidate = output / variant["path"]
        if not candidate.is_file() or candidate.stat().st_size != variant.get("bytes"):
            return False
        if verify_existing and digest(candidate) != variant.get("sha256"):
            return False
    return bool(record.get("variants"))


def ref_of(obj):
    asset_file = str(getattr(getattr(obj, "assets_file", None), "name", ""))
    return (asset_file, str(obj.path_id))


def container_paths(env):
    result = defaultdict(list)
    entries = getattr(env, "container", {})
    try:
        iterator = entries.items() if isinstance(entries, dict) else iter(entries)
        for name, obj in iterator:
            if isinstance(obj, (list, tuple)):
                obj = obj[0] if obj else None
            if obj is not None and hasattr(obj, "path_id"):
                result[ref_of(obj)].append(str(name))
    except (TypeError, ValueError, AttributeError):
        pass
    return result


def exact_guids(strings, item_index):
    # Paths and serialized asset names may contain native GUIDs. This is not
    # fuzzy name similarity. Only exact 32-byte hex tokens joined to SRC-01 are used.
    found = set()
    for text in strings:
        for raw in GUID_TOKEN.findall(text):
            normalized = raw.lower()
            if normalized in item_index:
                found.add(normalized)
    return sorted(found)


def image_variants(image, output, key, old, keep_originals, verify_existing):
    variants = {}
    for label, size in (("thumbnail", 128), ("detail", 512)):
        path = output / "images" / label / key[:2] / (key + ".webp")
        previous = old.get(label, {})
        meta, _ = generate_variant(image, size, path, previous, verify_existing)
        meta["path"] = path.relative_to(output).as_posix()
        variants[label] = meta
    if keep_originals and max(image.size) > 512:
        path = output / "images" / "original" / key[:2] / (key + ".png")
        previous = old.get("original", {})
        good = path.is_file() and previous.get("bytes") == path.stat().st_size
        if good and verify_existing:
            good = previous.get("sha256") == digest(path)
        if not good:
            path.parent.mkdir(parents=True, exist_ok=True)
            temp = path.with_suffix(".png.tmp")
            image.save(temp, format="PNG")
            temp.replace(path)
        variants["original"] = {
            "path": path.relative_to(output).as_posix(),
            "sha256": digest(path),
            "bytes": path.stat().st_size,
            "width": image.width, "height": image.height
        }
    return variants


def process_bundle(game, output, path, item_index, expected_sha, expected_bytes,
                   keep_originals=False, verify_existing=False):
    try:
        import UnityPy
    except ImportError as exc:
        raise RuntimeError("Install UnityPy and Pillow before extraction.") from exc
    relative = path.relative_to(game).as_posix()
    if path.stat().st_size != expected_bytes:
        raise ValueError(f"SRC-00 icon bundle byte size mismatch: {relative}")
    content_sha = digest(path)
    if content_sha != expected_sha:
        raise ValueError(f"SRC-00 icon bundle digest mismatch: {relative}")
    checkpoint = output / "bundles" / (content_sha + ".json")
    old = json.loads(checkpoint.read_text(encoding="utf-8")) if checkpoint.is_file() else {}
    if old.get("complete") and old.get("containerSha256") == content_sha and all(
            cached_outputs_ok(output, image, verify_existing, keep_originals) for image in old.get("images", [])):
        return old
    old_by_asset = {row["assetId"]: row for row in old.get("images", [])}
    records = []
    issues = []
    decoded = 0
    env = UnityPy.load(str(path))
    paths = container_paths(env)
    # Sprite and Texture2D use UnityPy's native pixel decoder; no custom codec.
    for obj in env.objects:
        kind = obj.type.name
        if kind not in {"Sprite", "Texture2D"}:
            continue
        asset_file, object_id = ref_of(obj)
        native_id = f"unity:{content_sha}:{asset_file}:{object_id}:{kind}"
        previous = old_by_asset.get(native_id)
        if previous:
            if cached_outputs_ok(output, previous, verify_existing, keep_originals):
                records.append(previous)
                continue
        try:
            data = obj.read()
            image = data.image
            if image is None:
                raise ValueError("No decoded pixels")
            image.load()
            name = str(getattr(data, "m_Name", ""))
            refs = sorted(set(paths.get((asset_file, object_id), [])))
            guids = exact_guids([name] + refs, item_index)
            # Multiple GUIDs can refer to one source image. We preserve
            # all exact links; never substitute numeric Unity path_id as Item ID.
            items = sorted({id for guid in guids for id in item_index[guid]}, key=int)
            # PNG is the canonical decoded-pixel hash and avoids mixing input
            # encoded bytes with derived-image hashes.
            from io import BytesIO
            buffer = BytesIO()
            image.save(buffer, format="PNG")
            source_sha = __import__("hashlib").sha256(buffer.getvalue()).hexdigest()
            variants = image_variants(image, output, source_sha,
                                      previous.get("variants", {}) if previous and
                                      previous.get("decodedSha256") == source_sha else {},
                                      keep_originals, verify_existing)
            record = {
                "assetId": native_id, "assetClass": kind, "assetName": name,
                "unityPathId": object_id, "unityAssetsFile": asset_file,
                "containerPaths": refs, "containerSha256": content_sha,
                "containerPath": relative, "sourcePlatform": "Steam Windows",
                "gameVersion": "1.26.2", "decodedSha256": source_sha,
                "sourceWidth": image.width, "sourceHeight": image.height,
                "exactGuids": guids, "itemIds": items,
                "identityMethod": "exact_guid_in_serialized_name_or_bundle_container"
                                  if guids else None,
                "identityVerified": bool(guids), "variants": variants,
                "publicationApproved": False
            }
            records.append(record)
            decoded += 1
            if max(image.size) < 128:
                issues.append({"type": "under_128px", "assetId": native_id,
                               "size": list(image.size)})
            elif max(image.size) < 512:
                issues.append({"type": "under_512px", "assetId": native_id,
                               "size": list(image.size)})
        except Exception as exc:
            issues.append({"type": "decode_error", "assetId": native_id,
                           "error": str(exc)[:300]})
        if (len(records) + len(issues)) % 100 == 0:
            save_json(checkpoint, {"schema": SCHEMA, "containerPath": relative,
                      "containerSha256": content_sha, "complete": False,
                      "images": records, "issues": issues, "publicationApproved": False})
    info = {"schema": SCHEMA, "containerPath": relative, "containerSha256": content_sha,
            "complete": True, "decodedNew": decoded, "images": records,
            "issues": issues, "publicationApproved": False}
    save_json(checkpoint, info)
    return info


def combined(output, item_index, items_sha, candidates, selected, checkpoints, error_details):
    by_item = defaultdict(list)
    by_guid = defaultdict(list)
    all_images = []
    all_issues = list(error_details)
    for path in selected:
        if path not in checkpoints:
            continue
        record = checkpoints[path]
        if not record.get("complete") or record.get("containerPath") != path:
            continue
        for image in record.get("images", []):
            all_images.append(image)
            for item in image.get("itemIds", []):
                by_item[item].append(image)
            for guid in image.get("exactGuids", []):
                by_guid[guid].append(image)
        all_issues.extend(record.get("issues", []))
    item_manifest = {}
    ambiguous = {}
    for item, images in by_item.items():
        unique = {r["decodedSha256"] for r in images}
        if len(unique) > 1:
            ambiguous[item] = sorted(unique)
            continue
        first = images[0]
        item_manifest[item] = {
            "guid": first["exactGuids"], "assetId": first["assetId"],
            "decodedSha256": first["decodedSha256"], "variants": first["variants"],
            "sourceWidth": first["sourceWidth"], "sourceHeight": first["sourceHeight"],
            "containerSha256": first["containerSha256"], "containerPath": first["containerPath"],
            "sourcePlatform": "Steam Windows", "gameVersion": "1.26.2",
            "evidence": first["identityMethod"], "publicationApproved": False
        }
    missed = sorted(set(item_index) - set(by_guid))
    decoded_failures = sum(issue.get("type") == "decode_error" for issue in all_issues)
    processing_complete = (len(selected) == len(candidates) and not error_details
                           and decoded_failures == 0)
    save_json(output / "manifest-native.json", {
        "schema": SCHEMA, "gameVersion": "1.26.2", "platform": "Steam Windows",
        "src01ItemsSha256": items_sha, "images": all_images, "items": item_manifest,
        "publicationApproved": False,
        "complete": processing_complete,
        "identityCoverageComplete": not missed and not ambiguous,
        "resolution": "exact_guid_only"
    })
    report = {
        "schema": SCHEMA, "totalItems": sum(len(x) for x in item_index.values()),
        "totalUniqueGuids": len(item_index), "extractedImages": len(all_images),
        "matchedUniqueGuids": len(by_guid), "matchedItems": len(item_manifest),
        "ambiguousItemIds": ambiguous, "unmatchedGuidCount": len(missed),
        "unmatchedGuidSample": ["guid:" + g for g in missed[:200]],
        "candidateBundleCount": len(candidates), "selectedBundles": selected,
        "issues": all_issues, "publicationApproved": False,
        "complete": processing_complete, "decodeFailures": decoded_failures,
        "identityCoverageComplete": not missed and not ambiguous,
        "sourceStatus": "verified_steam_1.26.2",
        "guidResolutionStatus": "pending_catalog_mapping" if missed else "complete"
    }
    save_json(output / "report-native.json", report)
    return report


def main():
    parser = argparse.ArgumentParser(description="Steam 1.26.2 icon GUID native extraction; no upload")
    parser.add_argument("--game", type=Path, default=GAME_DEFAULT)
    parser.add_argument("--out", type=Path, default=OUT_DEFAULT)
    parser.add_argument("--limit-bundles", type=int, default=2,
                        help="Default two bundles for smoke test. Set to 0 for full 40-bundle batch.")
    parser.add_argument("--keep-originals", action="store_true")
    parser.add_argument("--verify-existing", action="store_true")
    options = parser.parse_args()
    game, output = options.game.resolve(), options.out.resolve()
    if game == output or game in output.parents or output in game.parents:
        parser.error("Input and output must be separate.")
    try:
        decoder = steam_parser()
        verify_source(game, decoder)
        index, items_sha = read_items(game, output, decoder)
        catalog_probe(game, output, index)
        folder = game / ICON_FOLDER
        if not folder.is_dir():
            raise FileNotFoundError(f"Native generated icons bundle folder not found: {folder}")
        pins = load_bundle_pins()
        candidates = sorted(p for p in folder.glob("*.bundle") if p.is_file() and not p.is_symlink())
        if set(p.name for p in candidates) != set(pins):
            raise ValueError("Steam icon bundle listing differs from verified SRC-00 index")
        selected = candidates[:options.limit_bundles] if options.limit_bundles else candidates
        errors = []
        checkpoints = {}
        for count, path in enumerate(selected, 1):
            relative = path.relative_to(game).as_posix()
            try:
                expected_sha, expected_bytes = pins[path.name]
                result = process_bundle(game, output, path, index, expected_sha, expected_bytes,
                                        options.keep_originals, options.verify_existing)
                checkpoints[relative] = result
                print(f"[{count}/{len(selected)}] {path.name}: {len(result['images'])} images", flush=True)
            except Exception as exc:
                errors.append({"type": "bundle_error", "bundle": path.name, "error": str(exc)[:300]})
                print(f"[{count}/{len(selected)}] failed: {path.name}: {exc}", file=sys.stderr, flush=True)
        report = combined(output, index, items_sha,
                          [p.relative_to(game).as_posix() for p in candidates],
                          [p.relative_to(game).as_posix() for p in selected],
                          checkpoints, errors)
        report["src00DatasetFingerprint"] = SRC00_FINGERPRINT
        save_json(output / "report-native.json", report)
        print(json.dumps({key: report[key] for key in
              ["candidateBundleCount", "extractedImages", "matchedItems",
               "matchedUniqueGuids", "unmatchedGuidCount", "complete"]}))
        return 1 if errors else 0
    except (OSError, ValueError, RuntimeError) as exc:
        parser.exit(2, f"SRC-04 error: {exc}\n")


if __name__ == "__main__":
    raise SystemExit(main())
