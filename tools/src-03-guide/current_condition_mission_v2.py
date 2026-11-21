"""DB-03 owner-private Steam 1.26.2 Condition index v2: source-typed Mission references.

Never infer progression, prerequisites, current availability, entitlements, or player
state. Reads original signed-off binaries, writes a separately versioned private
index/manifest; preserves the v1 contract and old files unchanged.
"""
from __future__ import annotations

import argparse
from collections import Counter
import json
from pathlib import Path

from native_guide import native_frames, wire_fields, int_field
from condition_schema import INT_OPERATORS, MISSION_STATES
from condition_semantic_delta import read_original, digest, CURRENT_CONDITION_SHA, MISSION_SHA, PROBE_SHA
from current_condition_catalog import build_index, save_private

INDEX_SCHEMA='wand.db03.condition-native-index@2'
MANIFEST_SCHEMA='wand.db03.condition-native-index-manifest@2'
EXPECTED_SOURCE_REFS=4960
EXPECTED_NONSTEP_REFS=1858
EXPECTED_KIND_COUNTS={
    'MissionAvailable':4, 'MissionCompleted':117, 'MissionOngoing':107,
    'MissionStatus':704, 'MissionStepCompleted':293, 'MissionStepStatus':3102,
    'MissionObjectiveCompleted':24, 'MissionObjectiveStatus':608,
    'MissionObjectiveProgression':1,
}
# Field names are source-confirmed ConditionOneOf tags, not inferred from IDs.
MISSION_TAGS={250:'MissionAvailable',255:'MissionCompleted',260:'MissionOngoing',
              270:'MissionStatus',280:'MissionStepCompleted',285:'MissionStepStatus',
              290:'MissionObjectiveCompleted',295:'MissionObjectiveStatus',
              297:'MissionObjectiveSkipped',300:'MissionObjectiveProgression'}
STEP_KINDS={'MissionStepCompleted','MissionStepStatus',
            'MissionObjectiveCompleted','MissionObjectiveStatus',
            'MissionObjectiveSkipped','MissionObjectiveProgression'}
OBJECTIVE_KINDS={'MissionObjectiveCompleted','MissionObjectiveStatus',
                 'MissionObjectiveSkipped','MissionObjectiveProgression'}


def require(value, code):
    if not value: raise ValueError('DB03_CONDITION_MISSION_V2_'+code)


def _field_int(fields, number):
    matches=[v for n,w,v in fields if n==number]
    if not matches:return None
    require(len(matches)==1 and isinstance(matches[0],int) and
            next(w for n,w,v in fields if n==number)==0,
            'UNEXPECTED_TYPED_FIELD_WIRE_OR_DUPLICATE')
    return matches[0]


def original_missions(raw):
    require(len(raw)==4373535 and digest(raw)==MISSION_SHA,'MISSION_ORIGINAL_SHA')
    missions={}
    for index,offset,mid,fields in native_frames(raw):
        require(mid not in missions,'DUPLICATE_MISSION')
        steps={}
        for step_raw in (v for n,w,v in fields if (n,w)==(40,2)):
            step_fields=wire_fields(step_raw)
            step_id=_field_int(step_fields,15)
            if step_id is None:continue
            entry=steps.setdefault(step_id,[])
            substeps={}
            for subraw in (v for n,w,v in step_fields if (n,w)==(20,2)):
                sf=wire_fields(subraw);subid=_field_int(sf,1)
                if subid is None:continue
                objids={_field_int(wire_fields(o),8) for n,w,o in sf if (n,w)==(50,2)}
                substeps.setdefault(subid,[]).append(objids)
            entry.append(substeps)
        missions[mid]=steps
    require(len(missions)==1030,'MISSION_SOURCE_CENSUS')
    return missions


def original_conditions(raw):
    require(len(raw)==571341 and digest(raw)==CURRENT_CONDITION_SHA,'CONDITION_ORIGINAL_SHA')
    result={}
    for _,_,id,fields in native_frames(raw):
        require(id not in result,'DUPLICATE_CONDITION')
        roots=[v for n,w,v in fields if (n,w)==(6,2)]
        require(len(roots)==1,'CONDITION_ROOT_CENSUS')
        result[id]=roots[0]
    require(len(result)==5440,'CONDITION_SOURCE_CENSUS')
    return result


