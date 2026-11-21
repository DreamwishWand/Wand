"""Typed, source-evidenced DDV mission projection; preserves unknown payloads.

Based on the Steam 1.26.1 IL2CPP proto field constants. No current
availability/ownership or player progression is calculated here.
"""
from mission_schema import (OBJECTIVE_KINDS, CONDITION_KINDS, BOOL_OPERATORS,
                            MISSION_STATUS_OPERATORS, UI_CATEGORIES, MISSION_TYPES)
from mission_items import project_objective_items
from condition_semantics import enrich_condition
from activation_policies import parse_mission_policies
from mission_item_flows import decode_bringsubstep, decode_mission_item_flows


def _packed_varint(data, pos):
    """Canonical decoder for packed protobuf int32 IDs, independent of CLI."""
    start=pos
    value=0
    for shift in range(0,70,7):
        if pos >= len(data): raise ValueError('TRUNCATED_PACKED_ID')
        octet=data[pos];pos+=1
        if shift==63 and octet>1:raise ValueError('OVERFLOW_PACKED_ID')
        value |= (octet & 127)<<shift
        if octet<128:
            encoded=[];v=value
            while v>127:encoded.append((v & 127)|128);v >>= 7
            encoded.append(v)
            if data[start:pos]!=bytes(encoded):raise ValueError('NONCANONICAL_PACKED_ID')
            return value,pos
    raise ValueError('UNTERMINATED_PACKED_ID')


def fields_of(wire_fields, fields, number, wire):
    return [v for n, w, v in fields if (n, w) == (number, wire)]


def localized_key(key, locale, plain_display, missing, context):
    if not key or '.' not in key:
        return None
    values, _member = locale.resolve(key)
    for language in ('en','fr','it','de','es-ES','ja','zh-CN','pt-BR'):
        if language not in values:
            missing.append({**context, 'locale': language, 'key': key})
    return {'localizationKey': key,
            'localizedText': values,
            'plainText': {k: plain_display(v) for k,v in values.items()}}


def string_fields(fields, definitions, text_field, locale, plain_display, missing, context):
    result = {}
    for field, meaning in definitions.items():
        key = text_field(fields, field)
        entry = localized_key(key, locale, plain_display, missing,
                              {**context, 'field': meaning})
        if entry:
            result[meaning] = entry
    return result


