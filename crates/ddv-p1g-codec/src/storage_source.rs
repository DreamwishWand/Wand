use serde_json::Value;
use std::sync::OnceLock;
fn rows()->&'static Value{
 static ROWS:OnceLock<Value>=OnceLock::new();
 ROWS.get_or_init(||serde_json::from_str(include_str!(concat!(env!("OUT_DIR"),"/storage-source.json"))).expect("compiled storage source"))
}
/// Only the native 48-slot default has independently verified initialization
/// bytes. Other container definitions stay identifiable but are not guessed.
pub(super) fn is_storage(id:u64)->bool{id==40001680||rows().get(id.to_string()).is_some()}
pub(super) fn initial_storage_template(id:u64)->Option<(&'static str,u32)>{
 let row=rows().get(id.to_string());
 if id==40001680{
  // The original player-house template independently proves this Item ID,
  // including the unlocked state and the 48-slot template initialization.
  if row.and_then(|r|r.get("DefaultContainerInventoryData")).is_none_or(|v|v.as_str()==Some("Chest_48Slot")){return Some(("Chest_48Slot",48));}
 }
 let m=row?.as_object()?;
 if m.keys().any(|k|!matches!(k.as_str(),"DefaultContainerInventoryData"|"UnlockKeyItemID"|"UnlockLocId"))||
    m.get("UnlockKeyItemID").is_some_and(|v|v.as_u64()!=Some(0))||
    m.get("UnlockLocId").is_some_and(|v|v.as_str()!=Some("")){return None;}
 match m.get("DefaultContainerInventoryData")?.as_str()?{"Chest_48Slot"=>Some(("Chest_48Slot",48)),_=>None}
}
fn unlocked_source_template(id:u64)->Option<&'static str>{
 let m=rows().get(id.to_string())?.as_object()?;
 if m.keys().any(|k|!matches!(k.as_str(),"DefaultContainerInventoryData"|"UnlockKeyItemID"|"UnlockLocId"))||
    m.get("UnlockKeyItemID").is_some_and(|v|v.as_u64()!=Some(0))||
    m.get("UnlockLocId").is_some_and(|v|v.as_str()!=Some("")){return None;}
 m.get("DefaultContainerInventoryData")?.as_str()
}
/// An additional native template may be used only when a complete, unlocked,
/// player-owned instance in the opened save corroborates the pinned
/// ContainerInteraction attribute and exact container metadata. Inventory
/// contents are not copied: occupied and empty instances provide the same
/// initialization witness. No size is inferred from the template name.
pub(super) fn placement_storage_template(root:&Value,item:u64)->Option<(&'static str,u32)>{
 if let Some(t)=initial_storage_template(item){return Some(t);}
 if root["GameInfo"]["Version"].as_u64()!=Some(643){return None;}
 let template=unlocked_source_template(item)?;
 let grids=root["World"]["GridCollection"]["Grids"].as_object()?;
 let diffs=root["World"]["GridCollection"].get("DiffGrids");
 if grids.len()>100_000||diffs.is_some_and(|v|!v.is_object()){return None;}
 let mut observed=None;let mut scanned=0usize;
 for (key,grid) in grids{
  if grid["ID"].as_u64().is_none_or(|n|n.to_string()!=*key)||diffs.is_some_and(|v|v.get(key).is_some()){continue;}
  let Some(objects)=grid["Objects"].as_object()else{continue;};
  scanned=scanned.checked_add(objects.len())?;if scanned>200_000{return None;}
  for (key,obj) in objects{
   if obj["ID"].as_u64().is_none_or(|n|n==0||n.to_string()!=*key)||obj.as_object().is_none_or(|m|m.len()!=6||m.keys().any(|k|!matches!(k.as_str(),"ID"|"ItemID"|"X"|"Y"|"Orientation"|"State"))){continue;}
   let Some(source_item)=obj["ItemID"].as_u64()else{continue;};
   if unlocked_source_template(source_item)!=Some(template)||!ddv_save_patch::storage_pose(root,obj){continue;}
   let Some(id)=obj["State"]["Storage"]["ContainerInventoryID"].as_u64()else{continue;};
   let c=&root["Player"]["ContainerInventories"][id.to_string()];
   let Some(size)=c["Size"].as_u64().and_then(|n|u32::try_from(n).ok())else{continue;};
   if obj["State"]!=serde_json::json!({"Storage":{"ContainerInventoryID":id,"DefaultContainerInventoryData":template,"UnlockKeyItemID":0,"UnlockLocId":"","DesignID":null}})||
      c["Inventory"].as_array().is_none_or(|a|a.len()>8192)||
      *c!=serde_json::json!({"ID":id,"ParentItemID":source_item,"Size":size,"Inventory":c["Inventory"],"BelongsToPlayer":true,"BlockMoveTo":false,"ExtraSize":0}){continue;}
   if !ddv_save_patch::standard_storage_capacity(template,size)||observed.is_some_and(|n|n!=size){return None;}
   observed=Some(size);
  }
 }
 Some((template,observed?))
}
/// Reuse the same source/template proof for all inventory candidates.
 /// A template's witnessed capacity is shared only among items with the
 /// identical unlocked original ContainerInteraction template.
