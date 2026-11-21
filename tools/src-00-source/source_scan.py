import argparse
import hashlib
import json
import os
import re
import sys
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

SCHEMA = 1
CHECKPOINT_INTERVAL = 128
SAMPLES = 20


def utc_now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def write_json(path, value):
    temp = path.with_name(path.name + ".tmp")
    with temp.open("w", encoding="utf-8", newline="\n") as handle:
        json.dump(value, handle, ensure_ascii=False, indent=2, sort_keys=True)
        handle.write("\n")
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temp, path)


def load_json(path):
    if not path.is_file():
        return None
    try:
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    except (OSError, ValueError):
        return None


def is_within(path, parent):
    return path == parent or parent in path.parents


def root_key(path):
    normalized = os.path.normcase(os.path.normpath(str(path)))
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def file_metadata(stat):
    return {
        "size": stat.st_size,
        "mtime_ns": str(stat.st_mtime_ns),
        "ctime_ns": str(stat.st_ctime_ns),
        "device": str(stat.st_dev),
        "inode": str(stat.st_ino),
    }


def cache_matches(record, metadata):
    return record and record.get("sha256") and all(record.get(key) == value for key, value in metadata.items())


def kind_of(relative):
    lower = relative.lower()
    name = lower.rsplit("/", 1)[-1]
    if name == "global-metadata.dat" or "il2cpp_data/" in lower or name == "gameassembly.dll":
        return "il2cpp"
    if name in ("unityplayer.dll", "globalgamemanagers", "resources.assets", "boot.config", "app.info") or name.endswith((".assets", ".bundle", ".unity3d")):
        return "unity"
    if "/extracted/" in "/" + lower or "/dump/" in "/" + lower or "/dumps/" in "/" + lower or "/typetrees/" in "/" + lower:
        return "existing_extraction"
    if "/localization/" in "/" + lower or "/localisation/" in "/" + lower or "/locales/" in "/" + lower or "/languages/" in "/" + lower or "stringtable" in name or name.endswith((".locres", ".po", ".mo")):
        return "localization"
    if name.endswith((".nca", ".nsp", ".xci", ".nso")) or "/exefs/" in "/" + lower or "/romfs/" in "/" + lower or name == "main.npdm":
        return "switch_content"
    if "/streamingassets/" in "/" + lower or name.endswith((".ress", ".resource", ".assetbundle", ".ab", ".bank", ".fsb", ".wem", ".png", ".jpg", ".jpeg", ".dds", ".webp", ".ogg")):
        return "assets"
    if name.endswith((".json", ".csv", ".tsv", ".xml", ".txt", ".bytes")):
        return "data_or_extracted"
    return "other"


def inspect_platform(root, paths):
    pc = [p for p in paths if p.lower().rsplit("/", 1)[-1] in ("gameassembly.dll", "unityplayer.dll")]
    steam = [p for p in paths if p.lower().rsplit("/", 1)[-1] in ("steam_api64.dll", "steam_api.dll") or re.fullmatch(r"appmanifest_\d+\.acf", p.lower().rsplit("/", 1)[-1])]
    switch = [p for p in paths if p.lower().endswith(("/exefs/main", "/exefs/main.nso", "/exefs/main.npdm", ".nca", ".nsp", ".xci", ".nso")) or p.lower().startswith(("exefs/", "romfs/")) or "/exefs/" in p.lower() or "/romfs/" in p.lower()]
    for relative in paths:
        if relative.lower().rsplit("/", 1)[-1] not in ("main", "main.nso"):
            continue
        try:
            with (root / Path(relative)).open("rb") as handle:
                if handle.read(4) == b"NSO0" and relative not in switch:
                    switch.append(relative)
        except OSError:
            pass
    steam_roots = {p.rpartition("/")[0] for p in pc if p.lower().endswith("gameassembly.dll")}
    switch_roots = {p.lower().split("/exefs/")[0] if "/exefs/" in p.lower() else "" for p in switch if p.lower().endswith(("/exefs/main", "/exefs/main.nso"))}
    if len(steam_roots) > 1 or len(switch_roots) > 1:
        return "conflict", {"steam": steam[:SAMPLES], "windows_pc": pc[:SAMPLES], "switch": switch[:SAMPLES], "reason": "multiple installation roots"}
    if (steam or pc) and switch:
        return "conflict", {"steam": steam[:SAMPLES], "windows_pc": pc[:SAMPLES], "switch": switch[:SAMPLES]}
    if steam:
        return "steam", {"steam": steam[:SAMPLES], "windows_pc": pc[:SAMPLES]}
    if switch:
        return "switch", {"switch": switch[:SAMPLES]}
    if pc:
        return "pc_unverified", {"windows_pc": pc[:SAMPLES]}
    return "unknown", {}


