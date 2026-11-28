//! Atomic field ItemInstance recovery. No game runtime or catalog authority
//! is inferred here; the codec checks exact source definitions and references.
use super::{GridCoordinateTarget,GridObjectKind,PatchError,QuantityTarget,JsonLocator,Segment,k,validate_json_without_edit,preview_existing_quantity,room_lexical_map_edit,storage_transform_pose};
use serde_json::{Value,json};
const BAD:PatchError=PatchError::InvalidTarget;
#[derive(Debug,Clone,PartialEq,Eq)]
pub struct RecoveryDestination{
 pub container_id:String,
 pub parent_item:Option<u64>,
 pub owner:Option<GridCoordinateTarget>,
 pub capacity:u32,
 pub used:u32,
}
fn key_id(s:&str)->Option<u32>{s.parse::<u32>().ok().filter(|n|n.to_string()==s)}
fn empty_slot(row:&Value)->bool{
 row.as_object().is_some_and(|m|matches!(m.len(),2|3)&&m.keys().all(|k|matches!(k.as_str(),"ItemID"|"Amount"|"State")))&&
 row["ItemID"].as_u64()==Some(0)&&row["Amount"].as_u64()==Some(0)&&row.get("State").is_none_or(Value::is_null)
}
fn empty_grid_state(value:Option<&Value>)->bool{
 value.is_none_or(|v|v.is_null()||v.as_object().is_some_and(|m|m.is_empty()))
}

