"""Convert pinned native makeup masks to lossless RGBA mip chains for WebGL.
No Unity bundle, save, shader bytecode, or compressed source texture is published.
"""
import argparse, io, json, struct, zipfile, zlib
from pathlib import Path
from collections import Counter
from PIL import Image
from export_native_makeup import PINS, source, objects, extract_items, extract_palette
from resolve_animation_bundle import Reader, unityfs, container_entries, digest
from pose_material import read_streamed_texture
from pose_curves import require

# ColorSpace is UnityEngine.TextureColorSpace, not UnityEngine.ColorSpace.
def source_color_space(raw):
    r=Reader(raw);r.string();r.take(28)
    candidates=[]
    for pos in range(r.pos,len(raw)-16,4):
        t=Reader(raw);t.pos=pos
        try:
            t.take(12);path=t.string()
            if t.pos==len(raw) and path.startswith('archive:/CAB-') and path.endswith('.resS'):
                candidates.append(pos)
        except (ValueError,UnicodeError,struct.error):continue
    require(len(candidates)==1,'makeup texture stream location')
    pos=candidates[0];color,platform,inline=struct.unpack_from('<3i',raw,pos-12)
    require(color in (0,1) and platform==inline==0,'makeup texture color space layout')
    return color

def decode_mip(payload,width,height,fmt):
    fourcc={10:b'DXT1',12:b'DXT5',25:b'DX10',26:b'DX10'}[fmt]
    header=struct.pack('<7I11I',124,0x81007,height,width,len(payload),0,1,*([0]*11))
    header+=struct.pack('<II4s5I',32,4,fourcc,0,0,0,0,0)+struct.pack('<5I',0x1000,0,0,0,0)
    if fmt in (25,26):header+=struct.pack('<5I',98 if fmt==25 else 80,3,0,1,0)
    im=Image.open(io.BytesIO(b'DDS '+header+payload));im.load()
    require(im.size==(width,height),'decoded mip size')
    if fmt==26:
        require(im.mode=='L','BC4 native single channel')
        im=Image.merge('RGBA',(im,Image.new('L',im.size,0),Image.new('L',im.size,0),Image.new('L',im.size,255)))
    else:im=im.convert('RGBA')
    return im.tobytes() # Unity source row order; no vertical flip or sRGB transform.

def build(items,resources,bundle,out):
    rows=extract_items(items);palette_sha,palette=extract_palette(resources)
    targets={g for r in rows.values() for g in r['masks'].values()};require(len(targets)==128,'makeup reference coverage')
    version,files=unityfs(bundle,include_resources=True);cabs=[n for n in files if not n.endswith('.resS')]
    require(version=='6000.0.62f1' and len(cabs)==1,'makeup bundle layout')
    obs=objects(files[cabs[0]]);entries={}
    for cls,data in obs.values():
        if cls==142:
            for guid,ref in container_entries(data).items():
                require(guid not in entries,'duplicate texture address');entries[guid]=ref
    require(len(entries)==131 and targets<=entries.keys(),'makeup source coverage')
    textures,blobs,spaces={},{},Counter()
    for guid in sorted(targets):
        fid,pid=entries[guid];require(fid==0 and obs[pid][0]==28,'local texture reference')
        raw=obs[pid][1];info,payload,lengths=read_streamed_texture(raw,files);color=source_color_space(raw);spaces[color]+=1
        w,h,fmt=info['width'],info['height'],info['format'];rgba=[];offset=0
        for i,n in enumerate(lengths):
            rgba.append(decode_mip(payload[offset:offset+n],max(1,w>>i),max(1,h>>i),fmt));offset+=n
        require(offset==len(payload),'source mip chain')
        pixels=b''.join(rgba);compressed=zlib.compress(pixels,6);key=digest(compressed)
        if key in blobs:require(blobs[key]==compressed,'asset identity')
        blobs[key]=compressed
        textures[guid]={**{k:info[k] for k in ('width','height','format','mips','sourceSha256','payloadSha256')},
                        'colorSpace':color,'rgbaSha256':digest(pixels),'mipByteLengths':[len(v) for v in rgba],
                        'asset':{'sha256':key,'bytes':len(compressed)}}
    require(spaces=={0:124,1:4},'native color-space coverage')
    manifest={'schema':'wand.photo-mode.avatar-makeup@1','gameVersion':'1.26.2','sourcePins':PINS,
              'encoding':'deflate-rgba8-mip-chain','coordinateSpace':'UnityTextureRows','paletteEncoding':'Color32RGBA',
              'paletteSourceSha256':palette_sha,'palette':palette,'items':{str(k):v for k,v in sorted(rows.items())},
              'textures':textures,'shaderParityVerified':False}
    with zipfile.ZipFile(out,'x',compression=zipfile.ZIP_STORED) as z:
        z.writestr('avatar-makeup.json',json.dumps(manifest,separators=(',',':'),allow_nan=False))
        for key,data in sorted(blobs.items()):z.writestr(key+'.wmp',data)
    with zipfile.ZipFile(out) as z:
        require(z.testzip() is None and set(z.namelist())=={'avatar-makeup.json',*(k+'.wmp' for k in blobs)},'converted archive integrity')
        for row in textures.values():
            e=row['asset'];raw=z.read(e['sha256']+'.wmp');require(len(raw)==e['bytes'] and digest(raw)==e['sha256'],'asset digest')
            pixels=zlib.decompress(raw);require(len(pixels)==sum(row['mipByteLengths']) and digest(pixels)==row['rgbaSha256'],'converted pixel digest')
    print(json.dumps({'items':len(rows),'textures':len(textures),'uniqueAssets':len(blobs),'colorSpaces':spaces,'bytes':out.stat().st_size,'sha256':digest(out.read_bytes()),'maxAssetBytes':max(len(v) for v in blobs.values())}))

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    for k in ('items','resources','bundle','out'):p.add_argument('--'+k,type=Path,required=True)
    a=p.parse_args();out=a.out.resolve();require(not any((x/'.git').exists() for x in (out,*out.parents)),'output outside Git')
    build(source(a.items,'items'),source(a.resources,'resources'),source(a.bundle,'bundle'),out)
