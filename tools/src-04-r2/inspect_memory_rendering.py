#!/usr/bin/env python3
"""Inspect local Steam Memory rendering evidence; no game, save, or R2 writes.

Names identify candidates only. Material-to-shader linkage requires a unique
serialized PPtr target. D3D bytecode disassembly is private analysis evidence,
not proof that a particular shader variant is selected by game runtime.
"""
from __future__ import annotations
import argparse
import ctypes
import hashlib
import json
import re
import struct
from collections import defaultdict
from pathlib import Path

TERM = re.compile(r"memory|shard|puzzle", re.I)
BUNDLE_TERM = re.compile(r"ui|shader|material|memory|shard|puzzle", re.I)
PROP_MASK = re.compile(r"mask|shard|piece", re.I)
PROP_OUTLINE = re.compile(r"outline|border", re.I)
MAX_SEGMENT = 128 * 1024 * 1024
MAX_DXBC = 2048


def get(obj, name, default=None):
    return getattr(obj, name, default) if obj is not None else default


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def pairs(value):
    if isinstance(value, dict):
        return list(value.items())
    return [(x[0], x[1]) for x in (value or []) if isinstance(x, (tuple, list)) and len(x) == 2]


def asset_name(obj):
    return str(get(obj.assets_file, "name", "")).replace("\\", "/").rsplit("/", 1)[-1].casefold()


def pointer(reader, ptr):
    file_id, path_id = get(ptr, "m_FileID"), get(ptr, "m_PathID")
    if type(file_id) is not int or type(path_id) is not int or file_id < 0 or not path_id:
        return None
    if file_id == 0:
        return asset_name(reader), path_id
    externals = get(reader.assets_file, "externals", [])
    if file_id > len(externals):
        return None
    name = str(get(externals[file_id - 1], "path", "")).replace("\\", "/").rsplit("/", 1)[-1].casefold()
    return (name, path_id) if name else None


def material_info(reader, material):
    saved = get(material, "m_SavedProperties")
    name = str(get(material, "m_Name", ""))
    textures = sorted(str(k) for k, _ in pairs(get(saved, "m_TexEnvs")))
    floats = {str(k): float(v) for k, v in pairs(get(saved, "m_Floats")) if type(v) in (int, float)}
    ints = {str(k): v for k, v in pairs(get(saved, "m_Ints")) if type(v) is int}
    colors = {}
    for key, value in pairs(get(saved, "m_Colors")):
        if all(type(get(value, c)) in (int, float) for c in "rgba"):
            colors[str(key)] = [get(value, c) for c in "rgba"]
    props = textures + list(floats) + list(ints) + list(colors)
    candidate = bool(TERM.search(name) or (any(PROP_MASK.search(k) for k in props) and
                                          any(PROP_OUTLINE.search(k) for k in props)))
    return {"name": name, "shaderPointer": pointer(reader, get(material, "m_Shader")),
            "textureProperties": textures, "floatProperties": floats, "intProperties": ints,
            "colorProperties": colors, "candidateByMaterial": candidate}


def flatten(values, prefix=()):
    if isinstance(values, (tuple, list)):
        for i, value in enumerate(values):
            yield from flatten(value, prefix + (i,))
    elif type(values) is int:
        yield prefix, values
    else:
        raise ValueError("Unexpected shader segment shape")


def compressed_segments(shader):
    import lz4.block
    blob = bytes(get(shader, "compressedBlob", b"") or b"")
    offsets = dict(flatten(get(shader, "offsets", []) or []))
    compressed = dict(flatten(get(shader, "compressedLengths", []) or []))
    decoded = dict(flatten(get(shader, "decompressedLengths", []) or []))
    if offsets.keys() != compressed.keys() or offsets.keys() != decoded.keys():
        raise ValueError("Shader segment metadata shape mismatch")
    if len(offsets) > 4096:
        raise ValueError("Shader segment budget exceeded")
    for key, start in sorted(offsets.items()):
        count, size = compressed[key], decoded[key]
        if size == 0 and count == 0:
            continue
        if not (0 <= start <= len(blob) and 0 < count <= len(blob) - start and
                0 < size <= MAX_SEGMENT):
            raise ValueError("Invalid shader segment")
        part = lz4.block.decompress(blob[start:start+count], uncompressed_size=size)
        if len(part) != size:
            raise ValueError("Shader decompression size mismatch")
        yield key, part


