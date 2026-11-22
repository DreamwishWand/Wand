"""Audit whether a native Item-ID prefix uniquely identifies source classes.

Evidence is scoped to ALL source-verified IDs in ONE immutable private SQLite
release. It is not a predictor for unknown IDs or in-game UI categories.
"""
import argparse
import hashlib
import json
import sqlite3
from collections import Counter,defaultdict
from pathlib import Path

SCHEMA='wand.db01.native-id-range-audit@1'


def audit(path:Path, expected_sqlite_sha256:str, divisor:int=10_000_000)->dict:
    path=path.expanduser().resolve()
    actual=hashlib.sha256(path.read_bytes()).hexdigest()
    if actual!=expected_sqlite_sha256 or len(expected_sqlite_sha256)!=64:
        raise ValueError('DB01_RANGE_SQLITE_SHA_MISMATCH')
    if type(divisor) is not int or divisor<1 or divisor>10_000_000_000:
        raise ValueError('DB01_RANGE_DIVISOR')
    with sqlite3.connect('file:'+path.as_posix()+'?mode=ro&immutable=1',uri=True) as c:
        if c.execute('PRAGMA integrity_check').fetchone()[0]!='ok':
            raise ValueError('DB01_RANGE_SQLITE_CORRUPT')
        catalog=c.execute('SELECT platform,game_version,definition_count,items_sha256 FROM catalog WHERE id=1').fetchone()
        if catalog is None or catalog[0]!='Steam':
            raise ValueError('DB01_RANGE_PRIVATE_STEAM_REQUIRED')
        rows=c.execute('SELECT item_id,native_category FROM definition ORDER BY item_id').fetchall()
    if len(rows)!=catalog[2] or len({id for id,_ in rows})!=len(rows):
        raise ValueError('DB01_RANGE_DEFINITION_COUNT')
    buckets=defaultdict(lambda:defaultdict(list))
    categories=Counter()
    for id,category in rows:
        if type(id) is not int or id<=0 or id>=2**53:
            raise ValueError('DB01_RANGE_UNSAFE_ID')
        buckets[id//divisor][category].append(id)
        categories[category]+=1
    ambiguous={prefix:sorted(classes) for prefix,classes in buckets.items() if len(classes)>1}
    collisions=sum(sum(map(len,classes.values())) for prefix,classes in buckets.items() if len(classes)>1)
    prefix_map={}
    for prefix,classes in sorted(buckets.items()):
        if len(classes)==1:
            name,ids=next(iter(classes.items()))
            prefix_map[str(prefix)]={'nativeCategory':name,
                                    'count':len(ids),
                                    'firstObservedId':min(ids),
                                    'lastObservedId':max(ids)}
    return {
        'schema':SCHEMA,'status':'PASS' if not ambiguous else 'AMBIGUOUS',
        'platform':catalog[0],'gameVersion':catalog[1],
        'sourceSqliteSha256':actual,'sourceItemsSha256':catalog[3],
        'divisor':divisor,'definitionCount':len(rows),
        'nativeCategoryCount':len(categories),
        'verifiedPrefixCount':len(prefix_map),
        'ambiguousPrefixCount':len(ambiguous),
        'ambiguouslyClassifiedIds':collisions,
        'exactForObservedCurrentIds':not ambiguous,
        'safeForUnseenIds':False,
        'uiCategoriesVerifiedByPrefix':False,
        'byNativeCategory':dict(sorted(categories.items())),
        'verifiedNativeClassPrefixes':prefix_map,
        'ambiguousPrefixes':{str(k):v for k,v in sorted(ambiguous.items())},
    }


def main():
    parser=argparse.ArgumentParser(description='Exact observed native Item-ID prefix audit (no guesswork)')
    parser.add_argument('--sqlite',type=Path,required=True)
    parser.add_argument('--expected-sqlite-sha256',required=True)
    parser.add_argument('--divisor',type=int,default=10_000_000)
    parser.add_argument('--out',type=Path)
    args=parser.parse_args()
    result=audit(args.sqlite,args.expected_sqlite_sha256,args.divisor)
    if args.out:
        output=args.out.resolve()
        for parent in (output.parent,*output.parent.parents):
            if (parent/'.git').exists():
                parser.error('private report cannot be inside Git')
        if output.exists():
            parser.error('refuse overwrite of old version-scoped report')
        output.parent.mkdir(parents=True,exist_ok=True)
        output.write_text(json.dumps(result,sort_keys=True,ensure_ascii=False,indent=2)+'\n',
                          encoding='utf-8')
        output.chmod(0o600)
    print(json.dumps({k:v for k,v in result.items() if k not in
                      ('verifiedNativeClassPrefixes','byNativeCategory','ambiguousPrefixes')},
                     ensure_ascii=False,sort_keys=True))


if __name__=='__main__':
    main()
