"""Extract reviewed numeric message trees from SHA-verified itemlist originals.
Preserve field presence, nested/repeated structure, zero and false. Only reviewed
GUID address and condition identity fields may contain strings; no raw source bytes in public output.
"""
import argparse,base64,collections,hashlib,json,math,re,sqlite3,struct,zlib
from pathlib import Path
from build_full_native_fields import fields, varint

REVIEWED={
 'GrowthPeriod':('ActivityItem','Duration'),
 'ProductionPeriod':('ActivityItem','Duration'),
 'VillageArea':('Furniture','OptionalField'),
 'RewardsXP':('Mission','MissionReward'),
 'Milestones':('DutyAch','RepeatedField<AchievementMilestone>'),
 'IntervalData':('RecurringEvent','RecurringEventIntervalData'),
 'Cooldowns':('RecurringEvent','RepeatedField<SnippetSpawningRecurringEventItemData.Types.CooldownData>'),
 'PossibleItems':('RecurringEvent','RepeatedField<WildCropsSpawningInVillageRecurringEventItemData.Types.ItemAndWeight>'),
 'ItemList':('RecurringEvent','ItemSpawningRecurringEventItemData.Types.ItemAndWeightList'),
 'DefaultItem':('ActivityItem','ItemInstance'),
}
GROUPS={
 'LootTable.Rewards':('LootTable','Rewards','LootTable'),
 'Mission.AdditionnalRewards':('Mission','AdditionnalRewards','LootTable'),
 'Character.DailySchedule':('Character','DailySchedule','RepeatedField<CharacterItemData.Types.DailyScheduleData>'),
 'Companion.DailySchedule':('Companion','DailySchedule','RepeatedField<CritterItemData.Types.DailyScheduleData>'),
 'Companion.FavoriteItem':('Companion','FavoriteItem','ItemSelector'),
 'Companion.LikeItem':('Companion','LikeItem','ItemSelector'),
 'Building.UpgradeInfo':('Building','UpgradeInfo','RepeatedField<UpgradeData>'),
 'Condition.Conditions':('Condition','Conditions','ConditionsList'),
 'Dialogue.Conditions':('Dialogue','Conditions','ConditionsList'),
 'ConditionalEvent.Conditions':('ConditionalEvent','Conditions','ConditionsList'),
 'Mission.AvailableConditions':('Mission','AvailableConditions','ConditionsList'),
 'Mission.UnlockConditions':('Mission','UnlockConditions','ConditionsList'),
 'RecurringEvent.Conditions':('RecurringEvent','Conditions','ConditionsList'),
 'DutyAch.AvailableWhen':('DutyAch','AvailableWhen','ConditionsList'),
 'Skin.AvailableWhen':('Skin','AvailableWhen','ConditionsList'),
 'ActivityData.Conditions':('ActivityData','Conditions','ConditionsList'),
 'Character.DisableSleepConditions':('Character','DisableSleepConditions','ConditionsList'),
 'Character.OverrideNameConditions':('Character','OverrideNameConditions','ConditionsList'),
 'Character.SwitcherUnlockConditions':('Character','SwitcherUnlockConditions','ConditionsList'),
 'Skin.Conditions':('Skin','Conditions','ConditionsList'),
 'Companion.AppearanceConditions':('Companion','AppearanceConditions','ConditionsList'),
 'MemoryShard.Conditions':('MemoryShard','Conditions','ConditionsList'),
 'Scene.CharacterPresenceConditions':('Scene','CharacterPresenceConditions','ConditionsList'),
 'Story.UnlockConditions':('Story','UnlockConditions','ConditionsList'),
 'Story.VisibilityConditions':('Story','VisibilityConditions','ConditionsList'),
 'Furniture.AvailableWhen':('Furniture','AvailableWhen','ConditionsList'),
 'Companion.VisibilityConditions':('Companion','VisibilityConditions','ConditionsList'),
 'DutyAch.DescriptionCompletedWhen':('DutyAch','DescriptionCompletedWhen','ConditionsList'),
 'DutyAch.DescriptionSucceedWhen':('DutyAch','DescriptionSucceedWhen','ConditionsList'),
 'Skin.CannotRemoveWhen':('Skin','CannotRemoveWhen','ConditionsList'),
 'Character.CanHangoutConditions':('Character','CanHangoutConditions','ConditionsList'),
 'Profession.AvailableConditions':('Profession','AvailableConditions','ConditionsList'),
 'Character.BlockApplyingSkinWhen':('Character','BlockApplyingSkinWhen','ConditionsList'),
 'Character.RemoveSkinWhen':('Character','RemoveSkinWhen','ConditionsList'),
 'Character.UnassignCrewMemberConditions':('Character','UnassignCrewMemberConditions','ConditionsList'),
 'Tag.ConditionsOrHaveIngredients':('Tag','ConditionsOrHaveIngredients','ConditionsList'),
 'Upgrade.AvailableConditions':('Upgrade','AvailableConditions','ConditionsList'),
}
GUID_PATHS={'UpgradeInfo.PrefabAddress','UpgradeInfo.Store.InteriorPrefabAddress','UpgradeInfo.UpgradeDialogueAddress'}
CONDITION_UUIDS={'KeyholeStatus.Keyhole','KeyholeItemStatus.Keyhole','LeverStatus.Lever','Timestamp.Timestamp'}
CONDITION_KEYS={'EventTime.Event','Weather.Weather','Expansion.ExpansionName','EventTimeSegment.Event','EventTimeSegment.Segment','FloatingFestivalTime.Event','FloatingFestivalPuzzleTime.Event','FloatingFestivalPuzzleCompleted.Event','MinigameInProgress.Minigame'}
def reviewed_string(label,typ,path,x):
 if label=='Building.UpgradeInfo':
  return path in GUID_PATHS and re.fullmatch(r'guid:[0-9a-f]{32}',x)
 if typ=='ConditionsList':
  suffix='.'.join(path.split('.')[-2:])
  return (suffix in CONDITION_UUIDS and re.fullmatch(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}',x)) or (suffix in CONDITION_KEYS and re.fullmatch(r'[A-Za-z][A-Za-z0-9_]{0,63}',x))
 return False
def require(ok,msg):
 if not ok:raise ValueError(msg)
def raw_field(raw,num,wire):
 a=list(fields(raw));require(len(a)==1 and a[0][:2]==(num,wire),'field envelope');return a[0][2]
def scalar(typ,wire,v):
 if typ=='bool':require(wire==0 and v in (0,1),'bool');return bool(v)
 if wire==0:
  bits=64 if typ in ('long','ulong') else 32
  if typ not in ('uint','ulong') and v>=2**64-2**(bits-1):v-=2**64
  require(type(v) is int and abs(v)<2**53 and (typ in ('long','ulong') or -2**31<=v<=2**32-1),'range');return v
 require((typ,wire) in (('float',5),('double',1)),'scalar wire');x=struct.unpack('<f' if wire==5 else '<d',v)[0];require(math.isfinite(x),'float');return x

def build(dbpath,root,selected=None):
 with sqlite3.connect(Path(dbpath).resolve().as_uri()+'?mode=ro',uri=True) as db:
  m=json.loads(db.execute("select value from metadata where key='manifest'").fetchone()[0]);require(m['schema']=='wand.db01.native-fields.private@1' and m['platform']=='Steam','manifest');out={}
  originals={}
  reviews=[(label,*GROUPS[label]) for label in selected] if selected is not None else [(key,category,key,typ) for key,(category,typ) in REVIEWED.items()]
  for label,category,key,typ in reviews:
   if category not in originals:
    b=(root/(category+'.json')).read_bytes();shas={r[0] for r in db.execute('select distinct source_sha256 from item where category=?',(category,))};require(shas=={hashlib.sha256(b).hexdigest()},'original SHA');originals[category]=b
   b=originals[category];data=[];occurrences=0;leaves=0
   for i,off,frame in db.execute('select item_id,source_payload_offset,frame from item where category=? and item_id in (select item_id from field where field_key=? and declared_type=?) order by item_id',(category,key,typ)):
    require(b[off:off+len(frame)]==frame,'original frame');nodes={};children=collections.defaultdict(list)
    for path,num,wire,t,status,v,raw in db.execute("select path,field_number,wire,declared_type,status,value_json,raw from field where item_id=? and (field_key=? or field_key like ?) order by path",(i,key,key+'.%')):
     if '.' not in path:require(t==typ,'root declaration')
     name,j=re.fullmatch(r'([A-Za-z_][A-Za-z0-9_]*)\[(\d+)\]',path.rsplit('.',1)[-1]).groups();parent=path.rsplit('.',1)[0] if '.' in path else '';nodes[path]=(name,int(j),num,wire,t,status,v,raw);children[parent].append(path)
    def group(parent,payload,root=False):
     paths=children[parent];actual=[x[3] for x in fields(payload)]
     if root:actual=[r for r in actual if list(fields(r))[0][0]==nodes[paths[0]][2]]
     require(collections.Counter(actual)==collections.Counter(nodes[p][-1] for p in paths),'child bytes mismatch')
     result={};grouped=collections.defaultdict(list)
     for p in paths:grouped[nodes[p][0]].append(p)
     for name,ps in grouped.items():
      ps.sort(key=lambda p:nodes[p][1]);require([nodes[p][1] for p in ps]==list(range(len(ps))),'occurrence order');ts={nodes[p][4] for p in ps};require(len(ts)==1,'type collision');t=ts.pop();rep=t.startswith('RepeatedField<');parts=[]
      number=nodes[ps[0]][2]
      require([r for r in actual if list(fields(r))[0][0]==number]==[nodes[p][-1] for p in ps],'wire occurrence order')
      for p in ps:
       _,_,num,wire,_,status,v,raw=nodes[p];wirevalue=raw_field(raw,num,wire)
       if status=='declared_message':require(wire==2,'message wire');parts.append(group(p,wirevalue))
       elif status=='varint_wire_value':
        require(wire==0 and (str(wirevalue) if wirevalue>2**53-1 else wirevalue)==json.loads(v),'varint mismatch')
        parts.append(scalar(t[14:-1] if rep else t,wire,wirevalue))
       elif status=='declared_float':
        value=scalar(t[14:-1] if rep else t,wire,wirevalue);require(value==json.loads(v),'scalar mismatch');parts.append(value)
       elif status=='packed_varint_wire_values':
        require(rep and wire==2,'packed type');xs=[];pos=0
        while pos<len(wirevalue):x,pos=varint(wirevalue,pos);xs.append(x)
        require([str(x) if x>2**53-1 else x for x in xs]==json.loads(v),'packed mismatch')
        parts.extend(scalar(t[14:-1],0,x) for x in xs)
       elif status=='declared_utf8':
        normalized=re.sub(r'\[\d+\]','',p)
        require(wire==2 and t=='string','unreviewed string')
        x=wirevalue.decode('utf8');require(x==json.loads(v) and reviewed_string(label,typ,normalized,x),'unreviewed identity');parts.append(x)
       else:raise ValueError('unreviewed status '+status+' '+p)
      require(rep or len(parts)==1,'singular repetition');result[name]=parts if rep else parts[0]
     return result
    value=group('',frame,True)[key];data.append([i,value]);occurrences+=len(children['']);leaves+=sum(len(json.loads(n[6])) if n[5]=='packed_varint_wire_values' else n[5]!='declared_message' for n in nodes.values())
   if not data:continue
   prev=0;rows=[]
   for i,v in data:rows.append([i-prev,v]);prev=i
   packed=base64.b64encode(zlib.compress(json.dumps(rows,separators=(',',':'),sort_keys=True).encode(),9)).decode()
   out[label]={'category':category,**({'field':key} if selected is not None else {}),'declaredType':typ,'count':len(rows),'occurrences':occurrences,'leafCount':leaves,'packed':packed}
  return {'schema':'wand.item-master.reviewed-message-groups@1' if selected is not None else 'wand.item-master.reviewed-messages@1','gameVersion':m['gameVersion'],'sourceItemsSha256':m['sourceItemsSha256'],'sourceIl2cppDumpSha256':m['sourceIl2cppDumpSha256'],'fields':out}
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--database',type=Path,required=True);p.add_argument('--input',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--fields',nargs='+',choices=GROUPS);a=p.parse_args();d=build(a.database,a.input,a.fields);b=(json.dumps(d,separators=(',',':'))+'\n').encode();a.output.write_bytes(b);print(hashlib.sha256(b).hexdigest(),len(b))
