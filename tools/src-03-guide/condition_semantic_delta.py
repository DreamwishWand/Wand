"""DB-03 static Condition source delta, with typed MissionStepStatus references.

Read only original Steam itemlist binaries and an independent source probe.
Never evaluate gameplay conditions, owner progress, entitlement or live state.
Original game records and the generated report remain owner-private.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path

from native_guide import native_frames, wire_fields, text_field, int_field, canonical_wire
from condition_schema import CONDITION_KINDS
from mission_schema import MISSION_STATUS_OPERATORS

SCHEMA = 'wand.db03.condition-semantic-delta@1'
PROBE_SCHEMA = 'wand.src01.format-probe@1'
OLD_CONDITION_SHA = 'f9716fd7e80631213812ed2c93f802ee7ef73a0874214044d8e4304c555dc150'
CURRENT_CONDITION_SHA = '9eb5e7800a2485b1dfb3e148a7bcff5d6c6b6ed72797ed2331a902ab44188f4c'
MISSION_SHA = 'f13958b52234f4cda92f0dd0bfff50be8a7f6625c8478785e2a077a5c7933d24'
PROBE_SHA = '07fd8ebb1c528f852a0e00ce54cf4964f93931b9155bc9e2aab1bd857986d00a'
BASE_VERSION, TARGET_VERSION, PLATFORM = '1.26.1', '1.26.2', 'Steam'
MAX_INPUT = 16 * 1024 * 1024
MAX_CONDITIONS = 10000


def require(valid, code):
    if not valid:
        raise ValueError('DB03_CONDITION_SEMANTIC_' + code)


def digest(b):
    return hashlib.sha256(b).hexdigest()


def source_records(raw):
    """Source-native ID key and byte-exact canonical protobuf wire definition."""
    seen = {}
    for index, offset, native_id, fields in native_frames(raw):
        key = str(native_id)
        require(key not in seen, 'DUPLICATE_NATIVE_ID')
        seen[key] = {'id': key, 'fields': fields, 'name': text_field(fields, 2),
                     'wireSha256': digest(canonical_wire(fields)), 'frameIndex': index}
    require(bool(seen), 'EMPTY_NATIVE_SOURCE')
    return seen


def length_fields(fields, number):
    return [x for n,w,x in fields if n == number and w == 2]


def decode_condition(record):
    """Read only source-confirmed tags; retain opaque fingerprints for others."""
    fields = record['fields']
    roots = length_fields(fields, 6)
    require(len(roots) == 1, 'MISSING_OR_DUPLICATE_CONDITION_LIST')
    listing = wire_fields(roots[0])
    op = int_field(listing, 1)
    require(op in (None,0,1,2), 'UNKNOWN_BOOLEAN_OPERATOR')
    conditions = []
    for ordinal, raw_oneof in enumerate(length_fields(listing, 2)):
        fields_oneof = wire_fields(raw_oneof)
        require(len(fields_oneof) == 1 and fields_oneof[0][1] == 2,
                'INVALID_OR_MULTIPLE_CONDITION_ONEOF')
        number, _, body = fields_oneof[0]
        kind = CONDITION_KINDS.get(number)
        row = {'index': ordinal, 'kind': kind or 'Unknown', 'fieldNumber': number,
               'sourceWireSha256': digest(body)}
        if number == 285 and kind == 'MissionStepStatus':
            body_fields = wire_fields(body)
            by_number = {k: [] for k in (1,2,3)}
            for n,w,v in body_fields:
                if n in by_number:
                    require(w == 0, 'MISSION_STEP_UNEXPECTED_WIRE')
                    by_number[n].append(v)
            # If the original payload adds unknown fields, preserve it as opaque
            # until its native layout is independently validated.
            require(set((n,w) for n,w,_ in body_fields) == {(1,0),(2,0),(3,0)}
                    and all(len(by_number[n]) == 1 for n in (1,2,3)),
                    'MISSION_STEP_UNVERIFIED_SHAPE')
            mission_id,step_id,status = (by_number[n][0] for n in (1,2,3))
            require(mission_id > 0, 'MISSION_ID_INVALID')
            row.update({'missionId':str(mission_id), 'stepId':step_id,
                        'statusCode':status,
                        'status':MISSION_STATUS_OPERATORS.get(status, f'Unknown({status})'),
                        'staticSourcePredicateOnly':True})
        elif number == 5 and kind == 'CommonConditions':
            body_fields = wire_fields(body)
            pointer = int_field(body_fields, 1)
            if pointer is not None and pointer > 0:
                row['commonConditionId'] = str(pointer)
        conditions.append(row)
    require(bool(conditions), 'CONDITION_LEAVES_MISSING')
    return {'sourceId':record['id'], 'sourceName':record['name'],
            'sourceWireSha256':record['wireSha256'],
            'booleanOperator':{None:'AND',0:'AND',1:'OR',2:'NOT'}[op],
            'leaves':conditions}


def quest_index(raw):
    records = source_records(raw)
    require(len(records) == 1030, 'MISSION_SOURCE_CENSUS')
    return records


def step_info(mission, step_id):
    original_steps = [wire_fields(raw) for raw in length_fields(mission['fields'], 40)]
    matches = [(i, text_field(fields, 16)) for i,fields in enumerate(original_steps)
               if (int_field(fields, 15) or 0) == step_id]
    require(len(matches) == 1, 'MISSION_STEP_NOT_UNIQUE_OR_MISSING')
    i, original_name = matches[0]
    return {'existsInVerifiedMission':True, 'sourceStepIndex':i,
            'sourceStepName':original_name}


def common_condition_dependents(registry, targets):
    hits = []
    for source_id,record in registry.items():
        # Inspect only CommonConditions pointers. Other Condition records may
        # omit optional MissionStepStatus scalars; do not force them through
        # the strict decoder reserved for the two changed source records.
        for root in length_fields(record['fields'], 6):
            for node in length_fields(wire_fields(root), 2):
                oneof = wire_fields(node)
                for field,wire,body in oneof:
                    if (field,wire) != (5,2):
                        continue
                    pointer = int_field(wire_fields(body), 1)
                    if pointer is not None and str(pointer) in targets:
                        hits.append({'fromConditionId':source_id,
                                     'toConditionId':str(pointer)})
    return hits


def validate_probe(probe):
    require(isinstance(probe,dict) and probe.get('schema') == PROBE_SCHEMA
            and probe.get('gameVersion') == TARGET_VERSION
            and probe.get('platform') == PLATFORM, 'TARGET_PROBE_VERSION')
    data = probe.get('itemlistCandidates') or {}
    for name, sha in [('Condition.json',CURRENT_CONDITION_SHA),
                      ('Mission.json',MISSION_SHA)]:
        x = data.get(name)
        require(isinstance(x,dict) and x.get('status') == 'binary_structure_probe'
                and x.get('isJsonText') is False and x.get('sha256') == sha
                and x.get('source') == 'ddv_Data/StreamingAssets/itemlist/'+name
                and isinstance(x.get('size'),int) and x['size'] > 0,
                'INDEPENDENT_PROBE_' + name.replace('.','_'))


def build_report(old_raw, new_raw, mission_raw, probe):
    validate_probe(probe)
    require(digest(old_raw) == OLD_CONDITION_SHA and len(old_raw) == 571256,
            'BASELINE_CONDITION_SOURCE_SHA')
    require(digest(new_raw) == CURRENT_CONDITION_SHA and len(new_raw) == 571341,
            'TARGET_CONDITION_SOURCE_SHA')
    require(digest(mission_raw) == MISSION_SHA and len(mission_raw) == 4373535,
            'VERIFIED_MISSION_SOURCE_SHA')
    old, new, missions = source_records(old_raw),source_records(new_raw),quest_index(mission_raw)
    require(len(old)==5439 and len(new)==5440, 'SOURCE_CENSUS')
    old_keys,new_keys=set(old),set(new)
    modified=sorted((k for k in old_keys&new_keys if old[k]['wireSha256']!=new[k]['wireSha256']),key=int)
    added=sorted(new_keys-old_keys,key=int)
    deleted=sorted(old_keys-new_keys,key=int)
    require(modified==['2130006145'] and added==['2130007038'] and not deleted,
            'UNEXPECTED_SEMANTIC_DELTA_ID_SET')
    rows=[]
    for id in modified+added:
        before = decode_condition(old[id]) if id in old else None
        after = decode_condition(new[id])
        steps=[]
        for version,condition in [('baseline',before),('target',after)]:
            if condition is None:continue
            for leaf in condition['leaves']:
                if leaf.get('kind') != 'MissionStepStatus':continue
                parent = missions.get(leaf['missionId'])
                require(parent is not None,'REFERENCED_MISSION_MISSING')
                steps.append({'sourceVersion':version,'missionId':leaf['missionId'],
                              'missionNativeName':parent['name'],
                              'stepId':leaf['stepId'],'expectedStatusCode':leaf['statusCode'],
                              'expectedStatus':leaf['status'],
                              **step_info(parent,leaf['stepId'])})
        rows.append({'conditionId':id,'differenceKind':'changed' if before else 'added',
                     'baseline':before,'target':after,
                     'sourceMissionStepReferences':steps})
    changed=rows[0];before_leaves=changed['baseline']['leaves'];after_leaves=changed['target']['leaves']
    # Assert this exact update changes just the StepID (6 -> 9), not the
    # status value, Boolean tree, leaf type, or other opaque predicate.
    x,y=before_leaves[0],after_leaves[0]
    require(changed['baseline']['booleanOperator'] == changed['target']['booleanOperator']
            and len(before_leaves)==len(after_leaves)==2
            and x['kind']==y['kind']=='MissionStepStatus'
            and x['missionId']==y['missionId']=='2070001661'
            and x['stepId']==6 and y['stepId']==9
            and x['statusCode']==y['statusCode']==4
            and before_leaves[1]==after_leaves[1], 'CHANGED_RECORD_UNEXPECTED_SEMANTICS')
    new_leaf=rows[1]['target']['leaves']
    require(len(new_leaf)==1 and new_leaf[0]['kind']=='MissionStepStatus'
            and new_leaf[0]['missionId']=='2070001661' and new_leaf[0]['stepId']==12
            and new_leaf[0]['statusCode']==2, 'NEW_RECORD_UNEXPECTED_SEMANTICS')
    dependents=common_condition_dependents(new, set(modified+added))
    return {
        'schema':SCHEMA,'status':'SOURCE_TYPED_CONDITION_DELTA_VERIFIED',
        'sourceScope':{'baseline':{'gameVersion':BASE_VERSION,'platform':PLATFORM,
                                   'sha256':OLD_CONDITION_SHA,'records':len(old)},
                       'target':{'gameVersion':TARGET_VERSION,'platform':PLATFORM,
                                 'sha256':CURRENT_CONDITION_SHA,'records':len(new)},
                       'missionSourceSha256':MISSION_SHA,'missionRecords':len(missions),
                       'sourceProbeSha256':PROBE_SHA},
        'census':{'unchanged':len(old_keys&new_keys)-len(modified),
                  'modifiedIds':modified,'addedIds':added,'deletedIds':deleted},
        'changes':rows,'verifiedSummary':{
            'modifiedConditionId':'2130006145',
            'changedField':'MissionStepStatus.stepId',
            'oldStepId':6,'newStepId':9,
            'unchangedExpectedStatus': 'Completed',
            'addedConditionId':'2130007038',
            'addedMissionStepId':12,'addedExpectedStatus':'OnGoing',
            'targetMissionId':'2070001661',
            'allReferencedMissionStepsExist':True},
        'staticConditionCommonReferencesToChangedOrAdded':dependents,
        'limits':{'conditionTruth':'NOT_EVALUATED',
                  'missionAvailabilityOrDependencyDirection':'NOT_PROVEN',
                  'upstreamConsumersOutsideConditionFile':'NOT_EXHAUSTIVELY_MAPPED',
                  'userSaveProgressAndLiveEvents':'NOT_VERIFIED',
                  'publicGameSourceDistribution':'NOT_AUTHORIZED'}
    }


def read_original(path):
    require(path.is_file() and not path.is_symlink() and 0 < path.stat().st_size <= MAX_INPUT,
            'SOURCE_MISSING_SYMLINK_OR_OVERSIZED')
    return path.read_bytes()


def main(argv=None):
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--baseline-condition',type=Path,required=True)
    ap.add_argument('--target-condition',type=Path,required=True)
    ap.add_argument('--mission',type=Path,required=True)
    ap.add_argument('--target-probe',type=Path,required=True)
    ap.add_argument('--out',type=Path,required=True)
    opt=ap.parse_args(argv)
    dest=opt.out.resolve()
    inputs=[opt.baseline_condition.resolve(),opt.target_condition.resolve(),
            opt.mission.resolve(),opt.target_probe.resolve()]
    require(dest not in inputs, 'REPORT_SOURCE_COLLISION')
    checkout=Path(__file__).resolve().parents[2]
    if (checkout/'package.json').exists():
        require(not dest.is_relative_to(checkout),'PRIVATE_REPORT_IN_PUBLIC_REPO')
    probe_raw=read_original(opt.target_probe)
    require(digest(probe_raw)==PROBE_SHA,'PROBE_SOURCE_SHA')
    probe=json.loads(probe_raw)
    result=build_report(read_original(opt.baseline_condition),
                        read_original(opt.target_condition),read_original(opt.mission),probe)
    dest.parent.mkdir(parents=True,exist_ok=True)
    temp=dest.with_name(dest.name+'.tmp')
    temp.write_text(json.dumps(result,ensure_ascii=False,sort_keys=True,indent=2)+'\n',encoding='utf8')
    os.replace(temp,dest)
    try:os.chmod(dest,0o600)
    except OSError:pass
    print(json.dumps({'status':result['status'],'conditionsChanged':len(result['changes']),
                      'missionId':result['verifiedSummary']['targetMissionId']},sort_keys=True))
    return 0

if __name__=='__main__':
    raise SystemExit(main())
