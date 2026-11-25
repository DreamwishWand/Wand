#!/usr/bin/env python3
"""Extract exact MemoryShard image, mask and outline sources; no network or R2.
Reuse verified source-object images from the existing shared media manifests.
Run with the current DB-01 root scalar part and the installed Steam aa folder.
"""
from __future__ import annotations
import argparse
import base64
import hashlib
import io
import json
import re
import struct
import zlib
from collections import defaultdict
from pathlib import Path, PurePosixPath
from bundle_thumbnails import DEFAULT_ROOT, source_rows, image_info, write_json
from resolve_shop_catalog import resolve
from resolve_shop_objects import dependency_path, exact_readers, file_sha

MASK_TYPE = "Mdl.Activities.MemoryShardMaskData"
IMAGE_TYPES = ("UnityEngine.Texture2D",)
FIELDS = {"ImageAddress": "string", "MaskDataAddress": "string", "NumberOfShards": "int"}
GUID = re.compile(r"guid:([0-9a-f]{32})")
SHA = re.compile(r"[0-9a-f]{64}")

def read_memory_rows(parts):
    rows = defaultdict(dict)
    source = None
    found = set()
    for part in parts:
        doc = json.loads(part.read_bytes())
        identity = (doc["gameVersion"], doc["sourceItemsSha256"], doc["sourceIl2cppDumpSha256"])
        if source is not None and identity != source:
            raise ValueError("Mixed DB-01 sources")
        source = identity
        for field, typ in FIELDS.items():
            key = f"MemoryShard.{field}@{typ}"
            if key not in doc["fields"]:
                continue
            if field in found:
                raise ValueError("Duplicate field")
            found.add(field)
            f = doc["fields"][key]
            data = json.loads(zlib.decompress(base64.b64decode(f["packed"], validate=True)))
            if len(data) != f["count"]:
                raise ValueError("DB-01 row count mismatch")
            item = 0
            for delta, value in data:
                if type(delta) is not int or delta <= 0:
                    raise ValueError("Invalid Item ID delta")
                item += delta
                if field == "NumberOfShards":
                    if type(value) is not int or not 1 <= value <= 32:
                        raise ValueError("Invalid shard count")
                elif not isinstance(value, str) or not GUID.fullmatch(value):
                    raise ValueError("Unsupported memory address")
                rows[item][field] = value
    if source is None or found != set(FIELDS) or not rows or any(set(v) != set(FIELDS) for v in rows.values()):
        raise ValueError("Incomplete DB-01 memory source")
    return source, dict(sorted(rows.items()))

def targets(rows):
    result = defaultdict(set)
    for row in rows.values():
        result[row["ImageAddress"][5:]].update(c.split(".")[-1] for c in IMAGE_TYPES)
        result[row["MaskDataAddress"][5:]].add("MemoryShardMaskData")
    if any("MemoryShardMaskData" in v and len(v)>1 for v in result.values()):
        raise ValueError("Mixed image and mask GUID")
    return dict(result)

def manifests(root):
    if root is None:
        return {}
    result = defaultdict(list)
    for p in sorted((root/"manifests").rglob("*")):
        if not p.is_file() or p.suffix not in (".json",".jsonl"):
            continue
        for row in source_rows(p):
            if not isinstance(row, dict):
                continue
            identity, v = row.get("assetId"), row.get("original")
            if not isinstance(identity, str) or not isinstance(v, dict):
                continue
            sha, rel = v.get("sha256"), v.get("path")
            if not isinstance(sha,str) or not SHA.fullmatch(sha) or not isinstance(rel,str):
                continue
            path = (root/rel).resolve()
            if not path.is_relative_to(root/"images") or not path.is_file():
                continue
            result[identity].append((path, v))
    return result

def object_identity(obj, bundles):
    matches = [(p, digest) for p, digest, files in bundles if any(f is obj.assets_file for f in files)]
    if len(matches) != 1:
        raise ValueError("Unproven serialized object source")
    path, digest = matches[0]
    return f"unity:{digest}:{obj.assets_file.name}:{obj.path_id}:{obj.type.name}", path

def pointer(tree, field, obj, files, expected):
    value = tree[field]
    fid, pid = value["m_FileID"], value["m_PathID"]
    if type(fid) is not int or type(pid) is not int or not pid or fid < 0:
        raise ValueError("Invalid pointer: "+field)
    asset = obj.assets_file
    if fid:
        if fid > len(asset.externals):
            raise ValueError("External file index")
        path = str(asset.externals[fid-1].path).replace("\\","/")
        name = PurePosixPath(path).name.casefold()
        matches = [f for f in files if str(f.name).casefold() == name]
        if len(matches) != 1:
            raise ValueError("Unresolved external file: "+field)
        asset = matches[0]
    target = asset.objects.get(pid)
    if target is None or target.type.name != expected:
        raise ValueError("Wrong pointer type: "+field)
    return target

