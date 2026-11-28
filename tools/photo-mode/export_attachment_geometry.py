"""Export common native skinned attachment geometry from a private hair census.

Reuses the original mesh and attachment readers. No textures, materials,
physics or visual parity inferred. Output is private and content-addressed.
"""
import argparse, json, struct, zipfile
from pathlib import Path
import numpy as np
from resolve_animation_bundle import digest, unityfs
from pose_mesh import body_source
from pose_skinned_attachment import extract_attachment
from pose_glb import REFLECT, trs
from pose_curves import require


def part_payload(mesh, faces):
    a=mesh['attrs']; n=len(a[0]); bind=mesh['bind']
    require(0<n<=65535 and a[0].shape==(n,3) and a[1].shape==(n,3) and a[2].shape==(n,4) and a[4].shape==(n,2),'unsupported attachment channels')
    j=np.zeros((n,4),dtype='<u2');w=np.zeros((n,4),dtype='<f4')
    require(np.all(a[13]<len(bind)) and len(bind)<=256,'joint range')
    j[:,:a[13].shape[1]]=a[13];w[:,:a[12].shape[1]]=a[12]/a[12].sum(axis=1,keepdims=True)
    require(np.all(faces<n) and 0<faces.size<=600000,'attachment index range')
    require(np.allclose(np.abs(a[2][:,3]),1,atol=1e-6,rtol=0),'invalid tangent handedness')
    def b(x,dtype):return np.ascontiguousarray(x,dtype=dtype).tobytes()
    return (struct.pack('<4sIII',b'WHA1',n,faces.size,len(bind))+b(a[0]*[-1,1,1],'<f4')+
        b(a[1]*[-1,1,1],'<f4')+b(a[4],'<f4')+b(a[2]*[-1,1,1,-1],'<f4')+
        b(j,'<u2')+b(w,'<f4')+b(faces[:,[0,2,1]].reshape(-1),'<u4')+
        b((REFLECT@bind@REFLECT).transpose(0,2,1),'<f4'))


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--inventory',type=Path,required=True)
    p.add_argument('--male-avatar',type=Path,required=True);p.add_argument('--female-avatar',type=Path,required=True)
    p.add_argument('--bundle',type=Path,action='append',required=True);p.add_argument('--out',type=Path,required=True)
    a=p.parse_args();out=a.out.resolve()
    require(not any((x/'.git').exists() for x in (out,*out.parents)) and not out.exists(),'private, new archive only')
    inv=json.loads(a.inventory.read_bytes())
    require(inv['schema']=='wand.photo-mode.private-hair-inputs@1' and inv['privateOnly'] is True and inv['publicationAuthorized'] is False,'private census required')
    bodies={}
    for sex in ('male','female'):
        version,files=unityfs(getattr(a,sex+'_avatar').read_bytes())
        require(version=='6000.0.62f1' and len(files)==1,'unsupported avatar source')
        _,bodies[sex],_,_=body_source(next(iter(files.values())),sex)
    bundles={p.name:p for p in a.bundle}
    require(len(bundles)==len(a.bundle),'ambiguous bundle names')
    hits={}
    for h in inv['prefabs']:
        if h['bundle'] in bundles:
            hits.setdefault(h['guid'],[]).append(h)
    rows={};errors=[];assets={}
    for row in inv['items']:
        for sex in ('male','female'):
            guid=row[sex]['guid'];found=hits.get(guid,[])
            if not found:
                errors.append(dict(itemId=row['itemId'],body=sex,reason='source bundle not supplied'));continue
            try:
                require(len(found)==1,'ambiguous prefab')
                h=found[0];raw=bundles[h['bundle']].read_bytes()
                require(digest(raw)==h['bundleSha256'],'source bundle identity')
                g=extract_attachment(raw,guid,bodies[sex]);nodes=g['nodes'];parts=[];pending={}
                for p in g['parts']:
                    m=p['mesh'];require(all(x==0 for x in p['weights']),'active blend shapes not yet applied')
                    for mat,faces in zip(p['materials'],m['indices'],strict=True):
                        payload=part_payload(m,faces);sha=digest(payload);pending[sha+'.wha']=payload
                        parts.append(dict(asset=dict(sha256=sha,bytes=len(payload)),vertices=len(m['attrs'][0]),indices=faces.size,jointPaths=[nodes[j]['path'] or 'body' for j in p['joints']],material={k:mat[k] for k in ('assetFile','pathId')},meshSha256=m['sha256']))
                extra=[dict(path=n['path'],parentPath=nodes[n['parent']]['path'] or 'body',**trs(n)) for n in nodes[len(bodies[sex]):]]
                require(parts,'empty geometry');assets.update(pending)
                rows.setdefault(str(row['itemId']),{})[sex]=dict(prefabGuid=guid,sourceBundleSha256=g['sourceBundleSha256'],extraNodes=extra,parts=parts,bindError=max(p['combinedBindError'] for p in g['parts']))
            except (ValueError,KeyError,IndexError,OverflowError,AssertionError) as e:
                errors.append(dict(itemId=row['itemId'],body=sex,reason=str(e)))
    require(rows,'no supported geometry')
    manifest=dict(schema='wand.photo-mode.private-attachment-geometry@1',gameVersion='1.26.2',privateOnly=True,publicationAuthorized=False,shaderParityVerified=False,secondaryMotionVerified=False,items=rows,unresolved=errors)
    with zipfile.ZipFile(out,'x',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
        for name,b in [('index.json',json.dumps(manifest,sort_keys=True,separators=(',',':'),allow_nan=False).encode()),*sorted(assets.items())]:
            zi=zipfile.ZipInfo(name,(2026,11,28,0,0,0));zi.compress_type=zipfile.ZIP_DEFLATED;zi.external_attr=0o600<<16;z.writestr(zi,b,compresslevel=9)
    print('items',len(rows),'body variants',sum(map(len,rows.values())),'mesh assets',len(assets),'unresolved',len(errors))

if __name__=='__main__':
    main()
