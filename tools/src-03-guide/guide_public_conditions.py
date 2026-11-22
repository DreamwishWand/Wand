#!/usr/bin/env python3
"""Generate curated public quest condition clauses from a pinned PRIVATE Guide bundle.

Source is offline only. Publish the compressed projection, never the bundle,
raw v1.26.2 Condition index, unfiltered original shards or player saves.
"""
import argparse
import base64
from collections import Counter
import gzip
import hashlib
import json
from pathlib import Path
from zipfile import ZipFile

BUNDLE_ROOT = 'Wand-Guide-Steam-v1.26.2/'
MISSION_SHA = 'f13958b52234f4cda92f0dd0bfff50be8a7f6625c8478785e2a077a5c7933d24'
CONDITION_SHA = '9eb5e7800a2485b1dfb3e148a7bcff5d6c6b6ed72797ed2331a902ab44188f4c'
FIELDS = ('amount', 'buildingItemId', 'characterId', 'comparisonOperator',
          'comparisonOperatorCode', 'conditionId', 'eventKey', 'expansionName',
          'friendshipLevel', 'inversed', 'itemId', 'missionId', 'missionState',
          'missionStateCode', 'objectiveId', 'playerLevel', 'requestedEventAvailability',
          'realmId', 'sceneId', 'status', 'statusCode', 'stepId', 'subStepId',
          'toolItemId', 'universeId', 'villageArea', 'villageAreaCode',
          'villageAreaFromProtoDefault', 'villageSceneId')
OPS = ('AND', 'OR', 'NOT')


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def json_bytes(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'),
                      ensure_ascii=False).encode('utf-8')


def produce(bundle_path):
    with ZipFile(bundle_path) as archive:
        manifest = json.loads(archive.read(BUNDLE_ROOT + 'OWNER-PRIVATE-BUNDLE-MANIFEST.json'))
        assert manifest['schema'] == 'wand.db03.owner-guide-bundle@1'
        assert manifest['counts']['searchableQuests'] == 733
        assert manifest['counts']['originalQuestShards'] == 32
        assert manifest['sourceProvenance']['originalQuestFullFileSha256'] == MISSION_SHA
        assert manifest['target']['gameVersion'] == '1.26.2'

        def authenticated(name):
            record = manifest['files'][name]
            data = archive.read(BUNDLE_ROOT + name)
            if len(data) != record['bytes'] or sha(data) != record['sha256']:
                raise ValueError('source bundle mismatch: ' + name)
            return json.loads(data)

        search = authenticated('guide/quest-search.json')
        conditions = authenticated('condition-native-index-v2.json')
        proof = authenticated('source-proof/guide-source-composite-1.26.2-v2.json')
        if search['source']['sha256'] != MISSION_SHA or search['target']['gameVersion'] != '1.26.1':
            raise ValueError('Mission source version mismatch')
        if conditions['source']['sha256'] != CONDITION_SHA or len(conditions['records']) != 5440:
            raise ValueError('Condition source mismatch')
        if proof['originalGuideFamilySources']['quests']['targetSha256'] != MISSION_SHA or (
                proof['currentConditions']['sourceFileSha256'] != CONDITION_SHA):
            raise ValueError('cross-version source not verified')
        if len(search['records']) != 733:
            raise ValueError('quest census mismatch')

        expected = {r['id']: r for r in search['records']}
        entries = {}
        for i in range(32):
            shard = authenticated('guide/quest-shards/part-%02d.json' % i)
            if shard['source']['sha256'] != MISSION_SHA or shard['target']['gameVersion'] != '1.26.1':
                raise ValueError('shard source mismatch')
            for row in shard['records']:
                quest_id = row['id']
                if quest_id not in expected:
                    continue
                if quest_id in entries:
                    raise ValueError('duplicate quest source')
                indexed = expected[quest_id]
                if row['nativeWireSha256'] != indexed['detail']['nativeWireSha256']:
                    raise ValueError('native quest fingerprint mismatch')
                if sha(json_bytes(row)) != indexed['detail']['recordSha256']:
                    raise ValueError('quest detail fingerprint mismatch')
                if indexed['detail']['file'] != 'quest-shards/part-%02d.json' % i:
                    raise ValueError('quest shard assignment mismatch')
                entries[quest_id] = row['structured'].get('conditions', {})
        if set(entries) != set(expected):
            raise ValueError('quest coverage incomplete')

        kinds = set()

        def inspect(node):
            if not node:
                return
            if node.get('operator') not in OPS:
                raise ValueError('unsupported original boolean operator')
            for leaf in node.get('conditions', []):
                kind = leaf['type']
                kinds.add(kind)
                if kind == 'SubConditions':
                    inspect(leaf.get('nested'))

        for condition in entries.values():
            inspect(condition.get('availableConditions'))
            inspect(condition.get('unlockConditions'))
        kinds = sorted(kinds)
        names = {name: i for i, name in enumerate(kinds)}
        field_codes = {name: i for i, name in enumerate(FIELDS)}
        counts = Counter()

        def encode(node):
            if node is None:
                return None
            result = []
            for leaf in node['conditions']:
                counts['leaves'] += 1
                kind = leaf['type']
                if kind == 'SubConditions':
                    result.append([names[kind], encode(leaf['nested'])])
                else:
                    values = [[field_codes[key], value] for key, value in leaf.items()
                              if key in field_codes and isinstance(value, (str, int, bool))]
                    values.sort(key=lambda pair: pair[0])
                    result.append([names[kind], values])
                    if not values:
                        counts['predicatesWithoutSelectedScalars'] += 1
            return [OPS.index(node['operator']), result]

        records = []
        for quest_id in sorted(entries, key=int):
            branches = entries[quest_id]
            available = encode(branches.get('availableConditions'))
            unlock = encode(branches.get('unlockConditions'))
            if available and available[1]:
                counts['availableWithLeaves'] += 1
            if unlock and unlock[1]:
                counts['unlockWithLeaves'] += 1
            records.append([quest_id, available, unlock])
        document = {
            'schema': 'wand.db03.public-quest-conditions@1',
            'target': {'platform': 'Steam', 'gameVersion': '1.26.2'},
            'provenance': {
                'sourceProjectionVersion': '1.26.1',
                'originalMissionSha256': MISSION_SHA,
                'currentConditionSha256': CONDITION_SHA,
                'sourceIsStaticNotPlayerProgress': True,
                'conditionTreesNotRuntimePrerequisites': True
            },
            'operators': list(OPS), 'kinds': kinds, 'fields': list(FIELDS),
            'counts': dict(quests=733, **counts), 'records': records
        }
        return json_bytes(document)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--bundle', required=True, type=Path)
    parser.add_argument('--out', required=True, type=Path)
    args = parser.parse_args()
    data = produce(args.bundle)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_bytes(base64.b64encode(gzip.compress(data, compresslevel=9, mtime=0)))
    print('public condition source bytes', len(data), 'SHA256', sha(data))
    print('base64 gzip bytes', args.out.stat().st_size)
