"""Generate private independent companion actor GLBs for verified player-only previews.
Source mesh, clip, attachment and texture references must all resolve. No Unity
shader, morph, transparency or complete runtime-pose equivalence is claimed.
"""
import argparse
import io
import json
import sys
import zipfile
from pathlib import Path, PurePosixPath

import numpy as np
from pose_companions import extract, script_identity
from pose_curves import require
from pose_extend_fast import sample_tracks
from pose_glb import Glb, REFLECT, trs
from pose_material import decode_material, decode_texture
from pose_pet_actor import Source, animator, meshes, resolve_clip, attachment_maps
from pose_rigid_mesh import rigid_meshes
from resolve_animation_bundle import digest, read_bundle, unityfs
from prepare_release_preview import RELEASE_SHA, BODY_TYPES, metadata
from prepare_companion_delta import DELTA_SHA

sys.path.insert(0, str(Path(__file__).resolve().parents[1]/"db-01-items"))
from build_full_native_fields import frames, fields


def material_projection(g, ref, sources, resource_files, cache, material_ids, texture_ids):
    key=(ref[0],int(ref[1]))
    if key in material_ids:
        return material_ids[key]
    s=sources[key[0]];m=decode_material(s.raw(key[1],21))
    slots=[k for k in ("_MainTex","_AvatarSkinTex") if m["textures"].get(k,{}).get("pathId","0")!="0"]
    require(len(slots)==1,"unsupported albedo source")
    slot=m["textures"][slots[0]];tkey=s.reference((slot["fileId"],int(slot["pathId"])))
    if tkey not in cache:
        tex_source=sources[tkey[0]]
        _,png=decode_texture(tex_source.raw(tkey[1],28),resource_files[tkey[0]])
        cache[tkey]=png
    png=cache[tkey];h=digest(png);d=g.doc
    if h not in texture_ids:
        while len(g.bin)%4:g.bin.append(0)
        vi=len(d["bufferViews"]);d["bufferViews"].append(dict(buffer=0,byteOffset=len(g.bin),byteLength=len(png)));g.bin.extend(png)
        images=d.setdefault("images",[]);ii=len(images);images.append(dict(bufferView=vi,mimeType="image/png"))
        textures=d.setdefault("textures",[]);texture_ids[h]=len(textures);textures.append(dict(source=ii))
    tint=m["colors"].get("_Tint",[1,1,1,1]);require(len(tint)==4 and all(0<=v<=1 for v in tint[:3]),"unsupported tint")
    idx=len(d["materials"]);d["materials"].append(dict(name=m["name"],
        pbrMetallicRoughness=dict(baseColorFactor=[*tint[:3],1],baseColorTexture=dict(index=texture_ids[h]),metallicFactor=0,roughnessFactor=.9),
        doubleSided=True,extras=dict(shaderParityVerified=False)))
    material_ids[key]=(idx,slot)
    return idx,slot


