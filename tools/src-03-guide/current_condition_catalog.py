"""DB-03 Steam 1.26.2 owner-private native Condition catalogue.

Content-addressed static definitions only. Never interpret true/false, active
quests, DLC ownership or live events; never commit the derived JSON to GitHub.
"""
from __future__ import annotations

import argparse
from collections import Counter
import json
import os
from pathlib import Path

from native_guide import native_frames, wire_fields, int_field, canonical_wire, text_field
from condition_schema import CONDITION_KINDS
from mission_schema import MISSION_STATUS_OPERATORS
from condition_semantic_delta import (
    digest, source_records, validate_probe, read_original,
    CURRENT_CONDITION_SHA, PROBE_SHA, SCHEMA as SEMANTIC_SCHEMA,
)

SCHEMA = 'wand.db03.condition-native-index@1'
MANIFEST_SCHEMA = 'wand.db03.condition-native-index-manifest@1'
VERSION, PLATFORM = '1.26.2', 'Steam'
MAX_DEPTH = 16
MAX_CHILDREN = 256


def require(good, code):
    if not good:
        raise ValueError('DB03_CONDITION_INDEX_' + code)


def binary_tree(data, depth=0):
    """Conservative source structural interpretation, not truth evaluation."""
    require(depth <= MAX_DEPTH, 'CONDITION_DEPTH')
    fs = wire_fields(data)
    operator = int_field(fs,1)
    # Explicit 0, or an omitted source operator, are both AND by the verified
    # source ConditionsList schema. Omitted is distinguished for provenance.
    require(operator in (None,0,1,2), 'INVALID_OPERATOR')
    children = [v for n,w,v in fs if n==2 and w==2]
    require(len(children) <= MAX_CHILDREN,'TOO_MANY_CHILDREN')
    rows=[]
    for position,raw in enumerate(children):
        oneof = wire_fields(raw)
        # Preserve unknown or future oneof structure as opaque, without trying
        # to guess which predicate is in effect.
        if len(oneof)!=1 or oneof[0][1]!=2:
            rows.append({'ordinal':position,'kind':'UnmappedOneOf',
                         'oneofWireSha256':digest(raw)})
            continue
        tag,_,payload = oneof[0]
        kind = CONDITION_KINDS.get(tag)
        leaf = {'ordinal':position,'sourceTag':tag,
                'kind':kind or 'Unknown', 'payloadSha256':digest(payload)}
        if tag==10 and kind=='SubConditions':
            leaf['nested']=binary_tree(payload,depth+1)
        elif tag==285 and kind=='MissionStepStatus':
            fields=wire_fields(payload)
            # The protobuf source sometimes omits optional step/status scalar
            # fields. No inferred default or runtime state is injected.
            recognized={1:'missionId',2:'stepId',3:'statusCode'}
            seen=set()
            for number,wire,value in fields:
                if number not in recognized or wire!=0 or number in seen:
                    leaf['scalarInterpretation']='opaque_unexpected_wire_shape'
                    break
                seen.add(number)
                if number==1 and value>0: leaf['missionId']=str(value)
                elif number==2:leaf['stepId']=value
                elif number==3:
                    leaf['statusCode']=value
                    leaf['sourceStatusName']=MISSION_STATUS_OPERATORS.get(value,f'Unknown({value})')
            else:
                leaf['scalarInterpretation']='source_explicit_fields_only'
                leaf['omittedSourceFields']=[recognized[n] for n in (1,2,3) if n not in seen]
        elif tag==5 and kind=='CommonConditions':
            ff=wire_fields(payload)
            pointer=int_field(ff,1)
            if pointer is not None and pointer>0:
                leaf['commonConditionId']=str(pointer)
        rows.append(leaf)
    return {'operator':{None:'AND',0:'AND',1:'OR',2:'NOT'}[operator],
            'operatorExplicit':operator is not None,
            'sourceTreeWireSha256':digest(data),'children':rows}


