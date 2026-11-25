"""Export only reviewed positive blocker reward and BeeHouse numeric fields."""
from pathlib import Path
from hashlib import sha256
import argparse
import json
from build_full_native_fields import fields, frames, require

SOURCE = 'cde1b6e4dd37085e829c2e4548b89091bbf8d543cee92e6031b2f5bddc794196'
OUTPUT = '77f025abb2da6faa168b45ada59cf288aadf159e9753280cef02960e7d4ebac7'

def extract(data):
    require(sha256(data).hexdigest() == SOURCE, 'source hash')
    blockers, bees = [], []
    for _, frame in frames(data):
        rows = list(fields(frame))
        ids = [v for n,w,v,_ in rows if n == 1 and w == 0]
        require(len(ids) == 1, 'id')
        i = ids[0]
        subtype = (i % 10000000) // 100000
        for n,w,v,_ in rows:
            if (subtype,n,w) == (6,10,0) and v > 0:
                blockers.append([i,v])
            if (subtype,n,w) == (8,24,2):
                f = list(fields(v))
                require(len(f) == 6 and {a for a,_,_,_ in f} == {1,2,3,4,5,7}, 'BeeHouse fields')
                d = {a:c for a,_,c,_ in f}
                def seconds(raw):
                    r = list(fields(raw))
                    require(len(r) == 1 and r[0][:2] == (1,0), 'duration')
                    return r[0][2]
                bees.append([i,d[1],d[2],d[3],seconds(d[4]),seconds(d[5]),d[7]])
    require(len(blockers) == 63 and len(bees) == 1, 'census')
    output = (json.dumps({'blockerDefaultRewards':sorted(blockers),'beeHouse':sorted(bees)},separators=(',',':'))+'\n').encode()
    require(sha256(output).hexdigest() == OUTPUT, 'output hash')
    return output

if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('source',type=Path)
    p.add_argument('output',type=Path)
    a = p.parse_args()
    a.output.write_bytes(extract(a.source.read_bytes()))