def export_actor(source, hierarchy, nodes, parts, pose, clip, sources, resources, texture_cache, *, secondary_pass=False):
    require(all(e["bindMatrixMaxError"]<1e-4 and e["materialSlotCount"]==e["submeshCount"] for _,_,_,e in parts),"rest or material parity")
    full=[dict(n) for n in hierarchy];full[0].update(translation=pose["attachedOffset"],rotation=pose["attachedRotation"])
    g=Glb();d=g.doc;d["asset"]["generator"]="Wand companion diagnostic"
    d["asset"]["extras"].update(companionActorDiagnostic=True,shaderParityVerified=False)
    if secondary_pass:d["asset"]["extras"]["secondaryPassParityVerified"]=False
    if any(e.get("normalsDerived") for _,_,_,e in parts):d["asset"]["extras"].update(derivedNormals=True,rigidTransformDiagnostic=True)
    d.update(nodes=[],skins=[],meshes=[],materials=[])
    indices={n["pathId"]:i for i,n in enumerate(full)}
    d["nodes"]=[dict(name="companion/"+n["path"],**trs(n),extras=dict(actorId="companion")) for n in full]
    for i,n in enumerate(full):
        if n["parent"]>=0:d["nodes"][n["parent"]].setdefault("children",[]).append(i)
    mat_ids={};tex_ids={}
    for i,m,j,e in parts:
        a=m["attrs"];require(4 in a,"missing UV")
        joints=np.pad(a[13],((0,0),(0,4-a[13].shape[1])));weights=np.pad(a[12],((0,0),(0,4-a[12].shape[1])));weights/=weights.sum(axis=1,keepdims=True)
        attrs=dict(POSITION=g.add(a[0]*[-1,1,1],"VEC3","<f4",34962,True),
                   NORMAL=g.add(a[1]*[-1,1,1],"VEC3","<f4",34962),
                   JOINTS_0=g.add(joints,"VEC4","<u2",34962),
                   WEIGHTS_0=g.add(weights,"VEC4","<f4",34962))
        prims=[]
        for t,ref in zip(m["indices"],e["materials"]):
            mi,slot=material_projection(g,ref,sources,resources,texture_cache,mat_ids,tex_ids)
            uv=a[4]*np.asarray(slot["scale"])+np.asarray(slot["offset"]);uv[:,1]=1-uv[:,1]
            prims.append(dict(attributes={**attrs,"TEXCOORD_0":g.add(uv,"VEC2","<f4",34962)},
                indices=g.add(t[:,[0,2,1]].reshape(-1),"SCALAR","<u2" if t.max()<65536 else "<u4",34963),material=mi))
        mi=len(d["meshes"]);d["meshes"].append(dict(primitives=prims))
        si=len(d["skins"]);ib=(REFLECT@m["bind"]@REFLECT).transpose(0,2,1).reshape(-1,16)
        d["skins"].append(dict(joints=[indices[nodes[k]["pathId"]] for k in j],inverseBindMatrices=g.add(ib,"MAT4","<f4")))
        d["nodes"][indices[nodes[i]["pathId"]]].update(mesh=mi,skin=si)
    tracks,a=sample_tracks(clip,nodes)
    require(len({n["pathHash"] for n in nodes})==len(nodes),"ambiguous rig path")
    vo=len(d["bufferViews"]);ao=len(d["accessors"])
    while len(g.bin)%4:g.bin.append(0)
    bo=len(g.bin);g.bin.extend(tracks.bin)
    d["bufferViews"].extend({**v,"byteOffset":v.get("byteOffset",0)+bo} for v in tracks.doc["bufferViews"])
    d["accessors"].extend({**x,"bufferView":x["bufferView"]+vo} for x in tracks.doc["accessors"])
    for s in a["samplers"]:s["input"]+=ao;s["output"]+=ao
    for ch in a["channels"]:ch["target"]["node"]=indices[nodes[ch["target"]["node"]]["pathId"]]
    d["animations"]=[a]
    return g.bytes()


def archive_files(z):
    result={}
    for f in z.infolist():
        if f.is_dir():continue
        name=PurePosixPath(f.filename).name;require(name not in result,"ambiguous archive entry");result[name]=f
    return result