def dxbc_chunks(raw):
    pos = 0
    while True:
        i = raw.find(b"DXBC", pos)
        if i < 0:
            return
        pos = i + 4
        if i + 32 > len(raw):
            continue
        _, length, count = struct.unpack_from("<III", raw, i + 20)
        if not (0 < count <= 256 and 32 + 4*count <= length <= len(raw)-i):
            continue
        offsets = struct.unpack_from("<" + "I"*count, raw, i + 32)
        if len(set(offsets)) != count or any(o < 32+4*count or o+8 > length for o in offsets):
            continue
        if any(o+8+struct.unpack_from("<I", raw, i+o+4)[0] > length for o in offsets):
            continue
        kinds = [raw[i+o:i+o+4] for o in offsets]
        if not any(k in (b"SHDR", b"SHEX") for k in kinds):
            continue
        yield raw[i:i+length]
        pos = i+length


def disassemble(raw):
    dll = ctypes.WinDLL("d3dcompiler_47.dll")
    function = dll.D3DDisassemble
    function.argtypes = [ctypes.c_void_p, ctypes.c_size_t, ctypes.c_uint,
                         ctypes.c_char_p, ctypes.POINTER(ctypes.c_void_p)]
    function.restype = ctypes.c_long
    blob = ctypes.c_void_p()
    source = ctypes.create_string_buffer(raw)
    result = function(source, len(raw), 0, None, ctypes.byref(blob))
    if result < 0 or not blob.value:
        raise ValueError(f"D3DDisassemble HRESULT {result & 0xffffffff:08x}")
    table = ctypes.cast(blob, ctypes.POINTER(ctypes.POINTER(ctypes.c_void_p))).contents
    release = ctypes.WINFUNCTYPE(ctypes.c_ulong, ctypes.c_void_p)(table[2])
    try:
        data = ctypes.WINFUNCTYPE(ctypes.c_void_p, ctypes.c_void_p)(table[3])(blob)
        size = ctypes.WINFUNCTYPE(ctypes.c_size_t, ctypes.c_void_p)(table[4])(blob)
        if size > 8*1024*1024:
            raise ValueError("Disassembly budget")
        return ctypes.string_at(data, size).rstrip(b"\0").decode("utf-8", errors="replace")
    finally:
        release(blob)


def source_paths(game, broad):
    data = game / "ddv_Data"
    aa = data / "StreamingAssets" / "aa"
    paths = set(p for p in data.glob("*.assets") if p.is_file())
    paths.update(p for p in aa.rglob("*.bundle") if p.is_file() and
                 (broad or BUNDLE_TERM.search(p.name)))
    return sorted(paths)


