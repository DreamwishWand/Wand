//! Common final-copy guard for ordinary editing (not a quest writer).
//! Exact serialized state and address preservation; not proof of quest
//! completion, item requirements, or game-runtime compatibility.
use super::CodecError;
use serde_json::Value;
use std::collections::{HashMap,HashSet};

fn world_field<'a>(root:&'a Value,key:&str)->Option<&'a Value>{
    root.get("World").and_then(|w|w.get(key))
}

fn collect_addresses(value:&Value,addresses:&mut HashSet<(u64,u64)>)->Result<(),CodecError>{
    let mut stack=vec![(value,0usize)];
    let mut visited=0usize;
    while let Some((v,depth))=stack.pop(){
        visited+=1;
        if visited>2_000_000||depth>256{return Err(CodecError::Bounds);}
        match v{
            Value::Object(o)=>{
                // Exact paired native address, not a bare local ordinal or
                // a quest ItemID. Accept observed case variants only.
                let grid=o.get("GridID").or_else(||o.get("GridId")).and_then(Value::as_u64);
                let object=o.get("GridObjectID").or_else(||o.get("GridObjectId")).and_then(Value::as_u64);
                if let (Some(grid),Some(object))=(grid,object){
                    // Grid ID 0 is a valid native map key; only the
                    // all-zero address is the uninitialized sentinel.
                    if grid>0||object>0{
                        addresses.insert((grid,object));
                        if addresses.len()>100_000{return Err(CodecError::Bounds);}
                    }
                }
                stack.extend(o.values().map(|v|(v,depth+1)));
            },
            Value::Array(a)=>stack.extend(a.iter().map(|v|(v,depth+1))),
            _=>{}
        }
    }
    Ok(())
}

fn grid<'a>(root:&'a Value,kind:&str,id:&str)->Option<&'a Value>{
    world_field(root,"GridCollection")?.get(kind)?.get(id)
}

fn removed(grid:Option<&Value>,id:&str,number:u64)->bool{
    match grid.and_then(|g|g.get("RemovedObjects")){
        Some(Value::Array(rows))=>rows.iter().any(|v|v.as_u64()==Some(number)||v.get("ID").and_then(Value::as_u64)==Some(number)),
        Some(Value::Object(rows))=>rows.contains_key(id)||rows.values().any(|v|v.as_u64()==Some(number)||v.get("ID").and_then(Value::as_u64)==Some(number)),
        _=>false
    }
}

fn same_address(before:&Value,after:&Value,g:u64,o:u64)->bool{
    let gid=g.to_string();let oid=o.to_string();
    for (kind,objects) in [("Grids","Objects"),("DiffGrids","ModifiedObjects")]{
        let a=grid(before,kind,&gid);let b=grid(after,kind,&gid);
        let record=|grid:Option<&Value>|grid.and_then(|v|v.get(objects)).and_then(|v|v.get(&oid)).cloned();
        let old=record(a);let new=record(b);
        if old!=new{return false;}
        // Only compare grid metadata for a materialized referenced record.
        // Unrelated objects and counters on the same grid remain editable.
        if old.is_some(){
            for key in ["ID","GridDataPath","GridDefaultLayoutPath","TessellationFactor"]{
                if a.and_then(|v|v.get(key))!=b.and_then(|v|v.get(key)){return false;}
            }
        }
        if kind=="DiffGrids"{
            if removed(a,&oid,o)!=removed(b,&oid,o){return false;}
            // An address can refer to an unchanged default object with no
            // ModifiedObjects entry. Changing its base layout or either
            // native hash can silently change that object at load time.
            // Preserve all five native identity fields and existence.
            if a.is_some()!=b.is_some(){return false;}
            for key in ["ID","GridDefaultLayoutPath","GridDefaultLayoutType",
                        "DefaultLayoutGridID","DefaultGridHashCode","DefaultGridDataHashCode"]{
                if a.and_then(|v|v.get(key))!=b.and_then(|v|v.get(key)){return false;}
            }
        }
    }
    true
}

// The local pose of a quest object on a support can remain identical even
// when its parent is moved. Protect its complete native ownership chain.
type Address=(u64,u64);
type Owners=HashMap<u64,HashSet<Address>>;
fn support_owners(root:&Value)->Result<Owners,CodecError>{
    let mut owners=Owners::new();let mut count=0usize;
    for (kind,field) in [("Grids","Objects"),("DiffGrids","ModifiedObjects")]{
        if let Some(grids)=world_field(root,"GridCollection").and_then(|c|c.get(kind)).and_then(Value::as_object){
            for (gid,g) in grids{
                let Ok(grid)=gid.parse::<u64>()else{continue;};
                if let Some(objects)=g.get(field).and_then(Value::as_object){
                    for (oid,o) in objects{
                        count+=1;if count>2_000_000{return Err(CodecError::Bounds);}
                        if let (Ok(object),Some(child))=(oid.parse::<u64>(),o.get("State").and_then(|s|s.get("SubGrid")).and_then(|s|s.get("GridID")).and_then(Value::as_u64)){
                            owners.entry(child).or_default().insert((grid,object));
                        }
                    }
                }
            }
        }
    }
    Ok(owners)
}
fn preserve_address_hierarchies(before:&Value,after:&Value,mut addresses:HashSet<Address>)->Result<(),CodecError>{
    if addresses.is_empty(){return Ok(());}
    let old=support_owners(before)?;let new=support_owners(after)?;
    let mut queue:Vec<_>=addresses.iter().copied().collect();
    while let Some((grid,object))=queue.pop(){
        if !same_address(before,after,grid,object)||old.get(&grid)!=new.get(&grid){return Err(CodecError::Patch);}
        if let Some(parents)=old.get(&grid){
            for &parent in parents{if addresses.insert(parent){if addresses.len()>100_000{return Err(CodecError::Bounds);}queue.push(parent);}}
        }
    }
    Ok(())
}

