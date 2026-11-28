//! Atomic field ItemInstance recovery. No game runtime or catalog authority
//! is inferred here; the codec checks exact source definitions and references.
use super::{GridCoordinateTarget,GridObjectKind,PatchError,QuantityTarget,JsonLocator,Segment,k,validate_json_without_edit,storage_transform_pose};
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
/// Native ProfilePlayer semantic roles (Switch/Steam v1.24.13):
/// ID 0 Backpack, ID 1 HomeStorage. Recheck the persisted v643 shape.
/// Other parentless records are not inferred to be ordinary inventory.
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
 let mut named_container_refs=std::collections::HashMap::new();
 super::storage_backup::count_refs(root,false,&mut named_container_refs);
 let mut rows=Vec::new();
 for (id,c) in containers{
  let Some(n)=key_id(id)else{continue;};
  if c["ID"].as_u64()!=Some(u64::from(n))||c["BelongsToPlayer"]!=true||c["BlockMoveTo"]!=false||
   c.as_object().is_none_or(|m|m.len()!=7||m.keys().any(|k|!matches!(k.as_str(),"ID"|"ParentItemID"|"Size"|"Inventory"|"BelongsToPlayer"|"BlockMoveTo"|"ExtraSize")))||
   c["ExtraSize"].as_u64().is_none(){continue;}
  let Some(capacity)=c["Size"].as_u64().and_then(|n|u32::try_from(n).ok()).filter(|n|*n>0&&*n<=8192)else{continue;};
  let Some(inv)=c["Inventory"].as_array().filter(|a|a.len()<=capacity as usize)else{continue;};
  if c["ExtraSize"].as_u64().is_none_or(|n|n>u64::from(capacity)){continue;}
  if inv.iter().any(|row|row["ItemID"].as_u64().is_none_or(|n|n>u32::MAX as u64)||row["Amount"].as_u64().is_none_or(|n|n>i32::MAX as u64)||!empty_slot(row)&&(row["ItemID"]==0||row["Amount"]==0)){continue;}
  // Existing slots are opaque. Never coerce or overwrite unknown fields.
  let refs=owners.get(&u64::from(n)).map(Vec::as_slice).unwrap_or(&[]);
  let (parent_item,owner)=if n<=1{
   if !refs.is_empty()||named_container_refs.get(&n).copied().unwrap_or(0)!=0||!(c["ParentItemID"].is_null()||c["ParentItemID"].as_u64()==Some(0)){continue;}(None,None)
  }else{
   let Some(item)=c["ParentItemID"].as_u64().filter(|n|*n>0)else{continue;};
   match refs{
    []=>{
     // A persistent, occupied player-owned storage record may survive
     // furniture pickup. Do not allocate a new record or claim its location.
     // Empty unlinked records and unresolved explicit references remain hidden.
     if inv.iter().all(empty_slot)||named_container_refs.get(&n).copied().unwrap_or(0)!=0{continue;}
     (Some(item),None)
    },
    [target]=>{
     if target.kind!=GridObjectKind::Full||target.item_id!=item||key_id(&target.grid_id).is_none()||key_id(&target.object_id).is_none_or(|n|n==0)||diff.is_some_and(|d|d.get(&target.grid_id).is_some()){continue;}
     let g=&grids[&target.grid_id];let o=&g["Objects"][&target.object_id];
     if g["ID"].as_u64()!=key_id(&target.grid_id).map(u64::from)||o["ID"].as_u64()!=key_id(&target.object_id).map(u64::from)||!storage_transform_pose(root,o)||named_container_refs.get(&n).copied()!=Some(1){continue;}
     (Some(item),Some(target.clone()))
    },
    _=>continue
   }
  };
  rows.push(RecoveryDestination{container_id:id.clone(),parent_item,owner,capacity,used:inv.iter().filter(|row|!empty_slot(row)).count() as u32});
 }
 rows.sort_by_key(|r|r.container_id.parse::<u32>().unwrap_or(u32::MAX));Ok(rows)
}
fn valid_field_object(root:&Value,target:&GridCoordinateTarget,expected:(i32,i32),orientation:&str)->bool{
 if target.kind!=GridObjectKind::Full||target.item_id==0||target.item_id>u32::MAX as u64||key_id(&target.object_id).is_none_or(|n|n==0)||key_id(&target.grid_id).is_none(){return false;}
 let collection=&root["World"]["GridCollection"];let g=&collection["Grids"][&target.grid_id];let o=&g["Objects"][&target.object_id];
 root["GameInfo"]["Version"].as_u64()==Some(643)&&g["ID"].as_u64()==key_id(&target.grid_id).map(u64::from)&&
 collection.get("DiffGrids").is_none_or(|v|v.as_object().is_some_and(|m|!m.contains_key(&target.grid_id)))&&
 o.as_object().is_some_and(|m|matches!(m.len(),5|6)&&m.keys().all(|k|matches!(k.as_str(),"ID"|"ItemID"|"X"|"Y"|"Orientation"|"State")))&&
 o["ID"].as_u64()==key_id(&target.object_id).map(u64::from)&&o["ItemID"].as_u64()==Some(target.item_id)&&
 o["X"].as_i64()==Some(i64::from(expected.0))&&o["Y"].as_i64()==Some(i64::from(expected.1))&&o["Orientation"].as_str()==Some(orientation)&&
 super::EXPERIMENTAL_EIGHT_WAY_ORIENTATIONS.contains(&orientation)
}

