//! Constructor for a separately authenticated native house graph.
//! The caller must authenticate the source and its item-to-layout binding.
//! No browser/export entry point is enabled here.
use super::{k,JsonLocator,QuantityTarget,Segment,PatchError,GridCoordinateDraft,
    PlainGridDestination,InitialBuildingState,preview_checked_building_initial,
    validate_json_without_edit,MAX_PROFILE_BYTES};
use super::support_clone::{checked_grid_allocator,grid_capacity,reserved_ref};
use serde_json::{Value,Map,json};
use std::collections::{HashMap,HashSet};

const BAD:PatchError=PatchError::InvalidTarget;
const DIRECTIONS:[&str;16]=[
    "GridOrientation_Up","GridOrientation_UpUpRight","GridOrientation_UpRight","GridOrientation_UpRightRight",
    "GridOrientation_Right","GridOrientation_DownRightRight","GridOrientation_DownRight","GridOrientation_DownDownRight",
    "GridOrientation_Down","GridOrientation_DownDownLeft","GridOrientation_DownLeft","GridOrientation_DownLeftLeft",
    "GridOrientation_Left","GridOrientation_UpLeftLeft","GridOrientation_UpLeft","GridOrientation_UpUpLeft"
];
fn id(v:&Value)->Result<u32,PatchError>{v.as_u64().and_then(|n|u32::try_from(n).ok()).ok_or(BAD)}
fn key_id(k:&str)->Result<u32,PatchError>{let n=k.parse::<u32>().map_err(|_|BAD)?;if n.to_string()!=k{return Err(BAD);}Ok(n)}
fn exact<'a>(v:&'a Value,keys:&[&str])->Result<&'a Map<String,Value>,PatchError>{
    v.as_object().filter(|m|m.len()==keys.len()&&keys.iter().all(|k|m.contains_key(*k))).ok_or(BAD)
}
fn path(v:&Value,prefix:&str)->bool{
    v.as_str().is_some_and(|s|s.starts_with(prefix)&&s.ends_with(".json")&&s.len()<256&&
        s.split('/').all(|p|!p.is_empty()&&p!="."&&p!=".."&&p.bytes().all(|b|b.is_ascii_alphanumeric()||matches!(b,b'_'|b'-'|b'.'))))
}
fn valid_layout(v:&Value)->bool{path(v,"SceneLayouts/Houses/PlayerHouse-")}
fn trim_id(v:&Value)->bool{id(v).is_ok_and(|n|n==0||matches!(n/100_000,1600|1601))}

