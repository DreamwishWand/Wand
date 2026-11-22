#!/usr/bin/env python3
"""Emit a curated, source-pinned, static public DDV Quest condition index.

The owner-private ZIP is used solely as an offline source. Do not publish it,
raw Condition index, source dialogues, or original quest detail shards.
"""
import argparse
import base64
from collections import Counter
import gzip
import hashlib
import json
from pathlib import Path
from zipfile import ZipFile
from guide_native_activation_fields import original_quests as parse_original_quests, enrich_quest_condition

BUNDLE_ROOT = 'Wand-Guide-Steam-v1.26.2/'
MISSION_SHA = 'f13958b52234f4cda92f0dd0bfff50be8a7f6625c8478785e2a077a5c7933d24'
CONDITION_SHA = '9eb5e7800a2485b1dfb3e148a7bcff5d6c6b6ed72797ed2331a902ab44188f4c'
FIELDS = ('amount', 'buildingItemId', 'characterId', 'comparisonOperator',
          'comparisonOperatorCode', 'conditionId', 'eventKey', 'expansionName',
          'friendshipLevel', 'requestedEventAvailabilityCode', 'inversed', 'itemId', 'missionId', 'missionState',
          'missionStateCode', 'objectiveId', 'playerLevel', 'requestedEventAvailability',
          'realmId', 'sceneId', 'status', 'statusCode', 'stepId', 'subStepId',
          'toolItemId', 'universeId', 'villageArea', 'villageAreaCode',
          'villageAreaFromProtoDefault', 'villageSceneId',
          'skinId','skinCondition','skinConditionCode','dateSeconds','dateNanos','dateUtc','localTime',
          'timestampKey','elapsedSeconds','elapsedNanos','numberOfResets',
          'dialogueFlagId','shardId','shardCondition','shardConditionCode','progress',
          'eventSegment','keyholeKey','keyholeLevel','keyholeStatusOperator',
          'keyholeStatusOperatorCode','mountId','equalOperator','equalOperatorCode',
          'storeFront','storeFrontCode','hourglassLevel','upgradeItemId')
OPS = ('AND', 'OR', 'NOT')

def sha(raw):
    return hashlib.sha256(raw).hexdigest()

def json_bytes(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'),
                      ensure_ascii=False).encode('utf-8')

