"""Compile a unified, sanitized ItemID master from every current itemlist class.
Run offline against owner originals and existing audited ZIPs; do not publish originals.
The projection is definition-complete, not a proof of runtime collectibility or of
complete interpretation of nested protobuf fields. Every source frame is indexed.
"""
import argparse, collections, gzip, hashlib, json, re, struct, zipfile
from pathlib import Path

LOCALES=('en','fr','it','de','es-ES','ja','zh-CN','pt-BR')
FILES={'catalog':'db01-steam-v1262-full-catalog-typescript-v2-private.zip','types':'db01-steam-v1262-il2cpp-item-types-private.zip','tags':'db01-steam-v1262-source-tags-v2-private.zip','direct':'db01-steam-v1262-collection-menu-direct-private.zip','universe':'db01-steam-v1262-collection-universe-predicates-private.zip','special':'db01-steam-v1262-collection-special-predicates-private.zip','activity':'db01-steam-v1262-collection-activity-crafting-private.zip'}
# Map native ItemType/subtype names to original IL2CPP declarations. The
# selected declaration is explicit evidence for scalar wire interpretation;
# this is not a reverse-engineered runtime deserializer dispatch table.
CLASSES={
 'ActivityItem':{0:'ActivityItemData',2:'CropItemData',3:'MealItemData',4:'SeedItemData',8:'FlowerItemData',10:'FishItemData',11:'IngredientItemData',12:'RequestItemData',13:'EphemeralItemData',14:'LootPresentItemData',15:'ConsummableItemData',16:'MineralItemData',17:'ActivityItemData',18:'BuffElixirItemData',19:'ManualItemData'},
 'Furniture':{0:'FurnitureItemData',1:'FenceAndRoadItemData',2:'LandscapingItemData',3:'FurnitureItemData',5:'FurnitureRequestItemData',6:'FurnitureBlockerItemData',7:'FenceAndRoadItemData',8:'FurnitureAncientMachineItemData',9:'FurnitureSnippetTrapItemData'},
 'Clothing':'ClothingItemData','Trimming':'TrimmingItemData','Makeup':'MakeupItemData','Character':'CharacterItemData','MemoryShard':'MemoryShardItemData','BoardGame':'FigurineItemData','Tool':'ToolItemData','MountGear':'MountGearItemData','PhotoMode':'PhotoFrameItemData','Story':'StoryItemData','Set':'SetItemData','CollectionSet':'CollectionSetItemData','TouchOfMagic':{0:'DecalItemData',1:'TextureItemData'},'Companion':{0:'PetItemData',1:'CritterItemData',2:'SnippetItemData',3:'MountItemData'},'Skin':{0:'CharacterSkinItemData',1:'StallSkinItemData',2:'BuildingOtherSkinItemData',3:'SceneAssetsSkinItemData',4:'MountSkinItemData',5:'BoatSkinItemData',6:'HouseSkinItemData'},'AvatarFeature':{0:'EyeballItemData',1:'SprintEffectItemData',2:'AvatarEmotePoseItemData'},'ActivityData':{0:'RecipeItemData',1:'FishingDataItemData',2:'MiningDataItemData',3:'CraftingRecipeItemData',4:'TimeBendingDataItemData',5:'PremadeDecorationPresetItemData'},'Building':{0:'BuildingItemData',1:'StallBuildingItemData',2:'GardenItemData',3:'BuildingItemData',4:'OffGridBuildingItemData',5:'BuildingItemData'},'Tag':{3:'FurnitureFunctionTagItemData',5:'UniverseTagItemData',11:'CraftingRecipeTypeTagItemData',14:'CookingIngredientTypeTagItemData',15:'MealTypeTagItemData',23:'PetGroupTagItemData'},'Upgrade':{0:'UpgradeBackpackItemData',1:'UpgradeToolItemData',2:'UpgradeHourglassItemData',3:'UpgradeMountItemData'},'Currency':{0:'SoftCurrencyItemData',1:'HardCurrencyItemData',8:'StoreFrontSpecificCurrencyItemData'},'Profession':{0:'ProfessionItemData',1:'PetProfessionItemData'},'PointOfInterest':'PointOfInterestItemData','Scene':'SceneItemData','Environment':'EnvironmentItemData','CollectionSet':'CollectionSetItemData','DutyAch':{0:'RoyalDutyItemData',1:'AchievementItemData',2:'TrialItemData',3:'TrialDutyItemData'},'Mission':{0:'MissionItemData',2:'MissionQuestItemData'},'Condition':'ConditionItemData','ConditionalEvent':'ConditionalEventItemData','LootTable':'LootTableItemData','Ftue':'FtueItemData','Display':'DisplayItemData','Preference':{0:'PreferenceProfileItemData',1:'PreferencePoolItemData'},'Formula':{0:'PriceFormulaItemData',1:'MissionStepFormulaItemData',2:'SellPriceFormulaItemData',3:'ProfessionStatFormulaItemData'},'Dialogue':{0:'DialogueItemData',1:'DialogueItemData',2:'DialogueItemData',3:'NpcDiscussionItemData',4:'DialogueItemData',5:'DialogueFlagItemData',6:'HangoutDialogueItemData',7:'BoardGameDialogueItemData',8:'PetAssignmentDialogueItemData'},'RecurringEvent':{0:'ItemSpawningRecurringEventItemData',2:'FishSpawningInVillageRecurringEventItemData',4:'WildCropsSpawningInVillageRecurringEventItemData',5:'FlowerSpawningInVillageRecurringEventItemData',6:'FlowerDryingInVillageRecurringEventItemData',7:'ChooseVillageAreaRecurringEventItemData',8:'MiningRockTurningSpecialRecurringEventItemData',9:'PendingFishUpgradeRecurringEventItemData',10:'TimeLostTreasureSpawningRecurringEventItemData',11:'ChooseItemRecurringEventItemData',12:'MakeCharacterEagerRecurringEventItemData',13:'SnippetSpawningRecurringEventItemData'}
}
# Only extract scalar semantics for explicitly recognized classes from the original
# declaration. Other values remain indexed by wire field number, not guessed.
ARTWORK_FIELDS=('IconAddress','PrefabAddress','ImageAddress','MaskDataAddress','BlurredIconAddress','AlternativeIconAddress')
# These native scalar types and names have direct protobuf semantics. Missing
# fields are not filled with guesses or taken as proof of runtime availability.
PROPERTY_NAMES={'SetItemID','UniverseTagItemID','IsHidden','IsNotable','IsMissionItem','IsUnavailableForGenerator','IsSyncOnlineItem','OnlineCategory','SortPriority','RecipeType','AllowColoring','Difficulty','IsLocked','IsBuyable','IsSellable','IsPurchasable','CanBeDropped','CanBeSold','Price','SellPrice','BuyPrice','Energy','EnergyReward','MaxStack','MaxStackSize','ItemSize','Weight','Rarity','CookingIngredientType','MealType','StarRating','Level','UnlockLevel','IsDefault','IsDefaultOwned','IsAvailableInShop','IsGiftable','IsUnavailable','ItemID','CharacterItemID','BuildingItemID','BaseItemID','SkinItemID','RequiredItemID','CurrencyItemID','NumberOfShards','MemoryShardTagItemID','ConsummableOverrideItemID','BypassRealmUnlock'}
GUID=re.compile(rb'guid:([0-9a-f]{32})\Z')

