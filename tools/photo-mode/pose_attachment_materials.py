"""Resolve exact native attachment material dependencies, with private BC mip assets.

Only referenced shader and texture identities are exported. Original compressed
channels and UV transforms remain intact; no guessed swizzle, color space,
shader fallback or claim of visual parity.
"""
from pathlib import Path
import json
from resolve_animation_bundle import Reader, digest, serialized_objects, unityfs
from pose_material import externals, decode_material, read_streamed_texture
from pose_curves import require


def export_graph(paths, refs, output):
    output = Path(output).resolve()
    require(not any((p/'.git').exists() for p in (output,*output.parents)), 'private output only')
    require(not output.exists(), 'material output already exists')
    index = {}
    for path in sorted(set(paths)):
        raw = path.read_bytes()
        revision, files = unityfs(raw, include_resources=True)
        require(revision=='6000.0.62f1','unsupported source revision')
        for cab, data in files.items():
            if cab.endswith('.resS'):
                continue
            v, objects = serialized_objects(data)
            require(v==revision, 'serialized version mismatch')
            if cab in index:
                require(digest(data)==digest(index[cab]['data']), 'conflicting source CAB')
                continue
            index[cab] = dict(data=data,objects=objects,externals=externals(data),resources=files,bundleSha256=digest(raw),bundle=path.name)
    materials, textures, shaders, payloads = {}, {}, {}, {}
    def key(cab,pid):
        return cab+':'+str(pid)
    def reference(cab,f,pid):
        f,pid=int(f),str(pid)
        require(0<=f<=len(index[cab]['externals']), 'invalid external file ID')
        return (cab if f==0 else index[cab]['externals'][f-1].rsplit('/',1)[-1],pid)
    def resolve_object(cab,pid,cls):
        if str(pid)=='0':
            return 'null',None
        source=index.get(cab)
        if source is None:
            return 'missing_bundle',None
        entry=source['objects'].get(int(pid))
        if entry is None:
            return 'missing_object',None
        c,o,n=entry
        require(c==cls, 'referenced object class mismatch')
        return 'resolved',source['data'][o:o+n]
    for cab,pid in sorted(refs):
        status, raw = resolve_object(cab,pid,21)
        k=key(cab,pid)
        materials[k]=dict(assetFile=cab,pathId=str(pid),status=status)
        if status!='resolved':
            continue
        mat=decode_material(raw)
        materials[k]['native']=mat
        sc,sp=reference(cab,*mat['shader'])
        sk=key(sc,sp)
        materials[k]['shaderRef']=sk
        if sk not in shaders:
            st,sr=resolve_object(sc,sp,48)
            shaders[sk]=dict(assetFile=sc,pathId=sp,status=st)
            if sr is not None:
                shaders[sk]['objectSha256']=digest(sr)
                shaders[sk]['sourceBundleSha256']=index[sc]['bundleSha256']
        for slot,tex in mat['textures'].items():
            tc,tp=reference(cab,tex['fileId'],tex['pathId'])
            tk=key(tc,tp)
            tex['textureRef']=tk
            if tk in textures:
                continue
            st,tr=resolve_object(tc,tp,28)
            textures[tk]=dict(assetFile=tc,pathId=tp,status=st)
            if tr is None:
                continue
            try:
                info,payload,mips=read_streamed_texture(tr,index[tc]['resources'])
            except (ValueError,KeyError,IndexError) as error:
                textures[tk].update(status='unsupported_texture_layout',reason=str(error))
                continue
            sha=info['payloadSha256']
            require(digest(payload)==sha and sum(mips)==len(payload), 'texture payload mismatch')
            if sha in payloads:
                require(payloads[sha]==payload, 'texture hash collision')
            payloads[sha]=payload
            textures[tk].update(info=info,mipBytes=mips,asset=sha+'.bc',sourceBundleSha256=index[tc]['bundleSha256'])
    report=dict(schema='wand.photo-mode.private-attachment-materials@1',privateOnly=True,publicationAuthorized=False,shaderParityVerified=False,materials=materials,textures=textures,shaders=shaders,uniqueTexturePayloadCount=len(payloads),texturePayloadBytes=sum(map(len,payloads.values())))
    output.mkdir(parents=True,exist_ok=False)
    for sha,payload in sorted(payloads.items()):
        with (output/(sha+'.bc')).open('xb') as f:
            f.write(payload)
    with (output/'index.json').open('x',encoding='utf-8') as f:
        json.dump(report,f,allow_nan=False,separators=(',',':'))
    return dict(materials=len(materials),textures=len(textures),shaders=len(shaders),missingShaders=sum(r['status']!='resolved' for r in shaders.values()),uniqueTexturePayloadCount=len(payloads),texturePayloadBytes=report['texturePayloadBytes'])
