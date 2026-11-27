"""Convert verified companion player clips against an existing split model, retaining the original pose identities."""
import argparse, hashlib, json, struct, zipfile
from pathlib import Path, PurePosixPath
from resolve_animation_bundle import read_bundle, digest, unityfs
from pose_companions import extract, script_identity
from pose_curves import require, decode
from pose_mesh import body_source
from pose_glb import trs
from pose_extend_fast import sample_tracks
from pose_textured import parse_glb
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"db-01-items"))
from build_full_native_fields import frames, fields
from prepare_release_preview import RELEASE_SHA, BODY_TYPES
from prepare_companion_delta import DELTA_SHA

def generate(base,itemlist,script,pets,avatars,clips,out,work,previous=None):
    require(digest(base.read_bytes())==RELEASE_SHA,"wrong base release")
    targets={}
    for _,raw in frames(itemlist.read_bytes()):
        f={n:v for n,w,v,_ in fields(raw) if n in (1,5)}
        if 5 in f:
            ref=f[5].decode()
            if ref.startswith("guid:"):
                require(str(f[1]) not in targets,"duplicate companion")
                targets[str(f[1])]=ref[5:]
    identity=script_identity(script);prefabs={}
    for bundle in pets:
        hits=extract(bundle,identity,set(targets.values()))
        require(not prefabs.keys()&hits.keys(),"duplicate prefab")
        prefabs.update(hits)
    with zipfile.ZipFile(base) as archive:
        files={PurePosixPath(x.filename).name:x for x in archive.infolist() if not x.is_dir()}
        m=json.loads(archive.read(files["local-preview.json"]))
        prior_items={}
        if previous:
            require(digest(previous.read_bytes())==DELTA_SHA,"wrong previous delta")
            with zipfile.ZipFile(previous) as prev:
                pm=json.loads(prev.read("companion-player-delta.json"))
                require(pm["models"]==m["models"] and pm["baseReleaseSha256"]==RELEASE_SHA,"previous base mismatch")
                prior_items=pm["items"]
        items={};requested={s:set() for s in BODY_TYPES};assets={};converted={}
        for item,guid in targets.items():
            if item in m["items"] or item in prior_items or guid not in prefabs:continue
            poses=[c["pose"] for c in prefabs[guid]["poseComponents"] if c["enabled"] and c["pose"]
                   and all(c["pose"]["clipGuids"].get(s) for s in BODY_TYPES)]
            if len(poses)!=1:continue
            items[item]={s:poses[0]["clipGuids"][s] for s in BODY_TYPES}
            for s,g in items[item].items():requested[s].add(g)
        require(items,"no eligible companion scenes")
        for body in BODY_TYPES:
            model=m["models"][body];name=model["sha256"]+".glb";raw=archive.read(files[name])
            require(digest(raw)==model["sha256"] and len(raw)==model["bytes"],"model integrity")
            d=parse_glb(raw).doc;version,fs=unityfs(avatars[body].read_bytes())
            require(version=="6000.0.62f1" and len(fs)==1,"unsupported avatar")
            mesh,nodes,joints,_=body_source(next(iter(fs.values())),body)
            require(d["skins"][0]["joints"]==joints and len(d["nodes"])>=len(nodes),"skin or model mismatch")
            require(all(b["name"]==(n["path"] or "body") and all(b[k]==v for k,v in trs(n).items())
                        for b,n in zip(d["nodes"],nodes)),"model rig mismatch")
            found=read_bundle(clips[body],requested[body],work)
            require(set(found)==requested[body],"unresolved source clips")
            converted[body]={}
            for guid,rec in found.items():
                sha=rec["clipSha256"];raw=(work/(sha+".clip.bin")).read_bytes()
                require(digest(raw)==sha and len(raw)==rec["bytes"],"source identity")
                clip=decode(raw);g,a=sample_tracks(clip,nodes)
                doc=dict(schema="wand.private-pose-clip@1",privateOnly=True,publicationAuthorized=False,
                         modelSha256=model["sha256"],animation=a,buffers=[dict(byteLength=len(g.bin))],
                         bufferViews=g.doc["bufferViews"],accessors=g.doc["accessors"])
                js=json.dumps(doc,separators=(",",":"),allow_nan=False).encode();js+=b" "*((-len(js))%4)
                payload=struct.pack("<4sII",b"WPA1",len(js),len(g.bin))+js+g.bin;h=digest(payload)
                assets[h+".wpa"]=payload
                converted[body][guid]={"kind":"player","sourceSha256":sha,"clip":{"sourceSha256":sha,
                                      "sha256":h,"bytes":len(payload),"name":a["name"]},"accessoryIncluded":False}
    report={"schema":"wand.photo-mode.companion-player-delta@1","gameVersion":m["gameVersion"],
            "baseReleaseSha256":RELEASE_SHA,"models":m["models"],
            "items":{i:{b:converted[b][g] for b,g in row.items()} for i,row in items.items()}}
    if previous:
        report.update(schema="wand.photo-mode.companion-player-expansion@1",baseCompanionDeltaSha256=DELTA_SHA)
    with zipfile.ZipFile(out,"x",compression=zipfile.ZIP_DEFLATED,compresslevel=6) as archive:
        archive.writestr("companion-player-delta.json",json.dumps(report,separators=(",",":")))
        for name,raw in sorted(assets.items()):archive.writestr(name,raw)
    print("converted",len(items),"items",len(assets),"clips",out.stat().st_size,digest(out.read_bytes()))

if __name__=="__main__":
    p=argparse.ArgumentParser(description=__doc__)
    for k in ("base","itemlist","script","male-avatar","female-avatar","male-clips","female-clips","out","work"):
        p.add_argument("--"+k,type=Path,required=True)
    p.add_argument("--previous-delta",type=Path)
    p.add_argument("--pet",type=Path,action="append",required=True)
    a=p.parse_args();out=a.out.resolve();work=a.work.resolve()
    require(not any((x/".git").exists() for q in (out,work) for x in (q,*q.parents)),"private work directory required")
    work.mkdir(parents=True,exist_ok=True)
    generate(a.base,a.itemlist,a.script,a.pet,{"male":a.male_avatar,"female":a.female_avatar},
             {"male":a.male_clips,"female":a.female_clips},out,work,a.previous_delta)
