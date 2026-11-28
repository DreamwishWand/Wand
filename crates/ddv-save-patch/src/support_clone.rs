//! Experimental support duplication from the currently opened Save.
//! Never copy unknown state or derive Grid metadata from a portable file.
use super::*;
use serde_json::{Map,Value};
const LIMIT:usize=32;
pub(super) const MAX_WORLD_GRID_RECORDS:usize=8192;
/// Global Grid allocator for both furniture support trees and future room grids.
/// Count full and diff records together; neither may reserve a new identity.
pub(super) fn checked_grid_allocator(c:&Map<String,Value>)->Result<u32,PatchError>{
 let grids=c.get("Grids").and_then(Value::as_object).ok_or(BAD)?;
 let diff=c.get("DiffGrids").map(|v|v.as_object().ok_or(BAD)).transpose()?;
 let next=id(c.get("NextGridID").ok_or(BAD)?)?;
 if next==0||grids.len()+diff.map_or(0,Map::len)>MAX_WORLD_GRID_RECORDS||
 grids.iter().chain(diff.into_iter().flat_map(|m|m.iter())).any(|(key,g)|key.parse::<u32>().ok().is_none_or(|n|n.to_string()!=*key||n>=next||g["ID"].as_u64()!=Some(u64::from(n)))){return Err(BAD);}
 Ok(next)
}
pub(super) fn grid_capacity(grids:&Map<String,Value>,diff:Option<&Map<String,Value>>,added:usize)->bool{
 grids.len().checked_add(diff.map_or(0,Map::len)).and_then(|n|n.checked_add(added)).is_some_and(|n|n<=MAX_WORLD_GRID_RECORDS)
}
const BAD:PatchError=PatchError::InvalidTarget;
fn id(v:&Value)->Result<u32,PatchError>{v.as_u64().and_then(|n|u32::try_from(n).ok()).ok_or(BAD)}
fn item(v:&Value)->Result<u64,PatchError>{v.as_u64().filter(|n|n/100_000==400).ok_or(BAD)}
fn coord(v:&Value,k:&str)->Result<i32,PatchError>{v.get(k).and_then(Value::as_i64).and_then(|n|i32::try_from(n).ok()).ok_or(BAD)}
fn state_child(o:&Value)->Result<Option<u32>,PatchError>{
 match o.get("State"){
  None|Some(Value::Null)=>Ok(None),
  Some(s)=>{
   let m=s.as_object().filter(|m|m.len()==1).ok_or(BAD)?;
   let sub=m.get("SubGrid").and_then(Value::as_object).filter(|m|m.keys().all(|k|matches!(k.as_str(),"GridID"|"DesignID"))&&m.get("DesignID").is_none_or(Value::is_null)).ok_or(BAD)?;
   Ok(Some(id(sub.get("GridID").ok_or(BAD)?)?))
  }
 }
}
fn object(o:&Value,key:&str)->Result<u64,PatchError>{object_mode(o,key,false)}
fn object_mode(o:&Value,key:&str,diagonal_plain:bool)->Result<u64,PatchError>{
 let m=o.as_object().filter(|m|m.keys().all(|k|matches!(k.as_str(),"ID"|"ItemID"|"X"|"Y"|"Orientation"|"State"))).ok_or(BAD)?;
 if id(m.get("ID").ok_or(BAD)?)?.to_string()!=key||key=="0"{return Err(BAD);}
 coord(o,"X")?;coord(o,"Y")?;
 if !o.get("Orientation").and_then(Value::as_str).is_some_and(|s|OBSERVED_CARDINAL_ORIENTATIONS.contains(&s)||diagonal_plain&&EXPERIMENTAL_EIGHT_WAY_ORIENTATIONS.contains(&s)&&o.get("State").is_none_or(Value::is_null)){return Err(BAD);}
 item(m.get("ItemID").ok_or(BAD)?)
}
pub(super) fn reserved_ref(v:&Value,ids:&HashSet<u32>,grid_context:bool)->bool{
 match v{
  Value::Object(m)=>m.iter().any(|(k,v)|{
   let k=k.to_ascii_lowercase();
   if k=="nextgridid"{return false;}
   let marked=grid_context||k.contains("grid")&&k.contains("id");
   reserved_ref(v,ids,marked)
  }),
  Value::Array(a)=>a.iter().any(|v|reserved_ref(v,ids,grid_context)),
  _=>grid_context&&v.as_u64().and_then(|n|u32::try_from(n).ok()).is_some_and(|n|ids.contains(&n))
 }
}
struct CloneTree<'a>{
 grids:&'a Map<String,Value>,diff:Option<&'a Map<String,Value>>,seen:HashSet<u32>,
 next:u32,created:Vec<(u32,Value)>,stock:Vec<u64>,templates:HashMap<u64,Vec<u32>>,plain:HashSet<u64>,source_only:bool
}
impl CloneTree<'_>{
 fn clone_grid(&mut self,old:u32,owner:u64,depth:usize)->Result<u32,PatchError>{
  if depth>8||old==0||!self.seen.insert(old)||self.diff.is_some_and(|m|m.contains_key(&old.to_string()))||self.created.len()>=LIMIT{return Err(BAD);}
  let g=self.grids.get(&old.to_string()).cloned().ok_or(BAD)?;
  let m=g.as_object().filter(|m|m.keys().all(|k|matches!(k.as_str(),"ID"|"Objects"|"GridDataPath"|"TessellationFactor"|"NextGridObjectID"|"GridDefaultLayoutPath"))).ok_or(BAD)?;
  if id(m.get("ID").ok_or(BAD)?)?!=old||m.get("GridDefaultLayoutPath").is_some_and(|v|!v.is_null()&&v.as_str()!=Some(""))||!m.get("GridDataPath").and_then(Value::as_str).is_some_and(|p|p.starts_with("GridData/Furniture/")&&p.ends_with(".json")&&!p.contains("..")&&!p.contains('\\'))||
     !matches!(m.get("TessellationFactor").map_or(Some(1),Value::as_u64),Some(1|2)){return Err(BAD);}
  self.templates.entry(owner).or_default().push(old);
  let counter=id(m.get("NextGridObjectID").ok_or(BAD)?)?;
  // Empty native furniture grids may have a zero counter. Keep the original counter when cloning.
  support_grid_next_object_id(&g)?;
  let fresh=self.next;self.next=self.next.checked_add(1).ok_or(BAD)?;
  // Reserve the entry before descending, including the empty-surface case.
  let slot=self.created.len();self.created.push((fresh,Value::Null));
  let mut clone=g.clone();clone["ID"]=Value::from(fresh);
  let objs=clone.get_mut("Objects").and_then(Value::as_object_mut).ok_or(BAD)?;
  for (key,o) in objs{
   if self.stock.len()>=LIMIT||key.parse::<u32>().ok().is_none_or(|n|n>=counter){return Err(BAD);}
   let i=object(o,key)?;self.stock.push(i);
   if let Some(child)=state_child(o)?{let n=self.clone_grid(child,i,depth+1)?;o["State"]["SubGrid"]["GridID"]=Value::from(n);}else{self.plain.insert(i);}
  }
  self.created[slot].1=clone;Ok(fresh)
 }
 fn scene_grid(&mut self,owner:u64,scene:&Value,depth:usize)->Result<u32,PatchError>{
  if depth>8||self.created.len()>=LIMIT{return Err(BAD);}
  let m=scene.as_object().filter(|m|m.len()==3&&m.keys().all(|k|matches!(k.as_str(),"factor"|"sourcePath"|"objects"))).ok_or(BAD)?;
  let path=m.get("sourcePath").and_then(Value::as_str).ok_or(BAD)?;
  let factor=m.get("factor").and_then(Value::as_u64).filter(|n|matches!(n,1|2)).ok_or(BAD)?;
  let rows=m.get("objects").and_then(Value::as_array).filter(|a|a.len()<LIMIT).ok_or(BAD)?;
  let template_ids=self.templates.get(&owner);
  // Use only observed native metadata for this owner/path/factor, not
  // arbitrary grid metadata supplied by the portable document.
  let mut template=None;
  for old in template_ids.into_iter().flatten(){
   let g=self.grids.get(&old.to_string()).ok_or(BAD)?;
   if g.get("GridDataPath").and_then(Value::as_str)!=Some(path)||g.get("TessellationFactor").map_or(Some(1),Value::as_u64)!=Some(factor){continue;}
   let mut shape=g.clone();let m=shape.as_object_mut().ok_or(BAD)?;
   for k in ["ID","Objects","NextGridObjectID"]{m.remove(k);}
   if template.as_ref().is_some_and(|v|v!=&shape){return Err(BAD);}
   template=Some(shape);
  }
  let mut g=if self.source_only{serde_json::json!({"GridDataPath":path,"TessellationFactor":factor})}else{template.ok_or(BAD)?};
  let fresh=self.next;self.next=self.next.checked_add(1).ok_or(BAD)?;
  let slot=self.created.len();self.created.push((fresh,Value::Null));
  let mut objects=Map::new();let mut anchors=HashSet::new();
  // The local projection enumerates map keys lexicographically.
  let mut keys:Vec<String>=(1..=rows.len()).map(|i|i.to_string()).collect();keys.sort();
  for (key,row) in keys.into_iter().zip(rows){
   let o=row.as_object().filter(|o|o.len()==5&&o.keys().all(|k|matches!(k.as_str(),"itemId"|"x"|"y"|"orientation"|"child"))).ok_or(BAD)?;
   let i=item(o.get("itemId").ok_or(BAD)?)?;
   let xy=(coord(row,"x")?,coord(row,"y")?);
   let orientation=o.get("orientation").and_then(Value::as_str).filter(|s|OBSERVED_CARDINAL_ORIENTATIONS.contains(s)).ok_or(BAD)?;
   if xy.0<0||xy.1<0||!anchors.insert(xy)||self.stock.len()>=LIMIT{return Err(BAD);}
   self.stock.push(i);
   let mut value=serde_json::json!({"ID":key.parse::<u32>().map_err(|_|BAD)?,"ItemID":i,"X":xy.0,"Y":xy.1,"Orientation":orientation});
   let child=o.get("child").ok_or(BAD)?;
   if child.is_null(){if !self.source_only&&(!self.plain.contains(&i)||self.templates.contains_key(&i)){return Err(BAD);}}
   else{let id=self.scene_grid(i,child,depth+1)?;value["State"]=serde_json::json!({"SubGrid":{"GridID":id,"DesignID":null}});}
   objects.insert(key,value);
  }
  g["ID"]=Value::from(fresh);g["NextGridObjectID"]=Value::from((rows.len()+1) as u32);g["Objects"]=Value::Object(objects);self.created[slot].1=g;Ok(fresh)
 }
}
/// Build one source-bound portable tree, with the same per-tree limits
/// and native child record construction as interactive placement.
pub(super) fn build_source_tree(grids:&Map<String,Value>,diff:Option<&Map<String,Value>>,next:u32,owner:u64,scene:&Value)->Result<(u32,u32,Vec<(u32,Value)>,Vec<u64>),PatchError>{
 let mut tree=CloneTree{grids,diff,seen:HashSet::new(),next,created:Vec::new(),stock:vec![owner],templates:HashMap::new(),plain:HashSet::new(),source_only:true};
 let child=tree.scene_grid(owner,scene,0)?;
 Ok((child,tree.next,tree.created,tree.stock))
}
/// Existing parent tree must already have been resolved and validated by
/// the codec. The returned candidate is not runtime or writer authority.
pub fn preview_support_tree_duplicate(source:&str,target:&GridCoordinateTarget,expected:(i32,i32),d:&PlainGridDestination,xy:(i32,i32),orientation:&str)->Result<GridCoordinateDraft,PatchError>{
 duplicate(source,target,expected,d,xy,orientation,None,false,false)
}
pub fn preview_support_scene_duplicate(source:&str,target:&GridCoordinateTarget,expected:(i32,i32),d:&PlainGridDestination,xy:(i32,i32),orientation:&str,scene:&Value)->Result<GridCoordinateDraft,PatchError>{
 duplicate(source,target,expected,d,xy,orientation,Some(scene),false,false)
}
/// Same owned room surface, resolved by the codec; the same clone engine
/// allocates child grids and consumes the exact aggregate inventory.
pub fn preview_indoor_support_tree_duplicate(source:&str,target:&GridCoordinateTarget,expected:(i32,i32),d:&PlainGridDestination,xy:(i32,i32),orientation:&str)->Result<GridCoordinateDraft,PatchError>{
 if target.grid_id!=d.grid_id{return Err(BAD);}
 preview_indoor_support_tree_duplicate_mode(source,target,expected,d,xy,orientation,false)
}
pub fn preview_indoor_support_tree_duplicate_mode(source:&str,target:&GridCoordinateTarget,expected:(i32,i32),d:&PlainGridDestination,xy:(i32,i32),orientation:&str,free:bool)->Result<GridCoordinateDraft,PatchError>{
 if target.grid_id!=d.grid_id{return Err(BAD);}
 duplicate(source,target,expected,d,xy,orientation,None,true,free)
}
pub fn preview_free_outdoor_support_duplicate(source:&str,target:&GridCoordinateTarget,expected:(i32,i32),d:&PlainGridDestination,xy:(i32,i32),orientation:&str,scene:Option<&Value>)->Result<GridCoordinateDraft,PatchError>{
 duplicate(source,target,expected,d,xy,orientation,scene,false,true)
}
fn duplicate(source:&str,target:&GridCoordinateTarget,expected:(i32,i32),d:&PlainGridDestination,xy:(i32,i32),orientation:&str,scene:Option<&Value>,room:bool,free:bool)->Result<GridCoordinateDraft,PatchError>{
 if source.is_empty()||source.len()>MAX_PROFILE_BYTES||target.kind!=GridObjectKind::Full||target.item_id/100_000!=400{return Err(BAD);}
 // Rooms have shared template paths but their exact owner is resolved by
 // the codec. Keep the outdoor layout/path uniqueness contract unchanged.
 if !OBSERVED_CARDINAL_ORIENTATIONS.contains(&orientation)||free&&!room&&super::house_exterior_world(&d.layout_path,&d.data_path).is_none(){return Err(BAD);}
 if room{validate_local_grid_destination_mode(source,d,target.item_id,xy,orientation,"GridData/Rooms/",free)?;}
 else{let _=preview_plain_grid_place(source,d,target.item_id,xy,orientation)?;}
 let root:Value=serde_json::from_str(source).map_err(|_|PatchError::InvalidDocument)?;
 let c=root.get("World").and_then(|v|v.get("GridCollection")).and_then(Value::as_object).ok_or(BAD)?;
 let grids=c.get("Grids").and_then(Value::as_object).ok_or(BAD)?;
 let diff=c.get("DiffGrids").map(|v|v.as_object().ok_or(BAD)).transpose()?;
 let next=checked_grid_allocator(c)?;
 let source_grid=grids.get(&target.grid_id).ok_or(BAD)?;
 if free&&!room&&super::house_exterior_world(source_grid["GridDefaultLayoutPath"].as_str().ok_or(BAD)?,source_grid["GridDataPath"].as_str().ok_or(BAD)?)!=super::house_exterior_world(&d.layout_path,&d.data_path){return Err(BAD);}
 let src=source_grid.get("Objects").and_then(|m|m.get(&target.object_id)).ok_or(BAD)?;
 if object(src,&target.object_id)?!=target.item_id||(coord(src,"X")?,coord(src,"Y")?)!=expected{return Err(BAD);}
 if source_grid.get("TessellationFactor").map_or(Some(1),Value::as_u64)!=Some(u64::from(d.tessellation)){return Err(BAD);}
 let dest=grids.get(&d.grid_id).and_then(|g|g.get("Objects")).and_then(Value::as_object).ok_or(BAD)?;
 if !free&&dest.values().any(|o|o.get("ItemID").and_then(Value::as_u64).is_none_or(|n|n/100_000!=401)&&o.get("X").and_then(Value::as_i64)==Some(i64::from(xy.0))&&o.get("Y").and_then(Value::as_i64)==Some(i64::from(xy.1))){return Err(BAD);}
 let child=state_child(src)?.ok_or(BAD)?;
 let mut tree=CloneTree{grids,diff,seen:HashSet::new(),next,created:Vec::new(),stock:vec![target.item_id],templates:HashMap::new(),plain:HashSet::new(),source_only:false};
 let cloned=tree.clone_grid(child,target.item_id,0)?;
 let new_child=if let Some(scene)=scene{
  tree.next=next;tree.created.clear();tree.stock=vec![target.item_id];
  tree.scene_grid(target.item_id,scene,0)?
 }else{cloned};
 let mut state=src.get("State").cloned().ok_or(BAD)?;state["SubGrid"]["GridID"]=Value::from(new_child);
 install(source,&root,target,d,xy,orientation,next,tree,state)
}
/// Place a source-bound portable scene with no existing native template.
/// The codec/UI must verify each owner/path and native terrain before calling.
pub fn preview_support_scene_place(source:&str,item_id:u64,d:&PlainGridDestination,xy:(i32,i32),orientation:&str,scene:&Value)->Result<GridCoordinateDraft,PatchError>{
 scene_place(source,item_id,d,xy,orientation,scene,false,false)
}
pub fn preview_indoor_support_scene_place(source:&str,item_id:u64,d:&PlainGridDestination,xy:(i32,i32),orientation:&str,scene:&Value)->Result<GridCoordinateDraft,PatchError>{
 preview_indoor_support_scene_place_mode(source,item_id,d,xy,orientation,scene,false)
}
pub fn preview_indoor_support_scene_place_mode(source:&str,item_id:u64,d:&PlainGridDestination,xy:(i32,i32),orientation:&str,scene:&Value,free:bool)->Result<GridCoordinateDraft,PatchError>{
 scene_place(source,item_id,d,xy,orientation,scene,true,free)
}
fn scene_place(source:&str,item_id:u64,d:&PlainGridDestination,xy:(i32,i32),orientation:&str,scene:&Value,room:bool,free:bool)->Result<GridCoordinateDraft,PatchError>{
 if source.is_empty()||source.len()>MAX_PROFILE_BYTES||item_id/100_000!=400{return Err(BAD);}
 if !OBSERVED_CARDINAL_ORIENTATIONS.contains(&orientation)||free&&!room{return Err(BAD);}
 if room{validate_local_grid_destination_mode(source,d,item_id,xy,orientation,"GridData/Rooms/",free)?;}
 else{let _=preview_plain_grid_place(source,d,item_id,xy,orientation)?;}
 let root:Value=serde_json::from_str(source).map_err(|_|PatchError::InvalidDocument)?;
 let c=root.get("World").and_then(|v|v.get("GridCollection")).and_then(Value::as_object).ok_or(BAD)?;
 let grids=c.get("Grids").and_then(Value::as_object).ok_or(BAD)?;
 let diff=c.get("DiffGrids").map(|v|v.as_object().ok_or(BAD)).transpose()?;
 let next=checked_grid_allocator(c)?;
 let dest=grids.get(&d.grid_id).and_then(|g|g.get("Objects")).and_then(Value::as_object).ok_or(BAD)?;
 if !free&&dest.values().any(|o|o.get("ItemID").and_then(Value::as_u64).is_none_or(|n|n/100_000!=401)&&o.get("X").and_then(Value::as_i64)==Some(i64::from(xy.0))&&o.get("Y").and_then(Value::as_i64)==Some(i64::from(xy.1))){return Err(BAD);}
 let target=GridCoordinateTarget{kind:GridObjectKind::Full,grid_id:d.grid_id.clone(),object_id:"1".into(),item_id};
 let mut tree=CloneTree{grids,diff,seen:HashSet::new(),next,created:Vec::new(),stock:vec![item_id],templates:HashMap::new(),plain:HashSet::new(),source_only:true};
 let new_child=tree.scene_grid(item_id,scene,0)?;
 install(source,&root,&target,d,xy,orientation,next,tree,serde_json::json!({"SubGrid":{"GridID":new_child,"DesignID":null}}))
}
fn install(source:&str,root:&Value,target:&GridCoordinateTarget,d:&PlainGridDestination,xy:(i32,i32),orientation:&str,next:u32,tree:CloneTree<'_>,state:Value)->Result<GridCoordinateDraft,PatchError>{
 if !grid_capacity(tree.grids,tree.diff,tree.created.len()){return Err(BAD);}
 let reserved=(next..tree.next).collect::<HashSet<_>>();
 if reserved_ref(root,&reserved,false){return Err(BAD);}
 let working=super::bulk_furniture::preview_bulk_stock(source,&tree.stock,false)?;
 let mut locator=JsonLocator::grid_axis(&working,target,"X")?;
 locator.signed_path=None;locator.item_path=None;
 let gp=vec![k("World"),k("GridCollection"),k("Grids")];let cp=vec![k("World"),k("GridCollection"),k("NextGridID")];
 locator.capture.insert(gp.clone(),None);locator.capture.insert(cp.clone(),None);locator.walk_complete()?;
 let mr=locator.capture.get(&gp).and_then(|v|v.clone()).ok_or(BAD)?;let cr=locator.capture.get(&cp).and_then(|v|v.clone()).ok_or(BAD)?;
 if working[cr.clone()].parse::<u32>().ok()!=Some(next){return Err(BAD);}
 let mut members=String::new();for (id,g) in tree.created{members.push_str(&format!(",\"{}\":{}",id,serde_json::to_string(&g).map_err(|_|BAD)?));}
 let mut patches=[(mr.end-1..mr.end-1,members),(cr,tree.next.to_string())];patches.sort_unstable_by_key(|(r,_)|r.start);
 let mut candidate=String::new();let mut last=0;for (r,v) in patches{if r.start<last{return Err(BAD);}candidate.push_str(&working[last..r.start]);candidate.push_str(&v);last=r.end;}candidate.push_str(&working[last..]);
 validate_json_without_edit(&candidate)?;
 insert_grid_record(&candidate,d,target.item_id,xy,orientation,Some(&serde_json::to_string(&state).map_err(|_|BAD)?))
}

