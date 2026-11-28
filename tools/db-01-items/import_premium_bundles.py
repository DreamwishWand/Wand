#!/usr/bin/env python3
"""Merge private Premium Shop sources; emit only allowlisted canonical DB-01 facts."""
import argparse
import base64
import hashlib
import json
import os
import re
from pathlib import Path

STEAM_SHA = '7bd846445b74519e9fe66c71b64938ddc3a1dc85ea2afbba87b3a360e85c2e68'
REPORT_SHA = 'ceb67c36d52c74288945bae06b5c6712d402ebad5005037e9af2173aa7b0fb1d'
LEGACY_SHA = '36c2f64d849a5c7e2350b874e9e9443795c0675381a185d801649b587b093b60'
PUBLIC_SCHEMA = 'wand.item-master.premium-bundle-source@1'
PRIVATE_SCHEMA = 'wand.item-master.premium-bundle-private-source@1'
INTERNAL = re.compile(r'^(?:Placeholder\d+$|Bundle_Backup)', re.I)
GUID = re.compile(r'^guid:[a-f0-9]{32}$', re.I)
BUNDLE = re.compile(r'^[A-Za-z0-9_-]{1,128}$')


def check(ok, code):
    if not ok:
        raise ValueError('DB01_PREMIUM_' + code)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def pinned(path, digest):
    data = Path(path).read_bytes()
    check(sha(data) == digest, 'SOURCE_SHA')
    return data


def positive(x):
    return type(x) is int and 0 < x < 2**53


def fields(raw):
    """Retain typed occurrences; never interpret an unknown field by name."""
    def uint(p):
        n = 0
        for i in range(10):
            check(p < len(raw), 'WIRE_TRUNCATED')
            b = raw[p]
            p += 1
            check(i < 9 or b <= 1, 'WIRE_OVERFLOW')
            n |= (b & 127) << (7*i)
            if b < 128:
                check(i == 0 or b != 0, 'WIRE_NONCANONICAL')
                return n, p
        raise ValueError('DB01_PREMIUM_WIRE_VARINT')
    p, result = 0, []
    while p < len(raw):
        tag, p = uint(p)
        no, wire = tag >> 3, tag & 7
        check(0 < no <= 536870911 and wire in (0, 1, 2, 5), 'WIRE_TAG')
        if wire == 0:
            v, p = uint(p)
        else:
            if wire == 2:
                size, p = uint(p)
            else:
                size = 8 if wire == 1 else 4
            check(p + size <= len(raw), 'WIRE_LENGTH')
            v = raw[p:p+size]
            p += size
        result.append((no, wire, v))
    return result


def all_of(fs, no, wire):
    check(all(w == wire for f, w, _ in fs if f == no), 'WIRE_TYPE')
    return [v for f, w, v in fs if f == no]


def one(fs, no, wire, required=False):
    values = all_of(fs, no, wire)
    check(len(values) <= 1 and (values or not required), 'WIRE_SCALAR')
    return values[0] if values else None


def txt(fs, no):
    v = one(fs, no, 2)
    return v.decode('utf-8') if v is not None else None


def image(v):
    check(v is None or isinstance(v, str) and GUID.fullmatch(v), 'IMAGE_GUID')
    return v


def legacy_source(data):
    result = {}
    for no, wire, entry in fields(data):
        check((no, wire) == (1, 2), 'LEGACY_CONTAINER')
        fs = fields(entry)
        name = one(fs, 1, 2, True).decode('utf-8')
        env = fields(one(fs, 2, 2, True))
        if txt(env, 5) != 'Definitions.OnlineBundleData':
            continue
        check(BUNDLE.fullmatch(name) and name not in result, 'LEGACY_ID')
        body = one(env, 6, 2, True)
        ff = fields(body)
        parts = []
        for v in all_of(ff, 9, 2):
            c = fields(v)
            item, qty = one(c, 1, 0, True), one(c, 2, 0, True)
            check(positive(item) and positive(qty), 'LEGACY_COMPONENT')
            # 23/24 and component 4 independently matched current original GUIDs.
            parts.append({'itemId': item, 'quantity': qty, 'image': image(txt(c, 4))})
        check(parts, 'LEGACY_EMPTY')
        result[name] = {'revisionSha256': sha(body), 'titleKey': txt(ff, 4) or None,
                        'descriptionKey': txt(ff, 6) or None, 'minGameVersion': txt(ff, 2),
                        'components': parts, 'artwork': {'background': image(txt(ff, 23)),
                                                        'image': image(txt(ff, 24))},
                        'nativeWireBase64': base64.b64encode(body).decode('ascii')}
    check(len(result) == 610 and sum(len(r['components']) for r in result.values()) == 1501,
          'LEGACY_CENSUS')
    return result


