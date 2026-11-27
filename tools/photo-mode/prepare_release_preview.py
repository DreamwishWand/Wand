"""Project an approved, SHA-256-pinned diagnostic release into public Pages assets.

Do not extract the archive wholesale or publish its private manifest.
Only referenced converted model, clip, pair and body-icon files are copied.
"""
import hashlib
import io
import json
import re
import struct
import urllib.request
import zipfile
from pathlib import PurePosixPath

RELEASE_URL = "https://github.com/DreamwishWand/Wand/releases/download/photo-mode-assets-20261127/Dreamwish-Wand-private-pose-diagnostic.zip"
RELEASE_SHA = "b29654eacbe21489ac7d8cf20b9c765bfccdaf92074e74f19bf8572aa605bc99"
RELEASE_BYTES = 23453411
BODY_TYPES = ("male", "female")
LIMIT = 64 * 1024 * 1024

def require(condition, message):
    if not condition:
        raise ValueError(message)

def digest(raw):
    return hashlib.sha256(raw).hexdigest()

def valid_hash(value):
    return isinstance(value, str) and re.fullmatch(r"[a-f0-9]{64}", value) is not None

def entry(value):
    require(isinstance(value, dict) and valid_hash(value.get("sha256"))
            and type(value.get("bytes")) is int and 0 < value["bytes"] <= LIMIT,
            "invalid asset entry")
    return {"sha256": value["sha256"], "bytes": value["bytes"]}

def metadata(raw, clip=False):
    require(len(raw) >= (12 if clip else 28), "truncated asset")
    if clip:
        magic, n, binary = struct.unpack_from("<4sII", raw)
        start = 12
        require(magic == b"WPA1" and start+n+binary == len(raw), "invalid WPA")
    else:
        magic, version, size, n, kind = struct.unpack_from("<4s4I", raw)
        start = 20
        require(magic == b"glTF" and version == 2 and size == len(raw)
                and kind == 0x4e4f534a and start+n+8 <= len(raw), "invalid GLB")
        binary, kind = struct.unpack_from("<II", raw, start+n)
        require(kind == 0x004e4942 and start+n+8+binary == len(raw), "invalid BIN")
    require(n > 0 and n % 4 == 0 and start+n <= len(raw), "invalid metadata")
    return json.loads(raw[start:start+n])

def download():
    request = urllib.request.Request(RELEASE_URL, headers={"User-Agent": "Dreamwish-Wand-Pages"})
    with urllib.request.urlopen(request, timeout=60) as response:
        return response.read(RELEASE_BYTES+1)

def project(raw, dest):
    require(len(raw) == RELEASE_BYTES and digest(raw) == RELEASE_SHA, "release integrity mismatch")
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        files = {}
        for info in archive.infolist():
            if info.is_dir():
                continue
            name = PurePosixPath(info.filename).name
            require(name not in files, "ambiguous archive filename: "+name)
            files[name] = info
        info = files.get("local-preview.json")
        require(info is not None and info.file_size <= 2*1024*1024, "missing local manifest")
        m = json.loads(archive.read(info))
        require(m["schema"] == "wand.photo-mode.private-local-collection@1"
                and m["privateOnly"] is True and m["publicationAuthorized"] is False
                and m["fullPoseVerified"] is False and m["gameVersion"] == "1.26.2",
                "unexpected diagnostic manifest")
        assets = {}
        def store(value, ext):
            e = entry(value)
            name = e["sha256"]+ext
            if name not in assets:
                info = files.get(name)
                require(info is not None and info.file_size == e["bytes"], "missing asset: "+name)
                data = archive.read(info)
                require(len(data) == e["bytes"] and digest(data) == e["sha256"], "asset digest: "+name)
                assets[name] = data
            return e, assets[name]
        models, icons, items = {}, {}, {}
        for body in BODY_TYPES:
            model, data = store(m["models"][body], ".glb")
            d = metadata(data); x = d["asset"]["extras"]
            require(x["privateOnly"] is True and x["fullPoseVerified"] is False
                    and x["splitDiagnostic"] is True and not d.get("animations"), "invalid split model")
            models[body] = model
            icon, data = store(m["bodyIcons"][body], ".png")
            require(data[:8] == b"\x89PNG\r\n\x1a\n" and data[12:16] == b"IHDR"
                    and struct.unpack_from(">II", data, 16) == (152, 152), "invalid body icon")
            icons[body] = icon
        counts = {"pair": 0, "player": 0}
        for item, row in m["items"].items():
            require(re.fullmatch(r"[1-9][0-9]{0,14}", item) is not None
                    and set(row) == set(BODY_TYPES), "invalid item or body options")
            options = {}
            for body in BODY_TYPES:
                o = row[body]; source = o["sourceSha256"]
                require(valid_hash(source), "invalid source clip")
                kind = o["kind"]
                if kind == "pair":
                    e, data = store(o["asset"], ".glb")
                    d = metadata(data); x = d["asset"]["extras"]; a = d["animations"][0]["extras"]
                    require(x["privateOnly"] is True and x["fullPoseVerified"] is False
                            and x["attachedPairDiagnostic"] is True
                            and a["sourceSha256"] == source and a["companionItemId"] == int(item)
                            and any(n.get("extras", {}).get("actorId") == "companion" for n in d["nodes"]),
                            "pair identity mismatch")
                    options[body] = {"kind": kind, "sourceSha256": source, "asset": e}
                elif kind == "player":
                    c = o["clip"]; e, data = store(c, ".wpa")
                    d = metadata(data, True); a = d["animation"]
                    require(o["accessoryIncluded"] is False and c["sourceSha256"] == source
                            and isinstance(c["name"], str) and d["schema"] == "wand.private-pose-clip@1"
                            and d["privateOnly"] is True and d["publicationAuthorized"] is False
                            and d["modelSha256"] == models[body]["sha256"]
                            and a["extras"]["sourceSha256"] == source
                            and a["extras"]["fullPoseVerified"] is False, "clip identity mismatch")
                    options[body] = {"kind": kind, "sourceSha256": source,
                                     "clip": {**e, "sourceSha256": source, "name": c["name"]},
                                     "accessoryIncluded": False}
                else:
                    raise ValueError("unsupported scene kind")
                counts[kind] += 1
            require(options["male"]["kind"] == options["female"]["kind"], "inconsistent scene kinds")
            items[item] = options
        require(len(items) == 17 and counts == {"pair": 6, "player": 28}, "unexpected release coverage")
        public = {"schema": "wand.photo-mode.pages-test@2", "publicationAuthorized": True,
                  "testOnly": True, "fullPoseVerified": False, "gameVersion": m["gameVersion"],
                  "bodyIcons": icons, "models": models, "items": items}
        dest.mkdir(parents=True, exist_ok=True)
        for name, data in assets.items():
            (dest/name).write_bytes(data)
        (dest/"index.json").write_text(json.dumps(public, separators=(",", ":")), encoding="utf-8")
        print("Pages test coverage:", len(items), "items;", counts, ";", len(assets), "unique assets;", sum(map(len, assets.values())), "bytes")