def check(ok,code):
 if not ok:raise ValueError('SOURCE_MASTER_'+str(code))
def digest(b):return hashlib.sha256(b).hexdigest()
def varint(b,p):
 v=0
 for i in range(10):
  check(p<len(b),'TRUNCATED_VARINT');x=b[p];p+=1;v|=(x&127)<<(7*i)
  check(i<9 or x<=1,'VARINT_OVERFLOW')
  if x<128:return v,p
 raise ValueError('VARINT')
def fields(b):
 p=0;out=[]
 while p<len(b):
  tag,p=varint(b,p);n,w=tag>>3,tag&7;check(n>0 and w in (0,1,2,5),'WIRE')
  if w==0:v,p=varint(b,p)
  else:
   if w==2:k,p=varint(b,p)
   else:k=8 if w==1 else 4
   check(k<=len(b)-p,'TRUNCATED_VALUE');v=b[p:p+k];p+=k
  out.append((n,w,v))
 return out
def frames(b):
 p=0;seen=set()
 while p<len(b):
  off,p=varint(b,p);n,p=varint(b,p);check(n>0 and n<=len(b)-p and off not in seen,'FRAME');seen.add(off);yield p,n,fields(b[p:p+n]);p+=n

def vals(row,n,w):return [v for f,t,v in row if f==n and t==w]
def scalar(row,n,w,default=None):
 a=vals(row,n,w);check(len(a)<=1,'DUPLICATE_FIELD_'+str(n));return a[0] if a else default

