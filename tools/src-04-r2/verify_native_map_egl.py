#!/usr/bin/env python3
"""Private OpenGL ES software reference run of Wand GLSL; not Unity/WebGL verification."""
import argparse
import ctypes as C
import hashlib
import io
import json
import re
import struct
from pathlib import Path
from PIL import Image
from inspect_native_map_texture_refs import read_cab, texture_sampling
from inspect_native_map_layout import Reader, serialized
from extract_native_lock_textures import read_resource

P=C.c_void_p; I=C.c_int; U=C.c_uint; F=C.c_float; S=C.c_char_p

def setup(size):
    e=C.CDLL('libEGL.so.1')
    e.eglGetProcAddress.argtypes=[S];e.eglGetProcAddress.restype=P
    get=C.CFUNCTYPE(P,U,P,P)(e.eglGetProcAddress(b'eglGetPlatformDisplayEXT'))
    d=get(0x31DD,None,None)
    for name,ret,types in [
        ('eglInitialize',I,[P,P,P]),('eglBindAPI',I,[U]),
        ('eglChooseConfig',I,[P,C.POINTER(I),C.POINTER(P),I,C.POINTER(I)]),
        ('eglCreatePbufferSurface',P,[P,P,C.POINTER(I)]),
        ('eglCreateContext',P,[P,P,P,C.POINTER(I)]),('eglMakeCurrent',I,[P,P,P,P])]:
        f=getattr(e,name);f.restype=ret;f.argtypes=types
    assert e.eglInitialize(d,None,None) and e.eglBindAPI(0x30A0)
    config=P();n=I()
    a=(I*13)(0x3033,1,0x3040,0x40,0x3024,8,0x3023,8,0x3022,8,0x3021,8,0x3038)
    assert e.eglChooseConfig(d,a,C.byref(config),1,C.byref(n)) and n.value
    surface=e.eglCreatePbufferSurface(d,config,(I*5)(0x3057,size,0x3056,size,0x3038))
    ctx=e.eglCreateContext(d,config,None,(I*3)(0x3098,3,0x3038))
    assert e.eglMakeCurrent(d,surface,surface,ctx)
    class G:pass
    g=G();g.egl=(e,d,surface,ctx)
    for name,ret,args in [
        ('GetString',S,[U]),('GetError',U,[]),('CreateShader',U,[U]),
        ('ShaderSource',None,[U,I,C.POINTER(S),P]),('CompileShader',None,[U]),
        ('GetShaderiv',None,[U,U,C.POINTER(I)]),('GetShaderInfoLog',None,[U,I,P,P]),
        ('CreateProgram',U,[]),('AttachShader',None,[U,U]),('LinkProgram',None,[U]),
        ('GetProgramiv',None,[U,U,C.POINTER(I)]),('GetProgramInfoLog',None,[U,I,P,P]),
        ('UseProgram',None,[U]),('GenVertexArrays',None,[I,C.POINTER(U)]),
        ('BindVertexArray',None,[U]),('GetUniformLocation',I,[U,S]),
        ('Uniform1i',None,[I,I]),('Uniform2f',None,[I,F,F]),('Uniform4f',None,[I,F,F,F,F]),
        ('GenTextures',None,[I,C.POINTER(U)]),('ActiveTexture',None,[U]),
        ('BindTexture',None,[U,U]),('TexParameteri',None,[U,U,I]),
        ('TexImage2D',None,[U,I,I,I,I,I,U,U,P]),('DeleteTextures',None,[I,C.POINTER(U)]),
        ('Viewport',None,[I,I,I,I]),('ClearColor',None,[F,F,F,F]),('Clear',None,[U]),
        ('Enable',None,[U]),('Disable',None,[U]),('BlendEquation',None,[U]),
        ('BlendFunc',None,[U,U]),('DrawArrays',None,[U,I,I]),
        ('ReadPixels',None,[I,I,I,I,U,U,P]),('Finish',None,[])]:
        ptr=e.eglGetProcAddress(('gl'+name).encode());assert ptr,name
        setattr(g,name,C.CFUNCTYPE(ret,*args)(ptr))
    print(g.GetString(0x1F02),g.GetString(0x1F01),flush=True)
    return g

