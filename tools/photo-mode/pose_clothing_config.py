"""Decode private ClothingParameters, preserving native indices and unknown runtime semantics."""
import argparse,json
from pathlib import Path
from resolve_animation_bundle import Reader,serialized_objects,digest
from pose_curves import require

def decode(raw):
    r=Reader(raw);require(r.unpack('iq')==(0,0),'not a standalone config');enabled,=r.unpack('I');script=r.unpack('iq');name=r.string();require(name=='ClothingParameters' and enabled==1 and script[1]!=0,'wrong config')
    def boolean():
        v,=r.unpack('I');require(v in (0,1),'unexpected bool');return bool(v)
    def hidden():
        return [dict(zip(('name','bodyPart','section'),r.unpack('3i'))) for _ in range(r.count(12))]
    def option():
        return dict(expanded=boolean(),name=r.string(),hiddenParts=hidden(),unhiddenParts=hidden())
    def label():
        return dict(expanded=boolean(),name=r.string(),options=[option() for _ in range(r.count(16))])
    categories=[dict(expanded=boolean(),optionLabels=[label() for _ in range(r.count(12))],hiddenParts=hidden()) for _ in range(r.count(12))]
    print('categories',len(categories),'offset',r.pos,'total',len(raw))
    conditions=[]
    for _ in range(r.count(20)):
        flags=[boolean() for _ in range(3)];blend=r.string();wear=boolean();typ,=r.unpack('i');pairs=[r.unpack('ii') for _ in range(r.count(8))];conditions.append(dict(expanded=bool(flags[0]),male=bool(flags[1]),female=bool(flags[2]),blendShapeName=blend,whenWearing=wear,clothingType=typ,conditions=pairs))
    layers=[r.string() for _ in range(r.count(4))];require(r.pos==len(raw),'unparsed config tail');return dict(name=name,scriptRef=[script[0],str(script[1])],categories=categories,conditionalBlendShapes=conditions,optionalAnimLayers=layers,sourceSha256=digest(raw))

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--resources',type=Path,required=True);p.add_argument('--out',type=Path,required=True);a=p.parse_args();out=a.out.resolve();require(not any((x/'.git').exists() for x in (out,*out.parents)),'private output only');raw=a.resources.read_bytes();v,objects=serialized_objects(raw);require(v=='6000.0.62f1','unsupported version');hits=[]
    for pid,(cls,off,size) in objects.items():
        if cls!=114:continue
        r=Reader(raw[off:off+size]);r.take(28)
        if r.string()=='ClothingParameters':hits.append((pid,raw[off:off+size]))
    require(len(hits)==1,'missing/ambiguous ClothingParameters');pid,data=hits[0];result=decode(data);report=dict(schema='wand.photo-mode.private-clothing-config@1',privateOnly=True,publicationAuthorized=False,maskApplicationVerified=False,resourceSha256=digest(raw),pathId=str(pid),config=result);out.parent.mkdir(parents=True,exist_ok=True)
    with out.open('x') as f:json.dump(report,f,allow_nan=False,separators=(',',':'))
    print(len(result['categories']),sum(len(c['optionLabels']) for c in result['categories']),len(result['conditionalBlendShapes']),result['optionalAnimLayers'])
if __name__=='__main__':main()
