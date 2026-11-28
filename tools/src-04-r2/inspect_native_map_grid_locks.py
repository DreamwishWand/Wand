#!/usr/bin/env python3
"""Resolve source MapGridLocks entries to matching prefab area names, privately."""
import argparse,json,math
from pathlib import Path
from inspect_native_map_layout import Reader,check,script_ids,unityfs,serialized
from inspect_native_map_registration import component,transform,digest,MONO_SHA


def inspect(mono,scenes,registration,graph,locks):
    check(digest(mono)==MONO_SHA,'Unknown script source')
    check(registration['schema']=='wand.src04.native-map-registration-candidate@1' and registration['privateOnly'] is True and registration['worldPlacementVerified'] is False,'Expected private registration')
    check(graph['prefabSha256']==locks['prefabSha256'],'Prefab mismatch')
    cab,scripts=script_ids(mono)
    reg={m['sceneSha256']:m for m in registration['maps']}
    rows=[];seen=set()
    for path in scenes:
        h=digest(path);check(h in reg and h not in seen,'Invalid source scene');seen.add(h);m=reg[h]
        for scab,raw in unityfs(path).items():
            if scab!=m['sceneCab']:continue
            objs,extern,unity=serialized(raw);check(unity=='6000.0.62f1','Unexpected Unity version')
            transforms={pid:transform(b,cl) for pid,(cl,b) in objs.items() if cl==4}
            def script(sf,sp):return scripts.get(sp,('',''))[0] if 0<sf<=len(extern) and extern[sf-1]==cab else ''
            for pid,(cl,b) in objs.items():
                if cl!=114:continue
                go,en,sf,sp,r=component(b)
                if script(sf,sp)!='Mdl.Ui.MapGridLocks':continue
                check(en==1,'Unexpected component state')
                g=next(x for x in graph['worlds'] if x['prefab']==m['prefab']);l=next(x for x in locks['maps'] if x['id']==m['prefab'])
                nodes={n['rectTransform']:n for n in g['renderNodes']};names={nodes[a['node']]['hierarchy'].rsplit('/',1)[-1]:a for a in l['areas']}
                count=r.count();check(count==len(names)==len(l['areas'])==4,'Unexpected grid lock coverage')
                entries=[]
                for _ in range(count):
                    name=r.aligned_string();n=r.count();check(n==1 and name in names,'Unexpected lock entry')
                    f,p=r.ptr();check(f==0 and p in objs and objs[p][0]==114,'Invalid local grid reference')
                    target,enabled,fs,ps,rr=component(objs[p][1]);check(script(fs,ps)=='Mdl.Grid.GridScript' and enabled==1,'Unexpected grid target')
                    of,origin=rr.ptr();check(of==0 and origin in transforms,'Invalid grid origin PPtr')
                    tr=transforms[origin];position=tr['position'];check(all(math.isfinite(v) for v in position) and tr['q']==[0,0,0,1] and tr['scale']==[1,1,1],'Unsupported grid origin')
                    ancestors=[];parent=tr['parent']
                    while parent:
                        check(parent not in ancestors and parent in transforms,'Invalid grid origin ancestry')
                        ancestors.append(parent);t=transforms[parent]
                        check(t['position']==[0,0,0] and t['q']==[0,0,0,1] and t['scale']==[1,1,1],'Nonidentity ancestor')
                        parent=t['parent']
                    grid_path=rr.aligned_string();check(grid_path.startswith('GridData/OffGridBuildings/Expansion04/Underwater'),'Unexpected grid data path')
                    a=names.pop(name);check(a['enabled'] and a['mode']=='overlay' and not a['blockers'] and a['areaNameCanvasGroup'] is None,'Unexpected overlay rule')
                    entries.append({'name':name,'areaType':a['areaType'],'node':a['node'],'overlayNode':a['overlayNode'],'gridComponent':str(p),'gridDataPath':grid_path,'origin':{'transform':str(origin),'position':position,'identityAncestors':[str(p) for p in ancestors]}})
                check(not names and r.pos==len(b),'Incomplete source lock entries')
                rows.append({'prefab':m['prefab'],'sceneSha256':h,'component':str(pid),'entries':entries})
    check(len(seen)==len(reg)==10 and len(rows)==3 and len({m['prefab'] for m in rows})==3,'Incomplete original scene coverage')
    return {'schema':'wand.src04.native-map-grid-lock-witness@1','privateOnly':True,'publicationAuthorized':False,'worldPlacementVerified':False,'runtimeVisibilityVerified':False,'prefabSha256':graph['prefabSha256'],'maps':rows}


def main():
    p=argparse.ArgumentParser(description=__doc__)
    for arg in ('mono','registration','graph','locks','out'):p.add_argument('--'+arg,type=Path,required=True)
    p.add_argument('--scene',type=Path,nargs='+',required=True);a=p.parse_args();out=a.out.resolve()
    check(not out.exists() and not any((d/'.git').exists() for d in out.parents),'Private output outside Git required')
    doc=inspect(a.mono,a.scene,*[json.loads(v.read_text()) for v in (a.registration,a.graph,a.locks)])
    with out.open('x') as f:json.dump(doc,f,indent=2,allow_nan=False)
    print([(m['prefab'],len(m['entries'])) for m in doc['maps']])

if __name__=='__main__':main()