def steam_source(source_bytes, report_bytes):
    source, report = json.loads(source_bytes), json.loads(report_bytes)
    check(source.get('schema') == 'dreamwish.wand.premium-bundle-source@1' and
          report.get('schema') == 'dreamwish.lab.premium-report@2' and
          source['source']['reportSha256'] == sha(report_bytes) and
          source['source']['gameBuild'] == report['gameBuild'] and
          source['source']['kind'] == 'game_native_steam_bundle_capture' and
          report['platform'] == 'steam' and source['globalCompletenessVerified'] is False,
          'STEAM_SOURCE')
    match = re.search(r'v(\d+\.\d+\.\d+)', report['gameBuild'])
    check(match is not None, 'STEAM_VERSION')
    revisions = source['revisions']
    report_revs = {r['revisionSha256']: r for r in report['bundleRevisions']}
    check(len(report_revs) == len(report['bundleRevisions']) and revisions == report_revs,
          'STEAM_REPORT_REVISIONS')
    report_obs = {o['sha256']: o for o in report['observations']}
    check(len(report_obs) == len(report['observations']) == len(source['observations']) ==
          len({o['sourceCaptureSha256'] for o in source['observations']}), 'STEAM_REPORT_OBSERVATION_CENSUS')
    for o in source['observations']:
        r = report_obs.get(o['sourceCaptureSha256'])
        check(r is not None and all(o.get(k) == r.get(k) for k in
              ('capturedUnixSeconds','capturedUtc','coreRecovered','itemId','kind','protobufSha256','result','status')) and
              sorted(o['requestedBundleIds']) == sorted(r['bundleIds']) and
              sorted(o['revisionSha256s']) == sorted(r['revisions']), 'STEAM_REPORT_OBSERVATIONS')
    selected = {}
    captures = []
    for o in source['observations']:
        if o['kind'] != 'detail' or o['status'] != 'found':
            continue
        requested = set(o['requestedBundleIds'])
        rows = [revisions[h] for h in o['revisionSha256s']]
        ids = {r['bundleId'] for r in rows}
        check(ids == requested and len(rows) == len(ids) and len(requested) == len(o['requestedBundleIds']),
              'STEAM_DETAIL_CENSUS')
        captures.append({'capturedUnixSeconds': o['capturedUnixSeconds'],
                         'detailCaptureSha256': o['sourceCaptureSha256'],
                         'bundleCount': len(rows)})
        for r in rows:
            name, native = r['bundleId'], r['nativeOffer']
            d = native['Data']
            check(BUNDLE.fullmatch(name) and name == native['Id'] and r['onlineId'] == d['OnlineId'] and
                  [(x['itemId'], x['quantity']) for x in r['components']] ==
                  [(x['ItemId'], x['Quantity']) for x in d['Contents']] and
                  all(positive(x['ItemId']) and positive(x['Quantity']) for x in d['Contents']),
                  'STEAM_COMPONENT')
            old = selected.get(name)
            obs = {'revisionSha256': r['revisionSha256'], 'capturedUnixSeconds': o['capturedUnixSeconds'],
                   'detailCaptureSha256': o['sourceCaptureSha256'], 'gameVersion': match.group(1)}
            if old and old['capturedUnixSeconds'] == obs['capturedUnixSeconds']:
                check(old == obs, 'STEAM_SAME_TIME_CONFLICT')
            if old is None or old['capturedUnixSeconds'] < obs['capturedUnixSeconds']:
                selected[name] = obs
    check(captures and selected, 'STEAM_DETAIL_REQUIRED')
    meta = {'platform': 'Steam', 'gameVersion': match.group(1),
            'sourceSha256': sha(source_bytes), 'reportSha256': sha(report_bytes),
            'detailCaptureSha256': max(captures, key=lambda c:c['capturedUnixSeconds'])['detailCaptureSha256'],
            'capturedUnixSeconds': max(c['capturedUnixSeconds'] for c in captures),
            'queriedTargetItemCount': source['source']['candidateSources']['counts']['premiumSync'],
            'globalCompletenessVerified': False}
    return meta, selected, revisions, source['observations']


