//! Read-only individual native backup. Never export the entire Save or
//! reinterpret sender-local allocation IDs as Wand public artifact IDs.
use crate::CodecError;
use serde_json::{json,Value,value::RawValue};
use std::collections::BTreeMap;
const BAD:CodecError=CodecError::Json;
const MAX_ROWS:usize=4096;
const MAX_FILE:usize=16_000_000;
type Map<'a>=BTreeMap<String,&'a RawValue>;
fn obj(raw:&RawValue)->Result<Map<'_>,CodecError>{serde_json::from_str(raw.get()).map_err(|_|BAD)}
fn get<'a>(m:&Map<'a>,key:&str)->Result<&'a RawValue,CodecError>{m.get(key).copied().ok_or(BAD)}
fn number(raw:&RawValue)->Result<u32,CodecError>{serde_json::from_str(raw.get()).map_err(|_|BAD)}
fn keynum(s:&str)->Result<u32,CodecError>{let n=s.parse::<u32>().map_err(|_|BAD)?;if n.to_string()!=s{return Err(BAD);}Ok(n)}
#[derive(Clone,Copy)]
struct Entry<'a>{kind:&'static str,storage:&'static str,base:Option<u32>,name:Option<&'a RawValue>,payload:&'a RawValue,active:bool}
fn designs<'a>(raw:&'a RawValue,kind:&'static str,storage:&'static str)->Result<Vec<Entry<'a>>,CodecError>{
 let outer=obj(raw)?;let mut rows=Vec::new();
 for (item,map) in outer{
  let id=keynum(&item)?;if id==0{return Err(BAD);}
  let m=obj(map)?;let entries=obj(get(&m,"Designs")?)?;
  for (design,payload) in entries{
   let d=obj(payload)?;
   if number(get(&d,"Id")?)?!=keynum(&design)?||number(get(&d,"Item")?)?!=id{return Err(BAD);}
   if rows.len()>=MAX_ROWS||payload.get().len()>MAX_FILE{return Err(CodecError::Bounds);}
   // Retain full original payload, including unrecognized fields. Creator
   // account/platform provenance is private and never returned in the index.
   rows.push(Entry{kind,storage,base:Some(id),name:None,payload,active:true});
  }
 }
 Ok(rows)
}
fn decorations(raw:&RawValue)->Result<Vec<Entry<'_>>,CodecError>{
 let slots:Vec<&RawValue>=serde_json::from_str(raw.get()).map_err(|_|BAD)?;
 if slots.len()>MAX_ROWS{return Err(CodecError::Bounds);}
 let mut rows=Vec::new();
 for payload in slots{
  let d=obj(payload)?;
  let flags=number(get(&d,"StateFlags")?)?;
  if flags&0x10!=0{continue;}
  obj(get(&d,"GridCollection")?)?;
  let name=get(&d,"PresetName")?;
  let title:String=serde_json::from_str(name.get()).map_err(|_|BAD)?;
  if title.len()>1024||payload.get().len()>MAX_FILE{return Err(CodecError::Bounds);}
  rows.push(Entry{kind:"native-decoration",storage:"decoration",base:None,name:Some(name),payload,active:true});
 }
 Ok(rows)
}
struct Scan<'a>{version:u32,rows:Vec<Entry<'a>>,status:Vec<Value>}
fn scan(source:&[u8])->Result<Scan<'_>,CodecError>{
 let root:Map=serde_json::from_slice(source).map_err(|_|BAD)?;
 let info=obj(get(&root,"GameInfo")?)?;let version=number(get(&info,"Version")?)?;
 if !matches!(version,624|626|643){return Err(BAD);}
 let p=obj(get(&root,"Player")?)?;let w=obj(get(&root,"World")?)?;
 let groups=[
 ("tom-furniture",get(&w,"FurnitureDesigns").and_then(obj).and_then(|m|get(&m,"Items")).and_then(|r|designs(r,"tom-furniture","furniture"))),
 ("tom-clothing-female",get(&p,"FemaleClothingDesigns").and_then(|r|designs(r,"tom-clothing","female"))),
 ("tom-clothing-male",get(&p,"MaleClothingDesigns").and_then(|r|designs(r,"tom-clothing","male"))),
 ("native-decoration",get(&w,"DecorationPresets").and_then(decorations))
 ];
 let mut rows=Vec::new();let mut status=Vec::new();
 for (group,result) in groups{match result{
  Ok(mut values)=>{if rows.len()+values.len()>MAX_ROWS{return Err(CodecError::Bounds);}status.push(json!({"group":group,"status":"read","count":values.len()}));rows.append(&mut values);}
  Err(_)=>status.push(json!({"group":group,"status":"unavailable","count":null}))
 }}
 Ok(Scan{version,rows,status})
}
pub(super) fn list(source:&[u8])->Result<String,CodecError>{
 let s=scan(source)?;
 let rows=s.rows.iter().enumerate().map(|(i,r)|json!({"ordinal":i+1,"kind":r.kind,"storage":r.storage,"baseItemId":r.base,"name":r.name.and_then(|n|serde_json::from_str::<String>(n.get()).ok()),"active":r.active})).collect::<Vec<_>>();
 serde_json::to_string(&json!({"contract":"wand.native-preset-index@1","gameSchema":s.version,"groups":s.status,"rows":rows,"writerAuthorized":false})).map_err(|_|BAD)
}
pub(super) fn export(source:&[u8],ordinal:usize)->Result<String,CodecError>{
 let s=scan(source)?;let r=s.rows.get(ordinal.checked_sub(1).ok_or(BAD)?).ok_or(BAD)?;
 // The RawValue is inserted without parsing/reencoding unknown numeric
 // values, whitespace, provenance, or native slot-local dependencies.
 let raw=format!("{{\"schema\":\"wand.preset.native-backup@1\",\"gameSchema\":{},\"kind\":\"{}\",\"storage\":\"{}\",\"baseItemId\":{},\"payload\":{}}}",s.version,r.kind,r.storage,r.base.map(|n|n.to_string()).unwrap_or_else(||"null".into()),r.payload.get());
 if raw.len()>MAX_FILE{return Err(CodecError::Bounds);}Ok(raw)
}

