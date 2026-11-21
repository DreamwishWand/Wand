param(
    [switch]$SampleOnly,
    [switch]$KeepOriginals,
    [switch]$VerifyExisting
)

$ErrorActionPreference = 'Stop'
# SRC-04 source is packaged into this launcher. There are no runtime GitHub
# requests for individual Python source files; stale branch Raw URLs cannot
# strand the setup in the middle of installation.
$install = Join-Path $env:LOCALAPPDATA 'DreamwishWand\SRC-04\code'
$out = Join-Path $env:USERPROFILE 'Documents\DreamwishWand\SRC-04 MEDIA\Steam-v1.26.2'
$game = 'C:\Program Files (x86)\Steam\steamapps\common\Disney Dreamlight Valley'
New-Item -ItemType Directory -Path $install, $out -Force | Out-Null

function Install-EmbeddedSource([string]$name, [string]$content) {
    $path = Join-Path $install $name
    $temp = "$path.partial"
    [System.IO.File]::WriteAllText($temp, $content, (New-Object System.Text.UTF8Encoding($false)))
    if ((Get-Item -LiteralPath $temp).Length -lt 10) {
        throw "Embedded source is empty: $name"
    }
    Move-Item -LiteralPath $temp -Destination $path -Force
}

Write-Host 'SRC-04: installing pinned source bundle (offline; no additional GitHub downloads)...'

$embedded = @'
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
    objects = env.objects.values() if isinstance(env.objects, dict) else env.objects
    for obj in objects:
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
'@
Install-EmbeddedSource -name 'native1262.py' -content $embedded
Remove-Variable embedded

$embedded = @'
import argparse
import csv
import gzip
import hashlib
import io
import json
import re
import shutil
from collections import defaultdict
from pathlib import Path

from PIL import Image, UnidentifiedImageError

SCHEMA = "wand.media.local@1"
RECIPE = "lossless-webp-lanczos-v1"
RASTER = {".png", ".webp", ".jpg", ".jpeg", ".tif", ".tiff", ".tga", ".bmp", ".dds"}
UNITY = {".assets", ".bundle", ".unity3d", ".assetbundle"}
HEXDIGEST = re.compile(r"^[0-9a-f]{64}$")
ITEM_ID = re.compile(r"^[1-9][0-9]{0,15}$")
SHARDS = "0123456789abcdef"


def digest(path):
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def rel(root, path):
    return path.resolve().relative_to(root.resolve()).as_posix()


def shard(relative_path):
    return hashlib.sha256(relative_path.encode("utf-8")).hexdigest()[0]


def is_unity(path):
    if path.suffix.lower() in UNITY:
        return True
    try:
        with path.open("rb") as stream:
            return stream.read(8).startswith((b"UnityFS", b"UnityRaw", b"UnityWeb"))
    except OSError:
        return False


def candidates(root, extensions):
    if root.is_file():
        yield root
        return
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        if path.suffix.lower() in extensions:
            yield path
        elif path.suffix == "" and (extensions & UNITY) and is_unity(path):
            yield path


def save_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".tmp")
    with temporary.open("w", encoding="utf-8", newline="\n") as handle:
        json.dump(value, handle, ensure_ascii=False, indent=2, sort_keys=True)
        handle.write("\n")
    temporary.replace(path)


def load_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def assert_output_separate(source, output):
    src, out = source.resolve(), output.resolve()
    if src == out or (src.is_dir() and src in out.parents):
        raise ValueError("Output must be outside the input directory.")


def selected(args, relative):
    return args.shard == "all" or shard(relative) == args.shard


def source_provenance(args):
    return {"platform": args.platform, "gameVersion": args.game_version, "buildId": args.build_id,
            "metadataVerification": "operator_supplied"}


def scan_one(root, path):
    record = {"path": rel(root, path), "bytes": path.stat().st_size}
    if is_unity(path):
        record["type"] = "unity_container"
        record["status"] = "needs_extraction"
        record["sha256"] = digest(path)
        return record
    try:
        with Image.open(path) as image:
            record["width"], record["height"] = image.size
            record["format"] = image.format
            image.verify()
        record["sha256"] = digest(path)
        record["type"] = "raster"
        record["status"] = "ok"
        if not record["width"] or not record["height"]:
            raise ValueError("Zero-sized image.")
    except (OSError, ValueError, UnidentifiedImageError, Image.DecompressionBombError) as exc:
        record["type"] = "raster"
        record["status"] = "corrupt"
        record["error"] = str(exc)[:300]
    return record


def command_scan(args):
    root, output = args.input.resolve(), args.output.resolve()
    assert_output_separate(root, output)
    if not root.exists():
        raise FileNotFoundError(root)
    if not root.is_dir():
        raise ValueError("scan requires an input directory.")
    groups = defaultdict(list)
    seen = 0
    truncated = False
    extensions = RASTER | UNITY
    for path in candidates(root, extensions):
        relative = rel(root, path)
        if not selected(args, relative):
            continue
        if args.limit is not None and seen >= args.limit:
            truncated = True
            break
        entry = scan_one(root, path)
        groups[shard(relative)].append(entry)
        seen += 1
    processed_shards = [args.shard] if args.shard != "all" else list(SHARDS)
    for key in processed_shards:
        records = sorted(groups[key], key=lambda item: item["path"])
        save_json(output / "inventory" / ("shard-" + key + ".json"), {
            "schema": SCHEMA, "input": str(root), "source": source_provenance(args),
            "shard": key, "complete": not truncated, "records": records
        })
        print(f"scan {key}: {len(records)} records ({'partial' if truncated else 'complete'})")
    return 0


