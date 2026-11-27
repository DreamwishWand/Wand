"""Assemble approved Pages test assets from a verified transfer prefix.

The input consists exclusively of converted preview assets, not game bundles.
Transfer fragments are not copied into the deployed site.
"""
import argparse, hashlib, json, struct, zlib
from pathlib import Path

def sha(data):
    return hashlib.sha256(data).hexdigest()

def prepare(source,dest):
    m=json.loads((source/'index.json').read_bytes())
    assert m['schema']=='wand.photo-mode.pages-test@1' and m['publicationAuthorized'] is True and m['testOnly'] is True and m['fullPoseVerified'] is False
    pins=json.loads((source/'parts.json').read_bytes())
    chunks=[]
    for p in pins:
        data=(source/p['name']).read_bytes()
        assert len(data)==p['bytes'] and sha(data)==p['sha256'],'transfer integrity'
        chunks.append(data)
    raw=b''.join(chunks)
    assets={}
    for item,options in m['items'].items():
        for body,o in options.items():
            assert body in m['bodyIcons'] and o['kind']=='pair'
            entry=o['asset'];assets[entry['sha256']+'.glb']=(item,o)
    pos=0;found={}
    while pos+30<=len(raw) and raw[pos:pos+4]==b'PK\x03\x04':
        sig,version,flags,method,mtime,mdate,crc,compressed,size,nlen,xlen=struct.unpack_from('<4s5H3I2H',raw,pos)
        start=pos+30+nlen+xlen;end=start+compressed
        if end>len(raw):break
        assert not flags&9 and method in (0,8),'unsupported zip entry'
        name=raw[pos+30:pos+30+nlen].decode().rsplit('/',1)[-1]
        if name in assets:
            assert name not in found,'duplicate asset'
            item,o=assets[name];entry=o['asset'];assert size==entry['bytes'] and size<=64*1024*1024
            data=zlib.decompress(raw[start:end],-15) if method==8 else raw[start:end]
            assert len(data)==size and sha(data)==entry['sha256'] and zlib.crc32(data)==crc,'asset integrity'
            assert data[:4]==b'glTF' and struct.unpack_from('<I',data,8)[0]==len(data)
            n=struct.unpack_from('<I',data,12)[0];doc=json.loads(data[20:20+n]);a=doc['animations'][0]['extras']
            assert a['sourceSha256']==o['sourceSha256'] and a['companionItemId']==int(item) and doc['asset']['extras']['attachedPairDiagnostic'] is True,'scene identity'
            found[name]=data
        pos=end
    assert set(found)==set(assets),'missing complete scene'
    for entry in m['bodyIcons'].values():
        name=entry['sha256']+'.png';data=(source/name).read_bytes()
        assert len(data)==entry['bytes'] and sha(data)==entry['sha256'] and data[:8]==b'\x89PNG\r\n\x1a\n','icon integrity'
        found[name]=data
    dest.mkdir(parents=True,exist_ok=True)
    for name,data in found.items():
        (dest/name).write_bytes(data)
    (dest/'index.json').write_text(json.dumps(m,separators=(',',':')),encoding='utf-8')
    print('Pages test scenes',sum(len(v) for v in m['items'].values()),'assets',len(found),'bytes',sum(map(len,found.values())))

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--source',type=Path,help='Explicit legacy two-scene transfer fixture')
    p.add_argument('--archive',type=Path,help='Local copy of pinned diagnostic release')
    p.add_argument('--companion-delta',type=Path,help='Local copy of the pinned companion delta')
    p.add_argument('--actor-delta',type=Path,help='Local copy of the pinned companion actor delta')
    p.add_argument('--dest',type=Path,default=Path('static/photo-mode-preview'))
    a=p.parse_args()
    if a.source:
        if a.archive or a.companion_delta or a.actor_delta: p.error('--source cannot be combined with release archives')
        prepare(a.source,a.dest)
    else:
        from prepare_release_preview import download, project
        project(a.archive.read_bytes() if a.archive else download(), a.dest)
        from prepare_companion_delta import download_delta, apply_delta
        apply_delta(a.companion_delta.read_bytes() if a.companion_delta else download_delta(), a.dest)
        from prepare_actor_delta import download_actors, apply_actors
        apply_actors(a.actor_delta.read_bytes() if a.actor_delta else download_actors(), a.dest)
