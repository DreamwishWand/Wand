"""Steam v1.26.1 source-typed Guide item transfer / reward configuration.

Only source-configured possible grants, removals and loot candidates are decoded.
No player save mutations, guaranteed rewards, live loot rolls, or entitlements
are inferred. IL2CPP classes: MissionItemData, AnyItemSelectorWithAmount,
MissionSubStepData.Types.ExtraBringItem, ItemToGiveAmount, OverrideRewards,
LootTable, SubLootTable, ItemWithState, ConditionalItemWithState.
"""
from mission_items import decode_amount, decode_selector

SCHEMA = 'wand.db03.item-flows@1'


def singular(fields, number, wire):
    matches = [v for n,w,v in fields if (n,w) == (number,wire)]
    if len(matches) > 1:
        raise ValueError('DUPLICATE_ITEM_FLOW_FIELD')
    return matches[0] if matches else None


def messages(fields, number):
    return [v for n,w,v in fields if (n,w) == (number,2)]


def packed_ids(fields, number, varint):
    """Read proto3 packed repeated int32 OR unpacked wire0, without guessing IDs."""
    result = []
    for n,w,v in fields:
        if n != number:
            continue
        if w == 0:
            result.append(v)
        elif w == 2:
            pos = 0
            while pos < len(v):
                val, pos = varint(v, pos)
                result.append(val)
        else:
            raise ValueError('INVALID_PACKED_ITEM_REFERENCE')
    return result


def decode_bringsubstep(fields, quest_id, step_index, sub_index,
                         helpers, locale, missing, links, localized_key):
    """MissionSubStepData.BringItem oneof (20) -> ExtraBringItem."""
    wire_fields, text_field, int_field, sha, clean = helpers
    raw = singular(fields, 20, 2)
    if raw is None:
        return None
    if any(n == 21 and w == 2 for n,w,v in fields):
        raise ValueError('MULTIPLE_SUBSTEP_EXTRA_ONEOF')
    fs = wire_fields(raw)
    keep = singular(fs, 2, 0)
    entry = {'sourceWireSha256': sha(raw), 'keepItems': bool(keep) if keep is not None else False,
             'keepItemsFromProtoDefault': keep is None,
             'itemsToGive': [], 'text': {}, 'configuration': {}}
    for n,key in ((3,'skipAvatarGiveAnimation'),(4,'skipConfirmationPopup')):
        flag = singular(fs,n,0)
        if flag is not None: entry['configuration'][key] = bool(flag)
    dialogue_type = singular(fs,10,0)
    if dialogue_type is not None:
        entry['configuration']['bringDialogueTypeCode'] = dialogue_type
    for n,key in ((1,'readyDescription'),(11,'bringDialogue'),(13,'wrongSceneDescription')):
        lk = text_field(fs,n)
        if not lk:
            continue
        value = localized_key(lk,locale,clean,missing,{'family':'quests',
            'id':quest_id,'step':step_index,'subStep':sub_index,'field':key})
        entry['text'][key] = value if value is not None else {'localizationKey':lk}
    target_scene = singular(fs,12,0)
    if target_scene is not None and target_scene > 0:
        entry['targetSceneId'] = str(target_scene)
        links.append({'toFamily':'worlds','toId':str(target_scene),
            'predicate':'ExtraBringItem.targetScene',
            'sourceField':f'protobuf.40[{step_index}].20[{sub_index}].20.12',
            'relationKind':'static_transfer_scene_reference'})
    for index, blob in enumerate(messages(fs,14)):
        ff = wire_fields(blob)
        iid,qty = singular(ff,1,0),singular(ff,2,0)
        entry['itemsToGive'].append({'index':index,'itemId':str(iid) if iid is not None else None,
                    'amount':qty,'sourceWireSha256':sha(blob)})
    return entry


