import gzip
import hashlib
import io
import json
import re
import zipfile
from collections import defaultdict
from pathlib import Path

root = Path(__file__).resolve().parents[1]
source = root / "assets/ddv/r39"
static = root / "static/ddv"
manifest = json.loads((source / "manifest.json").read_text(encoding="utf-8"))
query_parts = sorted(source.glob("query-index.part[0-9][0-9]"))
if not query_parts:
    raise RuntimeError("Missing game image query source")
query_binary = b"".join(path.read_bytes() for path in query_parts)
query = json.loads(gzip.decompress(query_binary))
if query.get("gameVersion") != "1.24.13" or manifest.get("gameVersion") != "1.24.13":
    raise RuntimeError("Game image source version mismatch")
source_icons = {}
for item in query["items"]:
    icon = item.get("icon")
    if isinstance(icon, dict) and re.fullmatch(r"[a-f0-9]{64}", icon.get("sha256", "")):
        source_icons[str(item["itemID"])] = icon["sha256"]

current_ids = set()
for record_path in sorted((static / "collection/v1.25").glob("records-[0-9][0-9].json")):
    for row in json.loads(record_path.read_text(encoding="utf-8"))["r"]:
        current_ids.add(str(row[0]))
if not current_ids:
    raise RuntimeError("Collection catalog is missing")

image_ids = defaultdict(list)
for item_id in current_ids:
    digest = source_icons.get(item_id)
    if digest is not None:
        image_ids[digest].append(item_id)

downloaded = {}
image_paths = {}
for shard in manifest["shards"]:
    hex_shard = shard["shard"]
    original = source / f"shard_{hex_shard}.zip"
    parts = sorted(source.glob(f"shard_{hex_shard}.part[0-9][0-9]"))
    if original.is_file():
        binary = original.read_bytes()
    elif parts:
        binary = b"".join(part.read_bytes() for part in parts)
    else:
        continue
    if len(binary) != shard["bytes"] or hashlib.sha256(binary).hexdigest() != shard["sha256"]:
        raise RuntimeError(f"Game image archive integrity mismatch: {hex_shard}")
    count = 0
    with zipfile.ZipFile(io.BytesIO(binary)) as archive:
        for member in archive.infolist():
            match = re.fullmatch(r"webp/([a-f0-9]{64})\.webp", member.filename)
            if not match:
                raise RuntimeError(f"Unrecognized image path in {hex_shard}")
            digest = match.group(1)
            if int(digest[:2], 16) >> 3 != int(hex_shard, 16):
                raise RuntimeError(f"Incorrect image shard for {digest}")
            if digest not in image_ids:
                continue
            content = archive.read(member)
            if content[:4] != b"RIFF" or content[8:12] != b"WEBP":
                raise RuntimeError(f"Invalid WebP image {digest}")
            public_path = f"game-thumbnails/r39/{hex_shard}/{digest}.webp"
            target = static / public_path
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(content)
            for item_id in image_ids[digest]:
                image_paths[item_id] = "ddv/" + public_path
            count += 1
    downloaded[hex_shard] = count

if not image_paths:
    raise RuntimeError("No verified item images could be matched")
manifest_output = {
    "schema": "wand.collection.item-images.r39@1",
    "imageSource": "Nintendo Switch DDV v1.24.13",
    "collectionSource": "Nintendo Switch DDV v1.25.0",
    "versionParityVerified": False,
    "matched": len(image_paths),
    "shards": sorted(downloaded),
    "items": dict(sorted(image_paths.items(), key=lambda item: int(item[0])))
}
(static / "collection/item-images-r39.json").write_text(
    json.dumps(manifest_output, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
)
print(f"Collection images: {len(image_paths)} item IDs, {len(downloaded)} archives, {len(current_ids)} collection items")
