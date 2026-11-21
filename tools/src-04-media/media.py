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
    return {"platform": args.platform, "gameVersion": args.game_version, "buildId": args.build_id}


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
        if args.limit_files is not None and bundles >= args.limit_files:
            break
        bundles += 1
        container_sha = digest(path)
        output_index = output / "evidence" / ("unity-" + container_sha + ".json")
        existing_index = load_json(output_index) if output_index.exists() and not args.force else {}
        if existing_index.get("complete"):
            print(f"extract skip indexed: {relative}")
            continue
        old_images = {item["assetId"]: item for item in existing_index.get("images", [])}
        records = []
        complete = True
        try:
            environment = UnityPy.load(str(path))
            for obj in environment.objects:
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
            assets = unity.get(relative, [])
            for selector in [("sha", sha), ("path", relative)] + [
                ("asset", item["assetId"]) for item in assets]:
                links.extend(supplied.get(selector, []))
            links = list({(link["itemId"], link["method"], link["evidence"]): link for link in links}.values())
            if not links and not args.include_unmapped:
                problems.append({"type": "unmapped_image", "path": relative, "sha256": sha})
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
    for image in images:
        source_hashes[image["sourceSha256"]].append(image["sourcePath"])
        for link in image.get("links", []):
            matched[link["itemId"]].append(image)
    conflicts = {}
    for item, records in matched.items():
        hashes = {record["sourceSha256"] for record in records}
        if len(hashes) > 1:
            conflicts[item] = sorted(hashes)
    for sha, paths in source_hashes.items():
        if len(paths) > 1:
            problems.append({"type": "duplicate_source_cross_shard",
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