def program(g,ts):
    text=ts.read_text();shaders=[]
    for kind,name in [(0x8B31,'vertex'),(0x8B30,'fragment')]:
        src=re.search(r'const '+name+r'=\x60(.*?)\x60;',text,re.S)[1].encode()
        s=g.CreateShader(kind);a=S(src);g.ShaderSource(s,1,C.byref(a),None);g.CompileShader(s)
        ok=I();g.GetShaderiv(s,0x8B81,C.byref(ok));log=C.create_string_buffer(8192)
        g.GetShaderInfoLog(s,len(log),None,log);assert ok.value,log.value;shaders.append(s)
    p=g.CreateProgram()
    for s in shaders:g.AttachShader(p,s)
    g.LinkProgram(p);ok=I();g.GetProgramiv(p,0x8B82,C.byref(ok));log=C.create_string_buffer(8192)
    g.GetProgramInfoLog(p,len(log),None,log);assert ok.value,log.value
    g.UseProgram(p);vao=U();g.GenVertexArrays(1,C.byref(vao));g.BindVertexArray(vao.value)
    loc={n:g.GetUniformLocation(p,n.encode()) for n in ['a','b','c','origin','span','kind','tint','tex','maskTex','maskKind','maskA','maskB','maskC']}
    assert all(x>=0 for x in loc.values()),loc
    return loc

def index_assets(hires,lowres,refs):
    rows={};wanted=dict(refs)
    for p,expected in [
        (hires,'4b04c922d6d1eab53982f6756a4bee30b63734aa7dfbf8eff8d5e6c21c2a6734'),
        (lowres,'ef996d338d74f4396e53ca80b8e5a3d81b7a6d4ab9f9eaef3c865a14fe6af95f')]:
        cab,b,digest=read_cab(p);assert digest==expected
        objs,_,unity=serialized(b);assert unity=='6000.0.62f1'
        for pid,(cl,b) in objs.items():
            k=f'{cab.lower()}/{pid}'
            if cl!=28 or k not in wanted:continue
            r=Reader(b);name=r.aligned_string();o=r.pos;w,h=struct.unpack_from('<ii',b,o+4)
            meta=texture_sampling(b,o,w,h);offset,length=struct.unpack_from('<QI',b,o+92)
            r.pos=o+104;resource=r.aligned_string().split('/')[-1]
            assert resource==cab+'.resS' and length==meta['nativeBytes']
            rows[wanted[k]]=(p,resource,offset,length,w,h,meta['format'],name)
    assert len(rows)==len(wanted)==118
    return rows