def command_extract(args):
    try:
        import UnityPy
    except ImportError as exc:
        raise RuntimeError("Unity extraction requires: python -m pip install UnityPy") from exc
    root, output = args.input.resolve(), args.output.resolve()
    assert_output_separate(root, output)
    if not root.exists():
        raise FileNotFoundError(root)
    bundles = 0
    images = 0
    failures = []
    for path in candidates(root, UNITY):
        relative = rel(root, path) if root.is_dir() else path.name
        if not selected(args, relative):
            continue
        container_sha = digest(path)
        output_index = output / "evidence" / ("unity-" + container_sha + ".json")
        existing_index = load_json(output_index) if output_index.exists() and not args.force else {}
        if existing_index.get("complete"):
            print(f"extract skip indexed: {relative}")
            continue
        if args.limit_files is not None and bundles >= args.limit_files:
            break
        bundles += 1
        old_images = {item["assetId"]: item for item in existing_index.get("images", [])}
        records = []
        complete = True
        try:
            environment = UnityPy.load(str(path))
            objects = environment.objects.values() if isinstance(environment.objects, dict) else environment.objects
            for obj in objects:
                if obj.type.name not in {"Sprite", "Texture2D"}:
                    continue
                asset_file = str(getattr(getattr(obj, "assets_file", None), "name", "unknown"))
                path_id = str(obj.path_id)
                asset_id = "unity:" + container_sha + ":" + asset_file + ":" + path_id + ":" + obj.type.name
                image_id = hashlib.sha256(asset_id.encode("utf-8")).hexdigest()
                target = output / "extracted" / image_id[:2] / (image_id + ".png")
                if asset_id in old_images and target.exists():
                    records.append(old_images[asset_id])
                    continue
                if args.limit_images is not None and images >= args.limit_images:
                    complete = False
                    break
                try:
                    data = obj.read() if hasattr(obj, "read") else obj.parse_as_object()
                    picture = data.image
                    if picture is None:
                        raise ValueError("Unity object contains no decodable image")
                    target.parent.mkdir(parents=True, exist_ok=True)
                    if not target.exists() or args.force:
                        picture.save(target, format="PNG")
                    records.append({
                        "assetId": asset_id, "assetName": str(getattr(data, "m_Name", "")),
                        "kind": obj.type.name, "pathId": path_id, "assetsFile": asset_file,
                        "containerPath": relative, "containerSha256": container_sha,
                        "path": rel(output / "extracted", target),
                        "extractedSha256": digest(target), "width": picture.width,
                        "height": picture.height
                    })
                    images += 1
                except Exception as exc:
                    failures.append({"container": relative, "pathId": str(obj.path_id), "error": str(exc)[:300]})
        except Exception as exc:
            complete = False
            failures.append({"container": relative, "error": str(exc)[:300]})
        save_json(output_index, {
            "schema": SCHEMA, "source": source_provenance(args),
            "container": relative, "containerSha256": container_sha,
            "complete": complete, "images": records
        })
        print(f"extract {relative}: {len(records)} images")
        if args.limit_images is not None and images >= args.limit_images:
            break
    save_json(output / "report" / "extract-latest.json", {
        "schema": SCHEMA, "bundlesAttempted": bundles, "images": images,
        "failures": failures, "source": source_provenance(args)
    })
    return 0


def read_r39(path):
    if path is None:
        return {}
    if path.is_dir():
        parts = sorted(path.glob("query-index.part[0-9][0-9]"))
        if not parts:
            raise FileNotFoundError("R39 query-index.partNN files not found.")
        numbers = [int(p.name[-2:]) for p in parts]
        if numbers != list(range(len(numbers))):
            raise ValueError("R39 query-index parts are incomplete.")
        binary = b"".join(p.read_bytes() for p in parts)
        data = json.loads(gzip.decompress(binary))
    else:
        with gzip.open(path, "rt", encoding="utf-8") as source:
            data = json.load(source)
    if data.get("gameVersion") != "1.24.13" or not isinstance(data.get("items"), list):
        raise ValueError("Unsupported R39 index or source version.")
    by_hash = defaultdict(set)
    for record in data["items"]:
        sha = record.get("icon", {}).get("sha256") if isinstance(record.get("icon"), dict) else None
        item_id = str(record.get("itemID", ""))
        if isinstance(sha, str) and HEXDIGEST.fullmatch(sha) and ITEM_ID.fullmatch(item_id):
            by_hash[sha].add(item_id)
    return by_hash


def read_external_mapping(path):
    result = defaultdict(list)
    if path is None:
        return result
    with path.open("r", encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream)
        if not reader.fieldnames or "item_id" not in reader.fieldnames:
            raise ValueError("Mapping CSV must contain item_id.")
        for line, row in enumerate(reader, 2):
            item = str(row.get("item_id", "")).strip()
            sha = str(row.get("source_sha256", "")).strip().lower()
            asset_id = str(row.get("asset_id", "")).strip()
            source_path = str(row.get("source_path", "")).strip().replace("\\", "/")
            evidence = str(row.get("evidence", "")).strip()
            if not ITEM_ID.fullmatch(item) or not (sha and HEXDIGEST.fullmatch(sha) or asset_id or source_path):
                raise ValueError(f"Invalid mapping CSV at line {line}")
            if source_path.startswith("/") or ".." in Path(source_path).parts:
                raise ValueError(f"Unsafe source_path at CSV line {line}")
            key = ("sha", sha) if sha else ("asset", asset_id) if asset_id else ("path", source_path)
            result[key].append({"itemId": item, "method": "supplied_mapping",
                                "evidence": evidence, "evidenceVerified": False})
    return result


