"""Offline source root scalar export; exact byte verification, no raw bytes in output."""
import argparse,base64,collections,hashlib,json,math,re,sqlite3,struct,zlib
from pathlib import Path
from build_full_native_fields import fields,varint
SCALAR_STATUSES={'varint_wire_value','declared_float','packed_varint_wire_values','declared_utf8'}
# Reviewed game-defined root identifiers, localization keys, GUIDs, paths and inert formulae.
STRING_FIELDS=set('DisplayName IconAddress PrefabAddress DialogueAssetAddress UpdateVersion Description MaleIconAddress MalePrefabAddress AvailableDescription Weathers ImageAddress MaskDataAddress CompletedStoryDescription StartRequestButton IntroDialogue Title MaterialAddress UnlockDialogueAddress CollectionName TimeOfDay DefaultGridLayoutTypeName DefaultGridLayoutPath AlternativeIconAddress PerksPreset AvatarIconAddress DescriptionText SceneName CameraConfig SaplingPrefabAddress HarvestPrefabAddress BoardGameAIConfig HtmlColor RewardAnimationPrefabAddress MaleMakeupAddress FemaleMakeupAddress DefaultSkinIconAddress ShopData MinigameData SpecialMiningRockMaterialAddress LockedPrefabAddress PuzzleTemplateAddress BlurredIconAddress Category ExcludedItemSets Equation PluralDisplayName BurningStateVFXPrefabAddress PremadeDecorationPresetsPath EditCameraConfig SprintVfx SignatureOverrideIcon MaleGownClipAddress MaleClipAddress FemaleGownClipAddress FemaleClipAddress SpriteSquareAddress SpritePortraitAddress SpriteLandscapeAddress IncludedItemSets SpriteAddress MachineIconAddress EvolvingDescription TimeOfDays DescriptionUnlocked DescriptionLocked ComplexitySettings SpecificTo ExclusivePhotoPoses PortraitAddress ObjectType DescriptionSucceed DescriptionNarrative DescriptionCompleted EventName AccessoryPrefabAddress ExcludedLanguages CostTable'.split())
TEXT=re.compile(r"[A-Za-z0-9_./!:#, \\+*(){}\[\]^%<>=?&|\-'\u00a0\u00c0-\u024f]{1,512}")
def require(ok,msg):
 if not ok:raise ValueError(msg)
def raw_json(v):return str(v) if v>2**53-1 else v
def integer(v,t):
 if t=='bool':require(v in (0,1),'bool');return bool(v)
 if t=='uint':require(0<=v<=0xffffffff,'uint');return v
 if t=='ulong':require(v<2**53,'ulong');return v
 if t=='long':v=v-(1<<64) if v>=1<<63 else v;require(abs(v)<2**53,'long');return v
 # int32 and enum have the same protobuf sign interpretation.
 require(v<=0xffffffff or v>=2**64-2**31,'int32 wire');v=v&0xffffffff;return v-(1<<32) if v>=1<<31 else v

