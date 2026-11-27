#!/usr/bin/env python3
"""Extract the verified Steam 1.26.2 ToM asset bundle into a private local folder.

Uses the exact serialized AssetBundle container key -> PPtr -> Texture2D
relationship, not filename similarity. Pinned to the inspected source bytes;
new source versions require a verified parser/release update. No upload,
publication, game modifications, or inference of Item ID/UV/material semantics.
Requires Python 3, lz4 and Pillow with DDS BC7 decoding and lossless WebP.
"""
from __future__ import annotations
import argparse
import hashlib
import io
import json
import re
import struct
from pathlib import Path

SOURCE_SHA = "014526afcf7a04f21368ede0cca656909951e33d545f6aa5e211dfbcf8d0972b"
SOURCE_NAME = "touchofmagic_fc2ccad4.bundle"
SOURCE_SIZE = 18621053
UNITY_VERSION = b"6000.0.62f1"
FORMATS = {10: (8, b"DXT1"), 12: (16, b"DXT5"), 25: (16, b"DX10")}


def require(condition, code):
    if not condition:
        raise ValueError(code)


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def aligned(n, align=4):
    return (n + align - 1) // align * align


class Reader:
    def __init__(self, data, endian="<", offset=0):
        self.data, self.endian, self.pos = data, endian, offset

    def take(self, count):
        require(0 <= count <= len(self.data) - self.pos, "BOUNDS")
        result = self.data[self.pos:self.pos+count]
        self.pos += count
        return result

    def read(self, fmt):
        values = struct.unpack(self.endian + fmt, self.take(struct.calcsize(self.endian + fmt)))
        return values[0] if len(values) == 1 else values

    def align(self, n=4):
        self.take(aligned(self.pos, n) - self.pos)

    def cstring(self, limit=512):
        end = self.data.find(b"\0", self.pos, self.pos + limit + 1)
        require(end >= self.pos, "STRING")
        return self.take(end - self.pos + 1)[:-1]

    def text(self):
        n = self.read("I")
        require(n <= 512, "STRING")
        s = self.take(n).decode("utf-8", errors="strict")
        self.align()
        return s


def unpack_bundle(raw):
    import lz4.block
    require(len(raw) == SOURCE_SIZE and digest(raw) == SOURCE_SHA, "SOURCE_SHA_MISMATCH")
    r = Reader(raw, ">")
    require(r.cstring() == b"UnityFS" and r.read("I") == 8, "BUNDLE")
    require(r.cstring() == b"5.x.x" and r.cstring() == UNITY_VERSION, "UNITY_VERSION")
    size, compressed, expanded, flags = r.read("QIII")
    require(size == len(raw) and flags == 0x243 and expanded < 65536, "BUNDLE_FLAGS")
    r.align(16)
    table = Reader(lz4.block.decompress(r.take(compressed), uncompressed_size=expanded), ">")
    r.align(16)
    table.take(16)
    count = table.read("I")
    require(0 < count <= 512, "BLOCK_COUNT")
    data = bytearray()
    for _ in range(count):
        decoded, encoded, mode = table.read("IIH")
        require(mode & 63 == 3 and 0 < decoded <= 131072, "BLOCK_CODEC")
        data.extend(lz4.block.decompress(r.take(encoded), uncompressed_size=decoded))
    require(r.pos == len(raw) and table.read("I") == 2, "BUNDLE_NODES")
    nodes = []
    for _ in range(2):
        off, size, flags = table.read("QQI")
        name = table.cstring().decode("ascii")
        require(off + size <= len(data), "NODE_BOUNDS")
        nodes.append((off, size, flags, name))
    a, b = nodes
    require(a[:3] == (0, 15364, 4) and b[:3] == (15364, 44500096, 0)
            and b[3] == a[3] + ".resS", "NODE_LAYOUT")
    return a[3], bytes(data[:a[1]]), bytes(data[b[0]:b[0]+b[1]])


def serialized_objects(source):
    # Unity serialized file format v22, stripped type trees, 64-bit offsets.
    header = Reader(source, ">")
    _, _, version, endian, _ = header.read("IIIB3s")
    require(version == 22 and endian == 0, "SERIALIZED_VERSION")
    metadata_size, file_size, data_offset, _ = header.read("IQQQ")
    require(file_size == len(source) and data_offset >= 48 + metadata_size, "SERIALIZED_BOUNDS")
    r = Reader(source, "<", 48)
    require(r.cstring() == UNITY_VERSION and r.read("i") == 19 and r.read("B") == 0, "SERIALIZED_PLATFORM")
    require(r.read("I") == 2, "SERIALIZED_TYPES")
    classes = []
    for _ in range(2):
        cls, stripped, script = r.read("iBh")
        require(cls in (28, 142) and stripped == 0 and script == -1, "TYPE_LAYOUT")
        r.take(16)
        classes.append(cls)
    count = r.read("I")
    require(count == 47, "OBJECT_COUNT")
    objects = {}
    for _ in range(count):
        r.align()
        pid, off, size, t = r.read("qQIi")
        require(0 <= t < len(classes) and data_offset + off + size <= len(source) and pid not in objects, "OBJECT_BOUNDS")
        raw = source[data_offset+off:data_offset+off+size]
        name = Reader(raw).text()
        objects[pid] = (classes[t], name, raw)
    return objects


