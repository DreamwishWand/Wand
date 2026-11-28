"""Convert verified skinned attachment geometry and original opaque hair maps.

This private intermediate intentionally retains original SetColor palette values,
not linear shader uniforms. No publication or visual parity is asserted.
Unsupported material families, sampler states or blend modes remain explicit.
"""
import argparse, json, zipfile, zlib
from pathlib import Path
from resolve_animation_bundle import Reader,digest,unityfs,serialized_objects
from pose_material import decode_material,externals,read_streamed_texture
from convert_native_makeup import decode_mip,source_color_space
from export_native_hair_inputs import palette
from pose_curves import require

SHADER=('CAB-d79bfb1b074ecaf0c1e3e4fd94de319e','7527358103810511856')
SLOTS=(('normal','_BumpMap'),('maps','_MapsTex'),('mask','_MaskMap'))
SAMPLER=(1,1,0.,0,0,0)

def read_reused_map(previous,key,info,sampler,color):
    """Reuse only matching native texture metadata AND streamed mip bytes.
    A changed or absent source map is a cache miss, never a substitution.
    A matching but corrupt cache entry fails closed.
    """
    if previous is None:return None
    manifest,z=previous
    row=manifest['textures'].get(key)
    if row is None or any(row.get(k)!=info[k] for k in ('sourceSha256','payloadSha256','width','height','format','mips')):
        return None
    require(tuple(row['sampler'])==sampler and row['colorSpace']==color,'cached sampler identity')
    a=row['asset'];name=a['sha256']+'.wht'
    require(len(a['sha256'])==64 and all(c in '0123456789abcdef' for c in a['sha256']) and 0<a['bytes']<=64*1024*1024 and z.getinfo(name).file_size==a['bytes'],'cached map bounds')
    packed=z.read(name)
    require(digest(packed)==a['sha256'],'cached map hash')
    lengths=[4*max(1,info['width']>>i)*max(1,info['height']>>i) for i in range(info['mips'])]
    require(row['mipByteLengths']==lengths,'cached mip layout')
    size=sum(lengths);d=zlib.decompressobj();pixels=d.decompress(packed,size+1)
    require(d.eof and not d.unconsumed_tail and not d.unused_data and len(pixels)==size and digest(pixels)==row['rgbaSha256'],'cached map pixels')
    return row,packed