def read_unity_evidence(output):
    index = defaultdict(list)
    for path in sorted((output / "evidence").glob("unity-*.json")):
        document = load_json(path)
        for item in document.get("images", []):
            index[item["path"]].append(item)
    return index


def read_existing_manifest(output, key):
    path = output / "manifest" / ("shard-" + key + ".json")
    return load_json(path) if path.exists() else {}


def generate_variant(image, max_edge, target, previous=None, verify=False):
    if previous and target.is_file() and previous.get("bytes") == target.stat().st_size:
        if not verify or previous.get("sha256") == digest(target):
            return previous, True
    target.parent.mkdir(parents=True, exist_ok=True)
    picture = image.copy()
    picture.thumbnail((max_edge, max_edge), Image.Resampling.LANCZOS)
    if picture.mode not in ("RGB", "RGBA"):
        picture = picture.convert("RGBA" if "A" in picture.getbands() or "transparency" in picture.info else "RGB")
    temporary = target.with_name(target.name + ".tmp")
    picture.save(temporary, format="WEBP", lossless=True, method=4, exact=True)
    temporary.replace(target)
    return {"path": target, "width": picture.width, "height": picture.height,
            "bytes": target.stat().st_size, "sha256": digest(target)}, False


def command_build(args):
    root, output = args.input.resolve(), args.output.resolve()
    assert_output_separate(root, output)
    r39 = read_r39(args.r39_index)
    supplied = read_external_mapping(args.mapping)
    unity = read_unity_evidence(output)
    for key in ([args.shard] if args.shard != "all" else list(SHARDS)):
        inventory_path = output / "inventory" / ("shard-" + key + ".json")
        if not inventory_path.exists():
            if args.shard != "all":
                raise FileNotFoundError(inventory_path)
            continue
        inventory = load_json(inventory_path)
        if Path(inventory["input"]).resolve() != root:
            raise ValueError(f"Inventory root mismatch: {inventory_path}")
        previous = read_existing_manifest(output, key)
        old = {entry["sourceSha256"]: entry for entry in previous.get("images", [])
               if entry.get("recipe") == RECIPE}
        result = []
        problems = []
        seen = defaultdict(list)
        count = 0
        truncated = False
        for record in inventory["records"]:
            if args.limit is not None and count >= args.limit:
                truncated = True
                break
            count += 1
            if record["status"] != "ok":
                problems.append({"type": record["status"], "path": record["path"],
                                 "error": record.get("error")})
                continue
            relative = record["path"]
            source = (root / relative).resolve()
            if root != source and root not in source.parents:
                problems.append({"type": "unsafe_path", "path": relative})
                continue
            if not source.exists() or digest(source) != record["sha256"]:
                problems.append({"type": "missing_or_changed_source", "path": relative})
                continue
            sha = record["sha256"]
            seen[sha].append(relative)
            links = [{"itemId": item, "method": "r39_exact_source_sha256",
                      "evidence": "R39 v1.24.13 query-index", "evidenceVerified": True}
                     for item in sorted(r39.get(sha, set()), key=int)]
            assets = [asset for asset in unity.get(relative, [])
                      if asset.get("extractedSha256") == sha]
            for selector in [("sha", sha), ("path", relative)] + [
                ("asset", item["assetId"]) for item in assets]:
                links.extend(supplied.get(selector, []))
            links = list({(link["itemId"], link["method"], link["evidence"]): link for link in links}.values())
            if not links:
                problems.append({"type": "unmapped_image", "path": relative, "sha256": sha})
                if not args.include_unmapped:
                    continue
            try:
                with Image.open(source) as image:
                    image.load()
                    width, height = image.size
                    outputs = {}
                    old_outputs = old.get(sha, {}).get("variants", {})
                    skipped = 0
                    for name, size in (("thumbnail", 128), ("detail", 512)):
                        target = output / "images" / name / sha[:2] / (sha + ".webp")
                        metadata, hit = generate_variant(
                            image, size, target, old_outputs.get(name), args.verify_existing)
                        metadata["path"] = rel(output, target)
                        outputs[name] = metadata
                        skipped += int(hit)
                    if args.keep_originals and max(width, height) > 512:
                        target = output / "images" / "original" / sha[:2] / (sha + ".png")
                        old_meta = old_outputs.get("original", {})
                        if not (target.is_file() and old_meta.get("bytes") == target.stat().st_size
                                and (not args.verify_existing or old_meta.get("sha256") == digest(target))):
                            target.parent.mkdir(parents=True, exist_ok=True)
                            temporary = target.with_name(target.name + ".tmp")
                            image.save(temporary, format="PNG")
                            temporary.replace(target)
                        outputs["original"] = {
                            "path": rel(output, target), "width": width, "height": height,
                            "bytes": target.stat().st_size, "sha256": digest(target)
                        }
                    if max(width, height) < 128:
                        problems.append({"type": "under_128px", "path": relative,
                                         "width": width, "height": height})
                    if max(width, height) < 512:
                        problems.append({"type": "under_512px", "path": relative,
                                         "width": width, "height": height})
                    result.append({
                        "sourcePath": relative, "sourceSha256": sha,
                        "sourceBytes": record["bytes"], "sourceFormat": record["format"],
                        "sourceDimensions": [width, height], "source": inventory["source"],
                        "assetIds": [item["assetId"] for item in assets],
                        "links": links, "variants": outputs, "recipe": RECIPE
                    })
                    old[sha] = {"variants": outputs}
            except (OSError, ValueError, UnidentifiedImageError, Image.DecompressionBombError) as exc:
                problems.append({"type": "decode_or_encode_failure", "path": relative,
                                 "error": str(exc)[:300]})
        for sha, paths in seen.items():
            if len(paths) > 1:
                problems.append({"type": "duplicate_source", "sha256": sha, "paths": paths})
        finished = inventory["complete"] and not truncated
        save_json(output / "manifest" / ("shard-" + key + ".json"), {
            "schema": SCHEMA, "shard": key, "complete": finished,
            "input": str(root), "source": inventory["source"], "images": result,
            "mappingNote": "R39 links require exact source PNG SHA-256. Other-version ID parity is not independently established.",
            "publicationApproved": False
        })
        save_json(output / "report" / ("shard-" + key + ".json"), {
            "schema": SCHEMA, "shard": key, "complete": finished,
            "scanned": count, "converted": len(result),
            "matched": sum(bool(x["links"]) for x in result), "problems": problems
        })
        print(f"build {key}: {len(result)} images, {len(problems)} findings, {'partial' if not finished else 'complete'}")
    return 0


