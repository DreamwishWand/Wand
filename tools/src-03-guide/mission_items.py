"""Source-typed item-target projection for DDV quest objectives (Steam 1.26.1).

IL2CPP: Definitions.Items.CustomStep*, ItemSelector, AnyItemSelector,
MissionItemGenerator, GeneratorItem(Ingredient), GeneratorWeightedItem,
StepAmount, ScalableValue, Range. This is STATIC CONFIG, not actual player
progress and not an assertion that every weighted/filtered item is required.
"""

SCHEMA = 'wand.db03.mission-items@1'

# (selector fields (field, meaning, selector type), amount field)
# All field numbers are backed by the corresponding source IL2CPP protobuf class.
ITEM_OBJECTIVES = {
    'BringItem': (((2, 'targetItem', 'any'),), 3),
    'Possess': (((1, 'item', 'selector'),), 2),
    'CraftItem': (((1, 'target', 'selector'),), 2),
    'CookMeal': (((2, 'targetMeal', 'selector'), (4, 'targetIngredient', 'selector')), 10),
    'ConsumeItem': (((1, 'item', 'selector'),), 2),
    'CollectCurrency': (((1, 'currencyType', 'selector'),), 2),
    'MineMineral': (((2, 'targetItem', 'selector'),), 3),
    'GiftToCharacter': (((5, 'targetItem', 'selector'),), 6),
    'PurchaseItem': (((3, 'itemToPurchase', 'any'),), 4),
    'SellItem': (((2, 'itemToSell', 'any'),), 3),
    'PickUp': (((1, 'flowerItem', 'selector'), (2, 'ephemeralItem', 'selector'),
                (3, 'ingredientItem', 'selector'), (4, 'questItem', 'selector'),
                (5, 'regularItem', 'selector')), 10),
    'CatchFish': (((1, 'targetItem', 'selector'),), None),
    'GardeningHarvest': (((1, 'targetItem', 'selector'), (2, 'targetSeed', 'selector')), 5),
    'GardeningPlant': (((1, 'targetItem', 'selector'), (2, 'targetSeed', 'selector')), 5),
}

ANY_CATEGORIES = {0:'BuffElixir',1:'Building',2:'Clothes',3:'Companion',4:'Consummable',
 5:'CraftingMaterial',6:'Crop',7:'Currency',8:'DefaultActivityItem',9:'Figurine',
 10:'Fish',11:'Flower',12:'Furniture',13:'Ingredient',14:'LootPresent',15:'Meal',
 16:'MemoryShard',17:'Mineral',18:'PointOfInterest',19:'QuestItem',20:'Seed',
 21:'Tool',22:'Upgrade',23:'AnyActivityItem',24:'MountGear',25:'PremadeDecorationPreset'}


def one(fields, number, wire):
    values = [v for n,w,v in fields if (n,w)==(number,wire)]
    if len(values)>1:
        raise ValueError('DUPLICATE_TYPED_SELECTOR_FIELD')
    return values[0] if values else None


def decode_amount(payload, wire_fields, int_field, sha):
    """StepAmount oneof: 1=ScalableValue(value 1), 2=Range(min/max ScalableValue)."""
    fs = wire_fields(payload)
    variants=[(n,v) for n,w,v in fs if (n,w) in ((1,2),(2,2))]
    result={'sourceWireSha256':sha(payload), 'kind':'opaque'}
    if len(variants)!=1:return result
    variant,inner=variants[0]
    if variant==1:
        val=int_field(wire_fields(inner),1)
        if val is not None:result.update(kind='value',value=val)
    else:
        range_fs=wire_fields(inner)
        bounds={}
        for n,label in ((1,'min'),(2,'max')):
            sub=one(range_fs,n,2)
            if sub is not None:
                val=int_field(wire_fields(sub),1)
                if val is not None:bounds[label]=val
        result.update(kind='range',**bounds)
    return result


