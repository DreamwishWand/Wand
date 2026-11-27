#!/usr/bin/env python3
"""Private lock graph for the inspected Steam 1.26.2 map prefabs."""
import argparse
import json
import hashlib
import struct
from pathlib import Path
from inspect_native_map_layout import extract,load_bundle,Reader,check
from inspect_native_map_texture_refs import inspect,texture_sampling
from build_native_map_geometry import geometry

GRAPHICS={'UnityEngine.UI.Image','UnityEngine.UI.RawImage','Gameloft.UI.ExtendedRawImage'}

def component(node,name):
    rows=[c for c in node['components'] if c['type']==name]
    check(len(rows)<=1,'Ambiguous '+name)
    return rows[0] if rows else None

def image(node,hires):
    ac=component(node,'Gameloft.UI.AsyncRawImage')
    check(ac and ac['enabled'],'Missing async source')
    t=hires['assets'][ac['guid']]['28']
    s=t['sampling']
    return {'guid':ac['guid'],'source':{'cab':hires['cab'],'pathID':t['pathID']},'size':[t['width'],t['height']],'sampling':s}

def build(graph,hires,prefab,lowres):
    check(graph['renderGraphSchema']=='wand.src04.native-map-render-graph@1' and hires['samplingMetadataVerified'],'Unverified source')
    check(hashlib.sha256(prefab.read_bytes()).hexdigest()==graph['prefabSha256'],'Prefab changed')
    check(hashlib.sha256(lowres.read_bytes()).hexdigest()=='ef996d338d74f4396e53ca80b8e5a3d81b7a6d4ab9f9eaef3c865a14fe6af95f','Lowres source changed')
    cab,(objects,_,unity)=load_bundle(prefab)
    low_cab,(low_objects,_,low_unity)=load_bundle(lowres)
    check(cab==graph['prefabCab'] and unity==low_unity==hires['unityVersion']==graph['unityVersion'],'Bundle mismatch')
    maps=[]
    for w in graph['worlds']:
        nodes=w['renderNodes']; by_rect={n['rectTransform']:n for n in nodes};by_go={n['gameObject']:n for n in nodes}
        areas=[];overlays=[];groups=[]
        for pid,(cl,raw) in objects.items():
            if cl!=225:continue
            check(len(raw)==24,'Unknown CanvasGroup layout')
            f,go=struct.unpack_from('<iq',raw);check(f==0,'External group owner')
            if str(go) not in by_go:continue
            enabled=raw[12];alpha=struct.unpack_from('<f',raw,16)[0]
            check(enabled in (0,1) and 0<=alpha<=1 and all(x in (0,1) for x in raw[20:23]),'Invalid CanvasGroup')
            groups.append({'pathID':str(pid),'node':by_go[str(go)]['rectTransform'],'enabled':bool(enabled),'alpha':alpha,'interactable':bool(raw[20]),'blocksRaycasts':bool(raw[21]),'ignoreParentGroups':bool(raw[22])})
        group_ids={g['pathID'] for g in groups}
        for order,n in enumerate(nodes):
            area=component(n,'Mdl.Ui.MapVillageArea');mask=component(n,'SoftMasking.SoftMask')
            if area:
                for ref in (area['canvasGroup'],area['areaNameCanvasGroup']):
                    check(ref is None or (ref['cab']==cab and ref['pathID'] in group_ids),'Unresolved CanvasGroup')
                children=[c for c in nodes if c['parent']==n['rectTransform'] and component(c,'SoftMasking.SoftMaskable')]
                check(len(children)<=1,'Multiple maskable children')
                areas.append({'node':n['rectTransform'],'areaType':area['areaType'],'enabled':area['enabled'],'mode':'overlay' if mask and children else 'canvas-group','overlayNode':children[0]['rectTransform'] if mask and children else None,'canvasGroup':area['canvasGroup'],'areaNameCanvasGroup':area['areaNameCanvasGroup'],'blockers':area['blockers']})
            if n['role']!='lock-overlay':continue
            parent=by_rect[n['parent']];mask=component(parent,'SoftMasking.SoftMask');area=component(parent,'Mdl.Ui.MapVillageArea');soft=component(n,'SoftMasking.SoftMaskable')
            graphics=[c for c in n['components'] if c['type'] in GRAPHICS];check(len(graphics)==1,'Ambiguous overlay graphic');g=graphics[0]
            row={'node':n['rectTransform'],'parent':n['parent'],'drawOrder':order,'quad':geometry(n['rootLocalCorners']),'activeInPrefab':n['activeInPrefab'],'graphicEnabled':g['enabled'],'rgba':g['rgba']}
            if g['type']=='UnityEngine.UI.Image':
                check(g['asset'] is None and g['material'] is None and g['imageType']==0,'Unsupported overlay Image');row['kind']='fill'
            else:
                check(g['uvRect']==[0,0,1,1] and not any(g.get('flipMirror',[])) and g['material'] is None,'Unsupported overlay texture');row.update(kind='texture',image=image(n,hires))
            if not mask or not area or not soft:
                check(mask is None and area is None and soft is None and not n['activeInPrefab'],'Unresolved runtime mask');row.update(mode='inactive-uncontrolled');overlays.append(row);continue
            check(mask['enabled'] and area['enabled'] and soft['enabled'] and mask['borderMode']==0 and mask['separateMask'] is None and mask['uvRect']==[0,0,1,1] and mask['channelWeights']==[0,0,0,1] and not mask['invertMask'] and not mask['invertOutsides'],'Unsupported SoftMask settings')
            m={'quad':geometry(parent['rootLocalCorners']),'weights':mask['channelWeights'],'uvRect':mask['uvRect']}
            if mask['source']==0:
                m.update(kind='graphic-alpha',image=image(parent,hires))
            elif mask['source']==1:
                check(mask['sprite'] is None,'Non-null Sprite mask requires separate mapping');m['kind']='solid-fallback'
            elif mask['source']==2:
                ref=mask['texture'];check(ref['cab']==low_cab,'Unresolved explicit mask');cl,b=low_objects[int(ref['pathID'])];check(cl==28,'Expected Texture2D')
                r=Reader(b);r.aligned_string();o=r.pos;w_,h_=struct.unpack_from('<ii',b,o+4)
                m.update(kind='texture-alpha',image={'source':ref,'size':[w_,h_],'sampling':texture_sampling(b,o,w_,h_)})
            else:raise ValueError('Unknown mask source')
            row.update(mode='area-lock',areaType=area['areaType'],mask=m);overlays.append(row)
        maps.append({'id':w['prefab'],'areas':areas,'overlays':overlays,'canvasGroups':groups})
    return {'schema':'wand.src04.native-map-lock-graph@1','privateOnly':True,'publicationAuthorized':False,'runtimeVisibilityVerified':False,'maskGpuVerified':False,'prefabSha256':graph['prefabSha256'],'maps':maps}

def main():
    p=argparse.ArgumentParser(description=__doc__)
    for name in ('prefab','monoscripts','hires','lowres','out'):p.add_argument('--'+name,type=Path,required=True)
    a=p.parse_args();out=a.out.resolve();check(not out.exists() and not any((d/'.git').exists() for d in out.parents),'Private output outside Git required')
    doc=build(extract(a.prefab,a.monoscripts),inspect(a.hires),a.prefab,a.lowres)
    with out.open('x',encoding='utf-8') as f:json.dump(doc,f,separators=(',',':'),allow_nan=False)
    print(len(doc['maps']),'maps;',sum(len(w['overlays']) for w in doc['maps']),'overlays;',sum(len(w['areas']) for w in doc['maps']),'areas')

if __name__=='__main__':main()