def _verified_step(mission_steps, step_id):
    found=mission_steps.get(step_id,[])
    require(len(found)==1,'SOURCE_NATIVE_STEP_NOT_UNIQUE_OR_ABSENT')
    return found[0]


def enrich_tree(tree, source_raw, missions, census, depth=0):
    """Join the exact v1 AST leaf hashes to the current native protobuf wire."""
    require(depth<=16 and tree.get('sourceTreeWireSha256')==digest(source_raw),
            'BASE_TREE_ORIGINAL_WIRE_MISMATCH')
    ff=wire_fields(source_raw)
    children=[v for n,w,v in ff if (n,w)==(2,2)]
    require(len(children)==len(tree['children']),'SOURCE_LEAF_COUNT_MISMATCH')
    for ordinal,(leaf,oneof_raw) in enumerate(zip(tree['children'],children)):
        oneof=wire_fields(oneof_raw)
        require(len(oneof)==1 and oneof[0][1]==2 and
                leaf.get('ordinal')==ordinal and leaf.get('sourceTag')==oneof[0][0]
                and leaf.get('payloadSha256')==digest(oneof[0][2]),
                'ORIGINAL_LEAF_FINGERPRINT_MISMATCH')
        tag,_,payload=oneof[0]
        if tag==10:
            require(leaf.get('kind')=='SubConditions','SOURCE_SUBCONDITION_KIND')
            enrich_tree(leaf['nested'],payload,missions,census,depth+1)
            continue
        if tag not in MISSION_TAGS:
            continue
        kind=MISSION_TAGS[tag]
        require(leaf.get('kind')==kind,'SOURCE_MISSION_KIND')
        ff2=wire_fields(payload)
        mid=_field_int(ff2,1)
        require(mid is not None and mid>0 and mid in missions,'MISSION_ID_NOT_IN_VERIFIED_SOURCE')
        # All current source-pinned mission predicates have a native ID.
        if tag!=285:
            require('missionId' not in leaf,'UNEXPECTED_BASELINE_MISSION_ID')
            leaf['missionId']=str(mid)
        else:
            require(leaf.get('missionId')==str(mid),'STEP_STATUS_OLD_PROJECTION_MISMATCH')
        if kind in STEP_KINDS:
            step=_field_int(ff2,2)
            if step is not None:
                require(step>=0,'NEGATIVE_SOURCE_STEP_ID')
                if tag!=285:
                    require('stepId' not in leaf,'UNEXPECTED_BASELINE_STEP_ID')
                    leaf['stepId']=step
                else: require(leaf.get('stepId')==step,'STEP_STATUS_OLD_STEP_MISMATCH')
                valid_step=_verified_step(missions[mid],step)
                leaf['nativeStepIdVerified']=True
                if kind in OBJECTIVE_KINDS:
                    sub=_field_int(ff2,3)
                    obj=_field_int(ff2,4)
                    if sub is not None:
                        require(sub in valid_step and len(valid_step[sub])==1,
                                'SOURCE_NATIVE_SUBSTEP_NOT_UNIQUE_OR_ABSENT')
                        leaf['subStepId']=sub
                        if obj is not None:
                            require(obj in valid_step[sub][0],
                                    'SOURCE_NATIVE_OBJECTIVE_NOT_IN_SUBSTEP')
                            leaf['objectiveId']=obj
                    elif obj is not None:
                        leaf['objectiveId']=obj
            elif kind in OBJECTIVE_KINDS:
                # No explicit step is given; sub/objective IDs cannot be
                # resolved to a unique step, even if their scalar codes exist.
                for field,key in ((3,'subStepId'),(4,'objectiveId')):
                    number=_field_int(ff2,field)
                    if number is not None:leaf[key]=number
        if kind in ('MissionAvailable','MissionCompleted','MissionOngoing'):
            inversed=_field_int(ff2,2)
            if inversed is not None:
                require(inversed in (0,1),'SOURCE_INVERSION_BOOL')
                leaf['inversed']=bool(inversed)
        elif kind=='MissionStepCompleted':
            inversed=_field_int(ff2,3)
            if inversed is not None:
                require(inversed in (0,1),'SOURCE_STEP_INVERSION_BOOL')
                leaf['inversed']=bool(inversed)
        elif kind=='MissionStatus':
            compare=_field_int(ff2,2);state=_field_int(ff2,3)
            if compare is not None:
                leaf['comparisonOperatorCode']=compare
                leaf['comparisonOperator']=INT_OPERATORS.get(compare,f'Unknown({compare})')
            if state is not None:
                leaf['missionStateCode']=state
                leaf['missionState']=MISSION_STATES.get(state,f'Unknown({state})')
        census[kind]+=1


