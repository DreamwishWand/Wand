"""Reproduce the historical DLC-tagged catalog visibility gate projection.
Only reviewed native typed positive AND predicates are projected. A gate
is not a reward, store membership, entitlement, or runtime availability.
"""
import argparse
import base64
import json
import re
import zlib
from pathlib import Path
from build_complete_source_master import fields, frames, scalar
from build_historical_content_scope import sha, canonical, check, AFTER, DUMP

AFF='7c0e95f138735a550f2c08d9aab5a7244132005be56855512753bd7a788c6c37'
SCOPE='b673e86dee51967645004b64bb05562c717cce386956e888b934ca3cfc3e0346'
SCENE='0ffb7b40e7ee070ae49775cc054fb2e904705cc098e6ae10a426c9f2a9d72a50'
def pinned(path,pin):
    raw=path.read_bytes()
    check(sha(raw)==pin,'CATALOG_PIN')
    return json.loads(raw)

def contract(dump,cls,expected):
    matches=list(re.finditer(r'^public sealed class '+re.escape(cls)+r'\s*:',dump,re.M))
    check(len(matches)==1,'CATALOG_CLASS')
    body=dump[matches[0].end():dump.index('\n}',matches[0].end())]
    actual={k:int(n) for k,n in re.findall(r'public const int (\w+)FieldNumber = (\d+);',body)}
    check(all(actual.get(k)==v for k,v in expected.items()),'CATALOG_SCHEMA_'+cls)

def extract(itemlist,dump_path,affiliation,scopes,origin):
    src=pinned(affiliation,AFF)
    scope=pinned(scopes,SCOPE)
    origin_doc=json.loads(origin.read_bytes())
    count,digest,packed=origin_doc['groups']['scene.keepsake']
    scene_raw=zlib.decompress(base64.b64decode(packed))
    check(count==19 and digest==SCENE and sha(scene_raw)==SCENE,'CATALOG_SCENE')
    scene=set(json.loads(scene_raw))
    missions={r[0] for r in scope['scopeRows'] if r[1]=='Mission'}
    raw=zlib.decompress(base64.b64decode(src['data']))
    check(sha(raw)==src['dataSha256'] and src['sourceCorpusSha256']==AFTER,'CATALOG_TAGS')
    tags={i for i,t,sel,f,new in json.loads(raw) if t==2001200066 and new}
    dump=dump_path.read_bytes()
    check(sha(dump)==DUMP,'CATALOG_DUMP')
    dump=dump.decode('utf8')
    for cls,expected in {
        'FurnitureItemData':{'CatalogVisibilityConditions':20},
        'ClothingItemData':{'CatalogVisibilityConditions':22},
        'TrimmingItemData':{'CatalogVisibilityConditions':21},
        'CatalogVisibilityConditions':{'Conditions':4},
        'ConditionsList':{'Operator':1,'Conditions':2},
        'ConditionOneOf':{'MissionStatus':270,'CharacterUnlocked':65,'CharacterFriendship':50},
        'ConditionMissionStatus':{'Mission':1,'Operator':2,'State':3},
        'ConditionCharacterUnlocked':{'Character':1,'Inversed':2},
        'ConditionCharacterFriendship':{'Character':1,'Operator':2,'FriendshipLevel':3}
    }.items():contract(dump,cls,expected)
    rows=[]
    pins={}
    for cat,n in [('Furniture',20),('Clothing',22),('Trimming',21)]:
        data=(itemlist/(cat+'.json')).read_bytes()
        pins[cat]=sha(data)
        check(pins[cat]==src['sourceFiles'][cat],'CATALOG_SOURCE_'+cat)
        for _,_,f in frames(data):
            i=scalar(f,1,0)
            g=scalar(f,n,2)
            if i not in tags or not g:continue
            gf=fields(g);root=scalar(gf,4,2)
            if len(gf)!=1 or not root:continue
            tf=fields(root)
            if scalar(tf,1,0,0)!=0 or any((a,w) not in ((1,0),(2,2)) for a,w,v in tf):continue
            for j,l in enumerate(v for a,w,v in tf if (a,w)==(2,2)):
                leaf=fields(l)
                if len(leaf)!=1 or leaf[0][1]!=2:continue
                a,w,v=leaf[0];inner=fields(v)
                target=scalar(inner,1,0,0);op=scalar(inner,2,0,0);level=scalar(inner,3,0,0)
                if not all(t==0 for _,t,_ in inner):continue
                if a==270 and target in missions and op==0 and level==8 and all(k in (1,2,3) for k,_,_ in inner):kind='mission_completed'
                elif a==65 and target in scene and op==0 and all(k in (1,2) for k,_,_ in inner):kind='character_unlocked'
                elif a==50 and target in scene and op==5 and 1<=level<=10 and all(k in (1,2,3) for k,_,_ in inner):kind='character_friendship_at_least'
                else:continue
                rows.append([i,cat,n,j,kind,target,level if a==50 else None,sha(g)])
    rows.sort()
    check(len(rows)==41 and len({r[0] for r in rows})==41,'CATALOG_COUNT')
    return {'schema':'wand.db01.historical-expansion-catalog-gates@1','platform':'Steam','sourceGameVersion':'1.26.1',
        'compatibleGameVersion':'1.26.2','sourceCorpusSha256':AFTER,'sourceIl2cppDumpSha256':DUMP,
        'nativeExpansionProjectionSha256':AFF,'scopeProjectionSha256':SCOPE,'characterSceneGroupSha256':SCENE,
        'sourceFiles':pins,'catalogVisibilityOnly':True,'runtimeAvailabilityVerified':False,'grantVerified':False,'rows':rows}
def main():
    p=argparse.ArgumentParser(description=__doc__)
    for name in ('itemlist','dump','affiliation','scopes','origin','out'):p.add_argument('--'+name,type=Path,required=True)
    a=p.parse_args()
    raw=canonical(extract(a.itemlist,a.dump,a.affiliation,a.scopes,a.origin))+b'\n'
    with a.out.open('xb') as f:f.write(raw)
    print(sha(raw))
if __name__=='__main__':main()