def load_catalog(path):
    if path is None:
        return None
    files = sorted(path.glob("records-*.json")) if path.is_dir() else [path]
    ids = set()
    for item in files:
        if item.suffix.lower() == ".csv":
            with item.open(encoding="utf-8-sig", newline="") as handle:
                for row in csv.DictReader(handle):
                    ids.add(str(row.get("item_id") or row.get("itemId") or row.get("itemID")))
        elif item.suffix.lower() == ".jsonl":
            for line in item.read_text(encoding="utf-8").splitlines():
                if line.strip():
                    row = json.loads(line)
                    ids.add(str(row.get("itemId") or row.get("itemID") or row.get("item_id")))
        else:
            payload = load_json(item)
            records = payload.get("r", payload.get("items", [])) if isinstance(payload, dict) else payload
            for row in records:
                ids.add(str(row[0] if isinstance(row, list) else
                            row.get("itemId") or row.get("itemID") or row.get("item_id")))
    return {item for item in ids if ITEM_ID.fullmatch(item)}


def command_merge(args):
    output = args.output.resolve()
    images = []
    available = []
    problems = []
    completed = []
    provenance = set()
    for key in SHARDS:
        path = output / "manifest" / ("shard-" + key + ".json")
        if not path.exists():
            continue
        manifest = load_json(path)
        available.append(key)
        provenance.add((manifest.get("input"), json.dumps(manifest.get("source"), sort_keys=True)))
        if manifest.get("complete"):
            completed.append(key)
        images.extend(manifest.get("images", []))
        report = output / "report" / ("shard-" + key + ".json")
        if report.exists():
            problems.extend(load_json(report).get("problems", []))
    matched = defaultdict(list)
    source_hashes = defaultdict(list)
    for key in available:
        inventory_path = output / "inventory" / ("shard-" + key + ".json")
        if inventory_path.exists():
            for record in load_json(inventory_path).get("records", []):
                if record.get("status") == "ok" and record.get("sha256"):
                    source_hashes[record["sha256"]].append(record["path"])
    for image in images:
        for link in image.get("links", []):
            matched[link["itemId"]].append(image)
    conflicts = {}
    for item, records in matched.items():
        hashes = {record["sourceSha256"] for record in records}
        if len(hashes) > 1:
            conflicts[item] = sorted(hashes)
    for sha, paths in source_hashes.items():
        if len(paths) > 1:
            problems.append({"type": "duplicate_source_all_shards",
                             "sha256": sha, "paths": sorted(paths)})
    catalog = load_catalog(args.catalog)
    missing = sorted(catalog - set(matched), key=int) if catalog is not None else None
    mapped = {}
    for item, records in matched.items():
        if item in conflicts:
            continue
        first = records[0]
        mapped[item] = {
            "sourceSha256": first["sourceSha256"], "variants": first["variants"],
            "links": [link for record in records for link in record["links"]
                      if link["itemId"] == item], "source": first["source"],
            "assetIds": first["assetIds"]
        }
    if len(provenance) > 1:
        problems.append({"type": "mixed_input_or_provenance", "sources": [
            {"input": item[0], "source": json.loads(item[1])} for item in sorted(provenance)
        ]})
    complete = len(completed) == 16 and len(provenance) == 1
    save_json(output / "manifest.json", {
        "schema": SCHEMA, "complete": complete, "shards": available,
        "publicationApproved": False, "items": mapped, "images": images,
        "ambiguousItemIds": conflicts
    })
    save_json(output / "report.json", {
        "schema": SCHEMA, "complete": complete, "shardsPresent": available,
        "shardsComplete": completed, "images": len(images),
        "mappedItemIds": len(mapped), "ambiguousItemIds": conflicts,
        "catalogItemIds": len(catalog) if catalog is not None else None,
        "missingItemIds": missing, "problems": problems,
        "publicationApproved": False
    })
    print(f"merge: {len(images)} images, {len(mapped)} unambiguous item IDs, "
          f"{len(conflicts)} conflicting item IDs, complete={complete}")
    return 0