pub(super) fn placement_storage_items(root:&Value,ids:impl Iterator<Item=u64>)->Vec<u64>{
 let mut observed=std::collections::HashMap::<&'static str,bool>::new();
 ids.filter(|item|{
  if initial_storage_template(*item).is_some(){return true;}
  let Some(template)=unlocked_source_template(*item)else{return false;};
  *observed.entry(template).or_insert_with(||placement_storage_template(root,*item).is_some())
 }).collect()
}
/// An area decoration preset contains only a pose, not container payload.
/// Only a canonical empty container that can be regenerated exactly is portable.
pub(super) fn restorable_empty_storage(root:&Value,obj:&Value,item:u64)->bool{
 let Some((template,size))=initial_storage_template(item)else{return false;};
 if !ddv_save_patch::storage_pickup_eligible(root,obj){return false;}
 let Some(id)=obj["State"]["Storage"]["ContainerInventoryID"].as_u64()else{return false;};
 obj["State"]==serde_json::json!({"Storage":{"ContainerInventoryID":id,"DefaultContainerInventoryData":template,"UnlockKeyItemID":0,"UnlockLocId":"","DesignID":null}})&&
 root["Player"]["ContainerInventories"][id.to_string()]==serde_json::json!({"ID":id,"ParentItemID":item,"Size":size,"Inventory":[],"BelongsToPlayer":true,"BlockMoveTo":false,"ExtraSize":0})
}
#[cfg(test)]
mod tests{
 use super::*;
 #[test]fn area_storage_requires_exact_reconstructible_empty_container(){
  let obj=serde_json::json!({"ItemID":40001680,"State":{"Storage":{"ContainerInventoryID":9,"DefaultContainerInventoryData":"Chest_48Slot","UnlockKeyItemID":0,"UnlockLocId":"","DesignID":null}}});
  let mut root=serde_json::json!({"Player":{"ContainerInventories":{"9":{"ID":9,"ParentItemID":40001680,"Size":48,"Inventory":[],"BelongsToPlayer":true,"BlockMoveTo":false,"ExtraSize":0}}}});
  assert!(restorable_empty_storage(&root,&obj,40001680));
  root["Player"]["ContainerInventories"]["9"]["ExtraSize"]=2.into();
  assert!(!restorable_empty_storage(&root,&obj,40001680));
  root["Player"]["ContainerInventories"]["9"]["ExtraSize"]=0.into();
  root["Player"]["ContainerInventories"]["9"]["Inventory"]=serde_json::json!([{"ItemID":30000001,"Amount":1}]);
  assert!(!restorable_empty_storage(&root,&obj,40001680));
 }
 #[test]fn additional_template_requires_source_and_exact_owned_metadata_witness(){
  let id=40000047;
  let mut root=serde_json::json!({"GameInfo":{"Version":643},"Player":{"ContainerInventories":{"9":{"ID":9,"ParentItemID":id,"Size":16,"Inventory":[],"BelongsToPlayer":true,"BlockMoveTo":false,"ExtraSize":0}}},"World":{"GridCollection":{"Grids":{"42":{"ID":42,"Objects":{"1":{"ID":1,"ItemID":id,"X":1,"Y":2,"Orientation":"GridOrientation_Down","State":{"Storage":{"ContainerInventoryID":9,"DefaultContainerInventoryData":"Furniture_16Slot","UnlockKeyItemID":0,"UnlockLocId":"","DesignID":null}}}}}}}}});
  assert_eq!(placement_storage_template(&root,id),Some(("Furniture_16Slot",16)));
  assert_eq!(initial_storage_template(id),None);
  root["Player"]["ContainerInventories"]["9"]["Inventory"]=serde_json::json!([{"ItemID":30000001,"Amount":12,"State":null}]);
  assert_eq!(placement_storage_template(&root,id),Some(("Furniture_16Slot",16)));
  root["Player"]["ContainerInventories"]["9"]["Inventory"]=serde_json::json!([{"ItemID":30000001,"Amount":1,"State":{"Unknown":{"Value":7}}}]);
  assert_eq!(placement_storage_template(&root,id),Some(("Furniture_16Slot",16)));
  assert!(!restorable_empty_storage(&root,&root["World"]["GridCollection"]["Grids"]["42"]["Objects"]["1"],id));
  root["Player"]["ContainerInventories"]["9"]["Inventory"]=serde_json::json!({"unexpected":true});
  assert_eq!(placement_storage_template(&root,id),None);
  root["Player"]["ContainerInventories"]["9"]["Inventory"]=serde_json::json!([]);
  root["Player"]["ContainerInventories"]["9"]["Size"]=48.into();
  assert_eq!(placement_storage_template(&root,id),None);
  root["Player"]["ContainerInventories"]["9"]["Size"]=16.into();
  root["Player"]["ContainerInventories"]["9"]["ExtraSize"]=1.into();
  assert_eq!(placement_storage_template(&root,id),None);
  root["Player"]["ContainerInventories"]["9"]["ExtraSize"]=0.into();
  root["World"]["GridCollection"]["DiffGrids"]=serde_json::json!({"42":{}});
  assert_eq!(placement_storage_template(&root,id),None);
 }
 #[test]fn original_container_attribute_is_recognized(){
  assert!(is_storage(40000047));assert_eq!(initial_storage_template(40000047),None);
  assert!(!is_storage(99999999));
 }
}

