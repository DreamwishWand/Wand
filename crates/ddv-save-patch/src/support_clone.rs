//! Experimental support duplication from the currently opened Save.
//! Never copy unknown state or derive Grid metadata from a portable file.
use super::*;
use serde_json::{Map,Value};
const LIMIT:usize=32;
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
fn object(o:&Value,key:&str)->Result<u64,PatchError>{
 let m=o.as_object().filter(|m|m.keys().all(|k|matches!(k.as_str(),"ID"|"ItemID"|"X"|"Y"|"Orientation"|"State"))).ok_or(BAD)?;
 if id(m.get("ID").ok_or(BAD)?)?.to_string()!=key||key=="0"{return Err(BAD);}
 coord(o,"X")?;coord(o,"Y")?;
 if !o.get("Orientation").and_then(Value::as_str).is_some_and(|s|OBSERVED_CARDINAL_ORIENTATIONS.contains(&s)){return Err(BAD);}
 item(m.get("ItemID").ok_or(BAD)?)
}
fn reserved_ref(v:&Value,ids:&HashSet<u32>,grid_context:bool)->bool{
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
  if counter==0{return Err(BAD);}
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
/// Existing parent tree must already have been resolved and validated by
/// the codec. The returned candidate is not runtime or writer authority.
pub fn preview_support_tree_duplicate(source:&str,target:&GridCoordinateTarget,expected:(i32,i32),d:&PlainGridDestination,xy:(i32,i32),orientation:&str)->Result<GridCoordinateDraft,PatchError>{
 duplicate(source,target,expected,d,xy,orientation,None)
}
pub fn preview_support_scene_duplicate(source:&str,target:&GridCoordinateTarget,expected:(i32,i32),d:&PlainGridDestination,xy:(i32,i32),orientation:&str,scene:&Value)->Result<GridCoordinateDraft,PatchError>{
 duplicate(source,target,expected,d,xy,orientation,Some(scene))
}
fn duplicate(source:&str,target:&GridCoordinateTarget,expected:(i32,i32),d:&PlainGridDestination,xy:(i32,i32),orientation:&str,scene:Option<&Value>)->Result<GridCoordinateDraft,PatchError>{
 if source.is_empty()||source.len()>MAX_PROFILE_BYTES||target.kind!=GridObjectKind::Full||target.item_id/100_000!=400{return Err(BAD);}
 // Reuse the exact destination witness and anchor/allocator validation.
 let _=preview_plain_grid_place(source,d,target.item_id,xy,orientation)?;
 let root:Value=serde_json::from_str(source).map_err(|_|PatchError::InvalidDocument)?;
 let c=root.get("World").and_then(|v|v.get("GridCollection")).and_then(Value::as_object).ok_or(BAD)?;
 let grids=c.get("Grids").and_then(Value::as_object).ok_or(BAD)?;
 let diff=c.get("DiffGrids").map(|v|v.as_object().ok_or(BAD)).transpose()?;
 let next=id(c.get("NextGridID").ok_or(BAD)?)?;
 if next==0||grids.len()>2048||diff.is_some_and(|m|m.len()>2048)||grids.iter().chain(diff.into_iter().flat_map(|m|m.iter())).any(|(key,g)|key.parse::<u32>().ok().is_none_or(|n|n.to_string()!=*key||n>=next||g.get("ID").and_then(Value::as_u64)!=Some(u64::from(n)))){return Err(BAD);}
 let source_grid=grids.get(&target.grid_id).ok_or(BAD)?;
 let src=source_grid.get("Objects").and_then(|m|m.get(&target.object_id)).ok_or(BAD)?;
 if object(src,&target.object_id)?!=target.item_id||(coord(src,"X")?,coord(src,"Y")?)!=expected{return Err(BAD);}
 if source_grid.get("TessellationFactor").map_or(Some(1),Value::as_u64)!=Some(u64::from(d.tessellation)){return Err(BAD);}
 let dest=grids.get(&d.grid_id).and_then(|g|g.get("Objects")).and_then(Value::as_object).ok_or(BAD)?;
 if dest.values().any(|o|o.get("ItemID").and_then(Value::as_u64).is_none_or(|n|n/100_000!=401)&&o.get("X").and_then(Value::as_i64)==Some(i64::from(xy.0))&&o.get("Y").and_then(Value::as_i64)==Some(i64::from(xy.1))){return Err(BAD);}
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
 if source.is_empty()||source.len()>MAX_PROFILE_BYTES||item_id/100_000!=400{return Err(BAD);}
 let _=preview_plain_grid_place(source,d,item_id,xy,orientation)?;
 let root:Value=serde_json::from_str(source).map_err(|_|PatchError::InvalidDocument)?;
 let c=root.get("World").and_then(|v|v.get("GridCollection")).and_then(Value::as_object).ok_or(BAD)?;
 let grids=c.get("Grids").and_then(Value::as_object).ok_or(BAD)?;
 let diff=c.get("DiffGrids").map(|v|v.as_object().ok_or(BAD)).transpose()?;
 let next=id(c.get("NextGridID").ok_or(BAD)?)?;
 if next==0||grids.len()>2048||diff.is_some_and(|m|m.len()>2048)||grids.iter().chain(diff.into_iter().flat_map(|m|m.iter())).any(|(key,g)|key.parse::<u32>().ok().is_none_or(|n|n.to_string()!=*key||n>=next||g.get("ID").and_then(Value::as_u64)!=Some(u64::from(n)))){return Err(BAD);}
 let dest=grids.get(&d.grid_id).and_then(|g|g.get("Objects")).and_then(Value::as_object).ok_or(BAD)?;
 if dest.values().any(|o|o.get("ItemID").and_then(Value::as_u64).is_none_or(|n|n/100_000!=401)&&o.get("X").and_then(Value::as_i64)==Some(i64::from(xy.0))&&o.get("Y").and_then(Value::as_i64)==Some(i64::from(xy.1))){return Err(BAD);}
 let target=GridCoordinateTarget{kind:GridObjectKind::Full,grid_id:d.grid_id.clone(),object_id:"1".into(),item_id};
 let mut tree=CloneTree{grids,diff,seen:HashSet::new(),next,created:Vec::new(),stock:vec![item_id],templates:HashMap::new(),plain:HashSet::new(),source_only:true};
 let new_child=tree.scene_grid(item_id,scene,0)?;
 install(source,&root,&target,d,xy,orientation,next,tree,serde_json::json!({"SubGrid":{"GridID":new_child,"DesignID":null}}))
}
fn install(source:&str,root:&Value,target:&GridCoordinateTarget,d:&PlainGridDestination,xy:(i32,i32),orientation:&str,next:u32,tree:CloneTree<'_>,state:Value)->Result<GridCoordinateDraft,PatchError>{
 let reserved=(next..tree.next).collect::<HashSet<_>>();
 if reserved_ref(root,&reserved,false){return Err(BAD);}
 let inventory=root.get("Player").and_then(|v|v.get("ListInventories")).and_then(|v|v.get("0")).and_then(|v|v.get("Inventory")).and_then(Value::as_object).ok_or(BAD)?;
 let mut amounts=HashMap::new();for i in &tree.stock{let v=inventory.get(&i.to_string()).and_then(|v|v.get("Amount")).ok_or(BAD)?;amounts.insert(*i,id(v)?);}
 let mut working=source.to_owned();
 for i in tree.stock{let amount=amounts.get_mut(&i).ok_or(BAD)?;let draft=preview_default_furniture_stock(&working,i,*amount,-1)?;*amount=amount.checked_sub(1).ok_or(BAD)?;working=draft.patched_json;}
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
