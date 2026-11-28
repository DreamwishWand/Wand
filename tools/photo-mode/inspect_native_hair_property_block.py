"""Verify the original Steam 1.26.2 hair property-block mapping (private evidence).
Only hashes, field identities and selection rules are output; no executable bytes.
"""
import argparse, hashlib, json, struct
from pathlib import Path

def sha(data):
    return hashlib.sha256(data).hexdigest()

def require(x,m):
    if not x:
        raise ValueError(m)

GAME_SHA='a574a3c41b2911f6031070d05f933f562e4b3efdb881ac3c774384a0effee653'
LITERAL_SHA='95ea2f3134d29d73df8a5abd558c75378079b642103fd9ab00720eccdd31406e'
METHOD_SHA='80c8c73bf339f0be3d12ac27cc197f66318fc16c1c91286d69ce534a9621b62b'

def inspect(game,literals):
    require(sha(game)==GAME_SHA and sha(literals)==LITERAL_SHA,'original identity')
    method=game[0x1314590:0x1314590+0x321]
    require(sha(method)==METHOD_SHA,'GetPropertyBlock machine code identity')
    literal_by_addr={int(r['address'],16):r['value'] for r in json.loads(literals)}
    calls=[]
    for rva,expected,field in [(0x1315f20,'_BaseColor','baseColor'),(0x1315f75,'_ColorThree','firstColor'),(0x1315fcc,'_ColorTwo','secondColor'),(0x1316024,'_ColorOne','highlightColor')]:
        i=rva-0x1315d90
        require(method[i:i+3]==bytes.fromhex('488b0d'),'unexpected literal load')
        addr=rva+7+struct.unpack_from('<i',method,i+3)[0]
        require(literal_by_addr.get(addr)==expected,'literal identity')
        calls.append(dict(property=expected,field=field))
    require(method[0x1315ed4-0x1315d90:0x1315ee8-0x1315d90]==bytes.fromhex('33c085ff0f95c0660f6ec00f5bc0f30f1144242c'),'highlight alpha assignment')
    # Verify the actual IL2CPP internal call target, not a name-based guess.
    offset=0x187ebe9f0-0x187c5c000+0x7c59c00
    name=game[offset:offset+160].split(b'\0')[0]
    require(name==b'UnityEngine.MaterialPropertyBlock::SetColorImpl_Injected(System.IntPtr,System.Int32,UnityEngine.Color&)','SetColor target')
    return dict(schema='wand.photo-mode.private-hair-property-block@1',gameVersion='1.26.2',publicationAuthorized=False,sourceSha256=GAME_SHA,literalSha256=LITERAL_SHA,methodSha256=METHOD_SHA,methodRva='0x1315d90',assignments=calls,highlightAlpha={'zeroIndex':0,'otherIndex':1},gpuColorConversionVerified=False)

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--game',type=Path,required=True);p.add_argument('--literals',type=Path,required=True);p.add_argument('--out',type=Path,required=True)
    a=p.parse_args();out=a.out.resolve()
    require(not any((x/'.git').exists() for x in (out,*out.parents)),'private output only')
    report=inspect(a.game.read_bytes(),a.literals.read_bytes())
    with out.open('x',encoding='utf-8') as f:json.dump(report,f,indent=2)
    print('Native hair property block and highlight alpha verified')