def main():
    parser = argparse.ArgumentParser(description="Dreamwish Wand local-only media inspection and conversion")
    sub = parser.add_subparsers(dest="action", required=True)
    scan = sub.add_parser("scan", help="Inspect local images and Unity containers")
    extract = sub.add_parser("extract", help="Extract a bounded sample from Unity assets")
    build = sub.add_parser("build", help="Create local WebP variants from scanned images")
    merge = sub.add_parser("merge", help="Combine local shard outputs and mapping reports")
    for command in (scan, extract, build):
        command.add_argument("--input", type=Path, required=True)
        command.add_argument("--output", type=Path, required=True)
        command.add_argument("--shard", choices=["all", *SHARDS], default="all")
    for command in (scan, extract):
        command.add_argument("--platform", required=True)
        command.add_argument("--game-version", required=True)
        command.add_argument("--build-id", default=None)
    scan.add_argument("--limit", type=int)
    extract.add_argument("--limit-files", type=int, default=2)
    extract.add_argument("--limit-images", type=int, default=20)
    extract.add_argument("--force", action="store_true")
    build.add_argument("--limit", type=int)
    build.add_argument("--r39-index", type=Path)
    build.add_argument("--mapping", type=Path)
    build.add_argument("--include-unmapped", action="store_true")
    build.add_argument("--keep-originals", action="store_true")
    build.add_argument("--verify-existing", action="store_true")
    merge.add_argument("--output", type=Path, required=True)
    merge.add_argument("--catalog", type=Path)
    args = parser.parse_args()
    if getattr(args, "limit", None) is not None and args.limit < 1:
        parser.error("--limit must be a positive integer")
    try:
        return {"scan": command_scan, "extract": command_extract,
                "build": command_build, "merge": command_merge}[args.action](args)
    except (OSError, ValueError, RuntimeError, KeyError, json.JSONDecodeError) as exc:
        parser.exit(2, f"error: {exc}\n")


if __name__ == "__main__":
    raise SystemExit(main())
'@
Install-EmbeddedSource -name 'media.py' -content $embedded
Remove-Variable embedded

$embedded = @'
import argparse
import hashlib
import json
import os
import re
import tempfile
import zipfile
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

SCHEMA = "wand.src01.steam-native@1"
GAME_VERSION = "1.26.2"
FULLVERSION_SHA256 = "e0aad8c7c19ebd3f441161db4d27f7838dd62b261927a974793f54fc0a81fc98"
CATEGORIES = {
    "ActivityItem": (30000000, "4f4d3393887aececfcef16569cebc8dd7df08d03ba7b7c89083fe15bb7309dc2"),
    "Furniture": (40000000, "cde1b6e4dd37085e829c2e4548b89091bbf8d543cee92e6031b2f5bddc794196"),
    "Clothing": (50000000, "a327869947785d3bbe0455b6132873b63878cb6cbb8dbd4cd00f76b294d1e946"),
    "Trimming": (160000000, "a330a5b44860faece7eecb9c07acf3064b15010c97837d9d450f54a7b2ff966c"),
}
LOCALES = {
    "en": "en-US", "fr": "fr", "it": "it", "de": "de",
    "es-ES": "es", "ja": "ja", "zh-CN": "zh-CN", "pt-BR": "pt-BR",
}
GUID = re.compile(r"guid:[0-9a-f]{32}\Z")
VERSION = re.compile(r"(?<![0-9.])(?:v)?(1\.26\.2)(?![0-9.])")


def sha(data):
    return hashlib.sha256(data).hexdigest()


def varint(data, pos):
    begin = pos
    value = 0
    for i in range(10):
        if pos >= len(data):
            raise ValueError("TRUNCATED_VARINT")
        byte = data[pos]
        pos += 1
        if i == 9 and byte > 1:
            raise ValueError("OVERFLOW_VARINT")
        value |= (byte & 127) << (7 * i)
        if byte < 128:
            if data[begin:pos] != encode_varint(value):
                raise ValueError("NON_CANONICAL_VARINT")
            return value, pos
    raise ValueError("UNTERMINATED_VARINT")


def encode_varint(value):
    if value < 0:
        raise ValueError("NEGATIVE_VARINT")
    result = bytearray()
    while value >= 128:
        result.append((value & 127) | 128)
        value >>= 7
    result.append(value)
    return bytes(result)


def parse_record(data, category, offset):
    fields = {}
    position = 0
    while position < len(data):
        tag, position = varint(data, position)
        field, wire = tag >> 3, tag & 7
        if field == 0:
            raise ValueError("INVALID_FIELD_ZERO")
        if wire == 0:
            value, position = varint(data, position)
        elif wire in (1, 5):
            size = 8 if wire == 1 else 4
            if position + size > len(data):
                raise ValueError("TRUNCATED_FIXED_FIELD")
            value = data[position:position + size]
            position += size
        elif wire == 2:
            size, position = varint(data, position)
            if size > len(data) - position:
                raise ValueError("TRUNCATED_LENGTH_FIELD")
            value = data[position:position + size]
            position += size
        else:
            raise ValueError("UNSUPPORTED_WIRE_TYPE")
        if field in (1, 2, 4):
            if field in fields or wire != (0 if field == 1 else 2):
                raise ValueError("MALFORMED_REQUIRED_FIELD")
            fields[field] = value
    if set(fields) != {1, 2, 4}:
        raise ValueError("MISSING_REQUIRED_FIELDS")
    item_id = fields[1]
    if type(item_id) is not int or item_id <= 0 or item_id >= 2**53:
        raise ValueError("UNSAFE_ITEM_ID")
    if item_id - CATEGORIES[category][0] != offset:
        raise ValueError("ITEM_FRAME_KEY_MISMATCH")
    try:
        raw_name = fields[2].decode("utf-8")
        icon_guid = fields[4].decode("ascii")
    except UnicodeDecodeError as error:
        raise ValueError("INVALID_TEXT_ENCODING") from error
    if not raw_name or len(raw_name) > 1024 or not GUID.fullmatch(icon_guid):
        raise ValueError("INVALID_NATIVE_NAME_OR_GUID")
    return {
        "itemId": item_id, "rawNameField": raw_name, "nativeCategory": category,
        "iconGuid": icon_guid,
        "names": {name: None for name in LOCALES},
        "category": None, "subcategory": None, "internalIdentifier": None,
        "worlds": [], "universes": [], "expansions": [], "attributes": {},
        "source": {"platform": "Steam", "gameVersion": GAME_VERSION,
                   "file": f"ddv_Data/StreamingAssets/itemlist/{category}.json",
                   "wireFields": {"itemId": 1, "rawName": 2, "iconGuid": 4}},
    }


