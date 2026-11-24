"""Export explicit ItemID-shaped source references, not inferred gameplay links.

The source database stays read-only. Both present and unresolved references
retain the declared type, source field path, and original numeric value.
"""
import argparse
import collections
import hashlib
import json
import re
import sqlite3
from pathlib import Path

TYPES={'int','uint','RepeatedField<int>','RepeatedField<uint>'}
REVIEWED_ARRAYS=('AdditionalRewardItemIDs','CharacterInteractionSceneRestrictionsItemID','EmployeeItemIDs')
ID_FIELD=re.compile(r'ItemIds?$',re.IGNORECASE)

def connect(path):
    return sqlite3.connect(Path(path).resolve().as_uri()+'?mode=ro',uri=True)

def manifest(db):
    m=json.loads(db.execute("SELECT value FROM metadata WHERE key='manifest'").fetchone()[0])
    if m['schema']!='wand.db01.native-fields.private@1' or m['platform']!='Steam':
        raise ValueError('source database identity')
    return m

def occurrences(db):
    ids={r[0] for r in db.execute('SELECT item_id FROM item')}
    for i,path,k,typ,value in db.execute("""
        SELECT item_id,path,field_key,declared_type,value_json FROM field
        WHERE status IN ('varint_wire_value','packed_varint_wire_values')
        ORDER BY item_id,path
    """):
        if typ not in TYPES or not ID_FIELD.search(k.split('.')[-1]):continue
        v=json.loads(value)
        for index,target in enumerate(v if isinstance(v,list) else [v]):
            if type(target) not in (int,str):raise ValueError('numeric source value')
            yield {'sourceItemId':i,'sourcePath':path,'arrayIndex':index if isinstance(v,list) else None,
                   'fieldKey':k,'declaredType':typ,'targetValue':target,
                   'targetExists':type(target) is int and target in ids}

def reviewed_arrays(db):
    m=manifest(db);out={}
    for k in REVIEWED_ARRAYS:
        rows=collections.defaultdict(list)
        for i,path,v in db.execute("""
            SELECT item_id,path,value_json FROM field
            WHERE field_key=? AND status='packed_varint_wire_values' ORDER BY item_id,path
        """,(k,)):
            if not re.fullmatch(re.escape(k)+r'\[\d+\]',path):raise ValueError('not a root array')
            values=json.loads(v)
            if not isinstance(values,list) or any(type(x) is not int or x<0 or x>2**31-1 for x in values):
                raise ValueError('invalid reviewed array')
            rows[i].extend(values)
        out[k]=list(rows.items())
    return {'schema':'wand.item-master.reference-attributes@1','gameVersion':m['gameVersion'],
            'sourceItemsSha256':m['sourceItemsSha256'],'sourceIl2cppDumpSha256':m['sourceIl2cppDumpSha256'],
            'fields':out}

def build(path,output,arrays):
    with connect(path) as db:
        m=manifest(db);counts=collections.Counter();sources=set();targets=set();digest=hashlib.sha256()
        with output.open('xb') as f:
            for row in occurrences(db):
                b=(json.dumps(row,separators=(',',':'))+'\n').encode()
                f.write(b);digest.update(b)
                counts['linked' if row['targetExists'] else 'unresolved']+=1
                if row['targetExists']:sources.add(row['sourceItemId']);targets.add(row['targetValue'])
        a=(json.dumps(reviewed_arrays(db),separators=(',',':'))+'\n').encode()
        with arrays.open('xb') as f:f.write(a)
        return {'gameVersion':m['gameVersion'],'sourceItemsSha256':m['sourceItemsSha256'],
                'sourceIl2cppDumpSha256':m['sourceIl2cppDumpSha256'],'counts':dict(counts),
                'sourceIds':len(sources),'targetIds':len(targets),'referenceSha256':digest.hexdigest(),
                'reviewedArraysSha256':hashlib.sha256(a).hexdigest(),'runtimeSemanticsVerified':False}

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--database',type=Path,required=True)
    p.add_argument('--output',type=Path,required=True)
    p.add_argument('--reviewed-arrays',type=Path,required=True)
    a=p.parse_args()
    print(json.dumps(build(a.database,a.output,a.reviewed_arrays),indent=2))