def decode_loot_table(payload, mission_id, helpers, condition_tree, links):
    """LootTable/SubLootTable: weighted/configurable possibilities, NOT grants."""
    wire_fields, _text_field, int_field, sha, _ = helpers
    root = wire_fields(payload)
    result = {'sourceWireSha256':sha(payload), 'subLootTables':[]}
    for i, raw in enumerate(messages(root,1)):
        fields = wire_fields(raw)
        sub = {'index':i,'sourceWireSha256':sha(raw), 'items':[],
               'conditionalItems':[], 'lootTypeFingerprints':[], 'filterFingerprints':[]}
        for n,label in ((1,'minimumRolls'),(2,'maximumRolls'),(3,'weight')):
            val = singular(fields,n,0)
            if val is not None: sub[label]=val
        for n,label in ((4,'empty'),(5,'prioritizeNewItems')):
            val=singular(fields,n,0)
            if val is not None:sub[label]=bool(val)
        for j, itemblob in enumerate(messages(fields,10)):
            one = wire_fields(itemblob)
            itemid=singular(one,1,0)
            state=singular(one,2,2)
            sub['items'].append({'index':j,'itemId':str(itemid) if itemid is not None else None,
                   'itemStateSha256':sha(state) if state is not None else None,
                   'sourceWireSha256':sha(itemblob)})
        for j, cond_blob in enumerate(messages(fields,11)):
            cond = wire_fields(cond_blob)
            c={'index':j,'sourceWireSha256':sha(cond_blob),'items':[]}
            conditions = singular(cond,1,2)
            if conditions is not None:
                c['conditions']=condition_tree(conditions,wire_fields,int_field,sha,links,
                    f'protobuf.61.1[{i}].11[{j}].Conditions')
            for k,itemblob in enumerate(messages(cond,2)):
                f = wire_fields(itemblob)
                itemid=singular(f,1,0)
                state=singular(f,2,2)
                c['items'].append({'index':k,'itemId':str(itemid) if itemid is not None else None,
                    'itemStateSha256':sha(state) if state is not None else None,
                    'sourceWireSha256':sha(itemblob)})
            sub['conditionalItems'].append(c)
        sub['lootTypeFingerprints'] = [sha(b) for b in messages(fields,12)]
        sub['filterFingerprints'] = [sha(b) for b in messages(fields,100)]
        sub['rarityCodes'] = [v for n,w,v in fields if (n,w)==(30,0)]
        for n,label in ((31,'minRarity'),(32,'maxRarity')):
            val=singular(fields,n,0)
            if val is not None:sub[label]=val
        av=singular(fields,101,2)
        if av is not None:
            sub['availableWhen']=condition_tree(av,wire_fields,int_field,sha,links,
                f'protobuf.61.1[{i}].AvailableWhen')
        result['subLootTables'].append(sub)
    return result


def decode_mission_item_flows(fields, quest_id, helpers, locale,
                              missing, links, condition_tree, localized_key, varint):
    """MissionItemData: static start grants, reward overrides, loot, cleanup."""
    wire_fields, text_field, int_field, sha, clean = helpers
    result={'schema':SCHEMA, 'introItemsToGive':[], 'itemsToDeleteAfterMission':[],
            'overrideRewardReferences':[], 'additionalRewards':None}
    for i, raw in enumerate(messages(fields,33)):
        ff=wire_fields(raw)
        selector=singular(ff,1,2)
        amount=singular(ff,2,2)
        row={'index':i, 'sourceWireSha256':sha(raw),
             'itemSelector':decode_selector(selector,'any',wire_fields,int_field,sha) if selector is not None else None,
             'configuredAmount':decode_amount(amount,wire_fields,int_field,sha) if amount is not None else None}
        result['introItemsToGive'].append(row)
    result['itemsToDeleteAfterMission'] = [str(x) for x in packed_ids(fields,63,varint)]
    rewards=singular(fields,60,2)
    if rewards is not None:
        ff=wire_fields(rewards)
        result['overrideRewardReferences']=[str(x) for x in packed_ids(ff,31,varint)]
        result['overrideRewardsWireSha256']=sha(rewards)
    extra=singular(fields,61,2)
    if extra is not None:
        result['additionalRewards']=decode_loot_table(extra,quest_id,helpers,condition_tree,links)
    return result
