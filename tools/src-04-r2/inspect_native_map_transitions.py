#!/usr/bin/env python3
"""Extract independent scene transition positions for private map comparisons."""
import argparse
import json
import math
from pathlib import Path
from inspect_native_map_layout import Reader, check, script_ids, unityfs, serialized
from inspect_native_map_registration import component, transform, digest, MONO_SHA


def extract_transitions(mono, scenes, registration):
    check(digest(mono)==MONO_SHA,'Unknown MonoScript source')
    check(registration['schema']=='wand.src04.native-map-registration-candidate@1' and registration['privateOnly'] is True and registration['worldPlacementVerified'] is False,'Expected private candidate registration')
    script_cab,scripts=script_ids(mono)
    by_hash={m['sceneSha256']:m for m in registration['maps']}
    check(len(by_hash)==10,'Incomplete registration')
    results=[]
    for path in scenes:
        source_hash=digest(path)
        m=by_hash.get(source_hash)
        check(m is not None,'Unknown scene source')
        check(not any(x['prefab']==m['prefab'] for x in results),'Duplicate scene')
        points=[]
        for cab,raw in unityfs(path).items():
            if cab!=m['sceneCab']:continue
            objs,extern,unity=serialized(raw)
            check(unity=='6000.0.62f1','Unknown Unity version')
            transforms={pid:transform(b,cl) for pid,(cl,b) in objs.items() if cl==4}
            by_go={t['go']:pid for pid,t in transforms.items()}
            for pid,(cl,b) in objs.items():
                if cl!=114:continue
                go,enabled,sf,sp,r=component(b)
                if not(0<sf<=len(extern) and extern[sf-1]==script_cab and scripts.get(sp,('',''))[0]=='Mdl.Environments.VillageAreaTransition'):continue
                check(enabled==1 and go in by_go,'Unexpected transition component')
                name_reader=Reader(objs[go][1]);name_reader.read(12*name_reader.count());name_reader.number('i');name=name_reader.aligned_string()
                tr=transforms[by_go[go]];position=tr['position'];ancestors=[];parent=tr['parent']
                while parent:
                    check(parent not in ancestors and parent in transforms,'Invalid transition ancestry')
                    ancestors.append(parent);t=transforms[parent]
                    check(t['position']==[0,0,0] and t['scale']==[1,1,1] and t['q']==[0,0,0,1],'Nonidentity ancestor requires fresh verification')
                    parent=t['parent']
                check(all(math.isfinite(v) for v in position),'Invalid position')
                x,_,z=position;a,b,c,d,e,f=m['worldXZToCanvasCandidate'];px=a*x+c*z+e;py=b*x+d*z+f
                points.append({'component':str(pid),'gameObject':str(go),'name':name,'worldXYZ':position,'candidateCanvasXY':[px,py],'identityAncestors':[str(p) for p in ancestors]})
        results.append({'prefab':m['prefab'],'sceneSha256':source_hash,'sceneCab':m['sceneCab'],'points':sorted(points,key=lambda p:int(p['component']))})
    check(len(results)==10,'Incomplete scene coverage')
    return {'schema':'wand.src04.native-map-transition-witnesses@1','privateOnly':True,'publicationAuthorized':False,'worldPlacementVerified':False,'runtimeMarkerAnchorVerified':False,'maps':results}


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--mono',type=Path,required=True);p.add_argument('--registration',type=Path,required=True)
    p.add_argument('--scene',type=Path,nargs='+',required=True);p.add_argument('--out',type=Path,required=True);a=p.parse_args()
    out=a.out.resolve();check(not out.exists() and not any((d/'.git').exists() for d in out.parents),'Private output outside Git required')
    doc=extract_transitions(a.mono,a.scene,json.loads(a.registration.read_text()))
    with out.open('x') as f:json.dump(doc,f,indent=2,allow_nan=False)
    print([(m['prefab'],len(m['points'])) for m in doc['maps']])


if __name__=='__main__':main()