/// Return a complete support hierarchy to inventory. The caller must first
/// verify every removed object's native references and exact source scope.
/// Reuse the strict clone reader to reject any unknown/stateful record.
/// Neither global nor per-grid allocation counters are rolled back.
pub fn preview_support_tree_pickup(source:&str,target:&GridCoordinateTarget,expected:(i32,i32))->Result<GridCoordinateDraft,PatchError>{
 if source.is_empty()||source.len()>MAX_PROFILE_BYTES||target.kind!=GridObjectKind::Full||target.item_id/100_000!=400{return Err(BAD);}
 let mut root:Value=serde_json::from_str(source).map_err(|_|PatchError::InvalidDocument)?;
 let c=root.get("World").and_then(|v|v.get("GridCollection")).and_then(Value::as_object).ok_or(BAD)?;
 let grids=c.get("Grids").and_then(Value::as_object).ok_or(BAD)?;
 let diff=c.get("DiffGrids").map(|v|v.as_object().ok_or(BAD)).transpose()?;
 if diff.is_some_and(|m|m.contains_key(&target.grid_id)){return Err(BAD);}
 let src=grids.get(&target.grid_id).and_then(|g|g.get("Objects")).and_then(|m|m.get(&target.object_id)).ok_or(BAD)?;
 if object(src,&target.object_id)?!=target.item_id||(coord(src,"X")?,coord(src,"Y")?)!=expected{return Err(BAD);}
 let child=state_child(src)?.ok_or(BAD)?;
 let mut tree=CloneTree{grids,diff,seen:HashSet::new(),next:1,created:Vec::new(),stock:vec![target.item_id],templates:HashMap::new(),plain:HashSet::new(),source_only:false};
 tree.clone_grid(child,target.item_id,0)?;
 if tree.seen.contains(&target.grid_id.parse::<u32>().map_err(|_|BAD)?){return Err(BAD);}
 let removed=tree.seen;let stock=tree.stock;
 // Inspect all surviving records, not merely the support ownership fields.
 // Any remaining recognized or unknown Grid-ID reference prevents deletion.
 let map=root["World"]["GridCollection"]["Grids"].as_object_mut().ok_or(BAD)?;
 for id in &removed{map.remove(&id.to_string()).ok_or(BAD)?;}
 map.get_mut(&target.grid_id).and_then(|g|g.get_mut("Objects")).and_then(Value::as_object_mut).and_then(|m|m.remove(&target.object_id)).ok_or(BAD)?;
 if reserved_ref(&root,&removed,false){return Err(BAD);}
 let working=preview_grid_structure(source,target,expected,PlainGridStructureAction::Remove,true)?.patched_json;
 // Delete complete child Grid members, preserving surviving lexical bytes.
 let path=vec![k("World"),k("GridCollection"),k("Grids")];
 let mut locator=JsonLocator::grid_axis(&working,target,"X")?;locator.signed_path=None;locator.item_path=None;
 locator.capture.insert(path.clone(),None);locator.walk_complete()?;
 let range=locator.capture.get(&path).and_then(|v|v.clone()).ok_or(BAD)?;
 locator.capture.clear();locator.pos=range.start;locator.expect(b'{')?;
 let mut members=Vec::new();let mut seen=HashSet::new();
 loop{
  locator.space();if locator.bytes.get(locator.pos)==Some(&b'}'){break;}
  let start=locator.pos;let key=locator.string()?;locator.expect(b':')?;let mut p=path.clone();p.push(k(&key));locator.value(&mut p)?;
  if key.parse::<u32>().ok().is_some_and(|n|removed.contains(&n)){seen.insert(key);}else{members.push(working[start..locator.pos].to_owned());}
  locator.space();if locator.bytes.get(locator.pos)==Some(&b','){locator.pos+=1;}else if locator.bytes.get(locator.pos)==Some(&b'}'){break;}else{return Err(BAD);}
 }
 if seen.len()!=removed.len(){return Err(BAD);}
 let mut candidate=String::with_capacity(working.len());candidate.push_str(&working[..range.start]);candidate.push('{');candidate.push_str(&members.join(","));candidate.push('}');candidate.push_str(&working[range.end..]);
 if serde_json::from_str::<Value>(&candidate).map_err(|_|BAD)?!=root{return Err(BAD);}
 candidate=super::bulk_furniture::preview_bulk_stock(&candidate,&stock,true)?;
 validate_json_without_edit(&candidate)?;
 Ok(GridCoordinateDraft{patched_json:candidate,changed:true,untouched_bytes_preserved:true,writer_authorized:false,export_authorized:false})
}