def condition_tree(payload, wire_fields, int_field, sha, links, path='conditions', depth=0):
    """Parse ConditionsList AND/OR/NOT AST, never flatten it into prerequisites.

    A leaf's name is only emitted for source-verified ConditionOneOf field tags;
    unknown field tags remain type=Unknown with a fingerprint.
    """
    if depth > 24:
        raise ValueError('CONDITION_TREE_DEPTH_EXCEEDED')
    ff = wire_fields(payload)
    def _text_field(fields, field):
        vals = [v for n, w, v in fields if (n, w) == (field, 2)]
        if len(vals) != 1: return None
        try: value = vals[0].decode('utf-8')
        except UnicodeDecodeError: return None
        return value if value and not any(ord(c) < 32 for c in value) else None
    operator = int_field(ff, 1)
    node = {'operator': BOOL_OPERATORS.get(operator, f'Unknown({operator})') if operator is not None else 'AND',
            'nativeWireSha256': sha(payload), 'conditions': []}
    for idx, child_raw in enumerate(fields_of(wire_fields, ff, 2, 2)):
        oneof = wire_fields(child_raw)
        nonempty = [(n, w, v) for n,w,v in oneof if n in CONDITION_KINDS and w == 2]
        if len(nonempty) != 1:
            node['conditions'].append({'type':'Unknown', 'wireSha256':sha(child_raw)})
            continue
        code, wire, value = nonempty[0]
        kind = CONDITION_KINDS[code]
        leaf = {'type':kind, 'protobufField':code, 'nativeWireSha256':sha(value)}
        loc = f'{path}.conditions[{idx}].{kind}'
        if kind == 'SubConditions':
            leaf['nested'] = condition_tree(value, wire_fields, int_field, sha, links,
                                            loc, depth+1)
        elif kind in ('MissionAvailable', 'MissionCompleted', 'MissionOngoing',
                      'MissionStatus', 'MissionStepCompleted', 'MissionStepStatus',
                      'MissionObjectiveCompleted','MissionObjectiveStatus',
                      'MissionObjectiveSkipped','MissionObjectiveProgression'):
            vf = wire_fields(value)
            target = int_field(vf, 1)
            if target is not None and target > 0:
                leaf['missionId'] = str(target)
                links.append({'toFamily':'quests', 'toId':str(target), 'predicate':kind,
                              'sourceField':loc+'.mission', 'conditionPath':loc})
            if kind.startswith('MissionStep'):
                step_id = int_field(vf, 2)
                if step_id is not None:
                    leaf['stepId'] = step_id
            elif kind.startswith('MissionObjective'):
                for code2, key in ((2,'stepId'),(3,'subStepId'),(4,'objectiveId')):
                    val = int_field(vf, code2)
                    if val is not None: leaf[key] = val
            if kind in ('MissionAvailable','MissionCompleted','MissionOngoing','MissionStepCompleted'):
                code2 = 3 if kind == 'MissionStepCompleted' else 2
                inversed = int_field(vf, code2)
                if inversed is not None: leaf['inversed'] = bool(inversed)
            if kind == 'MissionStepStatus':
                status = int_field(vf, 3)
                if status is not None:
                    leaf['statusCode'] = status
                    leaf['status'] = MISSION_STATUS_OPERATORS.get(status, f'Unknown({status})')
        elif kind == 'StoryCompleted':
            vf = wire_fields(value)
            target = int_field(vf, 1)
            if target is not None and target > 0:
                leaf['storyId'] = str(target)
                links.append({'toFamily':'stories', 'toId':str(target), 'predicate':kind,
                              'sourceField':loc+'.story', 'conditionPath':loc})
        enrich_condition(kind, value, leaf, wire_fields, int_field,
                         _text_field, links, loc)
        node['conditions'].append(leaf)
    return node


