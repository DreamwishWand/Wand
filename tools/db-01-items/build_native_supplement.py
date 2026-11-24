"""Build the release-bound public projection from the private native field database.

Only explicitly reviewed numeric source facts may cross this boundary.
No raw bytes, unreviewed source strings or private data are exported.
"""
import argparse
import collections
import hashlib
import json
import sqlite3
from pathlib import Path


def build(database):
    with sqlite3.connect(Path(database).resolve().as_uri()+'?mode=ro', uri=True) as db:
        manifest=json.loads(db.execute("SELECT value FROM metadata WHERE key='manifest'").fetchone()[0])
        if manifest['schema']!='wand.db01.native-fields.private@1' or manifest['platform']!='Steam':
            raise ValueError('native database schema')
        stride=collections.defaultdict(list)
        seen=set()
        for item_id,value_json in db.execute("""
            SELECT item_id,value_json FROM field
            WHERE status='nullable_int_wrapper' AND field_key='GridAreaData.StrideOverride'
            ORDER BY item_id
        """):
            value=json.loads(value_json)
            if type(value) is not int or not -2**31<=value<2**31 or item_id in seen:
                raise ValueError('invalid stride value or duplicate ID')
            seen.add(item_id)
            stride[value].append(item_id)
        return {
            'schema':'wand.item-master.native-supplement@1',
            'gameVersion':manifest['gameVersion'],
            'sourceItemsSha256':manifest['sourceItemsSha256'],
            'sourceIl2cppDumpSha256':manifest['sourceIl2cppDumpSha256'],
            'strideOverride':dict(sorted(stride.items()))
        }


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--database',required=True,type=Path)
    p.add_argument('--output',required=True,type=Path)
    a=p.parse_args()
    data=(json.dumps(build(a.database),separators=(',',':'))+'\n').encode()
    a.output.write_bytes(data)
    print(hashlib.sha256(data).hexdigest())
