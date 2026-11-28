"""Verify pinned generic PBR and clothing sampled-input instruction ranges.
Outputs only provenance hashes, no game bytecode or textures.
"""
import argparse,hashlib,json,struct
from pathlib import Path
import lz4.block
from resolve_animation_bundle import unityfs,serialized_objects
from pose_curves import require

def sha(b):return hashlib.sha256(b).hexdigest()
BUNDLE='c097e7a03a0532bdd7dfbed5d93a24c42508a09e3d3113f51f6bbe5647926e1a'
CAB='CAB-d79bfb1b074ecaf0c1e3e4fd94de319e'
ROWS=[
 dict(name='PBR/PBR',pid=-8600332103802174571,objectSha='9982b8e01c8a7a1a4759d3108bb688375758b568b76d770dd06f6443273add31',base=56068,offset=24295,compressed=21622,uncompressed=520820,packSha='a985560e2d612ed53119ea587970a10bd687e8d752476122ee9edb8612842e96',dxbc=217342,programSha='83fb896bae187cd9d05fe2b1e9ddad23dbdc4f02e94b26dad1607245d9df5cbd',first=23,last=80,surfaceSha='e0c6622faaa2cd93e460edc7c7ac23bdfee7954c12631b4c965a0279525f304c'),
 dict(name='PBR/PBR Clothing',pid=-1719385050964474045,objectSha='5da474f64881fcf246d9ec9a69e624a7bcf6221b64f94adf06d921bd188de864',base=14016,offset=0,compressed=12444,uncompressed=176616,packSha='f50e4b0d9e6f3e7e1a16cf21fd6d32920a07584d80bc9311c17d76c23bb6fd65',dxbc=42618,programSha='e376d452ae718f6a3131052544233aca2b97e1d5734b237b88cee9e50c9a087e',first=24,last=77,surfaceSha='7b9bd39ed2d24cc0fa87b2a96597a1f3c61fe4f8278e79b6548c0d1f1acc9095')
]
def inspect(raw):
    require(sha(raw)==BUNDLE,'original shader bundle identity')
    v,files=unityfs(raw);require(v=='6000.0.62f1' and CAB in files,'shader CAB')
    data=files[CAB];v,obs=serialized_objects(data);require(v=='6000.0.62f1','serialized revision')
    for r in ROWS:
        c,o,n=obs[r['pid']];b=data[o:o+n]
        require(c==48 and sha(b)==r['objectSha'] and r['name'].encode() in b,'shader object identity')
        i=r['base']+r['offset'];pack=lz4.block.decompress(b[i:i+r['compressed']],uncompressed_size=r['uncompressed'])
        require(sha(pack)==r['packSha'],'compiled pack identity')
        i=r['dxbc'];require(pack[i:i+4]==b'DXBC','program magic')
        _,n,k=struct.unpack_from('<III',pack,i+20)
        require(0<k<=32 and 32+4*k<=n<=len(pack)-i,'program bounds')
        hits=[]
        for off in struct.unpack_from('<'+'I'*k,pack,i+32):
            require(32+4*k<=off<=n-8,'chunk offset')
            size,=struct.unpack_from('<I',pack,i+off+4)
            require(off+8+size<=n,'chunk bounds')
            if pack[i+off:i+off+4] in (b'SHDR',b'SHEX'):hits.append(pack[i+off+8:i+off+8+size])
        require(len(hits)==1 and sha(hits[0])==r['programSha'],'program identity')
        t=hits[0];require(len(t)%4==0,'instruction alignment');w=struct.unpack('<'+'I'*(len(t)//4),t)
        require(w[0]>>16==0 and w[1]==len(w),'pixel program')
        j=2;starts=[]
        while j<len(w):
            starts.append(j);n=w[j+1] if w[j]&2047==53 else (w[j]>>24)&127
            require(0<n<=len(w)-j,'instruction bounds');j+=n
        require(sha(t[4*starts[r['first']]:4*starts[r['last']+1]])==r['surfaceSha'],'surface stage identity')
    return dict(schema='wand.photo-mode.private-accessory-surface@1',gameVersion='1.26.2',publicationAuthorized=False,sourceSha256=BUNDLE,rows=ROWS,shaderParityVerified=False)
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--bundle',type=Path,required=True);p.add_argument('--out',type=Path,required=True);a=p.parse_args()
    out=a.out.resolve();require(not any((x/'.git').exists() for x in (out,*out.parents)),'private output only')
    with out.open('x',encoding='utf-8') as f:json.dump(inspect(a.bundle.read_bytes()),f,indent=2)