def build_v2(cond_raw,mission_raw,probe, *, probe_raw_digest=PROBE_SHA):
    require(probe_raw_digest==PROBE_SHA,'INDEPENDENT_PROBE_SHA')
    index,manifest=build_index(cond_raw,probe,probe_sha256=PROBE_SHA)
    mission_steps=original_missions(mission_raw)
    original=original_conditions(cond_raw)
    counts=Counter()
    for row in index['records']:
        enrich_tree(row['conditions'], original[int(row['id'])], mission_steps, counts)
    require(dict(counts)==EXPECTED_KIND_COUNTS,'VERIFIED_MISSION_PREDICATE_CENSUS')
    require(sum(counts.values())==EXPECTED_SOURCE_REFS and
            sum(x for k,x in counts.items() if k!='MissionStepStatus')==EXPECTED_NONSTEP_REFS,
            'VERIFIED_MISSION_REFERENCE_COUNT')
    index['schema']=INDEX_SCHEMA
    index['missionSource']={'file':'ddv_Data/StreamingAssets/itemlist/Mission.json',
                            'sha256':MISSION_SHA,'bytes':len(mission_raw),
                            'records':len(mission_steps)}
    manifest['schema']=MANIFEST_SCHEMA
    manifest['missionSource']=index['missionSource']
    manifest['counts']['missionReferenceLeaves']=sum(counts.values())
    manifest['counts']['nonStepMissionReferenceLeaves']=EXPECTED_NONSTEP_REFS
    manifest['counts']['missionReferencesByKind']=dict(sorted(counts.items()))
    manifest['limits']['missionReferenceDirection']='STATIC_SOURCE_MENTION_NOT_PREREQUISITE'
    manifest['limits']['missionPredicateTruthEvaluated']=False
    return index,manifest


def main(argv=None):
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--condition',type=Path,required=True)
    ap.add_argument('--mission',type=Path,required=True)
    ap.add_argument('--target-probe',type=Path,required=True)
    ap.add_argument('--output-dir',type=Path,required=True)
    opt=ap.parse_args(argv)
    dest=opt.output_dir.resolve()
    source=[x.resolve() for x in (opt.condition,opt.mission,opt.target_probe)]
    require(all(x!=dest and not x.is_relative_to(dest) for x in source),'SOURCE_OUTPUT_COLLISION')
    checkout=Path(__file__).resolve().parents[2]
    if (checkout/'package.json').is_file():
        require(not dest.is_relative_to(checkout),'PRIVATE_REPORT_IN_PUBLIC_REPO')
    probe_raw=read_original(opt.target_probe)
    require(digest(probe_raw)==PROBE_SHA,'ORIGINAL_PROBE_SHA')
    index,manifest=build_v2(read_original(opt.condition),read_original(opt.mission),
                            json.loads(probe_raw),probe_raw_digest=digest(probe_raw))
    out=dest/'condition-native-index-v2.json'
    save_private(out,index)
    manifest['privateIndexBytes']=out.stat().st_size
    manifest['privateIndexSha256']=digest(out.read_bytes())
    save_private(dest/'condition-native-index-manifest-v2.json',manifest)
    print(json.dumps({'status':'DB03_CONDITION_MISSION_SOURCE_V2_VERIFIED',
                      'nativeConditions':manifest['counts']['definitionCount'],
                      'missionReferenceLeaves':manifest['counts']['missionReferenceLeaves'],
                      'indexSha256':manifest['privateIndexSha256']},sort_keys=True))
    return 0


if __name__=='__main__':raise SystemExit(main())
