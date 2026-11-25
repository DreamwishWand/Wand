#!/usr/bin/env python3
"""Reproduce Steam 1.26.2 recipe-slot and star-tier evidence.
No original executable/configuration bytes are written to the repository.
"""
import argparse
import hashlib
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'src-02-acquisition'))
from audit_native_sell_formula_source import fields, one, many, string

DLL = 'a574a3c41b2911f6031070d05f933f562e4b3efdb881ac3c774384a0effee653'
DUMP = '0ebf1de44c236a59703a5f09aa702f2acf2369e77b9f399ea792db58a0270d08'
PROTO = 'dc5015cc37b30f14ebda2b13822ddfa21b311e6f651ba29dc5c5eccaefa2a623'
WINDOWS = (
    ('star_tier_equality',0x3e1fd90,16,'f35d6fa0b23a05c3b181d92bd3a6f8592a2396da15fa4772c100162a3521b537'),
    ('star_selection',0x3e1e322,97,'664d58b955941c909ac48c3e7f6c69219dd4fba45361ae9b038e10d80863ff35'),
    ('ordered_ingredients_call',0x3e1e3c7,16,'212c99ba7c1da1ef6b52aed55583cdb9d883aecb0019205fa6571bf000f60303'),
    ('ordered_slot_copy',0x3e1e3d7,233,'fdbaefb3890c0bbf4529fad8c0499d534ad2aab9fefc1ab68bfe3124a3dcd314'),
    ('order_by',0x3e25bbb,18,'8b9d8d41fc0c961bdd9b30ab990f6d4a39e74ab55863d012b98da6267306621a'),
    ('fixed_first_order_key',0x3e2d299,12,'3e7c9d8e9f8daa5edd04a4add6cdf737677c923d87c37f819603d1ecaa050a54'),
    ('first_matching_slot',0x196740,55,'ca555720b42e51f8c790ef206b2d4e170cb0b4494d0eaa08ac9ef465b79a992c'),
    ('match_adjust_remove',0x3e1e5e3,69,'2ef26f9c735c9ad691a3d56eb34bee483b89cfeee4a84b83a6e3adedc6c822ed'),
    ('predicate_calls_ingredient_validation',0x3e2013d,38,'93adb30c2c8b4fd95c929fdad8ccdb6e18b168d0e84ae524ba14be739eb77ac8'),
    ('ingredient_selector_dispatch',0x3e298c4,63,'c3f4b119d50cc6b87cbe884670d1a7a57b83769b29312cc0f6f6bbd118df3f31'),
    ('exact_fixed_id',0x3e29a03,50,'5856b674cf56beb3e97e7de0450b441bcef36138004ca6f9213bb4f044aeeb55'),
    ('any_type_equality',0x3e299b1,82,'2206b0e6dacda00ec085996b6fada0ce35b7246575b85a7082a0c6e713309c5d'),
    ('explicit_list',0x3e29977,58,'40b032857d2bcbbccc36181b9f6fae826ea1a00f960a35f096e245149aef7ca7'),
    ('all_tags_call',0x3e29903,116,'ffe8a57c4ba05e880cabd5725ed865a0b1cf8d34c4bab835e38f81e36a0b7147'),
    ('all_tags_loop',0x4108b0d,67,'678740354617ae413951d8ef7aa14cb65cfefd83d02c77b12d7c8099c34bff71'),
    ('known_class_ingredient_gate_true',0x680390,3,'e18aacce29affcdddaa5f641ac1ec12552e0fe9d066e6408941b1792818b8619'),
)
def require(ok, why):
    if not ok: raise ValueError('DB01_MEAL_MATCH_' + why)
def sha(raw): return hashlib.sha256(raw).hexdigest()
def audit(dll, dump, proto):
    require(len(dll)==176820736 and sha(dll)==DLL,'DLL')
    require(len(dump)==89453137 and sha(dump)==DUMP,'DUMP')
    require(len(proto)==1335720 and sha(proto)==PROTO,'PROTO')
    for name,rva,count,digest in WINDOWS:
        # Exact verified PE layout: .text RVA=0x1000,file=0x400;
        # il2cpp RVA=0x67b000,file=0x679800.
        offset=rva-(0xc00 if rva<0x67b000 else 0x1800)
        require(sha(dll[offset:offset+count])==digest,name)
    text=dump.decode('utf8')
    for key in ('TotalIngredientsValue>b__142_0','TotalIngredientsValue>b__1',
                'get_OrderedIngredients>b__81_0','Enumerable.OrderBy<object, bool>',
                'List<object>.RemoveAt','public static bool HasAllTags(IHasTags',
                'public bool IsIngredientValid(ICookingIngredient cookingIngredient)'):
        require(key in text,'DECLARATION')
    entry=fields(fields(proto)[6][2])
    require(string(one(entry,1,2,True))=='Cooking','COOKING_KEY')
    env=fields(one(entry,2,2,True))
    require(string(one(env,5,2,True))=='Definitions.Activities.CookingData','COOKING_CLASS')
    raw=one(env,6,2,True)
    require(sha(raw)=='c7f88137699c319dbdcbf3d8a006b0db50399d48683143b5e75ac908365bc1c2','COOKING_BODY')
    stars=[(one(fields(v),1,0,True),one(fields(v),4,0,True)) for v in many(fields(raw),5,2)]
    require(stars==[(1,120),(2,130),(3,140),(4,150),(5,160)],'STAR_SETTINGS')
    return {'nativeSteam1262WindowsVerified':len(WINDOWS),'sellPercentages':stars,
            'fixedFirst':True,'consumeFirstMatchingSlot':True,'matchedOnlyAdjusted':True,
            'allTagsRequired':True,'negativeTagFallbackResolved':False,'runtimePriceVerified':False}
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    for name in ('dll','dump','protodb'): p.add_argument('--'+name,type=Path,required=True)
    a=p.parse_args()
    print(json.dumps(audit(a.dll.read_bytes(),a.dump.read_bytes(),a.protodb.read_bytes())))
