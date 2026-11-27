#!/usr/bin/env python3
"""Derive source-only world-to-background candidates, never a verified registration."""
import argparse
import hashlib
import json
from pathlib import Path
from inspect_native_map_layout import Reader, check, load_bundle, script_ids, extract, unityfs, serialized

MENU_SHA='46bcfc84aa09ab9eb11e8b343a0bc3abf20d303683d01c3371aeba6f99be12b6'
PREFAB_SHA='cdeff3ce9e896c5a8b84a9d889cab936f8e13048ad8fd904e0aae84f656d00a3'
MONO_SHA='c0f5d54d2b03116dfb757d70e84531c99f54b9e9698947ae7ced7645709f9107'
ASSEMBLY_SHA='a574a3c41b2911f6031070d05f933f562e4b3efdb881ac3c774384a0effee653'
MENU_IDS=(5138875048832321702,7890347433120812857)


def digest(path):
    with path.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()


def transform(raw,cl):
    r=Reader(raw);f,go=r.ptr();check(f==0,'External owner')
    q=[r.number('f') for _ in range(4)];p=[r.number('f') for _ in range(3)];s=[r.number('f') for _ in range(3)]
    children=[r.ptr() for _ in range(r.count())];f,parent=r.ptr();check(f==0 and all(f==0 for f,_ in children),'External transform')
    rect=[r.number('f') for _ in range(10)] if cl==224 else None
    check(r.pos==len(raw),'Unexpected transform layout')
    return {'go':go,'parent':parent,'q':q,'position':p,'scale':s,'rect':rect}


def component(raw):
    r=Reader(raw);f,go=r.ptr();enabled=r.number('B');r.align();sf,sp=r.ptr();r.aligned_string()
    check(f==0,'External component owner');return go,enabled,sf,sp,r


def menu_data(path,script_cab=None,scripts=None):
    check(digest(path)==MENU_SHA,'Unknown MapMenu source')
    cab,(objs,extern,unity)=load_bundle(path);check(unity=='6000.0.62f1','Unknown Unity version')
    rects={pid:transform(b,cl) for pid,(cl,b) in objs.items() if cl==224}
    by_go={r['go']:pid for pid,r in rects.items()}
    def name(pid):
        cl,b=objs[rects[pid]['go']];check(cl==1,'Expected GameObject');r=Reader(b);r.read(12*r.count());r.number('i');return r.aligned_string()
    def ref(b,off,go=False):
        r=Reader(b);r.pos=off;f,p=r.ptr();check(f==0,'External holder');return by_go[p] if go else p
    def common(pid,par,scale,anchor,position):
        r=rects[pid];v=r['rect'];check(r['parent']==par and r['q']==[0,0,0,1] and r['position']==[0,0,0] and r['scale']==scale and v[:4]==anchor and v[4:6]==position and v[8:]==[.5,.5],'Unexpected holder geometry: '+name(pid))
    rows=[]
    center=[.5]*4;unit=[1,1,1]
    for pid in MENU_IDS:
        cl,b=objs[pid];check(cl==114,'Expected MapMenu')
        holder=ref(b,1280);content=ref(b,1292,True);bg=ref(b,1304,True);items=ref(b,1636);background=rects[holder]['parent'];scale=rects[holder]['scale']
        check(scale[0]==scale[1] and 0<scale[0]<1 and scale[2]==1,'Unexpected holder scale')
        check([name(p) for p in (holder,background,bg,content,items)]==['mc_map','mc_background','mc_bgHolder','Content','ItemsHolder'],'Holder identity changed')
        common(holder,background,scale,center,[0,12]);common(background,bg,unit,center,[0,0]);common(bg,content,unit,[0,0,1,1],[0,0]);common(items,content,unit,center,[0,0])
        markers=[ref(b,i,True) for i in range(1316,1448,12)]
        check(len(set(markers))==11,'Unexpected marker holders')
        for p in markers:common(p,items,unit,center,[0,0])
        templates=[]
        if scripts is not None:
            expected=[('MapCharacterItem','Mdl.Ui.MapCharacterItem'),('MapGateItem','Mdl.Ui.MapGateItem'),('MapFurniture(NoBg)','Mdl.Ui.MapBuildingItem'),('MapBlueprintItem','Mdl.Ui.MapBlueprintItem'),('MapBuildingItem','Mdl.Ui.MapBuildingItem'),('MapBuildingItem(NoBg)','Mdl.Ui.MapBuildingItem'),('MapPointOfInterest(HexBg)','Mdl.Ui.MapBuildingItem')]
            for off,(expected_name,expected_type) in zip(range(968,1052,12),expected):
                r=Reader(b);r.pos=off;f,cp=r.ptr();check(f==0 and objs[cp][0]==114,'Invalid marker prefab')
                go,en,sf,sp,_=component(objs[cp][1]);check(0<sf<=len(extern) and extern[sf-1]==script_cab and scripts.get(sp,('', ''))[0]==expected_type,'Marker script changed')
                rp=by_go[go];t=rects[rp];check(name(rp)==expected_name and name(t['parent'])=='Prefabs','Marker prefab owner changed')
                common(rp,t['parent'],unit,center,[0,0]);templates.append({'fieldOffset':off,'component':str(cp),'rectTransform':str(rp),'type':expected_type,'name':expected_name,'rect':t['rect'],'scale':t['scale']})
        rows.append({'component':str(pid),'holderScale':scale[:2],'holderAnchor':rects[holder]['rect'][4:6],'content':str(content),'backgroundChain':[str(bg),str(background),str(holder)],'itemsHolder':str(items),'markerHolders':[{'id':str(p),'name':name(p)} for p in markers],'markerTemplates':templates})
    check(rows[0]['holderScale']==rows[1]['holderScale'] and rows[0]['holderAnchor']==rows[1]['holderAnchor'],'PC/mobile geometry differs')
    return cab,rows


