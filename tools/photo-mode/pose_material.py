"""Private Unity 6 material and streamed texture extraction; no shader parity claim."""
import argparse, json, struct, io, re
from pathlib import Path
from math import isfinite
from PIL import Image
from resolve_animation_bundle import Reader, unityfs, serialized_objects, digest
from pose_curves import require


def externals(data):
    h=Reader(data,'>');h.take(20);meta,size,offset,_=h.unpack('IQQQ');require(size==len(data),'serialized size')
    r=Reader(data[h.pos:h.pos+meta]);require(r.cstring()=='6000.0.62f1','unsupported version');r.take(4);require(r.take(1)==b'\0','type tree unsupported')
    for _ in range(r.count(23)):
        cls,_,_=r.unpack('iBh');r.take(32 if cls==114 else 16)
    for _ in range(r.count(24)):r.align();r.take(24)
    for _ in range(r.count(12)):r.take(4);r.align();r.take(8)
    paths=[]
    for _ in range(r.count(22)):
        r.cstring();guid=r.take(16);typ,=r.unpack('i');path=r.cstring();paths.append(path)
    require(r.take(len(r.data)-r.pos)==b'\0'*5,'unsupported external table tail')
    return paths


def decode_material(raw):
    r=Reader(raw);name=r.string();shader=r.unpack('iq');valid=[r.string() for _ in range(r.count(4))];invalid=[r.string() for _ in range(r.count(4))];flags,=r.unpack('I');instancing=list(r.take(4));queue,=r.unpack('i');tags=[(r.string(),r.string()) for _ in range(r.count(8))];passes=[r.string() for _ in range(r.count(4))]
    def props(min_size,read):
        out={}
        for _ in range(r.count(min_size)):
            k=r.string();require(k not in out,'duplicate material property');out[k]=read()
        return out
    def tex():
        f,p=r.unpack('iq');v=r.unpack('4f');require(all(map(isfinite,v)),'invalid UV transform');return {'fileId':f,'pathId':str(p),'scale':v[:2],'offset':v[2:]}
    textures=props(32,tex);ints=props(8,lambda:r.unpack('i')[0]);floats=props(8,lambda:r.unpack('f')[0]);colors=props(20,lambda:r.unpack('4f'));require(all(map(isfinite,floats.values())) and all(isfinite(x) for v in colors.values() for x in v),'nonfinite material')
    require(r.take(len(raw)-r.pos)==bytes(4),'unsupported texture stack')
    return dict(name=name,shader=[shader[0],str(shader[1])],validKeywords=valid,invalidKeywords=invalid,flags=flags,instancing=instancing,queue=queue,tags=tags,disabledPasses=passes,textures=textures,ints=ints,floats=floats,colors=colors,sourceSha256=digest(raw))


