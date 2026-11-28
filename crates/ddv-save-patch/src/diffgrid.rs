//! Private atomic DiffGrid drafts. No export authority. Caller must establish
//! original source authenticity, item restrictions, dependency closure and
//! inventory semantics before selecting a draft. Steam 1.26.2 only.
//! Native DiffGrid.Create 0x42B9D90 initializes the counter to 0x7fffffff.
//! AddObject 0x42BC010 allocates then increments; RemoveObject 0x42BC6E0
//! erases the modified record and marks a default ID removed. UpdateTransform
//! 0x42BCA00 clones an unmodified default into the modified map before editing.
use super::*;
use serde_json::{Value,Map,json};

const FIRST_ADDED:u32=0x7fff_ffff;
const BAD:PatchError=PatchError::InvalidTarget;
const AMBIG:PatchError=PatchError::AmbiguousTarget;

#[derive(Debug,Clone,PartialEq,Eq)]
pub struct DiffPose{
    pub item_id:u32,pub x:i32,pub y:i32,pub orientation:String
}
#[derive(Debug,Clone)]
pub struct DiffDefault{
    pub id:u32,pub pose:DiffPose,
    /// Caller must establish absence of State, From and all unknown fields
    /// in the original protobuf; a zero-length present message is not absent.
    pub plain_source:bool
}
#[derive(Debug,Clone)]
pub struct DiffIdentity{
    pub grid_id:u32,pub layout_path:String,pub layout_type:String,
    pub native_grid_id:u32,pub grid_hash:i32,pub data_hash:i32,
    pub default_count:usize,pub defaults:Vec<DiffDefault>
}
#[derive(Debug,Clone)]
pub enum DiffAction{
    Transform{id:u32,expected:DiffPose,x:i32,y:i32,orientation:String},
    Remove{id:u32,expected:DiffPose},
    Duplicate{id:u32,expected:DiffPose,x:i32,y:i32,orientation:String},
    Add{pose:DiffPose}
}
pub struct DiffDraft{
    pub draft:GridCoordinateDraft,pub allocated_ids:Vec<u32>
}
fn u32v(v:&Value)->Option<u32>{v.as_u64().and_then(|v|u32::try_from(v).ok())}
fn i32v(v:&Value)->Option<i32>{v.as_i64().and_then(|v|i32::try_from(v).ok())}
fn key_id(s:&str)->Option<u32>{let n=s.parse::<u32>().ok()?;(n.to_string()==s).then_some(n)}
fn direction(s:&str)->bool{
    OBSERVED_CARDINAL_ORIENTATIONS.contains(&s)||EXPERIMENTAL_EIGHT_WAY_ORIENTATIONS.contains(&s)
}
fn plain_pose(p:&DiffPose)->bool{plain_furniture_id(u64::from(p.item_id))&&direction(&p.orientation)}
fn pose_of(v:&Value)->Option<DiffPose>{
    Some(DiffPose{item_id:u32v(v.get("ItemID")?)?,x:i32v(v.get("X")?)?,y:i32v(v.get("Y")?)?,
       orientation:v.get("Orientation")?.as_str()?.to_owned()})
}
fn plain_record(v:&Value)->bool{
    v.as_object().is_some_and(|m|m.keys().all(|k|matches!(k.as_str(),"ID"|"ItemID"|"X"|"Y"|"Orientation"|"State"))
      &&m.get("State").is_none_or(|v|v.is_null()||v.as_object().is_some_and(Map::is_empty)))
}
fn record(id:u32,p:&DiffPose)->Value{
    json!({"ID":id,"ItemID":p.item_id,"X":p.x,"Y":p.y,"Orientation":p.orientation,"State":null})
}
fn text(v:&Value)->Result<String,PatchError>{serde_json::to_string(v).map_err(|_|PatchError::InvalidDocument)}
fn exact_grid(g:&Value,id:&DiffIdentity)->bool{
    u32v(&g["ID"])==Some(id.grid_id)&&g["GridDefaultLayoutPath"].as_str()==Some(id.layout_path.as_str())&&
    g["GridDefaultLayoutType"].as_str()==Some(id.layout_type.as_str())&&u32v(&g["DefaultLayoutGridID"])==Some(id.native_grid_id)&&
    i32v(&g["DefaultGridHashCode"])==Some(id.grid_hash)&&i32v(&g["DefaultGridDataHashCode"])==Some(id.data_hash)
}
fn next_id(next:&mut u32)->Result<u32,PatchError>{
    let id=*next;*next=next.checked_add(1).ok_or(BAD)?;Ok(id)
}
fn changed_pose(p:&DiffPose,x:i32,y:i32,orientation:&str)->Result<DiffPose,PatchError>{
    let out=DiffPose{item_id:p.item_id,x,y,orientation:orientation.to_owned()};
    if !plain_pose(&out){return Err(BAD);}Ok(out)
}
fn path(parent:&[Segment],key:&str)->Vec<Segment>{let mut p=parent.to_vec();p.push(k(key));p}

