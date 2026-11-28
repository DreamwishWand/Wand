"""Rebuild the sanitized historical Switch ItemID census from original
itemlist directories, using the existing reviewed native frame decoder.
Do not publish source bytes, names, or saves. Version files are mandatory.
"""
import argparse
import base64
import hashlib
import json
import re
import zlib
from pathlib import Path
from build_complete_source_master import frames, scalar

def canonical(x):
    return json.dumps(x, sort_keys=True, separators=(',', ':')).encode()

def sha(b):
    return hashlib.sha256(b).hexdigest()

def scan(root, version, expected_categories):
    version_bytes = (root / 'FullVersion.txt').read_bytes()
    if not re.search(rb'-v' + re.escape(version.encode()) + rb'-', version_bytes):
        raise ValueError('Switch version mismatch')
    sources, counts, ids = {}, {}, set()
    paths = sorted(root.glob('*.json'))
    if len(paths) != expected_categories:
        raise ValueError('Switch source category census mismatch')
    for path in paths:
        if path.is_symlink() or not re.fullmatch(r'[A-Za-z][A-Za-z0-9]*', path.stem):
            raise ValueError('invalid source file')
        raw = path.read_bytes()
        sources[path.stem] = sha(raw)
        count = 0
        for _, _, wire in frames(raw):
            item_id, key = scalar(wire, 1, 0), scalar(wire, 2, 2)
            if type(item_id) is not int or not 0 < item_id < 2**53 or item_id in ids or not key:
                raise ValueError('invalid or duplicate source identity')
            key.decode('utf8')
            ids.add(item_id)
            count += 1
        counts[path.stem] = count
    ordered = sorted(ids)
    runs, last = [], 0
    for item_id in ordered:
        if runs and item_id == last + 1:
            runs[-1] += 1
        else:
            runs.extend([item_id-last, 1])
        last = item_id
    return dict(version=version,versionFileSha256=sha(version_bytes),sourceFiles=sources,
        sourceCorpusSha256=sha(canonical(sources)),categoryCounts=counts,definitionCount=len(ids),
        itemIdsSha256=sha(canonical(ordered)),idRuns=base64.b64encode(zlib.compress(canonical(runs),9)).decode())

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--switch-1241',type=Path,required=True)
    p.add_argument('--switch-12411',type=Path,required=True)
    p.add_argument('--out',type=Path,required=True)
    a = p.parse_args()
    doc = dict(schema='wand.db01.switch-source-census@1',platform='Switch',sourcePresenceOnly=True,
        snapshots=[scan(a.switch_1241,'1.24.1',38),scan(a.switch_12411,'1.24.11',39)])
    with a.out.open('xb') as f:
        f.write(canonical(doc)+b'\n')
    print(sha(a.out.read_bytes()))

if __name__ == '__main__':
    main()
