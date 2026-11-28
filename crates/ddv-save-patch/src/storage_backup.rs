use super::{JsonLocator,QuantityTarget,Segment,k,validate_json_without_edit,storage_pose,PatchError};
use serde_json::{Value,json};
use std::collections::{BTreeMap,HashMap,HashSet};
const BAD:PatchError=PatchError::InvalidTarget;
const LIMIT:usize=4*1024*1024;
const SCHEMA:&str="wand.private.storage-contents@1";
fn id(v:&Value)->Option<u32>{v.as_u64().and_then(|n|u32::try_from(n).ok()).filter(|n|*n>0)}
fn simple_inventory(v:&Value)->bool{
 v.as_array().is_some_and(|a|a.len()<=8192&&a.iter().all(|s|s.as_object().is_some_and(|m|m.keys().all(|k|matches!(k.as_str(),"ItemID"|"Amount"|"State")))&&
 s["ItemID"].as_u64().is_some_and(|n|n<=u32::MAX as u64)&&s["Amount"].as_u64().is_some_and(|n|n<=i32::MAX as u64)&&s.get("State").is_none_or(Value::is_null)))
}
fn count_refs(v:&Value,marked:bool,counts:&mut HashMap<u32,usize>){
 match v{
  Value::Object(m)=>for(k,v)in m{let k=k.to_ascii_lowercase();if k!="nextcontainerinventoryid"{count_refs(v,marked||k.contains("container")&&k.contains("id"),counts);}},
  Value::Array(a)=>for v in a{count_refs(v,marked,counts);},
  _=>if marked{if let Some(n)=id(v){*counts.entry(n).or_default()+=1;}}
 }
}
fn snapshot(root:&Value)->Result<Value,PatchError>{
 if root["GameInfo"]["Version"].as_u64()!=Some(643){return Err(BAD);}
 let collection=&root["World"]["GridCollection"];
 let grids=collection["Grids"].as_object().filter(|m|m.len()<=100_000).ok_or(BAD)?;
 let diff=collection.get("DiffGrids");if diff.is_some_and(|v|!v.is_object()){return Err(BAD);}
 let containers=root["Player"]["ContainerInventories"].as_object().filter(|m|m.len()<=8192).ok_or(BAD)?;
 let mut refs=HashMap::new();count_refs(root,false,&mut refs);
 let mut roots=BTreeMap::<u32,Vec<Value>>::new();let mut rejected=HashSet::new();let mut total=0usize;
 for(gid,g)in grids{
  let Some(objects)=g["Objects"].as_object()else{continue;};
  total=total.checked_add(objects.len()).filter(|n|*n<=200_000).ok_or(BAD)?;
  for(oid,o)in objects{
   let Some(n)=id(&o["State"]["Storage"]["ContainerInventoryID"])else{continue;};
   let st=&o["State"]["Storage"];
   let path=g["GridDataPath"].as_str().filter(|s|s.len()<=1024);
   let item=id(&o["ItemID"]);
   if !storage_pose(root,o)||id(&g["ID"]).is_none_or(|v|v.to_string()!=*gid)||id(&o["ID"]).is_none_or(|v|v.to_string()!=*oid)||diff.is_some_and(|v|v.get(gid).is_some())||
     item.is_none_or(|v|v/100_000!=400)||path.is_none()||
     st!=&json!({"ContainerInventoryID":n,"DefaultContainerInventoryData":st["DefaultContainerInventoryData"],"UnlockKeyItemID":0,"UnlockLocId":"","DesignID":null}){
    rejected.insert(n);continue;
   }
   roots.entry(n).or_default().push(json!({"grid":gid,"object":oid,"path":path.unwrap(),"state":o["State"]}));
  }
 }
 let mut rows=Vec::new();let mut skipped=0usize;
 for(n,mut witnesses)in roots{
  let c=&containers[&n.to_string()];
  let size=id(&c["Size"]);let parent=id(&c["ParentItemID"]);
  if rejected.contains(&n)||refs.get(&n).copied()!=Some(witnesses.len())||size.is_none_or(|s|s>8192)||parent.is_none()||
    c.as_object().is_none_or(|m|m.len()!=7||m.keys().any(|k|!matches!(k.as_str(),"ID"|"Size"|"Inventory"|"BelongsToPlayer"|"BlockMoveTo"|"ParentItemID"|"ExtraSize")))||
    c["BlockMoveTo"].as_bool()!=Some(false)||c["ExtraSize"].as_u64().is_none()||!simple_inventory(&c["Inventory"]){skipped+=1;continue;}
  witnesses.sort_by_cached_key(Value::to_string);
  let mut metadata=c.clone();metadata.as_object_mut().ok_or(BAD)?.remove("Inventory");
  rows.push(json!({"id":n,"metadata":metadata,"roots":witnesses,"inventory":c["Inventory"]}));
 }
 // Unmatched or unverified player-owned containers are not silently restored.
 let included:HashSet<_>=rows.iter().filter_map(|r|id(&r["id"])).collect();
 skipped=containers.iter().filter(|(_,c)|c["BelongsToPlayer"].as_bool()==Some(true)&&id(&c["ID"]).is_none_or(|n|!included.contains(&n))).count().max(skipped);
 Ok(json!({"schema":SCHEMA,"version":643,"skipped":skipped,"rows":rows}))
}
pub fn export(source:&str)->Result<String,PatchError>{
 validate_json_without_edit(source)?;
 let root:Value=serde_json::from_str(source).map_err(|_|BAD)?;
 let raw=snapshot(&root)?.to_string();if raw.len()>LIMIT{return Err(BAD);}Ok(raw)
}
pub fn restore(source:&str,backup:&str)->Result<String,PatchError>{
 if backup.len()>LIMIT{return Err(BAD);}
 validate_json_without_edit(source)?;validate_json_without_edit(backup)?;
 let root:Value=serde_json::from_str(source).map_err(|_|BAD)?;
 let b:Value=serde_json::from_str(backup).map_err(|_|BAD)?;
 if b.as_object().is_none_or(|m|m.len()!=4)||b["schema"].as_str()!=Some(SCHEMA)||b["version"].as_u64()!=Some(643)||b["skipped"].as_u64().is_none(){return Err(BAD);}
 let current=snapshot(&root)?;
 let available:HashMap<_,_>=current["rows"].as_array().ok_or(BAD)?.iter().map(|r|(id(&r["id"]).unwrap(),r)).collect();
 let mut locator=JsonLocator::new(source,QuantityTarget::Inventory{inventory_id:"1".into(),item_id:"1".into()})?;
 locator.amount_path=vec![Segment::Index(usize::MAX)];
 let mut changes=Vec::new();let mut seen=HashSet::new();
 for r in b["rows"].as_array().filter(|a|!a.is_empty()&&a.len()<=8192).ok_or(BAD)?{
  let n=id(&r["id"]).filter(|n|seen.insert(*n)).ok_or(BAD)?;
  let c=available.get(&n).ok_or(BAD)?;
  if r.as_object().is_none_or(|m|m.len()!=4)||r["metadata"]!=c["metadata"]||r["roots"]!=c["roots"]||!simple_inventory(&r["inventory"]){return Err(BAD);}
  if r["inventory"]==c["inventory"]{continue;}
  let p=vec![k("Player"),k("ContainerInventories"),k(&n.to_string()),k("Inventory")];
  locator.capture.insert(p.clone(),None);changes.push((p,r["inventory"].to_string()));
 }
 if changes.is_empty(){return Err(BAD);}
 locator.walk_complete()?;
 let mut edits=changes.into_iter().map(|(p,v)|Ok((locator.capture.get(&p).and_then(Clone::clone).ok_or(BAD)?,v))).collect::<Result<Vec<_>,PatchError>>()?;
 edits.sort_unstable_by_key(|(r,_)|r.start);
 let mut out=String::new();let mut last=0;
 for(r,v)in edits{if r.start<last{return Err(BAD);}out.push_str(&source[last..r.start]);out.push_str(&v);last=r.end;}
 out.push_str(&source[last..]);validate_json_without_edit(&out)?;Ok(out)
}
#[cfg(test)]
mod tests{
 use super::*;
 const SAVE:&str=r#"{"GameInfo":{"Version":643},"Player":{"ContainerInventories":{"9":{"ID":9,"ParentItemID":40001680,"Size":48,"Inventory":[{"ItemID":30000001,"Amount":5,"State":null}],"BelongsToPlayer":true,"BlockMoveTo":false,"ExtraSize":0}}},"World":{"GridCollection":{"Grids":{"42":{"ID":42,"GridDataPath":"GridData/Rooms/Room8x8-GridData.json","Objects":{"1":{"ID":1,"ItemID":40001680,"X":1,"Y":2,"Orientation":"GridOrientation_Down","State":{"Storage":{"ContainerInventoryID":9,"DefaultContainerInventoryData":"Chest_48Slot","UnlockKeyItemID":0,"UnlockLocId":"","DesignID":null}}}}}}}},"Marker":1e2}"#;
 #[test]fn private_storage_roundtrip_preserves_unrelated_bytes(){
  let backup=export(SAVE).unwrap();let doc:Value=serde_json::from_str(&backup).unwrap();assert_eq!(doc["rows"].as_array().unwrap().len(),1);
  let changed=SAVE.replace("\"Amount\":5","\"Amount\":3");
  assert_eq!(restore(&changed,&backup).unwrap(),SAVE);
  assert!(restore(SAVE,&backup).is_err());
  assert!(restore(&changed.replace("\"Size\":48","\"Size\":32"),&backup).is_err());
  let unknown=changed.replace("\"State\":null","\"State\":{\"Unknown\":1}");
  assert!(restore(&unknown,&backup).is_err());
  let extra=changed.replace("\"Marker\":1e2","\"OtherContainerInventoryID\":9,\"Marker\":1e2");
  assert!(restore(&extra,&backup).is_err());
  let v:Value=serde_json::from_str(&export(&unknown).unwrap()).unwrap();assert_eq!(v["skipped"],1);assert_eq!(v["rows"],json!([]));
 }
}