/// Positive GridAreaData evidence, minus all reviewed special/interacting
/// Furniture fields. This is a source-derived experimental placement candidate
/// set, not proof that the runtime can initialize every item in every scene.
pub(super) fn plain_source_items()->&'static Vec<u64>{
 static ITEMS:OnceLock<Vec<u64>>=OnceLock::new();
 ITEMS.get_or_init(||serde_json::from_str(include_str!(concat!(env!("OUT_DIR"),"/plain-furniture-source.json"))).expect("compiled plain furniture source"))
}
pub(super) fn support_source_path(id:u64)->Option<&'static str>{
 static SUPPORT:OnceLock<Value>=OnceLock::new();
 SUPPORT.get_or_init(||serde_json::from_str(include_str!(concat!(env!("OUT_DIR"),"/support-source.json"))).expect("compiled support source")).get(id.to_string())?.as_str()
}
/// Establish the child factor from a matching, exclusively owned native
/// Grid. The original source proves the owner/path, not the saved factor.
pub(super) fn initial_support_trees(root:&Value,ids:impl Iterator<Item=u64>)->std::collections::HashMap<u64,Value>{
 use std::collections::{HashMap,HashSet};
 let mut out=HashMap::new();
 if root["GameInfo"]["Version"].as_u64()!=Some(643){return out;}
 let collection=&root["World"]["GridCollection"];
 let Some(grids)=collection["Grids"].as_object()else{return out;};
 let diff=collection.get("DiffGrids");
 if grids.len()>100_000||diff.is_some_and(|d|!d.is_object()){return out;}
 static TERRAIN:OnceLock<Value>=OnceLock::new();
 let terrain=TERRAIN.get_or_init(||serde_json::from_str(include_str!("../../../static/ddv/world/steam-1.26.2/support-terrain.json")).expect("support terrain"));
 let paths:HashSet<&str>=terrain["grids"].as_array().into_iter().flatten().filter_map(|row|row[0].as_str()).collect();
 let mut refs=HashMap::<u64,usize>::new();let mut witnesses=Vec::new();let mut count=0usize;
 for (scope,field) in [(Some(grids),"Objects"),(diff.and_then(Value::as_object),"ModifiedObjects")]{
  for (gid,g) in scope.into_iter().flatten(){
   let Some(objects)=g[field].as_object()else{continue;};
   count=count.saturating_add(objects.len());if count>200_000{return out;}
   for (oid,obj) in objects{
    let Some(child)=obj["State"]["SubGrid"]["GridID"].as_u64().filter(|n|*n>0)else{continue;};
    *refs.entry(child).or_default()+=1;
    if field!="Objects"||g["ID"].as_u64().is_none_or(|n|n.to_string()!=*gid)||diff.is_some_and(|d|d.get(gid).is_some())||
      obj["ID"].as_u64().is_none_or(|n|n==0||n.to_string()!=*oid)||
      obj["State"].as_object().is_none_or(|m|m.len()!=1)||obj["State"]["SubGrid"].as_object().is_none_or(|m|m.keys().any(|k|!matches!(k.as_str(),"GridID"|"DesignID"))||m.get("DesignID").is_some_and(|v|!v.is_null())){continue;}
    let Some(path)=obj["ItemID"].as_u64().and_then(support_source_path)else{continue;};
    if !paths.contains(path){continue;}
    let key=child.to_string();let Some(grid)=grids.get(&key)else{continue;};
    if diff.is_some_and(|d|d.get(&key).is_some())||grid["ID"].as_u64()!=Some(child)||grid["GridDataPath"].as_str()!=Some(path)||
       grid.get("GridDefaultLayoutPath").is_some_and(|v|!v.is_null()&&v.as_str()!=Some(""))||
       grid.as_object().is_none_or(|m|m.keys().any(|k|!matches!(k.as_str(),"ID"|"Objects"|"GridDataPath"|"TessellationFactor"|"NextGridObjectID"|"GridDefaultLayoutPath"))){continue;}
    if let Some(factor)=grid["TessellationFactor"].as_u64().filter(|n|matches!(n,1|2)){witnesses.push((child,path,factor));}
   }
  }
 }
 let mut factors=HashMap::new();let mut conflicts=HashSet::new();
 for (child,path,factor) in witnesses{if refs.get(&child)!=Some(&1){continue;}if factors.insert(path,factor).is_some_and(|old|old!=factor){conflicts.insert(path);}}
 for id in ids{
  if is_storage(id){continue;}
  let Some(path)=support_source_path(id)else{continue;};
  if conflicts.contains(path){continue;}
  if let Some(factor)=factors.get(path){out.insert(id,serde_json::json!({"factor":factor,"sourcePath":path,"objects":[]}));}
 }
 out
}
pub(super) fn is_plain_source_item(id:u64)->bool{!is_storage(id)&&support_source_path(id).is_none()&&plain_source_items().binary_search(&id).is_ok()}
