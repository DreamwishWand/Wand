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
 #[test]fn original_container_attribute_is_recognized(){
  assert!(is_storage(40000047));assert_eq!(initial_storage_template(40000047),None);
  assert!(!is_storage(99999999));
 }
}
