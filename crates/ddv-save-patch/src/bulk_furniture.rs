//! Private batch patching of ordinary furniture. All original identities
//! and references are resolved by the codec before invoking this writer.
use super::*;
use serde_json::{Map,Value};
const BAD:PatchError=PatchError::InvalidTarget;
const LIMIT:usize=2048;
pub struct BulkPickup<'a>{pub target:&'a GridCoordinateTarget,pub expected:(i32,i32),pub orientation:&'a str}
pub struct BulkPlace<'a>{pub destination:&'a PlainGridDestination,pub item_id:u64,pub xy:(i32,i32),pub orientation:&'a str,pub free_placement:bool}
pub struct BulkScenePlace<'a>{pub pose:BulkPlace<'a>,pub tree:Option<&'a Value>}
struct GridChanges{remove:HashSet<String>,add:Vec<Value>,next:u32,objects_path:Vec<Segment>,counter_path:Vec<Segment>}
fn inventory_route()->Vec<Segment>{vec![k("Player"),k("ListInventories"),k("0")]}
fn amount_path(item:u64)->Vec<Segment>{let mut p=inventory_route();p.extend([k("Inventory"),k(&item.to_string()),k("Amount")]);p}
fn checked_inventory(root:&Value)->Result<&Map<String,Value>,PatchError>{
 let row=root.get("Player").and_then(|p|p.get("ListInventories")).and_then(|v|v.get("0")).ok_or(BAD)?;
 let o=row.as_object().ok_or(BAD)?;
 if row.get("ID").and_then(Value::as_u64)!=Some(0)||row.get("CompatibleItemType").and_then(Value::as_str)!=Some("ItemType_Furniture")||
 o.keys().any(|k|k.starts_with("Compatible")&&!matches!(k.as_str(),"CompatibleItemType"|"CompatibleFurnitureTypes")){return Err(BAD);}
 let restriction=row.get("CompatibleFurnitureTypes").and_then(Value::as_object).filter(|v|v.len()==1).ok_or(BAD)?;
 let list=restriction.get("List").and_then(Value::as_array).ok_or(BAD)?;
 let mut unique=HashSet::new();
 for v in list{let t=v.as_str().ok_or(BAD)?;if !matches!(t,"FurnitureItemType_Default"|"FurnitureItemType_GroundAlteration"|"FurnitureItemType_Door"|"FurnitureItemType_Request"|"FurnitureItemType_Blocker"|"FurnitureItemType_Fence"|"FurnitureItemType_AncientMachine"|"FurnitureItemType_SnippetTrap")||!unique.insert(t){return Err(BAD);}}
 if !unique.contains("FurnitureItemType_Default"){return Err(BAD);}
 row.get("Inventory").and_then(Value::as_object).ok_or(BAD)
}
fn grid_changes(id:&str,grid:&Value,collection:&Value,allocating:bool)->Result<GridChanges,PatchError>{
 if !valid_id(id)||id.starts_with('0')||grid.get("ID").and_then(Value::as_u64)!=id.parse::<u64>().ok()||
 collection.get("DiffGrids").is_some_and(|v|v.as_object().is_none_or(|m|m.contains_key(id))){return Err(BAD);}
 let objects=grid.get("Objects").and_then(Value::as_object).ok_or(BAD)?;
 if objects.len()>100_000{return Err(BAD);}
 let next=if allocating{
  let n=grid.get("NextGridObjectID").and_then(Value::as_u64).and_then(|v|u32::try_from(v).ok()).filter(|n|*n>0).ok_or(BAD)?;
  if objects.iter().any(|(k,v)|k.parse::<u32>().ok().is_none_or(|i|i==0||i>=n||i.to_string()!=*k||v.get("ID").and_then(Value::as_u64)!=Some(u64::from(i)))){return Err(BAD);}n
 }else{0};
 let mut p=vec![k("World"),k("GridCollection"),k("Grids"),k(id)];let mut counter=p.clone();counter.push(k("NextGridObjectID"));p.push(k("Objects"));
 Ok(GridChanges{remove:HashSet::new(),add:Vec::new(),next,objects_path:p,counter_path:counter})
}
/// Two phases are deliberately separate: the caller returns every item
/// before changing networks and placing new objects. This function batches
/// each ordinary phase across all affected Grids and stock entries.
pub fn preview_bulk_furniture(source:&str,pickups:&[BulkPickup<'_>],places:&[BulkPlace<'_>])->Result<GridCoordinateDraft,PatchError>{
 let rows=places.iter().map(|p|BulkScenePlace{pose:BulkPlace{destination:p.destination,item_id:p.item_id,xy:p.xy,orientation:p.orientation,free_placement:p.free_placement},tree:None}).collect::<Vec<_>>();
 bulk_patch(source,pickups,&rows,false,&HashMap::new())
}
/// Mixed roots are allocated in input order, with a single global child
/// allocator and a single stock balance across every destination.
pub fn preview_bulk_scene_place(source:&str,places:&[BulkScenePlace<'_>])->Result<GridCoordinateDraft,PatchError>{bulk_patch(source,&[],places,false,&HashMap::new())}
// Only room_structure may authorize the known indoor floor geometry, after
// validating the room's native Grid binding and the selected recovery roots.
pub(super) fn preview_structural_room_pickup(source:&str,pickups:&[BulkPickup<'_>])->Result<GridCoordinateDraft,PatchError>{
 bulk_patch(source,pickups,&[],true,&HashMap::new())
}
/// Allocate independent empty storage rows in the same batch as furniture.
pub fn preview_bulk_storage_scene_place(source:&str,places:&[BulkScenePlace<'_>],templates:&HashMap<u64,(&str,u32)>)->Result<GridCoordinateDraft,PatchError>{
 bulk_patch(source,&[],places,false,templates)
}
fn bulk_patch(source:&str,pickups:&[BulkPickup<'_>],places:&[BulkScenePlace<'_>],structural_room:bool,templates:&HashMap<u64,(&str,u32)>)->Result<GridCoordinateDraft,PatchError>{
 if source.is_empty()||source.len()>MAX_PROFILE_BYTES||pickups.is_empty()==places.is_empty()||pickups.len()+places.len()>LIMIT{return Err(BAD);}
 let mut root:Value=serde_json::from_str(source).map_err(|_|PatchError::InvalidDocument)?;
 let c=root.get("World").and_then(|v|v.get("GridCollection")).ok_or(BAD)?;
 let grids=c.get("Grids").and_then(Value::as_object).ok_or(BAD)?;
 let inventory=checked_inventory(&root)?;
 let mut changes=HashMap::<String,GridChanges>::new();
 let mut delta=HashMap::<u64,i64>::new();
 let mut anchors=HashSet::new();
 let has_support=places.iter().any(|p|p.tree.is_some());
 let mut next_grid=0u32;let mut created=Vec::<(u32,Value)>::new();let mut count=0usize;
 let diff=c.get("DiffGrids").map(|v|v.as_object().ok_or(BAD)).transpose()?;
 if has_support{
  next_grid=super::support_clone::checked_grid_allocator(c.as_object().ok_or(BAD)?)?;
 }
 let original_next_grid=next_grid;
 let storage_count=places.iter().filter(|p|templates.contains_key(&p.pose.item_id)).count();
 let has_storage=storage_count>0;
 let mut new_containers=Vec::<(u32,Value)>::new();let mut next_container=0u32;let mut containers_empty=false;
 if has_storage{
  let m=root["Player"]["ContainerInventories"].as_object().filter(|m|m.len()+storage_count<=8192).ok_or(BAD)?;
  containers_empty=m.is_empty();
  next_container=root["Player"]["NextContainerInventoryID"].as_u64().and_then(|n|u32::try_from(n).ok()).filter(|n|*n>=2&&*n<u32::MAX).ok_or(BAD)?;
  if m.iter().any(|(k,v)|k.parse::<u32>().ok().is_none_or(|n|n.to_string()!=*k||n>=next_container||v["ID"].as_u64()!=Some(u64::from(n)))){return Err(BAD);}
 }
 let first_container=next_container;
 for p in pickups{
  let t=p.target;if t.kind!=GridObjectKind::Full||t.item_id/100_000!=400{return Err(BAD);}
  let grid=grids.get(&t.grid_id).ok_or(BAD)?;
  if !changes.contains_key(&t.grid_id){changes.insert(t.grid_id.clone(),grid_changes(&t.grid_id,grid,c,false)?);}
  let change=changes.get_mut(&t.grid_id).ok_or(BAD)?;
  if !change.remove.insert(t.object_id.clone()){return Err(BAD);}
  let v=grid.get("Objects").and_then(|o|o.get(&t.object_id)).ok_or(BAD)?;
  let m=v.as_object().ok_or(BAD)?;
  let id=t.object_id.parse::<u32>().map_err(|_|BAD)?;
  if id==0||id.to_string()!=t.object_id||m.keys().any(|k|!matches!(k.as_str(),"ID"|"ItemID"|"X"|"Y"|"Orientation"|"State"))||
   !(m.len()==5||m.len()==6&&v.get("State").is_some_and(Value::is_null))||
   v.get("ID").and_then(Value::as_u64)!=Some(u64::from(id))||v.get("ItemID").and_then(Value::as_u64)!=Some(t.item_id)||
   v.get("X").and_then(Value::as_i64)!=Some(i64::from(p.expected.0))||v.get("Y").and_then(Value::as_i64)!=Some(i64::from(p.expected.1))||
   v.get("Orientation").and_then(Value::as_str)!=Some(p.orientation)||
   !(OBSERVED_CARDINAL_ORIENTATIONS.contains(&p.orientation)||EXPERIMENTAL_EIGHT_WAY_ORIENTATIONS.contains(&p.orientation)&&grid.get("TessellationFactor").map_or(Some(1),Value::as_u64)==Some(1)&&(structural_room&&grid["GridDefaultLayoutPath"].as_str()==Some("")&&grid["GridDataPath"].as_str().is_some_and(|p|p.starts_with("GridData/Rooms/Room")&&p.ends_with("-GridData.json"))||grid.get("GridDefaultLayoutPath").and_then(Value::as_str).and_then(|l|super::saved_outdoor_scope(l,grid["GridDataPath"].as_str().unwrap_or(""))).is_some_and(|scope|grid.get("GridDataPath").and_then(Value::as_str).is_some_and(|path|outdoor_world_path(scope,path))))){return Err(BAD);}
  *delta.entry(t.item_id).or_default()+=1;
 }
 for row in places{
  let p=&row.pose;
  let d=p.destination;let (x,y)=p.xy;
  if p.free_placement&&!full_grid_scope(&d.layout_path).is_some_and(|scope|outdoor_world_path(scope,&d.data_path)){return Err(BAD);}
  if p.item_id/100_000!=400||full_grid_scope(&d.layout_path).is_none()||!d.data_path.starts_with("GridData/")||!d.data_path.ends_with(".json")||d.data_path.contains("..")||d.data_path.contains('\\')||
   !matches!(d.tessellation,1|2)||d.size.0==0||d.size.1==0||d.size.0>65536||d.size.1>65536||x<0||y<0||x as u32>=d.size.0*d.tessellation||y as u32>=d.size.1*d.tessellation||
   !(OBSERVED_CARDINAL_ORIENTATIONS.contains(&p.orientation)||row.tree.is_none()&&d.tessellation==1&&EXPERIMENTAL_EIGHT_WAY_ORIENTATIONS.contains(&p.orientation)&&full_grid_scope(&d.layout_path).is_some_and(|scope|outdoor_world_path(scope,&d.data_path)))||!p.free_placement&&!anchors.insert((d.grid_id.clone(),x,y)){return Err(BAD);}
  let grid=grids.get(&d.grid_id).ok_or(BAD)?;
  let matches=|v:&Value|super::saved_layout_matches(v.get("GridDefaultLayoutPath").and_then(Value::as_str),&d.layout_path,&d.data_path)&&v.get("GridDataPath").and_then(Value::as_str)==Some(d.data_path.as_str());
  if !matches(grid)||grid.get("TessellationFactor").map_or(Some(1),Value::as_u64)!=Some(u64::from(d.tessellation)){return Err(BAD);}
  if !changes.contains_key(&d.grid_id){if grids.values().filter(|g|matches(g)).count()!=1{return Err(BAD);}changes.insert(d.grid_id.clone(),grid_changes(&d.grid_id,grid,c,true)?);}
  let change=changes.get_mut(&d.grid_id).ok_or(BAD)?;
  let objects=grid.get("Objects").and_then(Value::as_object).ok_or(BAD)?;
  if objects.len()+change.add.len()>=100_000||!p.free_placement&&objects.values().any(|v|v.get("ItemID").and_then(Value::as_u64).is_none_or(|n|n/100_000!=401)&&v.get("X").and_then(Value::as_i64)==Some(i64::from(x))&&v.get("Y").and_then(Value::as_i64)==Some(i64::from(y))){return Err(BAD);}
  let id=change.next;change.next=id.checked_add(1).ok_or(BAD)?;
  let mut object=serde_json::json!({"ID":id,"ItemID":p.item_id,"X":x,"Y":y,"Orientation":p.orientation});
  if let Some(&(template,size))=templates.get(&p.item_id){
   if row.tree.is_some()||template!="Chest_48Slot"||size!=48||!OBSERVED_CARDINAL_ORIENTATIONS.contains(&p.orientation)||house_exterior_world(&d.layout_path,&d.data_path).is_none(){return Err(BAD);}
   let id=next_container;next_container=id.checked_add(1).ok_or(BAD)?;
   new_containers.push((id,serde_json::json!({"ID":id,"Size":size,"Inventory":[],"BelongsToPlayer":true,"BlockMoveTo":false,"ParentItemID":p.item_id,"ExtraSize":0})));
   object["State"]=serde_json::json!({"Storage":{"ContainerInventoryID":id,"DefaultContainerInventoryData":template,"UnlockKeyItemID":0,"UnlockLocId":"","DesignID":null}});
   count+=1;*delta.entry(p.item_id).or_default()-=1;
  }else if let Some(scene)=row.tree{
   let (child,following,children,items)=super::support_clone::build_source_tree(grids,diff,next_grid,p.item_id,scene)?;
   next_grid=following;created.extend(children);count+=items.len();
   for item in items{*delta.entry(item).or_default()-=1;}
   object["State"]=serde_json::json!({"SubGrid":{"GridID":child,"DesignID":null}});
  }else{count+=1;*delta.entry(p.item_id).or_default()-=1;}
  if count>LIMIT||has_support&&!super::support_clone::grid_capacity(grids,diff,created.len()){return Err(BAD);}
  change.add.push(object);
 }
 if has_support&&super::support_clone::reserved_ref(&root,&(original_next_grid..next_grid).collect::<HashSet<_>>(),false){return Err(BAD);}
 if has_storage&&player_house_create::container_refs_in_range(&root,first_container,next_container,false){return Err(BAD);}
 let mut stock=Vec::new();
 for (item,d) in delta{
  let old=inventory.get(&item.to_string()).and_then(|v|v.get("Amount")).and_then(Value::as_u64).filter(|n|*n<=i32::MAX as u64).ok_or(BAD)?;
  let new=(old as i64+d).try_into().ok().filter(|n:&u32|*n<=i32::MAX as u32).ok_or(PatchError::InvalidQuantity)?;
  stock.push((item,old as u32,new));
 }
 let mut locator=JsonLocator::new(source,QuantityTarget::Inventory{inventory_id:"1".into(),item_id:"1".into()})?;
 locator.amount_path=vec![Segment::Index(usize::MAX)];
 for &(item,_,_) in &stock{locator.capture.insert(amount_path(item),None);}
 for v in changes.values(){locator.capture.insert(v.objects_path.clone(),None);if !v.add.is_empty(){locator.capture.insert(v.counter_path.clone(),None);}}
 let gp=vec![k("World"),k("GridCollection"),k("Grids")];let gc=vec![k("World"),k("GridCollection"),k("NextGridID")];
 if has_support{locator.capture.insert(gp.clone(),None);locator.capture.insert(gc.clone(),None);}
 let mp=vec![k("Player"),k("ContainerInventories")];let mc=vec![k("Player"),k("NextContainerInventoryID")];
 if has_storage{locator.capture.insert(mp.clone(),None);locator.capture.insert(mc.clone(),None);}
 locator.walk_complete()?;
 let span=|p:&Vec<Segment>|locator.capture.get(p).and_then(|v|v.clone()).ok_or(PatchError::MissingTarget);
 let mut edits=Vec::<(Range<usize>,String)>::new();
 for &(item,old,new) in &stock{let r=span(&amount_path(item))?;if source[r.clone()].parse::<u32>().ok()!=Some(old){return Err(PatchError::AmountMismatch);}edits.push((r,new.to_string()));}
 if has_support{
  let range=span(&gp)?;let counter=span(&gc)?;
  if source[counter.clone()].parse::<u32>().ok()!=Some(original_next_grid){return Err(BAD);}
  let mut members=String::new();for (id,g) in &created{members.push_str(&format!(",\"{}\":{}",id,g));}
  edits.push((range.end-1..range.end-1,members));edits.push((counter,next_grid.to_string()));
 }
 if has_storage{
  let range=span(&mp)?;let counter=span(&mc)?;
  if source[counter.clone()].parse::<u32>().ok()!=Some(first_container){return Err(BAD);}
  let mut members=String::new();for (i,(id,row)) in new_containers.iter().enumerate(){members.push_str(&format!("{}\"{}\":{}",if i==0&&containers_empty{""}else{","},id,row));}
  edits.push((range.end-1..range.end-1,members));edits.push((counter,next_container.to_string()));
 }
 let mut maps=Vec::new();
 for (id,v) in &changes{
  let mr=span(&v.objects_path)?;
  if !v.add.is_empty(){let cr=span(&v.counter_path)?;if source[cr.clone()].parse::<u32>().ok()!=Some(v.next-v.add.len() as u32){return Err(BAD);}edits.push((cr,v.next.to_string()));}
  maps.push((id.clone(),mr));
 }
 locator.capture.clear();
 for (id,mr) in maps{
  let v=changes.get(&id).ok_or(BAD)?;
  let original=grids.get(&id).and_then(|g|g.get("Objects")).and_then(Value::as_object).ok_or(BAD)?;
  locator.pos=mr.start;locator.expect(b'{')?;
  let mut members=Vec::new();let mut seen=0;let mut removed=0;
  loop{
   locator.space();if locator.bytes.get(locator.pos)==Some(&b'}'){break;}
   let start=locator.pos;let key=locator.string()?;locator.expect(b':')?;let mut p=v.objects_path.clone();p.push(k(&key));locator.value(&mut p)?;
   if v.remove.contains(&key){removed+=1;}else{members.push(source[start..locator.pos].to_owned());}
   seen+=1;locator.space();if locator.bytes.get(locator.pos)==Some(&b','){locator.pos+=1;}else if locator.bytes.get(locator.pos)==Some(&b'}'){break;}else{return Err(BAD);}
  }
  if seen!=original.len()||removed!=v.remove.len(){return Err(BAD);}
  for o in &v.add{members.push(format!("\"{}\":{}",o["ID"],o));}
  edits.push((mr,format!("{{{}}}",members.join(","))));
 }
 // Compare the reconstructed document with the intended semantic mutation.
 // Surviving lexical member bytes and all unrelated fields remain untouched.
 for (id,v) in changes{
  let g=root["World"]["GridCollection"]["Grids"].get_mut(&id).ok_or(BAD)?;
  let objects=g.get_mut("Objects").and_then(Value::as_object_mut).ok_or(BAD)?;
  for k in v.remove{objects.remove(&k).ok_or(BAD)?;}
  for o in &v.add{objects.insert(o["ID"].to_string(),o.clone());}
  if !v.add.is_empty(){g["NextGridObjectID"]=Value::from(v.next);}
 }
 if has_support{
  let g=root["World"]["GridCollection"]["Grids"].as_object_mut().ok_or(BAD)?;
  for (id,value) in created{if g.insert(id.to_string(),value).is_some(){return Err(BAD);}}
  root["World"]["GridCollection"]["NextGridID"]=Value::from(next_grid);
 }
 if has_storage{
  let m=root["Player"]["ContainerInventories"].as_object_mut().ok_or(BAD)?;
  for (id,row) in new_containers{if m.insert(id.to_string(),row).is_some(){return Err(BAD);}}
  root["Player"]["NextContainerInventoryID"]=Value::from(next_container);
 }
 for (item,_,new) in stock{root["Player"]["ListInventories"]["0"]["Inventory"][item.to_string()]["Amount"]=Value::from(new);}
 edits.sort_unstable_by_key(|(r,_)|r.start);
 let mut candidate=String::with_capacity(source.len());let mut last=0;
 for (r,v) in edits{if r.start<last{return Err(BAD);}candidate.push_str(&source[last..r.start]);candidate.push_str(&v);last=r.end;}candidate.push_str(&source[last..]);
 if candidate.len()>MAX_PROFILE_BYTES||serde_json::from_str::<Value>(&candidate).map_err(|_|BAD)?!=root{return Err(BAD);}
 validate_json_without_edit(&candidate)?;
 Ok(GridCoordinateDraft{patched_json:candidate,changed:true,untouched_bytes_preserved:true,writer_authorized:false,export_authorized:false})
}


/** Aggregate a support hierarchy's stock mutations in one lexical pass.
 * Every individual item participates in the exact same inventory contract
 * as the ordinary single-item writer. No missing entries are synthesized. */
pub(super) fn preview_bulk_stock(source:&str,items:&[u64],returning:bool)->Result<String,PatchError>{
 if source.is_empty()||source.len()>MAX_PROFILE_BYTES||items.is_empty()||items.len()>LIMIT{return Err(BAD);}
 let root:Value=serde_json::from_str(source).map_err(|_|PatchError::InvalidDocument)?;
 let inventory=checked_inventory(&root)?;
 let mut counts=HashMap::<u64,u32>::new();
 for &item in items{if item/100_000!=400{return Err(BAD);}*counts.entry(item).or_default()+=1;}
 let mut locator=JsonLocator::new(source,QuantityTarget::Inventory{inventory_id:"1".into(),item_id:"1".into()})?;
 locator.amount_path=vec![Segment::Index(usize::MAX)];
 for &item in counts.keys(){locator.capture.insert(amount_path(item),None);}
 locator.walk_complete()?;
 let mut edits=Vec::new();
 for (item,count) in counts{
  let old=inventory.get(&item.to_string()).and_then(|v|v.get("Amount")).and_then(Value::as_u64).and_then(|v|u32::try_from(v).ok()).filter(|n|*n<=i32::MAX as u32).ok_or(BAD)?;
  let new=if returning{old.checked_add(count)}else{old.checked_sub(count)}.filter(|n|*n<=i32::MAX as u32).ok_or(PatchError::InvalidQuantity)?;
  let range=locator.capture.get(&amount_path(item)).and_then(|v|v.clone()).ok_or(PatchError::MissingTarget)?;
  if source[range.clone()].parse::<u32>().ok()!=Some(old){return Err(PatchError::AmountMismatch);}
  edits.push((range,new.to_string()));
 }
 edits.sort_unstable_by_key(|(r,_)|r.start);
 let mut candidate=String::with_capacity(source.len());let mut last=0;
 for (r,v) in edits{if r.start<last{return Err(BAD);}candidate.push_str(&source[last..r.start]);candidate.push_str(&v);last=r.end;}
 candidate.push_str(&source[last..]);validate_json_without_edit(&candidate)?;
 Ok(candidate)
}

#[cfg(test)]
mod tests{
 use super::*;
 const SOURCE:&str=r#"{"GameInfo":{"Version":643},"Other":1e2,"Player":{"ListInventories":{"0":{"ID":0,"CompatibleItemType":"ItemType_Furniture","CompatibleFurnitureTypes":{"List":["FurnitureItemType_Default"]},"Inventory":{"40000001":{"Amount":2,"Marker":"ItemMarker_Favorite"},"40000002":{"Amount":0}}}}},"World":{"GridCollection":{"Grids":{"7":{"ID":7,"GridDefaultLayoutPath":"SceneLayouts/Village04/Test.json","GridDataPath":"GridData/Test.json","TessellationFactor":1,"NextGridObjectID":4,"Objects":{"1":{"ID":1,"ItemID":40000001,"X":1,"Y":1,"Orientation":"GridOrientation_Down"},"2":{"ID":2,"ItemID":40000002,"X":2,"Y":2,"Orientation":"GridOrientation_Down","State":null},"3":{"ID":3,"ItemID":40000001,"X":3,"Y":3,"Orientation":"GridOrientation_Down","Unknown":1e2}}},"8":{"ID":8,"Objects":{}}}}}}"#;
 fn target(id:&str,item_id:u64)->GridCoordinateTarget{GridCoordinateTarget{kind:GridObjectKind::Full,grid_id:"7".into(),object_id:id.into(),item_id}}
 #[test]fn storage_bulk_placement_allocates_once_and_keeps_original_bytes(){
  let raw=SOURCE.replace("GridData/Test.json","GridData/Villages/Village04-BeachLevel-GridData.json").replace("SceneLayouts/Village04/Test.json","SceneLayouts/Village04/DefaultVillageLayout01-BeachGrids.json").replace("\"Player\":{","\"Player\":{\"NextContainerInventoryID\":10,\"ContainerInventories\":{\"9\":{\"ID\":9,\"Unknown\":1e2}},").replace("\"40000001\":{\"Amount\":2","\"40001680\":{\"Amount\":2},\"40000001\":{\"Amount\":2");
  let d=PlainGridDestination{grid_id:"7".into(),layout_path:"SceneLayouts/Village04/DefaultVillageLayout01-BeachGrids.json".into(),data_path:"GridData/Villages/Village04-BeachLevel-GridData.json".into(),tessellation:1,size:(16,16)};
  let rows=[40001680,40000001,40001680].map(|item_id|BulkScenePlace{pose:BulkPlace{destination:&d,item_id,xy:(4,4),orientation:"GridOrientation_Down",free_placement:true},tree:None});
  let templates=HashMap::from([(40001680,("Chest_48Slot",48))]);
  let draft=preview_bulk_storage_scene_place(&raw,&rows,&templates).unwrap();
  let root:Value=serde_json::from_str(&draft.patched_json).unwrap();
  let g=&root["World"]["GridCollection"]["Grids"]["7"];
  assert_eq!(g["Objects"]["4"]["State"]["Storage"]["ContainerInventoryID"],10);
  assert!(g["Objects"]["5"].get("State").is_none());
  assert_eq!(g["Objects"]["6"]["State"]["Storage"]["ContainerInventoryID"],11);
  assert_eq!(g["NextGridObjectID"],7);
  assert_eq!(root["Player"]["NextContainerInventoryID"],12);
  assert_eq!(root["Player"]["ContainerInventories"]["10"]["Size"],48);
  assert_eq!(root["Player"]["ContainerInventories"]["11"]["Inventory"],serde_json::json!([]));
  assert_eq!(root["Player"]["ListInventories"]["0"]["Inventory"]["40001680"]["Amount"],0);
  assert_eq!(root["Player"]["ListInventories"]["0"]["Inventory"]["40000001"]["Amount"],1);
  assert!(draft.patched_json.contains(r#""9":{"ID":9,"Unknown":1e2}"#));
  let bad=raw.replace("\"Other\":1e2","\"Other\":{\"ContainerInventoryID\":11}");
  assert!(preview_bulk_storage_scene_place(&bad,&rows,&templates).is_err());
  let empty=raw.replace(r#""ContainerInventories":{"9":{"ID":9,"Unknown":1e2}}"#,r#""ContainerInventories":{}"#);
  assert!(preview_bulk_storage_scene_place(&empty,&rows,&templates).is_ok());
 }
 #[test]fn free_bulk_restore_preserves_repeated_anchors_and_stock(){
  let source=SOURCE.replace("GridData/Test.json","GridData/Villages/Village04-Test-GridData.json");
  let d=PlainGridDestination{grid_id:"7".into(),layout_path:"SceneLayouts/Village04/Test.json".into(),data_path:"GridData/Villages/Village04-Test-GridData.json".into(),tessellation:1,size:(16,16)};
  let rows=[BulkPlace{destination:&d,item_id:40000001,xy:(1,1),orientation:"GridOrientation_DownLeft",free_placement:true},BulkPlace{destination:&d,item_id:40000001,xy:(1,1),orientation:"GridOrientation_Up",free_placement:true}];
  let result=preview_bulk_furniture(&source,&[],&rows).unwrap();let root:Value=serde_json::from_str(&result.patched_json).unwrap();
  let objects=&root["World"]["GridCollection"]["Grids"]["7"]["Objects"];
  assert_eq!(objects["1"]["X"],1);assert_eq!(objects["4"]["X"],1);assert_eq!(objects["5"]["X"],1);
  assert_eq!(root["World"]["GridCollection"]["Grids"]["7"]["NextGridObjectID"],6);
  assert_eq!(root["Player"]["ListInventories"]["0"]["Inventory"]["40000001"]["Amount"],0);
  assert!(result.patched_json.contains("\"Unknown\":1e2"));
  let strict=BulkPlace{destination:&d,item_id:40000001,xy:(1,1),orientation:"GridOrientation_Up",free_placement:false};
  assert!(preview_bulk_furniture(&source,&[],&[strict]).is_err());
 }
 #[test]fn bulk_diagonal_outdoor_furniture_roundtrip(){
  let source=SOURCE.replace("GridData/Test.json","GridData/Villages/Village04-Test-GridData.json").replacen("GridOrientation_Down","GridOrientation_DownLeft",1);
  let t=target("1",40000001);
  let pickup=BulkPickup{target:&t,expected:(1,1),orientation:"GridOrientation_DownLeft"};
  let removed=preview_bulk_furniture(&source,&[pickup],&[]).unwrap();
  let d=PlainGridDestination{grid_id:"7".into(),layout_path:"SceneLayouts/Village04/Test.json".into(),data_path:"GridData/Villages/Village04-Test-GridData.json".into(),tessellation:1,size:(16,16)};
  let place=BulkPlace{destination:&d,item_id:40000001,xy:(4,4),orientation:"GridOrientation_DownLeft",free_placement:false};
  let restored=preview_bulk_furniture(&removed.patched_json,&[],&[place]).unwrap();
  let root:Value=serde_json::from_str(&restored.patched_json).unwrap();
  assert_eq!(root["World"]["GridCollection"]["Grids"]["7"]["Objects"]["4"]["Orientation"],"GridOrientation_DownLeft");
  assert_eq!(root["Player"]["ListInventories"]["0"]["Inventory"]["40000001"]["Amount"],2);
  assert!(restored.patched_json.contains("\"Unknown\":1e2"));
 }
 #[test]fn bulk_matches_sequential_stock_and_grid_semantics_without_normalizing_survivors(){
  let a=target("1",40000001);let b=target("2",40000002);let c=target("3",40000001);
  let rows=[BulkPickup{target:&a,expected:(1,1),orientation:"GridOrientation_Down"},BulkPickup{target:&b,expected:(2,2),orientation:"GridOrientation_Down"}];
  let bulk=preview_bulk_furniture(SOURCE,&rows,&[]).unwrap();
  let s=preview_furniture_stock_transaction(SOURCE,2,FurnitureStockAction::Pickup{target:&a,expected:(1,1)}).unwrap();
  let sequential=preview_furniture_stock_transaction(&s.patched_json,0,FurnitureStockAction::Pickup{target:&b,expected:(2,2)}).unwrap();
  assert_eq!(serde_json::from_str::<Value>(&bulk.patched_json).unwrap(),serde_json::from_str::<Value>(&sequential.patched_json).unwrap());
  assert!(bulk.patched_json.contains("\"Other\":1e2"));assert!(bulk.patched_json.contains("\"Unknown\":1e2"));
  assert!(preview_bulk_furniture(SOURCE,&[BulkPickup{target:&c,expected:(3,3),orientation:"GridOrientation_Down"}],&[]).is_err());
  let d=PlainGridDestination{grid_id:"7".into(),layout_path:"SceneLayouts/Village04/Test.json".into(),data_path:"GridData/Test.json".into(),tessellation:1,size:(16,16)};
  let places=[BulkPlace{destination:&d,item_id:40000001,xy:(4,4),orientation:"GridOrientation_Left",free_placement:false},BulkPlace{destination:&d,item_id:40000002,xy:(5,5),orientation:"GridOrientation_Down",free_placement:false}];
  let result=preview_bulk_furniture(&bulk.patched_json,&[],&places).unwrap();
  let one=preview_furniture_stock_transaction(&sequential.patched_json,3,FurnitureStockAction::Place{destination:&d,item_id:40000001,xy:(4,4),orientation:"GridOrientation_Left"}).unwrap();
  let two=preview_furniture_stock_transaction(&one.patched_json,1,FurnitureStockAction::Place{destination:&d,item_id:40000002,xy:(5,5),orientation:"GridOrientation_Down"}).unwrap();
  assert_eq!(serde_json::from_str::<Value>(&result.patched_json).unwrap(),serde_json::from_str::<Value>(&two.patched_json).unwrap());
  assert!(preview_bulk_furniture(SOURCE,&[],&places).is_err()); // second item unavailable
 }
}

#[cfg(test)]
mod mixed_placement_tests{
 use super::*;
 #[test]
 fn mixed_batch_preserves_native_allocation_order_and_matches_sequential_writer(){
  let layout="SceneLayouts/Village04/Test.json";let data="GridData/Test.json";let path="GridData/Furniture/NonIP_SetLess/CornerWallShelf01-GridData.json";
  let src=serde_json::json!({"GameInfo":{"Version":643},"Player":{"ListInventories":{"0":{"ID":0,"CompatibleItemType":"ItemType_Furniture","CompatibleFurnitureTypes":{"List":["FurnitureItemType_Default"]},"Inventory":{"40005160":{"Amount":2},"40005161":{"Amount":3}}}}},"World":{"GridCollection":{"NextGridID":100,"Grids":{"7":{"ID":7,"GridDefaultLayoutPath":layout,"GridDataPath":data,"TessellationFactor":1,"NextGridObjectID":2,"Objects":{"1":{"ID":1,"ItemID":40005161,"X":8,"Y":8,"Orientation":"GridOrientation_Down","Unknown":100.0}}},"8":{"ID":8,"Objects":{}}}}}});
  let source=src.to_string().replace("\"Unknown\":100.0","\"Unknown\":1e2");
  let d=PlainGridDestination{grid_id:"7".into(),layout_path:layout.into(),data_path:data.into(),tessellation:1,size:(16,16)};
  let tree=serde_json::json!({"factor":2,"sourcePath":path,"objects":[{"itemId":40005161,"x":0,"y":0,"orientation":"GridOrientation_Down","child":null}]});
  let pose=|item_id,xy|BulkPlace{destination:&d,item_id,xy,orientation:"GridOrientation_Down",free_placement:false};
  let rows=[BulkScenePlace{pose:pose(40005160,(1,1)),tree:Some(&tree)},BulkScenePlace{pose:pose(40005161,(2,2)),tree:None},BulkScenePlace{pose:pose(40005160,(3,3)),tree:Some(&tree)}];
  let one=crate::support_clone::preview_support_scene_place(&source,40005160,&d,(1,1),"GridOrientation_Down",&tree).unwrap();
  let two=preview_furniture_stock_transaction(&one.patched_json,2,FurnitureStockAction::Place{destination:&d,item_id:40005161,xy:(2,2),orientation:"GridOrientation_Down"}).unwrap();
  let three=crate::support_clone::preview_support_scene_place(&two.patched_json,40005160,&d,(3,3),"GridOrientation_Down",&tree).unwrap();
  let batch=preview_bulk_scene_place(&source,&rows).unwrap();let actual:Value=serde_json::from_str(&batch.patched_json).unwrap();
  assert_eq!(actual,serde_json::from_str::<Value>(&three.patched_json).unwrap());
  assert_eq!(actual["World"]["GridCollection"]["NextGridID"],102);
  assert_eq!(actual["World"]["GridCollection"]["Grids"]["7"]["NextGridObjectID"],5);
  assert!(batch.patched_json.contains("\"Unknown\":1e2"));
  let mut stale=src.clone();stale["ExternalGridID"]=Value::from(101);assert!(preview_bulk_scene_place(&stale.to_string(),&rows).is_err());
  let mut large=src.clone();
  large["World"]["GridCollection"]["NextGridID"]=9000.into();
  for id in 100..2600{large["World"]["GridCollection"]["Grids"][id.to_string()]=serde_json::json!({"ID":id,"Objects":{}});}
  for id in 3000..4000{large["World"]["GridCollection"]["DiffGrids"][id.to_string()]=serde_json::json!({"ID":id,"ModifiedObjects":{}});}
  let source=large.to_string();
  let one=crate::support_clone::preview_support_scene_place(&source,40005160,&d,(1,1),"GridOrientation_Down",&tree).unwrap();
  let two=preview_furniture_stock_transaction(&one.patched_json,2,FurnitureStockAction::Place{destination:&d,item_id:40005161,xy:(2,2),orientation:"GridOrientation_Down"}).unwrap();
  let three=crate::support_clone::preview_support_scene_place(&two.patched_json,40005160,&d,(3,3),"GridOrientation_Down",&tree).unwrap();
  let batch=preview_bulk_scene_place(&source,&rows).unwrap();
  let actual:Value=serde_json::from_str(&batch.patched_json).unwrap();
  assert_eq!(actual,serde_json::from_str::<Value>(&three.patched_json).unwrap());
  assert_eq!(actual["World"]["GridCollection"]["NextGridID"],9002);
  assert_eq!(actual["World"]["GridCollection"]["DiffGrids"],large["World"]["GridCollection"]["DiffGrids"]);
  assert_eq!(actual["World"]["GridCollection"]["Grids"]["2599"],large["World"]["GridCollection"]["Grids"]["2599"]);
  let mut stale=large.clone();stale["ExternalGridID"]=9001.into();assert!(preview_bulk_scene_place(&stale.to_string(),&rows).is_err());
  let mut low=src;low["Player"]["ListInventories"]["0"]["Inventory"]["40005161"]["Amount"]=Value::from(2);assert!(preview_bulk_scene_place(&low.to_string(),&rows).is_err());
 }
}
