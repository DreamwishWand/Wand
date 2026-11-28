"""Decode the native PhotoMode face layer and its original clip overrides.
Private derived output: no raw bundle copy, no guessed facial retargeting.
"""
import argparse,json,struct
from pathlib import Path
from zlib import crc32
from resolve_animation_bundle import Reader,digest,unityfs,serialized_objects
from pose_curves import decode,require
from pose_pet_controller import controller
from pose_material import externals
from pose_optimized_avatar import avatar_nodes

NAMES=('face_center_bashful_smile_01','face_center_cocky_look_01','face_center_cocky_smile_01','face_center_happy_grin_01','face_center_happy_grin_02','face_center_happy_wink_01','face_center_scary_01','selfie_default_center_01','selfie_default_down_01','selfie_default_up_01')
PINS={'visual':'db3faaaa68cddd76d4e5ebfc83eb484a49faf34fc972c23886393397299745ec','male':'d22c155c50d516cff8abe6879c310351063b06dd571c42c5d15b89d9f36cbe99','female':'08f717620f43a0c99753b0ebab30981659e1e9c1f273cd09f6133fc1c5893ac1','maleRig':'7712b04502a06254e04e5b0fe25aba2b9b9d56dc15a2fcfdc26b6f1b5e327960','femaleRig':'38f2069245537e4b0849bd78f550d05c5b0d5d868469b1e8b2bcea38a69a55f8'}

def read_bundle(path,key):
    raw=path.read_bytes();require(digest(raw)==PINS[key],'source bundle pin: '+key)
    version,files=unityfs(raw);require(version=='6000.0.62f1' and len(files)==1,'source bundle layout')
    name,data=next(iter(files.items()));v,objs=serialized_objects(data);require(v==version,'serialized version')
    return name,data,objs

def object_bytes(bundle,pid,cls):
    c,o,n=bundle[2][pid];require(c==cls,'object class');return bundle[1][o:o+n]

def named(bundle,cls,name):
    rows=[pid for pid,(c,o,n) in bundle[2].items() if c==cls and Reader(bundle[1][o:o+n]).string()==name]
    require(len(rows)==1,'missing or ambiguous '+name);return rows[0],object_bytes(bundle,rows[0],cls)

def mask(raw):
    r=Reader(raw);name=r.string();human=r.unpack(f'{r.count(4)}I');require(human==(1,)*13,'human mask layout')
    paths={}
    for _ in range(r.count(8)):
        path=r.string();w,=r.unpack('f');h=crc32(path.encode());require(h not in paths and w in (0.,1.),'mask path');paths[h]={'path':path,'weight':w}
    require(r.pos==len(raw) and len(paths)==205,'mask coverage');return paths

def layers(raw):
    r=Reader(raw);r.string();r.take(4);out=[]
    for _ in range(r.count(32)):
        machine,motion=r.unpack('II');r.take(12);weights={}
        for _ in range(r.count(8)):
            h,w=r.unpack('If');require(h not in weights,'duplicate layer path');weights[h]=w
        name,blend,weight=r.unpack('IIf');flags=r.take(2);r.align();out.append(dict(machine=machine,motion=motion,weights=weights,name=name,blend=blend,weight=weight,flags=list(flags)))
    return out

def read_controller(raw):
    r,machines,_,_=controller(raw);r.take(r.count(12)*12)
    for w in (12,16,12,4,4,1):r.take(r.count(w)*w)
    r.align();strings={}
    for _ in range(r.count(8)):
        h,=r.unpack('I');s=r.string();require(h not in strings,'controller strings');strings[h]=s
    clips=[r.unpack('iq') for _ in range(r.count(12))]
    return machines,strings,clips,layers(raw)