def zipdata(root,key):
 z=zipfile.ZipFile(root/FILES[key]);m=json.loads(z.read('manifest.json'))
 for n,x in m['files'].items():
  b=z.read(n);check(len(b)==x['bytes'] and digest(b)==x['sha256'],'ARCHIVE_SHARD_'+key+'_'+n)
 return z,m

def ids(z):
 out={}
 for n in z.namelist():
  if re.fullmatch(r'id/[0-9a-f]{2}\.json',n):
   for r in json.loads(z.read(n)):
    i=r['itemId'];check(i not in out and i&255==int(n[3:5],16),'ID_SHARD');out[i]=r
 return out

def schemas(dump):
 result={};enum_names=set(re.findall(r'(?m)^public enum (\w+) // TypeDefIndex:',dump))
 needed={c for v in CLASSES.values() for c in ([v] if isinstance(v,str) else v.values())}|{'TagItemData'}
 matches=collections.defaultdict(list)
 for m in re.finditer(r'(?m)^public sealed class (\w+)\s*:[^\n]*\n\{',dump):
  if m[1] in needed:matches[m[1]].append(m)
 for name in sorted(needed):
  ms=matches[name];check(len(ms)==1,'CLASS_'+name)
  m=ms[0];end=dump.find('\n}',m.end());body=dump[m.end():end]
  ff={k:int(v) for k,v in re.findall(r'public const int (\w+)FieldNumber = (\d+);',body)}
  check(ff.get('ID')==1 and ff.get('Name')==2,'CLASS_IDENTITY_'+name)
  p=body.split('// Methods',1)[0];pp={k:t for t,k in re.findall(r'(?m)^\s*public ([\w.]+) (\w+) \{ get; set; \}',p)}
  result[name]=(ff,pp,enum_names)
 return result

def item_class(cat,sub):
 v=CLASSES.get(cat);return v if isinstance(v,str) else (v or {}).get(sub, 'TagItemData' if cat=='Tag' else None)
def typed_value(value,wire,typ,enums):
 if typ=='bool' and wire==0 and value in (0,1):return bool(value)
 if typ in ('int','uint','long','ulong') or typ in enums:
  if wire!=0:return None
  if typ=='int' or typ in enums:
   value=value&0xffffffff;return value-0x100000000 if value>=0x80000000 else value
  if typ=='long' and value>=1<<63:value-=1<<64
  return value if -(1<<53)<value<(1<<53) else None
 if typ=='float' and wire==5:return struct.unpack('<f',value)[0]
 if typ=='double' and wire==1:return struct.unpack('<d',value)[0]
 return None