def container_links(objects):
    bundles = [raw for cls, _, raw in objects.values() if cls == 142]
    require(len(bundles) == 1, "ASSET_BUNDLE")
    r = Reader(bundles[0])
    r.text()
    count = r.read("I")
    require(count == 46, "PRELOAD_COUNT")
    preload = [r.read("iq") for _ in range(count)]
    require(r.read("I") == count, "CONTAINER_COUNT")
    links = {}
    for _ in range(count):
        guid = r.text()
        index, size, file_id, pid = r.read("iiiq")
        require(re.fullmatch("[0-9a-f]{32}", guid) and guid not in links
                and size == 1 and 0 <= index < count and preload[index] == (file_id, pid)
                and file_id == 0 and pid in objects and objects[pid][0] == 28, "CONTAINER_LINK")
        links[guid] = pid
    require(len(set(links.values())) == count, "AMBIGUOUS_LINK")
    return links


def texture(raw, resource, resource_name):
    from PIL import Image
    r = Reader(raw)
    name = r.text()
    r.read("I")
    w, h, size, _, fmt, mips = r.read("6I")
    require(fmt in FORMATS and 0 < w <= 4096 and 0 < h <= 4096 and 0 < mips <= 16, "TEXTURE_LAYOUT")
    # The exact observed stripped Texture2D record has an external stream.
    # The trailing path must resolve to this bundle's resS node.
    path = b"archive:/" + resource_name.encode("ascii") + b"/" + resource_name.encode("ascii") + b".resS"
    pos = raw.find(path)
    require(pos >= 16 and raw.find(path, pos+1) < 0, "TEXTURE_STREAM")
    off, length, path_len = struct.unpack_from("<QII", raw, pos - 16)
    require(path_len == len(path) and length == size and off + length <= len(resource), "STREAM_BOUNDS")
    block_size, fourcc = FORMATS[fmt]
    top = ((w + 3) // 4) * ((h + 3) // 4) * block_size
    expected = sum(((max(1, w >> level)+3)//4) * ((max(1, h >> level)+3)//4) * block_size for level in range(mips))
    require(expected == length and top <= length, "MIP_SIZE")
    # DDS is just a local container around exact source compressed blocks;
    # no guessed shader or color composition. Retain native stored pixel axes.
    dds = (b"DDS " + struct.pack("<7I", 124, 0x81007, h, w, top, 0, 1) + bytes(44)
           + struct.pack("<II4s5I", 32, 4, fourcc, 0, 0, 0, 0, 0)
           + struct.pack("<5I", 0x1000, 0, 0, 0, 0)
           + (struct.pack("<5I", 98, 3, 0, 1, 0) if fmt == 25 else b""))
    image = Image.open(io.BytesIO(dds + resource[off:off+top]))
    image.load()
    require(image.size == (w, h), "DECODE_SIZE")
    return image, {"sourceName": name, "width": w, "height": h, "nativeFormat": fmt,
                   "mipCount": mips, "pixelMode": image.mode, "pixelSha256": digest(image.tobytes())}


def extract(source, output):
    require(source.is_file() and source.stat().st_size == SOURCE_SIZE, "SOURCE_SIZE")
    require(not output.exists(), "OUTPUT_EXISTS")
    require(not any((p / ".git").exists() for p in (output.resolve(), *output.resolve().parents)), "PRIVATE_OUTPUT_OUTSIDE_GIT")
    file_name, serialized, resource = unpack_bundle(source.read_bytes())
    objects = serialized_objects(serialized)
    links = container_links(objects)
    output.mkdir(parents=True, exist_ok=False)
    rows = []
    for guid, pid in sorted(links.items()):
        image, row = texture(objects[pid][2], resource, file_name)
        target = output / (guid + ".webp")
        image.save(target, format="WEBP", lossless=True, exact=True)
        # Lossless verification includes the RGBA channel data, not merely size.
        from PIL import Image
        with Image.open(target) as reopened:
            require(reopened.convert("RGBA").tobytes() == image.convert("RGBA").tobytes(), "PIXEL_ROUNDTRIP")
        rows.append({"guid": guid, "pathId": str(pid), **row, "file": target.name,
                     "sha256": digest(target.read_bytes())})
    require(len(rows) == 46, "INCOMPLETE")
    manifest = {"contract": "wand.tom-source-textures@1", "gameVersion": "1.26.2",
                "platform": "Steam", "sourceBundle": SOURCE_NAME, "sourceSha256": SOURCE_SHA,
                "serializedFile": file_name, "privateOnly": True, "publicationAuthorized": False,
                "itemBindingVerified": False, "uvCompositionVerified": False, "rows": rows}
    (output / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print("Extracted", len(rows), "exact GUID-linked textures; private local output only.")


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("bundle", type=Path)
    p.add_argument("output", type=Path)
    a = p.parse_args()
    extract(a.bundle, a.output)


if __name__ == "__main__":
    main()
