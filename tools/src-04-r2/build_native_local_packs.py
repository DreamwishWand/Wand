#!/usr/bin/env python3
"""Build private per-map browser fixtures from original Texture2D pixels."""
import argparse
import copy
import hashlib
import io
import json
import math
import re
from pathlib import Path
from PIL import Image
from verify_native_map_egl import index_assets, decode


def check(ok, message):
    if not ok:
        raise ValueError(message)


def images(layers):
    for layer in layers:
        if layer['kind'] != 'fill':
            yield layer
        if layer.get('mask', {}).get('kind') == 'alpha':
            yield layer['mask']['image']


def digest(data):
    return hashlib.sha256(data).hexdigest()


def build(plan, registration, hires, lowres, out, selected):
    check(plan['privateOnly'] is True and plan['publicationAuthorized'] is False and
          registration['schema'] == 'wand.src04.native-map-registration-candidate@1' and
          registration['privateOnly'] is True and registration['publicationAuthorized'] is False and
          registration['worldPlacementVerified'] is False, 'Expected private source candidates')
    maps = {m['id']: m for m in plan['maps']}
    regs = {m['prefab']: m for m in registration['maps']}
    check(len(maps) == len(plan['maps']) == len(regs) == len(registration['maps']) == 10 and
          maps.keys() == regs.keys() and all(re.fullmatch(r'MapVillage[A-Za-z0-9]+', m) for m in maps), 'Unexpected map identities')
    check(len(plan['refs']) == len(dict(plan['refs'])) == len({v for _, v in plan['refs']}) == 118,
          'Unexpected source texture identities')
    check(not selected or len(set(selected)) == len(selected) and all(m in maps for m in selected), 'Unknown map selection')
    rows = index_assets(hires, lowres, plan['refs'])
    out.mkdir()
    reports = []
    for name in selected or sorted(maps):
        src, reg = maps[name], regs[name]
        check(reg['worldPlacementVerified'] is False, 'Unexpected registration state')
        matrix = reg['halfWorldTicksToCanvasCandidate']
        check(len(matrix) == 6 and all(math.isfinite(v) for v in matrix) and
              matrix[0] == matrix[3] > 0 and matrix[1] == matrix[2] == 0, 'Unsupported coordinate basis')
        width, height = src['width'], src['height']
        check(type(width) is type(height) is int and 0 < width <= 32768 and 0 < height <= 32768, 'Invalid extent')
        locked, unlocked = copy.deepcopy(src['lockedPlan']), copy.deepcopy(src['unlockedPlan'])
        bindings = {}
        for layer in images(locked + unlocked):
            key = layer['imageSha256']
            check(key in rows and layer['size'] == list(rows[key][4:6]), 'Texture source or size mismatch')
            bindings[key] = None
        folder = out / name
        folder.mkdir()
        total = 0
        for key in bindings:
            im = decode(rows[key])
            raw = im.tobytes()
            buf = io.BytesIO()
            im.save(buf, format='PNG', compress_level=1)
            data = buf.getvalue()
            with Image.open(io.BytesIO(data)) as decoded:
                check(decoded.size == im.size and decoded.convert('RGBA').tobytes() == raw, 'PNG pixel mismatch')
            sha = digest(data)
            with (folder / (sha + '.png')).open('xb') as f:
                f.write(data)
            bindings[key] = sha
            total += len(data)
        for layer in images(locked + unlocked):
            layer['imageSha256'] = bindings[layer['imageSha256']]
        doc = {'schema':'wand.media.native-local-preview@1','gameVersion':'1.26.2','privateOnly':True,
               'publicationAuthorized':False,'worldPlacementVerified':False,
               'maps':[{'id':name,'width':width,'height':height,'ticksToCanvas':matrix,'locked':locked,'unlocked':unlocked}]}
        manifest = json.dumps(doc, separators=(',', ':'), allow_nan=False).encode()
        (folder / 'manifest.json').write_bytes(manifest)
        record = {'id':name,'images':len(bindings),'imageBytes':total,'manifestSha256':digest(manifest),
                  'lockedDraws':len(locked),'unlockedDraws':len(unlocked)}
        reports.append(record)
        print(record, flush=True)
    if not selected:
        check(sum(r['images'] for r in reports) == 118 and sum(r['lockedDraws'] for r in reports) == 213 and
              sum(r['unlockedDraws'] for r in reports) == 119, 'Incomplete fixture coverage')
    (out / 'summary.json').write_text(json.dumps({'privateOnly':True,'publicationAuthorized':False,
        'worldPlacementVerified':False,'maps':reports},indent=2),encoding='utf-8')


def main():
    p = argparse.ArgumentParser(description=__doc__)
    for key in ('plan','registration','hires','lowres','out'):
        p.add_argument('--'+key,type=Path,required=True)
    p.add_argument('--map',action='append',default=[])
    a = p.parse_args()
    out = a.out.resolve()
    check(not out.exists() and not any((d/'.git').exists() for d in out.parents),'New private output outside Git required')
    build(json.loads(a.plan.read_bytes()),json.loads(a.registration.read_bytes()),a.hires,a.lowres,out,a.map)


if __name__ == '__main__':
    main()