def stripped_mask_tree(raw):
    """Exact Unity 6000.0.62f1 MonoBehaviour layout observed in all 23
    Steam 1.26.2 memory-mask objects. Caller must verify the MonoScript
    class and both local Texture2D references; never infer by asset name.
    """
    if len(raw) < 56 or struct.unpack_from("<iq", raw, 0) != (0, 0):
        raise ValueError("Unexpected ScriptableObject header")
    if raw[12:16] != b"\x01\0\0\0":
        raise ValueError("Unexpected enabled field")
    size = struct.unpack_from("<i", raw, 28)[0]
    if not 1 <= size <= 256:
        raise ValueError("Unexpected object name size")
    end = (32 + size + 3) & ~3
    if end + 24 != len(raw) or any(raw[32+size:end]):
        raise ValueError("Unexpected mask payload size")
    raw[32:32+size].decode("utf-8", errors="strict")
    result = {}
    for key, offset in (("m_Script",16),("Mask",end),("Outline",end+12)):
        fid,pid = struct.unpack_from("<iq",raw,offset)
        if fid < 0 or not pid or (key != "m_Script" and fid != 0):
            raise ValueError("Unexpected mask pointer")
        result[key] = {"m_FileID":fid,"m_PathID":pid}
    return result

def mask_tree(obj):
    try:
        return obj.read_typetree()
    except Exception:
        # The shipped source is stripped (no embedded type tree).
        if str(getattr(obj.assets_file,"unity_version","")) != "6000.0.62f1":
            raise
        return stripped_mask_tree(obj.get_raw_data())

def owned_serialized_files(root, files):
    """UnityPy leaf readers may expose files=None, not an empty dict."""
    owned=[]
    seen=set()
    def visit(f):
        if id(f) in seen:
            return
        seen.add(id(f))
        if any(f is x for x in files):
            owned.append(f)
        for child in (getattr(f,"files",None) or {}).values():
            visit(child)
    visit(root)
    return owned

def exact_objects(aa, locations):
    import UnityPy
    allpaths = sorted({p for locs in locations.values() for loc in locs
                       for dep in loc["dependencies"]
                       if (p := dependency_path(aa,dep)) is not None})
    missing = [str(p.relative_to(aa)) for p in allpaths if not p.is_file()]
    if missing:
        raise ValueError("Missing catalog dependencies: "+", ".join(missing[:8]))
    # Resolve each dependency set independently to avoid loading the whole game.
    work = defaultdict(list)
    for guid, locs in locations.items():
        for loc in locs:
            paths = tuple(sorted({p for dep in loc["dependencies"]
                                  if (p := dependency_path(aa,dep)) is not None}))
            if paths:
                work[paths].append((guid,loc))
    for paths, group in work.items():
        print("Inspecting:", ", ".join(p.name for p in paths), "references:",len(group),flush=True)
        env = UnityPy.load(*(str(p) for p in paths))
        files = list(env.assets)
        # Each SerializedFile is owned by a loaded BundleFile; do not infer
        # ownership from the asset display name or another catalog entry.
        bundles=[]
        for p in paths:
            root = [v for k,v in env.files.items()
                    if Path(str(k)).name.casefold() == p.name.casefold()]
            if len(root)!=1:
                raise ValueError("Cannot establish loaded bundle identity: "+p.name)
            owned=owned_serialized_files(root[0],files)
            bundles.append((p.relative_to(aa).as_posix(),file_sha(p),owned))
        for guid,loc in group:
            cls=loc["class"]
            wanted="MonoBehaviour" if cls=="MemoryShardMaskData" else cls
            matches={}
            errors=[]
            for f in files:
                container=getattr(f,"container",None)
                if container is None:
                    continue
                found,err=exact_readers(container,loc["internalId"],wanted)
                matches.update(found)
                errors.extend(err)
            if errors or len(matches)!=1:
                yield guid,None,"ambiguous_or_missing_exact_object"
                continue
            obj=next(iter(matches.values()))
            try:
                ident,_=object_identity(obj,bundles)
                if cls=="MemoryShardMaskData":
                    tree=mask_tree(obj)
                    script=pointer(tree,"m_Script",obj,files,"MonoScript").read()
                    if script.m_ClassName!="MemoryShardMaskData" or script.m_Namespace!="Mdl.Activities":
                        raise ValueError("Wrong script type")
                    refs={field: pointer(tree,field,obj,files,"Texture2D") for field in ("Mask","Outline")}
                else:
                    refs={"Image":obj}
                yield guid,(ident,refs,bundles),None
            except Exception as exc:
                yield guid,None,type(exc).__name__+": "+str(exc)[:200]