/// Stock-aware batch using the same existing furniture inventory route as
/// Full Grid. Source defaults are not an entitlement: only an added object
/// can be returned to stock. A caller must still check canonical item
/// metadata and dependencies before invoking this private draft.
pub fn preview_diffgrid_stock_batch(source:&str,identity:&DiffIdentity,actions:&[DiffAction],stock:&HashMap<u32,u32>)->Result<DiffDraft,PatchError>{
    let defaults:HashSet<u32>=identity.defaults.iter().map(|d|d.id).collect();
    let mut deltas=HashMap::<u32,Vec<i8>>::new();
    for a in actions{
        let (item,delta)=match a{
            DiffAction::Transform{..}=>continue,
            DiffAction::Remove{id,expected} if !defaults.contains(id)=>(expected.item_id,1),
            DiffAction::Remove{..}=>continue,
            DiffAction::Duplicate{expected,..}=>(expected.item_id,-1),
            DiffAction::Add{pose}=>(pose.item_id,-1)
        };
        deltas.entry(item).or_default().push(delta);
    }
    if stock.len()!=deltas.len()||deltas.keys().any(|item|!stock.contains_key(item)){return Err(BAD);}
    let mut draft=preview_diffgrid_batch(source,identity,actions)?;
    let mut items=deltas.into_iter().collect::<Vec<_>>();items.sort_by_key(|(item,_)|*item);
    for (item,changes) in items{
        let mut amount=stock[&item];
        for delta in changes{
            let q=preview_default_furniture_stock(&draft.draft.patched_json,u64::from(item),amount,delta)?;
            amount=u32::try_from(q.replacement_amount).map_err(|_|BAD)?;
            draft.draft.patched_json=q.patched_json;
        }
    }
    Ok(draft)
}

