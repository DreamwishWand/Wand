#!/usr/bin/env python3
"""Build a private, root-local background candidate from native map extraction.
Not an activation manifest or a world/Grid registration. No raster generation.
"""
import argparse
import hashlib
import json
import math
import struct
from pathlib import Path
from inspect_native_map_layout import extract, load_bundle, Reader, check
from inspect_native_map_texture_refs import inspect

ROLES={'async-background':'texture','solid-background':'fill','material-texture-background':'sdf'}
GRAPHICS={'UnityEngine.UI.Image','UnityEngine.UI.RawImage','Gameloft.UI.ExtendedRawImage'}
OCEAN_MATERIAL=('cab-c7b82ed621198ccecdfd17cfe219a777','-1132274334993459592')


def identity(ref):
    return ref['cab'].lower(), ref['pathID']


def geometry(corners):
    check(len(corners)==3 and all(len(p)==2 and all(math.isfinite(v) for v in p) for p in corners),'Invalid corners')
    (x,y),(rx,ry),(bx,by)=corners
    a,b,c,d=rx-x,ry-y,bx-x,by-y
    check(abs(a*d-b*c)>1e-8,'Degenerate quad')
    return [a,b,c,d,x,y]


def blocker_area_types(world,cab):
    nodes=world['renderNodes']
    by_go={n['gameObject']:n['rectTransform'] for n in nodes}
    by_rect={n['rectTransform']:n for n in nodes}
    check(len(by_go)==len(by_rect)==len(nodes),'Duplicate native node')
    direct={}
    for node in nodes:
        for c in node['components']:
            if c['type']!='Mdl.Ui.MapVillageArea' or not c['enabled']:continue
            for p in c['blockers']:
                check(p is not None and p['cab'].lower()==cab.lower() and p['pathID'] in by_go,'Unresolved area blocker')
                direct.setdefault(by_go[p['pathID']],set()).add(c['areaType'])
    result={}
    for node in nodes:
        pid=node['rectTransform'];areas=set();visited=set()
        while pid!='0':
            check(pid in by_rect and pid not in visited,'Invalid blocker ancestry')
            visited.add(pid);areas.update(direct.get(pid,()))
            pid=by_rect[pid]['parent']
        result[node['rectTransform']]=sorted(areas)
    return result


