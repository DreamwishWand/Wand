"""Conservative field-level projection of static mission conditions.

All decoded fields are based on Steam 1.26.1 IL2CPP condition protobuf
contracts. These describe when a condition *could* be true; they do NOT
establish owner entitlement, player progress or real-time availability.
"""
from condition_schema import INT_OPERATORS, MISSION_STATES, VILLAGE_AREAS, EVENT_AVAILABILITY

# Semantic source field numbers for Condition* payloads, not wire-value guesses.
# The first element is (target_family, field_number, property name) or None.
ID_CONDITIONS = {
    'CommonConditions': ('conditions', 1, 'conditionId'),  # ConditionCommon.Condition
    'CharacterUnlocked': ('characters', 1, 'characterId'),
    'CharacterLockedInVillage': ('characters', 1, 'characterId'),
    'CharacterFriendship': ('characters', 1, 'characterId'),
    'CurrentScene': ('worlds', 1, 'sceneId'),
    'CurrentVillage': ('worlds', 1, 'villageSceneId'),
    'BuildingUnlocked': (None, 1, 'buildingItemId'),
    'ToolUnlocked': (None, 1, 'toolItemId'),
    'Inventory': (None, 1, 'itemId'),
    'HasEverOwned': (None, 1, 'itemId'),
    'FTUEEventCompleted': (None, 1, 'ftueEventId'),
    'RealmUnlocked': (None, 1, 'universeId'),
    'StoryCompleted': (None, 1, 'storyId'),  # link is added by mission_semantics
}
# bool properties with explicit protobuf field numbers.
INVERSE_FIELDS = {
    'CommonConditions': 2, 'CharacterUnlocked': 2, 'CharacterLockedInVillage': 2,
    'BuildingUnlocked': 2, 'CurrentScene': 2, 'CurrentVillage': 2,
    'ToolUnlocked': 2, 'FTUEEventCompleted': 2, 'HasEverOwned': 2,
    'RealmUnlocked': 2, 'StoryCompleted': 2, 'Expansion': 2,
}


def enrich_condition(kind, payload, leaf, wire_fields, int_field, text_field, links, loc):
    """Attach only source-typed scalar fields to a leaf in the existing AST.

    Unknown or unpopulated scalar data remains absent, except optional enum
    defaults explicitly annotated as protobuf defaults. No predicate evaluation.
    """
    ff = wire_fields(payload)
    # ConditionOneOf always retains raw fingerprint in its calling parser.
    src = sorted(set(n for n,w,val in ff))
    leaf['nativePayloadFields'] = src
    if kind in ID_CONDITIONS:
        family, number, prop = ID_CONDITIONS[kind]
        val = int_field(ff, number)
        if val is not None and val > 0:
            leaf[prop] = str(val)
            if family:
                links.append({'toFamily':family, 'toId':str(val), 'predicate':kind,
                              'sourceField':loc+'.'+prop, 'conditionPath':loc,
                              'relationKind':'static_condition_reference'})
    inverse = INVERSE_FIELDS.get(kind)
    if inverse is not None:
        val = int_field(ff, inverse)
        if val is not None:
            leaf['inversed'] = bool(val)
    if kind in ('CharacterFriendship', 'Inventory', 'MissionStatus', 'PlayerLevel'):
        number = 1 if kind=='PlayerLevel' else 2
        val = int_field(ff,number)
        if val is not None:
            leaf['comparisonOperatorCode'] = val
            leaf['comparisonOperator'] = INT_OPERATORS.get(val, f'Unknown({val})')
    if kind=='CharacterFriendship':
        val=int_field(ff,3)
        if val is not None:leaf['friendshipLevel']=val
    if kind=='Inventory':
        val=int_field(ff,3)
        if val is not None:leaf['amount']=val
    if kind=='PlayerLevel':
        val=int_field(ff,2)
        if val is not None:leaf['playerLevel']=val
    if kind=='MissionStatus':
        val=int_field(ff,3)
        if val is not None:
            leaf['missionStateCode']=val
            leaf['missionState']=MISSION_STATES.get(val, f'Unknown({val})')
    if kind=='AreaUnlocked':
        # VillageAreaType defaults to Beach(0) in protobuf when not serialized.
        area=int_field(ff,2)
        if area is None:
            area=0
            leaf['villageAreaFromProtoDefault']=True
        leaf['villageAreaCode']=area
        leaf['villageArea']=VILLAGE_AREAS.get(area, f'Unknown({area})')
        inverse=int_field(ff,3)
        if inverse is not None:leaf['inversed']=bool(inverse)
    if kind=='Expansion':
        val=text_field(ff,1)
        if val is not None:leaf['expansionName']=val
        val=int_field(ff,3)
        if val is not None:leaf['anyPlatform']=bool(val)
    if kind=='EventTime':
        val=text_field(ff,1)
        if val is not None:leaf['eventKey']=val
        val=int_field(ff,2)
        if val is not None:leaf['inversed']=bool(val)
        val=int_field(ff,3)
        if val is not None:
            leaf['requestedEventAvailabilityCode']=val
            leaf['requestedEventAvailability']=EVENT_AVAILABILITY.get(val,f'Unknown({val})')
    return leaf