pub(super) fn preserve_progression(source:&[u8],candidate:&[u8])->Result<(),CodecError>{
    let before:Value=serde_json::from_slice(source).map_err(|_|CodecError::Json)?;
    let after:Value=serde_json::from_slice(candidate).map_err(|_|CodecError::Json)?;
    for key in ["MissionSlots","QuestInfo"]{
        if world_field(&before,key)!=world_field(&after,key){return Err(CodecError::Patch);}
    }
    if before.get("ConditionalEventHistory")!=after.get("ConditionalEventHistory"){return Err(CodecError::Patch);}
    let mut addresses=HashSet::new();
    for key in ["MissionSlots","QuestInfo"]{
        if let Some(state)=world_field(&before,key){collect_addresses(state,&mut addresses)?;}
    }
    // Native ConditionalEventState has six action-state discriminants.
    // Preserve explicit paired addresses anywhere in ActiveEvents, not only
    // the SpawnState branch. Scalar completion history is not an address.
    if let Some(events)=before.get("ConditionalEventHistory").and_then(|v|v.get("ActiveEvents")){
        collect_addresses(events,&mut addresses)?;
    }
    preserve_address_hierarchies(&before,&after,addresses)
}

#[cfg(test)]
mod tests{
    use super::*;
    use serde_json::json;
    fn fixture()->Value{
        json!({"World":{
          "MissionSlots":{"a":{"Slots":[{"MissionId":123,"State":"MissionSlotState_OnGoing","Target":{"GridID":10,"GridObjectID":2},"MissionSteps":[{"SubSteps":[{"Objectives":[{"GridObjectIdsCollected":[3]}]}]}]}]}},
          "QuestInfo":{"MissionsCompleted":[123]},
          "GridCollection":{"Grids":{
            "10":{"ID":10,"GridDataPath":"a","Objects":{"2":{"ID":2,"X":1},"3":{"ID":3,"X":1}}},
            "20":{"ID":20,"Objects":{"2":{"ID":2,"X":1},"4":{"ID":4,"X":1}}}
          },"DiffGrids":{"10":{"ModifiedObjects":{},"RemovedObjects":[]}}}
        },"ConditionalEventHistory":{"ActiveEvents":{"a":{"SpawnState":{"SpawnedObjects":[{"GridID":20,"GridObjectID":4},{"GridID":10,"GridObjectID":9}]}}}},
        "Player":{"Stock":1}})
    }
    fn check(a:&Value,b:&Value)->bool{
        preserve_progression(&serde_json::to_vec(a).unwrap(),&serde_json::to_vec(b).unwrap()).is_ok()
    }
    #[test]
    fn independent_objects_history_and_stock_remain_editable(){
        let a=fixture();let mut b=a.clone();
        b["World"]["GridCollection"]["Grids"]["10"]["Objects"]["3"]["X"]=9.into();
        b["World"]["GridCollection"]["Grids"]["20"]["Objects"]["2"]["X"]=9.into();
        b["Player"]["Stock"]=99.into();
        assert!(check(&a,&b));
    }
    #[test]
    fn protects_quest_state_active_object_and_missing_reference(){
        let a=fixture();let mut b=a.clone();
        b["World"]["MissionSlots"]["a"]["Slots"][0]["State"]="MissionSlotState_Available".into();assert!(!check(&a,&b));
        b=a.clone();b["World"]["QuestInfo"]["MissionsCompleted"]=json!([]);assert!(!check(&a,&b));
        b=a.clone();b["ConditionalEventHistory"]=json!({});assert!(!check(&a,&b));
        b=a.clone();b["World"]["GridCollection"]["Grids"]["10"]["Objects"]["2"]["X"]=9.into();assert!(!check(&a,&b));
        b=a.clone();b["World"]["GridCollection"]["Grids"]["20"]["Objects"].as_object_mut().unwrap().remove("4");assert!(!check(&a,&b));
        b=a.clone();b["World"]["GridCollection"]["Grids"]["10"]["Objects"]["9"]=json!({"ID":9});assert!(!check(&a,&b));
        b=a.clone();b["World"]["GridCollection"]["DiffGrids"]["10"]["RemovedObjects"]=json!([2]);assert!(!check(&a,&b));
        b=a.clone();b["World"]["GridCollection"]["Grids"]["10"]["GridDataPath"]="other".into();assert!(!check(&a,&b));
        b=a.clone();b["World"]["GridCollection"]["Grids"]["10"]["NextGridObjectID"]=99.into();assert!(check(&a,&b));
    }
    #[test]
    fn referenced_child_protects_all_support_ancestors_and_new_aliases(){
        let mut a=fixture();
        a["World"]["GridCollection"]["Grids"]["30"]=json!({"ID":30,"Objects":{"6":{"ID":6,"X":8,"State":{"SubGrid":{"GridID":10}}}}});
        a["World"]["GridCollection"]["Grids"]["40"]=json!({"ID":40,"Objects":{"7":{"ID":7,"X":5,"State":{"SubGrid":{"GridID":30}}},"8":{"ID":8,"X":1}}});
        let mut b=a.clone();
        b["World"]["GridCollection"]["Grids"]["40"]["Objects"]["7"]["X"]=4.into();assert!(!check(&a,&b));
        b=a.clone();b["World"]["GridCollection"]["Grids"]["30"]["Objects"]["6"]["Orientation"]="GridOrientation_Left".into();assert!(!check(&a,&b));
        b=a.clone();b["World"]["GridCollection"]["Grids"]["40"]["Objects"]["8"]["State"]=json!({"SubGrid":{"GridID":10}});assert!(!check(&a,&b));
        b=a.clone();b["World"]["GridCollection"]["Grids"]["30"]["Objects"].as_object_mut().unwrap().remove("6");assert!(!check(&a,&b));
        b=a.clone();b["World"]["GridCollection"]["Grids"]["40"]["Objects"]["8"]["X"]=4.into();assert!(check(&a,&b));
        b=a.clone();b["World"]["GridCollection"]["Grids"]["50"]=json!({"ID":50,"Objects":{"1":{"ID":1,"State":{"SubGrid":{"GridID":60}}}}});assert!(check(&a,&b));
    }
    #[test]
    fn protects_explicit_active_addresses_in_grid_zero_and_all_event_states(){
        let mut a=fixture();
        a["World"]["GridCollection"]["Grids"]["0"]=json!({"ID":0,"Objects":{"5":{"ID":5,"X":1},"6":{"ID":6,"X":2}}});
        a["ConditionalEventHistory"]["ActiveEvents"]["other"]=json!({"SpawnSnippetState":{"Address":{"GridID":0,"GridObjectID":5}}});
        let mut b=a.clone();
        b["World"]["GridCollection"]["Grids"]["0"]["Objects"]["5"]["X"]=9.into();
        assert!(!check(&a,&b));
        b=a.clone();
        b["World"]["GridCollection"]["Grids"]["0"]["Objects"]["6"]["X"]=9.into();
        assert!(check(&a,&b));
        a["World"]["QuestInfo"]["FutureReference"]=json!({"GridID":0,"GridObjectID":6});
        b=a.clone();
        b["World"]["GridCollection"]["Grids"]["0"]["Objects"]["6"]["X"]=9.into();
        assert!(!check(&a,&b));
    }
    #[test]
    fn referenced_default_diff_object_protects_complete_layout_identity(){
        let mut a=fixture();
        a["World"]["GridCollection"]["DiffGrids"]["10"]=json!({
            "ID":10,"GridDefaultLayoutPath":"SceneLayouts/Synthetic.json",
            "GridDefaultLayoutType":"Meta.GridCollection, Meta",
            "DefaultLayoutGridID":2,"DefaultGridHashCode":31,
            "DefaultGridDataHashCode":-12,"ModifiedObjects":{},"RemovedObjects":[],"NextGridObjectID":50
        });
        // Event refers to default object 9, which has no overlay record.
        for (key,value) in [
            ("ID",json!(11)),("GridDefaultLayoutPath",json!("SceneLayouts/Other.json")),
            ("GridDefaultLayoutType",json!("Different")),("DefaultLayoutGridID",json!(3)),
            ("DefaultGridHashCode",json!(32)),("DefaultGridDataHashCode",json!(-13))
        ]{
            let mut b=a.clone();
            b["World"]["GridCollection"]["DiffGrids"]["10"][key]=value;
            assert!(!check(&a,&b),"{key}");
        }
        let mut b=a.clone();
        b["World"]["GridCollection"]["DiffGrids"].as_object_mut().unwrap().remove("10");
        assert!(!check(&a,&b));
        b=a.clone();b["World"]["GridCollection"]["DiffGrids"]["10"]["ModifiedObjects"]["8"]=json!({"ID":8,"X":1});
        b["World"]["GridCollection"]["DiffGrids"]["10"]["NextGridObjectID"]=51.into();
        assert!(check(&a,&b));
    }
    #[test]
    fn absent_progress_fields_do_not_disable_editing(){
        let a=json!({"World":{},"Player":{"Stock":1}});let mut b=a.clone();
        b["Player"]["Stock"]=2.into();assert!(check(&a,&b));
        b["World"]["QuestInfo"]=json!({});assert!(!check(&a,&b));
    }
}