def decode(row):
    p,res,offset,n,w,h,fmt,name=row;raw=read_resource(p,res,offset,n)
    if fmt==4:
        assert n==w*h*4;im=Image.frombytes('RGBA',(w,h),raw)
    elif fmt==63:
        assert n==w*h;im=Image.frombytes('L',(w,h),raw).convert('RGBA')
    elif fmt in (25,12):
        assert n==((w+3)//4)*((h+3)//4)*16
        header=b'DDS '+struct.pack('<7I',124,0x81007,h,w,n,0,1)+bytes(44)+struct.pack('<II4s5I',32,4,b'DX10',0,0,0,0,0)+struct.pack('<5I',0x1000,0,0,0,0)+struct.pack('<5I',98 if fmt==25 else 77,3,0,1,0)
        im=Image.open(io.BytesIO(header+raw)).convert('RGBA')
    else:raise ValueError(fmt)
    return im.transpose(Image.Transpose.FLIP_TOP_BOTTOM)

def render(g,u,layers,view,size,source):
    w,h=size;g.Viewport(0,0,w,h);g.Disable(0x0BD0);g.Disable(0x0B71);g.Disable(0x0B44)
    g.ClearColor(0,0,0,0);g.Clear(0x4000);g.Enable(0x0BE2);g.BlendEquation(0x8006)
    g.BlendFunc(0x0302,0x0303);g.Uniform2f(u['origin'],0,0);g.Uniform2f(u['span'],*view)
    g.Uniform1i(u['tex'],0);g.Uniform1i(u['maskTex'],1)
    for l in layers:
        a,b,c,d,x,y=l['unitQuadToCanvas'];g.Uniform2f(u['a'],a,b);g.Uniform2f(u['b'],c,d);g.Uniform2f(u['c'],x,y)
        g.Uniform4f(u['tint'],*l['rgba']);g.Uniform1i(u['kind'],{'fill':0,'texture':1,'sdf':2}[l['kind']])
        m=l.get('mask');g.Uniform1i(u['maskKind'],0 if not m else 2 if m['kind']=='alpha' else 1)
        if m:
            a,b,c,d,x,y=m['overlayToMaskUv'];g.Uniform2f(u['maskA'],a,b);g.Uniform2f(u['maskB'],c,d);g.Uniform2f(u['maskC'],x,y)
        ids=[]
        try:
            for unit,t in [(0,None if l['kind']=='fill' else l),(1,m['image'] if m and m['kind']=='alpha' else None)]:
                g.ActiveTexture(0x84C0+unit)
                if not t:g.BindTexture(0x0DE1,0);continue
                im=source(t['imageSha256']);assert list(im.size)==t['size'];raw=im.tobytes();tid=U()
                g.GenTextures(1,C.byref(tid));ids.append(tid);g.BindTexture(0x0DE1,tid.value)
                for k,v in [(0x2801,0x2601),(0x2800,0x2601),(0x2802,0x2901 if t['wrap'][0]==0 else 0x812F),(0x2803,0x2901 if t['wrap'][1]==0 else 0x812F)]:g.TexParameteri(0x0DE1,k,v)
                g.TexImage2D(0x0DE1,0,0x8058,im.width,im.height,0,0x1908,0x1401,C.c_char_p(raw));assert g.GetError()==0,'Upload'
            g.DrawArrays(5,0,4);assert g.GetError()==0,'Draw'
        finally:
            for tid in ids:g.DeleteTextures(1,C.byref(tid))
    g.Finish();raw=C.create_string_buffer(w*h*4);g.ReadPixels(0,0,w,h,0x1908,0x1401,raw)
    assert g.GetError()==0,'Readback'
    return Image.frombytes('RGBA',(w,h),raw.raw).transpose(Image.Transpose.FLIP_TOP_BOTTOM)

def smoke(g,u):
    q=[16,0,0,16,0,0];red={'kind':'fill','unitQuadToCanvas':q,'rgba':[1,0,0,1]}
    blue={'kind':'fill','unitQuadToCanvas':q,'rgba':[0,0,1,.5]}
    out=render(g,u,[red,blue],(16,16),(16,16),lambda _:None)
    assert all(abs(x-y)<=1 for x,y in zip(out.getpixel((8,8)),(128,0,128,191)))
    mask={'kind':'rect','overlayToMaskUv':[2,0,0,2,-.5,-.5]}
    out=render(g,u,[red,{**blue,'mask':mask}],(16,16),(16,16),lambda _:None)
    assert out.getpixel((1,1))==(255,0,0,255)
    assert all(abs(x-y)<=1 for x,y in zip(out.getpixel((8,8)),(128,0,128,191)))
    sdf={**red,'kind':'sdf','rgba':[0,1,0,1],'imageSha256':'r','size':[2,2],'wrap':[1,1]}
    maskimage={**red,'kind':'texture','imageSha256':'a','size':[2,2],'wrap':[1,1]}
    a=Image.new('RGBA',(2,2));a.putdata([(255,255,255,0),(255,255,255,255)]*2)
    r=Image.new('RGBA',(2,2));r.putdata([(0,0,0,255),(255,0,0,255)]*2)
    masked={**red,'rgba':[0,0,1,.5],'mask':{'kind':'alpha','overlayToMaskUv':[1,0,0,1,0,0],'image':maskimage}}
    cases=0;maxerr=0
    for w in [16,32,64]:
        for mode,l in [('sdf',sdf),('mask',masked)]:
            out=render(g,u,[red,l],(16,16),(w,16),lambda s:{'r':r,'a':a}[s])
            for x in range(int(w*.3),int(w*.7)):
                t=(x+.5)/w*2-.5
                if mode=='sdf':
                    d=t+.05;f=.75*2/w+.1;alpha=max(0,min(1,(d-.5+f)/(2*f)));alpha=alpha*alpha*(3-2*alpha);rgb=[1-alpha,alpha,0]
                else:alpha=t*.5;rgb=[1-alpha,0,alpha]
                expected=[round(255*z) for z in [*rgb,alpha*alpha+1-alpha]]
                actual=out.getpixel((x,8));err=max(abs(x-y) for x,y in zip(actual,expected))
                assert err<=3,(mode,w,x,actual,expected);maxerr=max(err,maxerr);cases+=1
    return {'pixelCases':cases,'max8BitChannelError':maxerr}

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--plan',type=Path,required=True);p.add_argument('--hires',type=Path,required=True)
    p.add_argument('--lowres',type=Path,required=True);p.add_argument('--out',type=Path,required=True)
    p.add_argument('--renderer',type=Path,default=Path(__file__).resolve().parents[2]/'src/lib/media/native-map-renderer.ts')
    a=p.parse_args();outdir=a.out.resolve()
    assert not outdir.exists() and not any((d/'.git').exists() for d in outdir.parents),'Use new private output outside Git'
    data=json.loads(a.plan.read_text());assert data['privateOnly'] is True and data['publicationAuthorized'] is False
    assert len(data['maps'])==10 and len({m['id'] for m in data['maps']})==10
    assert all(re.fullmatch(r'MapVillage[A-Za-z0-9]+',m['id']) for m in data['maps'])
    assert sum(len(m['lockedPlan']) for m in data['maps'])==213 and sum(len(m['unlockedPlan']) for m in data['maps'])==119
    g=setup(1024);u=program(g,a.renderer);pixels=smoke(g,u);print(pixels,flush=True)
    rows=index_assets(a.hires,a.lowres,data['refs']);outdir.mkdir();summ=[]
    # Encoded hashes from the previous ledger act as private lookup keys only.
    # Original Texture2D pixels are decoded directly, not fetched from the CDN.
    for m in data['maps']:
        cache={};loads=set()
        def get(sha):
            if sha not in cache:cache[sha]=decode(rows[sha]);loads.add(sha)
            return cache[sha]
        w,h=m['width'],m['height'];size=(max(1,round(1024*w/max(w,h))),max(1,round(1024*h/max(w,h))))
        record={'world':m['id'],'size':size,'states':{}}
        for state in ['locked','unlocked']:
            im=render(g,u,m[state+'Plan'],(w,h),size,get);assert im.getchannel('A').getbbox() is not None
            im.save(outdir/(m['id']+'-'+state+'.png'))
            record['states'][state]={'layers':len(m[state+'Plan']),'rgbaSha256':hashlib.sha256(im.tobytes()).hexdigest(),'nonzeroAlpha':sum(im.getchannel('A').histogram()[1:])}
        record['decodedOriginalTextures']=len(loads);summ.append(record);print(record,flush=True);cache.clear()
    assert sum(m['decodedOriginalTextures'] for m in summ)==118
    report={'privateOnly':True,'publicationAuthorized':False,'unityFrameVerified':False,'webglVerified':False,'cdnVerified':False,'rendererSha256':hashlib.sha256(a.renderer.read_bytes()).hexdigest(),'softwareRenderer':g.GetString(0x1F01).decode(),'synthetic':pixels,'maps':summ}
    (outdir/'report.json').write_text(json.dumps(report,indent=2))
    print('PASS original GLSL 20 frames',flush=True)

if __name__=='__main__':main()