def build(graph,hires,lowres):
    check(graph['renderGraphSchema']=='wand.src04.native-map-render-graph@1','Wrong graph')
    check(hires['samplingMetadataVerified'],'Native sampling not verified')
    low_sha=hashlib.sha256(lowres.read_bytes()).hexdigest()
    check(low_sha=='ef996d338d74f4396e53ca80b8e5a3d81b7a6d4ab9f9eaef3c865a14fe6af95f','Lowres layout not verified for this source')
    cab,(objects,_,unity)=load_bundle(lowres)
    check(unity==graph['unityVersion']==hires['unityVersion'],'Unity version mismatch')
    maps=[]
    for world in graph['worlds']:
        layers=[];corners=[]
        blocker_areas=blocker_area_types(world,graph['prefabCab'])
        for node in world['renderNodes']:
            if node['role'] not in ROLES:continue
            kind=ROLES[node['role']]
            cs=node['components'];g=[c for c in cs if c['type'] in GRAPHICS]
            check(len(g)==1,'Ambiguous graphic');g=g[0]
            check(node['activeInPrefab'] and g['enabled'],'Inactive background requires explicit handling')
            m=geometry(node['rootLocalCorners']);a,b,c,d,x,y=m
            corners.extend([(x,y),(x+a,y+b),(x+c,y+d),(x+a+c,y+b+d)])
            row={'kind':kind,'node':node['rectTransform'],'rootLocalQuad':m,'rgba':g['rgba'],'blockerAreaTypes':blocker_areas[node['rectTransform']]}
            check(len(g['rgba'])==4 and all(0<=v<=1 for v in g['rgba']),'Invalid color')
            if kind=='fill':
                check(g['asset'] is None and g['material'] is None and g['imageType']==0 and not g['preserveAspect'],'Unsupported fill')
            else:
                check(g['uvRect']==[0,0,1,1] and not any(g.get('flipMirror',[])) and not any(g.get('padding',[])) and not any(g.get('spacing',[])),'Unsupported graphic mapping')
                if kind=='texture':
                    ac=[c for c in cs if c['type']=='Gameloft.UI.AsyncRawImage']
                    check(len(ac)==1 and ac[0]['enabled'] and g['material'] is None and g['rgba']==[1,1,1,1],'Unsupported async graphic')
                    guid=ac[0]['guid'];t=hires['assets'][guid]['28'];s=t['sampling']
                    check(s['textureColorSpace']==1 and s['filterMode']==1 and s['mipCount']==1,'Unexpected normal sampler')
                    row.update(guid=guid,source={'cab':hires['cab'],'pathID':t['pathID']},size=[t['width'],t['height']],wrap=[s['wrapU'],s['wrapV']],colorSpace='sRGB')
                else:
                    check(identity(g['material'])==OCEAN_MATERIAL and g['asset']['cab'].lower()==cab.lower(),'Unknown SDF material or texture')
                    pid=g['asset']['pathID'];cl,raw=objects[int(pid)]
                    check(cl==28,'Expected Texture2D');r=Reader(raw);name=r.aligned_string();o=r.pos
                    w,h,total=[int.from_bytes(raw[o+i:o+i+4],'little',signed=True) for i in (4,8,12)]
                    fmt,mips=[int.from_bytes(raw[o+i:o+i+4],'little',signed=True) for i in (20,24)]
                    check(name.endswith('_sdf') and 0<w<=4096 and 0<h<=4096 and total==w*h and (fmt,mips)==(63,1),'Unexpected SDF source')
                    filter_mode,aniso,bias,u,v,z,lightmap,color=struct.unpack_from('<iifiiiii',raw,o+52)
                    check((filter_mode,aniso,bias,u,v,z,color)==(1,1,0,1,1,1,0),'Unexpected SDF sampler')
                    row.update(source=g['asset'],size=[w,h],wrap=[u,v],colorSpace='Linear')
            layers.append(row)
        check(layers,'Empty map')
        left=math.floor(min(x for x,y in corners));top=math.ceil(max(y for x,y in corners));right=math.ceil(max(x for x,y in corners));bottom=math.floor(min(y for x,y in corners))
        # Preserve root-local units: positive y is up in Unity, down in candidate.
        for row in layers:
            a,b,c,d,x,y=row['rootLocalQuad'];row['unitQuadToCanvas']=[a,-b,c,-d,x-left,top-y]
        maps.append({'id':world['prefab'],'width':right-left,'height':top-bottom,'rootToCanvas':[1,0,0,-1,-left,top],'layers':layers})
    return {'schema':'wand.src04.native-map-geometry-candidate@1','state':'unpublished','privateOnly':True,'runtimeVisibilityVerified':False,'worldPlacementVerified':False,'framebufferColorSpaceVerified':False,'publicationAuthorized':False,'sources':{'prefabSha256':graph['prefabSha256'],'monoScriptSha256':graph['monoScriptSha256'],'hiresSha256':hires['bundleSha256'],'lowresSha256':low_sha},'maps':maps}


def main():
    p=argparse.ArgumentParser(description=__doc__)
    for arg in ('prefab','monoscripts','hires','lowres','out'):p.add_argument('--'+arg,type=Path,required=True)
    a=p.parse_args();out=a.out.resolve()
    check(not out.exists() and not any((x/'.git').exists() for x in out.parents),'Use a new private report outside Git')
    doc=build(extract(a.prefab,a.monoscripts),inspect(a.hires),a.lowres)
    with out.open('x',encoding='utf-8') as f:json.dump(doc,f,separators=(',',':'),allow_nan=False)
    print(len(doc['maps']),'maps;',sum(len(m['layers']) for m in doc['maps']),'background layers')

if __name__=='__main__':main()
