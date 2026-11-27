#!/usr/bin/env python3
"""Encode original native-map textures, resume verified work, and rebind the private CDN audit."""
import argparse
import copy
import io
import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from PIL import Image
from audit_native_map_cdn import prepare, keys, pixels, verify_bytes, digest, check, SHA, LIMIT


def write_json(path, doc):
    temp = path.with_suffix('.tmp')
    with temp.open('w', encoding='utf-8') as f:
        json.dump(doc, f, separators=(',', ':'), allow_nan=False)
    temp.replace(path)


def private_path(path):
    path = path.resolve()
    check(not any((p/'.git').exists() for p in [path, *path.parents]),
          'Private work directory outside Git required')
    return path


def png_bindings(plan, folders):
    bindings = {}
    for m in plan['maps']:
        paths = [p/m['id']/'manifest.json' for p in folders if (p/m['id']/'manifest.json').is_file()]
        check(len(paths) == 1, 'Missing or ambiguous original pack')
        path = paths[0]
        local = json.loads(path.read_bytes())['maps'][0]
        for state in ('locked', 'unlocked'):
            for old, png in zip(keys(m[state+'Plan']), keys(local[state])):
                check(SHA.fullmatch(old) and SHA.fullmatch(png), 'Invalid image identity')
                target = path.parent/(png+'.png')
                prior = bindings.setdefault(old, target)
                check(prior.name == target.name, 'Conflicting source PNG')
    return bindings


def reuse_index(roots, witnesses):
    """Explicit local directories only; no R2 scans or network access."""
    by_size = {}
    for source, meta in witnesses.items():
        by_size.setdefault((meta['width'], meta['height']), []).append((source, meta))
    found = {}
    for root in roots:
        root = private_path(root)
        check(root.is_dir(), 'Missing reuse directory')
        for p in sorted(set(root.glob('*.webp')) | set((root/'images').glob('*.webp'))):
            if not p.is_file() or not 20 <= p.stat().st_size <= LIMIT:
                continue
            raw = p.read_bytes()
            sha = digest(raw)
            try:
                with Image.open(io.BytesIO(raw)) as im:
                    if im.format != 'WEBP' or getattr(im, 'is_animated', False):
                        continue
                    candidates = by_size.get(im.size, [])
                    hashes = {}
                    for source, meta in candidates:
                        if meta['kind'] not in hashes:
                            hashes[meta['kind']] = pixels(im, meta['kind'])
                        if hashes[meta['kind']] == meta['pixelSha256']:
                            found.setdefault(source, (p, sha))
            except OSError:
                continue
    return found


def encode_one(source, png, meta, root, reusable=None):
    check(SHA.fullmatch(source), 'Invalid source identity')
    receipt = root/'receipts'/(source+'.json')
    if receipt.is_file():
        row = json.loads(receipt.read_bytes())
        check(row['sourceSha256'] == source and row['witness'] == meta and SHA.fullmatch(row['sha256']),
              'Resume receipt changed')
        raw = (root/'images'/(row['sha256']+'.webp')).read_bytes()
        check(verify_bytes(row['sha256'], meta, raw) == row['bytes'], 'Resume byte count mismatch')
        return row
    if reusable:
        p, expected = reusable
        raw = p.read_bytes()
        verify_bytes(expected, meta, raw)
        reused = True
    else:
        original = png.read_bytes()
        check(digest(original)+'.png' == png.name, 'Source PNG hash changed')
        with Image.open(io.BytesIO(original)) as im:
            check(im.format == 'PNG' and not getattr(im,'is_animated',False)
                  and im.size == (meta['width'],meta['height'])
                  and pixels(im, meta['kind']) == meta['pixelSha256'], 'Source pixels changed')
            rgba = im.convert('RGBA')
        buf = io.BytesIO()
        rgba.save(buf, format='WEBP', lossless=True, quality=100, method=6, exact=True)
        raw = buf.getvalue()
        with Image.open(io.BytesIO(raw)) as im:
            check(im.convert('RGBA').tobytes() == rgba.tobytes(), 'Lossless RGBA roundtrip mismatch')
        reused = False
    sha = digest(raw)
    n = verify_bytes(sha, meta, raw)
    target = root/'images'/(sha+'.webp')
    # Independent source identities can resolve to the same encoded object. Never overwrite it.
    try:
        with target.open('xb') as f:
            f.write(raw)
    except FileExistsError:
        check(target.read_bytes() == raw, 'Existing encoded file differs')
    row = {'sourceSha256':source,'sha256':sha,'bytes':n,'witness':meta,'reusedLocal':reused}
    write_json(receipt, row)
    return row


