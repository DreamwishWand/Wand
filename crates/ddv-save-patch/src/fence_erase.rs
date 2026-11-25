//! Current experimental cardinal fence mutation. Resolve one component
//! privately, remove logical units, and recompile only changed spans.
use super::*;
use super::fence_topology::{self,FencePart,Point,MAX_FENCE_NODES};
use serde_json::Value;
use std::collections::{BTreeSet,BTreeMap};
pub struct FenceEraseDraft{
 pub draft:GridCoordinateDraft,
 pub removed:Vec<(String,u64)>,
 pub allocated:Vec<(String,u64)>,
}
fn number(v:&Value,key:&str)->Result<i32,PatchError>{v.get(key).and_then(Value::as_i64).and_then(|n|i32::try_from(n).ok()).ok_or(PatchError::InvalidTarget)}
fn part(v:&Value,base:u32)->Result<FencePart,PatchError>{
 let item=v.get("ItemID").and_then(Value::as_u64).and_then(|n|u32::try_from(n).ok()).filter(|n|*n>=base&&*n<=base+6).ok_or(PatchError::InvalidTarget)?;
 if v.as_object().is_none_or(|o|o.keys().any(|k|!matches!(k.as_str(),"ID"|"ItemID"|"X"|"Y"|"Orientation"|"State")))||v.get("State").is_some_and(|v|!v.is_null()){return Err(PatchError::InvalidTarget);}
 let left=match v.get("Orientation").and_then(Value::as_str){Some("GridOrientation_Down")=>false,Some("GridOrientation_Left") if item!=base=>true,_=>return Err(PatchError::InvalidTarget)};
 Ok(FencePart{item,x:number(v,"X")?,y:number(v,"Y")?,left,diagonal:false})
}
fn near(a:Point,b:Point,r:u64)->bool{i64::from(a.0).abs_diff(i64::from(b.0))<=r&&i64::from(a.1).abs_diff(i64::from(b.1))<=r}
fn canon(a:Point,b:Point)->(Point,Point){if a<b{(a,b)}else{(b,a)}}
pub fn preview_fence_erase(source:&str,d:&PlainGridDestination,base:u32,seed:Point,erase:&[Point])->Result<FenceEraseDraft,PatchError>{
 let bad=PatchError::InvalidTarget;
 if source.is_empty()||source.len()>MAX_PROFILE_BYTES||!fence_topology::supported_family(base)||!matches!(d.tessellation,1|2)||d.size.0==0||d.size.1==0||d.size.0>65536||d.size.1>65536||!valid_id(&d.grid_id)||d.grid_id.starts_with('0')||full_grid_scope(&d.layout_path).is_none()||erase.is_empty()||erase.len()>MAX_FENCE_NODES{return Err(bad);}
 let q=d.tessellation as i32;let w=(d.size.0*d.tessellation) as i32;let h=(d.size.1*d.tessellation) as i32;
 let valid=|(x,y):Point|x>=0&&y>=0&&x<=w-q&&y<=h-q&&x%q==0&&y%q==0;
 let requested:BTreeSet<_>=erase.iter().copied().collect();
 if !valid(seed)||requested.len()!=erase.len()||requested.iter().any(|&p|!valid(p)){return Err(bad);}
 let mut root:Value=serde_json::from_str(source).map_err(|_|PatchError::InvalidDocument)?;
 let collection=root.get("World").and_then(|v|v.get("GridCollection")).ok_or(PatchError::MissingTarget)?;
 let grids=collection.get("Grids").and_then(Value::as_object).ok_or(PatchError::MissingTarget)?;
 let grid=grids.get(&d.grid_id).ok_or(PatchError::MissingTarget)?;
 let matches=|g:&Value|g.get("GridDefaultLayoutPath").and_then(Value::as_str)==Some(d.layout_path.as_str())&&g.get("GridDataPath").and_then(Value::as_str)==Some(d.data_path.as_str());
 if !matches(grid)||grids.values().filter(|g|matches(g)).count()!=1||grid.get("ID").and_then(Value::as_u64)!=d.grid_id.parse::<u64>().ok()||
 grid.get("TessellationFactor").map_or(Some(1),Value::as_u64)!=Some(u64::from(d.tessellation))||collection.get("DiffGrids").is_some_and(|v|v.as_object().is_none_or(|o|o.contains_key(&d.grid_id))){return Err(PatchError::AmbiguousTarget);}
 let map=grid.get("Objects").and_then(Value::as_object).ok_or(PatchError::MissingTarget)?;
 let next=grid.get("NextGridObjectID").and_then(Value::as_u64).and_then(|n|u32::try_from(n).ok()).filter(|n|*n>0).ok_or(bad)?;
 if map.len()>100_000||map.iter().any(|(k,v)|k.parse::<u32>().ok().is_none_or(|n|n==0||n>=next||n.to_string()!=*k||v.get("ID").and_then(Value::as_u64)!=Some(u64::from(n)))){return Err(PatchError::AmbiguousTarget);}
 // Conservatively close a bounded spatial neighborhood around the seed.
 // A maximal Ext spans seven quanta between posts. Unknown or mixed-mode
 // parts in this neighborhood prevent editing, rather than guessing edges.
 let mut records=Vec::new();
 for (id,v) in map{
  let item=v.get("ItemID").and_then(Value::as_u64).ok_or(bad)?;
  if item/100_000==407{records.push((id,v,(number(v,"X")?,number(v,"Y")?)));}
 }
 let mut cluster=Vec::new();let mut seen=HashSet::new();let mut queue=vec![seed];let mut cursor=0;
 while cursor<queue.len(){
  let p=queue[cursor];cursor+=1;
  for (i,(_,_,xy)) in records.iter().enumerate(){
   if !seen.contains(&i)&&near(p,*xy,u64::from(d.tessellation)*8){
    seen.insert(i);cluster.push(i);queue.push(*xy);
    if cluster.len()>MAX_FENCE_NODES{return Err(bad);}
   }
  }
 }
 let mut parts=BTreeMap::<FencePart,String>::new();
 for i in cluster{let (id,v,_)=records[i];let p=part(v,base)?;if parts.insert(p,id.clone()).is_some(){return Err(PatchError::AmbiguousTarget);}}
 let native:Vec<_>=parts.keys().copied().collect();
 let (nodes,edges)=fence_topology::decompile_fence(base,d.tessellation,false,&native)?;
 if nodes.iter().any(|&p|!valid(p))||!native.iter().any(|p|p.item==base&&(p.x,p.y)==seed){return Err(bad);}
 let mut adjacent=HashMap::<Point,Vec<Point>>::new();for &(a,b) in &edges{adjacent.entry(a).or_default().push(b);adjacent.entry(b).or_default().push(a);}
 let mut selected=BTreeSet::from([seed]);let mut walk=vec![seed];let mut i=0;
 while i<walk.len(){let p=walk[i];i+=1;for &n in adjacent.get(&p).into_iter().flatten(){if selected.insert(n){walk.push(n);}}}
 let removed_nodes:BTreeSet<_>=requested.intersection(&selected).copied().collect();
 if removed_nodes.is_empty()||requested.iter().any(|p|!selected.contains(p)&&nodes.contains(p)){return Err(bad);}
 let survivors:Vec<_>=selected.difference(&removed_nodes).copied().collect();
 let remaining_edges:Vec<_>=edges.iter().copied().filter(|(a,b)|selected.contains(a)&&selected.contains(b)&&!removed_nodes.contains(a)&&!removed_nodes.contains(b)).collect();
 let old_component:BTreeSet<_>=native.iter().copied().filter(|p|selected.contains(&(p.x,p.y))).collect();
 let pinned:BTreeSet<_>=old_component.iter().filter(|p|p.item==base&&!removed_nodes.contains(&(p.x,p.y))).map(|p|(p.x,p.y)).collect();
 let new_component:BTreeSet<_>=if survivors.is_empty(){BTreeSet::new()}else{fence_topology::compile_fence_with_posts(base,d.tessellation,false,&survivors,&remaining_edges,&pinned)?.into_iter().collect()};
 // Roundtrip the entire local neighborhood so no unexpected edge is
 // created to a different component or across a removed logical unit.
 let merged:Vec<_>=native.iter().copied().filter(|p|!old_component.contains(p)).chain(new_component.iter().copied()).collect();
 let expected_nodes:BTreeSet<_>=nodes.iter().copied().filter(|p|!removed_nodes.contains(p)).collect();
 let expected_edges:BTreeSet<_>=edges.iter().copied().filter(|(a,b)|!removed_nodes.contains(a)&&!removed_nodes.contains(b)).map(|(a,b)|canon(a,b)).collect();
 let (got_nodes,got_edges)=if merged.is_empty(){(vec![],vec![])}else{fence_topology::decompile_fence(base,d.tessellation,false,&merged)?};
 if got_nodes.into_iter().collect::<BTreeSet<_>>()!=expected_nodes||got_edges.into_iter().map(|(a,b)|canon(a,b)).collect::<BTreeSet<_>>()!=expected_edges{return Err(bad);}
 let removed:Vec<_>=old_component.difference(&new_component).map(|p|(parts[p].clone(),u64::from(p.item))).collect();
 let added:Vec<_>=new_component.difference(&old_component).copied().collect();
 let following=next.checked_add(added.len() as u32).ok_or(bad)?;
 if map.len()+added.len()>100_000{return Err(bad);}
 let selector=GridCoordinateTarget{kind:GridObjectKind::Full,grid_id:d.grid_id.clone(),object_id:"1".into(),item_id:u64::from(base)};
 let mut locator=JsonLocator::grid_axis(source,&selector,"X")?;locator.signed_path=None;locator.item_path=None;
 let prefix=vec![k("World"),k("GridCollection"),k("Grids"),k(&d.grid_id)];
 let mut parent=prefix.clone();parent.push(k("Objects"));let mut counter=prefix;counter.push(k("NextGridObjectID"));
 locator.capture.insert(parent.clone(),None);locator.capture.insert(counter.clone(),None);locator.walk_complete()?;
 let mr=locator.capture.get(&parent).and_then(|v|v.clone()).ok_or(PatchError::MissingTarget)?;
 let cr=locator.capture.get(&counter).and_then(|v|v.clone()).ok_or(PatchError::MissingTarget)?;
 if source[cr.clone()].parse::<u32>().ok()!=Some(next){return Err(bad);}
 let removed_keys:HashSet<_>=removed.iter().map(|(id,_)|id.as_str()).collect();
 locator.capture.clear();locator.pos=mr.start;locator.expect(b'{')?;
 let mut members=Vec::new();let mut visited=0;
 loop{
  locator.space();if locator.bytes.get(locator.pos)==Some(&b'}'){break;}
  let start=locator.pos;let key=locator.string()?;locator.expect(b':')?;let mut path=parent.clone();path.push(k(&key));locator.value(&mut path)?;
  if !removed_keys.contains(key.as_str()){members.push(source[start..locator.pos].to_owned());}
  visited+=1;locator.space();
  if locator.bytes.get(locator.pos)==Some(&b','){locator.pos+=1;}else if locator.bytes.get(locator.pos)==Some(&b'}'){break;}else{return Err(PatchError::InvalidDocument);}
 }
 if visited!=map.len(){return Err(PatchError::InvalidDocument);}
 let mut additions=Vec::new();let mut allocated=Vec::new();
 for (i,p) in added.iter().enumerate(){
  let id=next+i as u32;let v=serde_json::json!({"ID":id,"ItemID":p.item,"X":p.x,"Y":p.y,"Orientation":if p.left{"GridOrientation_Left"}else{"GridOrientation_Down"},"State":null});
  members.push(format!("\"{}\":{}",id,v));allocated.push((id.to_string(),u64::from(p.item)));additions.push((id.to_string(),v));
 }
 let mut edits=vec![(mr,format!("{{{}}}",members.join(",")))];if next!=following{edits.push((cr,following.to_string()));}edits.sort_unstable_by_key(|(r,_)|r.start);
 let mut candidate=String::new();let mut last=0;for (r,v) in edits{candidate.push_str(&source[last..r.start]);candidate.push_str(&v);last=r.end;}candidate.push_str(&source[last..]);
 if candidate.len()>MAX_PROFILE_BYTES{return Err(PatchError::InvalidDocument);}
 let target=root.get_mut("World").and_then(|v|v.get_mut("GridCollection")).and_then(|v|v.get_mut("Grids")).and_then(|v|v.get_mut(&d.grid_id)).ok_or(PatchError::MissingTarget)?;
 let objects=target.get_mut("Objects").and_then(Value::as_object_mut).ok_or(PatchError::MissingTarget)?;
 for (id,_) in &removed{objects.remove(id);}for (id,v) in additions{objects.insert(id,v);}
 if next!=following{target.as_object_mut().ok_or(bad)?.insert("NextGridObjectID".into(),Value::from(following));}
 if serde_json::from_str::<Value>(&candidate).map_err(|_|PatchError::InvalidDocument)?!=root{return Err(PatchError::InvalidDocument);}
 validate_json_without_edit(&candidate)?;
 Ok(FenceEraseDraft{draft:GridCoordinateDraft{patched_json:candidate,changed:true,untouched_bytes_preserved:true,writer_authorized:false,export_authorized:false},removed,allocated})
}