def read_switch_build_id(root, paths, errors):
    found = []
    candidates = [p for p in paths if p.lower().rsplit("/", 1)[-1] in ("main", "main.nso")]
    for relative in candidates:
        try:
            with (root / Path(relative)).open("rb") as handle:
                header = handle.read(0x60)
            if len(header) < 0x60 or header[:4] != b"NSO0":
                continue
            raw = header[0x40:0x60]
            if raw == b"\x00" * 32:
                continue
            found.append({"value": raw.hex().upper(), "short_id": raw[:8].hex().upper(), "source": relative, "type": "nso0_header"})
        except OSError as exc:
            errors.append({"operation": "read_nso_header", "path": relative, "reason": type(exc).__name__})
    values = {entry["value"] for entry in found}
    return {
        "value": found[0]["value"] if len(values) == 1 else None,
        "status": "verified" if len(values) == 1 else "conflict" if len(values) > 1 else "unconfirmed",
        "evidence": found[:SAMPLES],
    }


def read_steam_build_id(root, paths, errors):
    found = []
    for relative in paths:
        name = relative.lower().rsplit("/", 1)[-1]
        if not re.fullmatch(r"appmanifest_\d+\.acf", name):
            continue
        file = root / Path(relative)
        try:
            if file.stat().st_size > 1024 * 1024:
                continue
            data = file.read_bytes().decode("utf-8-sig", errors="replace")
            match = re.search(r'"buildid"\s+"(\d+)"', data, re.I)
            app = re.search(r'"appid"\s+"(\d+)"', data, re.I)
            if match:
                found.append({"value": match.group(1), "app_id": app.group(1) if app else None, "source": relative, "type": "steam_appmanifest"})
        except OSError as exc:
            errors.append({"operation": "read_appmanifest", "path": relative, "reason": type(exc).__name__})
    values = {entry["value"] for entry in found}
    return {
        "value": found[0]["value"] if len(values) == 1 else None,
        "status": "verified" if len(values) == 1 else "conflict" if len(values) > 1 else "unconfirmed",
        "evidence": found[:SAMPLES],
    }


VERSION_PATTERN = re.compile(r"(?<![0-9.])(?:v)?([0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,4}(?:\.[0-9]{1,4})?)(?![0-9.])", re.I)


def read_game_version(root, paths, supplied, errors):
    evidence = []
    for relative in paths:
        if relative.lower().rsplit("/", 1)[-1] != "fullversion.txt":
            continue
        file = root / Path(relative)
        try:
            if file.stat().st_size > 4096:
                continue
            raw = file.read_bytes()
            if b"\x00" in raw:
                data = raw.decode("utf-16", errors="replace")
            else:
                data = raw.decode("utf-8-sig", errors="replace")
            matches = sorted(set(VERSION_PATTERN.findall(data)))
            if len(matches) == 1:
                evidence.append({"source": relative, "value": matches[0], "type": "fullversion_text"})
            elif len(matches) > 1:
                errors.append({"operation": "read_game_version", "path": relative, "reason": "Multiple candidate versions in the same file"})
        except OSError as exc:
            errors.append({"operation": "read_game_version", "path": relative, "reason": type(exc).__name__})
    values = {entry["value"] for entry in evidence}
    if len(values) > 1 or (len(values) == 1 and supplied and supplied not in values):
        errors.append({"operation": "read_game_version", "reason": "Conflicting game version evidence"})
        return {"value": None, "status": "conflict", "evidence": evidence[:SAMPLES]}
    if len(values) == 1:
        return {"value": next(iter(values)), "status": "verified_from_file", "evidence": evidence[:SAMPLES]}
    return {"value": supplied, "status": "user_provided" if supplied else "unconfirmed", "evidence": []}