pub struct HouseInteriorDraft{
    pub house:Value,
    pub grids:Map<String,Value>,
    pub next_grid_id:u32,
}
/// Remap the source-local room Grid IDs, including zero. Keep native object
/// identities and exact initial poses; no stock or ownership changes.
pub fn prepare_house_interior(template:&Value,item:u64,expected_layout:&str,next:u32)->Result<HouseInteriorDraft,PatchError>{
    let states=template["stateFields"].as_object().filter(|m|m.keys().all(|k|matches!(k.as_str(),"1"|"11"))).ok_or(BAD)?;
    let support_count=states.get("1").map(id).transpose()?.unwrap_or(0);
    let storage_count=states.get("11").map(id).transpose()?.unwrap_or(0);
    if item/100_000!=205||next==0||storage_count>1||
        template["stateFree"].as_bool()!=Some(support_count==0&&storage_count==0)||
        states.values().any(|v|id(v).is_err()||id(v)==Ok(0))||
        !valid_layout(&template["layoutPath"])||template["layoutPath"].as_str()!=Some(expected_layout){return Err(BAD);}
    let floors=template["floors"].as_array().filter(|a|a.len()==1).ok_or(BAD)?;
    let source=template["grids"].as_object().filter(|m|!m.is_empty()&&m.len()<=64).ok_or(BAD)?;
    let source_next=id(&template["sourceNextGridID"])?;
    let next_grid_id=next.checked_add(u32::try_from(source.len()).map_err(|_|BAD)?).ok_or(BAD)?;
    let mut source_ids=source.keys().map(|k|key_id(k)).collect::<Result<Vec<_>,_>>()?;
    source_ids.sort_unstable();
    if source_ids.iter().any(|n|*n>=source_next){return Err(BAD);}
    let remap:HashMap<u32,u32>=source_ids.iter().copied().enumerate().map(|(i,n)|(n,next+i as u32)).collect();
    let mut refs=HashSet::new();
    let mut new_floors=floors.clone();
    for floor in &mut new_floors{
        exact(floor,&["Rooms"])?;
        let rooms=floor["Rooms"].as_object_mut().filter(|m|!m.is_empty()&&m.len()<=4&&m.contains_key("0")).ok_or(BAD)?;
        for (slot,room) in rooms{
            if key_id(slot)?>3{return Err(BAD);}
            exact(room,&["Name","FloorGridID","WallGridIDs","RoomPrefabAddress","Flooring","Wallpapers","Ceiling"])?;
            if !room["Name"].as_str().is_some_and(|s|s.chars().count()<=128)||
                !room["RoomPrefabAddress"].as_str().is_some_and(|s|s.starts_with("guid:")&&s.len()<=128)||
                !trim_id(&room["Flooring"])||!trim_id(&room["Ceiling"]){return Err(BAD);}
            let wallpapers=room["Wallpapers"].as_object().filter(|m|m.len()==4).ok_or(BAD)?;
            for pos in 0..4{if !wallpapers.get(&pos.to_string()).is_some_and(trim_id){return Err(BAD);}}
            let old=id(&room["FloorGridID"])?;
            let mut map_ref=|old:u32,prefix:&str|->Result<u32,PatchError>{
                if !refs.insert(old)||!path(&source.get(&old.to_string()).ok_or(BAD)?["GridDataPath"],prefix){return Err(BAD);}
                remap.get(&old).copied().ok_or(BAD)
            };
            room["FloorGridID"]=json!(map_ref(old,"GridData/Rooms/Room")?);
            let walls=room["WallGridIDs"].as_object_mut().filter(|m|m.len()==4).ok_or(BAD)?;
            for pos in 0..4{
                let v=walls.get_mut(&pos.to_string()).ok_or(BAD)?;
                *v=json!(map_ref(id(v)?,"GridData/Rooms/Wall")?);
            }
        }
    }
    let roots=refs.clone();
    let mut edges=HashMap::<u32,Vec<u32>>::new();
    let mut counted=0u32;let mut stored=0u32;
    let mut grids=Map::new();let mut total=0usize;
    for old in source_ids{
        let mut grid=source[&old.to_string()].clone();
        exact(&grid,&["ID","GridDataPath","GridDefaultLayoutPath","TessellationFactor","Objects","NextGridObjectID"])?;
        if id(&grid["ID"])?!=old||grid["GridDefaultLayoutPath"].as_str()!=Some("")||
            if roots.contains(&old){id(&grid["TessellationFactor"])?!=1}else{!matches!(id(&grid["TessellationFactor"])?,1|2)||!path(&grid["GridDataPath"],"GridData/Furniture/")}{return Err(BAD);}
        let counter=id(&grid["NextGridObjectID"])?;
        let objects=grid["Objects"].as_object_mut().ok_or(BAD)?;
        total=total.checked_add(objects.len()).filter(|n|*n<=512).ok_or(BAD)?;
        for (key,obj) in objects{
            if obj.get("State").is_some(){exact(obj,&["ID","ItemID","X","Y","Orientation","State"])?;}else{exact(obj,&["ID","ItemID","X","Y","Orientation"])?;}
            let oid=key_id(key)?;
            if id(&obj["ID"])?!=oid||oid>=counter||!id(&obj["ItemID"]).is_ok_and(|n|n>0&&n<=i32::MAX as u32)||
                !["X","Y"].iter().all(|k|obj[*k].as_i64().is_some_and(|n|i32::try_from(n).is_ok()))||
                !obj["Orientation"].as_str().is_some_and(|s|DIRECTIONS.contains(&s)){return Err(BAD);}
            if let Some(state)=obj.get("State"){
                if let Some(storage)=state.get("Storage"){
                    exact(state,&["Storage"])?;
                    exact(storage,&["ContainerInventoryID","DefaultContainerInventoryData","UnlockKeyItemID","UnlockLocId","DesignID"])?;
                    if id(&obj["ItemID"])?!=40001680||storage["ContainerInventoryID"].as_u64()!=Some(0)||
                        storage["DefaultContainerInventoryData"].as_str()!=Some("Chest_48Slot")||
                        storage["UnlockKeyItemID"].as_u64()!=Some(0)||storage["UnlockLocId"].as_str()!=Some("")||!storage["DesignID"].is_null(){return Err(BAD);}
                    stored=stored.checked_add(1).ok_or(BAD)?;
                    continue;
                }
                let sub=&exact(state,&["SubGrid"])?["SubGrid"];
                exact(sub,&["GridID","DesignID"])?;
                if !sub["DesignID"].is_null()||id(&obj["ItemID"])?/100_000!=400{return Err(BAD);}
                let child=id(&sub["GridID"])?;
                if !refs.insert(child)||!path(&source.get(&child.to_string()).ok_or(BAD)?["GridDataPath"],"GridData/Furniture/"){return Err(BAD);}
                edges.entry(old).or_default().push(child);
                counted=counted.checked_add(1).ok_or(BAD)?;
                obj["State"]["SubGrid"]["GridID"]=json!(remap.get(&child).ok_or(BAD)?);
            }
        }
        let new=remap[&old];grid["ID"]=json!(new);
        grids.insert(new.to_string(),grid);
    }
    if refs.len()!=source.len()||counted!=support_count||stored!=storage_count{return Err(BAD);}
    // A disconnected cycle can have one incoming edge per grid and still
    // satisfy reference counts. Require every child to be reachable from a room.
    let mut pending:Vec<(u32,usize)>=roots.into_iter().map(|n|(n,0)).collect();
    let mut reachable=HashSet::new();
    while let Some((n,depth))=pending.pop(){
        if depth>8||!reachable.insert(n){return Err(BAD);}
        if let Some(children)=edges.get(&n){pending.extend(children.iter().map(|&c|(c,depth+1)));}
    }
    if reachable.len()!=source.len(){return Err(BAD);}
    Ok(HouseInteriorDraft{house:json!({"Floors":new_floors,"InitialRoomGridLayoutPath":expected_layout,"HouseItemID":item}),
        grids,next_grid_id})
}