def rebind(audit, rows):
    images = {}
    lookup = {}
    for source, meta in audit['images'].items():
        row = rows[source]
        check(row['sourceSha256'] == source and row['witness'] == meta, 'Receipt source mismatch')
        sha = row['sha256']
        check(SHA.fullmatch(sha), 'Invalid encoded hash')
        check(sha not in images or images[sha] == meta, 'Conflicting encoded pixel witness')
        images[sha] = meta
        lookup[source] = sha
    doc = copy.deepcopy(audit)
    def layer(l):
        if l['kind'] != 'fill':
            l['imageSha256'] = lookup[l['imageSha256']]
        if l.get('mask',{}).get('kind') == 'alpha':
            layer(l['mask']['image'])
    for m in doc['maps']:
        for l in m['locked']+m['unlocked']:
            layer(l)
    doc['images'] = images
    doc['sourceIdentityCount'] = len(lookup)
    check(set(images) == {s for m in doc['maps'] for s in keys(m['locked']+m['unlocked'])},
          'Rebound coverage mismatch')
    return doc


def run(plan, folders, out, roots, workers):
    check(1 <= workers <= 4, 'Worker limit is 1-4')
    out = private_path(out)
    folders = [private_path(p) for p in folders]
    check(all(not out.is_relative_to(p) and not p.is_relative_to(out) for p in folders),
          'Output overlaps original packs')
    audit = prepare(plan, folders)
    bindings = png_bindings(plan, folders)
    check(set(bindings) == set(audit['images']), 'Source binding coverage mismatch')
    out.mkdir(parents=True, exist_ok=True)
    (out/'images').mkdir(exist_ok=True)
    (out/'receipts').mkdir(exist_ok=True)
    # Reuse earlier local conversion outputs if their decoded source pixels match.
    reuse = reuse_index(roots, audit['images'])
    rows = {}
    # Stage one complete source at a time by default to bound peak RGBA memory.
    with ThreadPoolExecutor(max_workers=workers) as pool:
        def task(source):
            return source, encode_one(source, bindings[source], audit['images'][source], out, reuse.get(source))
        for source, row in pool.map(task, sorted(bindings)):
            rows[source] = row
            print(f"Verified {len(rows)}/{len(bindings)}: {row['sha256']} ({row['bytes']} bytes)", flush=True)
    rebound = rebind(audit, rows)
    unique = {row['sha256']:row['bytes'] for row in rows.values()}
    summary = {'schema':'wand.src04.native-map-lossless-plan@1','gameVersion':'1.26.2',
        'privateOnly':True,'publicationAuthorized':False,'worldPlacementVerified':False,
        'cdnVerified':False,'sourceIdentityCount':len(rows),'uniqueImages':len(unique),
        'localReused':sum(r['reusedLocal'] for r in rows.values()),'totalBytes':sum(unique.values()),
        'generatedCompositeImages':0,'r2Requests':0,'images':rows}
    write_json(out/'native-cdn-audit-input.json', rebound)
    write_json(out/'native-map-lossless-plan.json', summary)
    return summary


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--plan',type=Path,required=True)
    p.add_argument('--packs',type=Path,nargs='+',required=True)
    p.add_argument('--out',type=Path,required=True)
    p.add_argument('--reuse-dir',type=Path,action='append',default=[])
    p.add_argument('--workers',type=int,default=1)
    a = p.parse_args()
    summary = run(json.loads(a.plan.read_bytes()),a.packs,a.out,a.reuse_dir,a.workers)
    print(summary['uniqueImages'],'unique original WebPs;',summary['totalBytes'],'bytes; no network writes')


if __name__ == '__main__':
    main()
