"""Static quest activation policies extracted from source-evidenced protobuf.

Source: Steam v1.26.1 `Definitions.Items.MissionItemData` and nested
`OwnerOverride`, `UIUnlockCondition`, `AutoAcceptOption`. These are policy
*definitions*, never live quest progression or proven prerequisites.
"""

MISSION_CHOICES = {0:'Any',1:'Choice1',2:'Choice2',3:'Choice3',4:'Choice4',
                   5:'Choice5',6:'Choice6',7:'Choice7',8:'Choice8'}


def repeated(fields, number):
    return [val for num, wire, val in fields if (num, wire)==(number,2)]


def parse_mission_policies(fields, mission_id, tools, locale, missing, links,
                           condition_tree, localized_key):
    wire_fields, text_field, int_field, sha, clean = tools
    result = {'autoAcceptOptions':[], 'uiUnlockConditions':[], 'ownerOverrides':[]}
    for i, raw in enumerate(repeated(fields, 23)):
        fs=wire_fields(raw)
        conds=repeated(fs,2)
        if len(conds)>1: raise ValueError('DUPLICATE_AUTO_ACCEPT_CONDITIONS')
        choice=int_field(fs,1)
        entry={'index':i,'sourceWireSha256':sha(raw),
               'choiceCode':0 if choice is None else choice,
               'choice':MISSION_CHOICES.get(0 if choice is None else choice,
                                    f'Unknown({choice})'),
               'choiceFromProtoDefault':choice is None,
               'conditions':None}
        if conds:
            entry['conditions']=condition_tree(conds[0],wire_fields,int_field,sha,
                                  links,f'protobuf.23[{i}].Conditions')
        result['autoAcceptOptions'].append(entry)
    for i,raw in enumerate(repeated(fields,22)):
        fs=wire_fields(raw)
        conds=repeated(fs,1)
        if len(conds)>1: raise ValueError('DUPLICATE_UI_UNLOCK_CONDITIONS')
        key=text_field(fs,2)
        entry={'index':i,'sourceWireSha256':sha(raw),
               'textKey':key,'conditions':None}
        if key and '.' in key:
            entry['text']=localized_key(key,locale,clean,missing,
                   {'family':'quests','id':mission_id,'uiUnlockCondition':i})
        if conds:
            entry['conditions']=condition_tree(conds[0],wire_fields,int_field,sha,
                                  links,f'protobuf.22[{i}].Conditions')
        result['uiUnlockConditions'].append(entry)
    for i,raw in enumerate(repeated(fields,19)):
        fs=wire_fields(raw)
        conds=repeated(fs,1)
        if len(conds)>1: raise ValueError('DUPLICATE_OWNER_OVERRIDE_CONDITIONS')
        character=int_field(fs,2)
        custom=repeated(fs,3)
        if character is not None and custom:raise ValueError('OWNER_OVERRIDE_MULTIPLE_ONEOF')
        if len(custom)>1:raise ValueError('DUPLICATE_OWNER_OVERRIDE_CUSTOM')
        entry={'index':i,'sourceWireSha256':sha(raw),'ownerKind':'absent',
               'conditions':None}
        if character is not None:
            entry.update(ownerKind='character',characterId=str(character))
            if character>0:
                links.append({'toFamily':'characters','toId':str(character),
                    'predicate':'OwnerOverride.character',
                    'sourceField':f'protobuf.19[{i}].Character',
                    'relationKind':'static_owner_override_reference'})
        elif custom:
            entry.update(ownerKind='custom',customPayloadSha256=sha(custom[0]))
        if conds:
            entry['conditions']=condition_tree(conds[0],wire_fields,int_field,sha,
                                  links,f'protobuf.19[{i}].Conditions')
        result['ownerOverrides'].append(entry)
    return result