def materialize(obj, bundles, existing, output, mask=False):
    from PIL import Image
    identity,_=object_identity(obj,bundles)
    # Exact source-object identity includes the source AssetBundle SHA.
    # For masks also compare decoded native RGBA, including transparent RGB.
    native=None
    if mask:
        native=obj.read().image.convert("RGBA")
    for path,v in existing.get(identity,()):
        raw=path.read_bytes()
        info=image_info(raw,v["sha256"])
        if any(info[k]!=v.get(k) for k in info):
            continue
        if native is not None:
            with Image.open(io.BytesIO(raw)) as im:
                if im.size!=native.size or im.convert("RGBA").tobytes()!=native.tobytes():
                    continue
        return {**info,"localSource":str(path),"unityAssetId":identity,"reused":True}
    if native is None:
        native=obj.read().image.convert("RGBA")
    buf=io.BytesIO()
    native.save(buf,format="WEBP",lossless=True,quality=100,method=6,exact=True)
    raw=buf.getvalue()
    sha=hashlib.sha256(raw).hexdigest()
    with Image.open(io.BytesIO(raw)) as im:
        if im.size!=native.size or im.convert("RGBA").tobytes()!=native.tobytes():
            raise ValueError("Lossless RGBA roundtrip mismatch")
    path=output/"images"/(sha+".webp")
    path.parent.mkdir(parents=True,exist_ok=True)
    if path.exists():
        if path.read_bytes()!=raw:
            raise ValueError("Image collision")
    else:
        with path.open("xb") as f:
            f.write(raw)
    return {**image_info(raw,sha),"localSource":str(path),"unityAssetId":identity,"reused":False}

def verify_game_version(aa, expected):
    marker=aa.parents[2]/"FullVersion.txt"
    if not marker.is_file():
        raise ValueError("Missing Steam FullVersion.txt")
    value=marker.read_text(encoding="utf-8-sig").strip()
    if not re.search(r"(?:^|-)v"+re.escape(expected)+r"(?:-|$)",value):
        raise ValueError("Steam version does not match DB-01")
    return value

def run(parts,aa,root,out,index_only=False):
    source,rows=read_memory_rows(parts)
    # Source location is Steam ddv_Data/StreamingAssets/aa. The caller must
    # use the catalog for the DB-01 version; all references must resolve.
    version=verify_game_version(aa,source[0])
    expected=targets(rows)
    locs,pins=resolve(aa,set(expected),IMAGE_TYPES+(MASK_TYPE,))
    locs={g:[v for v in locs[g] if v["class"] in classes] for g,classes in expected.items()}
    report={"schema":"wand.media.private-memory-sources@1","gameVersion":source[0],
        "sourceItemsSha256":source[1],"sourceIl2cppDumpSha256":source[2],
        "sourceFullVersion":version,
        "catalogSha256":pins,"publicationAuthorized":False,"pieceBitMappingVerified":False,
        "items":rows,"locations":locs,"assets":{},"errors":{}}
    if not index_only:
        existing=manifests(root)
        materialized={}
        for guid,match,error in exact_objects(aa,locs):
            if error:
                report["errors"].setdefault(guid,[]).append(error)
                continue
            identity,refs,bundles=match
            try:
                assets={}
                for k,v in refs.items():
                    cache_key=(object_identity(v,bundles)[0],k!="Image")
                    if cache_key not in materialized:
                        materialized[cache_key]=materialize(v,bundles,existing,out,k!="Image")
                    assets[k]=materialized[cache_key]
                value={"unityAssetId":identity,"images":assets}
                prior=report["assets"].get(guid)
                if prior is not None and prior!=value:
                    report["errors"].setdefault(guid,[]).append("conflicting_exact_objects")
                else:
                    report["assets"][guid]=value
            except Exception as exc:
                report["errors"].setdefault(guid,[]).append(type(exc).__name__+": "+str(exc)[:200])
    report["summary"]={"itemCount":len(rows),"targetGuids":len(expected),
        "catalogMatched":sum(bool(v) for v in locs.values()),
        "resolvedGuids":len(report["assets"]),"errorGuids":len(report["errors"]),
        "uniqueOutputImages":len({v["sha256"] for a in report["assets"].values() for v in a["images"].values()}),
        "reusedSourceImages":len({v["sha256"] for a in report["assets"].values() for v in a["images"].values() if v["reused"]}),
        "unresolvedGuids":[g for g in sorted(expected) if g not in report["assets"] or g in report["errors"]]}
    report["complete"]=not report["summary"]["unresolvedGuids"]
    write_json(out/"memory-source-report.json",report)
    return report["summary"]

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--db01",type=Path,action="append",required=True)
    p.add_argument("--aa",type=Path,required=True)
    p.add_argument("--existing-root",type=Path,default=DEFAULT_ROOT)
    p.add_argument("--out",type=Path,required=True)
    p.add_argument("--index-only",action="store_true")
    a=p.parse_args()
    out=a.out.resolve()
    root=a.existing_root.resolve()
    aa=a.aa.resolve()
    if any((x/".git").exists() for x in [out,*out.parents]) or out.is_relative_to(aa) or out==root or out.is_relative_to(root/"images") or out.is_relative_to(root/"manifests"):
        raise ValueError("Use a separate private output outside Git and original sources")
    summary=run(a.db01,aa,root,out,a.index_only)
    print(json.dumps(summary,indent=2))
    if (a.index_only and summary["catalogMatched"]!=summary["targetGuids"]) or (not a.index_only and summary["unresolvedGuids"]):
        raise SystemExit(2)

if __name__=="__main__":
    main()