// A restore review is read-only. In particular, a valid allocator is not
// evidence of motif ownership, base-item entitlement, slot capacity, or
// runtime compatibility. Do not generate a modified Save from this receipt.
fn same_design(a:&RawValue,b:&RawValue)->Result<bool,CodecError>{
 let a=obj(a)?;let b=obj(b)?;
 Ok(a.len()==b.len()&&a.iter().all(|(k,v)|k=="Id"||b.get(k).is_some_and(|w|v.get()==w.get())))
}
fn validate_allocator(entries:&[Entry<'_>],kind:&str,next:u32)->Result<bool,CodecError>{
 let mut seen=std::collections::BTreeSet::new();
 if next>=i32::MAX as u32{return Ok(false);}
 for row in entries.iter().filter(|r|r.kind==kind){
  let id=number(get(&obj(row.payload)?,"Id")?)?;
  if id>=next||!seen.insert(id){return Ok(false);}
 }
 Ok(true)
}

fn positive_base_stock(source:&[u8],kind:&str,base:u32)->Option<u32>{
 let (role,code,label)=match kind{"tom-furniture"=>(0,4,"Furniture"),"tom-clothing"=>(1,5,"Clothing"),_=>return None};
 if base/10_000_000!=code{return None;}
 let root:Map=serde_json::from_slice(source).ok()?;
 let player=obj(get(&root,"Player").ok()?).ok()?;
 let inventories=obj(get(&player,"ListInventories").ok()?).ok()?;
 let inventory=obj(get(&inventories,&role.to_string()).ok()?).ok()?;
 if inventory.get("ID").is_some_and(|v|number(v).ok()!=Some(role)){return None;}
 let typ=get(&inventory,"CompatibleItemType").ok()?;
 if number(typ).ok()!=Some(code)&&!serde_json::from_str::<String>(typ.get()).ok().is_some_and(|s|s.eq_ignore_ascii_case(label)||s==format!("ItemType_{label}")){return None;}
 let rows=obj(get(&inventory,"Inventory").ok()?).ok()?;
 let row=obj(get(&rows,&base.to_string()).ok()?).ok()?;
 let amount=number(get(&row,"Amount").ok()?).ok()?;
 (amount>0&&amount<=i32::MAX as u32).then_some(amount)
}
fn replaceable_decoration(raw:&RawValue,version:u32)->bool{
 let wrapped=format!("{{\"schema\":\"wand.preset.native-backup@1\",\"gameSchema\":{},\"kind\":\"native-decoration\",\"storage\":\"decoration\",\"baseItemId\":null,\"payload\":{}}}",version,raw.get());
 decoration_install_payload(&wrapped).is_ok()
}
fn decoration_replacement_options(source:&[u8],version:u32)->Result<Vec<Value>,CodecError>{
 let root:Map=serde_json::from_slice(source).map_err(|_|BAD)?;
 let w=obj(get(&root,"World")?)?;
 let rows:Vec<&RawValue>=serde_json::from_str(get(&w,"DecorationPresets")?.get()).map_err(|_|BAD)?;
 if rows.len()>MAX_ROWS{return Err(BAD);}
 let mut options=Vec::new();
 for (i,row) in rows.iter().enumerate(){
  if replaceable_decoration(row,version){
   let p=obj(row)?;let name:String=serde_json::from_str(get(&p,"PresetName")?.get()).map_err(|_|BAD)?;
   options.push(json!({"slot":i+1,"name":name}));
  }
 }
 Ok(options)
}

pub(super) fn review(source:&[u8],backup:&str)->Result<String,CodecError>{
 if backup.len()>MAX_FILE{return Err(CodecError::Bounds);}
 let raw:Map=serde_json::from_str(backup).map_err(|_|BAD)?;
 if raw.len()!=6||serde_json::from_str::<String>(get(&raw,"schema")?.get()).map_err(|_|BAD)?!="wand.preset.native-backup@1"{return Err(BAD);}
 let version=number(get(&raw,"gameSchema")?)?;
 if !matches!(version,624|626|643){return Err(BAD);}
 let kind:String=serde_json::from_str(get(&raw,"kind")?.get()).map_err(|_|BAD)?;
 let storage:String=serde_json::from_str(get(&raw,"storage")?.get()).map_err(|_|BAD)?;
 let base:Option<u32>=serde_json::from_str(get(&raw,"baseItemId")?.get()).map_err(|_|BAD)?;
 let payload=get(&raw,"payload")?;let fields=obj(payload)?;
 let s=scan(source)?;
 let group=match (kind.as_str(),storage.as_str(),base){
  ("tom-furniture","furniture",Some(id))|("tom-clothing","female",Some(id))|("tom-clothing","male",Some(id))=>{
   if id==0||number(get(&fields,"Item")?)?!=id||number(get(&fields,"Id")?)?>i32::MAX as u32{return Err(BAD);}
   match storage.as_str(){"furniture"=>"tom-furniture","female"=>"tom-clothing-female",_=>"tom-clothing-male"}
  }
  ("native-decoration","decoration",None)=>{
   obj(get(&fields,"GridCollection")?)?;
   let _:String=serde_json::from_str(get(&fields,"PresetName")?.get()).map_err(|_|BAD)?;
   if number(get(&fields,"StateFlags")?)?&16!=0{return Err(BAD);}
   "native-decoration"
  }
  _=>return Err(BAD)
 };
 let available=|g:&str|s.status.iter().any(|v|v["group"]==g&&v["status"]=="read");
 let target_readable=available(group);
 let mut matches=0usize;let mut target_count=0usize;
 for row in s.rows.iter().filter(|r|r.kind==kind&&r.storage==storage&&r.base==base){
  target_count+=1;
  if if kind=="native-decoration"{row.payload.get()==payload.get()}else{same_design(row.payload,payload)?}{matches+=1;}
 }
 let mut allocator=None;
 if kind!="native-decoration"&&target_readable{
  let root:Map=serde_json::from_slice(source).map_err(|_|BAD)?;
  if kind=="tom-furniture"{
   let world=obj(get(&root,"World")?)?;
   let furniture=obj(get(&world,"FurnitureDesigns")?)?;
   if let Ok(next)=get(&furniture,"NextDesignId").and_then(number){
    allocator=Some(validate_allocator(&s.rows,&kind,next)?);
   }
  }else if available("tom-clothing-female")&&available("tom-clothing-male"){
   let player=obj(get(&root,"Player")?)?;
   if let Ok(next)=get(&player,"NextClothingDesignID").and_then(number){
    allocator=Some(validate_allocator(&s.rows,&kind,next)?);
   }
  }
 }
 let source_kind=if kind=="native-decoration"{None}else{fields.get("Source").and_then(|r|number(r).ok()).filter(|n|*n<=2)};
 let slot_counts=if kind=="native-decoration"&&target_readable{decoration_slot_info(source).ok()}else{None};
 let decoration_candidate=kind=="native-decoration"&&version==s.version&&target_readable&&matches==0&&slot_counts.is_some_and(|(a,_)|a<LEGACY_ACTIVE_LIMIT)&&decoration_install_payload(backup).is_ok();
 let positive_stock=base.and_then(|id|positive_base_stock(source,&kind,id));
 let replace_options=if kind=="native-decoration"&&version==s.version&&target_readable&&matches==0&&decoration_install_payload(backup).is_ok(){decoration_replacement_options(source,version).unwrap_or_default()}else{Vec::new()};
 let receipt=json!({"contract":"wand.native-preset-restore-review@1","kind":kind,"storage":storage,"baseItemId":base,
  "schemaMatches":version==s.version,"backupSchema":version,"targetSchema":s.version,"targetReadable":target_readable,
  "matchingDesigns":if target_readable{Some(matches)}else{None},
  "existingDesignsForItem":if target_readable{Some(target_count)}else{None},
  "allocatorConsistent":allocator,"designSource":source_kind,"requiresNewId":kind!="native-decoration",
  "positiveBaseStock":positive_stock,"replacementSlots":replace_options,"activeSlots":slot_counts.map(|(a,_)|a),"legacySlotLimit":if slot_counts.is_some(){Some(LEGACY_ACTIVE_LIMIT)}else{None},"decorationTestCandidate":decoration_candidate,"capacityVerified":false,"ownershipVerified":false,"runtimeVerified":false,"writerAuthorized":false});
 serde_json::to_string(&receipt).map_err(|_|BAD)
}


// ToM private Restore-as-New candidate. The candidate exists only inside Rust;
// the WASM boundary exposes a structural rehearsal receipt, not modified Save
// bytes. The final writer must additionally prove ownership and native limits.
struct RawEdit{start:usize,end:usize,replacement:String}
fn span(source:&str,value:&RawValue)->Result<(usize,usize),CodecError>{
 let start=(value.get().as_ptr() as usize).checked_sub(source.as_ptr() as usize).ok_or(BAD)?;
 let end=start.checked_add(value.get().len()).ok_or(BAD)?;
 if source.get(start..end)!=Some(value.get()){return Err(BAD);}Ok((start,end))
}
fn replace_raw(source:&str,old:&RawValue,replacement:String)->Result<RawEdit,CodecError>{
 let (start,end)=span(source,old)?;Ok(RawEdit{start,end,replacement})
}
fn append_member(source:&str,old:&RawValue,key:&str,raw:&str)->Result<RawEdit,CodecError>{
 let members=obj(old)?;if members.contains_key(key){return Err(BAD);}
 let (_,end)=span(source,old)?;
 if source.as_bytes().get(end-1)!=Some(&b'}'){return Err(BAD);}
 let member=format!("{}{}:{}",if members.is_empty(){""}else{","},serde_json::to_string(key).map_err(|_|BAD)?,raw);
 Ok(RawEdit{start:end-1,end:end-1,replacement:member})
}
fn patch(source:&str,mut edits:Vec<RawEdit>)->Result<String,CodecError>{
 edits.sort_by_key(|e|std::cmp::Reverse(e.start));
 let mut out=source.to_owned();let mut limit=source.len();
 for e in edits{if e.start>e.end||e.end>limit||!source.is_char_boundary(e.start)||!source.is_char_boundary(e.end){return Err(BAD);}
  out.replace_range(e.start..e.end,&e.replacement);limit=e.start;
 }
 if out.len()>crate::LIMIT||ddv_save_patch::validate_json_without_edit(&out).is_err(){return Err(BAD);}Ok(out)
}
pub(super) fn tom_restore_rehearsal(source:&[u8],backup:&str)->Result<String,CodecError>{
 let src=std::str::from_utf8(source).map_err(|_|BAD)?;
 if backup.len()>MAX_FILE||ddv_save_patch::validate_json_without_edit(src).is_err()||ddv_save_patch::validate_json_without_edit(backup).is_err(){return Err(BAD);}
 let check:Value=serde_json::from_str(&review(source,backup)?).map_err(|_|BAD)?;
 if check["schemaMatches"]!=true||check["targetReadable"]!=true||check["allocatorConsistent"]!=true||check["matchingDesigns"]!=0||check["requiresNewId"]!=true{return Err(BAD);}
 let raw:Map=serde_json::from_str(backup).map_err(|_|BAD)?;let payload=get(&raw,"payload")?;
 let kind=check["kind"].as_str().ok_or(BAD)?;let storage=check["storage"].as_str().ok_or(BAD)?;
 let base=check["baseItemId"].as_u64().and_then(|v|u32::try_from(v).ok()).ok_or(BAD)?.to_string();
 let root:Map=serde_json::from_str(src).map_err(|_|BAD)?;
 let (target,allocator)=if kind=="tom-furniture"{
  let w=obj(get(&root,"World")?)?;let f=obj(get(&w,"FurnitureDesigns")?)?;(get(&f,"Items")?,get(&f,"NextDesignId")?)
 }else if kind=="tom-clothing"{
  let p=obj(get(&root,"Player")?)?;let name=match storage{"female"=>"FemaleClothingDesigns","male"=>"MaleClothingDesigns",_=>return Err(BAD)};(get(&p,name)?,get(&p,"NextClothingDesignID")?)
 }else{return Err(BAD)};
 let next=number(allocator)?;let following=next.checked_add(1).filter(|v|*v<=i32::MAX as u32).ok_or(BAD)?;
 let id=next.to_string();let fields=obj(payload)?;let cloned=patch(payload.get(),vec![replace_raw(payload.get(),get(&fields,"Id")?,id.clone())?])?;
 let outer=obj(target)?;
 let insertion=if let Some(item)=outer.get(&base){let row=obj(item)?;append_member(src,get(&row,"Designs")?,&id,&cloned)?}
 else{append_member(src,target,&base,&format!("{{\"Designs\":{{\"{}\":{}}}}}",id,cloned))?};
 let candidate=patch(src,vec![insertion,replace_raw(src,allocator,following.to_string())?])?;
 // Independent reread: no stale sender Id can become a receiver Id.
 let before=scan(source)?;let after=scan(candidate.as_bytes())?;
 if before.version!=after.version||before.rows.len()+1!=after.rows.len()||before.status.iter().any(|a|a["status"]=="read"&&!after.status.iter().any(|b|b["group"]==a["group"]&&b["status"]=="read")){return Err(BAD);}
 let installed=after.rows.iter().filter(|row|row.kind==kind&&row.storage==storage&&row.base.map(|v|v.to_string()).as_deref()==Some(base.as_str())).find(|row|obj(row.payload).and_then(|o|number(get(&o,"Id")?)).ok()==Some(next)).ok_or(BAD)?;
 if !same_design(installed.payload,payload)?||!validate_allocator(&after.rows,kind,following)?{return Err(BAD);}
 // Before returning a receipt, the caller reopens/repackages the candidate
 // using the existing codec. Nothing from this helper is a public artifact.
 Ok(candidate)
}


fn display_text(raw:Option<&&RawValue>,max:usize)->Option<String>{
 let value:String=serde_json::from_str(raw?.get()).ok()?;
 if value.is_empty()||value.len()>max||value.chars().any(char::is_control){return None;}Some(value)
}
/// Bounded local inspection for the Presets detail UI. Unlike native backups,
/// the response contains only public Item IDs, aggregate counts and the
/// creator's visible display name. This never validates a public artifact.
pub(super) fn inspect_backup(raw:&str)->Result<String,CodecError>{
 if raw.len()>MAX_FILE||ddv_save_patch::validate_json_without_edit(raw).is_err(){return Err(BAD);}
 let doc:Map=serde_json::from_str(raw).map_err(|_|BAD)?;
 if doc.len()!=6||serde_json::from_str::<String>(get(&doc,"schema")?.get()).map_err(|_|BAD)?!="wand.preset.native-backup@1"||!matches!(number(get(&doc,"gameSchema")?)?,624|626|643){return Err(BAD);}
 let kind:String=serde_json::from_str(get(&doc,"kind")?.get()).map_err(|_|BAD)?;
 let storage:String=serde_json::from_str(get(&doc,"storage")?.get()).map_err(|_|BAD)?;
 let base:Option<u32>=serde_json::from_str(get(&doc,"baseItemId")?.get()).map_err(|_|BAD)?;
 let payload=obj(get(&doc,"payload")?)?;
 let mut counts=BTreeMap::<u32,usize>::new();let mut creator=None;let mut decals=None;let mut textures=None;let mut name=None;let mut complete=true;
 match (kind.as_str(),storage.as_str(),base){
  ("tom-furniture","furniture",Some(id))|("tom-clothing","female",Some(id))|("tom-clothing","male",Some(id))=>{
   if id==0||number(get(&payload,"Item")?)?!=id||number(get(&payload,"Id")?)?>i32::MAX as u32{return Err(BAD);}
   counts.insert(id,1);creator=display_text(payload.get("CreatorDisplayName"),512);
   decals=payload.get("Decals").and_then(|r|serde_json::from_str::<Vec<&RawValue>>(r.get()).ok()).map(|a|a.len());
   textures=payload.get("Textures").and_then(|r|serde_json::from_str::<Vec<&RawValue>>(r.get()).ok()).map(|a|a.len());
  }
  ("native-decoration","decoration",None)=>{
   if number(get(&payload,"StateFlags")?)?&16!=0{return Err(BAD);}
   name=display_text(payload.get("PresetName"),1024);
   let c=obj(get(&payload,"GridCollection")?)?;let grids=obj(get(&c,"Grids")?)?;
   if grids.is_empty()||grids.len()>MAX_ROWS||!grids.contains_key("0"){return Err(BAD);}
   if let Some(diff)=c.get("DiffGrids"){if !obj(diff).is_ok_and(|m|m.is_empty())&&diff.get()!="null"{complete=false;}}
   let mut total=0usize;
   for (gid,g) in grids{
    let g=obj(g)?;if number(get(&g,"ID")?)?!=keynum(&gid)?{return Err(BAD);}
    let objects=obj(get(&g,"Objects")?)?;total=total.checked_add(objects.len()).ok_or(BAD)?;if total>20000{return Err(CodecError::Bounds);}
    for (oid,o) in objects{let o=obj(o)?;if number(get(&o,"ID")?)?!=keynum(&oid)?{return Err(BAD);}
     let item=number(get(&o,"ItemID")?)?;if item==0{return Err(BAD);}*counts.entry(item).or_default()+=1;
    }
   }
  }
  _=>return Err(BAD)
 }
 let counts=counts.into_iter().collect::<Vec<_>>();
 serde_json::to_string(&json!({"contract":"wand.native-preset-detail@1","kind":kind,"storage":storage,"baseItemId":base,"creator":creator,"name":name,"decalCount":decals,"textureCount":textures,"items":counts,"complete":complete,"renderedAppearanceVerified":false})).map_err(|_|BAD)
}


// v1.25 native runtime accepted the root-first serialized subset. Retain the
// original payload byte order (native placement uses the first Grid entry).
// Current-version game runtime is not yet proven: test copy only.
const LEGACY_ACTIVE_LIMIT:usize=20;
fn decoration_slot_info(source:&[u8])->Result<(usize,usize),CodecError>{
 let root:Map=serde_json::from_slice(source).map_err(|_|BAD)?;
 let w=obj(get(&root,"World")?)?;
 let slots=get(&w,"DecorationPresets")?;
 let rows:Vec<&RawValue>=serde_json::from_str(slots.get()).map_err(|_|BAD)?;
 if rows.len()>=MAX_ROWS{return Err(CodecError::Bounds);}
 let active=decorations(slots)?.len();
 Ok((active,rows.len()))
}
fn decoration_install_payload(backup:&str)->Result<&RawValue,CodecError>{
 // The converter rejects unsupported state, cycles, invalid counters,
 // orphan Grids and non-cardinal geometry. Current geometry is checked
 // by the existing terrain worker before the UI requests a test copy.
 crate::native_preset_scene::convert(backup)?;
 let doc:Map=serde_json::from_str(backup).map_err(|_|BAD)?;
 let raw=get(&doc,"payload")?;let p=obj(raw)?;
 if p.keys().any(|k|!matches!(k.as_str(),"GridCollection"|"PresetName"|"ThumbnailItems"|"ShareInfo"|"StateFlags"))||
 number(get(&p,"StateFlags")?)?!=0||get(&p,"ShareInfo")?.get()!="null"{return Err(BAD);}
 let name:String=serde_json::from_str(get(&p,"PresetName")?.get()).map_err(|_|BAD)?;
 if name.trim().is_empty()||name.len()>1024||name.chars().any(char::is_control){return Err(BAD);}
 let thumbs:Vec<u32>=serde_json::from_str(get(&p,"ThumbnailItems")?.get()).map_err(|_|BAD)?;
 if thumbs.len()>200||thumbs.contains(&0){return Err(BAD);}
 let c=obj(get(&p,"GridCollection")?)?;
 if c.keys().any(|k|!matches!(k.as_str(),"Grids"|"DiffGrids"|"NextGridID")){return Err(BAD);}
 let grids=get(&c,"Grids")?;
 // Do not re-serialize a BTreeMap: its ordering is not the game contract.
 if !grids.get().trim_start().strip_prefix('{').is_some_and(|s|s.trim_start().starts_with("\"0\"")){return Err(BAD);}
 for (_,g) in obj(grids)?{
  let g=obj(g)?;
  if g.keys().any(|k|!matches!(k.as_str(),"ID"|"GridDataPath"|"GridDefaultLayoutPath"|"TessellationFactor"|"NextGridObjectID"|"Objects")){return Err(BAD);}
 }
 Ok(raw)
}
pub(super) fn decoration_restore_candidate(source:&[u8],backup:&str)->Result<String,CodecError>{
 let src=std::str::from_utf8(source).map_err(|_|BAD)?;
 if backup.len()>MAX_FILE||ddv_save_patch::validate_json_without_edit(src).is_err()||ddv_save_patch::validate_json_without_edit(backup).is_err(){return Err(BAD);}
 let check:Value=serde_json::from_str(&review(source,backup)?).map_err(|_|BAD)?;
 if check["schemaMatches"]!=true||check["targetReadable"]!=true||check["kind"]!="native-decoration"||check["matchingDesigns"]!=0{return Err(BAD);}
 let (active,physical)=decoration_slot_info(source)?;
 if active>=LEGACY_ACTIVE_LIMIT{return Err(BAD);}
 let payload=decoration_install_payload(backup)?;
 let root:Map=serde_json::from_str(src).map_err(|_|BAD)?;
 let w=obj(get(&root,"World")?)?;let slots=get(&w,"DecorationPresets")?;
 let (_,end)=span(src,slots)?;
 if src.as_bytes().get(end-1)!=Some(&b']'){return Err(BAD);}
 let insertion=RawEdit{start:end-1,end:end-1,replacement:format!("{}{}",if physical==0{""}else{","},payload.get())};
 let candidate=patch(src,vec![insertion])?;
 if decoration_slot_info(candidate.as_bytes())? != (active+1,physical+1){return Err(BAD);}
 let after:Map=serde_json::from_str(&candidate).map_err(|_|BAD)?;
 let w=obj(get(&after,"World")?)?;
 let rows:Vec<&RawValue>=serde_json::from_str(get(&w,"DecorationPresets")?.get()).map_err(|_|BAD)?;
 if rows.last().is_none_or(|v|v.get()!=payload.get()){return Err(BAD);}
 Ok(candidate)
}


pub(super) fn decoration_replace_candidate(source:&[u8],backup:&str,slot:usize)->Result<String,CodecError>{
 let src=std::str::from_utf8(source).map_err(|_|BAD)?;
 if backup.len()>MAX_FILE||ddv_save_patch::validate_json_without_edit(src).is_err()||ddv_save_patch::validate_json_without_edit(backup).is_err(){return Err(BAD);}
 let check:Value=serde_json::from_str(&review(source,backup)?).map_err(|_|BAD)?;
 if check["schemaMatches"]!=true||check["targetReadable"]!=true||check["kind"]!="native-decoration"||check["matchingDesigns"]!=0{return Err(BAD);}
 if !check["replacementSlots"].as_array().is_some_and(|a|a.iter().any(|v|v["slot"].as_u64()==Some(slot as u64))){return Err(BAD);}
 let payload=decoration_install_payload(backup)?;
 let root:Map=serde_json::from_str(src).map_err(|_|BAD)?;
 let w=obj(get(&root,"World")?)?;
 let rows:Vec<&RawValue>=serde_json::from_str(get(&w,"DecorationPresets")?.get()).map_err(|_|BAD)?;
 let index=slot.checked_sub(1).ok_or(BAD)?;let target=*rows.get(index).ok_or(BAD)?;
 let counts=decoration_slot_info(source)?;
 let candidate=patch(src,vec![replace_raw(src,target,payload.get().to_owned())?])?;
 if decoration_slot_info(candidate.as_bytes())?!=counts{return Err(BAD);}
 let after:Map=serde_json::from_str(&candidate).map_err(|_|BAD)?;
 let w=obj(get(&after,"World")?)?;
 let new_rows:Vec<&RawValue>=serde_json::from_str(get(&w,"DecorationPresets")?.get()).map_err(|_|BAD)?;
 if rows.len()!=new_rows.len()||new_rows[index].get()!=payload.get()||rows.iter().zip(&new_rows).enumerate().any(|(i,(old,new))|i!=index&&old.get()!=new.get()){return Err(BAD);}
 Ok(candidate)
}

#[cfg(test)]
mod tests{
 use super::*;
 #[test]
 fn native_backups_are_individual_and_preserve_private_payload(){
  let raw=br#"{"GameInfo":{"Version":643},"Player":{"FemaleClothingDesigns":{"30000001":{"Designs":{"3":{"Id":3,"Item":30000001,"Source":2,"CreatorDisplayName":"Creator","PlatformAccountId":"PRIVATE","Future":1e-17}}}},"MaleClothingDesigns":{}},"World":{"FurnitureDesigns":{"Items":{"40000001":{"Designs":{"2":{"Id":2,"Item":40000001,"Source":1,"Decals":[],"Textures":[]}}}},"NextDesignId":4},"DecorationPresets":[{"PresetName":"Room","StateFlags":0,"GridCollection":{"Grids":{}},"ShareInfo":null},{"PresetName":"Deleted","StateFlags":16,"GridCollection":{"Grids":{}}}]},"PrivateRoot":"NEVER"}"#;
  let index=list(raw).unwrap();let v:Value=serde_json::from_str(&index).unwrap();assert_eq!(v["rows"].as_array().unwrap().len(),3);assert!(!index.contains("PRIVATE"));assert!(!index.contains("NEVER"));assert!(!index.contains("Deleted"));
  let b=export(raw,2).unwrap();assert!(b.contains("\"Future\":1e-17"));assert!(b.contains("\"PlatformAccountId\":\"PRIVATE\""));assert!(!b.contains("NEVER"));assert!(!b.contains("NextDesignId"));assert!(export(raw,4).is_err());
 }
 #[test]
 fn unsupported_group_does_not_claim_empty_or_hide_supported_group(){
  let raw=br#"{"GameInfo":{"Version":643},"Player":{"FemaleClothingDesigns":{"1":{"Designs":{"2":{"Id":9,"Item":1}}}},"MaleClothingDesigns":{}},"World":{"FurnitureDesigns":{"Items":{}},"DecorationPresets":[]}}"#;
  let v:Value=serde_json::from_str(&list(raw).unwrap()).unwrap();assert_eq!(v["groups"][1]["status"],"unavailable");assert_eq!(v["groups"][2]["status"],"read");
 }

 #[test]
 fn review_uses_both_clothing_maps_and_does_not_reuse_deleted_ids(){
  let source=br#"{"GameInfo":{"Version":643},"Player":{"NextClothingDesignID":9,"FemaleClothingDesigns":{"30000001":{"Designs":{"3":{"Id":3,"Item":30000001,"Source":2,"PlatformAccountId":"PRIVATE","Future":1e-17}}}},"MaleClothingDesigns":{"30000002":{"Designs":{"7":{"Id":7,"Item":30000002}}}}},"World":{"FurnitureDesigns":{"Items":{},"NextDesignId":4},"DecorationPresets":[]}}"#;
  let backup=export(source,1).unwrap();
  let v:Value=serde_json::from_str(&review(source,&backup).unwrap()).unwrap();
  assert_eq!(v["matchingDesigns"],1);assert_eq!(v["existingDesignsForItem"],1);assert_eq!(v["allocatorConsistent"],true);assert_eq!(v["writerAuthorized"],false);
  assert!(!v.to_string().contains("PRIVATE"));assert!(!v.to_string().contains("Future"));
  let changed=String::from_utf8(source.to_vec()).unwrap().replace("\"NextClothingDesignID\":9","\"NextClothingDesignID\":7");
  let v:Value=serde_json::from_str(&review(changed.as_bytes(),&backup).unwrap()).unwrap();assert_eq!(v["allocatorConsistent"],false);
  let changed=backup.replace("\"gameSchema\":643","\"gameSchema\":626");
  let v:Value=serde_json::from_str(&review(source,&changed).unwrap()).unwrap();assert_eq!(v["schemaMatches"],false);
 }
 #[test]
 fn review_requires_full_target_group_and_preserves_unknowns(){
  let source=br#"{"GameInfo":{"Version":643},"Player":{"NextClothingDesignID":9,"FemaleClothingDesigns":{"30000001":{"Designs":{"3":{"Id":3,"Item":30000001,"Source":1,"Future":1e-17}}}},"MaleClothingDesigns":{}},"World":{"FurnitureDesigns":{"Items":{},"NextDesignId":4},"DecorationPresets":[]}}"#;
  let backup=export(source,1).unwrap();
  let changed=backup.replace("1e-17","2e-17");
  let v:Value=serde_json::from_str(&review(source,&changed).unwrap()).unwrap();assert_eq!(v["matchingDesigns"],0);
  let malformed=backup.replace("\"baseItemId\":30000001","\"baseItemId\":30000002");
  assert!(review(source,&malformed).is_err());
 }

 #[test]
 fn tom_rehearsal_allocates_fresh_id_and_retains_unknown_raw_values(){
  let target=br#"{"GameInfo":{"Version":643},"Player":{"NextClothingDesignID":9,"FemaleClothingDesigns":{},"MaleClothingDesigns":{"50000003":{"Designs":{"7":{"Id":7,"Item":50000003,"Source":1}}}},"Unrelated":9.123456789012345678e-123},"World":{"FurnitureDesigns":{"Items":{},"NextDesignId":4},"DecorationPresets":[]},"Other":{"Preserve":18446744073709551615}}"#;
  let backup=r#"{"schema":"wand.preset.native-backup@1","gameSchema":643,"kind":"tom-clothing","storage":"female","baseItemId":50000002,"payload":{"Id":2,"Item":50000002,"Source":2,"CreatorDisplayName":"Original","PlatformAccountId":"PRIVATE","Future":1.234567890123456789e-17}}"#;
  let candidate=tom_restore_rehearsal(target,backup).unwrap();
  assert!(candidate.contains("9.123456789012345678e-123"));assert!(candidate.contains("18446744073709551615"));
  assert!(candidate.contains("1.234567890123456789e-17"));assert!(candidate.contains("\"PlatformAccountId\":\"PRIVATE\""));
  let v:Value=serde_json::from_str(&candidate).unwrap();
  assert_eq!(v["Player"]["NextClothingDesignID"],10);
  assert_eq!(v["Player"]["FemaleClothingDesigns"]["50000002"]["Designs"]["9"]["Id"],9);
  assert_eq!(v["Player"]["FemaleClothingDesigns"]["50000002"]["Designs"]["9"]["Source"],2);
  assert_eq!(v["Player"]["MaleClothingDesigns"]["50000003"]["Designs"]["7"]["Id"],7);
  assert!(tom_restore_rehearsal(candidate.as_bytes(),backup).is_err());
  assert!(tom_restore_rehearsal(target,&backup.replace("\"gameSchema\":643","\"gameSchema\":624")).is_err());
 }
 #[test]
 fn tom_rehearsal_inserts_into_existing_map_without_rewriting_other_designs(){
  let target=br#"{"GameInfo":{"Version":643},"Player":{"FemaleClothingDesigns":{},"MaleClothingDesigns":{}},"World":{"FurnitureDesigns":{"Items":{"40000001":{"Extra":7e-9,"Designs":{"2":{"Id":2,"Item":40000001,"Source":1,"Decals":[]}}}},"NextDesignId":7},"DecorationPresets":[]}}"#;
  let backup=r#"{"schema":"wand.preset.native-backup@1","gameSchema":643,"kind":"tom-furniture","storage":"furniture","baseItemId":40000001,"payload":{"Id":1,"Item":40000001,"Source":1,"Decals":[{"Future":1e-90}]}}"#;
  let candidate=tom_restore_rehearsal(target,backup).unwrap();
  let v:Value=serde_json::from_str(&candidate).unwrap();
  assert_eq!(v["World"]["FurnitureDesigns"]["NextDesignId"],8);
  assert_eq!(v["World"]["FurnitureDesigns"]["Items"]["40000001"]["Designs"]["7"]["Id"],7);
  assert!(candidate.contains("\"Extra\":7e-9"));assert!(candidate.contains("\"2\":{\"Id\":2,\"Item\":40000001,\"Source\":1,\"Decals\":[]}"));
  let bad=String::from_utf8(target.to_vec()).unwrap().replace("\"NextDesignId\":7","\"NextDesignId\":2");
  assert!(tom_restore_rehearsal(bad.as_bytes(),backup).is_err());
 }

 #[test]
 fn inspect_native_detail_only_projects_known_fields(){
  let raw=r#"{"schema":"wand.preset.native-backup@1","gameSchema":643,"kind":"tom-furniture","storage":"furniture","baseItemId":40000001,"payload":{"Id":1,"Item":40000001,"CreatorDisplayName":"Creator","PlatformAccountId":"PRIVATE","Decals":[{"secret":"never"}],"Textures":[]}}"#;
  let result=inspect_backup(raw).unwrap();let v:Value=serde_json::from_str(&result).unwrap();assert_eq!(v["items"],json!([[40000001,1]]));assert_eq!(v["decalCount"],1);assert_eq!(v["creator"],"Creator");assert!(!result.contains("PRIVATE"));assert!(!result.contains("never"));
  let raw=r#"{"schema":"wand.preset.native-backup@1","gameSchema":643,"kind":"native-decoration","storage":"decoration","baseItemId":null,"payload":{"PresetName":"Test","StateFlags":0,"ShareInfo":{"Code":"PRIVATE"},"GridCollection":{"Grids":{"0":{"ID":0,"Objects":{"1":{"ID":1,"ItemID":40000001}}},"2":{"ID":2,"Objects":{"3":{"ID":3,"ItemID":40000001},"4":{"ID":4,"ItemID":40000002}}}}}}}"#;
  let result=inspect_backup(raw).unwrap();let v:Value=serde_json::from_str(&result).unwrap();assert_eq!(v["items"],json!([[40000001,2],[40000002,1]]));assert!(!result.contains("PRIVATE"));
 }

 #[test]
 fn decoration_restore_appends_after_tombstones_and_preserves_raw_order(){
  let target=br#"{"GameInfo":{"Version":643},"Player":{"Unknown":1e-17},"World":{"DecorationPresets":[{"PresetName":"Deleted","StateFlags":16}]},"Other":18446744073709551615}"#;
  let backup=r#"{"schema":"wand.preset.native-backup@1","gameSchema":643,"kind":"native-decoration","storage":"decoration","baseItemId":null,"payload":{"PresetName":"Scene","ThumbnailItems":[40000001],"StateFlags":0,"ShareInfo":null,"GridCollection":{"NextGridID":1,"DiffGrids":{},"Grids":{"0":{"ID":0,"GridDataPath":"","GridDefaultLayoutPath":"","TessellationFactor":2,"NextGridObjectID":1,"Objects":{"0":{"ID":0,"ItemID":40000001,"X":0,"Y":0,"Orientation":"GridOrientation_Up","State":null}}}}}}}"#;
  let copy=decoration_restore_candidate(target,backup).unwrap();
  assert!(copy.contains("\"Unknown\":1e-17"));assert!(copy.contains("18446744073709551615"));
  assert!(copy.contains("\"PresetName\":\"Deleted\",\"StateFlags\":16"));
  assert_eq!(decoration_slot_info(copy.as_bytes()).unwrap(),(1,2));
  assert!(decoration_restore_candidate(copy.as_bytes(),backup).is_err());
  assert!(decoration_restore_candidate(target,&backup.replace("\"ShareInfo\":null","\"ShareInfo\":{\"Code\":\"private\"}")).is_err());
  assert!(decoration_restore_candidate(target,&backup.replace("\"gameSchema\":643","\"gameSchema\":624")).is_err());
  let payload:Value=serde_json::from_str(backup).unwrap();
  let many=json!({"GameInfo":{"Version":643},"Player":{},"World":{"DecorationPresets":vec![payload["payload"].clone();20]}});
  assert!(decoration_restore_candidate(many.to_string().as_bytes(),&backup.replace("Scene","Different")).is_err());
 }

 #[test]
 fn replacement_preserves_physical_slot_count_and_unrelated_bytes(){
  let payload=r#"{"PresetName":"Scene","ThumbnailItems":[40000001],"StateFlags":0,"ShareInfo":null,"GridCollection":{"NextGridID":1,"DiffGrids":{},"Grids":{"0":{"ID":0,"GridDataPath":"","GridDefaultLayoutPath":"","TessellationFactor":2,"NextGridObjectID":1,"Objects":{"0":{"ID":0,"ItemID":40000001,"X":0,"Y":0,"Orientation":"GridOrientation_Up","State":null}}}}}}"#;
  let old=payload.replace("Scene","Old");
  let source=format!("{{\"GameInfo\":{{\"Version\":643}},\"Player\":{{}},\"World\":{{\"DecorationPresets\":[{{\"PresetName\":\"Deleted\",\"StateFlags\":16}},{},{}]}},\"Other\":1e-70}}",old,old.replace("\"ShareInfo\":null","\"ShareInfo\":{\"Code\":\"PRIVATE\"}"));
  let backup=format!("{{\"schema\":\"wand.preset.native-backup@1\",\"gameSchema\":643,\"kind\":\"native-decoration\",\"storage\":\"decoration\",\"baseItemId\":null,\"payload\":{}}}",payload);
  assert!(decoration_replace_candidate(source.as_bytes(),&backup,1).is_err());
  assert!(decoration_replace_candidate(source.as_bytes(),&backup,3).is_err());
  let candidate=decoration_replace_candidate(source.as_bytes(),&backup,2).unwrap();
  assert_eq!(decoration_slot_info(candidate.as_bytes()).unwrap(),(2,3));
  assert!(candidate.contains("\"Other\":1e-70"));assert!(candidate.contains("PRIVATE"));assert!(candidate.contains("Deleted"));
  let v:Value=serde_json::from_str(&candidate).unwrap();assert_eq!(v["World"]["DecorationPresets"][1]["PresetName"],"Scene");
 }
 #[test]
 fn positive_base_stock_does_not_infer_missing(){
  let raw=br#"{"Player":{"ListInventories":{"0":{"ID":0,"CompatibleItemType":"Furniture","Inventory":{"40000001":{"Amount":2},"40000002":{"Amount":0}}},"1":{"ID":1,"CompatibleItemType":"ItemType_Clothing","Inventory":{"50000001":{"Amount":1}}}}}}"#;
  assert_eq!(positive_base_stock(raw,"tom-furniture",40000001),Some(2));assert_eq!(positive_base_stock(raw,"tom-furniture",40000002),None);
  assert_eq!(positive_base_stock(raw,"tom-furniture",40000003),None);assert_eq!(positive_base_stock(raw,"tom-clothing",50000001),Some(1));
 }
}