fn existing_identity(v:&Value,item:u64,index:u64)->bool{
    match v{
        Value::Object(m)=>m.iter().any(|(k,v)|{
            (matches!(k.as_str(),"HouseItemID"|"ItemID")&&v.as_u64()==Some(item))||
            (k=="PlayerHouseIndex"&&v.as_u64()==Some(index))||existing_identity(v,item,index)
        }),
        Value::Array(a)=>a.iter().any(|v|existing_identity(v,item,index)),
        _=>false
    }
}
// Fresh storage allocation intentionally leaves detached/orphan contents untouched.
fn container_ref(v:&Value,fresh:u32,marked:bool)->bool{
    match v{
        Value::Object(m)=>m.iter().any(|(k,v)|{
            let key=k.to_ascii_lowercase();
            key!="nextcontainerinventoryid"&&container_ref(v,fresh,marked||key.contains("container")&&key.contains("id"))
        }),
        Value::Array(a)=>a.iter().any(|v|container_ref(v,fresh,marked)),
        _=>marked&&v.as_u64()==Some(u64::from(fresh))
    }
}
fn attach_initial_storage(root:&Value,new:&mut HouseInteriorDraft)->Result<Option<(u32,Value)>,PatchError>{
    let mut result=None;
    for grid in new.grids.values_mut(){
        let objects=grid["Objects"].as_object_mut().ok_or(BAD)?;
        for obj in objects.values_mut(){
            if obj["State"].get("Storage").is_none(){continue;}
            if result.is_some(){return Err(BAD);}
            let containers=root["Player"]["ContainerInventories"].as_object().filter(|m|!m.is_empty()&&m.len()<8192).ok_or(BAD)?;
            let fresh=id(&root["Player"]["NextContainerInventoryID"])?;
            if fresh<2||fresh==u32::MAX||containers.iter().any(|(k,v)|key_id(k).is_err()||key_id(k).is_ok_and(|n|n>=fresh||v["ID"].as_u64()!=Some(u64::from(n))))||container_ref(root,fresh,false){return Err(BAD);}
            let parent=id(&obj["ItemID"])?;
            if parent!=40001680||obj["State"]["Storage"]["ContainerInventoryID"].as_u64()!=Some(0){return Err(BAD);}
            // Steam 1.26.2 protoDb Chest_48Slot: field 2=48, field 4=true,
            // no materialized slots. Native Initialize assigns ID and parent.
            let row=json!({"ID":fresh,"Size":48,"Inventory":[],"BelongsToPlayer":true,"BlockMoveTo":false,"ParentItemID":parent,"ExtraSize":0});
            obj["State"]["Storage"]["ContainerInventoryID"]=json!(fresh);
            result=Some((fresh,row));
        }
    }
    Ok(result)
}
fn exterior_address(v:&Value,grid:u32,object:u32)->bool{
    match v{
        Value::Object(m)=>(m.get("GridID").and_then(Value::as_u64)==Some(u64::from(grid))&&
            m.get("GridObjectID").and_then(Value::as_u64)==Some(u64::from(object)))||
            m.values().any(|v|exterior_address(v,grid,object)),
        Value::Array(a)=>a.iter().any(|v|exterior_address(v,grid,object)),
        _=>false
    }
}
/// Build the private draft atomically; source graph must be authenticated by
/// a future codec caller before exposing this through the product.
pub fn preview_new_player_house(source:&str,template:&Value,expected_layout:&str,item:u64,d:&PlainGridDestination,
    xy:(i32,i32),orientation:&str)->Result<GridCoordinateDraft,PatchError>{
    validate_json_without_edit(source)?;
    let mut root:Value=serde_json::from_str(source).map_err(|_|BAD)?;
    if root["GameInfo"]["Version"].as_u64()!=Some(643){return Err(BAD);}
    let houses=root["World"]["PlayerHouses"].as_array().filter(|a|!a.is_empty()&&a.len()<128).ok_or(BAD)?;
    let index=houses.len();
    if existing_identity(&root,item,index as u64){return Err(BAD);}
    let c=root["World"]["GridCollection"].as_object().ok_or(BAD)?;
    let next=checked_grid_allocator(c)?;
    let old_grids=c["Grids"].as_object().ok_or(BAD)?;
    let diffs=c.get("DiffGrids").map(|v|v.as_object().ok_or(BAD)).transpose()?;
    let target=old_grids.get(&d.grid_id).ok_or(BAD)?;
    let target_next=id(&target["NextGridObjectID"])?;
    if target_next==0||exterior_address(&root,key_id(&d.grid_id)?,target_next){return Err(BAD);}
    let mut new=prepare_house_interior(template,item,expected_layout,next)?;
    let reserved:HashSet<u32>=(next..new.next_grid_id).collect();
    if !grid_capacity(old_grids,diffs,new.grids.len())||reserved_ref(&root,&reserved,false){return Err(BAD);}
    let storage=attach_initial_storage(&root,&mut new)?;
    let grid_members=new.grids.iter().map(|(key,g)|Ok(format!(",\"{}\":{}",key,serde_json::to_string(g).map_err(|_|BAD)?))).collect::<Result<Vec<_>,PatchError>>()?.join("");
    let house_member=format!(",{}",serde_json::to_string(&new.house).map_err(|_|BAD)?);
    let mut locator=JsonLocator::new(source,QuantityTarget::Inventory{inventory_id:"1".into(),item_id:"1".into()})?;
    locator.amount_path=vec![Segment::Index(usize::MAX)];
    let gp=vec![k("World"),k("GridCollection"),k("Grids")];
    let cp=vec![k("World"),k("GridCollection"),k("NextGridID")];
    let hp=vec![k("World"),k("PlayerHouses")];
    let ip=vec![k("Player"),k("ContainerInventories")];
    let ic=vec![k("Player"),k("NextContainerInventoryID")];
    for p in [&gp,&cp,&hp]{locator.capture.insert(p.clone(),None);}
    if storage.is_some(){for p in [&ip,&ic]{locator.capture.insert(p.clone(),None);}}
    locator.walk_complete()?;
    let span=|p:&Vec<Segment>|locator.capture.get(p).and_then(|v|v.clone()).ok_or(BAD);
    let gr=span(&gp)?;let cr=span(&cp)?;let hr=span(&hp)?;
    if source[cr.clone()].parse::<u32>().ok()!=Some(next){return Err(BAD);}
    let mut patches=vec![(gr.end-1..gr.end-1,grid_members),(cr,new.next_grid_id.to_string()),(hr.end-1..hr.end-1,house_member)];
    if let Some((fresh,row))=&storage{
        let mr=span(&ip)?;let counter=span(&ic)?;
        if source[counter.clone()].parse::<u32>().ok()!=Some(*fresh){return Err(BAD);}
        patches.push((mr.end-1..mr.end-1,format!(",\"{}\":{}",fresh,row)));
        patches.push((counter,(fresh+1).to_string()));
    }
    patches.sort_unstable_by_key(|(r,_)|r.start);
    let mut intermediate=String::new();let mut last=0;
    for (r,v) in patches{if r.start<last{return Err(BAD);}intermediate.push_str(&source[last..r.start]);intermediate.push_str(&v);last=r.end;}
    intermediate.push_str(&source[last..]);
    if intermediate.len()>MAX_PROFILE_BYTES{return Err(BAD);}
    root["World"]["GridCollection"]["Grids"].as_object_mut().ok_or(BAD)?.extend(new.grids);
    root["World"]["GridCollection"]["NextGridID"]=json!(new.next_grid_id);
    root["World"]["PlayerHouses"].as_array_mut().ok_or(BAD)?.push(new.house);
    if let Some((fresh,row))=storage{
        root["Player"]["ContainerInventories"].as_object_mut().ok_or(BAD)?.insert(fresh.to_string(),row);
        root["Player"]["NextContainerInventoryID"]=json!(fresh+1);
    }
    if serde_json::from_str::<Value>(&intermediate).map_err(|_|BAD)?!=root{return Err(BAD);}
    preview_checked_building_initial(&intermediate,d,item,xy,orientation,InitialBuildingState::ExistingPlayerHouse{index})
}