/// Exact native 1.26.2 metadata:
/// GridState.ItemAmountState (tag 2) is Definitions.Items.AmountWithState.
/// AmountWithState.Amount (tag 1, Nullable<int>), State (tag 2, ItemState),
/// AssignedPlayer (tag 3, Nullable<int>). ItemInstance.State is the same
/// native ItemState type. No conversion of unrelated GridState discriminants.
/// Do not infer a missing quantity or discard a player assignment.
#[derive(Debug,Clone,PartialEq,Eq)]
pub struct RecoveryItem{pub item_id:u64,pub amount:u64,pub state:Value}
pub fn field_recovery_item(root:&Value,target:&GridCoordinateTarget,expected:(i32,i32),orientation:&str)->Option<RecoveryItem>{
 if !valid_field_object(root,target,expected,orientation){return None;}
 let o=&root["World"]["GridCollection"]["Grids"][&target.grid_id]["Objects"][&target.object_id];
 if empty_grid_state(o.get("State")){return Some(RecoveryItem{item_id:target.item_id,amount:1,state:Value::Null});}
 let state=o["State"].as_object().filter(|m|m.len()==1)?;
 let wrapped=state.get("ItemAmountState")?.as_object()?;
 if wrapped.keys().any(|k|!matches!(k.as_str(),"Amount"|"State"|"AssignedPlayer"))||
  wrapped.get("AssignedPlayer").is_some_and(|v|!v.is_null()){return None;}
 let amount=wrapped.get("Amount")?.as_u64().filter(|n|*n>0&&*n<=i32::MAX as u64)?;
 let state=wrapped.get("State").cloned().unwrap_or(Value::Null);
 let row=json!({"ItemID":target.item_id,"Amount":amount,"State":state});
 if !super::storage_backup::independent_item_state(&row){return None;}
 Some(RecoveryItem{item_id:target.item_id,amount,state})
}
/// Only plain, structurally known stacks may receive a recovered plain item.
fn plain_stack_headroom(row:&Value)->Option<(u64,u64)>{
 if row.get("State").is_some_and(|s|!s.is_null())||
  row.as_object().is_none_or(|m|m.keys().any(|k|!matches!(k.as_str(),"ItemID"|"Amount"|"State"))){return None;}
 let item=row["ItemID"].as_u64().filter(|n|*n>0)?;
 let amount=row["Amount"].as_u64().filter(|n|*n>0&&*n<i32::MAX as u64)?;
 Some((item,i32::MAX as u64-amount))
}
/// One common inventory simulation for capacity preview and the writer.
/// A variant retains its own slot and exact amount/state; we do not infer
/// that two equal-looking non-null states can be safely coalesced.
fn stage_recovery(rows:&mut Vec<Value>,capacity:u32,items:&[RecoveryItem])->Result<(),PatchError>{
 if items.is_empty()||items.len()>super::MAX_GRID_MIXED_EDITS{return Err(BAD);}
 for item in items{
  if item.item_id==0||item.item_id>u32::MAX as u64||item.amount==0||item.amount>i32::MAX as u64{return Err(BAD);}
  let mut remaining=item.amount;
  if item.state.is_null(){
   for row in rows.iter_mut(){
    if remaining==0{break;}
    if let Some((_,room))=plain_stack_headroom(row).filter(|(id,_)|*id==item.item_id){
     let added=remaining.min(room);
     row["Amount"]=(i32::MAX as u64-room+added).into();
     remaining-=added;
    }
   }
  }
  if remaining==0{continue;}
  let entry=json!({"ItemID":item.item_id,"Amount":remaining,"State":item.state});
  if let Some(i)=rows.iter().position(empty_slot){rows[i]=entry;}
  else{if rows.len()>=capacity as usize{return Err(BAD);}rows.push(entry);}
 }
 Ok(())
}
pub fn projected_recovery_used(root:&Value,dest:&RecoveryDestination,items:&[RecoveryItem])->Option<u32>{
 let mut rows=root["Player"]["ContainerInventories"][&dest.container_id]["Inventory"].as_array()?.clone();
 stage_recovery(&mut rows,dest.capacity,items).ok()?;
 u32::try_from(rows.iter().filter(|row|!empty_slot(row)).count()).ok()
}
#[cfg(test)]
fn projected_used(root:&Value,dest:&RecoveryDestination,items:&[u64])->Option<u32>{
 let items=items.iter().map(|&item_id|RecoveryItem{item_id,amount:1,state:Value::Null}).collect::<Vec<_>>();
 projected_recovery_used(root,dest,&items)
}
/// Recover a selection in one transaction. All source witnesses and destination
/// capacity are checked against the original document; only the changed slot
/// values and removed map members are spliced into its original bytes.
pub fn recover_batch(source:&str,targets:&[(GridCoordinateTarget,(i32,i32),String)],container:&str)->Result<String,PatchError>{
 use std::{collections::{BTreeMap,HashSet},ops::Range};
 if targets.is_empty()||targets.len()>super::MAX_GRID_MIXED_EDITS{return Err(BAD);}
 validate_json_without_edit(source)?;
 let mut root:Value=serde_json::from_str(source).map_err(|_|BAD)?;
 let dest=destinations(&root)?.into_iter().find(|r|r.container_id==container).ok_or(BAD)?;
 let mut groups=BTreeMap::<String,HashSet<String>>::new();
 let mut items=Vec::with_capacity(targets.len());
 for (target,expected,orientation) in targets{
  if !groups.entry(target.grid_id.clone()).or_default().insert(target.object_id.clone()){return Err(BAD);}
  items.push(field_recovery_item(&root,target,*expected,orientation).ok_or(BAD)?);
 }
 let original=root["Player"]["ContainerInventories"][container]["Inventory"].as_array().ok_or(BAD)?.clone();
 let rows=root["Player"]["ContainerInventories"][container]["Inventory"].as_array_mut().ok_or(BAD)?;
 stage_recovery(rows,dest.capacity,&items)?;
 let inv_path=vec![k("Player"),k("ContainerInventories"),k(container),k("Inventory")];
 let mut locator=JsonLocator::new(source,QuantityTarget::Inventory{inventory_id:"1".into(),item_id:"1".into()})?;
 locator.amount_path=vec![Segment::Index(usize::MAX)];
 let mut changes=Vec::<(Vec<Segment>,String)>::new();
 for (i,(old,new)) in original.iter().zip(rows.iter()).enumerate(){
  if old==new{continue;}
  let mut path=inv_path.clone();path.push(Segment::Index(i));
  let value=if empty_slot(old){new.to_string()}else{path.push(k("Amount"));new["Amount"].to_string()};
  locator.capture.insert(path.clone(),None);changes.push((path,value));
 }
 if rows.len()>original.len(){locator.capture.insert(inv_path.clone(),None);}
 for gid in groups.keys(){
  locator.capture.insert(vec![k("World"),k("GridCollection"),k("Grids"),k(gid),k("Objects")],None);
 }
 locator.walk_complete()?;
 let mut patches=Vec::<(Range<usize>,String)>::new();
 for (path,value) in changes{
  patches.push((locator.capture.get(&path).and_then(|r|r.clone()).ok_or(BAD)?,value));
 }
 if rows.len()>original.len(){
  let span=locator.capture.get(&inv_path).and_then(|r|r.clone()).ok_or(BAD)?;
  let at=span.end.checked_sub(1).ok_or(BAD)?;
  if source.as_bytes().get(at)!=Some(&b']'){return Err(BAD);}
  let append=rows[original.len()..].iter().map(Value::to_string).collect::<Vec<_>>().join(",");
  patches.push((at..at,format!("{}{}",if original.is_empty(){""}else{","},append)));
 }
 // Scan only affected maps for member spans. Coalesce consecutive deletions,
 // preserving raw keys, values and separators of every unaffected member.
 for (gid,ids) in groups{
  let parent=vec![k("World"),k("GridCollection"),k("Grids"),k(&gid),k("Objects")];
  let span=locator.capture.get(&parent).and_then(|r|r.clone()).ok_or(BAD)?;
  let mut parser=JsonLocator::new(source,QuantityTarget::Inventory{inventory_id:"1".into(),item_id:"1".into()})?;
  parser.amount_path=vec![Segment::Index(usize::MAX)];parser.pos=span.start;parser.expect(b'{')?;
  let mut members=Vec::<(usize,usize,Option<usize>,bool)>::new();
  loop{
   parser.space();
   if parser.bytes.get(parser.pos)==Some(&b'}'){parser.pos+=1;break;}
   let start=parser.pos;let key=parser.string()?;parser.expect(b':')?;
   let mut path=parent.clone();path.push(k(&key));parser.value(&mut path)?;let end=parser.pos;
   parser.space();
   let comma=if parser.bytes.get(parser.pos)==Some(&b','){let p=parser.pos;parser.pos+=1;Some(p)}else{None};
   members.push((start,end,comma,ids.contains(&key)));
   if comma.is_none(){parser.expect(b'}')?;break;}
  }
  if parser.pos!=span.end||members.iter().filter(|m|m.3).count()!=ids.len(){return Err(BAD);}
  let mut i=0;
  while i<members.len(){
   if !members[i].3{i+=1;continue;}
   let first=i;while i+1<members.len()&&members[i+1].3{i+=1;}
   let last=i;
   let range=if let Some(comma)=members[last].2{members[first].0..comma+1}
    else if first>0{members[first-1].2.ok_or(BAD)?..members[last].1}
    else{members[first].0..members[last].1};
   patches.push((range,String::new()));i+=1;
  }
  let objects=root["World"]["GridCollection"]["Grids"][&gid]["Objects"].as_object_mut().ok_or(BAD)?;
  for id in ids{objects.remove(&id).ok_or(BAD)?;}
 }
 patches.sort_by_key(|(r,_)|r.start);
 let mut result=String::with_capacity(source.len());
 let mut cursor=0;
 for (range,value) in patches{
  if range.start<cursor||range.end<range.start||range.end>source.len(){return Err(BAD);}
  result.push_str(&source[cursor..range.start]);result.push_str(&value);cursor=range.end;
 }
 result.push_str(&source[cursor..]);
 validate_json_without_edit(&result)?;
 if serde_json::from_str::<Value>(&result).map_err(|_|BAD)?!=root{return Err(BAD);}
 Ok(result)
}
/// Single recovery uses the same batch writer and validation.
pub fn recover(source:&str,target:&GridCoordinateTarget,expected:(i32,i32),orientation:&str,container:&str)->Result<String,PatchError>{
 recover_batch(source,&[(target.clone(),expected,orientation.to_owned())],container)
}
#[cfg(test)]
mod tests{
 use super::*;
 const SOURCE:&str=r#"{"GameInfo":{"Version":643},"Player":{"ContainerInventories":{"0":{"ID":0,"ParentItemID":null,"Size":2,"Inventory":[],"BelongsToPlayer":true,"BlockMoveTo":false,"ExtraSize":0},"9":{"ID":9,"ParentItemID":40001680,"Size":48,"Inventory":[{"ItemID":30000001,"Amount":5,"State":null}],"BelongsToPlayer":true,"BlockMoveTo":false,"ExtraSize":0}}},"World":{"GridCollection":{"Grids":{"42":{"ID":42,"NextGridObjectID":3,"Objects":{"1":{"ID":1,"ItemID":30000001,"X":1,"Y":2,"Orientation":"GridOrientation_Down","State":null},"2":{"ID":2,"ItemID":40001680,"X":3,"Y":4,"Orientation":"GridOrientation_Down","State":{"Storage":{"ContainerInventoryID":9,"DefaultContainerInventoryData":"Chest_48Slot","UnlockKeyItemID":0,"UnlockLocId":"","DesignID":null}}}}}}}},"Marker":1e2}"#;
 fn target()->GridCoordinateTarget{GridCoordinateTarget{kind:GridObjectKind::Full,grid_id:"42".into(),object_id:"1".into(),item_id:30000001}}
 #[test]fn batch_preserves_raw_unselected_members_across_grids_and_slots(){
  let mut root:Value=serde_json::from_str(SOURCE).unwrap();
  let objects=&mut root["World"]["GridCollection"]["Grids"]["42"]["Objects"];
  for (id,x,item) in [(3,3,30000001),(4,4,30000002),(5,5,30000003),(6,6,30000001)]{
   objects[id.to_string()]=json!({"ID":id,"ItemID":item,"X":x,"Y":2,"Orientation":"GridOrientation_Down","State":null});
  }
  objects["5"]["Unknown"]=json!({"raw":100.0});
  root["World"]["GridCollection"]["Grids"]["42"]["NextGridObjectID"]=7.into();
  let mut other=root["World"]["GridCollection"]["Grids"]["42"].clone();
  other["ID"]=43.into();other["Objects"]=json!({"1":{"ID":1,"ItemID":30000001,"X":1,"Y":2,"Orientation":"GridOrientation_Down"}});
  root["World"]["GridCollection"]["Grids"]["43"]=other;
  root["Player"]["ContainerInventories"]["0"]["Inventory"]=json!([{"ItemID":30000001,"Amount":7,"State":null},{"ItemID":0,"Amount":0}]);
  let raw=root.to_string().replace("100.0","1e2");
  let make=|gid:&str,id:&str,x:i32,item:u64|(GridCoordinateTarget{kind:GridObjectKind::Full,grid_id:gid.into(),object_id:id.into(),item_id:item},(x,2),"GridOrientation_Down".to_owned());
  let batch=vec![make("42","1",1,30000001),make("42","3",3,30000001),make("42","4",4,30000002),make("42","6",6,30000001),make("43","1",1,30000001)];
  let out=recover_batch(&raw,&batch,"0").unwrap();
  let actual:Value=serde_json::from_str(&out).unwrap();
  assert_eq!(actual["Player"]["ContainerInventories"]["0"]["Inventory"],json!([{"ItemID":30000001,"Amount":11,"State":null},{"ItemID":30000002,"Amount":1,"State":null}]));
  assert_eq!(actual["World"]["GridCollection"]["Grids"]["42"]["Objects"].as_object().unwrap().len(),2);
  assert!(actual["World"]["GridCollection"]["Grids"]["43"]["Objects"].as_object().unwrap().is_empty());
  assert!(out.contains("\"raw\":1e2"));
  assert_eq!(actual["World"]["GridCollection"]["Grids"]["42"]["Objects"]["2"],root["World"]["GridCollection"]["Grids"]["42"]["Objects"]["2"]);
  let mut duplicate=batch.clone();duplicate.push(batch[0].clone());assert!(recover_batch(&raw,&duplicate,"0").is_err());
  let mut over=batch.clone();over.push(make("42","5",5,30000003));assert!(recover_batch(&raw,&over,"0").is_err());
 }
 #[test]fn maximum_batch_recovers_all_eight_saved_orientations_without_changing_other_state(){
  let mut root:Value=serde_json::from_str(SOURCE).unwrap();
  let mut targets=Vec::new();
  for i in 0..super::super::MAX_GRID_MIXED_EDITS{
   let oid=(i+3).to_string();
   let orientation=super::super::EXPERIMENTAL_EIGHT_WAY_ORIENTATIONS[i%8];
   root["World"]["GridCollection"]["Grids"]["42"]["Objects"][&oid]=json!({"ID":i+3,"ItemID":30000001,"X":i,"Y":2,"Orientation":orientation});
   targets.push((GridCoordinateTarget{kind:GridObjectKind::Full,grid_id:"42".into(),object_id:oid,item_id:30000001},(i as i32,2),orientation.to_owned()));
  }
  root["World"]["GridCollection"]["Grids"]["42"]["NextGridObjectID"]=(targets.len()+3).into();
  let out:Value=serde_json::from_str(&recover_batch(&root.to_string(),&targets,"0").unwrap()).unwrap();
  assert_eq!(out["Player"]["ContainerInventories"]["0"]["Inventory"][0]["Amount"],targets.len());
  assert_eq!(out["World"]["GridCollection"]["Grids"]["42"]["Objects"].as_object().unwrap().len(),2);
  assert_eq!(out["Player"]["ContainerInventories"]["9"],root["Player"]["ContainerInventories"]["9"]);
  targets[0].2="GridOrientation_Unknown".into();assert!(recover_batch(&root.to_string(),&targets,"0").is_err());
 }
 #[test]fn batch_appends_only_missing_slots_and_rejects_capacity_without_partial_result(){
  let mut root:Value=serde_json::from_str(SOURCE).unwrap();
  root["World"]["GridCollection"]["Grids"]["42"]["Objects"]["3"]=json!({"ID":3,"ItemID":30000002,"X":3,"Y":2,"Orientation":"GridOrientation_Down"});
  let mut second=target();second.object_id="3".into();second.item_id=30000002;
  let targets=[(target(),(1,2),"GridOrientation_Down".into()),(second,(3,2),"GridOrientation_Down".into())];
  let out:Value=serde_json::from_str(&recover_batch(&root.to_string(),&targets,"0").unwrap()).unwrap();
  assert_eq!(out["Player"]["ContainerInventories"]["0"]["Inventory"],json!([{"ItemID":30000001,"Amount":1,"State":null},{"ItemID":30000002,"Amount":1,"State":null}]));
  root["Player"]["ContainerInventories"]["0"]["Size"]=1.into();
  assert!(recover_batch(&root.to_string(),&targets,"0").is_err());
 }
 #[test]fn destination_projection_distinguishes_full_matching_stacks_variants_and_overflow(){
  let mut root:Value=serde_json::from_str(SOURCE).unwrap();
  root["Player"]["ContainerInventories"]["0"]["Inventory"]=json!([{"ItemID":30000001,"Amount":i32::MAX-1,"State":null},{"ItemID":30000001,"Amount":2,"State":{"Unknown":1}}]);
  let dest=destinations(&root).unwrap().remove(0);
  assert_eq!(projected_used(&root,&dest,&[30000001]),Some(2));
  assert_eq!(projected_used(&root,&dest,&[30000001,30000001]),None);
  assert_eq!(projected_used(&root,&dest,&[30000002]),None);
  root["Player"]["ContainerInventories"]["0"]["Inventory"][1]=json!({"ItemID":0,"Amount":0});
  let dest=destinations(&root).unwrap().remove(0);
  assert_eq!(projected_used(&root,&dest,&[30000001,30000001]),Some(2));
  assert_eq!(projected_used(&root,&dest,&[30000001,30000001,30000002]),None);
 }
 #[test]fn recover_to_inventory_or_chest_preserves_unrelated_bytes(){
  let root:Value=serde_json::from_str(SOURCE).unwrap();assert_eq!(destinations(&root).unwrap().len(),2);
  for id in ["0","9"]{let result=recover(SOURCE,&target(),(1,2),"GridOrientation_Down",id).unwrap();let v:Value=serde_json::from_str(&result).unwrap();assert!(v["World"]["GridCollection"]["Grids"]["42"]["Objects"].get("1").is_none());assert_eq!(v["World"]["GridCollection"]["Grids"]["42"]["Objects"]["2"],root["World"]["GridCollection"]["Grids"]["42"]["Objects"]["2"]);assert_eq!(v["Player"]["ContainerInventories"][id]["Inventory"][0]["Amount"],if id=="0"{1}else{6});assert!(result.contains("1e2"));}
 }
 #[test]fn occupied_unlinked_storage_is_reused_without_allocating_or_changing_links(){
  let mut root:Value=serde_json::from_str(SOURCE).unwrap();
  root["World"]["GridCollection"]["Grids"]["42"]["Objects"].as_object_mut().unwrap().remove("2");
  let rows=destinations(&root).unwrap();assert_eq!(rows.len(),2);assert_eq!(rows[1].parent_item,Some(40001680));assert!(rows[1].owner.is_none());
  let out:Value=serde_json::from_str(&recover(&root.to_string(),&target(),(1,2),"GridOrientation_Down","9").unwrap()).unwrap();
  assert_eq!(out["Player"]["ContainerInventories"]["9"]["Inventory"][0]["Amount"],6);
  assert_eq!(out["Player"]["ContainerInventories"].as_object().unwrap().len(),2);
  root["World"]["Unknown"] = json!({"ContainerInventoryID":9});
  assert_eq!(destinations(&root).unwrap().len(),1);
  root["World"].as_object_mut().unwrap().remove("Unknown");
  root["Player"]["ContainerInventories"]["9"]["Inventory"]=json!([]);
  assert_eq!(destinations(&root).unwrap().len(),1);
 }
 #[test]fn semantic_inventory_roles_and_capacity_are_not_inferred(){
  let mut root:Value=serde_json::from_str(SOURCE).unwrap();
  let mut home=root["Player"]["ContainerInventories"]["0"].clone();home["ID"]=1.into();home["Size"]=48.into();home["ExtraSize"]=6.into();
  root["Player"]["ContainerInventories"]["1"]=home.clone();
  home["ID"]=4.into();root["Player"]["ContainerInventories"]["4"]=home;
  let rows=destinations(&root).unwrap();
  assert_eq!(rows.iter().map(|r|r.container_id.as_str()).collect::<Vec<_>>(),vec!["0","1","9"]);
  assert_eq!(rows[1].capacity,48);
  let result=recover(&root.to_string(),&target(),(1,2),"GridOrientation_Down","1").unwrap();
  let v:Value=serde_json::from_str(&result).unwrap();assert_eq!(v["Player"]["ContainerInventories"]["1"]["Inventory"][0]["ItemID"],30000001);
  assert!(recover(&root.to_string(),&target(),(1,2),"GridOrientation_Down","4").is_err());
  // Backpack ID zero can both allocate and increment.
  root["Player"]["ContainerInventories"]["0"]["Inventory"]=json!([{"ItemID":30000001,"Amount":7,"State":null}]);
  let result:Value=serde_json::from_str(&recover(&root.to_string(),&target(),(1,2),"GridOrientation_Down","0").unwrap()).unwrap();
  assert_eq!(result["Player"]["ContainerInventories"]["0"]["Inventory"][0]["Amount"],8);
 }
 #[test]fn recover_into_existing_empty_slot_preserves_indices_and_opaque_rows(){
  let mut root:Value=serde_json::from_str(SOURCE).unwrap();
  root["Player"]["ContainerInventories"]["0"]["Inventory"]=json!([{"ItemID":30000002,"Amount":3,"State":{"Unknown":1}},{"ItemID":0,"Amount":0}]);
  root["World"]["GridCollection"]["Grids"]["42"]["Objects"]["1"]["State"]=json!({});
  let raw=root.to_string();
  assert_eq!(destinations(&root).unwrap()[0].used,1);
  let output:Value=serde_json::from_str(&recover(&raw,&target(),(1,2),"GridOrientation_Down","0").unwrap()).unwrap();
  assert_eq!(output["Player"]["ContainerInventories"]["0"]["Inventory"],json!([{"ItemID":30000002,"Amount":3,"State":{"Unknown":1}},{"ItemID":30000001,"Amount":1,"State":null}]));
  root["Player"]["ContainerInventories"]["0"]["Inventory"][1]["State"]=json!({"Unknown":true});
  assert!(!destinations(&root).unwrap().iter().any(|r|r.container_id=="0"));
  assert!(recover(&root.to_string(),&target(),(1,2),"GridOrientation_Down","0").is_err());
 }
 #[test]fn amount_state_recovers_exact_quantity_and_independent_variant(){
  let mut root:Value=serde_json::from_str(SOURCE).unwrap();
  root["World"]["GridCollection"]["Grids"]["42"]["Objects"]["1"]["State"]=json!({"ItemAmountState":{"Amount":9,"State":null,"AssignedPlayer":null}});
  root["Player"]["ContainerInventories"]["0"]["Inventory"]=json!([{"ItemID":30000001,"Amount":i32::MAX-3,"State":null}]);
  let item=field_recovery_item(&root,&target(),(1,2),"GridOrientation_Down").unwrap();
  let dest=destinations(&root).unwrap().remove(0);
  assert_eq!(projected_recovery_used(&root,&dest,&[item]),Some(2));
  let out:Value=serde_json::from_str(&recover(&root.to_string(),&target(),(1,2),"GridOrientation_Down","0").unwrap()).unwrap();
  assert_eq!(out["Player"]["ContainerInventories"]["0"]["Inventory"],json!([{"ItemID":30000001,"Amount":i32::MAX,"State":null},{"ItemID":30000001,"Amount":6,"State":null}]));
  let mut meal=target();meal.item_id=30300001;
  let state=json!({"MealData":{"IngredientsUsed":[30200001,31100001],"SceneRestriction":null}});
  root["World"]["GridCollection"]["Grids"]["42"]["Objects"]["1"]["ItemID"]=meal.item_id.into();
  root["World"]["GridCollection"]["Grids"]["42"]["Objects"]["1"]["State"]=json!({"ItemAmountState":{"Amount":3,"State":state}});
  root["Player"]["ContainerInventories"]["0"]["Inventory"]=json!([{"ItemID":meal.item_id,"Amount":2,"State":state}]);
  let out:Value=serde_json::from_str(&recover(&root.to_string(),&meal,(1,2),"GridOrientation_Down","0").unwrap()).unwrap();
  assert_eq!(out["Player"]["ContainerInventories"]["0"]["Inventory"],json!([{"ItemID":meal.item_id,"Amount":2,"State":state},{"ItemID":meal.item_id,"Amount":3,"State":state}]));
  for bad in [json!({"Amount":3,"AssignedPlayer":1,"State":state}),json!({"Amount":null,"State":state}),json!({"Amount":0,"State":state}),json!({"Amount":3,"State":{"Unknown":1}}),json!({"Amount":3,"State":state,"Unknown":0})]{
   root["World"]["GridCollection"]["Grids"]["42"]["Objects"]["1"]["State"]=json!({"ItemAmountState":bad});
   assert!(recover(&root.to_string(),&meal,(1,2),"GridOrientation_Down","0").is_err());
  }
 }
 #[test]fn unknown_state_stale_pose_and_full_destination_fail_atomically(){
  let mut root:Value=serde_json::from_str(SOURCE).unwrap();
  assert!(recover(SOURCE,&target(),(2,2),"GridOrientation_Down","0").is_err());
  root["World"]["GridCollection"]["Grids"]["42"]["Objects"]["1"]["State"]=json!({"Unknown":1});assert!(recover(&root.to_string(),&target(),(1,2),"GridOrientation_Down","0").is_err());
  root["World"]["GridCollection"]["Grids"]["42"]["Objects"]["1"]["State"]=Value::Null;
  root["Player"]["ContainerInventories"]["0"]["Inventory"]=json!([{"ItemID":30000002,"Amount":1,"State":null},{"ItemID":30000003,"Amount":1,"State":null}]);assert!(recover(&root.to_string(),&target(),(1,2),"GridOrientation_Down","0").is_err());
 }
}