def merge(source_bytes, report_bytes, legacy_bytes, previous=None):
    meta, observations, revisions, source_observations = steam_source(source_bytes, report_bytes)
    legacy = legacy_source(legacy_bytes)
    legacy_meta = {'platform': 'Switch', 'gameVersion': '1.24.1', 'sourceSha256': sha(legacy_bytes),
                   'schemaFullyVerified': False,
                   'reviewedImageFields': {'background': 23, 'image': 24, 'componentImage': 4}}
    if previous:
        check(previous.get('schema') == PRIVATE_SCHEMA and previous['legacySource'] == legacy_meta and
              previous['legacyDefinitions'] == legacy, 'PREVIOUS_SOURCE')
        check(meta['capturedUnixSeconds'] >= previous['latestSteamSource']['capturedUnixSeconds'], 'STALE_CAPTURE')
        prev_rev = previous['steamRevisions']
        for h, v in revisions.items():
            check(h not in prev_rev or prev_rev[h] == v, 'REVISION_COLLISION')
        revisions = {**prev_rev, **revisions}
        prior = previous['serverDefinitions']
        for k, obs in observations.items():
            old = prior.get(k)
            check(not old or obs['capturedUnixSeconds'] > old['capturedUnixSeconds'] or old == obs,
                  'STALE_BUNDLE_CAPTURE')
        # A partial later observation does not erase prior positive evidence.
        observations = {**prior, **observations}
        source_history = previous['steamSources']
        observation_history = dict(previous.get('steamObservationsBySource', {}))
    else:
        source_history = []
        observation_history = {}
    # All validated observations are retained privately, including negative/partial
    # probes. Never infer removal from a later capture that omitted an ID.
    source_hash = meta['sourceSha256']
    check(source_hash not in observation_history or
          observation_history[source_hash] == source_observations, 'OBSERVATION_COLLISION')
    observation_history[source_hash] = source_observations
    if not any(x['sourceSha256'] == meta['sourceSha256'] for x in source_history):
        source_history = [*source_history, meta]
    source_hashes = {x['sourceSha256'] for x in source_history}
    check(set(observation_history) <= source_hashes, 'OBSERVATION_SOURCE_UNKNOWN')
    # Old private ledgers may predate this field. Explicitly expose the gap;
    # rebuild from the pinned original captures rather than fabricate observations.
    missing_observation_sources = sorted(source_hashes - set(observation_history))
    ids = sorted(set(observations) | set(legacy))
    by_item = {}
    by_bundle = {}
    for k in ids:
        s = observations.get(k)
        old = legacy.get(k)
        by_bundle[k] = {'serverObservation': s, 'legacyRevisionSha256': old['revisionSha256'] if old else None,
                        'serverConfirmed': s is not None, 'legacyOnly': s is None,
                        'saleHistoryVerified': False, 'currentAvailabilityVerified': False,
                        'listingEligibility': 'unverified',
                        'internalNameCandidate': bool(INTERNAL.search(k))}
        for kind, parts in (('current', revisions[s['revisionSha256']]['components'] if s else []),
                            ('legacy', old['components'] if old else [])):
            for i, p in enumerate(parts):
                by_item.setdefault(str(p['itemId']), []).append([k, kind, i, p['quantity']])
    historical_items = {}
    for h, r in sorted(revisions.items()):
        for i, part in enumerate(r['components']):
            historical_items.setdefault(str(part['itemId']), []).append([r['bundleId'], h, i, part['quantity']])
    counts = {'steam': len(observations), 'switch': len(legacy),
              'shared': len(set(observations) & set(legacy)),
              'steamOnly': len(set(observations) - set(legacy)),
              'legacyOnly': len(set(legacy) - set(observations)), 'total': len(ids), 'distinctItems': len(by_item)}
    if not previous and meta['sourceSha256'] == STEAM_SHA:
        check(tuple(counts.values()) == (683,610,588,95,22,705,1624), 'INITIAL_CENSUS')
    return {'schema': PRIVATE_SCHEMA, 'privateOnly': True, 'publicationAuthorized': False,
            'latestSteamSource': meta, 'steamSources': source_history, 'legacySource': legacy_meta,
            'counts': counts, 'bundles': by_bundle, 'items': by_item,
            'serverDefinitions': observations, 'steamRevisions': revisions, 'legacyDefinitions': legacy,
            'historicalSteamItems': historical_items,
            'steamObservationsBySource': observation_history,
            'missingSteamObservationSourceSha256s': missing_observation_sources,
            **({'weeklyCache': previous['weeklyCache']} if previous and 'weeklyCache' in previous else {})}


def opt(obj, keys):
    return {k: obj[k] for k in keys if k in obj}


def adjustment(obj):
    return opt(obj or {}, ('FillMode', 'MarginTop', 'MarginBottom'))


