"""Verify shipped manifests locally; sample the exact deployed artifact remotely."""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import time
from urllib.parse import quote
from urllib.request import Request, urlopen

RECEIPT = "wand-deployment.json"
SHA = re.compile(r"[a-f0-9]{64}")
COMMIT = re.compile(r"[a-f0-9]{40}")
SAFE_PATH = re.compile(r"[A-Za-z0-9._/-]+")

def safe_path(value: str) -> str:
    if not isinstance(value, str) or not SAFE_PATH.fullmatch(value) or any(
        p in ("", ".", "..") for p in value.split("/")
    ):
        raise ValueError(f"Unsafe publication path: {value!r}")
    return value

def require(condition, message):
    if not condition:
        raise ValueError(message)

def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def metadata(data: bytes) -> dict:
    return {"sha256": digest(data), "bytes": len(data)}

def artifact(build: Path, source: Path, commit: str) -> dict:
    require(bool(COMMIT.fullmatch(commit)), "Invalid deployment commit")
    samples = {}
    def read(path, *, compare=False, sample=False):
        path = safe_path(path)
        data = (build / path).read_bytes()
        require(bool(data), f"Empty artifact: {path}")
        if compare:
            require(data == (source / path).read_bytes(), f"Source mismatch: {path}")
        if sample:
            samples[path] = metadata(data)
        return data
    def read_json(path, **kwargs):
        return json.loads(read(path, **kwargs))
    def check_part(directory, name, descriptor, sample=False):
        name = safe_path(name)
        require("/" not in name, f"Unexpected partition name: {name}")
        data = read(directory + "/" + name, compare=True, sample=sample)
        require(metadata(data) == {k: descriptor[k] for k in ("sha256", "bytes")}, f"Partition integrity: {name}")
    # Routes are part of the artifact contract, not locale-sensitive labels.
    for route, marker in {
        "collection": b"Collection", "guide": b'class="timeline-panel',
        "guide/quests": b"<!", "guide/characters": b"<!",
        "guide/star-path": b"<!", "guide/events": b'class="event-guide',
        "guide/source": b"<!", "guide/systems": b"<!",
        "save/diagnostics": b"noindex"
    }.items():
        html = read(route + "/index.html", sample=route in ("collection", "guide", "guide/quests", "save/diagnostics"))
        require(marker in html.lower() if marker == b"<!" else marker in html, f"Route marker missing: {route}")
        if route == "guide":
            require(b'class="guide-sections' in html, "Guide sections missing")
    require(any(p.stat().st_size > 0 for p in build.rglob("*.wasm")), "WASM assets missing")
    active = read_json("ddv/game-db/active.json", compare=True, sample=True)
    require(active["schema"] == "wand.game-db.active@1" and active["kind"] == "db_snapshot", "Active database contract")
    directory = safe_path(active["path"])
    require(directory.startswith("ddv/game-db/releases/"), "Unexpected active DB path")
    index_data = read(directory + "/index.json", compare=True, sample=True)
    require(digest(index_data) == active["indexSha256"], "Active index integrity")
    index = json.loads(index_data)
    require(index["schema"] == "wand.game-db.release@1" and index["id"] == active["snapshot"], "Active DB identity")
    require(index["target"]["gameVersion"] == active["target"]["gameVersion"], "Game version mismatch")
    require(index["shards"] and sum(x["count"] for x in index["shards"]) == index["count"], "Shard coverage")
    for key in ("shards", "search"):
        require(bool(index[key]), f"Missing {key}")
        for i, descriptor in enumerate(index[key]):
            check_part(directory, descriptor["file"], descriptor, sample=i == 0)
    for historical in active.get("history", []):
        if historical.get("kind") == "legacy_collection":
            read(safe_path(historical["path"]) + "/index.json", compare=True, sample=True)
    for name, schema, descriptor_key in (
        ("quest-index.json", "wand.db03.public-guide-quests@1", "detailFiles"),
        ("quest-targets-index.json", "wand.db03.public-quest-targets@1", "partFiles"),
    ):
        guide = read_json("guide/public/" + name, compare=True, sample=True)
        require(guide["schema"] == schema and bool(guide[descriptor_key]), f"Guide manifest: {name}")
        for i, (file, descriptor) in enumerate(sorted(guide[descriptor_key].items())):
            check_part("guide/public", file, descriptor, sample=i == 0)
    images = read_json("ddv/collection/item-images-r39.json", compare=True, sample=True)
    require(images["versionParityVerified"] is False and images["matched"] == len(images["items"]) > 0, "Historical image map")
    # Preserve an actual fallback image check without pinning a game version.
    for path in sorted(set(images["items"].values()))[:3]:
        data = read(path, compare=True, sample=True)
        require(data[:4] == b"RIFF" and data[8:12] == b"WEBP", "Invalid WebP fallback")
    # Existing pinned legacy originals remain covered while in the artifact.
    legacy = build / "ddv/item-images"
    if legacy.is_dir():
        for image in sorted(legacy.rglob("*.webp"))[:3]:
            path = image.relative_to(build).as_posix()
            data = read(path, compare=True, sample=True)
            require(data[:4] == b"RIFF" and data[8:12] == b"WEBP", "Invalid legacy WebP")
            if SHA.fullmatch(image.stem):
                require(digest(data) == image.stem, "Legacy image digest")
    result = {"schema": "wand.pages.deployment@1", "commit": commit, "files": samples}
    (build / RECEIPT).write_text(json.dumps(result, sort_keys=True, separators=(",", ":")) + "\n", encoding="utf-8")
    return result

def verify_deployment(url: str, commit: str, fetch=None) -> None:
    require(bool(COMMIT.fullmatch(commit)), "Invalid expected commit")
    def download(path):
        path = safe_path(path)
        request = Request(url.rstrip("/") + "/" + quote(path, safe="/") + "?commit=" + commit,
                          headers={"Cache-Control": "no-cache", "Accept-Encoding": "identity"})
        with urlopen(request, timeout=30) as response:
            return response.read()
    fetch = fetch or download
    receipt = json.loads(fetch(RECEIPT))
    require(receipt.get("schema") == "wand.pages.deployment@1" and receipt.get("commit") == commit,
            "Pages has not served expected commit yet")
    files = receipt["files"]
    require(isinstance(files, dict) and 0 < len(files) <= 64, "Invalid deployment sample list")
    require({"collection/index.html", "ddv/game-db/active.json", "guide/public/quest-index.json",
             "save/diagnostics/index.html"} <= set(files), "Missing critical deployment samples")
    for path, expected in files.items():
        safe_path(path)
        require(bool(SHA.fullmatch(expected["sha256"])) and expected["bytes"] > 0, "Invalid file descriptor")
        require(metadata(fetch(path)) == expected, "Deployed file mismatch: " + path)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--commit", required=True)
    parser.add_argument("--build", type=Path)
    parser.add_argument("--source", type=Path, default=Path("static"))
    parser.add_argument("--url")
    args = parser.parse_args()
    if args.build is not None and args.url is None:
        receipt = artifact(args.build, args.source, args.commit)
        print(f"Artifact verified: {len(receipt['files'])} deployment samples, commit {args.commit}")
    elif args.url and args.build is None:
        for attempt in range(8):
            try:
                verify_deployment(args.url, args.commit)
                print("Verified deployed commit", args.commit)
                return
            except (OSError, ValueError, KeyError) as exc:
                if attempt == 7:
                    raise
                print(f"Publication propagation attempt {attempt + 1}: {exc}")
                time.sleep(3)
    else:
        parser.error("Select --build or --url")

if __name__ == "__main__":
    main()