/// Reuses the codec's strict lexical locator for one pass over the profile.
/// Unedited object records, counters, removal markers and unknown fields
/// outside the selected changes remain byte-exact. A batch failure returns
/// no candidate. These drafts deliberately do not change ownership stock.
pub fn preview_diffgrid_batch(source:&str,identity:&DiffIdentity,actions:&[DiffAction])->Result<DiffDraft,PatchError>{
    if source.is_empty()||source.len()>MAX_PROFILE_BYTES||actions.is_empty()||actions.len()>MAX_GRID_MIXED_EDITS||
       identity.defaults.len()!=identity.default_count||identity.defaults.len()>100_000||
       identity.grid_id==0||!identity.layout_path.starts_with("SceneLayouts/")||!identity.layout_path.ends_with(".json")||
       identity.layout_path.len()>512||identity.layout_path.contains("..")||
       !matches!(identity.layout_type.as_str(),"Meta.GridCollection, Meta"|"Meta.DefaultCharacterHouseData, Meta"|
         "Meta.DefaultBoutiqueBuildingData, Meta"|"Meta.DefaultRealmData, Meta"|"Meta.DefaultOffGridBuildingData, Meta"){
        return Err(BAD);
    }
    let mut root:Value=serde_json::from_str(source).map_err(|_|PatchError::InvalidDocument)?;
    if root["GameInfo"]["Version"].as_u64()!=Some(643){return Err(BAD);}
    let gid=identity.grid_id.to_string();
    let collection=root["World"]["GridCollection"].as_object_mut().ok_or(BAD)?;
    if collection.get("Grids").is_some_and(|v|v.as_object().is_none_or(|m|m.contains_key(&gid))){return Err(AMBIG);}
    let g=collection.get_mut("DiffGrids").and_then(Value::as_object_mut).and_then(|m|m.get_mut(&gid)).ok_or(BAD)?;
    if !exact_grid(g,identity){return Err(AMBIG);}
    let mut next=u32v(&g["NextGridObjectID"]).filter(|n|*n>=FIRST_ADDED).ok_or(BAD)?;
    let original_next=next;
    let mut defaults=HashMap::new();
    for d in &identity.defaults{
        if d.id>=next||defaults.insert(d.id,d).is_some(){return Err(AMBIG);}
    }
    let mut modified=g["ModifiedObjects"].as_object().filter(|m|m.len()<=100_000).ok_or(BAD)?.clone();
    let mut removed=g["RemovedObjects"].as_array().filter(|a|a.len()<=100_000).ok_or(BAD)?.clone();
    let mut removed_set=HashSet::new();
    for v in &removed{let id=u32v(v).filter(|n|*n<next).ok_or(BAD)?;removed_set.insert(id);}
    for (k,v) in &modified{
        let id=key_id(k).filter(|n|*n<next).ok_or(BAD)?;
        if u32v(&v["ID"])!=Some(id){return Err(AMBIG);}
    }
    let mut deleted=HashSet::new();
    let mut added=Vec::<(u32,Value)>::new();
    let mut transformed=Vec::<(u32,DiffPose,DiffPose)>::new();
    let mut new_markers=Vec::new();
    let mut allocated=Vec::new();
    let mut selected=HashSet::new();
    for action in actions{
        if let DiffAction::Add{pose}=action{
            if !plain_pose(pose){return Err(BAD);}
            let id=next_id(&mut next)?;
            let v=record(id,pose);modified.insert(id.to_string(),v.clone());added.push((id,v));allocated.push(id);
            continue;
        }
        let (id,expected)=match action{
            DiffAction::Transform{id,expected,..}|DiffAction::Remove{id,expected}|DiffAction::Duplicate{id,expected,..}=>(*id,expected),
            DiffAction::Add{..}=>unreachable!()
        };
        // Do not normalize conflicting pre-existing markers; game lookup and
        // enumeration differ. Unrelated conflicts are preserved verbatim.
        if !selected.insert(id)||removed_set.contains(&id)||!plain_pose(expected){return Err(AMBIG);}
        let key=id.to_string();
        let existing=modified.get(&key);
        let actual=match existing{
            Some(v)=>{if !plain_record(v){return Err(BAD);}pose_of(v).ok_or(BAD)?},
            None=>{let d=defaults.get(&id).filter(|d|d.plain_source).ok_or(BAD)?;d.pose.clone()}
        };
        if &actual!=expected{return Err(PatchError::CoordinateMismatch);}
        match action{
            DiffAction::Transform{x,y,orientation,..}=>{
                let p=changed_pose(&actual,*x,*y,orientation)?;
                if p==actual{return Err(BAD);}
                if let Some(v)=modified.get_mut(&key){
                    v["X"]=json!(p.x);v["Y"]=json!(p.y);v["Orientation"]=json!(p.orientation);
                    transformed.push((id,actual,p));
                }else{
                    let v=record(id,&p);modified.insert(key,v.clone());added.push((id,v));
                }
            }
            DiffAction::Remove{..}=>{
                if modified.remove(&key).is_some(){deleted.insert(id);}
                if defaults.contains_key(&id){
                    removed_set.insert(id);removed.push(json!(id));new_markers.push(id);
                }
            }
            DiffAction::Duplicate{x,y,orientation,..}=>{
                let p=changed_pose(&actual,*x,*y,orientation)?;
                let id=next_id(&mut next)?;let v=record(id,&p);
                modified.insert(id.to_string(),v.clone());added.push((id,v));allocated.push(id);
            }
            DiffAction::Add{..}=>unreachable!()
        }
    }
    if modified.len()>100_000||removed.len()>100_000{return Err(BAD);}
    g["ModifiedObjects"]=Value::Object(modified);
    g["RemovedObjects"]=Value::Array(removed);
    g["NextGridObjectID"]=json!(next);
    let prefix=vec![k("World"),k("GridCollection"),k("DiffGrids"),k(&gid)];
    let map_path=path(&prefix,"ModifiedObjects");
    let removed_path=path(&prefix,"RemovedObjects");
    let counter_path=path(&prefix,"NextGridObjectID");
    let mut parser=JsonLocator::new(source,QuantityTarget::Inventory{inventory_id:"1".into(),item_id:"1".into()})?;
    parser.amount_path=vec![Segment::Index(usize::MAX)];
    for p in [&map_path,&removed_path,&counter_path]{parser.capture.insert(p.clone(),None);}
    for (id,_,_) in &transformed{
        let p=path(&map_path,&id.to_string());
        for field in ["X","Y","Orientation"]{parser.capture.insert(path(&p,field),None);}
    }
    parser.walk_complete()?;
    let span=|p:&Vec<Segment>|parser.capture.get(p).and_then(|v|v.clone()).ok_or(PatchError::MissingTarget);
    let mr=span(&map_path)?;let rr=span(&removed_path)?;let cr=span(&counter_path)?;
    let mut edits=Vec::<(Range<usize>,String)>::new();
    for (id,old,new) in &transformed{
        let p=path(&map_path,&id.to_string());
        if old.x!=new.x{edits.push((span(&path(&p,"X"))?,new.x.to_string()));}
        if old.y!=new.y{edits.push((span(&path(&p,"Y"))?,new.y.to_string()));}
        if old.orientation!=new.orientation{edits.push((span(&path(&p,"Orientation"))?,text(&json!(new.orientation))?));}
    }
    if next!=original_next{edits.push((cr,next.to_string()));}
    if !new_markers.is_empty(){
        let old:Vec<Value>=serde_json::from_str(&source[rr.clone()]).map_err(|_|BAD)?;
        let suffix=format!("{}{}",if old.is_empty(){""}else{","},new_markers.iter().map(u32::to_string).collect::<Vec<_>>().join(","));
        edits.push((rr.end-1..rr.end-1,suffix));
    }
    // Scan only the selected map to find contiguous member-removal runs.
    // Keep every surviving original key and value in its original bytes.
    let mut m=JsonLocator::new(source,QuantityTarget::Inventory{inventory_id:"1".into(),item_id:"1".into()})?;
    m.amount_path=vec![Segment::Index(usize::MAX)];m.pos=mr.start;m.expect(b'{')?;
    let mut members=Vec::<(u32,usize,usize,Option<usize>)>::new();
    loop{
        m.space();if m.bytes.get(m.pos)==Some(&b'}'){break;}
        let start=m.pos;let key=m.string()?;m.expect(b':')?;
        m.value(&mut vec![])?;let end=m.pos;m.space();
        let comma=if m.bytes.get(m.pos)==Some(&b','){let n=m.pos;m.pos+=1;Some(n)}else{None};
        members.push((key_id(&key).ok_or(BAD)?,start,end,comma));
        if comma.is_none(){break;}
    }
    if members.iter().filter(|(id,..)|deleted.contains(id)).count()!=deleted.len(){return Err(AMBIG);}
    let mut i=0;
    while i<members.len(){
        if !deleted.contains(&members[i].0){i+=1;continue;}
        let start=i;while i<members.len()&&deleted.contains(&members[i].0){i+=1;}
        let end=i-1;
        let range=if let Some(c)=members[end].3{members[start].1..c+1}
            else if start>0{members[start-1].3.ok_or(BAD)?..members[end].2}
            else{members[start].1..members[end].2};
        edits.push((range,String::new()));
    }
    if !added.is_empty(){
        let mut suffix=String::new();
        if members.len()>deleted.len(){suffix.push(',');}
        for (i,(id,v)) in added.iter().enumerate(){
            if i>0{suffix.push(',');}
            suffix.push_str(&format!("\"{}\":{}",id,text(v)?));
        }
        edits.push((mr.end-1..mr.end-1,suffix));
    }
    edits.sort_by_key(|(r,_)|r.start);
    let mut candidate=String::with_capacity(source.len());let mut last=0;
    for (r,v) in edits{
        if r.start<last{return Err(AMBIG);}
        candidate.push_str(&source[last..r.start]);candidate.push_str(&v);last=r.end;
    }
    candidate.push_str(&source[last..]);
    if candidate.len()>MAX_PROFILE_BYTES{return Err(BAD);}
    validate_json_without_edit(&candidate)?;
    let actual:Value=serde_json::from_str(&candidate).map_err(|_|BAD)?;
    if actual!=root||candidate==source{return Err(AMBIG);}
    Ok(DiffDraft{draft:GridCoordinateDraft{patched_json:candidate,changed:true,untouched_bytes_preserved:true,
        writer_authorized:false,export_authorized:false},allocated_ids:allocated})
}

