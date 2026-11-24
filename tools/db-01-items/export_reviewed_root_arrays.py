"""Export reviewed numeric root arrays from the private source DB; no raw/string data."""
import argparse, base64, collections, hashlib, json, re, sqlite3, zlib
from pathlib import Path

# (owner category, declared repeated element type). Values remain native codes,
# not inferred runtime meanings. Unknown fields are not automatically public.
REVIEWED={
 'Areas':('RecurringEvent','VillageAreaType'),
 'AreasToConsider':('RecurringEvent','VillageAreaType'),
 'AssignablePets':('Character','int'),
 'BoardGameFigurineItemIDs':('Character','int'),
 'Duties':('DutyAch','int'),
 'ForbiddenProfessions':('Character','int'),
 'ForcedAvailableScheduleTypes':('Character','ScheduleType'),
 'HangoutPreferredActivities':('Profession','HangoutActivityType'),
 'IncompatibleWith':('Clothing','ClothingItemType'),
 'ItemsToCheck':('RecurringEvent','int'),
 'ItemsToDeleteAfterMission':('Mission','int'),
 'Locations':('ActivityData','VillageAreaType'),
 'NecessaryCharactersInVillage':('Dialogue','int'),
 'OtherItemsIDs':('Skin','int'),
 'PossibleFlowers':('RecurringEvent','int'),
 'PreferredItemDifficulties':('Character','PreferredItemDifficulty'),
 'SignatureItems':('Character','int'),
 'SlotLootTableItemID':('Building','int'),
 'Slots':('Preference','int'),
 'StallEmployeeItemsIDs':('Skin','int'),
 'StallItemsIDs':('Skin','int'),
 'VillageAreas':('ActivityItem','VillageAreaType'),
}
def require(ok,message):
 if not ok: raise ValueError(message)
def varint(buf,p):
 v=0
 for shift in range(0,70,7):
  require(p<len(buf),'truncated varint');b=buf[p];p+=1;v|=(b&127)<<shift
  if b<128:
   require(v<2**64,'overflow');return v,p
 raise ValueError('oversized varint')
def packed_values(raw,number):
 tag,p=varint(raw,0);size,p=varint(raw,p)
 require(tag==(number<<3|2) and p+size==len(raw),'packed field envelope')
 values=[]
 while p<len(raw):
  v,p=varint(raw,p);require(v<=2**31-1,'unreviewed signed or oversized integer');values.append(v)
 return values
def build(path):
 with sqlite3.connect(Path(path).resolve().as_uri()+'?mode=ro',uri=True) as db:
  m=json.loads(db.execute("SELECT value FROM metadata WHERE key='manifest'").fetchone()[0]);require(m['schema']=='wand.db01.native-fields.private@1' and m['platform']=='Steam','source identity')
  result={}
  for name,(category,element) in REVIEWED.items():
   values=collections.defaultdict(list);positions={}
   for i,cat,typ,p,status,num,value,raw,frame in db.execute('''SELECT item_id,category,declared_type,path,status,field_number,value_json,raw,frame FROM field JOIN item USING(item_id) WHERE field_key=? AND instr(path,'.')=0 AND category=? AND declared_type=? ORDER BY item_id,path''',(name,category,'RepeatedField<'+element+'>')):
    require(cat==category and typ=='RepeatedField<'+element+'>' and status=='packed_varint_wire_values','unexpected declaration '+name)
    match=re.fullmatch(re.escape(name)+r'\[(\d+)\]',p);require(match is not None,'invalid path')
    require(int(match[1])==positions.get(i,0),'unexpected repeated occurrence');positions[i]=int(match[1])+1
    parsed=packed_values(raw,num);require(parsed==json.loads(value) and raw in frame,'source mismatch '+name)
    values[i].extend(parsed)
   if not values:continue
   base=min(v for a in values.values() for v in a);prev=0;rows=[]
   for i,a in sorted(values.items()):
    require(i>prev and a,'empty array or invalid ID');rows.append([i-prev,*[v-base for v in a]]);prev=i
   packed=base64.b64encode(zlib.compress(json.dumps([base,rows],separators=(',',':')).encode(),9)).decode()
   result[name]={'category':category,'elementType':element,'count':len(rows),'valueCount':sum(map(len,values.values())),'packed':packed}
  return {'schema':'wand.item-master.reviewed-root-arrays@1','gameVersion':m['gameVersion'],'sourceItemsSha256':m['sourceItemsSha256'],'sourceIl2cppDumpSha256':m['sourceIl2cppDumpSha256'],'fields':result}
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--database',required=True,type=Path);p.add_argument('--output',required=True,type=Path);a=p.parse_args();d=build(a.database);b=(json.dumps(d,separators=(',',':'))+'\n').encode();a.output.write_bytes(b);print(hashlib.sha256(b).hexdigest(),len(d['fields']),sum(x['count'] for x in d['fields'].values()),sum(x['valueCount'] for x in d['fields'].values()),len(b))