def current_projection(r):
    d = r['nativeOffer']['Data']
    return {'onlineId': r['onlineId'], 'revisionSha256': r['revisionSha256'], 'title': d.get('Title'),
            'description': d.get('Description'), 'language': d.get('Language'),
            'minGameVersion': d.get('MinGameVersion'),
            'components': [{'itemId': c['ItemId'], 'quantity': c['Quantity'], 'image': image(c.get('Image')),
                            'description': c.get('Description'), 'imageAdjustment': adjustment(c.get('ImageAdjustment'))}
                           for c in d['Contents']],
            'artwork': {'image': image(d.get('Image')), 'background': image(d.get('Background')),
                        'layout': d.get('Layout'), 'lightLayout': d.get('LightLayout'),
                        'adjustImage': d.get('AdjustImage'), 'imageAdjustment': adjustment(d.get('ImageAdjustment')),
                        'megaImages': {k: image(v) for k,v in opt(d.get('MegaBundleAdjustment',{}),
                                        ('OverridedImage1','OverridedImage2','OverridedImage3','OverridedImage4')).items()},
                        **opt(d, ('AccentColor','OverrideAccentColor','OverridePinColor','UnPinColor'))}}


def public_projection(private):
    definitions, withheld = [], 0
    withheld_current = withheld_legacy = withheld_shared = 0
    for k, v in private['bundles'].items():
        # Internal-name candidates are not proof of discontinuation; do not publish them automatically.
        if v['internalNameCandidate']:
            withheld += 1
            withheld_current += int(v['serverConfirmed'])
            withheld_legacy += int(v['legacyRevisionSha256'] is not None)
            withheld_shared += int(v['serverConfirmed'] and v['legacyRevisionSha256'] is not None)
            continue
        s = v['serverObservation']
        old = private['legacyDefinitions'].get(k)
        definitions.append({'bundleId': k,
                            'current': {**current_projection(private['steamRevisions'][s['revisionSha256']]), **s} if s else None,
                            'legacy': opt(old, ('revisionSha256','titleKey','descriptionKey','minGameVersion','components','artwork')) if old else None,
                            'saleHistoryVerified': False, 'currentAvailabilityVerified': False,
                            'listingEligibility': 'unverified'})
    # The canonical runtime uses only the sanitized projection; retain all 705 in the private source ledger.
    return {'schema': PUBLIC_SCHEMA,
            'source': {'steam': private['latestSteamSource'], 'legacy': private['legacySource']},
            'counts': {**private['counts'], 'publicDefinitions': len(definitions),
                       'publicDistinctItems': len({p['itemId'] for b in definitions for kind in ('current','legacy')
                                                   for p in (b[kind] or {}).get('components',[])}),
                       'withheldDefinitions': withheld, 'withheldCurrentDefinitions': withheld_current,
                       'withheldLegacyDefinitions': withheld_legacy, 'withheldSharedDefinitions': withheld_shared},
            'definitions': definitions}


def write_new(path, obj, private=False):
    path = Path(path)
    payload = (json.dumps(obj, ensure_ascii=False, separators=(',', ':')) + '\n').encode('utf-8')
    # Don't overwrite source/history or permit private files in a Git checkout.
    if private:
        check(not any((p / '.git').exists() for p in (path.resolve().parent, *path.resolve().parents)),
              'PRIVATE_CHECKOUT_OUTPUT')
    path.parent.mkdir(parents=True, exist_ok=True)
    with os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600 if private else 0o644), 'wb') as f:
        f.write(payload)
    return sha(payload)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--steam', required=True, type=Path)
    p.add_argument('--report', required=True, type=Path)
    p.add_argument('--legacy-protodb', required=True, type=Path)
    p.add_argument('--steam-sha256', default=STEAM_SHA)
    p.add_argument('--report-sha256', default=REPORT_SHA)
    p.add_argument('--previous-private', type=Path)
    p.add_argument('--previous-private-sha256')
    p.add_argument('--private-out', required=True, type=Path)
    p.add_argument('--public-out', type=Path)
    a = p.parse_args()
    check(bool(a.previous_private) == bool(a.previous_private_sha256), 'PREVIOUS_PIN_REQUIRED')
    prior = json.loads(pinned(a.previous_private, a.previous_private_sha256)) if a.previous_private else None
    private = merge(pinned(a.steam, a.steam_sha256), pinned(a.report, a.report_sha256),
                    pinned(a.legacy_protodb, LEGACY_SHA), prior)
    public = public_projection(private)
    result = {'counts': public['counts'], 'privateSha256': write_new(a.private_out, private, True)}
    if a.public_out:
        result['publicSha256'] = write_new(a.public_out, public)
    print(json.dumps(result, separators=(',', ':')))


if __name__ == '__main__':
    main()