#[cfg(test)]
mod tests{
    use super::*;
    fn pose(x:i32)->DiffPose{DiffPose{item_id:40000001,x,y:2,orientation:"GridOrientation_Up".into()}}
    fn identity()->DiffIdentity{DiffIdentity{grid_id:8,layout_path:"SceneLayouts/Houses/TestHouse/Test.json".into(),
       layout_type:"Meta.DefaultCharacterHouseData, Meta".into(),native_grid_id:0,grid_hash:-1,data_hash:2,
       default_count:2,defaults:vec![DiffDefault{id:1,pose:pose(1),plain_source:true},DiffDefault{id:2,pose:pose(2),plain_source:true}]}}
    fn profile()->String{
        let i=identity();json!({"GameInfo":{"Version":643},"World":{"GridCollection":{"DiffGrids":{"8":{
           "ID":8,"GridDefaultLayoutPath":i.layout_path,"GridDefaultLayoutType":i.layout_type,"DefaultLayoutGridID":0,
           "DefaultGridHashCode":-1,"DefaultGridDataHashCode":2,"NextGridObjectID":FIRST_ADDED+2,
           "ModifiedObjects":{(FIRST_ADDED.to_string()):record(FIRST_ADDED,&pose(3)),((FIRST_ADDED+1).to_string()):{"ID":FIRST_ADDED+1,"ItemID":40000001,"X":4,"Y":2,"Orientation":"GridOrientation_Up","State":{"Future":"KEEP"}}},
           "RemovedObjects":[],"Future":{"preserve":"raw"}
        }}}},"Unrelated":"unchanged"}).to_string()
    }
    #[test]
    fn mixed_batch_materializes_default_removes_native_and_added_and_allocates(){
        let s=profile();let i=identity();
        let a=[DiffAction::Transform{id:1,expected:pose(1),x:9,y:2,orientation:"GridOrientation_Right".into()},
          DiffAction::Remove{id:2,expected:pose(2)},DiffAction::Remove{id:FIRST_ADDED,expected:pose(3)},
          DiffAction::Duplicate{id:1,expected:pose(1),x:8,y:2,orientation:"GridOrientation_Up".into()}];
        // Same original target twice is rejected atomically.
        assert!(preview_diffgrid_batch(&s,&i,&a).is_err());
        let b=[a[0].clone(),a[1].clone(),a[2].clone(),DiffAction::Add{pose:pose(5)}];
        let result=preview_diffgrid_batch(&s,&i,&b).unwrap();
        let root:Value=serde_json::from_str(&result.draft.patched_json).unwrap();
        let g=&root["World"]["GridCollection"]["DiffGrids"]["8"];
        assert_eq!(g["ModifiedObjects"]["1"]["X"],9);
        assert_eq!(g["RemovedObjects"],json!([2]));
        assert!(g["ModifiedObjects"].get(FIRST_ADDED.to_string()).is_none());
        assert_eq!(g["NextGridObjectID"],FIRST_ADDED+3);
        assert_eq!(result.allocated_ids,vec![FIRST_ADDED+2]);
        assert!(result.draft.patched_json.contains("\"Future\":\"KEEP\""));
        assert!(!result.draft.export_authorized);
    }
    #[test]
    fn existing_transform_and_duplicate_preserve_unselected_bytes(){
        let s=profile().replace("\"Future\":\"KEEP\"","\"Future\" : \"KEEP\"");
        let i=identity();
        let result=preview_diffgrid_batch(&s,&i,&[
            DiffAction::Transform{id:FIRST_ADDED,expected:pose(3),x:7,y:2,orientation:"GridOrientation_Down".into()},
            DiffAction::Duplicate{id:1,expected:pose(1),x:8,y:2,orientation:"GridOrientation_Up".into()}
        ]).unwrap();
        let root:Value=serde_json::from_str(&result.draft.patched_json).unwrap();
        let g=&root["World"]["GridCollection"]["DiffGrids"]["8"];
        assert_eq!(g["ModifiedObjects"][FIRST_ADDED.to_string()]["X"],7);
        assert_eq!(g["ModifiedObjects"][(FIRST_ADDED+2).to_string()]["X"],8);
        assert!(g["ModifiedObjects"].get("1").is_none());
        assert!(result.draft.patched_json.contains("\"Future\" : \"KEEP\""));
    }
    #[test]
    fn rejects_wrong_hash_unknown_state_and_removed_targets(){
        let s=profile();let mut i=identity();i.grid_hash=9;
        let a=DiffAction::Remove{id:1,expected:pose(1)};
        assert!(preview_diffgrid_batch(&s,&i,&[a.clone()]).is_err());
        i.grid_hash=-1;i.defaults[0].plain_source=false;
        assert!(preview_diffgrid_batch(&s,&i,&[a]).is_err());
        assert!(preview_diffgrid_batch(&s,&i,&[DiffAction::Remove{id:FIRST_ADDED+1,expected:pose(4)}]).is_err());
    }
}