#[cfg(test)]
mod tests{
    use super::*;
    const LAYOUT:&str="SceneLayouts/Houses/PlayerHouse-Synthetic_DefaultLayout.json";
    fn template()->Value{
        let mut grids=Map::new();
        for n in 0..5{
            grids.insert(n.to_string(),json!({"ID":n,"GridDataPath":if n==0{"GridData/Rooms/Room8x8-GridData.json"}else{"GridData/Rooms/Wall8x9-GridData.json"},"GridDefaultLayoutPath":"","TessellationFactor":1,
                "Objects":if n==0{json!({"0":{"ID":0,"ItemID":40300001,"X":0,"Y":1,"Orientation":"GridOrientation_Down"}})}else{json!({})},"NextGridObjectID":if n==0{1}else{0}}));
        }
        json!({"layoutPath":LAYOUT,"stateFree":true,"stateFields":{},"sourceNextGridID":5,"grids":grids,
            "floors":[{"Rooms":{"0":{"Name":"","FloorGridID":0,"WallGridIDs":{"0":1,"1":2,"2":3,"3":4},"RoomPrefabAddress":"guid:synthetic","Flooring":160100001,"Wallpapers":{"0":160000001,"1":160000001,"2":160000001,"3":160000001},"Ceiling":160100002}}}]})
    }
    #[test]
    fn remap_preserves_source_zero_object_and_finishes(){
        let t=template();let d=prepare_house_interior(&t,20500002,LAYOUT,90).unwrap();
        assert_eq!(d.next_grid_id,95);assert_eq!(d.house["Floors"][0]["Rooms"]["0"]["FloorGridID"],90);
        assert_eq!(d.house["Floors"][0]["Rooms"]["0"]["WallGridIDs"],json!({"0":91,"1":92,"2":93,"3":94}));
        assert_eq!(d.grids["90"]["Objects"],t["grids"]["0"]["Objects"]);
        assert_eq!(d.grids["91"]["NextGridObjectID"],0);
        assert_eq!(d.house["Floors"][0]["Rooms"]["0"]["Flooring"],160100001);
    }
    #[test]
    fn source_support_graph_remaps_child_and_rejects_invalid_closure(){
        let mut t=template();
        t["stateFree"]=json!(false);t["stateFields"]=json!({"1":1});t["sourceNextGridID"]=json!(6);
        t["grids"]["0"]["Objects"]["0"]["ItemID"]=json!(40000001);
        t["grids"]["0"]["Objects"]["0"]["State"]=json!({"SubGrid":{"GridID":5,"DesignID":null}});
        t["grids"]["5"]=json!({"ID":5,"GridDataPath":"GridData/Furniture/Synthetic-GridData.json","GridDefaultLayoutPath":"","TessellationFactor":1,"Objects":{},"NextGridObjectID":0});
        let d=prepare_house_interior(&t,20500002,LAYOUT,90).unwrap();
        assert_eq!(d.next_grid_id,96);
        assert_eq!(d.grids["90"]["Objects"]["0"]["State"]["SubGrid"]["GridID"],95);
        assert_eq!(d.grids["95"]["NextGridObjectID"],0);
        let mut bad=t.clone();bad["grids"]["0"]["Objects"]["0"]["State"]["SubGrid"]["GridID"]=json!(1);
        assert!(prepare_house_interior(&bad,20500002,LAYOUT,90).is_err());
        let mut bad=t.clone();bad["stateFields"]=json!({"1":2});
        assert!(prepare_house_interior(&bad,20500002,LAYOUT,90).is_err());
        let mut bad=t.clone();bad["grids"]["0"]["Objects"]["0"]["State"]["SubGrid"]["DesignID"]=json!(12);
        assert!(prepare_house_interior(&bad,20500002,LAYOUT,90).is_err());
        let mut bad=t.clone();bad["grids"]["0"]["Objects"]["0"].as_object_mut().unwrap().remove("State");
        bad["grids"]["5"]["Objects"]=json!({"0":{"ID":0,"ItemID":40000001,"X":0,"Y":0,"Orientation":"GridOrientation_Down","State":{"SubGrid":{"GridID":5,"DesignID":null}}}});
        bad["grids"]["5"]["NextGridObjectID"]=json!(1);
        assert!(prepare_house_interior(&bad,20500002,LAYOUT,90).is_err());
    }
    #[test]
    fn initial_storage_is_independent_and_preserves_existing_contents(){
        let mut t=template();t["stateFree"]=json!(false);t["stateFields"]=json!({"11":1});
        t["grids"]["0"]["Objects"]["0"]["ItemID"]=json!(40001680);
        t["grids"]["0"]["Objects"]["0"]["State"]=json!({"Storage":{"ContainerInventoryID":0,"DefaultContainerInventoryData":"Chest_48Slot","UnlockKeyItemID":0,"UnlockLocId":"","DesignID":null}});
        let raw=json!({"GameInfo":{"Version":643},"Player":{"NextContainerInventoryID":3,"ContainerInventories":{"2":{"ID":2,"ParentItemID":40001680,"Size":48,"BelongsToPlayer":true,"Inventory":[{"ItemID":30000001,"Amount":17,"State":null}]}}},"World":{"PlayerHouses":[{"HouseItemID":20500001,"Floors":[{}]}],"GridCollection":{"NextGridID":90,"Grids":{"10":{"ID":10,"GridDefaultLayoutPath":"SceneLayouts/Village04/DefaultVillageLayout01-BeachGrids.json","GridDataPath":"GridData/Villages/Village04-BeachLevel-GridData.json","TessellationFactor":1,"NextGridObjectID":7,"Objects":{}}}}}});
        let d=PlainGridDestination{grid_id:"10".into(),layout_path:"SceneLayouts/Village04/DefaultVillageLayout01-BeachGrids.json".into(),data_path:"GridData/Villages/Village04-BeachLevel-GridData.json".into(),tessellation:1,size:(100,100)};
        let p=preview_new_player_house(&raw.to_string(),&t,LAYOUT,20500002,&d,(3,4),"GridOrientation_Down").unwrap();
        let v:Value=serde_json::from_str(&p.patched_json).unwrap();
        assert_eq!(v["Player"]["ContainerInventories"]["2"],raw["Player"]["ContainerInventories"]["2"]);
        assert_eq!(v["Player"]["ContainerInventories"]["3"]["Size"],48);
        assert_eq!(v["Player"]["ContainerInventories"]["3"]["Inventory"],json!([]));
        assert_eq!(v["Player"]["NextContainerInventoryID"],4);
        assert_eq!(v["World"]["GridCollection"]["Grids"]["90"]["Objects"]["0"]["State"]["Storage"]["ContainerInventoryID"],3);
        let mut bad=raw.clone();bad["World"]["Unknown"]=json!({"ContainerInventoryID":3});
        assert!(preview_new_player_house(&bad.to_string(),&t,LAYOUT,20500002,&d,(3,4),"GridOrientation_Down").is_err());
        t["grids"]["0"]["Objects"]["0"]["State"]["Storage"]["DefaultContainerInventoryData"]=json!("Unknown");
        assert!(prepare_house_interior(&t,20500002,LAYOUT,90).is_err());
    }
    #[test]
    fn invalid_source_graph_is_rejected(){
        let mut t=template();t["floors"][0]["Rooms"]["0"]["WallGridIDs"]["0"]=0.into();
        assert!(prepare_house_interior(&t,20500002,LAYOUT,90).is_err());
        let mut t=template();t["grids"]["0"]["Objects"]["0"]["State"]=json!({"SubGrid":{"GridID":1}});
        assert!(prepare_house_interior(&t,20500002,LAYOUT,90).is_err());
        assert!(prepare_house_interior(&template(),20500002,LAYOUT,u32::MAX-2).is_err());
        assert!(prepare_house_interior(&template(),20500002,"wrong",90).is_err());
    }
    #[test]
    fn atomic_private_draft_preserves_untouched_lexical_bytes(){
        let raw=r#"{"GameInfo":{"Version":643},"Player":{"Keep":1e2},"World":{"PlayerHouses":[{"HouseItemID":20500001,"Floors":[{}]}],"GridCollection":{"NextGridID":90,"Grids":{"10":{"ID":10,"GridDefaultLayoutPath":"SceneLayouts/Village04/DefaultVillageLayout01-BeachGrids.json","GridDataPath":"GridData/Villages/Village04-BeachLevel-GridData.json","TessellationFactor":1,"NextGridObjectID":7,"Objects":{}}}}}}"#;
        let d=PlainGridDestination{grid_id:"10".into(),layout_path:"SceneLayouts/Village04/DefaultVillageLayout01-BeachGrids.json".into(),data_path:"GridData/Villages/Village04-BeachLevel-GridData.json".into(),tessellation:1,size:(100,100)};
        let p=preview_new_player_house(raw,&template(),LAYOUT,20500002,&d,(3,4),"GridOrientation_Down").unwrap();
        let v:Value=serde_json::from_str(&p.patched_json).unwrap();
        assert_eq!(v["World"]["PlayerHouses"][1]["HouseItemID"],20500002);
        assert_eq!(v["World"]["GridCollection"]["Grids"]["10"]["Objects"]["7"]["State"]["HouseData"]["PlayerHouseIndex"],1);
        assert_eq!(v["World"]["GridCollection"]["NextGridID"],95);
        assert_eq!(v["World"]["GridCollection"]["Grids"]["90"]["Objects"]["0"]["ID"],0);
        assert!(p.patched_json.contains("\"Keep\":1e2"));assert!(!p.export_authorized);
        assert!(preview_new_player_house(&p.patched_json,&template(),LAYOUT,20500002,&d,(3,4),"GridOrientation_Down").is_err());
        let bad=raw.replace("\"Keep\":1e2","\"Keep\":1e2,\"GridID\":90");
        assert!(preview_new_player_house(&bad,&template(),LAYOUT,20500002,&d,(3,4),"GridOrientation_Down").is_err());
    }
}