def project_records(records):
    """Only an original source ID is the primary key. Never dedupe on name."""
    rows=[];kind_count=Counter();explicit_steps=0;opaque_steps=0
    references=Counter();pointer_count=0
    def crawl(tree):
        nonlocal explicit_steps,opaque_steps,pointer_count
        for leaf in tree['children']:
            kind_count[leaf['kind']]+=1
            if leaf['kind']=='MissionStepStatus':
                if leaf.get('scalarInterpretation')=='source_explicit_fields_only':
                    explicit_steps+=1
                    if 'missionId' in leaf: references[leaf['missionId']]+=1
                else:opaque_steps+=1
            if 'commonConditionId' in leaf:pointer_count+=1
            if 'nested' in leaf:crawl(leaf['nested'])
    for source_id,source in sorted(records.items(),key=lambda row:int(row[0])):
        roots=[v for n,w,v in source['fields'] if n==6 and w==2]
        require(len(roots)==1,'MISSING_OR_DUPLICATE_CONDITIONS_LIST')
        tree=binary_tree(roots[0])
        crawl(tree)
        rows.append({'id':source_id,'sourceName':source['name'],
                     'nativeWireSha256':source['wireSha256'],
                     'nativeFrameIndex':source['frameIndex'],
                     'conditions':tree})
    return rows,{
        'definitionCount':len(rows),'sourceKinds':dict(sorted(kind_count.items())),
        'kindTotal':sum(kind_count.values()),
        'missionStepStatusExplicitScalarLeaves':explicit_steps,
        'missionStepStatusOpaqueLeaves':opaque_steps,
        'commonConditionPointerLeaves':pointer_count,
        'distinctMissionIdsInExplicitStepReferences':len(references)
    }


def build_index(current_condition_bytes, probe, *, probe_sha256=PROBE_SHA):
    validate_probe(probe)
    require(probe_sha256==PROBE_SHA,'PROBE_FINGERPRINT')
    require(digest(current_condition_bytes)==CURRENT_CONDITION_SHA
            and len(current_condition_bytes)==571341,'ORIGINAL_TARGET_HASH')
    rows,census=project_records(source_records(current_condition_bytes))
    require(len(rows)==5440,'ORIGINAL_TARGET_CENSUS')
    source={'file':'ddv_Data/StreamingAssets/itemlist/Condition.json',
            'sha256':CURRENT_CONDITION_SHA,'bytes':len(current_condition_bytes),
            'formatProbeSha256':PROBE_SHA}
    index={'schema':SCHEMA,'target':{'platform':PLATFORM,'gameVersion':VERSION},
           'source':source,'evaluation':'static_native_definitions_only',
           'records':rows}
    manifest={'schema':MANIFEST_SCHEMA,'target':index['target'],
              'source':source,'counts':census,
              'conditionFileCoverageComplete':True,
              'otherGuideFamiliesCoverageComplete':False,
              'dataPolicy':'owner_private_not_for_public_distribution',
              'limits':{
                  'predicatesEvaluated':False,
                  'runtimeOrSaveStateVerified':False,
                  'currentStarPathOrLiveEventVerified':False,
                  'unlistedOptionalFieldsInterpreted':False,
                  'sourceTreeOperatorsAreStatic':True}}
    return index,manifest


def save_private(dest, value):
    dest.parent.mkdir(parents=True,exist_ok=True)
    tmp=dest.with_name(dest.name+'.tmp')
    tmp.write_text(json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':'))+'\n',encoding='utf8')
    os.replace(tmp,dest)
    try:os.chmod(dest,0o600)
    except OSError:pass


def main(argv=None):
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--condition',type=Path,required=True)
    ap.add_argument('--target-probe',type=Path,required=True)
    ap.add_argument('--output-dir',type=Path,required=True)
    args=ap.parse_args(argv)
    dir=args.output_dir.resolve()
    source=args.condition.resolve(); probe_file=args.target_probe.resolve()
    require(dir!=source and dir!=probe_file and not source.is_relative_to(dir)
            and not probe_file.is_relative_to(dir),'SOURCE_OUTPUT_COLLISION')
    checkout=Path(__file__).resolve().parents[2]
    if (checkout/'package.json').is_file():
        require(not dir.is_relative_to(checkout),'OUTPUT_INSIDE_PUBLIC_REPOSITORY')
    raw=read_original(args.condition);p=read_original(args.target_probe)
    require(digest(p)==PROBE_SHA,'TARGET_PROBE_SOURCE_HASH')
    index,manifest=build_index(raw,json.loads(p),probe_sha256=digest(p))
    save_private(dir/'condition-native-index.json',index)
    # Pin the output JSON itself to the original native source and manifest.
    path=dir/'condition-native-index.json'
    manifest['privateIndexSha256']=digest(path.read_bytes())
    manifest['privateIndexBytes']=path.stat().st_size
    save_private(dir/'condition-native-index-manifest.json',manifest)
    print(json.dumps({'status':'CURRENT_SOURCE_CONDITION_INDEX_WRITTEN',
                      'records':manifest['counts']['definitionCount'],
                      'source':CURRENT_CONDITION_SHA},sort_keys=True))
    return 0

if __name__=='__main__':raise SystemExit(main())