def extract_quest_details(fields, quest_id, helpers, locale, missing):
    wire_fields, text_field, int_field, sha, plain_display = helpers
    result = {'questMeta':{}, 'conditions':{}, 'stepsDetailed':[], 'typedRelations':[],
              'rewardsDecoded':{}}
    meta = result['questMeta']
    for code, key in ((8,'statusCode'),(9,'missionTypeCode'),(10,'repeatabilityCode'),
                      (14,'uiVisibilityCode'),(15,'uiCategoryCode'),(16,'nextToTrack')):
        val = int_field(fields, code)
        if val is not None:
            meta[key] = val
            if code == 9:
                meta['missionType'] = MISSION_TYPES.get(val, f'Unknown({val})')
            if code == 15:
                meta['uiCategory'] = UI_CATEGORIES.get(val, f'Unknown({val})')
    result['activationPolicies'] = parse_mission_policies(fields, quest_id, helpers,
        locale, missing, result['typedRelations'], condition_tree, localized_key)
    result['itemFlows'] = decode_mission_item_flows(fields,quest_id,helpers,
        locale,missing,result['typedRelations'],condition_tree,localized_key,
        _packed_varint)
    update = text_field(fields, 12)
    if update: meta['updateVersion'] = update
    for num,label in ((20,'availableConditions'),(21,'unlockConditions')):
        bodies = fields_of(wire_fields,fields,num,2)
        if len(bodies)>1:raise ValueError('DUPLICATE_QUEST_CONDITION_FIELD')
        if bodies:
            result['conditions'][label] = condition_tree(bodies[0], wire_fields, int_field, sha,
                        result['typedRelations'],f'protobuf.{num}')
    for i, raw_step in enumerate(fields_of(wire_fields,fields,40,2)):
        step_fields = wire_fields(raw_step)
        step = {'index':i, 'nativeWireSha256':sha(raw_step),
                'stepId':int_field(step_fields,15), 'stepName':text_field(step_fields,16),
                'descriptions':string_fields(step_fields, {2:'stepDescription',3:'stepDescriptionMobile',
                    4:'storyDescription',11:'ongoingRequestButton'}, text_field,locale,plain_display,
                    missing, {'family':'quests','id':quest_id,'step':i}),
                'subSteps': []}
        for j, raw_sub in enumerate(fields_of(wire_fields,step_fields,20,2)):
            sub_fields = wire_fields(raw_sub)
            sub = {'index':j, 'nativeWireSha256':sha(raw_sub),
                   'subStepId':int_field(sub_fields,1),'stepName':text_field(sub_fields,2),
                   'descriptions':string_fields(sub_fields,{3:'stepDescription',4:'stepDescriptionMobile'},
                       text_field,locale,plain_display,missing,{'family':'quests','id':quest_id,
                           'step':i,'subStep':j}), 'objectives': []}
            handoff = decode_bringsubstep(sub_fields,quest_id,i,j,helpers,locale,
                missing,result['typedRelations'],localized_key)
            if handoff is not None:
                sub['extraBringItem'] = handoff
            for k, raw_objective in enumerate(fields_of(wire_fields,sub_fields,50,2)):
                obj_fields = wire_fields(raw_objective)
                ones = [(code,val) for code,w,val in obj_fields if w==2 and code in OBJECTIVE_KINDS]
                obj = {'index':k, 'objectiveId':int_field(obj_fields,8),
                       'stepName':text_field(obj_fields,9),
                       'nativeWireSha256':sha(raw_objective),
                       'descriptions':string_fields(obj_fields,{1:'stepDescription',2:'stepDescriptionMobile'},
                          text_field,locale,plain_display,missing,{'family':'quests','id':quest_id,
                              'step':i,'subStep':j,'objective':k}),
                       'type':OBJECTIVE_KINDS[ones[0][0]] if len(ones)==1 else 'unresolved',
                       'typeField':ones[0][0] if len(ones)==1 else None,
                       'typePayloadSha256':sha(ones[0][1]) if len(ones)==1 else None}
                # Source-typed objective target IDs. These are explicit fields,
                # not integer matches found by recursive probing.
                if len(ones) == 1:
                    _kind, payload = ones[0]
                    target_rules = {
                        'UnlockCharacter': (1, 'characters', 'character'),
                        'TalkToCharacter': (3, 'worlds', 'targetScene'),
                        'FollowCharacter': (10, 'worlds', 'targetScene'),
                    }
                    item_targets = project_objective_items(obj['type'], payload,
                                                          wire_fields, int_field, sha)
                    if item_targets is not None:
                        obj['itemTargets'] = item_targets
                    if obj['type'] in target_rules:
                        target_field, target_family, target_label = target_rules[obj['type']]
                        details = wire_fields(payload)
                        target = int_field(details, target_field)
                        if target is not None and target > 0:
                            obj[target_label + 'Id'] = str(target)
                            result['typedRelations'].append({
                                'toFamily': target_family, 'toId': str(target),
                                'predicate': obj['type'] + '.' + target_label,
                                'sourceField': f'protobuf.40[{i}].20[{j}].50[{k}].{_kind}.{target_field}',
                                'relationKind': 'static_objective_reference'})
                sub['objectives'].append(obj)
            step['subSteps'].append(sub)
        result['stepsDetailed'].append(step)
    # MissionItemData.RewardsXP (62) == MissionReward; Currency (3) contains
    # CurrencyId (1), Amount (2) == MissionRewardRange {Min(1),Max(2)}.
    for body in fields_of(wire_fields,fields,62,2):
        rf = wire_fields(body)
        fs = fields_of(wire_fields,rf,1,2)
        if fs:
            vals=wire_fields(fs[0]); result['rewardsDecoded']['friendshipOverride']={
               'min':int_field(vals,1),'max':int_field(vals,2)}
        if fields_of(wire_fields,rf,3,2):
            rows=[]
            for raw in fields_of(wire_fields,rf,3,2):
                rr=wire_fields(raw);amt=fields_of(wire_fields,rr,2,2)
                rangefields=wire_fields(amt[0]) if len(amt)==1 else []
                rows.append({'currencyId':str(int_field(rr,1)) if int_field(rr,1) is not None else None,
                      'amountMin':int_field(rangefields,1), 'amountMax':int_field(rangefields,2)})
            result['rewardsDecoded']['currency']=rows
    return result