def build(root):
 zs={};ms={}
 for k in FILES:zs[k],ms[k]=zipdata(root,k)
 cm=ms['catalog'];check(cm['fullCorpusParsed'] and cm['sourceFilesVerified']==cm['sourceFilesTotal'],'INCOMPLETE_CATALOG')
 for k,m in ms.items():check((m['platform'],m['gameVersion'],m['sourceItemsSha256'])==(cm['platform'],cm['gameVersion'],cm['sourceItemsSha256']),'SOURCE_VERSION_'+k)
 dump=(root/'dump.cs').read_bytes();dump_hash=digest(dump);check(dump_hash==ms['types']['sourceIl2cppDumpSha256'],'DUMP_SHA');sch=schemas(dump.decode('utf8'))
 cat,typ,tags=map(lambda k:ids(zs[k]),('catalog','types','tags'));check(set(cat)==set(typ)==set(tags) and len(cat)==cm['definitions'],'CENSUS')
 basez=zipfile.ZipFile(root/'wand-item-master-steam-1.26.2.zip');bi=json.loads(basez.read('index.json'));base={}
 for n,m in bi['shards'].items():
  b=basez.read(n);check(digest(b)==m['sha256'] and len(b)==m['bytes'],'BASE_DIGEST');base.update((r['itemId'],r) for r in json.loads(b)['items'])
 ext=json.loads((root/'item-master-collectible-extension-1.26.2.json').read_bytes());check(ext['sourceItemsSha256']==cm['sourceItemsSha256'] and ext['baseCount']==len(base),'EXTENSION_IDENTITY');old={**base,**{r['itemId']:r for r in ext['items']}}
 # Reuse all verified original Collection selectors, not a UI crosswalk.
 menus=json.loads(zs['direct'].read('menus.json'));menu_by_id={r['setId']:r for r in menus}
 positive=collections.defaultdict(list);negative=collections.defaultdict(list);ledger=[]
 for r in json.loads(zs['direct'].read('direct-items.json')):
  for p in r['memberships']:positive[r['itemId']].append({'setId':p['setId'],'groupIndex':p['groupIndex'],'submenuCode':p['submenuCode'],'evidence':p['evidence']})
 for k in ('universe','special','activity'):
  for sel in json.loads(zs[k].read('selectors.json')):
   # Keep selector's native criterion and polarity, not private manifest flags.
   ledger.append({'sourceFamily':k,**{a:b for a,b in sel.items() if a not in ('gameRuntimeMembershipVerified','gameUiMembershipVerified','worldAvailabilityVerified','dlcOwnershipVerified')}})
  for i,row in ids(zs[k]).items():
   check(i in cat,'PREDICATE_TARGET')
   if k=='activity':
    for field,target in [('positive',positive),('negative',negative)]:
     for p in row[field]:
      si=p['collectionSetId'];q={'setId':si,'groupIndex':p['groupIndex'],'submenuCode':menu_by_id[si]['submenuCode'],'selectorIndex':p['selectorIndex'],'criterion':p['criterion'],'criterionName':p.get('criterionName'),'sourceRecipeItemId':p.get('sourceRecipeItemId'),'sourceRule':p['sourceRule'],'sourceField':p.get('sourceField'),'evidence':p['evidence']}
      target[i].append(q)
   elif k=='universe':
    for p in row['memberships']:
     si=p['setId'];positive[i].append({'setId':si,'groupIndex':p['groupIndex'],'submenuCode':menu_by_id[si]['submenuCode'],'universeTagId':p['universeTagId'],'universeTagKey':p['universeTagKey'],'sourceSetItemId':p['sourceSetItemId'],'sourceRule':p['rule'],'evidence':'original_set_universe_predicate'})
   else:
    for p in row['memberships']:
     si=p['setId'];q={'setId':si,'groupIndex':p['groupIndex'],'submenuCode':p['submenuCode'],'selectorIndex':p['selectorIndex'],'criterion':p['criterion'],'sourceField':p['originalField'],'sourceRule':p['family'],'evidence':p['evidence']}
     if p['tagKey'] is not None:
      q['tagKey']=p['tagKey']
      if p['originalField'] in ('Tags','UniverseTagItemID') and 2000500000<=p['criterion']<2000600000:q.update(universeTagId=p['criterion'],universeTagKey=p['tagKey'])
     positive[i].append(q)
 check(len(ledger)==ms['direct']['dynamicSelectorsUnresolved'],'SELECTOR_CENSUS')
 # Validate the exact 39 source files, preserving frame offsets and lengths for
 # unknown or non-scalar fields, and collect explicit exclusions + native facts.
 source_hashes=ms['tags']['sourceFilesSha256'];check(len(source_hashes)==cm['sourceFilesTotal']-1,'SOURCE_FILE_CENSUS')
 check((root/'ItemCondition.json').read_bytes()==b'','EMPTY_ITEM_CONDITION')
 source_hashes={**source_hashes,'ItemCondition':digest(b'')};raw_info={};fields_by_class={};source_frames_count=0;unresolved_classes=collections.Counter(); scalar_count=0;recipe_results=collections.defaultdict(list);ignored_sentinels=[];explicit_ignored=0
 for family,sha in sorted(source_hashes.items()):
  b=(root/(family+'.json')).read_bytes();check(digest(b)==sha,'ORIGINAL_SHA_'+family);family_ids={i for i,r in cat.items() if r['nativeCategory']==family};seen=set()
  for offset,length,wire in frames(b):
   i=scalar(wire,1,0);key=scalar(wire,2,2);check(i in family_ids and i not in seen and key.decode()==cat[i]['nativeKey'],'ORIGINAL_IDENTITY_'+family);seen.add(i);source_frames_count+=1
   t=typ[i];check(t['sourceSha256']==tags[i]['sourceSha256']==sha,'SOURCE_OVERLAY_SHA');cls=item_class(family,t['subtypeCode']);prop={};art={};set_id=None
   counts=collections.Counter((f,w) for f,w,_ in wire)
   if cls:
    ff,pp,enums=sch[cls];fields_by_class[cls]=ff
    for n in ARTWORK_FIELDS:
     if n not in ff:continue
     v=vals(wire,ff[n],2)
     if len(v)==1 and (m:=GUID.fullmatch(v[0])):art[n[0].lower()+n[1:].replace('Address','Guid')]=m[1].decode()
    # Only fields whose scalar declaration matches the actual wire are emitted.
    for n in sorted(PROPERTY_NAMES & ff.keys() & pp.keys()):
     v=[(w,x) for f,w,x in wire if f==ff[n]]
     if len(v)==1:
      value=typed_value(v[0][1],v[0][0],pp[n],enums)
      if value is not None and (not isinstance(value,float) or abs(value)<float('inf')):prop[n]=value;scalar_count+=1
    if 'SetItemID' in prop and prop['SetItemID'] in cat and cat[prop['SetItemID']]['nativeCategory']=='Set':set_id=prop['SetItemID']
   else:unresolved_classes[family]+=1
   # Keep the original exact positive/negative explicit list structure.
   if family=='CollectionSet':
    for group_index,g in enumerate(vals(wire,9,2)):
     for spec in vals(fields(g),1,2):
      f=fields(spec);ignore=scalar(f,1,0,0);check(ignore in (0,1),'EXPLICIT_IGNORE')
      if not ignore:continue
      listed=vals(f,2,0)
      for payload in vals(f,2,2):
       p=0
       while p<len(payload):v,p=varint(payload,p);listed.append(v)
      for target in listed:
       explicit_ignored+=1
       if target==0:ignored_sentinels.append([i,group_index]);continue
       check(target in cat,'EXCLUSION_TARGET');negative[target].append({'setId':i,'groupIndex':group_index,'submenuCode':menu_by_id[i]['submenuCode'],'evidence':'original_collectionset_explicit_ignore'})
   if family=='ActivityData' and t['subtypeName']=='CraftingRecipe':
    result=scalar(wire,6,2);target=scalar(fields(result),1,0);check(target in cat,'RECIPE_TARGET');recipe_results[target].append(i)
   raw_info[i]={'sourceClass':cls,'sourceFrame':[offset,length],'observedFields':[[f,w,n] for (f,w),n in sorted(counts.items())], 'nativeProperties':prop,'artwork':art,'setId':set_id}
  check(seen==family_ids,'ORIGINAL_FILE_CENSUS_'+family)
 check(source_frames_count==len(cat) and explicit_ignored==ms['direct']['ignoredExplicitListEntries'],'ORIGINAL_CENSUS')
 # Recover the negative special selector's exact per-ID source matches.
 for sel in ledger:
  if sel['sourceFamily']!='special' or not sel.get('negative'):continue
  check(sel['field']=='MemoryShardTagItemID' and sel['selectorKind']==7,'SPECIAL_NEGATIVE_KIND')
  field=sch['MemoryShardItemData'][0]['MemoryShardTagItemID'];matched=[]
  for _,_,wire in frames((root/'MemoryShard.json').read_bytes()):
   i=scalar(wire,1,0)
   if scalar(wire,field,0)==sel['criterion']:
    matched.append(i);negative[i].append({'setId':sel['setId'],'groupIndex':sel['groupIndex'],'submenuCode':sel['submenuCode'],'selectorIndex':sel['selectorIndex'],'criterion':sel['criterion'],'evidence':'current_original_collection_static_predicate','sourceField':sel['field']})
  check(len(matched)==sel['sourceMatchedItemCount'],'SPECIAL_NEGATIVE_CENSUS')
 # Source Set tag relations cover Trimming, makeup and other families too;
 # a set's universe tag is never substituted for a direct item tag.
 tag_ids={i:r['nativeKey'] for i,r in cat.items() if r['nativeCategory']=='Tag'}
 world_keys={'IsDreamlightValley','IsEternityIsle','IsStorybookVale','IsWishBlossomMountains','isSeaOfSecrets','isHoneywood','isUnderwaterScene'}
 universe_dictionary={i:key for i,key in tag_ids.items() if 2000500000<=i<2000600000}
 scopezip=zipfile.ZipFile(root/'COLLECTION_SCOPE_v1.26.2_WORLD_UNIVERSE_EVIDENCE_PRIVATE_20261122.zip')
 labels=json.loads(scopezip.read('collection-scope-labels-private-steam-v1.26.2.json'))
 check(labels['sourceTagSha256']==source_hashes['Tag'] and labels['gameVersion']==cm['gameVersion'],'LABEL_SOURCE')
 universe_labels={v['tagId']:v['names'] for v in labels['universes'] if v['tagId'] in universe_dictionary and universe_dictionary[v['tagId']]==v['id']}
 world_labels={v['tagId']:v['names'] for v in labels['worlds'] if tag_ids.get(v['tagId'])==v['id']}
 universe_names=[{'tagId':i,'key':k,'names':universe_labels.get(i,cat[i]['names'])} for i,k in sorted(universe_dictionary.items())]
 world_names=[{'tagId':i,'key':k,'names':world_labels.get(i,cat[i]['names'])} for i,k in sorted(tag_ids.items()) if k in world_keys]
 rows=[];status=collections.Counter();artwork_count=0;candidate_count=0
 for i,r in sorted(cat.items()):
  t=typ[i];raw=raw_info[i];g=tags[i];art={**raw['artwork'],**(old.get(i,{}).get('artwork') or {})}
  if i in old:art['iconGuid']=old[i]['iconGuid']
  elif r['verifiedIconGuid']:art['iconGuid']=r['verifiedIconGuid'].removeprefix('guid:')
  refs=[{'id':v['tagId'],'key':v['tagKey'],'facet':v['facet'],'sourceField':v['wireField']} for v in g['tagReferences']]
  direct_uni=sorted({a['id'] for a in refs if a['id'] in universe_dictionary});worlds=sorted({a['id'] for a in refs if a['key'] in world_keys})
  su=raw['setId'];set_uni=sorted({a['tagId'] for a in tags[su]['tagReferences'] if a['tagId'] in universe_dictionary}) if su else []
  # Keep positives and exclusions separately, and compute group-local effective candidates.
  pos=positive[i];neg=negative[i];excluded={(q['setId'],q['groupIndex']) for q in neg}
  effective=[p for p in pos if (p['setId'],p['groupIndex']) not in excluded]
  predicate_uni=sorted({p['universeTagId'] for p in effective if p.get('universeTagId') in universe_dictionary})
  uni=sorted(set(direct_uni+set_uni+predicate_uni));source_status='source_linked' if uni else 'unresolved_source'
  if not uni and raw['sourceClass'] and 'Tags' in sch[raw['sourceClass']][0] and r['nativeCategory'] in ('Makeup','Character','MemoryShard','BoardGame','Companion','Story','TouchOfMagic','Clothing','Furniture','Trimming') and (raw['setId'] is None or su in tags):source_status='no_universe_in_verified_tag_fields'
  status[source_status]+=1
  # Native classification evidence, not a final visible/owned Collection denominator.
  scope='source_candidate' if effective else ('item_definition' if i in old or r['nativeCategory'] in ('Story','TouchOfMagic','Building','Currency','Upgrade') else 'other_definition')
  candidate_count+=bool(effective);artwork_count+=bool(art.get('iconGuid'))
  rows.append({'itemId':i,'nativeCategory':r['nativeCategory'],'nativeKey':r['nativeKey'],'names':r['names'],'nameVerified':all(r['names'].values()),'iconGuid':art.get('iconGuid'),'artwork':art,'itemType':{'code':t['itemTypeCode'],'name':t['itemTypeName'],'subtypeCode':t['subtypeCode'],'subtypeEnum':t['subtypeEnumName'],'subtypeName':t['subtypeName'],'subtypeNameVerified':t['subtypeNameVerified']},'tags':refs,'collectionSourceCandidates':effective,'collectionPositiveSourceLinks':pos,'collectionExclusions':neg,'worldTagIds':worlds,'universeTagIds':uni,'universeDirectTagIds':direct_uni,'universeSetTagIds':set_uni,'universePredicateTagIds':predicate_uni,'sourceSetItemId':su,'universeSourceStatus':source_status,'craftingRecipeItemIds':sorted(recipe_results[i]),'definitionScope':scope,'sourceClass':raw['sourceClass'],'sourceFrame':raw['sourceFrame'],'observedFields':raw['observedFields'],'nativeProperties':raw['nativeProperties'],'collectionMembershipVerified':False,'worldMembershipVerified':False,'availabilityVerified':False})
 result={'schema':'wand.item-master.complete-source@1','release':'steam-'+cm['gameVersion']+'-item-id-master-v3','target':{'platform':cm['platform'],'gameVersion':cm['gameVersion']},'sourceItemsSha256':cm['sourceItemsSha256'],'sourceIl2cppDumpSha256':dump_hash,'sourceFilesSha256':source_hashes,'sourceFilesVerified':len(source_hashes),'count':len(rows),'coverage':{'definitionCount':len(rows),'nativeCategoryCount':len(cm['categories']),'nameVerified':sum(r['nameVerified'] for r in rows),'iconGuid':artwork_count,'sourceSelectorCount':len(ledger),'collectionCandidateItemIds':candidate_count,'positiveSourceLinks':sum(len(r['collectionPositiveSourceLinks']) for r in rows),'negativeSourceLinks':sum(len(r['collectionExclusions']) for r in rows),'explicitIgnoreEntries':explicit_ignored,'universeStates':dict(status),'worldTagItemIds':sum(bool(r['worldTagIds']) for r in rows),'recipeResultItemIds':sum(bool(v) for v in recipe_results.values()),'recipeResultLinks':sum(len(v) for v in recipe_results.values()),'scalarProperties':scalar_count,'unresolvedClassDispatch':dict(unresolved_classes),'runtimeCollectionMembershipVerified':False,'allOriginalFieldSemanticsVerified':False},'collectionMenus':[{k:v for k,v in r.items() if k not in ('gameUiVisibilityVerified','dynamicSelectorsUnresolved')} for r in menus],'collectionSelectors':ledger,'ignoredSentinels':ignored_sentinels,'universeTags':universe_names,'worldTags':world_names,'sourceFieldDeclarations':fields_by_class,'items':rows}
 return result

def main():
 p=argparse.ArgumentParser();p.add_argument('--input',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args();d=build(a.input);body=json.dumps(d,ensure_ascii=False,separators=(',',':'),allow_nan=False).encode();out=gzip.compress(body,compresslevel=9,mtime=0);a.output.write_bytes(out);print(json.dumps({'coverage':d['coverage'],'bytes':len(out),'sha256':digest(out)},ensure_ascii=False))
if __name__=='__main__':main()