def parse_category(data, category):
    if category not in CATEGORIES or len(data) > 32 * 1024 * 1024:
        raise ValueError("INVALID_CATEGORY_OR_SOURCE_SIZE")
    position = 0
    rows = []
    frames = set()
    while position < len(data):
        offset, position = varint(data, position)
        length, position = varint(data, position)
        if offset in frames or not length or length > 1024 * 1024 or length > len(data) - position:
            raise ValueError("INVALID_OR_DUPLICATE_FRAME")
        frames.add(offset)
        row = parse_record(data[position:position + length], category, offset)
        position += length
        rows.append(row)
        if len(rows) > 20000:
            raise ValueError("EXCESSIVE_ROW_COUNT")
    if not rows:
        raise ValueError("EMPTY_NATIVE_CATEGORY")
    return rows


def atomic_json(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp = tempfile.mkstemp(prefix=".src01-", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as stream:
            json.dump(payload, stream, ensure_ascii=False, indent=2, sort_keys=True)
            stream.write("\n")
        os.replace(temp, path)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)


def atomic_items(path, items):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp = tempfile.mkstemp(prefix=".src01-", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as stream:
            for item in items:
                stream.write(json.dumps(item, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n")
        os.replace(temp, path)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)


def inspect_locales(game):
    reports = {}
    for name, suffix in LOCALES.items():
        file = game / "ddv_Data" / "StreamingAssets" / "Localization" / f"LocDB_{suffix}.zip"
        if not file.is_file() or file.is_symlink():
            reports[name] = {"status": "missing"}
            continue
        try:
            with zipfile.ZipFile(file) as archive:
                files = [entry for entry in archive.infolist() if not entry.is_dir()]
                reports[name] = {
                    "status": "archive_inspected_only", "archiveBytes": file.stat().st_size,
                    "entryCount": len(files), "uncompressedBytes": sum(e.file_size for e in files),
                    "entriesSample": [{"name": e.filename[:240], "bytes": e.file_size} for e in files[:30]],
                }
        except (OSError, ValueError, zipfile.BadZipFile) as error:
            reports[name] = {"status": "unreadable", "reason": type(error).__name__}
    return reports


def run(game, out):
    game = game.resolve(strict=True)
    out = out.resolve()
    if not game.is_dir() or game == out or game in out.parents or out in game.parents:
        raise ValueError("INVALID_GAME_OR_OUTPUT_PATH")
    version_path = game / "FullVersion.txt"
    if not version_path.is_file() or sha(version_path.read_bytes()) != FULLVERSION_SHA256:
        raise ValueError("STEAM_1262_VERSION_FILE_SHA_MISMATCH")
    version = version_path.read_text(encoding="utf-8-sig")
    if VERSION.search(version) is None:
        raise ValueError("GAME_VERSION_NOT_1262")
    items = []
    sources = []
    for category, (_, expected_sha) in CATEGORIES.items():
        file = game / "ddv_Data" / "StreamingAssets" / "itemlist" / (category + ".json")
        if file.is_symlink() or not file.is_file():
            raise ValueError(f"MISSING_NATIVE_CATEGORY_{category}")
        data = file.read_bytes()
        actual_sha = sha(data)
        if actual_sha != expected_sha:
            raise ValueError(f"STEAM_1262_CATEGORY_SHA_MISMATCH_{category}")
        rows = parse_category(data, category)
        items.extend(rows)
        sources.append({"path": file.relative_to(game).as_posix(), "sha256": actual_sha, "bytes": len(data), "count": len(rows)})
    items.sort(key=lambda row: row["itemId"])
    ids = [row["itemId"] for row in items]
    if len(ids) != len(set(ids)):
        raise ValueError("DUPLICATE_CROSS_CATEGORY_ITEM_ID")
    locale_reports = inspect_locales(game)
    collisions = defaultdict(list)
    for row in items:
        collisions[row["rawNameField"].casefold()].append(row["itemId"])
    ambiguous = {key: ids for key, ids in collisions.items() if len(ids) > 1}
    out.mkdir(parents=True, exist_ok=True)
    items_path = out / "items.jsonl"
    atomic_items(items_path, items)
    items_hash = hashlib.sha256(items_path.read_bytes()).hexdigest()
    atomic_json(out / "localization-structure.json", {"schema": "wand.src01.localization-survey@1", "archives": locale_reports,
        "note": "ZIP directory evidence does not establish any localized item-name mapping."})
    manifest = {"schema": SCHEMA, "status": "partial_native_extraction", "platform": "Steam",
                "gameVersion": GAME_VERSION, "createdUtc": datetime.now(timezone.utc).isoformat(),
                "itemCount": len(items), "itemsFile": "items.jsonl", "itemsSha256": items_hash,
                "sourceFiles": sources, "versionFileSha256": FULLVERSION_SHA256,
                "validatedNativeCategories": list(CATEGORIES), "sourceRoot": str(game),
                "locales": list(LOCALES), "languageNamesVerified": False}
    atomic_json(out / "manifest.json", manifest)
    atomic_json(out / "report.json", {"schema": "wand.src01.report@1", "status": "partial_native_extraction",
        "nativeItemCount": len(items), "categoryCounts": dict(Counter(row["nativeCategory"] for row in items)),
        "sameRawNameDifferentIdCount": len(ambiguous), "sameRawNameDifferentIdSample": list(ambiguous.items())[:30],
        "localizationArchiveStatus": {key: value["status"] for key, value in locale_reports.items()},
        "sourceOnly": True, "namesVerified": 0,
        "explanation": "Four SHA-pinned Steam 1.26.2 protobuf itemlists decoded. Other itemlist types and localization are pending verified mappings."})
    atomic_json(out / "unresolved.json", {"schema": "wand.src01.unresolved@1", "status": "pending_source_mappings",
        "missing": ["Localization file format and ItemID-to-localization-key mapping",
                    "Verified official names for eight locales", "All other itemlist category schemas",
                    "Validated user-facing category and subcategory semantics", "Expansion, world, universe and attributes mappings",
                    "Comparison against the older Switch 1.25.0 Collection"],
        "notClaims": ["not a complete game item catalog", "not verified official display names",
                      "not an image extraction", "not a game save editor"]})
    print(json.dumps({"status": "partial_native_extraction", "gameVersion": GAME_VERSION,
                      "items": len(items), "out": str(out)}, ensure_ascii=False))


def main():
    parser = argparse.ArgumentParser(description="SRC-01 verified Steam 1.26.2 native item extraction")
    parser.add_argument("--game", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    options = parser.parse_args()
    try:
        run(options.game, options.out)
    except (OSError, ValueError, UnicodeError, zipfile.BadZipFile) as error:
        parser.exit(1, f"SRC-01 error: {error}\n")


if __name__ == "__main__":
    main()
'@
Install-EmbeddedSource -name 'steam1262.py' -content $embedded
Remove-Variable embedded

$embedded = @'
bundle,sha256,bytes
accessory_93d391f5.bundle,88279ff22cfa04d4f03e166bdb5c5e21c29599c9287f5ce1ec881d7643a36034,2908135
buffelixir_01c14456.bundle,6cc0b1e14dd31f5b2240f5402c98850958afe52da67f7f32df0d88810ad1cc4b,415302
clothing_27c843ba.bundle,b3aee003732de2f51176327a64c5db6164ea95ea82a55828ad9b6693b589cb2a,180318196
companionsiconszoomed_866439f0.bundle,36b9d382d8a3872d426380def20935ec20c02b17f9d57d9ec12e8fb3ebac6387,25008264
consummable_4e5fc59f.bundle,58a24908b8fb4a134dffec0bf4e5b48696b7dcb23424d685876b5e4d1ec3f701,975645
craftingmaterial_a01be543.bundle,ad87f28063cab781c75bfd693360c464dce20106c94d4ef29e7f719d8dbe45de,5224388
crop_7563a03a.bundle,8668ccc332b1b64fc9e384d7355967d4f4247d874cd06e243f73a3cb4e04b46d,5504997
default_6f9a5e20.bundle,0c11ef920dba52064ff39ba2e21a5e308c6903a0ed7b3896a1d505445caeee7b,2527637
door_4ddfda60.bundle,c00a6b3a8e4b8f766636d181736df5d695ac1bedd644e6950c09dfc327a4d85d,129281
ephemeral_a081feaa.bundle,5ea1d2d06121229847b00a1da35f50a2c5f4af0f4504ce5f0506c4db294055b4,301274
figurine_82c36648.bundle,8014339e9549685b8c86cf0af0cb0b20ac72d00044e376a2c2cabb4a3cf051a9,4882640
fish_3f084647.bundle,b4cbdda9001cff933c7e866dc12d9130821bdc817a9799f4618ebe54c3123bb7,4294583
fishing_06c7629f.bundle,01ea27361328766958605be5b42301b5863add4343051203c9f0392ba44c6d65,495815
flooring_c1cd0f20.bundle,9c00cef9479c391284f8488a917694960dd1e666c7d58d578ee8dc9a1beb598a,91538
flower_584a9f69.bundle,56f00224254589aa05a1daacdcfd94122a69322fa0326d0594d511a520acc21e,3993430
furniture_a1c425a5.bundle,f65dc5cb939b2610c18f56e36ea3421c77a66c1ab25e5172bf3b431576e39beb,256404264
garden_ef2b594e.bundle,db05763b18a77505f64e3193ca8989ea6cdd20a6b86065dfd847abc8cf4a5a1f,150492
gardening_1acbbfe2.bundle,c37c6bc81562be6211b1f3a405bd0e86d5aefaddedfe8fc927908d9edd657109,410959
house_1de2b62e.bundle,44170a6447d37327b1909798d74aca71cb5c3c655c354f057333e475f037617c,3029201
ingredient_1c1bf99b.bundle,886ced019468b07e5da741e5b30f9f7ee8ee7830811358ff581b7f65bcd25101,1926798
lootpresent_3acec346.bundle,079bd799d3f7a90317aa91283f372f2a11c2d43209e8fe280d6fdca8ed238d16,1907508
makeup_a897632c.bundle,144073475b331d2427dde2eba50304cd04696f2485be01efc243da7bde847cc2,14926592
manual_4976fcd4.bundle,ba67d8fce950361f17ec21f4d80890bd1bfba4dd499b64230634c7868187dc43,743828
meal_7a31d699.bundle,0c2f4db708ad6ae2b442a5dea2381957eff23e835f048afe47303ba7ef268ee4,25523698
mineral_6fc39434.bundle,4e3d4d7af58737078bfbd037b0b3c2eda6d15aec19071e22fef7cfd96a646293,7365400
mining_a215ab98.bundle,b6d526891b4f3e37c328ac3ad3e58c4d37d7bf1d20d94303535aab4039f120d6,566351
misc_2a73e043.bundle,53e3a32c39e171e485cc4dad19d989338397b81d6314b194535851322f1ff926,584716
mountgear_a5c17caf.bundle,1f5c69db63d108814364d13bfeb329afb97722cf52c5340d114ad2db778d7e93,1018374
mulan_d1fa1c4b.bundle,e7f1d7a69d0e747ecc5f63f4997fa8a394da6e7a8a3f3eb2275bd01730fa822c,136252
other_650458c6.bundle,5deda8914f846005ffaf472390ac2de1873e90112fd8960ee95ae050f3f45d32,1635961
pet_0b37582d.bundle,067150141241bfaf0929798a35213b519cec6c0c8ef9a64ba566c69212d5e0a7,10283702
playerhouse_496f74b9.bundle,6d8866214dd8cd0430308e6ae2a3396ae847575ab9c0d0bf687932817dffa350,14366738
requestitem_50cb67ab.bundle,c2d493f4413f08dec56f88feba19973a28832823d2d5ad7e109b243157990533,33708372
seed_8c733f88.bundle,c5ff6e53a9a847178e2cce5b2ddb9d1cc8a7e420cc9c17c8b78a9a8db50e2d9a,6618740
skin_47c97353.bundle,aedfa3a1e1af8e122c69a8be4f26d58ec0cbf5410a2e706eb287c111a76ee051,3223529
sprintvfx_05b864d0.bundle,62682e03f03bbeec5ec53534d6018139fc1b48ba69453ff4a4ff81ec5f04523b,1101696
stall_7e96492d.bundle,a8244192b7c754119cb67a14e8273e3d02be5d38c5ff48c470aab3f73a3d52d1,704703
timebending_02f26f45.bundle,9af24a8ad204b353453bbda8938450cac5a3cf4a00fc671b98be5f873fec1981,738931
wallpaper_753ee7b6.bundle,820048cc5d23d6b58cd1d4a54827cfd74bf60cb9b20fb066c0b5ab3ca1165dc8,128625
watering_e5ad3236.bundle,3d0f30e43c4e8f694c8f85b8528dfc4bed872143c59387a7f04e7211dcb2de23,884767
'@
Install-EmbeddedSource -name 'source-index-1262.csv' -content $embedded
Remove-Variable embedded

$embedded = @'
Pillow>=10.0
UnityPy>=1.20
'@
Install-EmbeddedSource -name 'requirements-unity.txt' -content $embedded
Remove-Variable embedded

$main = Join-Path $install 'native1262.py'
$requirements = Join-Path $install 'requirements-unity.txt'
if (-not (Test-Path -LiteralPath $game -PathType Container)) {
    throw "Steam game folder not found: $game"
}

$modulesReady = $false
try {
    & py -3 -c "import PIL, UnityPy" *> $null
    $modulesReady = ($LASTEXITCODE -eq 0)
} catch {
    $modulesReady = $false
}
if (-not $modulesReady) {
    Write-Host 'Installing image dependencies with pip (Pillow + UnityPy)...'
    & py -3 -m pip install --user -r $requirements
    if ($LASTEXITCODE -ne 0) {
        throw 'Python dependency installation failed'
    }
}
Write-Host 'SRC-04: verifying Steam 1.26.2 source and extracting the first two icon bundles...'
& py -3 $main --game $game --out $out --limit-bundles 2
if ($LASTEXITCODE -ne 0) {
    throw "SRC-04 sample failed. Local report: $out\report-native.json"
}

if (-not $SampleOnly) {
    $runArgs = @('-3', $main, '--game', $game, '--out', $out, '--limit-bundles', '0')
    if ($KeepOriginals) { $runArgs += '--keep-originals' }
    if ($VerifyExisting) { $runArgs += '--verify-existing' }
    Write-Host 'SRC-04: processing all 40 SHA-pinned icon bundles (incremental, resume enabled)...'
    & py @runArgs
    if ($LASTEXITCODE -ne 0) {
        throw "Some bundle jobs failed. Local report: $out\report-native.json"
    }
}

# Persist PRIVATE JSON-only evidence if Google Drive for Desktop already
# synchronizes the exact folder. Never sync game images or source binaries.
$roots = @(
    'G:\My Drive',
    'G:\マイドライブ',
    (Join-Path $env:USERPROFILE 'My Drive'),
    (Join-Path $env:USERPROFILE 'Google Drive\My Drive')
)
$syncFolder = $null
foreach ($root in $roots) {
    $candidate = Join-Path $root 'Dreamwish Wand\Development\Sources\SRC-04 MEDIA'
    if (Test-Path -LiteralPath $candidate -PathType Container) {
        $syncFolder = $candidate
        break
    }
}
if ($syncFolder) {
    foreach ($file in @('manifest-native.json', 'report-native.json')) {
        $source = Join-Path $out $file
        if (Test-Path -LiteralPath $source) {
            Copy-Item -LiteralPath $source -Destination (Join-Path $syncFolder $file) -Force
        }
    }
    $catalogProbe = Join-Path $out 'evidence\catalog-probe.json'
    if (Test-Path -LiteralPath $catalogProbe) {
        Copy-Item -LiteralPath $catalogProbe -Destination (Join-Path $syncFolder 'catalog-probe.json') -Force
    }
    Write-Host 'SRC-04 private JSON reports copied to Google Drive for Desktop sync.'
} else {
    Write-Host 'SRC-04 Google Drive Desktop sync folder not found; JSON reports remain locally saved.'
}
Write-Host "SRC-04 complete. Output: $out"
Write-Host "SRC-04 report: $(Join-Path $out 'report-native.json')"
Write-Host 'No game asset or derived game image was uploaded or published.'