def generate(a):
    require(digest(a.base.read_bytes())==RELEASE_SHA and digest(a.player_delta.read_bytes())==DELTA_SHA,"unexpected base archives")
    targets={}
    for _,raw in frames(a.itemlist.read_bytes()):
        f={n:v for n,w,v,_ in fields(raw) if n in (1,5)}
        if 5 in f:
            ref=f[5].decode()
            if ref.startswith("guid:"):
                require(str(f[1]) not in targets,"duplicate companion");targets[str(f[1])]=ref[5:]
    sources={};resources={};prefabs={};identity=script_identity(a.script)
    for p in a.pet:
        src=Source(p);require(src.cab not in sources,"duplicate source CAB");sources[src.cab]=src
        _,files=unityfs(p.read_bytes(),include_resources=True);resources[src.cab]={k:v for k,v in files.items() if k.endswith(".resS")}
        hits=extract(p,identity,set(targets.values()));require(not prefabs.keys()&hits.keys(),"duplicate prefab");prefabs.update(hits)
    for p in a.dependency:
        src=Source(p);require(src.cab not in sources,'duplicate dependency CAB');sources[src.cab]=src
        _,files=unityfs(p.read_bytes(),include_resources=True);resources[src.cab]={k:v for k,v in files.items() if k.endswith('.resS')}
    maps=attachment_maps(Source(a.avatar),Source(a.script))
    with zipfile.ZipFile(a.base) as b,zipfile.ZipFile(a.player_delta) as p:
        bf=archive_files(b);pf=archive_files(p)
        base=json.loads(b.read(bf["local-preview.json"]));player=json.loads(p.read(pf["companion-player-delta.json"]))
        require(base["models"]==player["models"],"player base mismatch")
        model_nodes={}
        for body in BODY_TYPES:
            e=base["models"][body];raw=b.read(bf[e["sha256"]+".glb"])
            require(digest(raw)==e["sha256"] and len(raw)==e["bytes"],"model identity");model_nodes[body]=metadata(raw)["nodes"]
        candidates={};clip_targets={body:set() for body in BODY_TYPES}
        for item,row in player["items"].items():
            prefab=prefabs.get(targets.get(item))
            if not prefab:continue
            poses=[c["pose"] for c in prefab["poseComponents"] if c["enabled"] and c["pose"] and all(c["pose"]["clipGuids"].get(body) for body in BODY_TYPES)]
            if len(poses)!=1:continue
            candidates[item]=(prefab,poses[0])
            for body in BODY_TYPES:clip_targets[body].add(poses[0]["clipGuids"][body])
        native={body:read_bundle(getattr(a,body+"_clips"),clip_targets[body]) for body in BODY_TYPES}
        assets={};items={};failures={};texture_cache={}
        for item,(prefab,pose) in sorted(candidates.items()):
            try:
                row=player["items"][item]
                for body in BODY_TYPES:
                    guid=pose["clipGuids"][body];require(native[body][guid]["clipSha256"]==row[body]["sourceSha256"],"player source mismatch")
                src=sources[prefab["assetFile"]];require(src.sha==prefab["bundleSha256"],"prefab source mismatch")
                hierarchy,ani,_,_,ctrl=animator(src,int(prefab["pathId"]))
                clip,_,_=resolve_clip(src,ctrl,pose,sources)
                root=int(hierarchy[ani]["pathId"])
                descendants,_=src.hierarchy(root)
                classes={src.objects[p][0] for n in descendants for f,p in src.names[int(n["gameObject"])][1] if f==0}
                if 137 not in classes and {23,33}<=classes:
                    nodes,parts=rigid_meshes(src,root,resources[src.cab])
                else:nodes,parts=meshes(src,root,base_pass_only=a.base_pass_only)
                anchors={}
                for body in BODY_TYPES:
                    e=row[body]["clip"];wpa=p.read(pf[e["sha256"]+".wpa"]);require(digest(wpa)==e["sha256"] and len(wpa)==e["bytes"],"player clip integrity")
                    d=metadata(wpa,True);duration=max(d["accessors"][s["input"]]["max"][0] for s in d["animation"]["samplers"])
                    require(abs(duration-(clip["end"]-clip["start"]))<1e-5,"actor timing mismatch")
                    path=maps[body+"Preview"]["points"][pose["attachmentPoint"]] or "body"
                    ids=[i for i,n in enumerate(model_nodes[body]) if n["name"]==path];require(len(ids)==1,"anchor mismatch")
                    anchors[body]=dict(node=ids[0],path=path)
                raw=export_actor(src,hierarchy,nodes,parts,pose,clip,sources,resources,texture_cache,secondary_pass=a.base_pass_only);h=digest(raw)
                assets[h+".glb"]=raw;items[item]=dict(asset=dict(sha256=h,bytes=len(raw)),sourceSha256=clip["sha256"],anchors=anchors)
            except (ValueError,KeyError) as exc:
                failures[item]=str(exc)
        require(items,"no convertible companion actors")
        result=dict(schema="wand.photo-mode.companion-actor-delta@1",gameVersion=base["gameVersion"],
                    baseReleaseSha256=RELEASE_SHA,baseCompanionDeltaSha256=DELTA_SHA,models=base["models"],items=items)
        with zipfile.ZipFile(a.out,"x",compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:
            z.writestr("companion-actor-delta.json",json.dumps(result,separators=(",",":")))
            for name,raw in sorted(assets.items()):z.writestr(name,raw)
        print("Converted actors",len(items),"assets",len(assets),"bytes",a.out.stat().st_size,digest(a.out.read_bytes()))
        print("Unresolved",json.dumps(failures,sort_keys=True))


if __name__=="__main__":
    p=argparse.ArgumentParser(description=__doc__)
    for name in ("base","player-delta","itemlist","script","avatar","male-clips","female-clips","out"):
        p.add_argument("--"+name,type=Path,required=True)
    p.add_argument("--dependency",type=Path,action="append",default=[])
    p.add_argument("--base-pass-only",action="store_true",help="Explicit diagnostic projection without observed secondary effects")
    p.add_argument("--pet",type=Path,action="append",required=True)
    a=p.parse_args();a.out=a.out.resolve()
    require(not any((x/".git").exists() for x in (a.out,*a.out.parents)),"private output outside Git required")
    generate(a)
