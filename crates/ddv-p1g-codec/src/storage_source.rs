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
  // The original player-house template independently proves this Item ID.
  if row.is_none(){return Some(("Chest_48Slot",48));}
 }
 let m=row?.as_object()?;
 if m.keys().any(|k|!matches!(k.as_str(),"DefaultContainerInventoryData"|"UnlockKeyItemID"|"UnlockLocId"))||
    m.get("UnlockKeyItemID").is_some_and(|v|v.as_u64()!=Some(0))||
    m.get("UnlockLocId").is_some_and(|v|v.as_str()!=Some("")){return None;}
 match m.get("DefaultContainerInventoryData")?.as_str()?{"Chest_48Slot"=>Some(("Chest_48Slot",48)),_=>None}
}
#[cfg(test)]
mod tests{
 use super::*;
 #[test]fn original_container_attribute_is_recognized(){
  assert!(is_storage(40000047));assert_eq!(initial_storage_template(40000047),None);
  assert!(!is_storage(99999999));
 }
}