/// Area-specific multi-root pickup. The codec has already validated exact
/// original ordinals, complete support ownership and native reference closure.
/// Resolve every tree against the same source, then remove all child Grids,
/// parent members and return aggregate stock without per-root Save copies.
pub fn preview_bulk_support_pickup(source:&str,rows:&[super::bulk_furniture::BulkPickup<'_>])->Result<GridCoordinateDraft,PatchError>{
 if source.is_empty()||source.len()>MAX_PROFILE_BYTES||rows.is_empty()||rows.len()>2048{return Err(BAD);}
 let mut root:Value=serde_json::from_str(source).map_err(|_|PatchError::InvalidDocument)?;
 let c=root.get("World").and_then(|v|v.get("GridCollection")).and_then(Value::as_object).ok_or(BAD)?;
 let grids=c.get("Grids").and_then(Value::as_object).ok_or(BAD)?;
 let diff=c.get("DiffGrids").map(|v|v.as_object().ok_or(BAD)).transpose()?;
 let mut removed=HashSet::new();let mut parents=HashMap::<String,HashSet<String>>::new();let mut stock=Vec::new();
 for p in rows{
  let t=p.target;if t.kind!=GridObjectKind::Full||t.item_id/100_000!=400||diff.is_some_and(|m|m.contains_key(&t.grid_id)){return Err(BAD);}
  let grid=grids.get(&t.grid_id).ok_or(BAD)?;
  if !valid_id(&t.grid_id)||grid.get("ID").and_then(Value::as_u64)!=t.grid_id.parse::<u64>().ok(){return Err(BAD);}
  let objects=grid.get("Objects").and_then(Value::as_object).filter(|m|m.len()<=100_000).ok_or(BAD)?;
  let src=objects.get(&t.object_id).ok_or(BAD)?;
  if object(src,&t.object_id)?!=t.item_id||(coord(src,"X")?,coord(src,"Y")?)!=p.expected||src.get("Orientation").and_then(Value::as_str)!=Some(p.orientation){return Err(BAD);}
  if !parents.entry(t.grid_id.clone()).or_default().insert(t.object_id.clone()){return Err(BAD);}
  let child=state_child(src)?.ok_or(BAD)?;
  let mut tree=CloneTree{grids,diff,seen:HashSet::new(),next:1,created:Vec::new(),stock:vec![t.item_id],templates:HashMap::new(),plain:HashSet::new(),source_only:false};
  tree.clone_grid(child,t.item_id,0)?;
  for n in tree.seen{if !removed.insert(n){return Err(BAD);}}
  stock.extend(tree.stock);if stock.len()>2048{return Err(BAD);}
 }
 if parents.keys().any(|s|s.parse::<u32>().ok().is_some_and(|n|removed.contains(&n))){return Err(BAD);}
 let mut locator=JsonLocator::grid_axis(source,rows[0].target,"X")?;locator.signed_path=None;locator.item_path=None;
 let gp=vec![k("World"),k("GridCollection"),k("Grids")];
 locator.capture.insert(gp.clone(),None);
 let mut paths=HashMap::new();
 for id in parents.keys(){let mut p=gp.clone();p.extend([k(id),k("Objects")]);locator.capture.insert(p.clone(),None);paths.insert(id.clone(),p);}
 locator.walk_complete()?;
 let span=|p:&Vec<Segment>|locator.capture.get(p).and_then(|v|v.clone()).ok_or(BAD);
 let gr=span(&gp)?;let mut inner=HashMap::new();
 for (id,p) in &paths{inner.insert(id.clone(),span(p)?);}
 locator.capture.clear();
 // Read only the selected parent maps. Unchanged members remain raw source
 // slices including their numeric notation and unknown fields.
 let mut replacements=HashMap::new();
 for (id,range) in inner{
  let path=paths.get(&id).ok_or(BAD)?;let deleting=parents.get(&id).ok_or(BAD)?;
  locator.pos=range.start;locator.expect(b'{')?;let mut members=Vec::new();let mut seen=0;let mut visited=0;
  loop{
   locator.space();if locator.bytes.get(locator.pos)==Some(&b'}'){break;}
   let start=locator.pos;let key=locator.string()?;locator.expect(b':')?;let mut p=path.clone();p.push(k(&key));locator.value(&mut p)?;
   if deleting.contains(&key){seen+=1;}else{members.push(&source[start..locator.pos]);}
   visited+=1;locator.space();if locator.bytes.get(locator.pos)==Some(&b','){locator.pos+=1;}else if locator.bytes.get(locator.pos)==Some(&b'}'){break;}else{return Err(BAD);}
  }
  if seen!=deleting.len()||visited!=grids[&id]["Objects"].as_object().ok_or(BAD)?.len(){return Err(BAD);}
  replacements.insert(id,(range,format!("{{{}}}",members.join(","))));
 }
 locator.pos=gr.start;locator.expect(b'{')?;
 let mut members=Vec::new();let mut deleted=0;let mut edited=0;let mut visited=0;
 loop{
  locator.space();if locator.bytes.get(locator.pos)==Some(&b'}'){break;}
  let start=locator.pos;let key=locator.string()?;locator.expect(b':')?;let mut p=gp.clone();p.push(k(&key));locator.value(&mut p)?;let end=locator.pos;
  if key.parse::<u32>().ok().is_some_and(|n|removed.contains(&n)){deleted+=1;}
  else if let Some((r,v))=replacements.get(&key){
   if r.start<start||r.end>end{return Err(BAD);}
   members.push(format!("{}{}{}",&source[start..r.start],v,&source[r.end..end]));edited+=1;
  }else{members.push(source[start..end].to_owned());}
  visited+=1;locator.space();if locator.bytes.get(locator.pos)==Some(&b','){locator.pos+=1;}else if locator.bytes.get(locator.pos)==Some(&b'}'){break;}else{return Err(BAD);}
 }
 if visited!=grids.len()||deleted!=removed.len()||edited!=parents.len(){return Err(BAD);}
 let map=root["World"]["GridCollection"]["Grids"].as_object_mut().ok_or(BAD)?;
 for id in &removed{map.remove(&id.to_string()).ok_or(BAD)?;}
 for (id,keys) in parents{let objects=map.get_mut(&id).and_then(|g|g.get_mut("Objects")).and_then(Value::as_object_mut).ok_or(BAD)?;for key in keys{objects.remove(&key).ok_or(BAD)?;}}
 if reserved_ref(&root,&removed,false){return Err(BAD);}
 let candidate=format!("{}{{{}}}{}",&source[..gr.start],members.join(","),&source[gr.end..]);
 if serde_json::from_str::<Value>(&candidate).map_err(|_|BAD)?!=root{return Err(BAD);}
 let patched_json=super::bulk_furniture::preview_bulk_stock(&candidate,&stock,true)?;
 Ok(GridCoordinateDraft{patched_json,changed:true,untouched_bytes_preserved:true,writer_authorized:false,export_authorized:false})
}

#[cfg(test)]
mod bulk_support_pickup_tests{
 use super::*;
 use crate::bulk_furniture::BulkPickup;
 #[test]
 fn multiple_support_trees_return_every_item_and_preserve_neighbor_grid_and_counters(){
  let path="GridData/Furniture/NonIP_SetLess/CornerWallShelf01-GridData.json";
  let source=serde_json::json!({"GameInfo":{"Version":643},"Player":{"ListInventories":{"0":{"ID":0,"CompatibleItemType":"ItemType_Furniture","CompatibleFurnitureTypes":{"List":["FurnitureItemType_Default"]},"Inventory":{"40005160":{"Amount":0},"40005161":{"Amount":2}}}}},"World":{"GridCollection":{"NextGridID":100,"Grids":{
   "7":{"ID":7,"NextGridObjectID":10,"Objects":{
    "1":{"ID":1,"ItemID":40005160,"X":1,"Y":1,"Orientation":"GridOrientation_Down","State":{"SubGrid":{"GridID":80}}},
    "2":{"ID":2,"ItemID":40005160,"X":3,"Y":3,"Orientation":"GridOrientation_Left","State":{"SubGrid":{"GridID":81}}},
    "3":{"ID":3,"ItemID":40005161,"X":8,"Y":8,"Orientation":"GridOrientation_Down","Unknown":100.0}}},
   "8":{"ID":8,"Objects":{},"Unknown":100.0},
   "80":{"ID":80,"GridDataPath":path,"TessellationFactor":2,"NextGridObjectID":2,"Objects":{"1":{"ID":1,"ItemID":40005161,"X":0,"Y":0,"Orientation":"GridOrientation_Down"}}},
   "81":{"ID":81,"GridDataPath":path,"TessellationFactor":2,"NextGridObjectID":2,"Objects":{"1":{"ID":1,"ItemID":40005161,"X":0,"Y":0,"Orientation":"GridOrientation_Down"}}}
  }}}});
  let raw=source.to_string().replace("\"Unknown\":100.0","\"Unknown\":1e2");
  let a=GridCoordinateTarget{kind:GridObjectKind::Full,grid_id:"7".into(),object_id:"1".into(),item_id:40005160};
  let b=GridCoordinateTarget{kind:GridObjectKind::Full,grid_id:"7".into(),object_id:"2".into(),item_id:40005160};
  let rows=[BulkPickup{target:&a,expected:(1,1),orientation:"GridOrientation_Down"},BulkPickup{target:&b,expected:(3,3),orientation:"GridOrientation_Left"}];
  let first=preview_support_tree_pickup(&raw,&a,(1,1)).unwrap();
  let sequential=preview_support_tree_pickup(&first.patched_json,&b,(3,3)).unwrap();
  let result=preview_bulk_support_pickup(&raw,&rows).unwrap();
  let actual:Value=serde_json::from_str(&result.patched_json).unwrap();
  assert_eq!(actual,serde_json::from_str::<Value>(&sequential.patched_json).unwrap());
  assert_eq!(actual["Player"]["ListInventories"]["0"]["Inventory"]["40005160"]["Amount"],2);
  assert_eq!(actual["Player"]["ListInventories"]["0"]["Inventory"]["40005161"]["Amount"],4);
  assert_eq!(actual["World"]["GridCollection"]["NextGridID"],100);
  assert_eq!(actual["World"]["GridCollection"]["Grids"]["7"]["NextGridObjectID"],10);
  assert_eq!(actual["World"]["GridCollection"]["Grids"]["8"],source["World"]["GridCollection"]["Grids"]["8"]);
  assert_eq!(result.patched_json.matches("\"Unknown\":1e2").count(),2);
  let mut stale=source.clone();stale["ExternalGridID"]=Value::from(81);
  assert!(preview_bulk_support_pickup(&stale.to_string(),&rows).is_err());
  let mut duplicate=source;duplicate["World"]["GridCollection"]["Grids"]["7"]["Objects"]["2"]["State"]["SubGrid"]["GridID"]=Value::from(80);
  assert!(preview_bulk_support_pickup(&duplicate.to_string(),&rows).is_err());
 }
}

// Shared validation of structural recovery roots, including all descendants.
// The writer repeats ownership and reference validation before committing.
pub(super) fn structural_recovery_count(root:&Value,rows:&[(GridCoordinateTarget,(i32,i32),String)])->Result<usize,PatchError>{
 let c=root["World"]["GridCollection"].as_object().ok_or(BAD)?;
 let grids=c.get("Grids").and_then(Value::as_object).ok_or(BAD)?;
 let diff=c.get("DiffGrids").map(|v|v.as_object().ok_or(BAD)).transpose()?;
 let mut seen=HashSet::new();let mut counts=HashMap::<u64,u64>::new();let mut total=0usize;
 for (target,xy,orientation) in rows{
  let g=grids.get(&target.grid_id).ok_or(BAD)?;
  if diff.is_some_and(|m|m.contains_key(&target.grid_id)){return Err(BAD);}
  let o=g["Objects"].get(&target.object_id).ok_or(BAD)?;
  let diagonal_plain=g["TessellationFactor"].as_u64()==Some(1)&&g["GridDefaultLayoutPath"].as_str()==Some("")&&g["GridDataPath"].as_str().is_some_and(|p|p.starts_with("GridData/Rooms/Room")&&p.ends_with("-GridData.json"));
  if object_mode(o,&target.object_id,diagonal_plain)?!=target.item_id||(coord(o,"X")?,coord(o,"Y")?)!=*xy||o["Orientation"].as_str()!=Some(orientation.as_str()){return Err(BAD);}
  let mut items=vec![target.item_id];
  if let Some(child)=state_child(o)?{
   let mut tree=CloneTree{grids,diff,seen:HashSet::new(),next:1,created:Vec::new(),stock:items,templates:HashMap::new(),plain:HashSet::new(),source_only:false};
   tree.clone_grid(child,target.item_id,0)?;
   for n in tree.seen{if !seen.insert(n){return Err(BAD);}}
   items=tree.stock;
  }
  for i in items{
   total+=1;if total>2048{return Err(BAD);}
   let n=counts.entry(i).or_default();*n+=1;
   let stock=root["Player"]["ListInventories"]["0"]["Inventory"][i.to_string()]["Amount"].as_u64().ok_or(BAD)?;
   if stock.checked_add(*n).is_none_or(|n|n>i32::MAX as u64){return Err(BAD);}
  }
 }
 if rows.iter().any(|(t,_,_)|t.grid_id.parse::<u32>().ok().is_some_and(|n|seen.contains(&n))){return Err(BAD);}
 Ok(total)
}
pub(super) fn structural_recovery(source:&str,rows:&[(GridCoordinateTarget,(i32,i32),String)],expected:usize)->Result<String,PatchError>{
 use super::bulk_furniture::{BulkPickup,preview_structural_room_pickup};
 let root:Value=serde_json::from_str(source).map_err(|_|BAD)?;
 if expected==0||structural_recovery_count(&root,rows)?!=expected{return Err(BAD);}
 let mut plain=Vec::new();let mut support=Vec::new();
 for (target,xy,orientation) in rows{
  let o=&root["World"]["GridCollection"]["Grids"][&target.grid_id]["Objects"][&target.object_id];
  let row=BulkPickup{target,expected:*xy,orientation};
  if state_child(o)?.is_some(){support.push(row);}else{plain.push(row);}
 }
 let mut working=source.to_owned();
 if !plain.is_empty(){working=preview_structural_room_pickup(&working,&plain)?.patched_json;}
 if !support.is_empty(){working=preview_bulk_support_pickup(&working,&support)?.patched_json;}
 Ok(working)
}
#[cfg(test)]
mod structural_recovery_tests{
 use super::*;
 #[test]fn empty_and_populated_support_trees_recover_exact_stock(){
  let raw=serde_json::json!({"GameInfo":{"Version":643},"Player":{"ListInventories":{"0":{"ID":0,"CompatibleItemType":"ItemType_Furniture","CompatibleFurnitureTypes":{"List":["FurnitureItemType_Default"]},"Inventory":{"40005160":{"Amount":0},"40005161":{"Amount":2}}}}},"World":{"GridCollection":{"NextGridID":100,"Grids":{"7":{"ID":7,"NextGridObjectID":4,"Objects":{"1":{"ID":1,"ItemID":40005160,"X":1,"Y":1,"Orientation":"GridOrientation_Down","State":{"SubGrid":{"GridID":80}}},"2":{"ID":2,"ItemID":40005160,"X":3,"Y":3,"Orientation":"GridOrientation_Down","State":{"SubGrid":{"GridID":81}}}}},"80":{"ID":80,"GridDataPath":"GridData/Furniture/A.json","TessellationFactor":2,"NextGridObjectID":0,"Objects":{}},"81":{"ID":81,"GridDataPath":"GridData/Furniture/A.json","TessellationFactor":2,"NextGridObjectID":2,"Objects":{"1":{"ID":1,"ItemID":40005161,"X":0,"Y":0,"Orientation":"GridOrientation_Down"}}}}}}});
  let rows=vec![(GridCoordinateTarget{kind:GridObjectKind::Full,grid_id:"7".into(),object_id:"1".into(),item_id:40005160},(1,1),"GridOrientation_Down".into()),(GridCoordinateTarget{kind:GridObjectKind::Full,grid_id:"7".into(),object_id:"2".into(),item_id:40005160},(3,3),"GridOrientation_Down".into())];
  assert_eq!(structural_recovery_count(&raw,&rows).unwrap(),3);
  let result=structural_recovery(&raw.to_string(),&rows,3).unwrap();
  let v:Value=serde_json::from_str(&result).unwrap();
  assert_eq!(v["Player"]["ListInventories"]["0"]["Inventory"]["40005160"]["Amount"],2);
  assert_eq!(v["Player"]["ListInventories"]["0"]["Inventory"]["40005161"]["Amount"],3);
  assert!(v["World"]["GridCollection"]["Grids"].get("80").is_none());
  assert!(v["World"]["GridCollection"]["Grids"].get("81").is_none());
  assert_eq!(v["World"]["GridCollection"]["Grids"]["7"]["NextGridObjectID"],4);
  assert!(structural_recovery(&raw.to_string(),&rows,2).is_err());
  let mut bad=raw.clone();bad["World"]["GridCollection"]["Grids"]["80"]["Objects"]["1"]=serde_json::json!({"ID":1});
  assert!(structural_recovery_count(&bad,&rows).is_err());
  let mut alias=raw;alias["World"]["Alias"]=serde_json::json!({"GridID":80});
  assert!(structural_recovery(&alias.to_string(),&rows,3).is_err());
 }
}
