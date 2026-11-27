#!/usr/bin/env python3
"""Extract two original lock textures; private output only, no R2 access."""
import argparse, hashlib, io, json, struct
from pathlib import Path
from PIL import Image
import lz4.block
from inspect_native_map_layout import Reader, serialized, check
from inspect_native_map_texture_refs import read_cab, texture_sampling

TARGETS={
 'hires':('4b04c922d6d1eab53982f6756a4bee30b63734aa7dfbf8eff8d5e6c21c2a6734',-4655806685649545477,'bg_map_exp4_finalisland_locked',3596,3448),
 'lowres':('ef996d338d74f4396e53ca80b8e5a3d81b7a6d4ab9f9eaef3c865a14fe6af95f',-3140450847004667535,'bg_map_expansion2_part_library_02_placeholder',144,128),
}

def read_resource(path,resource,offset,length):
    r=Reader(path.read_bytes(),'>')
    check(r.string()=='UnityFS' and r.number('I')>=7,'Invalid bundle')
    r.string();r.string();check(r.number('Q')==len(r.data),'Bundle length mismatch')
    c,u,f=[r.number('I') for _ in range(3)];check(not f&128,'Unsupported block info');r.align(16)
    def decode(data,n,flags):
        check(0<n<=64*1024*1024,'Block limit')
        if flags&63==0:check(len(data)==n,'Block size');return data
        check(flags&63 in (2,3),'Unsupported compression');return lz4.block.decompress(data,uncompressed_size=n)
    i=Reader(decode(r.read(c),u,f),'>');i.read(16)
    blocks=[(i.number('I'),i.number('I'),i.number('H')) for _ in range(i.count())]
    nodes=[(i.number('Q'),i.number('Q'),i.number('I'),i.string()) for _ in range(i.count())]
    matches=[(start,n) for start,n,_,name in nodes if name==resource]
    check(len(matches)==1,'Resource not unique');start,n=matches[0]
    check(0<=offset and 0<length<=64*1024*1024 and offset+length<=n,'Invalid resource range')
    start+=offset;end=start+length;pos=0;data=bytearray()
    if f&512:r.align(16)
    for u,c,flags in blocks:
        lo=max(start,pos);hi=min(end,pos+u)
        if lo<hi:data.extend(decode(r.read(c),u,flags)[lo-pos:hi-pos])
        else:check(r.pos+c<=len(r.data),'Truncated block');r.pos+=c
        pos+=u
        if pos>=end:break
    check(len(data)==length,'Incomplete resource');return bytes(data)

def extract(path,target):
    digest,pid,name,w,h=TARGETS[target];cab,b,actual=read_cab(path)
    check(actual==digest,'Source hash changed');objects,_,unity=serialized(b);check(unity=='6000.0.62f1','Unity version mismatch')
    cl,b=objects[pid];r=Reader(b);check(cl==28 and r.aligned_string()==name,'Texture identity changed');o=r.pos
    sampling=texture_sampling(b,o,w,h);check(sampling['format']==25 and sampling['mipCount']==1 and sampling['nativeBytes']==w*h,'Expected full BC7 single mip')
    offset,length=struct.unpack_from('<QI',b,o+92);r.pos=o+104;resource=r.aligned_string().split('/')[-1]
    check(resource==cab+'.resS' and length==w*h,'Invalid stream reference')
    raw=read_resource(path,resource,offset,length)
    header=b'DDS '+struct.pack('<7I',124,0x81007,h,w,length,0,1)+bytes(44)+struct.pack('<II4s5I',32,4,b'DX10',0,0,0,0,0)+struct.pack('<5I',0x1000,0,0,0,0)+struct.pack('<5I',98,3,0,1,0)
    im=Image.open(io.BytesIO(header+raw)).convert('RGBA').transpose(Image.Transpose.FLIP_TOP_BOTTOM)
    check(im.size==(w,h),'Decoded dimension mismatch')
    return im,{'name':name,'cab':cab,'pathID':str(pid),'bundleSha256':digest,'width':w,'height':h,'compressedSha256':hashlib.sha256(raw).hexdigest(),'rgbaTopDownSha256':hashlib.sha256(im.tobytes()).hexdigest(),'sampling':sampling}

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--bundle',type=Path,required=True);p.add_argument('--target',choices=TARGETS,required=True);p.add_argument('--out',type=Path,required=True);p.add_argument('--webp',action='store_true');a=p.parse_args();out=a.out.resolve()
    check(not any((d/'.git').exists() for d in [out,*out.parents]),'Private output outside Git required');out.mkdir(parents=True,exist_ok=True)
    im,meta=extract(a.bundle,a.target);print(json.dumps(meta),flush=True)
    if a.webp:
        f=io.BytesIO();im.save(f,format='WEBP',lossless=True,quality=100,method=6,exact=True);raw=f.getvalue()
        with Image.open(io.BytesIO(raw)) as d:check(d.convert('RGBA').tobytes()==im.tobytes(),'WebP roundtrip mismatch')
        sha=hashlib.sha256(raw).hexdigest();dest=out/(sha+'.webp')
        if dest.exists():check(dest.read_bytes()==raw,'Existing bytes conflict')
        else:
            with dest.open('xb') as f:f.write(raw)
        meta.update(imageSha256=sha,bytes=len(raw),roundtripVerified=True)
    else:
        dest=out/(meta['rgbaTopDownSha256']+'.png')
        if not dest.exists():
            with dest.open('xb') as f:im.save(f,format='PNG',compress_level=1)
        with Image.open(dest) as d:check(d.convert('RGBA').tobytes()==im.tobytes(),'Private PNG mismatch')
    with (out/(a.target+'-receipt.json')).open('x') as f:json.dump({**meta,'privateOnly':True,'publicationAuthorized':False},f,indent=2)
    print(dest,flush=True)

if __name__=='__main__':main()