def convert(geometry, resources, paths, out, previous=None):
    index={};source_cabs={}
    for path in sorted(set(paths)):
        raw=path.read_bytes();v,files=unityfs(raw,include_resources=True)
        require(v=='6000.0.62f1','source bundle revision')
        cabs=[k for k in files if not k.endswith('.resS')]
        require(len(cabs)==1,'single serialized source required')
        cab=cabs[0];data=files[cab];v,obs=serialized_objects(data)
        require(v=='6000.0.62f1','serialized revision')
        pin=digest(raw)
        if cab in index:
            require(index[cab]['pin']==pin,'conflicting source CAB')
        else:
            index[cab]=dict(obs={str(p):(c,data[o:o+n]) for p,(c,o,n) in obs.items()},ext=externals(data),files=files,pin=pin)
        source_cabs[pin]=cab
    def target(cab,f,p):
        require(0<=f<=len(index[cab]['ext']) and str(p)!='0','invalid source reference')
        return (cab if f==0 else index[cab]['ext'][f-1].rsplit('/',1)[-1],str(p))
    def get(ref,cls):
        cab,p=ref;actual,data=index[cab]['obs'][p];require(actual==cls,'incorrect referenced class');return data
    maps={};blobs={};materials={};reused=set()
    def convert_map(ref):
        key=':'.join(ref)
        if key in maps:return key
        raw=get(ref,28);info,payload,lengths=read_streamed_texture(raw,index[ref[0]]['files'])
        color=source_color_space(raw);r=Reader(raw);r.string();r.take(32);group=r.string();r.take(16)
        sampler=r.unpack('IIfIII');require(sampler==SAMPLER,'unsupported sampler '+str(sampler))
        w,h,fmt=info['width'],info['height'],info['format'];require(max(w,h)<=4096,'texture dimensions')
        cached=read_reused_map(previous,key,info,sampler,color)
        if cached is not None:
            row,packed=cached;maps[key]=row;blobs[row['asset']['sha256']]=packed;reused.add(key);return key
        pixels=[];offset=0
        for i,n in enumerate(lengths):
            pixels.append(decode_mip(payload[offset:offset+n],max(1,w>>i),max(1,h>>i),fmt));offset+=n
        require(offset==len(payload),'incomplete mip chain')
        rgba=b''.join(pixels);packed=zlib.compress(rgba,6);sha=digest(packed)
        require(sha not in blobs or blobs[sha]==packed,'hash collision');blobs[sha]=packed
        maps[key]=dict(**{k:info[k] for k in ('name','width','height','format','mips','sourceSha256','payloadSha256')},colorSpace=color,sampler=sampler,group=group,rgbaSha256=digest(rgba),mipByteLengths=list(map(len,pixels)),asset=dict(sha256=sha,bytes=len(packed)))
        return key
    def convert_material(ref):
        key=':'.join(ref)
        if key in materials:return key
        raw=get(ref,21);m=decode_material(raw)
        shader=target(ref[0],*m['shader'])
        require(shader==SHADER,'unsupported shader '+str(shader))
        # Validate exact source shader object when supplied; do not accept a
        # material with a matching display name but different shader identity.
        require(digest(get(shader,48))=='956e8d032fa32c378ad3feedfd405ce2e73d6b31845290c55b4ba6fa2aca9ba4','shader source identity')
        require(m['floats'].get('_dst')==0 and m['floats'].get('_src')==1,'unsupported blend')
        refs={}
        for role,name in SLOTS:
            t=m['textures'][name];require(t['scale']==(1.,1.) and t['offset']==(0.,0.),'unsupported UV transform')
            refs[role]=convert_map(target(ref[0],t['fileId'],t['pathId']))
        require(maps[refs['normal']]['colorSpace']==0,'normal map color space')
        materials[key]=dict(name=m['name'],shader='PBR/PBR Hair',dst=0,**refs,rawMaterialColors={k:m['colors'][k] for k in ('_BaseColor','_ColorOne','_ColorTwo','_ColorThree')},sourceSha256=digest(raw))
        return key
    with zipfile.ZipFile(geometry) as z:
        g=json.loads(z.read('index.json'))
        require(g['schema']=='wand.photo-mode.private-attachment-geometry@1' and g['privateOnly'] is True and g['publicationAuthorized'] is False and g['gameVersion']=='1.26.2','private geometry required')
        items={};unresolved=[]
        for item,variants in sorted(g['items'].items()):
            for body,row in sorted(variants.items()):
                try:
                    cab=source_cabs[row['sourceBundleSha256']];parts=[]
                    for p in row['parts']:
                        m=p['material']
                        ref=(m['assetFile'],m['pathId']) if 'assetFile' in m else target(cab,m['fileId'],m['pathId'])
                        k=convert_material(ref)
                        a=p['asset'];b=z.read(a['sha256']+'.wha')
                        require(len(b)==a['bytes'] and digest(b)==a['sha256'],'geometry identity')
                        parts.append(dict(p,material=k))
                    require(parts,'empty attachment')
                    items.setdefault(item,{})[body]=dict(row,parts=parts)
                except (ValueError,KeyError,IndexError,OverflowError,AssertionError) as e:
                    unresolved.append(dict(itemId=int(item),body=body,reason=str(e)))
        require(items,'no complete opaque attachments')
        used_materials={p['material'] for v in items.values() for b in v.values() for p in b['parts']}
        materials={k:v for k,v in materials.items() if k in used_materials}
        used_maps={v[k] for v in materials.values() for k,_ in SLOTS}
        maps={k:v for k,v in maps.items() if k in used_maps}
        blobs={m['asset']['sha256']:blobs[m['asset']['sha256']] for m in maps.values()}
        reused.intersection_update(maps)
        p=palette(resources.read_bytes())
        require(len(p['base'])==len(p['highlight'])==90,'source palette coverage')
        manifest=dict(schema='wand.photo-mode.private-hair-inputs-converted@1',gameVersion='1.26.2',privateOnly=True,publicationAuthorized=False,gpuColorConversionVerified=False,shaderParityVerified=False,secondaryMotionVerified=False,coordinateSpace='UnityTextureRows',palette=p,items=items,materials=materials,textures=maps,unresolved=unresolved)
        with zipfile.ZipFile(out,'x',compression=zipfile.ZIP_STORED) as w:
            def put(name,b):w.writestr(zipfile.ZipInfo(name,(2026,11,28,0,0,0)),b)
            put('index.json',json.dumps(manifest,sort_keys=True,separators=(',',':'),allow_nan=False).encode())
            for k in sorted({p['asset']['sha256'] for v in items.values() for b in v.values() for p in b['parts']}):put(k+'.wha',z.read(k+'.wha'))
            for k,b in sorted(blobs.items()):put(k+'.wht',b)
    with zipfile.ZipFile(out) as z:
        require(z.testzip() is None,'archive integrity')
        for m in maps.values():
            a=m['asset'];packed=z.read(a['sha256']+'.wht');rgba=zlib.decompress(packed)
            require(digest(packed)==a['sha256'] and len(packed)==a['bytes'] and digest(rgba)==m['rgbaSha256'] and len(rgba)==sum(m['mipByteLengths']),'converted texture identity')
    print(json.dumps(dict(items=len(items),bodyVariants=sum(map(len,items.values())),materials=len(materials),maps=len(maps),uniqueMaps=len(blobs),reusedMaps=len(reused),generatedMaps=len(maps)-len(reused),unresolved=len(unresolved),bytes=out.stat().st_size,sha256=digest(out.read_bytes()))))

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--geometry',type=Path,required=True);p.add_argument('--resources',type=Path,required=True)
    p.add_argument('--source',type=Path,action='append',required=True);p.add_argument('--out',type=Path,required=True)
    p.add_argument('--reuse',type=Path,help='Previous private converted archive; reuse only source-identical maps')
    a=p.parse_args();out=a.out.resolve();require(not any((x/'.git').exists() for x in (out,*out.parents)) and not out.exists(),'private new output only')
    if a.reuse:
        with zipfile.ZipFile(a.reuse) as old:
            m=json.loads(old.read('index.json'))
            require(m['schema']=='wand.photo-mode.private-hair-inputs-converted@1' and m['privateOnly'] is True and m['publicationAuthorized'] is False and m['gameVersion']=='1.26.2','private reuse archive required')
            convert(a.geometry,a.resources,a.source,out,(m,old))
    else:
        convert(a.geometry,a.resources,a.source,out)