def build(dbpath,root):
 with sqlite3.connect(Path(dbpath).resolve().as_uri()+'?mode=ro',uri=True) as db:
  m=json.loads(db.execute("select value from metadata where key='manifest'").fetchone()[0]);require(m['schema']=='wand.db01.native-fields.private@1' and m['platform']=='Steam','manifest');require(hashlib.sha256((root/'dump.cs').read_bytes()).hexdigest()==m['sourceIl2cppDumpSha256'],'dump digest')
  groups=collections.defaultdict(list);counts=collections.Counter();originals={}
  for cat,sha in db.execute('select distinct category,source_sha256 from item'):
   b=(root/(cat+'.json')).read_bytes();require(hashlib.sha256(b).hexdigest()==sha,'original digest '+cat);originals[cat]=b
  cursor=db.execute("select item_id,category,native_name,source_payload_offset,frame from item order by item_id")
  for i,cat,native,off,frame in cursor:
   require(originals[cat][off:off+len(frame)]==frame,'original frame');actual=collections.defaultdict(list)
   for n,w,v,raw in fields(frame):actual[n].append(raw)
   bykey=collections.defaultdict(list)
   for path,key,num,wire,t,status,v,raw in db.execute("select path,field_key,field_number,wire,declared_type,status,value_json,raw from field where item_id=? and instr(path,'.')=0",(i,)):
    if status in SCALAR_STATUSES:bykey[key].append((int(path.rsplit('[',1)[1][:-1]),num,wire,t,status,v,raw))
   for key,entries in bykey.items():
    entries.sort();num=entries[0][1];t=entries[0][3];require([a[0] for a in entries]==list(range(len(entries))) and all(a[1]==num and a[3]==t for a in entries) and actual[num]==[a[-1] for a in entries],'field occurrence '+str(i)+' '+key)
    repeated=t.startswith('RepeatedField<');inner=t[14:-1] if repeated else t;parts=[]
    for j,n,w,_,status,v,raw in entries:
     a=list(fields(raw));require(len(a)==1 and a[0][:2]==(n,w),'envelope');x=a[0][2];stored=json.loads(v)
     if status=='varint_wire_value':require(w==0 and (bool(x) if inner=='bool' else raw_json(x))==stored,'varint mismatch');parts.append(integer(x,inner))
     elif status=='declared_float':require((inner,w) in [('float',5),('double',1)],'float type');y=struct.unpack('<f' if w==5 else '<d',x)[0];require(math.isfinite(y) and y==stored,'float mismatch');parts.append(y)
     elif status=='packed_varint_wire_values':
      require(repeated and w==2,'packed type');p=0;xs=[]
      while p<len(x):y,p=varint(x,p);xs.append(y)
      require([raw_json(y) for y in xs]==stored,'packed mismatch');parts.extend(integer(y,inner) for y in xs)
     else:
      require(w==2 and inner=='string','string type');y=x.decode('utf8');require(y==stored,'string mismatch');require(key=='Name' or key in STRING_FIELDS and TEXT.fullmatch(y),'unreviewed string '+key);parts.append(y)
    require(repeated or len(parts)==1,'singular');value=parts if repeated else parts[0]
    counts['allOccurrences']+=len(entries)
    if key in ('ID','Name'):
     require(value==(i if key=='ID' else native),'identity mismatch');counts['identityOccurrences']+=len(entries);continue
    groups[(cat,key,t)].append((i,value,len(entries)));counts['fieldPairs']+=1;counts['occurrences']+=len(entries);counts['leaves']+=len(parts)
  output={}
  for (cat,key,t),rows in sorted(groups.items()):
   prev=0;data=[];occ=0;leaves=0
   for i,v,n in rows:data.append([i-prev,v]);prev=i;occ+=n;leaves+=len(v) if isinstance(v,list) else 1
   packed=base64.b64encode(zlib.compress(json.dumps(data,separators=(',',':'),ensure_ascii=True,allow_nan=False).encode(),9)).decode()
   output[cat+'.'+key+'@'+t]={'category':cat,'field':key,'declaredType':t,'count':len(rows),'occurrences':occ,'leafCount':leaves,'packed':packed}
  require(counts['allOccurrences']==db.execute("select count(*) from field where instr(path,'.')=0 and status in ('varint_wire_value','declared_float','packed_varint_wire_values','declared_utf8')").fetchone()[0],'census')
  return {'schema':'wand.item-master.reviewed-root-scalars@1','gameVersion':m['gameVersion'],'sourceItemsSha256':m['sourceItemsSha256'],'sourceIl2cppDumpSha256':m['sourceIl2cppDumpSha256']},output,counts

def main():
 p=argparse.ArgumentParser();p.add_argument('--database',type=Path,required=True);p.add_argument('--input',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args();header,groups,counts=build(a.database,a.input);a.output.mkdir(parents=True,exist_ok=True)
 # Split deterministically at group boundaries. Large groups are retained intact.
 parts=[];current={};size=0
 for label,group in groups.items():
  n=len(json.dumps({label:group},separators=(',',':')))
  if current and size+n>250000:parts.append(current);current={};size=0
  current[label]=group;size+=n
 if current:parts.append(current)
 manifest=[]
 for i,g in enumerate(parts):
  b=(json.dumps({**header,'fields':g},separators=(',',':'))+'\n').encode();path=a.output/f'reviewed-root-scalars-steam-{header["gameVersion"]}.part{i}.json';path.write_bytes(b);h=hashlib.sha256(b).hexdigest();manifest.append(h);print(path.name,len(b),h,hashlib.sha1(f'blob {len(b)}\0'.encode()+b).hexdigest())
  path.with_suffix('.txt').write_text('\n'.join('DB01:'+b[:-1][j:j+800].decode() for j in range(0,len(b)-1,800))+'\n')
 print('groups',len(groups),'counts',dict(counts));print('digests',json.dumps(manifest))
if __name__=='__main__':main()