def export(visual,male,female,male_rig,female_rig,out):
    v=read_bundle(visual,'visual');cid,raw=named(v,91,'avatar_dynamic_photoMode_controller')
    machines,strings,clips,ls=read_controller(raw);refs=externals(v[1]);result={'schema':'wand.photo-mode.private-native-expressions@1','gameVersion':'1.26.2','fullPoseVerified':False,'publicationAuthorized':False,'sourcePins':PINS,'controllerSha256':digest(raw),'layers':{},'states':{},'bodies':{}}
    for layer_name,mask_name,count,weight in (('Facial_Animation','Avatar_Face_Mask',40,1.),('Facial_Animation_Portrait','Avatar_Face_Mask_Portrait',42,0.)):
        found=[l for l in ls if strings[l['name']]==layer_name];require(len(found)==1,'face layer identity');l=found[0];_,mraw=named(v,319,mask_name);m=mask(mraw)
        require(l['weights']=={h:p['weight'] for h,p in m.items()} and sum(p['weight'] for p in m.values())==count and l['blend']==0 and l['weight']==weight,'face mask / controller identity')
        result['layers'][layer_name]={**l,'name':layer_name,'maskSha256':digest(mraw),'paths':m}
    normal=result['layers']['Facial_Animation'];portrait=result['layers']['Facial_Animation_Portrait'];require(normal['machine']==portrait['machine'],'shared facial state machine')
    states={};machine=machines[normal['machine']]
    for t in machine['anys']:
        cond=t['conditions'];key=None
        if len(cond)==2 and [(c[0],strings.get(c[1])) for c in cond]==[(1,'PhotoPose_Face'),(6,'PhotoPose_FaceNumber')]:
            require(cond[1][2] in range(7),'face number');key=str(int(cond[1][2]))
        elif len(cond)==1 and cond[0][0]==1 and strings.get(cond[0][1]) in ('PhotoMode_Default','PhotoMode_Selfie'):key=strings[cond[0][1]]
        if key is None:continue
        s=machine['states'][t['destination']];trees=s['trees'];require(len(trees)==2 and all(len(x)==1 and not x[0]['children'] and not x[0]['mirror'] and x[0]['blendType']==0 for x in trees) and trees[0][0]['clip']==trees[1][0]['clip'] and s['speed']==1 and s['cycle']==0,'face state tree')
        idx=trees[0][0]['clip'];ref=clips[idx];require(ref[0]==0,'local base clip');name=Reader(object_bytes(v,ref[1],74)).string();expected=NAMES[int(key)] if key.isdigit() else NAMES[7];require(name==expected and key not in states,'native face state reference')
        states[key]={'clipName':name,'state':strings[s['fullPathId']],'transitionDuration':t['duration'],'transitionOffset':t['offset'],'speed':s['speed'],'cycle':s['cycle'],'basePathId':str(ref[1])}
    require(set(states)=={*(str(i) for i in range(7)),'PhotoMode_Default','PhotoMode_Selfie'},'face states coverage');result['states']=states
    for sex,cp,rp in (('male',male,male_rig),('female',female,female_rig)):
        cb=read_bundle(cp,sex);rb=read_bundle(rp,sex+'Rig');_,avatar=named(rb,90,'body'+sex.title()+'Avatar');nodes=avatar_nodes(avatar);paths={n['pathHash']:n['path'] for n in nodes};require(len(paths)==len(nodes),'rig path uniqueness')
        _,override=named(v,221,'avatar_dynamic_photoMode_'+sex+'_controller');r=Reader(override);r.string();require(r.unpack('iq')==(0,cid),'override controller identity');over={}
        for _ in range(r.count(24)):
            a,b=r.unpack('iq'),r.unpack('iq');require(a not in over,'duplicate override');over[a]=b
        require(r.pos==len(override),'override tail');body={'overrideSha256':digest(override),'rigSha256':digest(avatar),'rigPaths':paths,'clips':{}}
        for name in NAMES:
            baseid,_=named(v,74,name);f,pid=over[(0,baseid)];require(0<f<=len(refs) and refs[f-1].rsplit('/',1)[-1]==cb[0],'override external bundle identity');clip=decode(object_bytes(cb,pid,74));require(clip['name']==name,'override clip identity')
            mapped=[];missing=[];non=[]
            for b in clip['bindings']:
                h=b['pathHash'];w=normal['weights'].get(h,0);pw=portrait['weights'].get(h,0)
                if b['classId']==4 and (w or pw):
                    rec={**b,'normalWeight':w,'portraitWeight':pw,'path':normal['paths'][h]['path']}
                    require(b['customType']==b['pointer']==b['integer']==0 and b['attribute'] in (1,2,3),'unsupported face transform')
                    (mapped if h in paths and paths[h]==rec['path'] else missing).append(rec)
                elif b['classId']!=4:non.append({**b,'parameterName':strings.get(b['attribute']) if b['classId']==95 and b['customType']==0 else None})
            # Retain exact scalar streams/dense samples/constants: no resampling or speculative parameter mapping.
            body['clips'][name]={'pathId':str(pid),'source':clip,'mappedFaceBindings':mapped,'missingFaceBindings':missing,'nonTransformBindings':non}
        require(len(body['clips'])==10,'face clips coverage');result['bodies'][sex]=body
    out=out.resolve();require(not any((p/'.git').exists() for p in (out,*out.parents)),'private output must remain outside Git')
    with out.open('x',encoding='utf-8') as f:json.dump(result,f,separators=(',',':'),allow_nan=False)
    return result

def main():
    p=argparse.ArgumentParser(description=__doc__)
    for key in ('visual','male','female','male-rig','female-rig','out'):p.add_argument('--'+key,type=Path,required=True)
    a=p.parse_args();m=export(a.visual,a.male,a.female,a.male_rig,a.female_rig,a.out)
    print(json.dumps({b:{'clips':len(v['clips']),'mapped':len(v['clips'][NAMES[0]]['mappedFaceBindings']),'missing':len(v['clips'][NAMES[0]]['missingFaceBindings']),'nonTransform':len(v['clips'][NAMES[0]]['nonTransformBindings'])} for b,v in m['bodies'].items()}))
if __name__=='__main__':main()
