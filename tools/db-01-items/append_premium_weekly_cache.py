"""Append exact weekly shop observations to the existing private DB-01 catalog.
Cache observations are not Steam detail responses or proof of completed purchases.
Never pass this ledger into public storage.
"""
import argparse
import copy
import datetime
import json
import re
from pathlib import Path
from import_premium_bundles import PRIVATE_SCHEMA, BUNDLE, check, positive, sha, pinned, write_new

def append_cache(ledger, raw, captured_jst, platform, game_version):
    check(ledger.get('schema') == PRIVATE_SCHEMA and ledger.get('privateOnly') is True
          and ledger.get('publicationAuthorized') is False, 'CACHE_PRIVATE_LEDGER')
    when = datetime.datetime.fromisoformat(captured_jst)
    check(when.utcoffset() == datetime.timedelta(hours=9), 'CACHE_JST')
    check(platform in ('Steam', 'Switch') and (game_version is None or
          re.fullmatch(r'\d+\.\d+\.\d+', game_version)), 'CACHE_SOURCE_VERSION')
    meta = {'sourceSha256': sha(raw), 'capturedJst': when.isoformat(),
            'platform': platform, 'gameVersion': game_version}
    identity = sha(json.dumps(meta, sort_keys=True, separators=(',', ':')).encode())
    result = copy.deepcopy(ledger)
    history = result.setdefault('weeklyCache', {'captures': {}, 'byBundle': {}, 'byItem': {}})
    if identity in history['captures']:
        check(history['captures'][identity]['source'] == meta, 'CACHE_CAPTURE_COLLISION')
        return result
    rows = []
    snapshots = []
    for key, encoded in json.loads(raw)['Data'].items():
        snap = json.loads(encoded)
        check(snap['OnlineId'] == key and isinstance(snap['Language'], str) and snap['Language'], 'CACHE_SNAPSHOT')
        snapshots.append({'snapshotId': key, 'metadata': {k:v for k,v in snap.items() if k != 'Categories'}})
        for category in snap['Categories']:
            for kind, root in category['Data'].items():
                groups = [(None, root.get('Bundles', []))]
                groups += [(store, store['Data'].get('BundleContents', [])) for store in root.get('Stores', [])]
                for store, offers in groups:
                    for position, offer in enumerate(offers):
                        d = offer['Data']
                        bundle = offer['Id']
                        check(BUNDLE.fullmatch(bundle) and d['OnlineId'] == bundle and
                              d['Language'] == snap['Language'] and isinstance(d.get('Active'), bool), 'CACHE_OFFER_ID')
                        parts = d['Contents']
                        check(parts and all(positive(p['ItemId']) and positive(p['Quantity']) for p in parts), 'CACHE_COMPONENT')
                        idx = len(rows)
                        rows.append({'snapshotId': key, 'categoryKind': kind, 'categoryTitle': category.get('Title'),
                                     'store': {k:v for k,v in store.items() if k != 'Data'} if store else None,
                                     'storeMetadata': {k:v for k,v in store['Data'].items() if k != 'BundleContents'} if store else None,
                                     'position': position, 'nativeOffer': offer})
                        history['byBundle'].setdefault(bundle, []).append([identity, idx])
                        for i, part in enumerate(parts):
                            history['byItem'].setdefault(str(part['ItemId']), []).append([identity, idx, i, part['Quantity']])
    check(snapshots and rows, 'CACHE_EMPTY')
    history['captures'][identity] = {'source': meta, 'snapshots': snapshots, 'offers': rows,
                                     'purchaseVerified': False, 'currentAvailabilityVerified': False}
    return result

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--previous-private', type=Path, required=True)
    p.add_argument('--previous-private-sha256', required=True)
    p.add_argument('--cache', type=Path, required=True)
    p.add_argument('--cache-sha256', required=True)
    p.add_argument('--captured-jst', required=True)
    p.add_argument('--platform', choices=['Steam','Switch'], required=True)
    p.add_argument('--game-version')
    p.add_argument('--private-out', type=Path, required=True)
    a = p.parse_args()
    result = append_cache(json.loads(pinned(a.previous_private, a.previous_private_sha256)),
                          pinned(a.cache, a.cache_sha256), a.captured_jst, a.platform, a.game_version)
    history = result['weeklyCache']
    print(json.dumps({'privateSha256': write_new(a.private_out, result, True),
                      'captures': len(history['captures']), 'bundleIds': len(history['byBundle']),
                      'cacheOnlyIds': len(set(history['byBundle']) - set(result['bundles'])),
                      'itemIds': len(history['byItem'])}))
if __name__ == '__main__':
    main()
