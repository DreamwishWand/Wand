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
}