#[cfg(test)]
mod tests{
 use super::*;
 const SOURCE:&str=r#"{"GameInfo":{"Version":643},"Player":{"ListInventories":{"0":{"Inventory":{"40700246":{"Amount":17,"Marker":"Favorite"}}}}},"World":{"GridCollection":{"Grids":{"7":{"ID":7,"GridDefaultLayoutPath":"SceneLayouts/Village04/Test.json","GridDataPath":"GridData/Test.json","TessellationFactor":2,"NextGridObjectID":6,"Objects":{"1":{"ID":1,"ItemID":40700246,"X":20,"Y":20,"Orientation":"GridOrientation_Down","State":null},"2":{"ID":2,"ItemID":40700252,"X":20,"Y":22,"Orientation":"GridOrientation_Left","State":null},"3":{"ID":3,"ItemID":40700246,"X":20,"Y":34,"Orientation":"GridOrientation_Down","State":null},"4":{"ID":4,"ItemID":40700246,"X":20,"Y":36,"Orientation":"GridOrientation_Down","State":null},"5":{"ID":5,"ItemID":40000001,"X":20,"Y":28,"Orientation":"GridOrientation_Down","Unknown":1e2}}}}}}}"#;
 fn destination()->PlainGridDestination{PlainGridDestination{grid_id:"7".into(),layout_path:"SceneLayouts/Village04/Test.json".into(),data_path:"GridData/Test.json".into(),tessellation:2,size:(40,40)}}
 #[test]fn interior_erase_splits_and_keeps_existing_posts(){
  let result=preview_fence_erase(SOURCE,&destination(),40700246,(20,20),&[(20,28)]).unwrap();
  let old:Value=serde_json::from_str(SOURCE).unwrap();let new:Value=serde_json::from_str(&result.draft.patched_json).unwrap();
  let before=&old["World"]["GridCollection"]["Grids"]["7"]["Objects"];let after=&new["World"]["GridCollection"]["Grids"]["7"]["Objects"];
  for k in ["1","3","4","5"]{assert_eq!(before[k],after[k]);}
  assert!(after.get("2").is_none());assert_eq!(result.removed,vec![("2".into(),40700252)]);assert_eq!(result.allocated.len(),4);
  assert_eq!(new["Player"],old["Player"]);assert!(result.draft.patched_json.contains("\"Unknown\":1e2"));
  let native:Vec<_>=after.as_object().unwrap().values().filter(|v|v["ItemID"].as_u64().unwrap()/100000==407).map(|v|part(v,40700246).unwrap()).collect();
  let (nodes,edges)=fence_topology::decompile_fence(40700246,2,false,&native).unwrap();assert_eq!(nodes.len(),8);assert_eq!(edges.len(),6);assert!(!nodes.contains(&(20,28)));
 }
 #[test]fn reject_empty_stale_and_unknown_state(){
  assert!(preview_fence_erase(SOURCE,&destination(),40700246,(20,20),&[(22,20)]).is_err());
  assert!(preview_fence_erase(SOURCE,&destination(),40700246,(20,22),&[(20,28)]).is_err());
  let unknown=SOURCE.replace("\"State\":null","\"State\":{\"FenceMode\":{\"Diagonal\":true}}");
  assert!(preview_fence_erase(&unknown,&destination(),40700246,(20,20),&[(20,28)]).is_err());
 }
}