def produce(bundle_path, mission_original):
    frames = parse_original_quests(mission_original.read_bytes())
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
        original_quests = authenticated('source-proof/guide-source-composite-1.26.2-v2.json')
        if search['source']['sha256'] != MISSION_SHA or search['target']['gameVersion'] != '1.26.1':
            raise ValueError('Mission source version mismatch')
        if conditions['source']['sha256'] != CONDITION_SHA or len(conditions['records']) != 5440:
            raise ValueError('Condition source mismatch')
        if original_quests['originalGuideFamilySources']['quests']['targetSha256'] != MISSION_SHA:
            raise ValueError('cross-version Mission source not verified')
        if original_quests['currentConditions']['sourceFileSha256'] != CONDITION_SHA:
            raise ValueError('cross-version Condition source not verified')
        if len(search['records']) != 733:
            raise ValueError('quest census mismatch')
        expected = {r['id']: r for r in search['records']}
        entries = {}
        source_by_id = {}
        for i in range(32):
            shard = authenticated('guide/quest-shards/part-%02d.json' % i)
            if shard['source']['sha256'] != MISSION_SHA or shard['target']['gameVersion'] != '1.26.1':
                raise ValueError('shard source mismatch')
            for row in shard['records']:
                id_ = row['id']
                if id_ not in expected:
                    continue  # source-labelled Group and unclassified records are not public quests
                if id_ in entries:
                    raise ValueError('duplicate public quest source')
                expected_row = expected[id_]
                if row['nativeWireSha256'] != expected_row['detail']['nativeWireSha256']:
                    raise ValueError('quest wire fingerprint mismatch')
                if sha(json_bytes(row)) != expected_row['detail']['recordSha256']:
                    raise ValueError('quest detail source SHA-256 mismatch')
                if expected_row['detail']['file'] != 'quest-shards/part-%02d.json' % i:
                    raise ValueError('quest shard assignment mismatch')
                frame = frames.get(id_)
                if frame is None or frame[1] != row['nativeWireSha256']:
                    raise ValueError('native Mission record differs from pinned source shard')
                entries[id_] = row['structured'].get('conditions', {})
                source_by_id[id_] = frame[0]
        if set(entries) != set(expected):
            raise ValueError('quest source coverage incomplete')
        known_kinds = set()
        def kind_walk(node):
            if not node:
                return
            if node.get('operator') not in OPS:
                raise ValueError('unsupported boolean source operator')
            for leaf in node.get('conditions', []):
                kind = leaf['type']
                known_kinds.add(kind)
                if kind == 'SubConditions':
                    kind_walk(leaf.get('nested'))
        for condition in entries.values():
            kind_walk(condition.get('availableConditions'))
            kind_walk(condition.get('unlockConditions'))
        kinds = sorted(known_kinds)
        names = {name: i for i, name in enumerate(kinds)}
        field_codes = {name: i for i, name in enumerate(FIELDS)}
        counts = Counter()
        def encode(node, quest_id, path):
            if node is None:
                return None
            operator = node['operator']
            result = []
            for ordinal, leaf in enumerate(node['conditions']):
                counts['leaves'] += 1
                leaf_path = path + '.conditions[' + str(ordinal) + ']' 
                kind = leaf['type']
                if kind == 'SubConditions':
                    result.append([names[kind], encode(leaf['nested'], quest_id, leaf_path + '.nested')])
                else:
                    selected = {k: value for k, value in leaf.items()
                              if k in field_codes and isinstance(value, (str, int, bool))}
                    if not selected:
                        counts['originallyUnprojected'] += 1
                        decoded = enrich_quest_condition(source_by_id[quest_id], leaf_path, leaf)
                        selected.update(decoded)
                        if decoded: counts['restoredOriginalScalars'] += 1
                        else: counts['nativePayloadHasNoScalar'] += 1
                    if set(selected).difference(field_codes):
                        raise ValueError(f'native scalar not in curated field list: {quest_id} {kind} {set(selected).difference(field_codes)}')
                    values = sorted(([field_codes[k], value] for k, value in selected.items()),
                                    key=lambda pair: pair[0])
                    result.append([names[kind], values])
                    if not values:
                        counts['predicatesWithoutSelectedScalars'] += 1
            return [OPS.index(operator), result]
        records = []
        for id_ in sorted(entries, key=int):
            branches = entries[id_]
            a = encode(branches.get('availableConditions'), id_, 'availableConditions')
            u = encode(branches.get('unlockConditions'), id_, 'unlockConditions')
            if a and a[1]: counts['availableWithLeaves'] += 1
            if u and u[1]: counts['unlockWithLeaves'] += 1
            records.append([id_, a, u])
        doc = dict(schema='wand.db03.public-quest-conditions@2',
                   target=dict(platform='Steam', gameVersion='1.26.2'),
                   provenance=dict(sourceProjectionVersion='1.26.1',
                       originalMissionSha256=MISSION_SHA,
                       currentConditionSha256=CONDITION_SHA,
                       sourceIsStaticNotPlayerProgress=True,
                       conditionTreesNotRuntimePrerequisites=True,
                       opaqueFieldsDecodedFromNativeMissionAndIL2CPP=True),
                   operators=list(OPS),kinds=kinds,fields=list(FIELDS),
                   counts=dict(quests=733,**counts),records=records)
        if counts['originallyUnprojected'] != 80 or counts['restoredOriginalScalars'] != 77 or counts['nativePayloadHasNoScalar'] != 3:
            raise ValueError('native scalar source census mismatch')
        return json_bytes(doc)

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--bundle', required=True, type=Path)
    parser.add_argument('--mission-original', required=True, type=Path)
    parser.add_argument('--out', required=True, type=Path)
    args = parser.parse_args()
    payload = produce(args.bundle,args.mission_original)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_bytes(base64.b64encode(gzip.compress(payload, compresslevel=9, mtime=0)))
    print('source-verified public projection', len(payload), 'bytes', 'SHA256', sha(payload))
    print('gzip-base64', args.out.stat().st_size, 'bytes', args.out)
    d = json.loads(payload)
    print('census', d['counts'], 'source kinds', len(d['kinds']))