def build(menu,prefab,mono,assembly,scenes,geometry):
    check(digest(prefab)==PREFAB_SHA and digest(mono)==MONO_SHA and digest(assembly)==ASSEMBLY_SHA,'Unknown source version')
    with assembly.open('rb') as f:
        f.seek(0x7c59c00+0x18907979c-0x187c5c000);import struct
        constant=struct.unpack('<f',f.read(4))[0]
    check(constant==540,'Unknown projection constant')
    with assembly.open('rb') as f:
        f.seek(0x692f80);check(f.read(3)==b'\xc2\x00\x00','Calibration OnEnable body changed')
    script_cab,scripts=script_ids(mono);menu_cab,menus=menu_data(menu,script_cab,scripts)
    graph=extract(prefab,mono);cab,(objs,extern,unity)=load_bundle(prefab)
    roots={int(w['renderNodes'][0]['gameObject']):w for w in graph['worlds']}
    geom={m['id']:m for m in geometry['maps']};check(geometry['sources']['prefabSha256']==PREFAB_SHA and geometry['worldPlacementVerified'] is False and len(geom)==10,'Geometry source mismatch')
    rects={pid:transform(b,cl) for pid,(cl,b) in objs.items() if cl==224};by_go={r['go']:pid for pid,r in rects.items()}
    specific={}
    for pid,(cl,b) in objs.items():
        if cl!=114:continue
        go,en,sf,sp,r=component(b)
        if not (0<sf<=len(extern) and extern[sf-1]==script_cab and scripts.get(sp,('',''))[0]=='Mdl.Ui.MapSpecificData'):continue
        parent=by_go[go]
        while rects[parent]['parent']:parent=rects[parent]['parent']
        root=rects[parent]['go'];check(root in roots and root not in specific and en==1,'SpecificData identity mismatch')
        size=r.number('f');offset=[r.number('f') for _ in range(2)];offset_gp=[r.number('f') for _ in range(2)];sid=r.number('i');r.aligned_string();check(r.pos==len(b) and size>0,'Unexpected specific data')
        specific[root]=(size,sid,offset,offset_gp,str(pid))
    check(len(specific)==10,'Missing specific data')
    rows=[];seen=set()
    for path in scenes:
        for scab,raw in unityfs(path).items():
            if not scab.startswith("CAB-") or "." in scab:continue
            so,se,su=serialized(raw);check(su==unity,"Scene version mismatch")
            for pid,(cl,b) in so.items():
                if cl!=114:continue
                go,en,sf,sp,r=component(b)
                if not(0<sf<=len(se) and se[sf-1]==script_cab and sp==1146813874736257657):continue
                cf,cp=r.ptr();pf,pp=r.ptr();check(cf==0 and 0<pf<=len(se) and se[pf-1]==cab and pp in roots and pp not in seen,'Invalid camera reference')
                seen.add(pp);w=roots[pp];chain=[];current=cp
                while current:
                    check(current not in [int(x['id']) for x in chain] and so[current][0]==4,'Invalid camera ancestry')
                    tr=transform(so[current][1],4);chain.append({'id':str(current),**{k:v for k,v in tr.items() if k not in ('go','parent','rect')}});current=tr['parent']
                check(len(chain)==4 and all(t['scale']==[1,1,1] for t in chain),'Unexpected camera scale')
                check(chain[0]['q']==[0.7071068286895752,0,0,0.7071068286895752] and all(t['q']==[0,0,0,1] and t['position']==[0,0,0] for t in chain[1:]),'Unexpected camera transform')
                root=w['rootRect'];check(root[:4]==[.5]*4 and root[8:]==[.5,.5] and w['renderNodes'][0]['localScale']==[1,1,1] and w['renderNodes'][0]['localRotation']==[0,0,0,1],'Unexpected root geometry')
                ortho,scene_id,off,off_gp,spec_id=specific[pp];cx,cy,cz=chain[0]['position'];sx,sy=menus[0]['holderScale'];hx,hy=menus[0]['holderAnchor'];rx,ry=root[4:6];m=geom[w['prefab']]['rootToCanvas'];check(m[:4]==[1,0,0,-1],'Unexpected candidate canvas')
                kx=constant/ortho/sx;ky=constant/ortho/sy
                # Assumes unchanged centered marker anchors and normalized shared zoom; not runtime-verified.
                matrix=[kx,0,0,-ky,m[4]-kx*cx-hx/sx-rx,m[5]+ky*cz+hy/sy+ry]
                rows.append({'prefab':w['prefab'],'sceneId':scene_id,'sceneSha256':digest(path),'sceneCab':scab,'cameraComponent':str(pid),'cameraChain':chain,'specificData':spec_id,'orthographicSize':ortho,'mapOffset':off,'mapOffsetGP':off_gp,'rootAnchor':root[4:6],'rootToCanvas':m,'worldXZToCanvasCandidate':matrix,'halfWorldTicksToCanvasCandidate':[kx/2,0,0,ky/2,*matrix[4:]],'worldPlacementVerified':False})
    check(seen==set(roots) and len(rows)==10,'Incomplete camera coverage')
    return {'schema':'wand.src04.native-map-registration-candidate@1','privateOnly':True,'publicationAuthorized':False,'worldPlacementVerified':False,'runtimeMarkerAnchorVerified':False,'serializedMarkerTemplatesVerified':True,'calibrationOnEnableReturnsImmediately':True,'menuCab':menu_cab,'menus':menus,'maps':rows}


def main():
    p=argparse.ArgumentParser(description=__doc__)
    for arg in ('menu','prefab','mono','assembly','geometry','out'):p.add_argument('--'+arg,type=Path,required=True)
    p.add_argument('--scene',type=Path,nargs='+',required=True);a=p.parse_args();out=a.out.resolve()
    check(not out.exists() and not any((d/'.git').exists() for d in out.parents),'Private output outside Git required')
    doc=build(a.menu,a.prefab,a.mono,a.assembly,a.scene,json.loads(a.geometry.read_text()))
    with out.open('x') as f:json.dump(doc,f,indent=2,allow_nan=False)
    print(len(doc['maps']),'candidate projections; 22 marker holders')

if __name__=='__main__':main()
