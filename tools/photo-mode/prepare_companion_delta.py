"""Verify and append converted companion-player clips to the existing approved Pages test index."""
import io
import json
import re
import urllib.request
import zipfile
from prepare_release_preview import BODY_TYPES, RELEASE_SHA, entry, digest, metadata, require, valid_hash

DELTA_NAME = "Dreamwish-Wand-companion-player-delta-20261127.zip"
DELTA_URL = "https://github.com/DreamwishWand/Wand/releases/download/photo-mode-assets-20261127/" + DELTA_NAME
DELTA_SHA = "93932b817eaf01dcaecef9de70feb6187dab266d60b7b607482cf461b95c1a30"
DELTA_BYTES = 5316556

def download_delta():
    request = urllib.request.Request(DELTA_URL, headers={"User-Agent": "Dreamwish-Wand-Pages"})
    with urllib.request.urlopen(request, timeout=60) as response:
        return response.read(DELTA_BYTES+1)

def apply_delta(raw, dest):
    return apply_player_archive(raw, dest, sha=DELTA_SHA, size=DELTA_BYTES, base_count=17,
                                item_count=90, clip_count=16, pose_count=8,
                                schema="wand.photo-mode.companion-player-delta@1")

def apply_player_archive(raw, dest, *, sha, size, base_count, item_count, clip_count, pose_count,
                         schema, previous_sha=None, expansion_sha=None, variant_count=0):
    require(len(raw)==size and digest(raw)==sha, "companion delta integrity mismatch")
    index_path=dest/"index.json"
    public=json.loads(index_path.read_bytes())
    require(public["schema"]=="wand.photo-mode.pages-test@2" and public["publicationAuthorized"] is True
            and public["testOnly"] is True and public["fullPoseVerified"] is False
            and len(public["items"])==base_count, "unexpected base manifest")
    models=public["models"]
    node_counts={}
    for body in BODY_TYPES:
        e=entry(models[body]);data=(dest/(e["sha256"]+".glb")).read_bytes()
        require(len(data)==e["bytes"] and digest(data)==e["sha256"], "base model integrity")
        node_counts[body]=len(metadata(data)["nodes"])
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        files={}
        for info in archive.infolist():
            require(not info.is_dir() and info.filename not in files, "duplicate or unexpected delta archive entry")
            files[info.filename]=info
        manifest=files.get("companion-player-delta.json")
        require(manifest is not None and manifest.file_size<=1024*1024, "missing delta manifest")
        m=json.loads(archive.read(manifest))
        require(m["schema"]==schema
                and (previous_sha is None or m["baseCompanionDeltaSha256"]==previous_sha)
                and (expansion_sha is None or m["baseExpansionSha256"]==expansion_sha)
                and m["baseReleaseSha256"]==RELEASE_SHA and m["gameVersion"]==public["gameVersion"]
                and m["models"]==models and len(m["items"])==item_count, "delta base or coverage mismatch")
        assets={};rows={};pairs=set();alternates={}
        variants=m.get("variants",{})
        require(isinstance(variants,dict) and set(variants)<=set(m["items"])
                and len(variants)==variant_count and all(isinstance(v,list) and len(v)==1 for v in variants.values()),
                "unexpected pose variants")
        def validate_row(row):
            require(isinstance(row,dict) and set(row)==set(BODY_TYPES),"invalid body options")
            options={}
            for body in BODY_TYPES:
                o=row[body];c=o["clip"];e=entry(c);source=o["sourceSha256"];name=e["sha256"]+".wpa"
                require(o["kind"]=="player" and o["accessoryIncluded"] is False and valid_hash(source)
                        and c["sourceSha256"]==source and isinstance(c["name"],str), "invalid companion player option")
                if name not in assets:
                    info=files.get(name)
                    require(info is not None and info.file_size==e["bytes"], "missing converted clip")
                    data=archive.read(info)
                    require(len(data)==e["bytes"] and digest(data)==e["sha256"], "converted clip integrity")
                    assets[name]=data
                d=metadata(assets[name],True);a=d["animation"]
                require(d["schema"]=="wand.private-pose-clip@1" and d["privateOnly"] is True
                        and d["publicationAuthorized"] is False and d["modelSha256"]==models[body]["sha256"]
                        and a["name"]==c["name"] and a["extras"]["sourceSha256"]==source
                        and a["extras"]["fullPoseVerified"] is False and a["channels"]
                        and all(0<=x["target"]["node"]<node_counts[body] and x["target"]["path"] in
                                ("translation","rotation","scale") for x in a["channels"]), "clip/model identity")
                options[body]={"kind":"player","sourceSha256":source,
                               "clip":{**e,"sourceSha256":source,"name":c["name"]},
                               "accessoryIncluded":False,"companionIncluded":False}
            pairs.add(tuple(options[b]["sourceSha256"] for b in BODY_TYPES))
            return options
        for item,row in m["items"].items():
            require(re.fullmatch(r"12[0-9]{7}",item) is not None and item not in public["items"],"invalid new companion ID")
            options=validate_row(row);rows[item]=options
            if item in variants:
                alt=validate_row(variants[item][0])
                require(any(alt[b]["sourceSha256"]!=options[b]["sourceSha256"] for b in BODY_TYPES),"duplicate pose variant")
                alternates[item]=[alt]
        require(len(assets)==clip_count and len(pairs)==pose_count and set(files)=={"companion-player-delta.json",*assets}, "delta asset coverage")
        for name,data in assets.items():
            path=dest/name
            if path.exists():
                require(path.read_bytes()==data,"existing asset conflict")
        for name,data in assets.items():
            (dest/name).write_bytes(data)
        public["items"].update(rows)
        if alternates:public.setdefault("variants",{}).update(alternates)
        index_path.write_text(json.dumps(public,separators=(",",":")),encoding="utf-8")
        print("Companion player-only additions:",len(rows),"items;",len(pairs),"shared poses;",len(assets),"clips;",sum(map(len,assets.values())),"bytes; total",len(public["items"]),"items")