/// Only player-owned, writable, structurally known inventory arrays.
/// A parentless container is displayed as Inventory, not assumed to be
/// a specific backpack slot on every game version.
pub fn destinations(root:&Value)->Result<Vec<RecoveryDestination>,PatchError>{
 let containers=root["Player"]["ContainerInventories"].as_object().filter(|m|m.len()<=8192).ok_or(BAD)?;
 let collection=&root["World"]["GridCollection"];
 let grids=collection["Grids"].as_object().filter(|m|m.len()<=100_000).ok_or(BAD)?;
 let diff=collection.get("DiffGrids");if diff.is_some_and(|v|!v.is_object()){return Err(BAD);}
 let mut owners=std::collections::HashMap::<u64,Vec<GridCoordinateTarget>>::new();
 let mut total=0usize;
 for (group,field,kind) in [(Some(grids),"Objects",GridObjectKind::Full),(diff.and_then(Value::as_object),"ModifiedObjects",GridObjectKind::DiffModified)]{
  for (gid,g) in group.into_iter().flatten(){
   let Some(objects)=g.get(field).and_then(Value::as_object)else{continue;};
   total=total.checked_add(objects.len()).filter(|n|*n<=200_000).ok_or(BAD)?;
   for (oid,o) in objects{
    if let Some(cid)=o["State"]["Storage"]["ContainerInventoryID"].as_u64(){
     owners.entry(cid).or_default().push(GridCoordinateTarget{kind:kind.clone(),grid_id:gid.clone(),object_id:oid.clone(),item_id:o["ItemID"].as_u64().unwrap_or(0)});
    }
   }
  }
 }
 let mut rows=Vec::new();
 for (id,c) in containers{
  let Some(n)=key_id(id)else{continue;};
  if c["ID"].as_u64()!=Some(u64::from(n))||c["BelongsToPlayer"]!=true||c["BlockMoveTo"]!=false||
   c.as_object().is_none_or(|m|m.len()!=7||m.keys().any(|k|!matches!(k.as_str(),"ID"|"ParentItemID"|"Size"|"Inventory"|"BelongsToPlayer"|"BlockMoveTo"|"ExtraSize")))||
   c["ExtraSize"].as_u64().is_none(){continue;}
  let Some(capacity)=c["Size"].as_u64().and_then(|n|u32::try_from(n).ok()).filter(|n|*n>0&&*n<=8192)else{continue;};
  let Some(inv)=c["Inventory"].as_array().filter(|a|a.len()<=8192)else{continue;};
  // Existing slots are opaque. Never coerce or overwrite unknown fields.
  let refs=owners.get(&u64::from(n)).map(Vec::as_slice).unwrap_or(&[]);
  let (parent_item,owner)=if c["ParentItemID"].is_null()||c["ParentItemID"].as_u64()==Some(0){
   if !refs.is_empty(){continue;}(None,None)
  }else{
   let Some(item)=c["ParentItemID"].as_u64().filter(|n|*n>0)else{continue;};
   let [target]=refs else{continue;};
   if target.kind!=GridObjectKind::Full||target.item_id!=item||key_id(&target.grid_id).is_none()||key_id(&target.object_id).is_none_or(|n|n==0)||diff.is_some_and(|d|d.get(&target.grid_id).is_some()){continue;}
   let g=&grids[&target.grid_id];let o=&g["Objects"][&target.object_id];
   if g["ID"].as_u64()!=key_id(&target.grid_id).map(u64::from)||o["ID"].as_u64()!=key_id(&target.object_id).map(u64::from)||!storage_transform_pose(root,o){continue;}
   (Some(item),Some(target.clone()))
  };
  rows.push(RecoveryDestination{container_id:id.clone(),parent_item,owner,capacity,used:inv.iter().filter(|row|!empty_slot(row)).count() as u32});
 }
 rows.sort_by_key(|r|r.container_id.parse::<u32>().unwrap_or(u32::MAX));Ok(rows)
}
pub fn stateless_field_object(root:&Value,target:&GridCoordinateTarget,expected:(i32,i32),orientation:&str)->bool{
 if target.kind!=GridObjectKind::Full||target.item_id==0||target.item_id>u32::MAX as u64||key_id(&target.object_id).is_none_or(|n|n==0)||key_id(&target.grid_id).is_none(){return false;}
 let collection=&root["World"]["GridCollection"];let g=&collection["Grids"][&target.grid_id];let o=&g["Objects"][&target.object_id];
 root["GameInfo"]["Version"].as_u64()==Some(643)&&g["ID"].as_u64()==key_id(&target.grid_id).map(u64::from)&&
 collection.get("DiffGrids").is_none_or(|v|v.as_object().is_some_and(|m|!m.contains_key(&target.grid_id)))&&
 o.as_object().is_some_and(|m|matches!(m.len(),5|6)&&m.keys().all(|k|matches!(k.as_str(),"ID"|"ItemID"|"X"|"Y"|"Orientation"|"State")))&&
 o["ID"].as_u64()==key_id(&target.object_id).map(u64::from)&&o["ItemID"].as_u64()==Some(target.item_id)&&
 o["X"].as_i64()==Some(i64::from(expected.0))&&o["Y"].as_i64()==Some(i64::from(expected.1))&&o["Orientation"].as_str()==Some(orientation)&&
 super::OBSERVED_CARDINAL_ORIENTATIONS.contains(&orientation)&&empty_grid_state(o.get("State"))
}
/// Recover exactly one stateless field record as one item. A known existing
/// null-State stack is incremented or a fresh row appended. No overwrite of
/// another variant, no inferred stack limit, no allocation outside capacity.
pub fn recover(source:&str,target:&GridCoordinateTarget,expected:(i32,i32),orientation:&str,container:&str)->Result<String,PatchError>{
 validate_json_without_edit(source)?;
 let root:Value=serde_json::from_str(source).map_err(|_|BAD)?;
 if !stateless_field_object(&root,target,expected,orientation){return Err(BAD);}
 let dest=destinations(&root)?.into_iter().find(|r|r.container_id==container).ok_or(BAD)?;
 let inventory=&root["Player"]["ContainerInventories"][container]["Inventory"];
 let rows=inventory.as_array().ok_or(BAD)?;
 let mut expected_root=root.clone();
 let expected_inv=expected_root["Player"]["ContainerInventories"][container]["Inventory"].as_array_mut().ok_or(BAD)?;
 let stack=rows.iter().enumerate().find_map(|(i,row)|{
  if row["ItemID"].as_u64()!=Some(target.item_id)||row.get("State").is_some_and(|s|!s.is_null())||row.as_object().is_none_or(|m|m.keys().any(|k|!matches!(k.as_str(),"ItemID"|"Amount"|"State"))){return None;}
  row["Amount"].as_u64().filter(|n|*n>0&&*n<i32::MAX as u64).map(|n|(i,n))
 });
 let with_item=if let Some((index,n))=stack{
  expected_inv[index]["Amount"]=(n+1).into();
  preview_existing_quantity(source,QuantityTarget::ChestSlot{container_id:container.into(),slot_index:index,item_id:target.item_id},n,n+1)?.patched_json
 }else{
  if dest.used>=dest.capacity{return Err(BAD);}
  let entry=json!({"ItemID":target.item_id,"Amount":1,"State":null});
  let empty=rows.iter().take(dest.capacity as usize).position(empty_slot);
  let mut path=vec![k("Player"),k("ContainerInventories"),k(container),k("Inventory")];
  if let Some(i)=empty{path.push(Segment::Index(i));expected_inv[i]=entry.clone();}
  else{if rows.len()>=dest.capacity as usize{return Err(BAD);}expected_inv.push(entry.clone());}
  let mut loc=JsonLocator::new(source,QuantityTarget::Inventory{inventory_id:"1".into(),item_id:"1".into()})?;
  loc.amount_path=vec![Segment::Index(usize::MAX)];loc.capture.insert(path.clone(),None);loc.walk_complete()?;
  let span=loc.capture.get(&path).and_then(|v|v.clone()).ok_or(BAD)?;
  if empty.is_some(){
   format!("{}{}{}",&source[..span.start],entry,&source[span.end..])
  }else{
   let at=span.end.checked_sub(1).ok_or(BAD)?;
   if source.as_bytes().get(at)!=Some(&b']'){return Err(BAD);}
   format!("{}{}{}{}",&source[..at],if rows.is_empty(){""}else{","},entry,&source[at..])
  }
 };
 let parent=vec![k("World"),k("GridCollection"),k("Grids"),k(&target.grid_id),k("Objects")];
 let result=room_lexical_map_edit(&with_item,parent,&target.object_id,None)?;
 expected_root["World"]["GridCollection"]["Grids"][&target.grid_id]["Objects"].as_object_mut().ok_or(BAD)?.remove(&target.object_id).ok_or(BAD)?;
 let actual:Value=serde_json::from_str(&result).map_err(|_|BAD)?;
 if actual!=expected_root{return Err(BAD);}
 Ok(result)
}
#[cfg(test)]
mod tests{
 use super::*;
 const SOURCE:&str=r#"{"GameInfo":{"Version":643},"Player":{"ContainerInventories":{"1":{"ID":1,"ParentItemID":null,"Size":2,"Inventory":[],"BelongsToPlayer":true,"BlockMoveTo":false,"ExtraSize":0},"9":{"ID":9,"ParentItemID":40001680,"Size":48,"Inventory":[{"ItemID":30000001,"Amount":5,"State":null}],"BelongsToPlayer":true,"BlockMoveTo":false,"ExtraSize":0}}},"World":{"GridCollection":{"Grids":{"42":{"ID":42,"NextGridObjectID":3,"Objects":{"1":{"ID":1,"ItemID":30000001,"X":1,"Y":2,"Orientation":"GridOrientation_Down","State":null},"2":{"ID":2,"ItemID":40001680,"X":3,"Y":4,"Orientation":"GridOrientation_Down","State":{"Storage":{"ContainerInventoryID":9,"DefaultContainerInventoryData":"Chest_48Slot","UnlockKeyItemID":0,"UnlockLocId":"","DesignID":null}}}}}}}},"Marker":1e2}"#;
 fn target()->GridCoordinateTarget{GridCoordinateTarget{kind:GridObjectKind::Full,grid_id:"42".into(),object_id:"1".into(),item_id:30000001}}
 #[test]fn recover_to_inventory_or_chest_preserves_unrelated_bytes(){
  let root:Value=serde_json::from_str(SOURCE).unwrap();assert_eq!(destinations(&root).unwrap().len(),2);
  for id in ["1","9"]{let result=recover(SOURCE,&target(),(1,2),"GridOrientation_Down",id).unwrap();let v:Value=serde_json::from_str(&result).unwrap();assert!(v["World"]["GridCollection"]["Grids"]["42"]["Objects"].get("1").is_none());assert_eq!(v["World"]["GridCollection"]["Grids"]["42"]["Objects"]["2"],root["World"]["GridCollection"]["Grids"]["42"]["Objects"]["2"]);assert_eq!(v["Player"]["ContainerInventories"][id]["Inventory"][0]["Amount"],if id=="1"{1}else{6});assert!(result.contains("1e2"));}
 }
 #[test]fn recover_into_existing_empty_slot_preserves_indices_and_opaque_rows(){
  let mut root:Value=serde_json::from_str(SOURCE).unwrap();
  root["Player"]["ContainerInventories"]["1"]["Inventory"]=json!([{"ItemID":30000002,"Amount":3,"State":{"Unknown":1}},{"ItemID":0,"Amount":0}]);
  root["World"]["GridCollection"]["Grids"]["42"]["Objects"]["1"]["State"]=json!({});
  let raw=root.to_string();
  assert_eq!(destinations(&root).unwrap()[0].used,1);
  let output:Value=serde_json::from_str(&recover(&raw,&target(),(1,2),"GridOrientation_Down","1").unwrap()).unwrap();
  assert_eq!(output["Player"]["ContainerInventories"]["1"]["Inventory"],json!([{"ItemID":30000002,"Amount":3,"State":{"Unknown":1}},{"ItemID":30000001,"Amount":1,"State":null}]));
  root["Player"]["ContainerInventories"]["1"]["Inventory"][1]["State"]=json!({"Unknown":true});
  assert_eq!(destinations(&root).unwrap()[0].used,2);
  assert!(recover(&root.to_string(),&target(),(1,2),"GridOrientation_Down","1").is_err());
 }
 #[test]fn unknown_state_stale_pose_and_full_destination_fail_atomically(){
  let mut root:Value=serde_json::from_str(SOURCE).unwrap();
  assert!(recover(SOURCE,&target(),(2,2),"GridOrientation_Down","1").is_err());
  root["World"]["GridCollection"]["Grids"]["42"]["Objects"]["1"]["State"]=json!({"Unknown":1});assert!(recover(&root.to_string(),&target(),(1,2),"GridOrientation_Down","1").is_err());
  root["World"]["GridCollection"]["Grids"]["42"]["Objects"]["1"]["State"]=Value::Null;
  root["Player"]["ContainerInventories"]["1"]["Inventory"]=json!([{"ItemID":30000002,"Amount":1,"State":null},{"ItemID":30000003,"Amount":1,"State":null}]);assert!(recover(&root.to_string(),&target(),(1,2),"GridOrientation_Down","1").is_err());
 }
}