def inspect(game, broad):
    import UnityPy
    paths = source_paths(game, broad)
    if not paths:
        raise ValueError("No local Unity source files")
    # First pass records identities and links; do not retain Unity environments.
    shaders = defaultdict(list)
    materials = []
    scripts = []
    failures = []
    for number, path in enumerate(paths, 1):
        rel = path.relative_to(game).as_posix()
        print(f"  Source {number}/{len(paths)} {rel}", flush=True)
        try:
            env = UnityPy.load(str(path))
            for obj in env.objects:
                kind = obj.type.name
                if kind not in ("Shader", "Material", "MonoScript"):
                    continue
                try:
                    value = obj.read()
                    key = (asset_name(obj), obj.path_id)
                    if kind == "Shader":
                        form = get(value, "m_ParsedForm")
                        name = str(get(form, "m_Name") or get(value, "m_Name") or "")
                        props = get(get(form, "m_PropInfo"), "m_Props", []) or []
                        names = [str(get(p, "m_Name", "")) for p in props]
                        candidate = bool(TERM.search(name) or
                            (any(PROP_MASK.search(k) for k in names) and any(PROP_OUTLINE.search(k) for k in names)))
                        shaders[key].append({"source": rel, "assetFile": key[0], "pathId": key[1],
                                             "name": name, "properties": names, "candidate": candidate})
                    elif kind == "Material":
                        materials.append({"source": rel, "assetFile": key[0], "pathId": key[1],
                                          **material_info(obj, value)})
                    else:
                        cls = str(get(value, "m_ClassName", ""))
                        if TERM.search(cls):
                            scripts.append({"source": rel, "assetFile": key[0], "pathId": key[1],
                                            "class": cls, "namespace": str(get(value, "m_Namespace", ""))})
                except Exception as exc:
                    failures.append({"source": rel, "pathId": obj.path_id, "type": kind,
                                     "error": type(exc).__name__ + ": " + str(exc)[:160]})
            del env
        except Exception as exc:
            failures.append({"source": rel, "error": type(exc).__name__ + ": " + str(exc)[:160]})
    targets = set()
    selected = []
    for m in materials:
        ptr = m["shaderPointer"]
        linked = shaders.get(ptr, []) if ptr else []
        if m["candidateByMaterial"] or any(s["candidate"] for s in linked):
            m["shaderCandidates"] = linked
            m["uniqueShaderPointer"] = len(linked) == 1
            selected.append(m)
            if len(linked) == 1:
                targets.add((linked[0]["source"], linked[0]["assetFile"], linked[0]["pathId"]))
    for values in shaders.values():
        for s in values:
            if s["candidate"]:
                targets.add((s["source"], s["assetFile"], s["pathId"]))
    by_source = defaultdict(set)
    for source, asset, pid in targets:
        by_source[source].add((asset, pid))
    disassembly = {}
    results = []
    for rel, wanted in sorted(by_source.items()):
        path = game / rel
        try:
            env = UnityPy.load(str(path))
            with path.open("rb") as f:
                source_sha = hashlib.file_digest(f, "sha256").hexdigest()
            for obj in env.objects:
                key = (asset_name(obj), obj.path_id)
                if obj.type.name != "Shader" or key not in wanted:
                    continue
                v = obj.read()
                info = next(s for s in shaders[key] if s["source"] == rel)
                row = {**info, "sourceSha256": source_sha, "rawObjectSha256": sha(obj.get_raw_data()),
                       "programs": [], "errors": []}
                try:
                    for segment, raw in compressed_segments(v):
                        for chunk in dxbc_chunks(raw):
                            digest = sha(chunk)
                            if digest not in disassembly:
                                if len(disassembly) >= MAX_DXBC:
                                    raise ValueError("DXBC program budget exceeded")
                                try:
                                    disassembly[digest] = {"text": disassemble(chunk), "bytes": len(chunk)}
                                except Exception as exc:
                                    disassembly[digest] = {"error": type(exc).__name__ + ": " + str(exc)[:160]}
                            row["programs"].append({"segment": segment, "sha256": digest})
                except Exception as exc:
                    row["errors"].append(type(exc).__name__ + ": " + str(exc)[:160])
                results.append(row)
            del env
        except Exception as exc:
            failures.append({"source": rel, "error": type(exc).__name__ + ": " + str(exc)[:160]})
    return {"schema": "wand.media.private-memory-render-evidence@1", "gameVersion": "1.26.2",
            "privateOnly": True, "renderingVerified": False, "pieceBitMappingVerified": False,
            "scanMode": "all-bundles" if broad else "candidate-bundles-and-root-assets",
            "scannedSources": len(paths), "materials": selected, "scripts": scripts,
            "shaders": results, "disassembly": disassembly, "failures": failures}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--game", type=Path, required=True)
    p.add_argument("--out", type=Path, required=True)
    p.add_argument("--all-bundles", action="store_true")
    a = p.parse_args()
    game, out = a.game.resolve(), a.out.resolve()
    if not re.search(r"(?:^|-)v1\.26\.2(?:-|$)", (game/"FullVersion.txt").read_text(encoding="utf-8-sig").strip()):
        raise ValueError("Steam 1.26.2 required")
    if out.exists() or out.is_relative_to(game) or any((x/".git").exists() for x in out.parents):
        raise ValueError("Use a new private report outside Git and game folder")
    result = inspect(game, a.all_bundles)
    with out.open("x", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2, allow_nan=False)
    print(f"Shaders: {len(result['shaders'])}; materials: {len(result['materials'])}; unique DXBC: {len(result['disassembly'])}; read failures: {len(result['failures'])}")
    print("Private evidence:", out, flush=True)


if __name__ == "__main__":
    main()
