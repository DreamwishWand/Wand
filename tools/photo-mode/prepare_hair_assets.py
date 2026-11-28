"""Publish the required pinned, derived hair test package.
No native shader bytes or Unity source archives. Missing or invalid archives fail closed.
"""
import io,json,urllib.request,zipfile,struct,zlib
from prepare_release_preview import digest,require
NAME="Dreamwish-Wand-avatar-hair-preview-20261128.zip"
URL="https://github.com/DreamwishWand/Wand/releases/download/photo-mode-assets-20261127/"+NAME
SIZE=93906691
SHA="bec811d5160ee4ce0ba6bc3f2bf0459f054dba708072b604315f26e8cf29d132"

def download_hair_assets():
    with urllib.request.urlopen(urllib.request.Request(URL,headers={"User-Agent":"Dreamwish-Wand-Pages"}),timeout=120) as f:return f.read(SIZE+1)

def apply_hair_assets(raw,dest):
    require(len(raw)==SIZE and digest(raw)==SHA,'hair archive identity')
    index=dest/'index.json';public=json.loads(index.read_bytes())
    require(public['schema']=='wand.photo-mode.pages-test@2' and public['publicationAuthorized'] is True and public['testOnly'] is True and public['gameVersion']=='1.26.2','hair base identity')
    assets={}
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        require(len(z.infolist())==121 and z.getinfo('hair-assets.json').file_size<=1024*1024,'hair archive member count')
        m=json.loads(z.read('hair-assets.json'))
        require(m['schema']=='wand.photo-mode.hair-assets@1' and m['gameVersion']=='1.26.2' and m['testOnly'] is True and m['colorEncoding']=='srgb-setcolor-input' and m['previewColorConversion']=='unity-linear' and all(m[k] is False for k in ('gpuColorConversionVerified','shaderParityVerified','secondaryMotionVerified')),'hair manifest contract')
        require(len(m['items'])==24 and sum(map(len,m['items'].values()))==48 and len(m['materials'])==24 and len(m['textures'])==72 and len(m['palette']['base'])==len(m['palette']['highlight'])==90,'hair coverage')
        def get(a,ext):
            name=a['sha256']+ext
            require(len(a['sha256'])==64 and all(c in '0123456789abcdef' for c in a['sha256']) and 0<a['bytes']<=64*1024*1024,'hair asset path')
            if name not in assets:
                require(z.getinfo(name).file_size==a['bytes'],'hair asset size')
                b=z.read(name);require(digest(b)==a['sha256'],'hair asset hash');assets[name]=b
            require(len(assets[name])==a['bytes'],'hair size conflict')
            return assets[name]
        for row in m['items'].values():
            require(set(row)=={'male','female'},'hair body coverage')
            for r in row.values():
                require(r['bindError']<1e-4,'hair bind tolerance')
                for p in r['parts']:
                    b=get(p['asset'],'.wha');n,ic,jc=p['vertices'],p['indices'],len(p['jointPaths'])
                    require(struct.unpack_from('<4sIII',b)==(b'WHA1',n,ic,jc) and len(b)==16+72*n+4*ic+64*jc and p['material'] in m['materials'],'hair geometry')
        for t in m['textures'].values():
            require(t['sampler']==[1,1,0,0,0,0] and t['colorSpace'] in (0,1) and 0<t['width']<=4096 and 0<t['height']<=4096,'hair sampler')
            require(t['mipByteLengths']==[4*max(1,t['width']>>i)*max(1,t['height']>>i) for i in range(t['mips'])],'hair mip layout')
            packed=get(t['asset'],'.wht');expected=sum(t['mipByteLengths']);d=zlib.decompressobj();pixels=d.decompress(packed,expected+1)
            require(d.eof and not d.unused_data and not d.unconsumed_tail and len(pixels)==expected and digest(pixels)==t['rgbaSha256'],'hair texture identity')
        require(len(assets)==120 and set(z.namelist())=={'hair-assets.json',*assets},'hair asset coverage')
    for name,data in assets.items():
        p=dest/name
        if p.exists():require(p.read_bytes()==data,'hair asset conflict')
        else:p.write_bytes(data)
    public['nativeHair']=m
    index.write_text(json.dumps(public,separators=(',',':')),encoding='utf-8')
    print('Native hair test: 24 items, 48 body variants, 72 maps')