def hash_file(path):
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(4 * 1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def inventory(root, errors, skipped):
    items = []
    def on_error(error):
        errors.append({"operation": "enumerate_directory", "reason": type(error).__name__})
    for folder, directories, filenames in os.walk(root, topdown=True, followlinks=False, onerror=on_error):
        folder_path = Path(folder)
        remaining = []
        for name in sorted(directories):
            child = folder_path / name
            rel = child.relative_to(root).as_posix()
            if child.is_symlink() or (hasattr(child, "is_junction") and child.is_junction()) or not is_within(child.resolve(), root):
                skipped.append(rel)
            else:
                remaining.append(name)
        directories[:] = remaining
        for name in sorted(filenames):
            path = folder_path / name
            relative = path.relative_to(root).as_posix()
            if path.is_symlink():
                skipped.append(relative)
            else:
                items.append((relative, path))
    items.sort(key=lambda item: item[0])
    return items


def previous_map(record, key):
    if not isinstance(record, dict) or record.get("schema_version") != SCHEMA or record.get("root_key") != key:
        return {}
    files = record.get("files", [])
    if not isinstance(files, list):
        return {}
    return {item["path"]: item for item in files if isinstance(item, dict) and "path" in item}


def make_diff(old, current, key):
    old_files = previous_map(old, key)
    new_files = {item["path"]: item for item in current}
    added = sorted(new_files.keys() - old_files.keys())
    removed = sorted(old_files.keys() - new_files.keys())
    modified = sorted(p for p in new_files.keys() & old_files.keys() if new_files[p]["sha256"] != old_files[p].get("sha256"))
    metadata_only = sorted(p for p in new_files.keys() & old_files.keys() if new_files[p]["sha256"] == old_files[p].get("sha256") and file_metadata_from_record(new_files[p]) != file_metadata_from_record(old_files[p]))
    unchanged = len(new_files.keys() & old_files.keys()) - len(modified) - len(metadata_only)
    return {
        "baseline": "previous_complete_scan" if old_files else "none",
        "added": {"count": len(added), "sample": added[:SAMPLES]},
        "removed": {"count": len(removed), "sample": removed[:SAMPLES]},
        "modified": {"count": len(modified), "sample": modified[:SAMPLES]},
        "metadata_only": {"count": len(metadata_only), "sample": metadata_only[:SAMPLES]},
        "unchanged_count": unchanged,
    }


def file_metadata_from_record(record):
    return tuple(record.get(key) for key in ("size", "mtime_ns", "ctime_ns", "device", "inode"))


def file_set_fingerprint(files):
    digest = hashlib.sha256()
    for item in files:
        digest.update(json.dumps([item["path"], item["size"], item["sha256"]], ensure_ascii=False, separators=(",", ":")).encode("utf-8"))
        digest.update(b"\n")
    return digest.hexdigest()


def build_report(manifest, diff, skipped):
    files = manifest["files"]
    categories = Counter(f["kind"] for f in files)
    samples = {}
    for category in sorted(categories):
        samples[category] = [f["path"] for f in files if f["kind"] == category][:SAMPLES]
    root_names = Counter(f["path"].split("/", 1)[0] if "/" in f["path"] else "(root files)" for f in files)
    return {
        "schema_version": SCHEMA,
        "generated_at": manifest["generated_at"],
        "status": manifest["status"],
        "ready_for_downstream": manifest["status"] == "complete" and manifest["platform"]["value"] is not None and bool(manifest["game_version"]["value"] or manifest["build_id"]["value"]) and manifest["build_id"]["status"] != "conflict",
        "title": manifest["title"],
        "platform": manifest["platform"],
        "game_version": manifest["game_version"],
        "build_id": manifest["build_id"],
        "file_count": len(files),
        "total_bytes": sum(f["size"] for f in files),
        "sha256_file_count": sum(1 for f in files if f.get("sha256")),
        "hashed_now": manifest["scan_stats"]["hashed_now"],
        "reused_hashes": manifest["scan_stats"]["reused_hashes"],
        "dataset_fingerprint": manifest["dataset_fingerprint"],
        "categories": dict(sorted(categories.items())),
        "category_samples": samples,
        "top_level": dict(sorted(root_names.items())),
        "symlinks_skipped": {"count": len(skipped), "sample": skipped[:SAMPLES]},
        "errors": manifest["errors"][:SAMPLES],
        "error_count": len(manifest["errors"]),
        "diff": diff,
        "notes": [
            "All paths in outputs are relative to the selected input root.",
            "User-supplied game versions are not independently verified.",
            "Reused hashes depend on unchanged file metadata; --rehash verifies all contents.",
            "Unconfirmed identifiers are not inferred from asset names or Unity engine versions.",
            "For downstream use, supply --version when neither a game version nor a build identifier can be verified.",
        ],
    }


def main():
    parser = argparse.ArgumentParser(description="Read-only game source inventory and SHA-256 manifest")
    parser.add_argument("--root", required=True, type=Path, help="Game source directory; never modified")
    parser.add_argument("--out", required=True, type=Path, help="Separate local output directory, outside any Git worktree")
    parser.add_argument("--platform", choices=["auto", "steam", "switch"], default="auto")
    parser.add_argument("--version", help="Game version supplied by user, not treated as verified")
    parser.add_argument("--rehash", action="store_true", help="Ignore SHA-256 cache and hash every input file")
    args = parser.parse_args()

    root = args.root.expanduser().resolve()
    out = args.out.expanduser().resolve()
    if not root.is_dir():
        parser.error("--root must be an existing directory")
    if is_within(out, root):
        parser.error("--out must be outside --root")
    if any((parent / ".git").exists() for parent in (out, *out.parents)):
        parser.error("--out must not be inside a Git worktree")
    if args.version and (len(args.version) > 128 or any(c in args.version for c in "\r\n\t")):
        parser.error("--version contains invalid characters")
    out.mkdir(parents=True, exist_ok=True)

    key = root_key(root)
    final_path = out / "source-manifest.json"
    report_path = out / "source-report.json"
    diff_path = out / "source-diff.json"
    checkpoint_path = out / "source-checkpoint.json"
    old = load_json(final_path)
    checkpoint = load_json(checkpoint_path)
    if any(record and record.get("root_key") != key for record in (old, checkpoint)):
        parser.error("--out already contains results for a different source root; choose a separate output folder")
    old_map = previous_map(old, key)
    checkpoint_map = previous_map(checkpoint, key)
    cache = {**old_map, **checkpoint_map}
    errors = []
    skipped = []
    entries = inventory(root, errors, skipped)
    files = []
    hashed_now = 0
    reused = 0

    def save_checkpoint():
        write_json(checkpoint_path, {
            "schema_version": SCHEMA, "root_key": key,
            "started_or_updated_at": utc_now(), "status": "incomplete", "files": files,
        })

    next_checkpoint = CHECKPOINT_INTERVAL
    last_checkpoint = time.monotonic()
    try:
        for index, (relative, path) in enumerate(entries, 1):
            try:
                before = file_metadata(path.stat())
                cached = None if args.rehash else cache.get(relative)
                if cache_matches(cached, before):
                    digest = cached["sha256"]
                    origin = "reused"
                    reused += 1
                else:
                    digest = hash_file(path)
                    after = file_metadata(path.stat())
                    if after != before:
                        raise RuntimeError("FileChangedDuringHash")
                    origin = "calculated"
                    hashed_now += 1
                files.append({"path": relative, **before, "sha256": digest, "hash_source": origin, "kind": kind_of(relative)})
            except (OSError, RuntimeError) as exc:
                errors.append({"operation": "stat_or_hash", "path": relative, "reason": str(exc) if isinstance(exc, RuntimeError) else type(exc).__name__})
            if index >= next_checkpoint or time.monotonic() - last_checkpoint >= 60:
                save_checkpoint()
                next_checkpoint = max(next_checkpoint * 2, index + CHECKPOINT_INTERVAL)
                last_checkpoint = time.monotonic()
    except KeyboardInterrupt:
        save_checkpoint()
        print("Interrupted. Re-run the same command to resume from the checkpoint.", file=sys.stderr)
        return 130

    paths = [entry[0] for entry in entries]
    detected_platform, evidence = inspect_platform(root, paths)
    conflicts = detected_platform == "conflict" or (args.platform == "switch" and detected_platform == "pc_unverified") or (args.platform != "auto" and detected_platform not in ("unknown", "pc_unverified", args.platform))
    selected_platform = ("unknown" if detected_platform == "pc_unverified" else detected_platform) if args.platform == "auto" else args.platform
    if old and old.get("platform", {}).get("value") not in (None, selected_platform) and not conflicts:
        conflicts = True
    if conflicts:
        errors.append({"operation": "identify_platform", "reason": "Conflicting Steam/Switch evidence or explicit platform disagrees with files"})
    platform = {
        "value": None if conflicts or selected_platform == "unknown" else selected_platform,
        "status": "conflict" if conflicts else "verified_from_files" if detected_platform in ("steam", "switch") else "user_provided" if args.platform != "auto" else "unconfirmed",
        "evidence": evidence,
    }
    build_id = (
        read_switch_build_id(root, paths, errors) if selected_platform == "switch" and not conflicts
        else read_steam_build_id(root, paths, errors) if selected_platform == "steam" and not conflicts
        else {"value": None, "status": "unconfirmed", "evidence": []}
    )
    if build_id["status"] == "conflict":
        errors.append({"operation": "identify_build_id", "reason": "Multiple distinct build identifiers found in one input root"})
    if len(files) != len(entries):
        errors.append({"operation": "completeness", "reason": "One or more discovered files could not be hashed"})
    version = read_game_version(root, paths, args.version, errors)
    complete = not errors and not conflicts and bool(files)
    manifest = {
        "schema_version": SCHEMA,
        "generated_at": utc_now(),
        "title": {"value": "Disney Dreamlight Valley", "status": "user_selected"},
        "root_key": key,
        "status": "complete" if complete else "incomplete",
        "platform": platform,
        "game_version": version,
        "build_id": build_id,
        "dataset_fingerprint": file_set_fingerprint(files),
        "scan_stats": {"discovered": len(entries), "hashed_now": hashed_now, "reused_hashes": reused},
        "errors": errors,
        "files": files,
    }
    diff = make_diff(old, files, key)
    report = build_report(manifest, diff, skipped)
    write_json(report_path, report)
    write_json(diff_path, diff)
    if not complete:
        save_checkpoint()
        print("Incomplete scan. See source-report.json, fix errors and re-run.", file=sys.stderr)
        return 2
    write_json(final_path, manifest)
    if checkpoint_path.exists():
        checkpoint_path.unlink()
    print("Complete. Files: {0}, hashed now: {1}, reused: {2}".format(len(files), hashed_now, reused))
    print("Generated: source-manifest.json, source-report.json, source-diff.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