def read_streamed_texture(raw,resources):
    r=Reader(raw);name=r.string();fallback,width,height,complete,stripped,fmt,mips=r.unpack('7I')
    require(0<width<=8192 and 0<height<=8192 and stripped==0 and 0<mips<=16 and fmt in (10,12,25,26),'unsupported texture format')
    # Unity 6 named mipmap-limit group changes the header size. Require a unique
    # exact streamed-resource tail and verify the entire mip chain byte count.
    tail=[]
    for pos in range(r.pos,len(raw)-16,4):
        t=Reader(raw);t.pos=pos
        try:
            off,size=t.unpack('QI');path=t.string()
            if t.pos==len(raw) and re.fullmatch(r'archive:/CAB-[0-9a-f]+/CAB-[0-9a-f]+\.resS',path) and size==complete and pos>=4 and raw[pos-4:pos]==bytes(4):tail.append((off,size,path))
        except (ValueError,UnicodeError,struct.error):continue
    require(len(tail)==1,'missing/ambiguous streamed texture tail');off,size,path=tail[0];key=path.rsplit('/',1)[-1];require(key in resources,'resource file missing');resource=resources[key];require(off+size<=len(resource),'resource bounds')
    block=8 if fmt in (10,26) else 16
    lengths=[max(1,((max(1,width>>i)+3)//4))*max(1,((max(1,height>>i)+3)//4))*block for i in range(mips)]
    require(sum(lengths)==size,'mip chain size mismatch');payload=resource[off:off+size]
    return dict(name=name,width=width,height=height,format=fmt,mips=mips,sourceSha256=digest(raw),payloadSha256=digest(payload),resource=path,offset=off,size=size),payload,lengths


def decode_texture(raw,resources):
    info,payload,lengths=read_streamed_texture(raw,resources)
    width,height,fmt=info['width'],info['height'],info['format']
    require(fmt in (10,12,25),'unsupported PNG conversion format')
    # DDS wrapper for Pillow's native BC decoder. No channel swizzle or normal-map reconstruction.
    fourcc={10:b'DXT1',12:b'DXT5',25:b'DX10'}[fmt]
    header=struct.pack('<7I11I',124,0x81007,height,width,lengths[0],0,1,*([0]*11))+struct.pack('<II4s5I',32,4,fourcc,0,0,0,0,0)+struct.pack('<5I',0x1000,0,0,0,0)
    if fmt==25:header+=struct.pack('<5I',98,3,0,1,0)
    im=Image.open(io.BytesIO(b'DDS '+header+payload[:lengths[0]])).convert('RGBA');require(im.size==(width,height),'decoded dimensions mismatch')
    # Unity UV origin is lower-left; normalize the image for conventional top-left raster origin.
    im=im.transpose(Image.Transpose.FLIP_TOP_BOTTOM);buf=io.BytesIO();im.save(buf,format='PNG');png=buf.getvalue()
    return {**{k:info[k] for k in ('name','width','height','format','mips','sourceSha256','payloadSha256')},'pngSha256':digest(png),**{k:info[k] for k in ('resource','offset','size')}},png


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--bundle',type=Path,action='append',required=True);p.add_argument('--out',type=Path,required=True);a=p.parse_args();out=a.out.resolve();require(not any((x/'.git').exists() for x in (out,*out.parents)),'private output only');out.mkdir(parents=True,exist_ok=False)
    index={};bundles=[]
    for path in a.bundle:
        raw=path.read_bytes();version,files=unityfs(raw,include_resources=True);require(version=='6000.0.62f1','unsupported version')
        for name,data in files.items():
            if name.endswith('.resS'):continue
            v,objects=serialized_objects(data);require(v==version and name not in index,'duplicate asset file');ext=externals(data);rec=dict(bundle=path.name,sha256=digest(raw),externalFiles=ext,materials={},textures={});index[name]=rec
            for pid,(cls,off,size) in objects.items():
                if cls==21:rec['materials'][str(pid)]=decode_material(data[off:off+size])
                elif cls==28:
                    info,png=decode_texture(data[off:off+size],files);dest=out/(info['pngSha256']+'.png');
                    if not dest.exists():dest.write_bytes(png)
                    rec['textures'][str(pid)]=info
    for name,rec in index.items():
        for mat in rec['materials'].values():
            for slot in mat['textures'].values():
                f,pid=slot['fileId'],slot['pathId'];require(0<=f<=len(rec['externalFiles']),'invalid texture file ID')
                target=name if f==0 else rec['externalFiles'][f-1].rsplit('/',1)[-1];slot['assetFile']=target
                if pid=='0':slot['status']='null'
                elif target in index and pid in index[target]['textures']:slot['status']='resolved';slot['pngSha256']=index[target]['textures'][pid]['pngSha256']
                else:slot['status']='unresolved'
    report={'schema':'wand.photo-mode.private-materials@1','privateOnly':True,'publicationAuthorized':False,'shaderParityVerified':False,'assetFiles':index}
    (out/'index.json').write_text(json.dumps(report,allow_nan=False,separators=(',',':')));print('materials',sum(len(r['materials']) for r in index.values()),'textures',sum(len(r['textures']) for r in index.values()),'unique PNGs',len(list(out.glob('*.png'))))
if __name__=='__main__':main()
