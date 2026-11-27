#!/usr/bin/env python3
"""Recover only exact public map originals using the already collected R2 inventory."""
from pathlib import Path
import hashlib
from bundle_thumbnails import image_info
from publish_bundle_thumbnails import BUCKET, key, check, CACHE
from recover_world_map_parts import matches, install

MAX_OBJECT_BYTES=80*1024*1024

def source_candidates(row,canonical,legacy):
    sha=row["imageSha256"]
    pixel=Path(row["imagePath"]).stem
    k=key(sha)
    if k in canonical:
        return [(k,canonical[k])]
    # Existing legacy filenames may be encoded or decoded-pixel SHA.
    return list(dict.fromkeys([*legacy.get(sha,[]),*legacy.get(pixel,[])]))

def recover_public(s3,rows,root,canonical,legacy):
    pending={}
    stats={"getRequests":0,"reusedCanonical":0,"reusedLegacy":0,"local":0,"downloadBytes":0}
    for row in rows:
        sha=row["imageSha256"]
        dest=root/row["imagePath"]
        if matches(dest,sha):
            stats["local"]+=1
            continue
        candidates=source_candidates(row,canonical,legacy)
        check(len(candidates)<=8,"Unexpected public candidates for "+sha)
        for k,size in candidates:
            check(stats["getRequests"]<928,"Public recovery GET budget exceeded")
            check(20<=size<=MAX_OBJECT_BYTES,"Public recovery object size outside bounds")
            if "bytes" in row and row["bytes"]!=size:
                continue
            stats["getRequests"]+=1
            result=s3.get_object(Bucket=BUCKET,Key=k)
            body=result["Body"]
            try:
                check(result.get("ContentLength")==size,"R2 inventory changed: "+k)
                check(stats["downloadBytes"]+size<=1024*1024*1024,"Public recovery byte budget exceeded")
                raw=body.read(size+1)
                stats["downloadBytes"]+=len(raw)
            finally:
                body.close()
            if len(raw)!=size or hashlib.sha256(raw).hexdigest()!=sha:
                if k==key(sha):
                    raise ValueError("Canonical image content mismatch: "+k)
                continue
            image_info(raw,sha)
            install(raw,dest,sha)
            stats["reusedCanonical" if k==key(sha) else "reusedLegacy"]+=1
            break
        else:
            pending[sha]=row
    print("Public originals:",stats,"missing:",len(pending),flush=True)
    return pending,stats

def recover_ocean(aa,rows,root):
    """Exact Texture2D source; do not disassemble shaders or generate composites."""
    import UnityPy
    import io
    from extract_memory_sources import verify_game_version
    verify_game_version(aa,"1.26.2")
    bundle="win/ui-images-menu-map-lowres_assets_all.bundle"
    env=UnityPy.load(str(aa/bundle))
    by_id={(str(o.assets_file.name).casefold(),o.path_id):o for o in env.objects if o.type.name=="Texture2D"}
    for row in rows:
        t=row["texture"]
        check(t["bundle"]==bundle,"Unexpected native SDF bundle")
        obj=by_id.get((t["cab"].casefold(),int(t["pathId"])))
        check(obj is not None,"Missing native SDF texture")
        tex=obj.read()
        check(tex.m_Name==t["name"] and (tex.m_Width,tex.m_Height)==(t["width"],t["height"]) and int(tex.m_TextureFormat)==t["format"],"SDF identity mismatch")
        native=tex.image
        for img in (native.convert("RGBA"),native):
            buf=io.BytesIO()
            img.save(buf,format="WEBP",lossless=True,quality=100,method=6,exact=True)
            raw=buf.getvalue()
            if hashlib.sha256(raw).hexdigest()==t["sha256"]:
                install(raw,root/t["path"],t["sha256"])
                break
        else:
            raise ValueError("Original SDF WebP bytes not reproduced: "+t["name"])

def ocean_rows(doc):
    check(doc.get("schema")=="wand.media.ocean-source-candidate@1" and doc.get("gameVersion")=="1.26.2"
          and doc.get("publicationAuthorized") is False and len(doc["textures"])==7,"Unexpected ocean source index")
    rows=[]
    for t in doc["textures"]:
        from publish_world_map_parts import SOURCE
        m=SOURCE.fullmatch(t["path"])
        check(m and m[1]==m[2][:2] and t["bundle"]=="win/ui-images-menu-map-lowres_assets_all.bundle","Unexpected SDF source path")
        key(t["sha256"])
        check(t["bytes"]>0 and t["width"]>0 and t["height"]>0,"Invalid texture metadata")
        rows.append({"imageSha256":t["sha256"],"imagePath":t["path"],"bytes":t["bytes"],"texture":t})
    check(len({r["imageSha256"] for r in rows})==7,"Duplicate SDF source")
    return rows