def decode_generator_choice(payload, wire_fields, int_field, sha):
    """GeneratorItem/GeneratorItemIngredient oneof: item 1 or weighted list 2."""
    fs=wire_fields(payload)
    item=one(fs,1,0)
    alts=one(fs,2,2)
    result={'sourceWireSha256':sha(payload),'kind':'unresolved','itemCandidates':[]}
    if item is not None and alts is None:
        if item>0:
            result.update(kind='singleItem',itemCandidates=[{'id':str(item),'role':'direct'}])
        else:result['kind']='emptyItemReference'
    elif alts is not None and item is None:
        fs2=wire_fields(alts)
        result.update(kind='weightedItemList',useAsFilter=bool(int_field(fs2,1) or 0))
        for raw in [v for n,w,v in fs2 if (n,w)==(2,2)]:
            item_fields=wire_fields(raw)
            iid=int_field(item_fields,2)
            if iid is None or iid<=0:continue
            weight=one(item_fields,1,2)
            value=int_field(wire_fields(weight),1) if weight is not None else None
            result['itemCandidates'].append({'id':str(iid),'role':'alternative',
                  'weight':value})
    return result


def decode_generator(payload, wire_fields, int_field, sha):
    """MissionItemGenerator.Item/ItemIngredient are source-backed nested choices.

    Both may be present; this function never merges them into assumed joint
    requirements. Filters, tags and item type constraints remain opaque config.
    """
    fs=wire_fields(payload)
    result={'sourceWireSha256':sha(payload),'itemCandidates':[],
            'sourceFieldNumbers':sorted(set(n for n,w,v in fs))}
    for n,label in ((1,'item'),(2,'itemIngredient')):
        raw=one(fs,n,2)
        if raw is None:continue
        parsed=decode_generator_choice(raw,wire_fields,int_field,sha)
        result[label]=parsed
        for ref in parsed['itemCandidates']:
            result['itemCandidates'].append({**ref,'generatorKind':label})
    category=int_field(fs,3)
    if category is not None:result['nativeItemTypeCode']=category
    # These are not interpreted as fixed items or guaranteed acquisition.
    result['hasAdditionalGeneratorFields']=any(n not in (1,2,3) for n,w,v in fs)
    return result


def decode_selector(payload, selector_type, wire_fields, int_field, sha):
    """Selector oneof remains intact; no automatic conversion to requirements."""
    fs=wire_fields(payload)
    result={'sourceWireSha256':sha(payload),'kind':selector_type,'itemCandidates':[]}
    if selector_type=='any':
        category=int_field(fs,1)
        if category is not None:
            result['anyCategoryCode']=category
            result['anyCategory']=ANY_CATEGORIES.get(category,f'Unknown({category})')
        inner=one(fs,2,2)
        if inner is None:return result
        result['nested']=decode_selector(inner,'selector',wire_fields,int_field,sha)
        result['itemCandidates']=result['nested']['itemCandidates']
        return result
    choices=[(n,v) for n,w,v in fs if (n,w) in ((1,2),(2,2),(3,2),(4,2))]
    if len(choices)!=1:
        result['mode']='unresolved'
        return result
    n,raw=choices[0]
    result['mode']={1:'item',2:'itemList',3:'itemGenerator',4:'filterGenerator'}[n]
    result['generator']=decode_generator(raw,wire_fields,int_field,sha)
    result['itemCandidates']=result['generator']['itemCandidates']
    return result


def project_objective_items(kind, payload, wire_fields, int_field, sha):
    """Source-validated selectors and amounts for objective kind, or None."""
    rule=ITEM_OBJECTIVES.get(kind)
    if rule is None:return None
    fields=wire_fields(payload)
    selectors,amount_number=rule
    result={'schema':SCHEMA,'selectors':[],'sourceWireSha256':sha(payload)}
    amount=one(fields,amount_number,2) if amount_number is not None else None
    if amount is not None:result['amount']=decode_amount(amount,wire_fields,int_field,sha)
    for field,label,typ in selectors:
        data=one(fields,field,2)
        if data is None:continue
        parsed=decode_selector(data,typ,wire_fields,int_field,sha)
        result['selectors'].append({'role':label,'sourceField':field,**parsed})
    # Raw generator matches are source-backed possible targets, not guarantees.
    result['sourceBackedCandidateCount']=sum(len(s['itemCandidates']) for s in result['selectors'])
    return result
