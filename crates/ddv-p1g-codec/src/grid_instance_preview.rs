//! DB-05: local, read-only per-instance GridObject projection.
//! Uses only fields verified in the Steam v1.26.1/1.26.2 protobuf schema.
//! Do not include Save grid IDs, object IDs, source paths or custom states
//! in the receipt. This is not an editor target/placement authority.
use super::CodecError;
use ddv_save_patch::{GridCoordinateTarget,GridObjectKind};
use serde_json::{Value,Map};
use std::collections::{HashMap,HashSet};

const MAX_GRIDS:usize=8192;
const MAX_SCANNED_OBJECTS:usize=100_000;
const MAX_ROWS:usize=20_000;
const MAX_REMOVALS:usize=100_000;

#[derive(Default)]
struct Scan {
    full:usize,
    diff:usize,
    scanned:usize,
    invalid:usize,
    not_item:usize,
    missing_coords:usize,
    removal_markers:usize,
    sampled:bool,
    rows:Vec<Value>,
    private_targets:Vec<(GridCoordinateTarget,Option<(i32,i32)>)>,
    subgrid_parents:HashSet<usize>,
}

fn key_id(key:&str)->Option<u64>{
    let id=key.parse::<u64>().ok()?;
    (id.to_string()==key).then_some(id)
}
fn valid_grid<'a>(key:&str,value:&'a Value)->Option<&'a Map<String,Value>>{
    let id=key_id(key)?;
    let grid=value.as_object()?;
    if grid.get("ID").is_some_and(|v|v.as_u64()!=Some(id)){
        return None;
    }
    Some(grid)
}
fn observed_coordinates(object:&Map<String,Value>)->Option<(i32,i32)>{
    let x=object.get("X")?.as_i64()?;
    let y=object.get("Y")?.as_i64()?;
    Some((i32::try_from(x).ok()?,i32::try_from(y).ok()?))
}
fn observed_orientation(object:&Map<String,Value>)->Option<&str>{
    let value=object.get("Orientation")?.as_str()?;
    if (1..=32).contains(&value.len()) &&
       value.bytes().enumerate().all(|(i,b)|
         if i==0{b.is_ascii_alphabetic()}else{
           b.is_ascii_alphanumeric()||b==b'_'
         }){
        Some(value)
    }else{None}
}
fn project_objects(
    source:&Map<String,Value>,grid_id:&str,modified:bool,
    local_grid_ordinal:usize,removed:&HashSet<u64>,scan:&mut Scan
){
    for (key,value) in source{
        if scan.scanned==MAX_SCANNED_OBJECTS||scan.rows.len()==MAX_ROWS{
            scan.sampled=true;break;
        }
        scan.scanned+=1;
        let Some(id)=key_id(key) else {
            scan.invalid+=1;continue;
        };
        if modified&&removed.contains(&id){continue;}
        let Some(obj)=value.as_object() else {
            scan.invalid+=1;continue;
        };
        if obj.get("ID").is_some_and(|v|v.as_u64()!=Some(id)){
            scan.invalid+=1;continue;
        }
        let Some(item_id)=obj.get("ItemID").and_then(Value::as_u64)
            .filter(|v|*v>0) else {
            scan.not_item+=1;continue;
        };
        let xy=observed_coordinates(obj);
        if xy.is_none(){scan.missing_coords+=1;}
        // Index is per-open-document only, not a stable instance identifier,
        // writer handle, real grid key or gameplay object ID.
        let ordinal=scan.rows.len()+1;
        if obj.get("State").and_then(|s|s.get("SubGrid")).is_some(){
            scan.subgrid_parents.insert(ordinal);
        }
        scan.private_targets.push((GridCoordinateTarget{
            kind:if modified{GridObjectKind::DiffModified}else{GridObjectKind::Full},
            grid_id:grid_id.to_owned(),object_id:key.to_owned(),item_id
        },xy));
        scan.rows.push(serde_json::json!({
            "localOrdinal":ordinal,
            "localGridOrdinal":local_grid_ordinal,
            "itemId":item_id.to_string(),
            "recordKind":if modified{"diff_modified"}else{"full"},
            "x":xy.map(|(x,_)|x),
            "y":xy.map(|(_,y)|y),
            "orientation":observed_orientation(obj),
            "coordinatesObserved":xy.is_some()
        }));
    }
}

/// Scan the *current local* Save profile only. Its original bytes and
/// all IDs/unknown object state stay in Rust Worker; only an explicit
/// user-requested browser UI preview receives projected coordinates.
fn scan_grid_instances(source:&[u8])->Result<(Scan,&'static str),CodecError>{
    let root:Value=serde_json::from_slice(source).map_err(|_|CodecError::Json)?;
    let world=root.get("World").and_then(Value::as_object)
        .ok_or(CodecError::RequiredRoot)?;
    let grid_collection=world.get("GridCollection");
    let mut scan=Scan::default();
    let status=match grid_collection{
        None=>"not_observed",
        Some(value) if !value.is_object()=>"incompatible_structure",
        Some(value)=>{
            let collection=value.as_object().ok_or(CodecError::Json)?;
            let full=collection.get("Grids").and_then(Value::as_object);
            let diff=collection.get("DiffGrids").and_then(Value::as_object);
            if collection.get("Grids").is_some()&&full.is_none(){
                scan.invalid+=1;
            }
            if collection.get("DiffGrids").is_some()&&diff.is_none(){
                scan.invalid+=1;
            }
            let mut visited=0usize;
            if let Some(grids)=full{
                for (key,value) in grids{
                    if visited>=MAX_GRIDS||scan.sampled{
                        scan.sampled=true;break;
                    }
                    visited+=1;
                    let Some(grid)=valid_grid(key,value) else {
                        scan.invalid+=1;continue;
                    };
                    let empty=Map::new();
                    let Some(objects)=grid.get("Objects")
                        .map_or(Some(&empty),Value::as_object) else {
                        scan.invalid+=1;continue;
                    };
                    scan.full+=1;
                    project_objects(objects,key,false,scan.full+scan.diff,
                        &HashSet::new(),&mut scan);
                }
            }
            if let Some(grids)=diff{
                for (key,value) in grids{
                    if visited>=MAX_GRIDS||scan.sampled{
                        scan.sampled=true;break;
                    }
                    visited+=1;
                    if full.is_some_and(|f|f.contains_key(key)){
                        scan.invalid+=1;continue;
                    }
                    let Some(grid)=valid_grid(key,value) else {
                        scan.invalid+=1;continue;
                    };
                    let empty=Map::new();
                    let Some(objects)=grid.get("ModifiedObjects")
                        .map_or(Some(&empty),Value::as_object) else {
                        scan.invalid+=1;continue;
                    };
                    let mut removed=HashSet::new();
                    if let Some(r)=grid.get("RemovedObjects"){
                        let Some(list)=r.as_array() else {
                            scan.invalid+=1;continue;
                        };
                        if list.len()>MAX_REMOVALS||list.iter().any(|v|
                            v.as_u64().is_none()){
                            scan.invalid+=1;continue;
                        }
                        for id in list.iter().filter_map(Value::as_u64){
                            removed.insert(id);
                        }
                    }
                    if scan.removal_markers+removed.len()>MAX_REMOVALS{
                        scan.sampled=true;break;
                    }
                    scan.removal_markers+=removed.len();
                    scan.diff+=1;
                    project_objects(objects,key,true,scan.full+scan.diff,
                        &removed,&mut scan);
                }
            }
            if scan.sampled||scan.invalid>0{
                "partial_inconclusive"
            }else if scan.rows.is_empty(){
                "observed_no_item_refs"
            }else{
                "saved_object_instances"
            }
        }
    };
    Ok((scan,status))
}

/// DB-04 Owner contract: two roads (GroundAlteration) or two fences
/// cannot share an identical anchor in one Grid. This is NOT a general
/// placement/collision check. Source enum identities and decimal ItemID
/// fields come from DB-01's Steam 1.26.2 native classification.
/// Only check coordinates of changed targets, with the final batch
/// positions applied together (a swap must not fail transiently).
fn exclusive_anchor_class(item_id:u64)->Option<u64>{
    if item_id/10_000_000!=4{return None;}
    match (item_id%10_000_000)/100_000{
        1=>Some(1),7=>Some(7),_=>None
    }
}
pub(super) fn validate_exclusive_grid_moves(
    profile:&[u8],moves:&[(&GridCoordinateTarget,(i32,i32))]
)->Result<(),CodecError>{
    // Typed building transforms retain identity, but never accept an
    // anchor outside the original source Grid from an untrusted plan.
    if moves.iter().any(|(target,_)|target.item_id/10_000_000==2){
        let root:Value=serde_json::from_slice(profile).map_err(|_|CodecError::Json)?;
        for (target,(x,y)) in moves{
            if target.item_id/10_000_000!=2{continue;}
            let grid=root["World"]["GridCollection"]["Grids"].get(&target.grid_id).ok_or(CodecError::Json)?;
            let obj=grid["Objects"].get(&target.object_id).ok_or(CodecError::Json)?;
            if obj.get("State").is_some_and(|v|!v.is_null()&&!v.as_object().is_some_and(|m|m.is_empty())){
                let (sx,sy)=building_transform_grid_size(&root,&target.grid_id)?;
                if *x<0||*y<0||*x as u64>=sx||*y as u64>=sy{return Err(CodecError::Bounds);}
            }
        }
    }
    let exclusive=moves.iter().filter_map(|(target,xy)|
        exclusive_anchor_class(target.item_id).map(|class|(*target,*xy,class))
    ).collect::<Vec<_>>();
    if exclusive.is_empty(){return Ok(());}
    // DiffGrids can have unseen original defaults.
    if exclusive.iter().any(|(target,_,_)|target.kind!=GridObjectKind::Full){
        return Err(CodecError::Json);
    }
    let (scan,_)=scan_grid_instances(profile)?;
    if scan.sampled||scan.invalid>0{return Err(CodecError::Json);}
    // Only affected Grid/class pairs and destinations are tracked. Unrelated
    // preexisting duplicates do not block ordinary edits or other grids.
    let mut changed=HashMap::with_capacity(exclusive.len());
    let mut scopes=HashSet::new();
    let mut destinations=HashMap::with_capacity(exclusive.len());
    for (target,xy,class) in exclusive{
        let scope=(target.kind,target.grid_id.as_str(),class);
        scopes.insert(scope);
        if changed.insert((target.kind,target.grid_id.as_str(),target.object_id.as_str()),xy).is_some()||
            destinations.insert((scope,xy),0usize).is_some(){
            return Err(CodecError::Json);
        }
    }
    // One pass across all saved instances, rather than per-target scans.
    for (other,original) in &scan.private_targets{
        let Some(class)=exclusive_anchor_class(other.item_id) else{continue;};
        let scope=(other.kind,other.grid_id.as_str(),class);
        if !scopes.contains(&scope){continue;}
        let final_xy=changed.get(&(other.kind,other.grid_id.as_str(),other.object_id.as_str()))
            .copied().or(*original).ok_or(CodecError::Json)?;
        if let Some(count)=destinations.get_mut(&(scope,final_xy)){
            *count+=1;
            if *count>1{return Err(CodecError::Json);}
        }
    }
    if destinations.values().any(|count|*count!=1){return Err(CodecError::Json);}

    Ok(())
}

pub(super) fn resolve_grid_coordinate_target(
    profile:&[u8],ordinal:usize,expected_item:u64,
    expected:(i32,i32),record_kind:&str
)->Result<GridCoordinateTarget,CodecError>{
    if ordinal==0||ordinal>MAX_ROWS||expected_item==0{
        return Err(CodecError::Bounds);
    }
    let (scan,_status)=scan_grid_instances(profile)?;
    if scan.sampled||scan.invalid>0{
        return Err(CodecError::Json);
    }
    let (target,observed)=scan.private_targets.get(ordinal-1)
        .ok_or(CodecError::Json)?;
    let kind=match target.kind{
        GridObjectKind::Full=>"full",
        GridObjectKind::DiffModified=>"diff_modified"
    };
    if target.item_id!=expected_item||
       observed!=&Some(expected)||kind!=record_kind{
        return Err(CodecError::Json);
    }
    Ok(target.clone())
}

/// Resolve up to sixteen UI-local ordinals in ONE scan. Real grid/object
/// IDs remain private inside WASM, even for a batch. Duplicate or stale
/// ordinals reject the entire edit; partial scans cannot authorize editing.
pub(super) fn resolve_grid_coordinate_targets(
    profile:&[u8],selections:&[(usize,u64,(i32,i32),String)]
)->Result<Vec<GridCoordinateTarget>,CodecError>{
    if selections.is_empty()||selections.len()>16{
        return Err(CodecError::Bounds);
    }
    let (scan,_status)=scan_grid_instances(profile)?;
    if scan.sampled||scan.invalid>0{
        return Err(CodecError::Json);
    }
    let mut chosen=HashSet::new();
    let mut targets=Vec::with_capacity(selections.len());
    for (ordinal,item,expected,kind) in selections{
        if *ordinal==0||*ordinal>MAX_ROWS||*item==0||
           !chosen.insert(*ordinal){
            return Err(CodecError::Json);
        }
        let (target,xy)=scan.private_targets.get(ordinal-1)
            .ok_or(CodecError::Json)?;
        let saved_kind=match target.kind{
            GridObjectKind::Full=>"full",
            GridObjectKind::DiffModified=>"diff_modified"
        };
        if target.item_id!=*item||xy!=&Some(*expected)||kind!=saved_kind{
            return Err(CodecError::Json);
        }
        targets.push(target.clone());
    }
    Ok(targets)
}

/// Resolve a bounded mixed Grid batch against the same immutable opened Save
/// with ONE native GridObject scan. Private native map IDs stay in WASM.
pub(super) fn resolve_grid_mixed_targets(
    profile:&[u8],
    selections:&[(usize,u64,(i32,i32),String,Option<String>)]
)->Result<Vec<GridCoordinateTarget>,CodecError>{
    resolve_grid_mixed_targets_mode(profile,selections,false)
}
/// Identity-preserving transforms may retain an owned support tree.
/// Stock/structure operations still require their own mutation contract.
pub(super) fn resolve_grid_transform_targets(
    profile:&[u8],
    selections:&[(usize,u64,(i32,i32),String,Option<String>)]
)->Result<Vec<GridCoordinateTarget>,CodecError>{
    resolve_grid_mixed_targets_mode(profile,selections,true)
}
fn resolve_grid_mixed_targets_mode(
    profile:&[u8],
    selections:&[(usize,u64,(i32,i32),String,Option<String>)],
    retain_owned_tree:bool
)->Result<Vec<GridCoordinateTarget>,CodecError>{
    if selections.is_empty()||selections.len()>ddv_save_patch::MAX_GRID_MIXED_EDITS{
        return Err(CodecError::Bounds);
    }
    let (scan,_status)=scan_grid_instances(profile)?;
    if scan.sampled||scan.invalid>0{
        return Err(CodecError::Json);
    }
    let mut seen=HashSet::new();
    let mut out=Vec::with_capacity(selections.len());
    for (ordinal,item,expected,kind,orientation) in selections{
        if *ordinal==0||*ordinal>MAX_ROWS||*item==0||
           !seen.insert(*ordinal){
            return Err(CodecError::Json);
        }
        let (target,xy)=scan.private_targets.get(ordinal-1)
            .ok_or(CodecError::Json)?;
        let observed_kind=match target.kind{
            GridObjectKind::Full=>"full",
            GridObjectKind::DiffModified=>"diff_modified"
        };
        let observed_orientation=scan.rows.get(ordinal-1)
            .and_then(|row|row.get("orientation")).and_then(Value::as_str);
        if target.item_id!=*item||xy!=&Some(*expected)||
           kind!=observed_kind||
           orientation.as_ref().is_some_and(|o|Some(o.as_str())!=observed_orientation){
            return Err(CodecError::Json);
        }
        if scan.subgrid_parents.contains(ordinal){
            if !retain_owned_tree{return Err(CodecError::Json);}
            validate_owned_transform_root(profile,target)?;
        }else if target.item_id/10_000_000==2{
            validate_building_transform(profile,target)?;
        }
        out.push(target.clone());
    }
    Ok(out)
}

/// Resolve the original outdoor Grid from the current source catalog.
// Full schema-643 grids can store an empty default layout path. Recover
// only a unique original outdoor catalog row from the literal data path.
fn outdoor_catalog_identity(grid:&Value)->Result<(String,String,u64,u64,u64),CodecError>{
    let bad=CodecError::Json;
    let layout=grid["GridDefaultLayoutPath"].as_str().ok_or(bad)?;
    let data=grid["GridDataPath"].as_str().ok_or(bad)?;
    let factor=grid.get("TessellationFactor").map_or(Some(1),Value::as_u64).filter(|n|matches!(n,1|2)).ok_or(bad)?;
    if !data.starts_with("GridData/Villages/")&&!data.starts_with("GridData/FloatingIslands/"){return Err(bad);}
    static CATALOG:std::sync::OnceLock<Value>=std::sync::OnceLock::new();
    let catalog=CATALOG.get_or_init(||serde_json::from_str(include_str!("../../../static/ddv/world/steam-1.26.2/index.json")).unwrap_or(Value::Null));
    let mut found=None;
    for e in catalog["entries"].as_array().ok_or(bad)?{
        let scope=e["scope"].as_str().ok_or(bad)?;
        if !matches!(scope,"Village04"|"VillageExpansion01"|"VillageExpansion02"|"VillageExpansion03"|"VillageExpansion04"|"VillageWinnieDLC"|"FloatingIslands"){continue;}
        for g in e["grids"].as_array().ok_or(bad)?{
            if g["gridDataPath"].as_str()!=Some(data){continue;}
            let native_layout=g["layoutId"].as_str().ok_or(bad)?;
            // The authoring template is not evidence of a playable saved island.
            if layout.is_empty()&&native_layout.starts_with("SceneLayouts/FloatingIslands/FloatingIsland_TEMPLATE/"){continue;}
            if !layout.is_empty()&&layout!=native_layout{continue;}
            if g["factor"].as_u64()!=Some(factor){continue;}
            let sx=g["sizeX"].as_u64().filter(|n|*n>0&&*n<=65536).ok_or(bad)?;
            let sy=g["sizeY"].as_u64().filter(|n|*n>0&&*n<=65536).ok_or(bad)?;
            if found.is_some(){return Err(bad);}
            found=Some((scope.to_owned(),native_layout.to_owned(),factor,sx,sy));
        }
    }
    found.ok_or(bad)
}
fn outdoor_identity(root:&Value,gid:&str)->Result<(String,String,u64,u64,u64),CodecError>{
    let bad=CodecError::Json;
    let c=&root["World"]["GridCollection"];
    let grids=c["Grids"].as_object().ok_or(bad)?;
    let grid=grids.get(gid).ok_or(bad)?;
    let data=grid["GridDataPath"].as_str().ok_or(bad)?;
    if grids.values().filter(|g|g["GridDataPath"].as_str()==Some(data)).count()!=1||
       grid["ID"].as_u64()!=key_id(gid)||
       c.get("DiffGrids").is_some_and(|v|v.as_object().is_none_or(|m|m.contains_key(gid))){return Err(bad);}
    outdoor_catalog_identity(grid)
}
pub(super) fn building_transform_grid_size(root:&Value,gid:&str)->Result<(u64,u64),CodecError>{
    let (_,_,factor,sx,sy)=outdoor_identity(root,gid)?;
    Ok((sx*factor,sy*factor))
}

/// Common coordinate transform guard for an existing owned stateful root.
/// Category does not determine the State discriminant; only a resolved
/// native root with a known state envelope and valid ownership can pass.
fn validate_owned_transform_root(profile:&[u8],target:&GridCoordinateTarget)->Result<(),CodecError>{
    let bad=CodecError::Json;
    let root:Value=serde_json::from_slice(profile).map_err(|_|bad)?;
    if root["GameInfo"]["Version"].as_u64()!=Some(643)||target.kind!=GridObjectKind::Full{return Err(bad);}
    let collection=root["World"]["GridCollection"].as_object().ok_or(bad)?;
    let grids=collection.get("Grids").and_then(Value::as_object).ok_or(bad)?;
    let obj=grids.get(&target.grid_id).and_then(|g|g.get("Objects")).and_then(|o|o.get(&target.object_id)).and_then(Value::as_object).ok_or(bad)?;
    if obj.get("ID").and_then(Value::as_u64).filter(|n|*n>0)!=key_id(&target.object_id)||
       obj.get("ItemID").and_then(Value::as_u64)!=Some(target.item_id)||
       obj.keys().any(|k|!matches!(k.as_str(),"ID"|"ItemID"|"X"|"Y"|"Orientation"|"State"))||
       !obj.get("Orientation").and_then(Value::as_str).is_some_and(|s|ddv_save_patch::OBSERVED_CARDINAL_ORIENTATIONS.contains(&s)){return Err(bad);}
    let (_,_,factor,sx,sy)=house_exterior_identity(&root,&target.grid_id)?;
    let (x,y)=observed_coordinates(obj).ok_or(bad)?;
    if x<0||y<0||x as u64>=sx*factor||y as u64>=sy*factor{return Err(bad);}
    let state=obj.get("State").and_then(Value::as_object).filter(|s|s.len()==1).ok_or(bad)?;
    if state.contains_key("SubGrid"){
        subgrid_tree(collection,&target.grid_id,&target.object_id)?;
        support_pickup_references(profile,grids,&target.grid_id,&target.object_id,&mut HashSet::new(),&mut 0,0,512)?;
    }else if state.contains_key("Storage"){
        if !ddv_save_patch::storage_transform_pose(&root,&Value::Object(obj.clone())){return Err(bad);}
    }else{return Err(bad);}
    if grid_identity_dependencies(profile,target)?.blocking()>0{return Err(bad);}
    Ok(())
}

/// Common native transform preflight: dependencies and stateful root
/// bounds are checked independently of the visual item category. Diagonal
/// orientation still requires the separately verified factor-one leaf contract.
pub(super) fn validate_oblique_grid_edits(profile:&[u8],edits:&[ddv_save_patch::GridMixedEdit])->Result<(),CodecError>{
    let bad=CodecError::Json;
    let root:Value=serde_json::from_slice(profile).map_err(|_|bad)?;
    // One dependency scan per native Grid, rather than per visual category.
    let mut by_grid=HashMap::<String,Vec<String>>::new();
    if root["GameInfo"]["Version"].as_u64()==Some(643){
        for e in edits{by_grid.entry(e.target.grid_id.clone()).or_default().push(e.target.object_id.clone());}
        for (gid,ids) in by_grid{if grid_identity_dependencies_for_ids(profile,&gid,&ids)?.blocking()>0{return Err(bad);}}
    }
    for e in edits{
        let grid=&root["World"]["GridCollection"]["Grids"][&e.target.grid_id];
        let obj=&grid["Objects"][&e.target.object_id];
        if e.target.kind==GridObjectKind::Full&&(obj.get("State").and_then(|s|s.get("SubGrid")).is_some()||obj.get("State").and_then(|s|s.get("Storage")).is_some()||crate::storage_source::is_storage(e.target.item_id)){
            validate_owned_transform_root(profile,&e.target)?;
            let (_,_,factor,sx,sy)=house_exterior_identity(&root,&e.target.grid_id)?;
            let valid=|(x,y):(i32,i32)|x>=0&&y>=0&&(x as u64)<sx*factor&&(y as u64)<sy*factor;
            if !valid(e.expected)||e.position.is_some_and(|p|!valid(p))||e.orientation.as_ref().is_some_and(|(a,b)|!ddv_save_patch::OBSERVED_CARDINAL_ORIENTATIONS.contains(&a.as_str())||!ddv_save_patch::OBSERVED_CARDINAL_ORIENTATIONS.contains(&b.as_str())){return Err(bad);}
        }
        let diagonal=|s:&str|ddv_save_patch::EXPERIMENTAL_EIGHT_WAY_ORIENTATIONS.contains(&s)&&!ddv_save_patch::OBSERVED_CARDINAL_ORIENTATIONS.contains(&s);
        let old=obj["Orientation"].as_str().unwrap_or("");
        if !diagonal(old)&&!e.orientation.as_ref().is_some_and(|(a,b)|diagonal(a)||diagonal(b)){continue;}
        if root["GameInfo"]["Version"].as_u64()!=Some(643)||e.target.kind!=GridObjectKind::Full||e.target.item_id/100_000!=400||
           grid["ID"].as_u64()!=key_id(&e.target.grid_id)||obj["ID"].as_u64()!=key_id(&e.target.object_id)||
           grid.get("TessellationFactor").map_or(Some(1),Value::as_u64)!=Some(1)||
           root["World"]["GridCollection"].get("DiffGrids").is_some_and(|v|v.as_object().is_none_or(|m|m.contains_key(&e.target.grid_id)))||
           obj.as_object().is_none_or(|m|m.keys().any(|k|!matches!(k.as_str(),"ID"|"ItemID"|"X"|"Y"|"Orientation"|"State")))||
           obj.get("State").is_some_and(|v|!v.is_null()&&!v.as_object().is_some_and(|m|m.is_empty()))||
           !ddv_save_patch::EXPERIMENTAL_EIGHT_WAY_ORIENTATIONS.contains(&old)||
           grid_identity_dependencies(profile,&e.target)?.blocking()>0{return Err(bad);}
        let (sx,sy)=building_transform_grid_size(&root,&e.target.grid_id)?;
        let valid=|(x,y):(i32,i32)|x>=0&&y>=0&&(x as u64)<sx&&(y as u64)<sy;
        if !valid(e.expected)||e.position.is_some_and(|p|!valid(p)){return Err(bad);}
    }
    Ok(())
}

/// Validate the native category's state envelope; nested data is not
/// reconstructed or normalized by the lexical transform. Unknown oneof
/// cases are unsupported, and identity references are checked separately.
fn known_building_transform_state(root:&Value,item:u64,state:&Value)->bool{
    let Some(m)=state.as_object().filter(|m|m.len()==1) else{return false;};
    let family=item/100_000;
    let upgrade=|v:&Value|v.is_null()||v.as_object().is_some();
    let skin=|v:&Value|v.as_i64().is_some();
    // Item category is not the GridState discriminant. Schema-643 native
    // observations include skinned houses/stalls and HouseData on class 203.
    if matches!(family,200|203|205){
        if let Some(h)=m.get("HouseData").and_then(Value::as_object){
            if h.keys().any(|k|!matches!(k.as_str(),"Built"|"UpgradeState"|"PlayerHouseIndex"))||
               h.get("Built").and_then(Value::as_bool)!=Some(true)||
               h.get("UpgradeState").is_some_and(|v|!upgrade(v)){return false;}
            if family==205{
                let Some(idx)=h.get("PlayerHouseIndex").and_then(Value::as_u64).and_then(|n|usize::try_from(n).ok()) else{return false;};
                let Some(houses)=root["World"]["PlayerHouses"].as_array() else{return false;};
                return houses.get(idx).is_some_and(|v|v["HouseItemID"].as_u64()==Some(item)&&v["Floors"].as_array().is_some_and(|a|!a.is_empty()))&&
                houses.iter().filter(|v|v["HouseItemID"].as_u64()==Some(item)).count()==1;
            }
            return h.get("PlayerHouseIndex").is_none_or(|v|v.as_i64().is_some());
        }
    }
    if matches!(family,200|201|203){
        if let Some(v)=m.get("BuildingWithSkinData").and_then(Value::as_object){
            return v.keys().all(|k|matches!(k.as_str(),"UpgradeState"|"CurrentSkinItemID"))&&v.get("UpgradeState").is_some_and(upgrade)&&v.get("CurrentSkinItemID").is_none_or(skin);
        }
    }
    match family{
        201=>{
            if let Some(v)=m.get("StallData").and_then(Value::as_object){
                return v.keys().all(|k|matches!(k.as_str(),"UpgradeState"|"ShopData"|"CurrentSkinItemID"))&&v.get("UpgradeState").is_some_and(upgrade)&&v.get("ShopData").is_some_and(|v|v.is_null()||v.is_object())&&v.get("CurrentSkinItemID").is_none_or(skin);
            }
            m.get("FishingStallData").and_then(Value::as_object).is_some_and(|v|v.keys().all(|k|matches!(k.as_str(),"UpgradeState"|"LastCollect"|"PendingFishes"))&&v.get("UpgradeState").is_some_and(upgrade)&&v.get("LastCollect").is_some_and(Value::is_string)&&v.get("PendingFishes").is_some_and(Value::is_array))
        },
        202=>m.get("GardenData").and_then(Value::as_object).is_some_and(|v|v.len()==1&&v.get("Slots").and_then(Value::as_array).is_some_and(|a|a.iter().all(Value::is_object))),
        _=>false
    }
}

/// Existing on-grid buildings only. Keep native identity and preserve the
/// entire state byte-for-byte. Reject inbound dependencies instead of
/// trying to repair entrances, progression or linked scene state.
fn validate_building_transform(profile:&[u8],target:&GridCoordinateTarget)->Result<(),CodecError>{
    let bad=CodecError::Json;
    if target.kind!=GridObjectKind::Full||!matches!((target.item_id%10_000_000)/100_000,0|1|2|3|5){return Err(bad);}
    let root:Value=serde_json::from_slice(profile).map_err(|_|bad)?;
    if root.get("GameInfo").and_then(|v|v.get("Version")).and_then(Value::as_u64)!=Some(643){return Err(bad);}
    let collection=root.get("World").and_then(|v|v.get("GridCollection")).ok_or(bad)?;
    if collection.get("DiffGrids").is_some_and(|v|v.as_object().is_none_or(|m|m.contains_key(&target.grid_id))){return Err(bad);}
    let grid=collection.get("Grids").and_then(|v|v.get(&target.grid_id)).ok_or(bad)?;
    if grid.get("ID").and_then(Value::as_u64)!=key_id(&target.grid_id){return Err(bad);}
    let obj=grid.get("Objects").and_then(|v|v.get(&target.object_id)).and_then(Value::as_object).ok_or(bad)?;
    if obj.get("ID").and_then(Value::as_u64)!=key_id(&target.object_id)||
       obj.keys().any(|k|!matches!(k.as_str(),"ID"|"ItemID"|"X"|"Y"|"Orientation"|"State"))||
       !obj.get("Orientation").and_then(Value::as_str).is_some_and(|v|ddv_save_patch::OBSERVED_CARDINAL_ORIENTATIONS.contains(&v)){
        return Err(bad);
    }
    if let Some(state)=obj.get("State").filter(|v|!v.is_null()&&!v.as_object().is_some_and(|o|o.is_empty())){
        if !known_building_transform_state(&root,target.item_id,state){return Err(bad);}
        let (sx,sy)=building_transform_grid_size(&root,&target.grid_id)?;
        let (x,y)=observed_coordinates(obj).ok_or(bad)?;
        if x<0||y<0||x as u64>=sx||y as u64>=sy{return Err(bad);}
    }
    let refs=grid_identity_dependencies(profile,target)?;
    if refs.blocking()>0{return Err(bad);}
    Ok(())
}

/// Inbound identity classification from the archived native grid identity
/// dependency investigation (v1.24.13): SpawnedObjects is active remap,
/// GridObjectsCollected/GridObjectIdsCollected is historical, linked entrance
/// is a cache, gardening pairs and implicit sapling links are active.
/// Re-scan the actual opened profile; a positive match never grants writes.
/// Unrecognized identity-like fields are classified conservatively.
#[derive(Default)]
pub(super) struct GridIdentityDependencies{
    pub active:usize,pub historical:usize,pub navigation:usize,pub related:usize,pub unknown:usize
}
impl GridIdentityDependencies{
    pub fn blocking(&self)->usize{self.active+self.navigation+self.related+self.unknown}
}
pub(super) fn grid_identity_dependencies(profile:&[u8],target:&GridCoordinateTarget)->Result<GridIdentityDependencies,CodecError>{
    grid_identity_dependencies_for_ids(profile,&target.grid_id,std::slice::from_ref(&target.object_id))
}
/// Same conservative reference test for many identities in one Grid and
/// one bounded scan. Aggregate hit counts are not per-object counts.
pub(super) fn grid_identity_dependencies_for_ids(profile:&[u8],grid_id:&str,ids:&[String])->Result<GridIdentityDependencies,CodecError>{
    if ids.is_empty()||ids.len()>512{return Err(CodecError::Bounds);}
    let grid=key_id(grid_id).ok_or(CodecError::Json)?;
    let objects:HashSet<u64>=ids.iter().map(|s|key_id(s).ok_or(CodecError::Json)).collect::<Result<_,_>>()?;
    if objects.len()!=ids.len(){return Err(CodecError::Json);}
    let root:Value=serde_json::from_slice(profile).map_err(|_|CodecError::Json)?;
    let mut out=GridIdentityDependencies::default();
    // Iterative scan with explicit depth and node bounds. No private path,
    // identifier or arbitrary field name leaves the Worker.
    // MissionSlots is an observed native container, but a positive MissionId
    // alone does not establish active/completed status. A collected reference
    // inside this container must not receive the achievement-history exemption.
    let mission_slots=root.get("World").and_then(|w|w.get("MissionSlots"));
    // Archived v1.25 objective read contract identifies the exact nested
    // GridObjectIdsCollected numeric list as historical bookkeeping without
    // a GridID. It is not a unique instance address. Do not turn every same
    // local ordinal in unrelated grids into a blocking dependency.
    let mut objective_history=HashSet::<*const Value>::new();
    if let Some(groups)=mission_slots.and_then(Value::as_object){
        for group in groups.values(){
            if let Some(slots)=group.get("Slots").and_then(Value::as_array){
                for slot in slots{
                    if let Some(steps)=slot.get("MissionSteps").and_then(Value::as_array){
                        for step in steps{
                            if let Some(substeps)=step.get("SubSteps").and_then(Value::as_array){
                                for substep in substeps{
                                    if let Some(objectives)=substep.get("Objectives").and_then(Value::as_array){
                                        for obj in objectives{
                                            if let Some(list)=obj.get("GridObjectIdsCollected").filter(|v|v.as_array().is_some_and(|a|a.iter().all(|n|n.as_u64().is_some()))){
                                                objective_history.insert(list as *const Value);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    type Flags=(bool,bool,bool,bool,bool);
    let mut stack=vec![(&root,(false,false,false,false,false),None::<u64>,0usize)];
    let mut visited=0usize;
    while let Some((v,flags,owning,depth))=stack.pop(){
        visited+=1;
        if depth>256||visited>2_000_000{return Err(CodecError::Bounds);}
        match v{
            Value::Object(o)=>{
                let normal=|s:&str|s.to_ascii_lowercase().replace('_',"");
                let mut grid_values=Vec::new();let mut object_values=Vec::new();
                for (key,value) in o{
                    let k=normal(key);
                    if k=="gridid"{grid_values.push(value.as_u64());}
                    if k=="gridobjectid"{object_values.push(value.as_u64());}
                }
                if object_values.iter().any(|v|v.is_some_and(|id|objects.contains(&id))){
                    if grid_values.iter().any(|v|*v==Some(grid)){
                        if flags.0{out.active+=1;}else if flags.4{if flags.3{out.active+=1;}else{out.unknown+=1;}}else if flags.1{out.historical+=1;}else if flags.2{out.navigation+=1;}else if flags.3{out.active+=1;}else{out.unknown+=1;}
                    }else if grid_values.is_empty()||grid_values.iter().any(Option::is_none){out.unknown+=1;}
                }
                for (key,value) in o{
                    let k=normal(key);
                    if k=="saplinggridobjectid"&&value.as_u64().is_some_and(|id|objects.contains(&id))&&owning.is_none_or(|g|g==grid){out.related+=1;}
                    else if k!="gridobjectid"&&k!="nextgridobjectid"&&k!="saplinggridobjectid"&&k.contains("gridobjectid")&&value.as_u64().is_some_and(|id|objects.contains(&id)){out.unknown+=1;}
                    // Mission identity arrays may use unclassified field names.
                    // Only the exact archived objective history list, without
                    // an explicit GridID or active-reference context, is exempt.
                    // Never infer completion or an instance address from a local ID.
                    if flags.4&&k.contains("gridobjectid")&&k!="nextgridobjectid"&&
                        value.as_array().is_some_and(|a|a.iter().any(|v|v.as_u64().is_some_and(|id|objects.contains(&id))))&&
                        (grid_values.is_empty()||grid_values.iter().any(|v|v.is_none()||*v==Some(grid))){
                        let historical=objective_history.contains(&(value as *const Value))&&grid_values.is_empty()&&!flags.0&&!flags.3;
                        if !historical{
                            if flags.0||flags.3||k.contains("spawned"){out.active+=1;}else{out.unknown+=1;}
                        }
                    }
                    let next=(flags.0||k=="spawnedobjects",flags.1||k=="gridobjectscollected"||k=="gridobjectidscollected",flags.2||k=="lastusedlinkedenvironmententer",flags.3||k.contains("gardeningburningstate"),flags.4||mission_slots.is_some_and(|slot|std::ptr::eq(slot,value)));
                    // Owning Grid context is recognized only for exact
                    // full/diff map key+embedded ID. Do not infer from a generic ID.
                    if k=="grids"||k=="diffgrids"{
                        if let Some(map)=value.as_object(){
                            for (id,entry) in map{
                                let context=key_id(id).filter(|n|entry.get("ID").and_then(Value::as_u64)==Some(*n));
                                stack.push((entry,next,context,depth+2));
                            }
                            continue;
                        }
                    }
                    stack.push((value,next,owning,depth+1));
                }
            },
            Value::Array(rows)=>for row in rows{stack.push((row,flags,owning,depth+1));},
            _=>{}
        }
    }
    Ok(out)
}

/// Resolve a transfer destination without exposing native Save IDs.
pub(super) fn resolve_plain_grid_destination(profile:&[u8],witness:&Value)->Result<ddv_save_patch::PlainGridDestination,CodecError>{
    let o=witness.as_object().ok_or(CodecError::Json)?;
    if o.len()!=5||o.keys().any(|k|!matches!(k.as_str(),"layoutId"|"gridDataPath"|"factor"|"sizeX"|"sizeY")){return Err(CodecError::Json);}
    let layout=o.get("layoutId").and_then(Value::as_str).filter(|s|s.len()<=512&&s.starts_with("SceneLayouts/")&&s.ends_with(".json")&&!s.contains("..")).ok_or(CodecError::Json)?;
    let data=o.get("gridDataPath").and_then(Value::as_str).filter(|s|s.len()<=512&&s.starts_with("GridData/")&&s.ends_with(".json")&&!s.contains("..")).ok_or(CodecError::Json)?;
    let num=|key:&str|o.get(key).and_then(Value::as_u64).and_then(|v|u32::try_from(v).ok()).ok_or(CodecError::Json);
    let factor=num("factor")?;let sx=num("sizeX")?;let sy=num("sizeY")?;
    if !matches!(factor,1|2)||sx==0||sy==0||sx>65536||sy>65536||u64::from(sx)*u64::from(sy)>16_777_216{return Err(CodecError::Bounds);}
    let (scan,_)=scan_grid_instances(profile)?;
    if scan.sampled||scan.invalid>0{return Err(CodecError::Json);}
    let root:Value=serde_json::from_slice(profile).map_err(|_|CodecError::Json)?;
    let collection=root.get("World").and_then(|v|v.get("GridCollection")).ok_or(CodecError::Json)?;
    let grids=collection.get("Grids").and_then(Value::as_object).ok_or(CodecError::Json)?;
    let mut candidates=grids.iter().filter(|(_,v)|v["GridDataPath"].as_str()==Some(data)&&(v["GridDefaultLayoutPath"].as_str()==Some(layout)||v["GridDefaultLayoutPath"].as_str()==Some("")));
    
    let (id,grid)=candidates.next().ok_or(CodecError::Json)?;
    if candidates.next().is_some()||valid_grid(id,grid).is_none()||
       grid.get("ID").and_then(Value::as_u64)!=key_id(id)||
       grid.get("TessellationFactor").map_or(Some(1),Value::as_u64)!=Some(u64::from(factor))||
       collection.get("DiffGrids").is_some_and(|v|v.as_object().is_none_or(|m|m.contains_key(id))){
       return Err(CodecError::Json);
    }
    if grid["GridDefaultLayoutPath"].as_str()==Some(""){
        let (_,native_layout,native_factor,native_x,native_y)=outdoor_identity(&root,id)?;
        if native_layout!=layout||native_factor!=u64::from(factor)||native_x!=u64::from(sx)||native_y!=u64::from(sy){return Err(CodecError::Json);}
    }
    // A monotonic counter can still point to an address referenced outside
    // this Objects map, for example by an old collection/event record.
    // Insertion must not resurrect any observed address, even historical.
    let next=grid.get("NextGridObjectID").and_then(Value::as_u64)
        .filter(|n|*n>0&&*n<u32::MAX as u64).ok_or(CodecError::Json)?;
    let new_target=GridCoordinateTarget{kind:GridObjectKind::Full,grid_id:id.clone(),object_id:next.to_string(),item_id:0};
    let refs=grid_identity_dependencies(profile,&new_target)?;
    if refs.blocking()>0||refs.historical>0{return Err(CodecError::Json);}
    Ok(ddv_save_patch::PlainGridDestination{grid_id:id.clone(),layout_path:layout.to_owned(),data_path:data.to_owned(),tessellation:factor,size:(sx,sy)})
}

/// Resolve a cardinal orientation edit exclusively against the original,
/// locally opened Save. No native Grid/Object ID leaves this Rust module.
pub(super) fn resolve_grid_orientation_target(
    profile:&[u8],ordinal:usize,expected_item:u64,
    expected:(i32,i32),record_kind:&str,orientation:&str
)->Result<GridCoordinateTarget,CodecError>{
    let (scan,_status)=scan_grid_instances(profile)?;
    if scan.sampled||scan.invalid>0||ordinal==0||ordinal>MAX_ROWS{
        return Err(CodecError::Json);
    }
    let (target,xy)=scan.private_targets.get(ordinal-1)
        .ok_or(CodecError::Json)?;
    let row=scan.rows.get(ordinal-1).ok_or(CodecError::Json)?;
    let kind=match target.kind{
        GridObjectKind::Full=>"full",
        GridObjectKind::DiffModified=>"diff_modified"
    };
    if target.item_id!=expected_item||xy!=&Some(expected)||
       kind!=record_kind||
       row.get("orientation").and_then(Value::as_str)!=Some(orientation){
        return Err(CodecError::Json);
    }
    Ok(target.clone())
}

pub(super) fn saved_grid_instances_json(source:&[u8])->Result<String,CodecError>{
    let (scan,status)=scan_grid_instances(source)?;
    serde_json::to_string(&serde_json::json!({
        "contract":"wand.db05.grid-instance-preview@2",
        "status":status,
        "observedFullGrids":scan.full,
        "observedDiffGrids":scan.diff,
        "scannedObjectRecords":scan.scanned,
        "notItemReferences":scan.not_item,
        "invalidRecords":scan.invalid,
        "removedObjectMarkers":scan.removal_markers,
        "rowsMissingCoordinates":scan.missing_coords,
        "sampled":scan.sampled,
        "rows":scan.rows,
        "sourceGridIdentityVerified":false,
        "effectivePlacementVerified":false,
        "legalPlacementVerified":false,
        "stableInstanceIdentityVerified":false,
        "saveWritingAuthorized":false
    })).map_err(|_|CodecError::Json)
}

/// DB-05 × DB-04 read-only, *per-ephemeral-ordinal* source reference
/// annotation. This is never a saved Grid identity join, placement bound,
/// occupancy permission or source hash equivalence. Save dictionary IDs and
/// source paths must not cross this Rust/WASM output boundary.
pub(super) fn saved_db04_object_source_context_json(
    profile:&[u8],witness:&str
)->Result<String,CodecError>{
    saved_db04_source_projection(profile,witness,false)
}
/// One local Save scan for all public source Grid witnesses. Only ephemeral
/// ordinals and public witness indices leave this function. Native GetFloorType
/// divides the saved position by TessellationFactor; Contains rejects negatives
/// and coordinates >= source dimensions * factor. The pinned Grid constructor
/// initializes an omitted TessellationFactor to 1.
pub(super) fn saved_db04_terrain_session_json(
    profile:&[u8],witness:&str
)->Result<String,CodecError>{
    saved_db04_source_projection(profile,witness,true)
}
// Never expose private Grid keys. A resolved full child is a structural
// reference, not proof of support height or world-space transforms.
fn local_subgrid_summary(collection:Option<&Map<String,Value>>,parent:Option<&Map<String,Value>>,object_key:&str,parent_grid_key:&str)->Option<Value>{
    let sub=parent?.get("Objects")?.get(object_key)?.get("State")?.get("SubGrid")?;
    let unknown=||serde_json::json!({"status":"unresolved","objectCount":null});
    let Some(id)=sub.get("GridID").and_then(Value::as_u64) else{return Some(unknown());};
    let key=id.to_string();
    if key==parent_grid_key{return Some(unknown());}
    let Some(c)=collection else{return Some(unknown());};
    if c.get("DiffGrids").and_then(|v|v.get(&key)).is_some(){return Some(unknown());}
    let Some(grid)=c.get("Grids").and_then(|v|v.get(&key)).and_then(|v|valid_grid(&key,v)) else{return Some(unknown());};
    let count=match grid.get("Objects"){
        None=>0,
        Some(v)=>match v.as_object(){Some(o)=>o.len(),None=>return Some(unknown())}
    };
    Some(serde_json::json!({"status":"resolved_full","objectCount":count}))
}
/// Exact child ownership, no guessed child-to-parent transform. The
/// receipt contains only local item geometry inputs, never native keys.
pub(super) fn subgrid_tree(collection:&Map<String,Value>,parent_grid:&str,parent_object:&str)->Result<Value,CodecError>{
 let bad=CodecError::Json;
 let grids=collection.get("Grids").and_then(Value::as_object).ok_or(bad)?;
 let diff=collection.get("DiffGrids").map(|v|v.as_object().ok_or(bad)).transpose()?;
 let mut owners=HashMap::<String,Vec<(String,String)>>::new();
 let mut scanned=0usize;
 for (scope,object_key) in [(Some(grids),"Objects"),(diff,"ModifiedObjects")]{
  if let Some(scope)=scope{for (g,v) in scope{
   if let Some(objects)=v.get(object_key).and_then(Value::as_object){for (o,value) in objects{
    scanned+=1;if scanned>MAX_SCANNED_OBJECTS{return Err(CodecError::Bounds);}
    if let Some(id)=value.get("State").and_then(|s|s.get("SubGrid")).and_then(|s|s.get("GridID")).and_then(Value::as_u64){
     owners.entry(id.to_string()).or_default().push((g.clone(),o.clone()));
    }
   }}
  }}
 }
 fn visit(grids:&Map<String,Value>,diff:Option<&Map<String,Value>>,owners:&HashMap<String,Vec<(String,String)>>,parent_grid:&str,parent_object:&str,seen:&mut HashSet<String>,count:&mut usize,depth:usize)->Result<Value,CodecError>{
  let bad=CodecError::Json;if depth>8{return Err(CodecError::Bounds);}
  let parent=grids.get(parent_grid).and_then(|g|g.get("Objects")).and_then(|o|o.get(parent_object)).ok_or(bad)?;
  let child=parent.get("State").and_then(|s|s.get("SubGrid")).and_then(|s|s.get("GridID")).and_then(Value::as_u64).filter(|n|*n>0).ok_or(bad)?.to_string();
  if !seen.insert(child.clone())||diff.is_some_and(|d|d.contains_key(&child))||owners.get(&child).is_none_or(|o|o.len()!=1||o[0].0!=parent_grid||o[0].1!=parent_object){return Err(bad);}
  let g=grids.get(&child).and_then(|v|valid_grid(&child,v)).ok_or(bad)?;
  if g.get("ID").and_then(Value::as_u64)!=key_id(&child){return Err(bad);}
  let factor=g.get("TessellationFactor").map_or(Some(1),Value::as_u64).filter(|n|matches!(n,1|2)).ok_or(bad)?;
  let empty=Map::new();let objects=g.get("Objects").map_or(Some(&empty),Value::as_object).ok_or(bad)?;
  let mut rows=Vec::new();
  for (key,v) in objects{
   *count+=1;if *count>512{return Err(CodecError::Bounds);}
   let obj=v.as_object().ok_or(bad)?;
   if obj.get("ID").and_then(Value::as_u64)!=key_id(key){return Err(bad);}
   let item=obj.get("ItemID").and_then(Value::as_u64).filter(|n|*n>0&&*n<=u32::MAX as u64).ok_or(bad)?;
   let (x,y)=observed_coordinates(obj).ok_or(bad)?;
   let orientation=observed_orientation(obj).ok_or(bad)?;
   let nested=if obj.get("State").and_then(|s|s.get("SubGrid")).is_some(){visit(grids,diff,owners,&child,key,seen,count,depth+1)?}else{Value::Null};
   rows.push(serde_json::json!({"itemId":item,"x":x,"y":y,"orientation":orientation,"child":nested}));
  }
  let path=g.get("GridDataPath").and_then(Value::as_str).filter(|p|p.starts_with("GridData/Furniture/")&&p.ends_with(".json")&&p.len()<=512&&!p.contains("..")&&!p.contains('\\')&&!p.chars().any(char::is_control));
  Ok(serde_json::json!({"factor":factor,"objects":rows,"sourcePath":path}))
 }
 let mut seen=HashSet::from([parent_grid.to_owned()]);let mut count=0;
 visit(grids,diff,&owners,parent_grid,parent_object,&mut seen,&mut count,0)
}
/// Ephemeral ordinal lookup for exact owned-room records. Native keys stay
/// inside the codec; the ordinary support resolver rechecks every edit.
/// Internal exact native ordinal mapping for an owned room selection.
pub(super) fn room_pickup_ordinals(profile:&[u8])->Result<HashMap<(String,String),usize>,CodecError>{
 let (scan,_)=scan_grid_instances(profile)?;
 if scan.sampled||scan.invalid>0{return Err(CodecError::Json);}
 Ok(scan.private_targets.iter().enumerate().filter_map(|(i,(t,xy))|
  (t.kind==GridObjectKind::Full&&xy.is_some()).then(||((t.grid_id.clone(),t.object_id.clone()),i+1))).collect())
}
/// Resolve an explicitly selected support root from a full outdoor grid.
pub(super) fn resolve_outdoor_support_cut_target(profile:&[u8],ordinal:usize,item:u64,expected:(i32,i32),orientation:&str,factor:u32)->Result<GridCoordinateTarget,CodecError>{
 let bad=CodecError::Json;
 let (scan,_)=scan_grid_instances(profile)?;
 if scan.sampled||scan.invalid>0||ordinal==0||!scan.subgrid_parents.contains(&ordinal)||item/100_000!=400||!ddv_save_patch::OBSERVED_CARDINAL_ORIENTATIONS.contains(&orientation){return Err(bad);}
 let (t,xy)=scan.private_targets.get(ordinal-1).ok_or(bad)?;
 if t.kind!=GridObjectKind::Full||t.item_id!=item||*xy!=Some(expected)||scan.rows.get(ordinal-1).and_then(|v|v.get("orientation")).and_then(Value::as_str)!=Some(orientation){return Err(bad);}
 let root:Value=serde_json::from_slice(profile).map_err(|_|bad)?;
 let c=root["World"]["GridCollection"].as_object().ok_or(bad)?;
 let g=c.get("Grids").and_then(|v|v.get(&t.grid_id)).ok_or(bad)?;
 if g.get("TessellationFactor").map_or(Some(1),Value::as_u64)!=Some(u64::from(factor))||g.get("GridDefaultLayoutPath").and_then(Value::as_str).is_none_or(|v|!v.starts_with("SceneLayouts/")&&(v!=""||outdoor_identity(&root,&t.grid_id).is_err()))||g.get("GridDataPath").and_then(Value::as_str).is_none_or(|v|!v.starts_with("GridData/Villages/")&&!v.starts_with("GridData/FloatingIslands/")){return Err(bad);}
 subgrid_tree(c,&t.grid_id,&t.object_id)?;
 let refs=grid_identity_dependencies(profile,t)?;if refs.blocking()>0||refs.historical>0{return Err(bad);}
 Ok(t.clone())
}
pub(super) fn room_support_ordinals(profile:&[u8])->Result<HashMap<(String,String),usize>,CodecError>{
 let (scan,_)=scan_grid_instances(profile)?;
 if scan.sampled||scan.invalid>0{return Err(CodecError::Json);}
 Ok(scan.private_targets.iter().enumerate().filter_map(|(i,(t,xy))|
  (t.kind==GridObjectKind::Full&&xy.is_some()&&scan.subgrid_parents.contains(&(i+1))).then(||((t.grid_id.clone(),t.object_id.clone()),i+1))).collect())
}
pub(super) fn inspect_subgrid_json(profile:&[u8],ordinal:usize,item:u64,expected:(i32,i32))->Result<String,CodecError>{
 let (scan,_)=scan_grid_instances(profile)?;
 if scan.sampled||scan.invalid>0||ordinal==0{return Err(CodecError::Json);}
 let (target,xy)=scan.private_targets.get(ordinal-1).ok_or(CodecError::Json)?;
 if target.kind!=GridObjectKind::Full||target.item_id!=item||*xy!=Some(expected)||!scan.subgrid_parents.contains(&ordinal){return Err(CodecError::Json);}
 let root:Value=serde_json::from_slice(profile).map_err(|_|CodecError::Json)?;
 let c=root.get("World").and_then(|v|v.get("GridCollection")).and_then(Value::as_object).ok_or(CodecError::Json)?;
 let tree=subgrid_tree(c,&target.grid_id,&target.object_id)?;
 serde_json::to_string(&serde_json::json!({"contract":"wand.world.subgrid-local@1","tree":tree,"worldTransformVerified":false})).map_err(|_|CodecError::Json)
}
/// Resolve a plain leaf within an exact, exclusively owned support hierarchy.
fn support_leaf_orientation(factor:u64,orientation:&str,free:bool)->bool{ddv_save_patch::OBSERVED_CARDINAL_ORIENTATIONS.contains(&orientation)||free&&factor==1&&ddv_save_patch::EXPERIMENTAL_EIGHT_WAY_ORIENTATIONS.contains(&orientation)}
pub(super) fn resolve_support_leaf_cut(source:&[u8],ordinal:usize,w:&Value,item:u64,expected:(i32,i32),old:&str)->Result<GridCoordinateTarget,CodecError>{
 let bad=CodecError::Json;
 if ordinal==0||item/100_000!=400||crate::storage_source::is_storage(item){return Err(bad);}
 let w=w.as_object().filter(|m|m.len()==5&&m.keys().all(|k|matches!(k.as_str(),"parentItemId"|"parentX"|"parentY"|"path"|"index"))).ok_or(bad)?;
 let (scan,_)=scan_grid_instances(source)?;
 if scan.sampled||scan.invalid>0||!scan.subgrid_parents.contains(&ordinal){return Err(bad);}
 let (parent,pose)=scan.private_targets.get(ordinal-1).ok_or(bad)?;
 if parent.kind!=GridObjectKind::Full||w.get("parentItemId").and_then(Value::as_u64)!=Some(parent.item_id)||pose.map(|(x,y)|(i64::from(x),i64::from(y)))!=w.get("parentX").and_then(Value::as_i64).zip(w.get("parentY").and_then(Value::as_i64)){return Err(bad);}
 let root:Value=serde_json::from_slice(source).map_err(|_|bad)?;
 let c=root["World"]["GridCollection"].as_object().ok_or(bad)?;
 subgrid_tree(c,&parent.grid_id,&parent.object_id)?;
 let grids=c.get("Grids").and_then(Value::as_object).ok_or(bad)?;
 let path=w.get("path").and_then(Value::as_array).filter(|a|a.len()<=8).ok_or(bad)?;
 let index=|v:&Value|v.as_u64().and_then(|n|usize::try_from(n).ok()).filter(|n|*n<512).ok_or(bad);
 let mut gid=parent.grid_id.clone();let mut oid=parent.object_id.clone();
 let child=|g:&str,o:&str|grids.get(g).and_then(|v|v.get("Objects")).and_then(|v|v.get(o)).and_then(|v|v.get("State")).and_then(|v|v.get("SubGrid")).and_then(|v|v.get("GridID")).and_then(Value::as_u64).map(|v|v.to_string()).ok_or(bad);
 for i in path{gid=child(&gid,&oid)?;oid=grids[&gid]["Objects"].as_object().and_then(|m|m.keys().nth(index(i).ok()?)).cloned().ok_or(bad)?;}
 gid=child(&gid,&oid)?;
 let g=grids.get(&gid).ok_or(bad)?;
 let path=g.get("GridDataPath").and_then(Value::as_str).ok_or(bad)?;
 let factor=g.get("TessellationFactor").map_or(Some(1),Value::as_u64).filter(|n|matches!(n,1|2)).ok_or(bad)?;
 let catalog:Value=serde_json::from_str(include_str!("../../../static/ddv/world/steam-1.26.2/support-terrain.json")).map_err(|_|bad)?;
 let entry=catalog["grids"].as_array().and_then(|a|a.iter().find(|v|v[0].as_str()==Some(path))).ok_or(bad)?;
 let sx=entry[1].as_u64().filter(|n|(1..=256).contains(n)).ok_or(bad)?;let sy=entry[2].as_u64().filter(|n|(1..=256).contains(n)).ok_or(bad)?;
 if !support_leaf_orientation(factor,old,true)||expected.0<0||expected.1<0||expected.0 as u64>=sx*factor||expected.1 as u64>=sy*factor{return Err(bad);}
 let (key,v)=g["Objects"].as_object().and_then(|m|m.iter().nth(index(w.get("index")?).ok()?)).ok_or(bad)?;
 if v.get("ID").and_then(Value::as_u64)!=key_id(key)||v["ItemID"].as_u64()!=Some(item)||v["Orientation"].as_str()!=Some(old)||observed_coordinates(v.as_object().ok_or(bad)?)!=Some(expected)||v.get("State").is_some_and(|s|!s.is_null())||v.as_object().is_none_or(|m|m.keys().any(|k|!matches!(k.as_str(),"ID"|"ItemID"|"X"|"Y"|"Orientation"|"State"))){return Err(bad);}
 let target=GridCoordinateTarget{kind:GridObjectKind::Full,grid_id:gid,object_id:key.clone(),item_id:item};
 let refs=grid_identity_dependencies(source,&target)?;if refs.blocking()>0||refs.historical>0{return Err(bad);}
 Ok(target)
}
/// Existing child cells only; UI separately establishes identical source
/// footprint and mask. Never infer bounds from occupied extent.
pub(super) fn support_child_candidate(profile:&[u8],plan:&Value)->Result<ddv_save_patch::GridCoordinateDraft,CodecError>{
 let bad=CodecError::Json;
 let o=plan.as_object().filter(|o|(6..=9).contains(&o.len())&&o.keys().all(|k|matches!(k.as_str(),"localOrdinal"|"itemId"|"expectedX"|"expectedY"|"path"|"edits"|"terrainPath"|"stock"|"transfer"|"floorTransfer"|"freePlacement"|"groupEdit"))&&["edits","stock","transfer","floorTransfer"].iter().filter(|k|o.contains_key(**k)).count()==1).ok_or(bad)?;
 let int=|v:&Value,k:&str|v.get(k).and_then(Value::as_i64).and_then(|n|i32::try_from(n).ok()).ok_or(bad);
 let free=o.get("freePlacement").map(|v|v.as_bool().filter(|b|*b).ok_or(bad)).transpose()?.unwrap_or(false);
 if o.contains_key("groupEdit")&&(!free||!o.contains_key("edits")){return Err(bad);}
 let ordinal=o.get("localOrdinal").and_then(Value::as_u64).and_then(|n|usize::try_from(n).ok()).filter(|n|*n>0).ok_or(bad)?;
 let item=o.get("itemId").and_then(Value::as_u64).ok_or(bad)?;
 let expected=(int(plan,"expectedX")?,int(plan,"expectedY")?);
 let root:Value=serde_json::from_slice(profile).map_err(|_|bad)?;
 if root.get("GameInfo").and_then(|v|v.get("Version")).and_then(Value::as_u64)!=Some(643){return Err(bad);}
 let (scan,_)=scan_grid_instances(profile)?;
 if scan.sampled||scan.invalid>0{return Err(bad);}
 let (target,xy)=scan.private_targets.get(ordinal-1).ok_or(bad)?;
 if target.kind!=GridObjectKind::Full||target.item_id!=item||*xy!=Some(expected)||!scan.subgrid_parents.contains(&ordinal){return Err(bad);}
 let c=root.get("World").and_then(|v|v.get("GridCollection")).and_then(Value::as_object).ok_or(bad)?;
 subgrid_tree(c,&target.grid_id,&target.object_id)?;
 let grids=c.get("Grids").and_then(Value::as_object).ok_or(bad)?;
 let path=o.get("path").and_then(Value::as_array).filter(|a|a.len()<=8).ok_or(bad)?;
 let mut gid=target.grid_id.clone();let mut oid=target.object_id.clone();
 let child=|g:&str,o:&str|grids.get(g).and_then(|v|v.get("Objects")).and_then(|v|v.get(o)).and_then(|v|v.get("State")).and_then(|v|v.get("SubGrid")).and_then(|v|v.get("GridID")).and_then(Value::as_u64).map(|v|v.to_string()).ok_or(bad);
 for index in path{
  gid=child(&gid,&oid)?;
  let i=index.as_u64().and_then(|n|usize::try_from(n).ok()).filter(|n|*n<512).ok_or(bad)?;
  oid=grids.get(&gid).and_then(|g|g.get("Objects")).and_then(Value::as_object).and_then(|m|m.keys().nth(i)).cloned().ok_or(bad)?;
 }
 gid=child(&gid,&oid)?;
 let objects=grids.get(&gid).and_then(|g|g.get("Objects")).and_then(Value::as_object).ok_or(bad)?;
 if let Some(transfer)=o.get("transfer"){
  if o.contains_key("terrainPath"){return Err(bad);}
  let row=transfer.as_object().filter(|r|r.len()==9&&r.keys().all(|k|matches!(k.as_str(),"index"|"itemId"|"expectedX"|"expectedY"|"expectedOrientation"|"destination"|"x"|"y"|"orientation"))).ok_or(bad)?;
  let index=row.get("index").and_then(Value::as_u64).and_then(|n|usize::try_from(n).ok()).filter(|n|*n<512).ok_or(bad)?;
  let (key,v)=objects.iter().nth(index).ok_or(bad)?;
  let id=row.get("itemId").and_then(Value::as_u64).filter(|n|*n/100_000==400&&!crate::storage_source::is_storage(*n)).ok_or(bad)?;
  let expected=(int(transfer,"expectedX")?,int(transfer,"expectedY")?);
  let old=row.get("expectedOrientation").and_then(Value::as_str).ok_or(bad)?;
  if v.get("ItemID").and_then(Value::as_u64)!=Some(id)||observed_coordinates(v.as_object().ok_or(bad)?)!=Some(expected)||v.get("Orientation").and_then(Value::as_str)!=Some(old)||!support_leaf_orientation(grids[&gid].get("TessellationFactor").map_or(Some(1),Value::as_u64).ok_or(bad)?,old,free)||!free&&objects.values().filter(|o|o.as_object().and_then(observed_coordinates)==Some(expected)).count()!=1{return Err(bad);}
  let dest=row.get("destination").and_then(Value::as_object).filter(|d|d.len()==5&&d.keys().all(|k|matches!(k.as_str(),"localOrdinal"|"itemId"|"expectedX"|"expectedY"|"terrainPath"))).ok_or(bad)?;
  let dord=dest.get("localOrdinal").and_then(Value::as_u64).and_then(|n|usize::try_from(n).ok()).filter(|n|*n>0&&*n!=ordinal).ok_or(bad)?;
  let ditem=dest.get("itemId").and_then(Value::as_u64).ok_or(bad)?;
  let dvalue=row.get("destination").ok_or(bad)?;
  let (dt,dxy)=scan.private_targets.get(dord-1).ok_or(bad)?;
  if dt.kind!=GridObjectKind::Full||dt.item_id!=ditem||*dxy!=Some((int(dvalue,"expectedX")?,int(dvalue,"expectedY")?))||!scan.subgrid_parents.contains(&dord){return Err(bad);}
  subgrid_tree(c,&dt.grid_id,&dt.object_id)?;
  let to=child(&dt.grid_id,&dt.object_id)?;
  if gid==to{return Err(bad);}
  let g=grids.get(&to).ok_or(bad)?;
  let path=dest.get("terrainPath").and_then(Value::as_str).ok_or(bad)?;
  if g.get("GridDataPath").and_then(Value::as_str)!=Some(path)||g.get("Objects").and_then(Value::as_object).is_none_or(|m|m.len()>=512){return Err(bad);}
  let factor=g.get("TessellationFactor").map_or(Some(1),Value::as_u64).filter(|n|matches!(n,1|2)).ok_or(bad)? as u32;
  let catalog:Value=serde_json::from_str(include_str!("../../../static/ddv/world/steam-1.26.2/support-terrain.json")).map_err(|_|bad)?;
  let entry=catalog.get("grids").and_then(Value::as_array).and_then(|a|a.iter().find(|v|v.get(0).and_then(Value::as_str)==Some(path))).ok_or(bad)?;
  let sx=entry[1].as_u64().filter(|n|*n>0&&*n<=256).ok_or(bad)? as u32;
  let sy=entry[2].as_u64().filter(|n|*n>0&&*n<=256).ok_or(bad)? as u32;
  let cells=entry[4].as_array().filter(|a|a.len()==(sx*sy) as usize).ok_or(bad)?;
  let (x,y)=(int(transfer,"x")?,int(transfer,"y")?);
  if x<0||y<0||x as u32>=sx*factor||y as u32>=sy*factor||!free&&cells[((y as u32/factor)*sx+x as u32/factor) as usize].as_u64().is_none_or(|n|n==0){return Err(bad);}
  let orientation=row.get("orientation").and_then(Value::as_str).ok_or(bad)?;
  let next=u64::from(ddv_save_patch::support_grid_next_object_id(g).map_err(|_|bad)?);if next>=u32::MAX as u64{return Err(bad);}
  let source_refs=grid_identity_dependencies_for_ids(profile,&gid,&[key.clone()])?;
  let dest_refs=grid_identity_dependencies_for_ids(profile,&to,&[next.to_string()])?;
  if source_refs.blocking()>0||dest_refs.blocking()>0||dest_refs.historical>0{return Err(bad);}
  let target=GridCoordinateTarget{kind:GridObjectKind::Full,grid_id:gid,object_id:key.clone(),item_id:id};
  let d=ddv_save_patch::PlainGridDestination{grid_id:to,layout_path:String::new(),data_path:path.to_owned(),tessellation:factor,size:(sx,sy)};
  let source=std::str::from_utf8(profile).map_err(|_|bad)?;
  return (if free{ddv_save_patch::preview_free_support_grid_transfer(source,&target,expected,&d,(x,y),orientation)}else{ddv_save_patch::preview_support_grid_transfer(source,&target,expected,&d,(x,y),orientation)}).map_err(|_|CodecError::Patch);
 }
 if let Some(value)=o.get("floorTransfer"){
  use zeroize::{Zeroize,Zeroizing};
  let rows=if let Some(a)=value.as_array(){a.as_slice()}else{std::slice::from_ref(value)};
  if !free||rows.is_empty()||rows.len()>32||objects.len()+rows.len()>512{return Err(bad);}
  let path=o.get("terrainPath").and_then(Value::as_str).ok_or(bad)?;
  let g=grids.get(&gid).ok_or(bad)?;
  if g.get("GridDataPath").and_then(Value::as_str)!=Some(path){return Err(bad);}
  let factor=g.get("TessellationFactor").map_or(Some(1),Value::as_u64).filter(|n|matches!(n,1|2)).ok_or(bad)? as u32;
  let catalog:Value=serde_json::from_str(include_str!("../../../static/ddv/world/steam-1.26.2/support-terrain.json")).map_err(|_|bad)?;
  let entry=catalog.get("grids").and_then(Value::as_array).and_then(|a|a.iter().find(|v|v.get(0).and_then(Value::as_str)==Some(path))).ok_or(bad)?;
  let sx=entry[1].as_u64().filter(|n|*n>0&&*n<=256).ok_or(bad)? as u32;
  let sy=entry[2].as_u64().filter(|n|*n>0&&*n<=256).ok_or(bad)? as u32;
  if entry[4].as_array().is_none_or(|a|a.len()!=(sx*sy) as usize){return Err(bad);}
  let resolve=|value:&Value|->Result<(GridCoordinateTarget,(i32,i32)),CodecError>{
   let row=value.as_object().ok_or(bad)?;
   let id=row.get("itemId").and_then(Value::as_u64).filter(|n|*n/100_000==400&&!crate::storage_source::is_storage(*n)).ok_or(bad)?;

   if row.len()!=8+usize::from(row.contains_key("supportSource"))||row.contains_key("roomSource")==row.contains_key("localOrdinal")||row.contains_key("roomSource")&&row.contains_key("supportSource")||row.keys().any(|k|!matches!(k.as_str(),"roomSource"|"localOrdinal"|"supportSource"|"itemId"|"expectedX"|"expectedY"|"expectedOrientation"|"x"|"y"|"orientation")){return Err(bad);}
   let expected=(int(value,"expectedX")?,int(value,"expectedY")?);
   let old=row.get("expectedOrientation").and_then(Value::as_str).ok_or(bad)?;
   if !ddv_save_patch::EXPERIMENTAL_EIGHT_WAY_ORIENTATIONS.contains(&old){return Err(bad);}
   let t=if let Some(w)=row.get("roomSource"){crate::indoor_room_view::resolve_room_cut_source(profile,&root,w,id,expected,old,None,true,false)?}else{
    let ordinal=row.get("localOrdinal").and_then(Value::as_u64).and_then(|n|usize::try_from(n).ok()).ok_or(bad)?;
    if let Some(w)=row.get("supportSource"){resolve_support_leaf_cut(profile,ordinal,w,id,expected,old)?}else{
     let t=resolve_grid_orientation_target(profile,ordinal,id,expected,"full",old)?;
     let (scope,_,f,sx,sy)=house_exterior_identity(&root,&t.grid_id)?;
     if !support_leaf_orientation(if scope.starts_with("SceneLayouts/FloatingIslands/"){2}else{f},old,true)||expected.0<0||expected.1<0||expected.0 as u64>=sx*f||expected.1 as u64>=sy*f{return Err(bad);}
     let refs=grid_identity_dependencies(profile,&t)?;if refs.blocking()>0||refs.historical>0{return Err(bad);}
     t
    }
   };
   Ok((t,expected))

  };
  let mut seen=HashSet::new();let mut moves=Vec::new();
  for row in rows{
   let (t,expected)=resolve(row)?;
   if t.grid_id==gid||!seen.insert((t.grid_id.clone(),t.object_id.clone())){return Err(bad);}
   let xy=(int(row,"x")?,int(row,"y")?);
   if xy.0<0||xy.1<0||xy.0 as u32>=sx*factor||xy.1 as u32>=sy*factor{return Err(bad);}
   let orientation=row.get("orientation").and_then(Value::as_str).filter(|s|support_leaf_orientation(u64::from(factor),s,true)).ok_or(bad)?;
   moves.push((t,expected,xy,orientation));
  }
  let next=u64::from(ddv_save_patch::support_grid_next_object_id(g).map_err(|_|bad)?);
  let ids=(0..rows.len() as u64).map(|n|next.checked_add(n).filter(|n|*n<u32::MAX as u64).map(|n|n.to_string()).ok_or(bad)).collect::<Result<Vec<_>,_>>()?;
  let refs=grid_identity_dependencies_for_ids(profile,&gid,&ids)?;if refs.blocking()>0||refs.historical>0{return Err(bad);}
  let d=ddv_save_patch::PlainGridDestination{grid_id:gid.clone(),layout_path:String::new(),data_path:path.to_owned(),tessellation:factor,size:(sx,sy)};
  let mut working=Zeroizing::new(std::str::from_utf8(profile).map_err(|_|bad)?.to_owned());let mut last=None;
  for (target,expected,xy,orientation) in moves{
   let mut draft=ddv_save_patch::preview_free_support_grid_transfer(&working,&target,expected,&d,xy,orientation).map_err(|_|CodecError::Patch)?;
   if !draft.changed||!draft.untouched_bytes_preserved||draft.writer_authorized||draft.export_authorized{draft.patched_json.zeroize();return Err(bad);}
   working.zeroize();*working=std::mem::take(&mut draft.patched_json);last=Some(draft);
  }
  let mut draft=last.ok_or(bad)?;draft.patched_json=std::mem::take(&mut *working);return Ok(draft);
 }
 if let Some(stock)=o.get("stock"){
  // A support template is restored onto an existing, empty, exact native
  // surface. Do not allocate a new Grid or copy source identities/state.
  if let Some(rows)=stock.as_array(){
   use zeroize::{Zeroize,Zeroizing};
   if rows.is_empty()||rows.len()>32||!free&&!objects.is_empty(){return Err(bad);}
   let pickup=rows[0].get("action").and_then(Value::as_str)==Some("pickup");
   if pickup&&!free||rows.iter().any(|r|r.get("action").and_then(Value::as_str)!=Some(if pickup{"pickup"}else{"place"}))||!pickup&&objects.len()+rows.len()>512{return Err(bad);}
   let path=o.get("terrainPath").and_then(Value::as_str).ok_or(bad)?;
   let g=grids.get(&gid).ok_or(bad)?;
   if g.get("GridDataPath").and_then(Value::as_str)!=Some(path){return Err(bad);}
   let factor=g.get("TessellationFactor").map_or(Some(1),Value::as_u64).filter(|n|matches!(n,1|2)).ok_or(bad)? as u32;
   let catalog:Value=serde_json::from_str(include_str!("../../../static/ddv/world/steam-1.26.2/support-terrain.json")).map_err(|_|bad)?;
   let entry=catalog.get("grids").and_then(Value::as_array).and_then(|a|a.iter().find(|v|v.get(0).and_then(Value::as_str)==Some(path))).ok_or(bad)?;
   let sx=entry[1].as_u64().filter(|n|*n>0&&*n<=256).ok_or(bad)? as u32;
   let sy=entry[2].as_u64().filter(|n|*n>0&&*n<=256).ok_or(bad)? as u32;
   let cells=entry[4].as_array().filter(|a|a.len()==(sx*sy) as usize).ok_or(bad)?;
   if pickup{
    let mut moves=Vec::new();let mut seen=HashSet::new();let mut ids=Vec::new();
    for row in rows{
     let m=row.as_object().filter(|m|m.len()==7&&m.keys().all(|k|matches!(k.as_str(),"action"|"itemId"|"expectedStock"|"index"|"expectedX"|"expectedY"|"expectedOrientation"))).ok_or(bad)?;
     let item=m.get("itemId").and_then(Value::as_u64).filter(|n|*n/100_000==400&&!crate::storage_source::is_storage(*n)).ok_or(bad)?;
     let amount=m.get("expectedStock").and_then(Value::as_u64).and_then(|n|u32::try_from(n).ok()).ok_or(bad)?;
     let index=m.get("index").and_then(Value::as_u64).and_then(|n|usize::try_from(n).ok()).filter(|n|*n<512&&seen.insert(*n)).ok_or(bad)?;
     let (key,v)=objects.iter().nth(index).ok_or(bad)?;
     let xy=(int(row,"expectedX")?,int(row,"expectedY")?);
     let old=m.get("expectedOrientation").and_then(Value::as_str).filter(|s|support_leaf_orientation(u64::from(factor),s,free)).ok_or(bad)?;
     if xy.0<0||xy.1<0||xy.0 as u32>=sx*factor||xy.1 as u32>=sy*factor||v.get("ID").and_then(Value::as_u64)!=key_id(key)||v["ItemID"].as_u64()!=Some(item)||v["Orientation"].as_str()!=Some(old)||v.as_object().and_then(observed_coordinates)!=Some(xy)||v.get("State").is_some_and(|s|!s.is_null())||v.as_object().is_none_or(|o|o.keys().any(|k|!matches!(k.as_str(),"ID"|"ItemID"|"X"|"Y"|"Orientation"|"State"))){return Err(bad);}
     ids.push(key.clone());moves.push((GridCoordinateTarget{kind:GridObjectKind::Full,grid_id:gid.clone(),object_id:key.clone(),item_id:item},xy,amount));
    }
    let refs=grid_identity_dependencies_for_ids(profile,&gid,&ids)?;if refs.blocking()>0||refs.historical>0{return Err(bad);}
    let mut working=Zeroizing::new(std::str::from_utf8(profile).map_err(|_|bad)?.to_owned());let mut last=None;
    for (target,expected,amount) in moves{
     let mut draft=ddv_save_patch::preview_furniture_stock_transaction(&working,amount,ddv_save_patch::FurnitureStockAction::Pickup{target:&target,expected}).map_err(|_|CodecError::Patch)?;
     if !draft.changed||!draft.untouched_bytes_preserved||draft.writer_authorized||draft.export_authorized{draft.patched_json.zeroize();return Err(bad);}
     working.zeroize();*working=std::mem::take(&mut draft.patched_json);last=Some(draft);
    }
    let mut draft=last.ok_or(bad)?;draft.patched_json=std::mem::take(&mut *working);return Ok(draft);
   }
   let next=u64::from(ddv_save_patch::support_grid_next_object_id(g).map_err(|_|bad)?);
   let ids=(0..rows.len() as u64).map(|n|next.checked_add(n).filter(|n|*n<u32::MAX as u64).map(|n|n.to_string()).ok_or(bad)).collect::<Result<Vec<_>,_>>()?;
   let refs=grid_identity_dependencies_for_ids(profile,&gid,&ids)?;
   if refs.blocking()>0||refs.historical>0{return Err(bad);}
   let d=ddv_save_patch::PlainGridDestination{grid_id:gid.clone(),layout_path:String::new(),data_path:path.to_owned(),tessellation:factor,size:(sx,sy)};
   let mut anchors=HashSet::new();let mut moves=Vec::new();
   for row in rows{
    let m=row.as_object().filter(|m|m.len()==6&&m.keys().all(|k|matches!(k.as_str(),"action"|"itemId"|"expectedStock"|"x"|"y"|"orientation"))).ok_or(bad)?;
    if m.get("action").and_then(Value::as_str)!=Some("place"){return Err(bad);}
    let item=m.get("itemId").and_then(Value::as_u64).filter(|n|*n/100_000==400&&!crate::storage_source::is_storage(*n)).ok_or(bad)?;
    let amount=m.get("expectedStock").and_then(Value::as_u64).and_then(|n|u32::try_from(n).ok()).filter(|n|*n>0).ok_or(bad)?;
    let xy=(int(row,"x")?,int(row,"y")?);
    if xy.0<0||xy.1<0||xy.0 as u32>=sx*factor||xy.1 as u32>=sy*factor||!free&&(!anchors.insert(xy)||cells[((xy.1 as u32/factor)*sx+xy.0 as u32/factor) as usize].as_u64().is_none_or(|n|n==0)){return Err(bad);}
    let orientation=m.get("orientation").and_then(Value::as_str).filter(|s|support_leaf_orientation(u64::from(factor),s,free)).ok_or(bad)?;
    moves.push((item,amount,xy,orientation));
   }
   let mut working=Zeroizing::new(std::str::from_utf8(profile).map_err(|_|bad)?.to_owned());
   let mut last=None;
   for (item,amount,xy,orientation) in moves{
    let mut draft=(if free{ddv_save_patch::preview_free_support_grid_stock_place(&working,&d,item,xy,orientation,amount)}else{ddv_save_patch::preview_support_grid_stock_place(&working,&d,item,xy,orientation,amount)}).map_err(|_|CodecError::Patch)?;
    if !draft.changed||!draft.untouched_bytes_preserved||draft.writer_authorized||draft.export_authorized{draft.patched_json.zeroize();return Err(bad);}
    working.zeroize();*working=std::mem::take(&mut draft.patched_json);last=Some(draft);
   }
   let mut draft=last.ok_or(bad)?;draft.patched_json=std::mem::take(&mut *working);return Ok(draft);
  }
  let row=stock.as_object().ok_or(bad)?;
  let action=row.get("action").and_then(Value::as_str).ok_or(bad)?;
  let id=row.get("itemId").and_then(Value::as_u64).filter(|n|*n/100_000==400&&!crate::storage_source::is_storage(*n)).ok_or(bad)?;
  let amount=row.get("expectedStock").and_then(Value::as_u64).and_then(|n|u32::try_from(n).ok()).ok_or(bad)?;
  let source=std::str::from_utf8(profile).map_err(|_|bad)?;
  if action=="pickup"{
   if free||row.len()!=7||o.contains_key("terrainPath")||row.keys().any(|k|!matches!(k.as_str(),"action"|"itemId"|"expectedStock"|"index"|"expectedX"|"expectedY"|"expectedOrientation")){return Err(bad);}
   let i=row.get("index").and_then(Value::as_u64).and_then(|n|usize::try_from(n).ok()).filter(|n|*n<512).ok_or(bad)?;
   let (key,v)=objects.iter().nth(i).ok_or(bad)?;
   let expected=(int(stock,"expectedX")?,int(stock,"expectedY")?);
   if v.get("ItemID").and_then(Value::as_u64)!=Some(id)||v.get("Orientation").and_then(Value::as_str)!=row.get("expectedOrientation").and_then(Value::as_str)||observed_coordinates(v.as_object().ok_or(bad)?)!=Some(expected){return Err(bad);}
   let target=GridCoordinateTarget{kind:GridObjectKind::Full,grid_id:gid.clone(),object_id:key.clone(),item_id:id};
   if grid_identity_dependencies_for_ids(profile,&gid,&[key.clone()])?.blocking()>0{return Err(bad);}
   return ddv_save_patch::preview_furniture_stock_transaction(source,amount,ddv_save_patch::FurnitureStockAction::Pickup{target:&target,expected}).map_err(|_|CodecError::Patch);
  }
  if action!="place"||row.len()!=6||row.keys().any(|k|!matches!(k.as_str(),"action"|"itemId"|"expectedStock"|"x"|"y"|"orientation"))||amount==0{return Err(bad);}
  let path=o.get("terrainPath").and_then(Value::as_str).ok_or(bad)?;
  let g=grids.get(&gid).ok_or(bad)?;
  if g.get("GridDataPath").and_then(Value::as_str)!=Some(path)||objects.len()>=512{return Err(bad);}
  let factor=g.get("TessellationFactor").map_or(Some(1),Value::as_u64).filter(|n|matches!(n,1|2)).ok_or(bad)? as u32;
  let catalog:Value=serde_json::from_str(include_str!("../../../static/ddv/world/steam-1.26.2/support-terrain.json")).map_err(|_|bad)?;
  let entry=catalog.get("grids").and_then(Value::as_array).and_then(|a|a.iter().find(|v|v.get(0).and_then(Value::as_str)==Some(path))).ok_or(bad)?;
  let sx=entry[1].as_u64().filter(|n|*n>0&&*n<=256).ok_or(bad)? as u32;
  let sy=entry[2].as_u64().filter(|n|*n>0&&*n<=256).ok_or(bad)? as u32;
  let cells=entry[4].as_array().filter(|a|a.len()==(sx*sy) as usize).ok_or(bad)?;
  let (x,y)=(int(stock,"x")?,int(stock,"y")?);
  if x<0||y<0||x as u32>=sx*factor||y as u32>=sy*factor||!free&&cells[((y as u32/factor)*sx+x as u32/factor) as usize].as_u64().is_none_or(|n|n==0){return Err(bad);}
  let orientation=row.get("orientation").and_then(Value::as_str).ok_or(bad)?;
  let next=u64::from(ddv_save_patch::support_grid_next_object_id(g).map_err(|_|bad)?);if next>=u32::MAX as u64{return Err(bad);}
  let refs=grid_identity_dependencies_for_ids(profile,&gid,&[next.to_string()])?;
  if refs.blocking()>0||refs.historical>0{return Err(bad);}
  let d=ddv_save_patch::PlainGridDestination{grid_id:gid,layout_path:String::new(),data_path:path.to_owned(),tessellation:factor,size:(sx,sy)};
  return (if free{ddv_save_patch::preview_free_support_grid_stock_place(source,&d,id,(x,y),orientation,amount)}else{ddv_save_patch::preview_support_grid_stock_place(source,&d,id,(x,y),orientation,amount)}).map_err(|_|CodecError::Patch);
 }
 let group=o.get("groupEdit").map(|v|v.as_bool().filter(|b|*b).ok_or(bad)).transpose()?.unwrap_or(false);
 if group&&!free{return Err(bad);}
 let edits=o.get("edits").and_then(Value::as_array).filter(|a|if group{(1..=32).contains(&a.len())}else{matches!(a.len(),1|2)}).ok_or(bad)?;
 let swap=!group&&edits.len()==2;
 if free&&!o.contains_key("terrainPath"){return Err(bad);}
 let mut terrain=None;
 if let Some(path)=o.get("terrainPath"){
  if swap&&!free{return Err(bad);}
  let path=path.as_str().ok_or(bad)?;let g=grids.get(&gid).ok_or(bad)?;
  if g.get("GridDataPath").and_then(Value::as_str)!=Some(path){return Err(bad);}
  let factor=g.get("TessellationFactor").map_or(Some(1),Value::as_u64).filter(|n|matches!(n,1|2)).ok_or(bad)? as usize;
  let catalog:Value=serde_json::from_str(include_str!("../../../static/ddv/world/steam-1.26.2/support-terrain.json")).map_err(|_|bad)?;
  let row=catalog.get("grids").and_then(Value::as_array).and_then(|a|a.iter().find(|v|v.get(0).and_then(Value::as_str)==Some(path))).ok_or(bad)?;
  let sx=row[1].as_u64().filter(|n|*n>0&&*n<=256).ok_or(bad)? as usize;let sy=row[2].as_u64().filter(|n|*n>0&&*n<=256).ok_or(bad)? as usize;
  let cells=row[4].as_array().filter(|a|a.len()==sx*sy).ok_or(bad)?.clone();terrain=Some((sx,sy,factor,cells));
 }
 let mut seen=HashSet::new();let mut result=Vec::new();let mut ids=Vec::new();
 for e in edits{
  let row=e.as_object().filter(|r|r.len()==8&&r.keys().all(|k|matches!(k.as_str(),"index"|"itemId"|"expectedX"|"expectedY"|"expectedOrientation"|"x"|"y"|"orientation"))).ok_or(bad)?;
  let i=row.get("index").and_then(Value::as_u64).and_then(|n|usize::try_from(n).ok()).filter(|n|*n<512&&seen.insert(*n)).ok_or(bad)?;
  let (id,v)=objects.iter().nth(i).ok_or(bad)?;let item=row.get("itemId").and_then(Value::as_u64).filter(|n|*n/100_000==400&&!crate::storage_source::is_storage(*n)).ok_or(bad)?;
  let before=(int(e,"expectedX")?,int(e,"expectedY")?);let after=(int(e,"x")?,int(e,"y")?);
  let old=row.get("expectedOrientation").and_then(Value::as_str).ok_or(bad)?;let new=row.get("orientation").and_then(Value::as_str).ok_or(bad)?;
  if v.get("ItemID").and_then(Value::as_u64)!=Some(item)||v.get("ID").and_then(Value::as_u64)!=key_id(id)||observed_coordinates(v.as_object().ok_or(bad)?)!=Some(before)||v.get("Orientation").and_then(Value::as_str)!=Some(old)||
     v.get("State").is_some_and(|s|!s.is_null())||v.as_object().is_none_or(|o|o.keys().any(|k|!matches!(k.as_str(),"ID"|"ItemID"|"X"|"Y"|"Orientation"|"State")))||
     !support_leaf_orientation(terrain.as_ref().map_or(2,|t|t.2 as u64),old,free)||!support_leaf_orientation(terrain.as_ref().map_or(2,|t|t.2 as u64),new,free)||
     if swap{before==after||old!=new}else if terrain.is_some(){before==after&&old==new}else{before!=after||old==new}{return Err(bad);}
  if let Some((sx,sy,factor,cells))=&terrain{
   let valid=|(x,y):(i32,i32)|x>=0&&y>=0&&(x as usize)/ *factor<*sx&&(y as usize)/ *factor<*sy&&(free||cells[(y as usize)/ *factor* *sx+(x as usize)/ *factor].as_u64().is_some_and(|n|n!=0));
   if !valid(before)||!valid(after)||!free&&objects.iter().any(|(other,o)|other!=id&&o.as_object().and_then(observed_coordinates)==Some(after)){return Err(bad);}
  }
  if !free&&objects.values().filter(|o|o.as_object().and_then(observed_coordinates)==Some(before)).count()!=1{return Err(bad);}
  ids.push(id.clone());
  result.push(ddv_save_patch::GridMixedEdit{target:GridCoordinateTarget{kind:GridObjectKind::Full,grid_id:gid.clone(),object_id:id.clone(),item_id:item},expected:before,position:(before!=after).then_some(after),orientation:(old!=new).then(||(old.to_owned(),new.to_owned()))});
 }
 if swap&&(result[0].position!=Some(result[1].expected)||result[1].position!=Some(result[0].expected)){return Err(bad);}
 if grid_identity_dependencies_for_ids(profile,&gid,&ids)?.blocking()>0{return Err(bad);}
 ddv_save_patch::preview_existing_grid_mixed_batch(std::str::from_utf8(profile).map_err(|_|bad)?,&result).map_err(|_|CodecError::Patch)
}
/// Test-only parent transform. Child grids and the exact State remain unchanged.
pub(super) fn support_parent_move_candidate(profile:&[u8],ordinal:usize,item:u64,expected:(i32,i32),replacement:(i32,i32),witness:&Value,turn:Option<(&str,&str)>,source_witness:Option<&Value>)->Result<ddv_save_patch::GridCoordinateDraft,CodecError>{
 support_parent_operation(profile,ordinal,item,expected,replacement,witness,turn,source_witness,false,None,false)
}
pub(super) fn support_parent_duplicate_candidate(profile:&[u8],ordinal:usize,item:u64,expected:(i32,i32),replacement:(i32,i32),witness:&Value,turn:Option<(&str,&str)>,source_witness:Option<&Value>)->Result<ddv_save_patch::GridCoordinateDraft,CodecError>{
 support_parent_operation(profile,ordinal,item,expected,replacement,witness,turn,source_witness,true,None,false)
}
pub(super) fn checked_support_scene(item:u64,scene:&Value)->Result<&Value,CodecError>{
 let m=scene.as_object().filter(|m|m.len()==4&&m.get("schema").and_then(Value::as_str)==Some("wand.preset.support-scene@1")&&m.get("gameVersion").and_then(Value::as_str)==Some("1.26.2")&&m.get("ownerItemId").and_then(Value::as_u64)==Some(item)).ok_or(CodecError::Json)?;
 let tree=m.get("tree").ok_or(CodecError::Json)?;
 static CATALOG:std::sync::OnceLock<Result<Value,()>>=std::sync::OnceLock::new();
 let catalog=CATALOG.get_or_init(||serde_json::from_str(include_str!("../../../static/ddv/world/steam-1.26.2/support-terrain.json")).map_err(|_|())).as_ref().map_err(|_|CodecError::Json)?;
 fn check(tree:&Value,catalog:&Value,count:&mut usize,depth:usize)->Result<(),CodecError>{
  let bad=CodecError::Json;if depth>8{return Err(bad);}
  let factor=tree.get("factor").and_then(Value::as_u64).filter(|n|matches!(n,1|2)).ok_or(bad)? as usize;
  let path=tree.get("sourcePath").and_then(Value::as_str).ok_or(bad)?;
  let entry=catalog.get("grids").and_then(Value::as_array).and_then(|a|a.iter().find(|v|v.get(0).and_then(Value::as_str)==Some(path))).ok_or(bad)?;
  let sx=entry[1].as_u64().filter(|n|*n>0&&*n<=256).ok_or(bad)? as usize;let sy=entry[2].as_u64().filter(|n|*n>0&&*n<=256).ok_or(bad)? as usize;
  let cells=entry[4].as_array().filter(|a|a.len()==sx*sy).ok_or(bad)?;
  for o in tree.get("objects").and_then(Value::as_array).ok_or(bad)?{
   *count+=1;if *count>32{return Err(bad);}
   let x=o.get("x").and_then(Value::as_u64).and_then(|n|usize::try_from(n).ok()).ok_or(bad)?;
   let y=o.get("y").and_then(Value::as_u64).and_then(|n|usize::try_from(n).ok()).ok_or(bad)?;
   if x>=sx*factor||y>=sy*factor||cells[y/factor*sx+x/factor].as_u64().is_none_or(|n|n==0){return Err(bad);}
   let child=o.get("child").ok_or(bad)?;if !child.is_null(){check(child,catalog,count,depth+1)?;}
  }Ok(())
 }
 check(tree,catalog,&mut 1,0)?;
 Ok(tree)
}
pub(super) fn support_parent_scene_candidate(profile:&[u8],ordinal:usize,item:u64,expected:(i32,i32),replacement:(i32,i32),witness:&Value,turn:Option<(&str,&str)>,source_witness:Option<&Value>,scene:&Value)->Result<ddv_save_patch::GridCoordinateDraft,CodecError>{
 let tree=checked_support_scene(item,scene)?;
 support_parent_operation(profile,ordinal,item,expected,replacement,witness,turn,source_witness,true,Some(tree),false)
}
pub(super) fn support_scene_place_candidate(profile:&[u8],item:u64,xy:(i32,i32),witness:&Value,orientation:&str,scene:&Value)->Result<ddv_save_patch::GridCoordinateDraft,CodecError>{
 let bad=CodecError::Json;
 let tree=checked_support_scene(item,scene)?;
 let root:Value=serde_json::from_slice(profile).map_err(|_|bad)?;
 if root.get("GameInfo").and_then(|v|v.get("Version")).and_then(Value::as_u64)!=Some(643){return Err(bad);}
 let (scan,_)=scan_grid_instances(profile)?;
 if scan.sampled||scan.invalid>0{return Err(bad);}
 let dest=resolve_plain_grid_destination(profile,witness)?;
 let scope=dest.layout_path.strip_prefix("SceneLayouts/").and_then(|s|s.split('/').next()).ok_or(bad)?;
 if !matches!(scope,"Village04"|"VillageExpansion01"|"VillageExpansion02"|"VillageExpansion03"|"VillageExpansion04"|"VillageWinnieDLC"){island_scope(witness)?;}
 let c=root.get("World").and_then(|v|v.get("GridCollection")).and_then(Value::as_object).ok_or(bad)?;
 let next=c.get("Grids").and_then(|g|g.get(&dest.grid_id)).and_then(|g|g.get("NextGridObjectID")).and_then(Value::as_u64).ok_or(bad)?.to_string();
 let refs=grid_identity_dependencies_for_ids(profile,&dest.grid_id,&[next.clone()])?;
 if refs.blocking()>0||refs.historical>0{return Err(bad);}
 let d=ddv_save_patch::support_clone::preview_support_scene_place(std::str::from_utf8(profile).map_err(|_|bad)?,item,&dest,xy,orientation,tree).map_err(|_|CodecError::Patch)?;
 let parsed:Value=serde_json::from_str(&d.patched_json).map_err(|_|bad)?;
 let after=parsed.get("World").and_then(|v|v.get("GridCollection")).and_then(Value::as_object).ok_or(bad)?;
 if &subgrid_tree(after,&dest.grid_id,&next)?!=tree||!d.changed||!d.untouched_bytes_preserved||d.export_authorized||d.writer_authorized{return Err(bad);}
 Ok(d)
}
pub(super) fn free_support_parent_candidate(profile:&[u8],ordinal:usize,item:u64,expected:(i32,i32),replacement:(i32,i32),witness:&Value,turn:Option<(&str,&str)>,source_witness:Option<&Value>,duplicate:bool,scene:Option<&Value>)->Result<ddv_save_patch::GridCoordinateDraft,CodecError>{
 let tree=scene.map(|s|checked_support_scene(item,s)).transpose()?;
 if tree.is_some()&&!duplicate{return Err(CodecError::Json);}
 support_parent_operation(profile,ordinal,item,expected,replacement,witness,turn,source_witness,duplicate,tree,true)
}
fn support_parent_operation(profile:&[u8],ordinal:usize,item:u64,expected:(i32,i32),replacement:(i32,i32),witness:&Value,turn:Option<(&str,&str)>,source_witness:Option<&Value>,duplicate:bool,scene:Option<&Value>,free:bool)->Result<ddv_save_patch::GridCoordinateDraft,CodecError>{
 let bad=CodecError::Json;
 if ordinal==0||item/100_000!=400||expected==replacement&&turn.is_none()&&source_witness.is_none()&&!(free&&duplicate){return Err(bad);}
 let root:Value=serde_json::from_slice(profile).map_err(|_|bad)?;
 if root.get("GameInfo").and_then(|v|v.get("Version")).and_then(Value::as_u64)!=Some(643){return Err(bad);}
 let (scan,_)=scan_grid_instances(profile)?;
 if scan.sampled||scan.invalid>0{return Err(bad);}
 let (target,xy)=scan.private_targets.get(ordinal-1).ok_or(bad)?;
 if target.kind!=GridObjectKind::Full||target.item_id!=item||*xy!=Some(expected)||!scan.subgrid_parents.contains(&ordinal){return Err(bad);}
 let c=root.get("World").and_then(|v|v.get("GridCollection")).and_then(Value::as_object).ok_or(bad)?;
 let dest=resolve_plain_grid_destination(profile,witness)?;
 let cross=dest.grid_id!=target.grid_id;
 let source=if cross{let src=resolve_plain_grid_destination(profile,source_witness.ok_or(bad)?)?;if src.grid_id!=target.grid_id||src.tessellation!=dest.tessellation{return Err(bad);}src}else{if source_witness.is_some(){return Err(bad);}dest.clone()};
 let valid=|d:&ddv_save_patch::PlainGridDestination,(x,y):(i32,i32)|x>=0&&y>=0&&(x as u32)<d.size.0*d.tessellation&&(y as u32)<d.size.1*d.tessellation;
 if !valid(&source,expected)||!valid(&dest,replacement){return Err(bad);}
 if free{
  let identity=|d:&ddv_save_patch::PlainGridDestination|->Result<String,CodecError>{let (scope,layout,factor,sx,sy)=house_exterior_identity(&root,&d.grid_id)?;if layout!=d.layout_path||factor!=u64::from(d.tessellation)||sx!=u64::from(d.size.0)||sy!=u64::from(d.size.1){return Err(bad);}Ok(scope)};
  if identity(&source)?!=identity(&dest)?{return Err(bad);}
 }
 let obj=c.get("Grids").and_then(|g|g.get(&target.grid_id)).and_then(|g|g.get("Objects")).and_then(|o|o.get(&target.object_id)).ok_or(bad)?;
 if obj.get("ID").and_then(Value::as_u64)!=key_id(&target.object_id)||obj.as_object().is_none_or(|o|o.keys().any(|k|!matches!(k.as_str(),"ID"|"ItemID"|"X"|"Y"|"Orientation"|"State")))||
    obj.get("State").and_then(Value::as_object).is_none_or(|s|s.len()!=1||!s.contains_key("SubGrid"))||
    obj.get("Orientation").and_then(Value::as_str).is_none_or(|o|!ddv_save_patch::OBSERVED_CARDINAL_ORIENTATIONS.contains(&o)){return Err(bad);}
 let tree=subgrid_tree(c,&target.grid_id,&target.object_id)?;
 let refs=grid_identity_dependencies(profile,target)?;
 if refs.blocking()>0||cross&&refs.historical>0{return Err(bad);}
 let old=obj.get("Orientation").and_then(Value::as_str).ok_or(bad)?;
 let new=if let Some((before,after))=turn{if before!=old||before==after||!ddv_save_patch::OBSERVED_CARDINAL_ORIENTATIONS.contains(&after){return Err(bad);}after}else{old};
 let json=std::str::from_utf8(profile).map_err(|_|bad)?;
 let draft=if duplicate{
  // The source tree must already exist in the same outdoor world. New
  // IDs are derived only from the local Save allocator, never Scene input.
  let scope=|s:&str|s.strip_prefix("SceneLayouts/").and_then(|s|s.split('/').next()).map(str::to_owned);
  if scope(&source.layout_path).is_none()||scope(&source.layout_path)!=scope(&dest.layout_path){return Err(bad);}
  let next=c.get("Grids").and_then(|g|g.get(&dest.grid_id)).and_then(|g|g.get("NextGridObjectID")).and_then(Value::as_u64).ok_or(bad)?.to_string();
  let refs=grid_identity_dependencies_for_ids(profile,&dest.grid_id,&[next.clone()])?;
  if refs.blocking()>0||refs.historical>0{return Err(bad);}
  let d=if free{ddv_save_patch::support_clone::preview_free_outdoor_support_duplicate(json,target,expected,&dest,replacement,new,scene)}else if let Some(scene)=scene{ddv_save_patch::support_clone::preview_support_scene_duplicate(json,target,expected,&dest,replacement,new,scene)}else{ddv_save_patch::support_clone::preview_support_tree_duplicate(json,target,expected,&dest,replacement,new)}.map_err(|_|CodecError::Patch)?;
  let parsed:Value=serde_json::from_str(&d.patched_json).map_err(|_|bad)?;
  let next_collection=parsed.get("World").and_then(|v|v.get("GridCollection")).and_then(Value::as_object).ok_or(bad)?;
  if &subgrid_tree(next_collection,&dest.grid_id,&next)?!=scene.unwrap_or(&tree)||subgrid_tree(next_collection,&target.grid_id,&target.object_id)?!=tree{return Err(bad);}
  d
 }else if cross{
  let next=c.get("Grids").and_then(|g|g.get(&dest.grid_id)).and_then(|g|g.get("NextGridObjectID")).and_then(Value::as_u64).ok_or(bad)?.to_string();
  let refs=grid_identity_dependencies_for_ids(profile,&dest.grid_id,&[next.clone()])?;
  if refs.blocking()>0||refs.historical>0{return Err(bad);}
  let d=if free{ddv_save_patch::preview_free_support_parent_grid_transfer(json,target,expected,&dest,replacement,new)}else{ddv_save_patch::preview_support_parent_grid_transfer(json,target,expected,&dest,replacement,new)}.map_err(|_|CodecError::Patch)?;
  let parsed:Value=serde_json::from_str(&d.patched_json).map_err(|_|bad)?;
  let next_collection=parsed.get("World").and_then(|v|v.get("GridCollection")).and_then(Value::as_object).ok_or(bad)?;
  if subgrid_tree(next_collection,&dest.grid_id,&next)?!=tree{return Err(bad);}
  d
 }else{ddv_save_patch::preview_existing_grid_mixed_batch(json,&[ddv_save_patch::GridMixedEdit{target:target.clone(),expected,position:(expected!=replacement).then_some(replacement),orientation:turn.map(|(a,b)|(a.to_owned(),b.to_owned()))}]).map_err(|_|CodecError::Patch)?};
 if !draft.changed||!draft.untouched_bytes_preserved||draft.export_authorized||draft.writer_authorized{return Err(bad);}
 Ok(draft)
}
fn saved_db04_source_projection(
    profile:&[u8],witness:&str,terrain_session:bool
)->Result<String,CodecError>{
    if witness.is_empty()||witness.len()>16*1024*1024{
        return Err(CodecError::Bounds);
    }
    let verified:Value=serde_json::from_str(witness).map_err(|_|CodecError::Json)?;
    let contract=verified.as_object().ok_or(CodecError::Json)?;
    if contract.len()!=2||
       contract.get("contract").and_then(Value::as_str)
           !=Some("wand.db05.db04-object-source-witness@1"){
        return Err(CodecError::Json);
    }
    let refs=contract.get("gridRefs").and_then(Value::as_array)
        .ok_or(CodecError::Json)?;
    if refs.len()>20000{return Err(CodecError::Bounds);}
    #[derive(Clone)]
    struct SourceRef{
        layout:String,
        data:String,
        native_id:u32,
        size:Option<(u32,u32)>,
        tessellation:Option<u32>
    }
    let valid_path=|p:&str,prefix:&str|{
        p.len()>prefix.len()+5&&p.len()<=512&&
        p.starts_with(prefix)&&p.ends_with(".json")&&
        !p.contains("..")&&!p.contains('\\')&&
        !p.chars().any(char::is_control)
    };
    let mut sources=Vec::<SourceRef>::with_capacity(refs.len());
    let mut ids=HashSet::new();
    for value in refs{
        let row=value.as_object().ok_or(CodecError::Json)?;
        if row.len()!=6||![
            "layoutId","gridDataPath","nativeGridId",
            "nativeSizeX","nativeSizeY","tessellationFactor"
        ].iter().all(|key|row.contains_key(*key)){
            return Err(CodecError::Json);
        }
        let layout=row.get("layoutId").and_then(Value::as_str)
            .ok_or(CodecError::Json)?;
        let data=row.get("gridDataPath").and_then(Value::as_str)
            .ok_or(CodecError::Json)?;
        let native_id=row.get("nativeGridId").and_then(Value::as_u64)
            .and_then(|n|u32::try_from(n).ok()).ok_or(CodecError::Json)?;
        if !valid_path(layout,"SceneLayouts/")||
           !valid_path(data,"GridData/")||
           !ids.insert((layout.to_owned(),native_id)){
            return Err(CodecError::Json);
        }
        let bounds=|key:&str,max:u32|->Result<Option<u32>,CodecError>{
            match row.get(key){
                Some(Value::Null)=>Ok(None),
                Some(v)=>v.as_u64()
                    .and_then(|n|u32::try_from(n).ok())
                    .filter(|n|*n>0&&*n<=max)
                    .map(Some).ok_or(CodecError::Json),
                None=>Err(CodecError::Json)
            }
        };
        let x=bounds("nativeSizeX",65536)?;
        let y=bounds("nativeSizeY",65536)?;
        if x.is_some()!=y.is_some()||
           x.zip(y).is_some_and(|(sx,sy)|u64::from(sx)*u64::from(sy)>16_777_216){
            return Err(CodecError::Json);
        }
        let tessellation=match row.get("tessellationFactor"){
            Some(Value::Null)=>None,
            Some(v)=>Some(v.as_u64()
                .and_then(|n|u32::try_from(n).ok())
                .filter(|n|*n<=256).ok_or(CodecError::Json)?),
            None=>return Err(CodecError::Json)
        };
        sources.push(SourceRef{
            layout:layout.to_owned(),data:data.to_owned(),native_id,
            size:x.zip(y),tessellation
        });
    }
    let (scan,_)=scan_grid_instances(profile)?;
    if scan.sampled||scan.invalid>0{return Err(CodecError::Json);}
    let root:Value=serde_json::from_slice(profile).map_err(|_|CodecError::Json)?;
    let collection=root.get("World").and_then(|v|v.get("GridCollection"))
        .and_then(Value::as_object);
    let mut out=Vec::with_capacity(scan.private_targets.len());
    let mut bindings=Vec::new();
    let mut by_pair=HashMap::<(&str,&str),Vec<usize>>::new();
    let mut by_native=HashMap::<(&str,u32),Vec<usize>>::new();
    for (i,r) in sources.iter().enumerate(){
        by_pair.entry((&r.layout,&r.data)).or_default().push(i);
        by_native.entry((&r.layout,r.native_id)).or_default().push(i);
    }
    // Index Grid identities once. Preserve the original blank path, and
    // require the source witness to agree with the embedded native catalog.
    let mut recovered=HashMap::<String,(String,u64,u64,u64)>::new();
    let mut data_counts=HashMap::<&str,usize>::new();
    let mut pair_counts=HashMap::<(&str,&str),usize>::new();
    let mut blank_paths=HashSet::<&str>::new();
    if terrain_session{
        if let Some(grids)=collection.and_then(|c|c.get("Grids")).and_then(Value::as_object){
            for g in grids.values(){
                if let Some(data)=g["GridDataPath"].as_str(){
                    *data_counts.entry(data).or_default()+=1;
                    if let Some(layout)=g["GridDefaultLayoutPath"].as_str(){
                        *pair_counts.entry((layout,data)).or_default()+=1;
                        if layout.is_empty(){blank_paths.insert(data);}
                    }
                }
            }
            for (id,g) in grids{
                if g["GridDefaultLayoutPath"].as_str()!=Some("")||g["ID"].as_u64()!=key_id(id)||
                   g["GridDataPath"].as_str().and_then(|p|data_counts.get(p).copied())!=Some(1)||
                   collection.and_then(|c|c.get("DiffGrids")).is_some_and(|v|v.as_object().is_none_or(|m|m.contains_key(id))){continue;}
                if let Ok((_,layout,factor,sx,sy))=outdoor_catalog_identity(g){
                    recovered.insert(id.clone(),(layout,factor,sx,sy));
                }
            }
        }
    }
    let agrees=|id:&str,source:&SourceRef|{
        recovered.get(id).is_none_or(|(_,f,x,y)|{
            source.tessellation.map(u64::from)==Some(*f)&&
            source.size.map(|(a,b)|(u64::from(a),u64::from(b)))==Some((*x,*y))
        })
    };
    for (i,(target,xy)) in scan.private_targets.iter().enumerate(){
        let scope=match target.kind{
            GridObjectKind::Full=>"Grids",
            GridObjectKind::DiffModified=>"DiffGrids"
        };
        let grid=collection.and_then(|c|c.get(scope))
            .and_then(|v|v.get(&target.grid_id))
            .and_then(Value::as_object);
        let layout=grid.and_then(|g|g.get("GridDefaultLayoutPath"))
            .and_then(Value::as_str);
        let layout=if target.kind==GridObjectKind::Full&&layout==Some(""){recovered.get(&target.grid_id).map(|r|r.0.as_str())}else{layout};
        let data=grid.and_then(|g|g.get("GridDataPath"))
            .and_then(Value::as_str);
        let diff_id=grid.and_then(|g|g.get("DefaultLayoutGridID"))
            .and_then(Value::as_u64)
            .and_then(|n|u32::try_from(n).ok());
        let diff_type=grid.and_then(|g|g.get("GridDefaultLayoutType"))
            .and_then(Value::as_str);
        let hash=|name:&str|->bool{
            grid.and_then(|g|g.get(name)).and_then(Value::as_i64)
                .is_some_and(|v|v>=i32::MIN as i64&&v<=i32::MAX as i64)
        };
        let metadata_valid=match target.kind{
            GridObjectKind::Full=>
                layout.is_some_and(|v|valid_path(v,"SceneLayouts/"))&&
                data.is_some_and(|v|valid_path(v,"GridData/")),
            GridObjectKind::DiffModified=>
                layout.is_some_and(|v|valid_path(v,"SceneLayouts/"))&&
                diff_id.is_some()&&
                diff_type.is_some_and(|v|matches!(v,
                    "Meta.GridCollection, Meta"|
                    "Meta.DefaultRealmData, Meta"|
                    "Meta.DefaultOffGridBuildingData, Meta"))&&
                hash("DefaultGridHashCode")&&hash("DefaultGridDataHashCode")
        };
        let matches=if metadata_valid{
            match target.kind{
                GridObjectKind::Full=>layout.zip(data).and_then(|k|by_pair.get(&k)),
                GridObjectKind::DiffModified=>layout.zip(diff_id).and_then(|k|by_native.get(&k))
            }.map(Vec::as_slice).unwrap_or(&[])
        }else{&[]};
        let status=if !metadata_valid{
            "saved_grid_source_unavailable"
        }else if matches.is_empty(){
            "not_in_partial_source"
        }else if matches.len()>1{
            "ambiguous_source_candidates"
        }else if matches!(target.kind,GridObjectKind::DiffModified){
            "diff_structural_candidate_hash_unverified"
        }else{
            "full_exact_source_path_candidate"
        };
        let unique=if matches.len()==1{Some(&sources[matches[0]])}else{None};
        let dimensions=unique.and_then(|r|r.size);
        if terrain_session{
            // Only FULL grids with a unique exact path pair and matching
            // factor are eligible for source-local terrain projection.
            // Diff records do not imply reconstructed effective placement.
            if status=="full_exact_source_path_candidate"{
                if let Some(source)=unique{
                    let witness_index=matches[0];
                    let factor=match grid.and_then(|g|g.get("TessellationFactor")){
                        None=>Some(1u32), // native constructor default
                        Some(v)=>v.as_u64().and_then(|v|u32::try_from(v).ok())
                    };
                    let unambiguous_blank=data.is_none_or(|p|!blank_paths.contains(p)||data_counts.get(p).copied()==Some(1));
                    let aligned=matches!(factor,Some(1|2))&&factor==source.tessellation&&source.size.is_some()&&agrees(&target.grid_id,source)&&unambiguous_blank;
                    let object=grid.and_then(|g|g.get("Objects")).and_then(|o|o.get(&target.object_id));
                    let storage_known=crate::storage_source::is_storage(target.item_id)||object.is_some_and(|o|o.get("State").and_then(|s|s.get("Storage")).is_some());
                    let storage_pose=aligned&&target.item_id/100_000==400&&object.is_some_and(|o|o["ID"].as_u64()==key_id(&target.object_id)&&o.as_object().is_some_and(|m|m.keys().all(|k|matches!(k.as_str(),"ID"|"ItemID"|"X"|"Y"|"Orientation"|"State")))&&ddv_save_patch::OBSERVED_CARDINAL_ORIENTATIONS.contains(&o["Orientation"].as_str().unwrap_or(""))&&ddv_save_patch::storage_pose(&root,o));
                    bindings.push(serde_json::json!({
                        "localOrdinal":i+1,
                        "sourceRefIndex":witness_index,
                        "savedFactor":factor,
                        "sourceLocalCoordinateMappingVerified":aligned,
                        "subgrid":local_subgrid_summary(collection,grid,&target.object_id,&target.grid_id),
                        "storage":storage_pose,
                        "storageKnown":storage_known,
                        "storageEmpty":storage_pose&&object.is_some_and(|o|ddv_save_patch::storage_pickup_eligible(&root,o)),
                        "storageRestorable":storage_pose&&object.is_some_and(|o|crate::storage_source::restorable_empty_storage(&root,o,target.item_id))
                    }));
                }
            }
            continue;
        }
        // This does NOT assert that Save coordinates equal native source
        // anchor coordinates. A point can numerically fall within/outside
        // a source envelope even when the coordinate spaces are unrelated.
        // Steam 1.26.2 source anchor-domain evidence has established only
        // factor=2 and only the original initial-anchor integer envelope.
        // DiffGrid hashes/identity remain unverified even if unique.
        let source_anchor_envelope=if
            status=="full_exact_source_path_candidate"&&
            unique.is_some_and(|r|r.tessellation==Some(2))&&
            xy.is_some(){
                dimensions.map(|(sx,sy)|(
                    u64::from(sx)*2,u64::from(sy)*2
                ))
            }else{None};
        let numeric_relation=match (source_anchor_envelope,xy){
            (Some((sx,sy)),Some((x,y))) if *x>=0&&*y>=0&&
                (*x as u64)<sx&&(*y as u64)<sy=>
                "within_source_anchor_numeric_envelope",
            (Some(_),Some(_))=>"outside_source_anchor_numeric_envelope",
            _=>"not_comparable"
        };
        out.push(serde_json::json!({
            "localOrdinal":i+1,
            "sourceStatus":status,
            "candidateCount":matches.len(),
            "nativeSizeX":dimensions.map(|p|p.0),
            "nativeSizeY":dimensions.map(|p|p.1),
            "tessellationFactor":unique.and_then(|r|r.tessellation),
            "sourceAnchorEnvelopeWidth":source_anchor_envelope.map(|p|p.0),
            "sourceAnchorEnvelopeHeight":source_anchor_envelope.map(|p|p.1),
            "savedPositionNumericRelation":numeric_relation
        }));
    }
    if terrain_session{
        // A complete native grid witness is independent of object rows.
        // Empty existing grids must be distinguished from absent/locked grids.
        let mut grid_bindings=Vec::new();
        let mut row_counts=HashMap::<u64,usize>::new();
        for row in &scan.rows{
            if let Some(ordinal)=row.get("localGridOrdinal").and_then(Value::as_u64){
                *row_counts.entry(ordinal).or_default()+=1;
            }
        }
        if let Some(grids)=collection.and_then(|c|c.get("Grids")).and_then(Value::as_object){
            for (i,(key,grid)) in grids.iter().enumerate(){
                let Some(objects)=grid.get("Objects").and_then(Value::as_object) else{continue;};
                let raw_layout=grid.get("GridDefaultLayoutPath").and_then(Value::as_str);
                let layout=if raw_layout==Some(""){recovered.get(key).map(|r|r.0.as_str())}else{raw_layout};
                let data=grid.get("GridDataPath").and_then(Value::as_str);
                let factor=grid.get("TessellationFactor").map_or(Some(1),Value::as_u64);
                if grid.get("ID").and_then(Value::as_u64)!=key_id(key)||
                   collection.and_then(|c|c.get("DiffGrids")).is_some_and(|d|d.as_object().is_none_or(|m|m.contains_key(key)))||
                   data.is_none_or(|d|if blank_paths.contains(d){data_counts.get(d).copied()!=Some(1)}else{raw_layout.and_then(|l|pair_counts.get(&(l,d)).copied())!=Some(1)}){continue;}
                let Some(matches)=layout.zip(data).and_then(|k|by_pair.get(&k)) else{continue;};
                if matches.len()!=1{continue;}
                let source_index=matches[0];let source=&sources[source_index];
                if !matches!(factor,Some(1|2))||factor!=source.tessellation.map(u64::from)||source.size.is_none()||!agrees(key,source){continue;}
                let ordinal=i+1;
                let projected=row_counts.get(&(ordinal as u64)).copied().unwrap_or(0);
                if projected!=objects.len(){continue;}
                grid_bindings.push(serde_json::json!({"sourceRefIndex":source_index,"localGridOrdinal":ordinal,"objectCount":objects.len()}));
            }
        }
        return serde_json::to_string(&serde_json::json!({
            "contract":"wand.db05.db04-terrain-session@1",
            "rows":scan.rows,
            "bindings":bindings,
            "gridBindings":grid_bindings,
            "sourceCoverageComplete":false,
            "effectivePlacementVerified":false,
            "worldCoordinatesVerified":false,
            "placementLegalityVerified":false,
            "saveWritingAuthorized":false
        })).map_err(|_|CodecError::Json);
    }
    serde_json::to_string(&serde_json::json!({
        "contract":"wand.db05.db04-grid-object-source-context@2",
        "rows":out,
        "savedSourceCoordinateEquivalenceVerified":false,
        "sourceCoverageComplete":false,
        "sourceArchiveRechecked":false,
        "savedGridIdentityVerified":false,
        "worldCoordinateTransformVerified":false,
        "placementLegalityVerified":false,
        "editPermissionAuthorized":false
    })).map_err(|_|CodecError::Json)
}

/// All group ordinals resolve against the same immutable original. Only
/// ordinary leaf furniture with exact poses and existing stock routes can
/// be removed. A failed member discards the entire candidate.
pub(super) fn landscape_candidate(profile:&[u8],plan:&str,destination:&str)->Result<String,CodecError>{
    use ddv_save_patch::{PlainGridStructureAction,preview_plain_grid_structure,preview_landscape_duplicate_with_mode,preview_landscape_place_with_mode};
    let bad=CodecError::Json;
    if plan.len()>4096||destination.len()>4096{return Err(bad);}
    let root:Value=serde_json::from_slice(profile).map_err(|_|bad)?;
    if root.get("GameInfo").and_then(|v|v.get("Version")).and_then(Value::as_u64)!=Some(643){return Err(bad);}
    let value:Value=serde_json::from_str(plan).map_err(|_|bad)?;
    let free=match value.get("freePlacement"){None=>false,Some(Value::Bool(true))=>true,_=>return Err(bad)};
    if value.get("action").and_then(Value::as_str)==Some("place"){
        let o=value.as_object().filter(|o|o.len()==5+(free as usize)&&o.keys().all(|k|matches!(k.as_str(),"action"|"itemId"|"x"|"y"|"orientation"|"freePlacement"))).ok_or(bad)?;
        let item=o.get("itemId").and_then(Value::as_str).and_then(|s|s.parse::<u64>().ok().filter(|n|n.to_string()==s&&n/100_000==402)).ok_or(bad)?;
        let int=|k:&str|o.get(k).and_then(Value::as_i64).and_then(|n|i32::try_from(n).ok()).ok_or(bad);
        let orientation=o.get("orientation").and_then(Value::as_str).filter(|s|ddv_save_patch::OBSERVED_CARDINAL_ORIENTATIONS.contains(s)).ok_or(bad)?;
        let witness:Value=serde_json::from_str(destination).map_err(|_|bad)?;
        let dest=landscape_destination(profile,&witness)?;
        let draft=preview_landscape_place_with_mode(std::str::from_utf8(profile).map_err(|_|bad)?,&dest,item,(int("x")?,int("y")?),orientation,free).map_err(|_|bad)?;
        if !draft.changed||!draft.untouched_bytes_preserved||draft.writer_authorized||draft.export_authorized{return Err(bad);}
        return Ok(draft.patched_json);
    }
    let o=value.as_object().filter(|o|o.len()==7+(free as usize)&&o.keys().all(|k|matches!(k.as_str(),"action"|"itemId"|"localOrdinal"|"expectedX"|"expectedY"|"x"|"y"|"freePlacement"))).ok_or(bad)?;
    let item=o.get("itemId").and_then(Value::as_str).and_then(|s|s.parse::<u64>().ok().filter(|n|n.to_string()==s&&n/100_000==402)).ok_or(bad)?;
    let ordinal=o.get("localOrdinal").and_then(Value::as_u64).and_then(|n|usize::try_from(n).ok()).ok_or(bad)?;
    let int=|k:&str|o.get(k).and_then(Value::as_i64).and_then(|n|i32::try_from(n).ok()).ok_or(bad);
    let expected=(int("expectedX")?,int("expectedY")?);
    let target=resolve_grid_mixed_targets(profile,&[(ordinal,item,expected,"full".to_owned(),None)])?.pop().ok_or(bad)?;
    let refs=grid_identity_dependencies(profile,&target)?;
    if refs.blocking()>0||refs.historical>0{return Err(bad);}
    let grid=root.get("World").and_then(|v|v.get("GridCollection")).and_then(|v|v.get("Grids")).and_then(|v|v.get(&target.grid_id)).ok_or(bad)?;
    let layout=grid.get("GridDefaultLayoutPath").and_then(Value::as_str).ok_or(bad)?;
    let recovered;
    let scope=if layout.is_empty(){recovered=player_house_grid_scope(&root,&target.grid_id)?;recovered.as_str()}else{layout.strip_prefix("SceneLayouts/").and_then(|s|s.split_once('/')).map(|(s,_)|s).ok_or(bad)?};
    if !matches!(scope,"Village04"|"VillageExpansion01"|"VillageExpansion02"|"VillageExpansion03"|"VillageExpansion04"|"VillageWinnieDLC")||!grid.get("GridDataPath").and_then(Value::as_str).is_some_and(|s|s.starts_with("GridData/Villages/")&&s.ends_with(".json")&&!s.contains("..")){return Err(bad);}
    let json=std::str::from_utf8(profile).map_err(|_|bad)?;
    let draft=match o.get("action").and_then(Value::as_str){
        Some("remove") if !free&&o.get("x").is_some_and(Value::is_null)&&o.get("y").is_some_and(Value::is_null)&&destination=="null"=>preview_plain_grid_structure(json,&target,expected,PlainGridStructureAction::Remove),
        Some("duplicate")=>{
            let witness:Value=serde_json::from_str(destination).map_err(|_|bad)?;
            let dest=if free{landscape_destination(profile,&witness)?}else{resolve_plain_grid_destination(profile,&witness)?};
            if free{let (sx,sy)=building_transform_grid_size(&root,&target.grid_id)?;if expected.0<0||expected.1<0||expected.0 as u64>=sx||expected.1 as u64>=sy{return Err(bad);}}
            let orientation=grid.get("Objects").and_then(|v|v.get(&target.object_id)).and_then(|v|v.get("Orientation")).and_then(Value::as_str).ok_or(bad)?;
            preview_landscape_duplicate_with_mode(json,&target,expected,&dest,(int("x")?,int("y")?),orientation,free)
        },
        _=>return Err(bad)
    }.map_err(|_|bad)?;
    if !draft.changed||!draft.untouched_bytes_preserved||draft.writer_authorized||draft.export_authorized{return Err(bad);}
    Ok(draft.patched_json)
}

pub(super) fn group_pickup_candidate(profile:&[u8],plan:&str)->Result<String,CodecError>{
    let rows:Value=serde_json::from_str(plan).map_err(|_|CodecError::Json)?;
    let single=rows.as_array().is_some_and(|a|a.len()==1&&a[0].get("includeSupport").and_then(Value::as_bool)==Some(true));
    let selection=rows.as_array().filter(|a|!a.is_empty()&&a.len()<=ddv_save_patch::MAX_GRID_MIXED_EDITS).ok_or(CodecError::Bounds)?;
    if selection.iter().any(|r|r.get("itemId").and_then(Value::as_str).and_then(|s|s.parse::<u64>().ok()).is_some_and(|id|id/100_000!=400)){
        return mixed_grid_removal(profile,selection);
    }
    group_pickup_for_scope(profile,plan,if single{1}else{2},None)
}

/// A single atomic removal across native record contracts. Resolve every
/// selection against the immutable input before making a private candidate.
/// Furniture returns stock; stateless landscape and checked buildings use
/// their existing native removal contracts. Never reuse shifted UI ordinals.
fn mixed_grid_removal(profile:&[u8],rows:&[Value])->Result<String,CodecError>{
    use zeroize::{Zeroize,Zeroizing};
    let bad=CodecError::Json;
    if rows.len()<2||rows.len()>ddv_save_patch::MAX_GRID_MIXED_EDITS{return Err(bad);}
    let (scan,_)=scan_grid_instances(profile)?;
    if scan.sampled||scan.invalid>0{return Err(bad);}
    let mut seen=HashSet::new();
    let mut furniture=Vec::new();
    let mut other=Vec::new();
    for row in rows{
        let o=row.as_object().filter(|o|(o.len()==5||o.len()==6&&(o.get("includeSupport").and_then(Value::as_bool)==Some(true)||o.get("includeStorage").and_then(Value::as_bool)==Some(true)))&&o.keys().all(|k|matches!(k.as_str(),"localOrdinal"|"itemId"|"expectedX"|"expectedY"|"expectedOrientation"|"includeSupport"|"includeStorage"))).ok_or(bad)?;
        let ord=o.get("localOrdinal").and_then(Value::as_u64).and_then(|n|usize::try_from(n).ok()).filter(|n|*n>0&&seen.insert(*n)).ok_or(bad)?;
        let item=o.get("itemId").and_then(Value::as_str).and_then(|s|s.parse::<u64>().ok().filter(|n|n.to_string()==s)).ok_or(bad)?;
        let int=|k:&str|o.get(k).and_then(Value::as_i64).and_then(|n|i32::try_from(n).ok()).ok_or(bad);
        let xy=(int("expectedX")?,int("expectedY")?);
        let orientation=o.get("expectedOrientation").and_then(Value::as_str).filter(|s|ddv_save_patch::OBSERVED_CARDINAL_ORIENTATIONS.contains(s)).ok_or(bad)?;
        let (target,observed)=scan.private_targets.get(ord-1).ok_or(bad)?;
        if target.kind!=GridObjectKind::Full||target.item_id!=item||*observed!=Some(xy)||scan.rows.get(ord-1).and_then(|r|r.get("orientation")).and_then(Value::as_str)!=Some(orientation){return Err(bad);}
        if item/100_000==400{furniture.push(row.clone());continue;}
        if !matches!(item/100_000,200..=203|205|402)||o.len()!=5||scan.subgrid_parents.contains(&ord){return Err(bad);}
        other.push((target.clone(),xy,orientation.to_owned()));
    }
    let original=std::str::from_utf8(profile).map_err(|_|bad)?;
    let mut working=Zeroizing::new(if furniture.is_empty(){original.to_owned()}else{
        group_pickup_for_scope(profile,&serde_json::to_string(&furniture).map_err(|_|bad)?,1,None)?
    });
    for (target,xy,orientation) in other{
        // Rebind by native identity after previous removals, including any
        // removed child grids. The original ordinal is never reused.
        let (now,_)=scan_grid_instances(working.as_bytes())?;
        if now.sampled||now.invalid>0{return Err(bad);}
        let mut matches=now.private_targets.iter().enumerate().filter(|(_, (t,pos))|t.kind==target.kind&&t.grid_id==target.grid_id&&t.object_id==target.object_id&&t.item_id==target.item_id&&*pos==Some(xy));
        let (index,_)=matches.next().ok_or(bad)?;
        if matches.next().is_some()||now.rows.get(index).and_then(|r|r.get("orientation")).and_then(Value::as_str)!=Some(orientation.as_str()){return Err(bad);}
        let id=target.item_id.to_string();
        let next=match target.item_id/100_000{
            402=>landscape_candidate(working.as_bytes(),&serde_json::json!({"action":"remove","localOrdinal":index+1,"itemId":id,"expectedX":xy.0,"expectedY":xy.1,"x":null,"y":null}).to_string(),"null")?,
            205=>player_house_duplicate_candidate(working.as_bytes(),&serde_json::json!({"localOrdinal":index+1,"itemId":id,"expectedX":xy.0,"expectedY":xy.1,"orientation":orientation}),true)?,
            200..=203=>building_duplicate_candidate(working.as_bytes(),&serde_json::json!({"localOrdinal":index+1,"itemId":id,"expectedX":xy.0,"expectedY":xy.1,"orientation":orientation}),true)?,
            _=>return Err(bad)
        };
        working.zeroize();*working=next;
    }
    Ok(std::mem::take(&mut *working))
}
pub(super) fn support_pickup_references(profile:&[u8],grids:&Map<String,Value>,grid:&str,object:&str,seen:&mut HashSet<String>,total:&mut usize,depth:usize,limit:usize)->Result<(),CodecError>{
 let bad=CodecError::Json;
 if depth>8{return Err(bad);}
 let child=grids.get(grid).and_then(|g|g.get("Objects")).and_then(|o|o.get(object)).and_then(|v|v.get("State")).and_then(|v|v.get("SubGrid")).and_then(|v|v.get("GridID")).and_then(Value::as_u64).ok_or(bad)?.to_string();
 if !seen.insert(child.clone()){return Err(bad);}
 let objects=grids.get(&child).and_then(|g|g.get("Objects")).and_then(Value::as_object).ok_or(bad)?;
 let ids:Vec<_>=objects.keys().cloned().collect();
 if !ids.is_empty(){let refs=grid_identity_dependencies_for_ids(profile,&child,&ids)?;if refs.blocking()>0||refs.historical>0{return Err(bad);}}
 for (id,v) in objects{*total+=1;if *total>limit{return Err(bad);}if v.get("State").and_then(|s|s.get("SubGrid")).is_some(){support_pickup_references(profile,grids,&child,id,seen,total,depth+1,limit)?;}}
 Ok(())
}
fn group_pickup_for_scope(profile:&[u8],plan:&str,minimum:usize,scope:Option<&str>)->Result<String,CodecError>{
    group_pickup_bounded(profile,plan,minimum,scope,ddv_save_patch::MAX_GRID_MIXED_EDITS)
}
fn group_pickup_bounded(profile:&[u8],plan:&str,minimum:usize,scope:Option<&str>,limit:usize)->Result<String,CodecError>{
    use ddv_save_patch::{FurnitureStockAction,preview_furniture_stock_transaction};
    use zeroize::{Zeroize,Zeroizing};
    if plan.len()>if limit>MAX_SCENE_FURNITURE{1_000_000}else{65536}{return Err(CodecError::Bounds);}
    let root:Value=serde_json::from_slice(profile).map_err(|_|CodecError::Json)?;
    if root.get("GameInfo").and_then(|g|g.get("Version")).and_then(Value::as_u64)!=Some(643){return Err(CodecError::Json);}
    let rows:Value=serde_json::from_str(plan).map_err(|_|CodecError::Json)?;
    let rows=rows.as_array().filter(|a|a.len()>=minimum&&a.len()<=limit).ok_or(CodecError::Bounds)?;
    let mut selections=Vec::with_capacity(rows.len());
    for v in rows{
        let o=v.as_object().filter(|o|(o.len()==5||o.len()==6&&(o.get("includeSupport").and_then(Value::as_bool)==Some(true)||o.get("includeStorage").and_then(Value::as_bool)==Some(true)))&&o.keys().all(|k|matches!(k.as_str(),"localOrdinal"|"itemId"|"expectedX"|"expectedY"|"expectedOrientation"|"includeSupport"|"includeStorage"))).ok_or(CodecError::Json)?;
        let ordinal=o.get("localOrdinal").and_then(Value::as_u64).and_then(|n|usize::try_from(n).ok()).ok_or(CodecError::Json)?;
        let item=o.get("itemId").and_then(Value::as_str).and_then(|s|s.parse::<u64>().ok().filter(|n|n.to_string()==s&&n/100_000==400)).ok_or(CodecError::Json)?;
        let int=|k:&str|o.get(k).and_then(Value::as_i64).and_then(|n|i32::try_from(n).ok()).ok_or(CodecError::Json);
        let orientation=o.get("expectedOrientation").and_then(Value::as_str).filter(|s|ddv_save_patch::OBSERVED_CARDINAL_ORIENTATIONS.contains(s)||limit>ddv_save_patch::MAX_GRID_MIXED_EDITS&&o.get("includeSupport").is_none()&&o.get("includeStorage").is_none()&&ddv_save_patch::EXPERIMENTAL_EIGHT_WAY_ORIENTATIONS.contains(s)).ok_or(CodecError::Json)?;
        selections.push((ordinal,item,(int("expectedX")?,int("expectedY")?),"full".to_owned(),Some(orientation.to_owned())));
    }
    let support_flags:Vec<_>=rows.iter().map(|r|r.get("includeSupport").and_then(Value::as_bool)==Some(true)).collect();
    let storage_flags:Vec<_>=rows.iter().map(|r|r.get("includeStorage").and_then(Value::as_bool)==Some(true)).collect();
    // The ordinary resolver deliberately rejects support parents. Resolve
    // only explicitly marked support roots here, without weakening it.
    let (scan,_)=scan_grid_instances(profile)?;
    if scan.sampled||scan.invalid>0{return Err(CodecError::Json);}
    let mut selected=HashSet::new();let mut targets=Vec::new();
    for ((ordinal,item,expected,_,orientation),flag) in selections.iter().zip(&support_flags){
      if *ordinal==0||!selected.insert(*ordinal)||scan.subgrid_parents.contains(ordinal)!=*flag{return Err(CodecError::Json);}
      let (target,xy)=scan.private_targets.get(ordinal-1).ok_or(CodecError::Json)?;
      if target.kind!=GridObjectKind::Full||target.item_id!=*item||*xy!=Some(*expected)||scan.rows.get(ordinal-1).and_then(|r|r.get("orientation")).and_then(Value::as_str)!=orientation.as_deref(){return Err(CodecError::Json);}
      targets.push(target.clone());
    }
    let c=root.get("World").and_then(|v|v.get("GridCollection")).and_then(Value::as_object).ok_or(CodecError::Json)?;
    let grids=c.get("Grids").and_then(Value::as_object).ok_or(CodecError::Json)?;
    for ((target,selection),storage) in targets.iter().zip(&selections).zip(&storage_flags){
        if !storage{continue;}
        let from=house_exterior_identity(&root,&target.grid_id)?;
        let (x,y)=selection.2;
        if x<0||y<0||x as u64>=from.3*from.2||y as u64>=from.4*from.2{return Err(CodecError::Json);}
        let object=grids.get(&target.grid_id).and_then(|g|g.get("Objects")).and_then(|o|o.get(&target.object_id)).ok_or(CodecError::Json)?;
        if !ddv_save_patch::storage_pickup_eligible(&root,object)||limit==MAX_AREA_FURNITURE_CHANGES&&!crate::storage_source::restorable_empty_storage(&root,object,target.item_id){return Err(CodecError::Json);}
        let refs=grid_identity_dependencies(profile,target)?;
        if refs.blocking()>0||refs.historical>0{return Err(CodecError::Json);}
    }
    let mut tree_count=0usize;let mut child_ids=HashSet::new();
    for (target,flag) in targets.iter().zip(&support_flags){
      tree_count+=1;
      if !flag{continue;}
      let tree=subgrid_tree(c,&target.grid_id,&target.object_id)?;
      let scene=serde_json::json!({"schema":"wand.preset.support-scene@1","gameVersion":"1.26.2","ownerItemId":target.item_id,"tree":tree});
      checked_support_scene(target.item_id,&scene)?;
      support_pickup_references(profile,grids,&target.grid_id,&target.object_id,&mut child_ids,&mut tree_count,0,limit)?;
      if grid_identity_dependencies(profile,target)?.historical>0{return Err(CodecError::Json);}
    }
    let mut checked_diagonal_grids=HashSet::new();
    for (target,selection) in targets.iter().zip(&selections){
        if selection.4.as_deref().is_some_and(|s|!ddv_save_patch::OBSERVED_CARDINAL_ORIENTATIONS.contains(&s))&&checked_diagonal_grids.insert(target.grid_id.clone()){
            let grid=&root["World"]["GridCollection"]["Grids"][&target.grid_id];
            if grid.get("TessellationFactor").map_or(Some(1),Value::as_u64)!=Some(1){return Err(CodecError::Json);}
            player_house_grid_scope(&root,&target.grid_id)?;
        }
    }
    if support_flags.iter().any(|v|*v)&&tree_count>limit||targets.iter().any(|t|child_ids.contains(&t.grid_id)){return Err(CodecError::Bounds);}
    if scope.is_some_and(|id|targets.iter().any(|t|t.grid_id!=id)){return Err(CodecError::Json);}
    let mut by_grid=HashMap::<String,Vec<String>>::new();
    for t in &targets{by_grid.entry(t.grid_id.clone()).or_default().push(t.object_id.clone());}
    for (grid,ids) in by_grid{
        for chunk in ids.chunks(512){if grid_identity_dependencies_for_ids(profile,&grid,chunk)?.blocking()>0{return Err(CodecError::Json);}}
    }
    let inventory=root.get("Player").and_then(|p|p.get("ListInventories")).and_then(|m|m.get("0")).and_then(|r|r.get("Inventory")).and_then(Value::as_object).ok_or(CodecError::Json)?;
    let mut stock=HashMap::<u64,u32>::new();
    for (t,flag) in targets.iter().zip(&support_flags){
        if *flag{continue;}
        if stock.contains_key(&t.item_id){continue;}
        let amount=inventory.get(&t.item_id.to_string()).and_then(|v|v.get("Amount")).and_then(Value::as_u64).and_then(|n|u32::try_from(n).ok()).ok_or(CodecError::Json)?;
        stock.insert(t.item_id,amount);
    }
    let mut working=Zeroizing::new(std::str::from_utf8(profile).map_err(|_|CodecError::Json)?.to_owned());
    if limit>ddv_save_patch::MAX_GRID_MIXED_EDITS{
        use ddv_save_patch::bulk_furniture::{BulkPickup,preview_bulk_furniture};
        let pickups=targets.iter().zip(&selections).zip(&support_flags).zip(&storage_flags).filter_map(|(((target,selection),flag),storage)|(!*flag&&!*storage).then(||BulkPickup{target,expected:selection.2,orientation:selection.4.as_deref().unwrap_or("")})).collect::<Vec<_>>();
        if !pickups.is_empty(){
            let mut draft=preview_bulk_furniture(&working,&pickups,&[]).map_err(|_|CodecError::Patch)?;
            if !draft.changed||!draft.untouched_bytes_preserved||draft.writer_authorized||draft.export_authorized{draft.patched_json.zeroize();return Err(CodecError::Patch);}
            working.zeroize();*working=std::mem::take(&mut draft.patched_json);
        }
    }else{
    for (((target,selection),flag),storage) in targets.iter().zip(&selections).zip(&support_flags).zip(&storage_flags){
        if *flag||*storage{continue;}
        let amount=stock.get_mut(&target.item_id).ok_or(CodecError::Json)?;
        let next=amount.checked_add(1).filter(|n|*n<=i32::MAX as u32).ok_or(CodecError::Bounds)?;
        let mut draft=preview_furniture_stock_transaction(&working,*amount,FurnitureStockAction::Pickup{target,expected:selection.2}).map_err(|_|CodecError::Patch)?;
        if !draft.changed||!draft.untouched_bytes_preserved||draft.writer_authorized||draft.export_authorized{
            draft.patched_json.zeroize();return Err(CodecError::Patch);
        }
        working.zeroize();*working=draft.patched_json;*amount=next;
    }
    }
    if limit>ddv_save_patch::MAX_GRID_MIXED_EDITS{
        use ddv_save_patch::bulk_furniture::BulkPickup;
        let pickups=targets.iter().zip(&selections).zip(&support_flags).filter_map(|((target,selection),flag)|(*flag).then(||BulkPickup{target,expected:selection.2,orientation:selection.4.as_deref().unwrap_or("")})).collect::<Vec<_>>();
        if !pickups.is_empty(){
            let mut draft=ddv_save_patch::support_clone::preview_bulk_support_pickup(&working,&pickups).map_err(|_|CodecError::Patch)?;
            if !draft.changed||!draft.untouched_bytes_preserved||draft.writer_authorized||draft.export_authorized{draft.patched_json.zeroize();return Err(CodecError::Patch);}
            working.zeroize();*working=std::mem::take(&mut draft.patched_json);
        }
    }else{
    for ((target,selection),flag) in targets.iter().zip(&selections).zip(&support_flags){
        if !flag{continue;}
        let mut draft=ddv_save_patch::support_clone::preview_support_tree_pickup(&working,target,selection.2).map_err(|_|CodecError::Patch)?;
        if !draft.changed||!draft.untouched_bytes_preserved||draft.writer_authorized||draft.export_authorized{draft.patched_json.zeroize();return Err(CodecError::Patch);}
        working.zeroize();*working=std::mem::take(&mut draft.patched_json);
    }
    }
    for ((target,selection),storage) in targets.iter().zip(&selections).zip(&storage_flags){
        if !storage{continue;}
        let current:Value=serde_json::from_str(&working).map_err(|_|CodecError::Json)?;
        let amount=current["Player"]["ListInventories"]["0"]["Inventory"][target.item_id.to_string()]["Amount"].as_u64().and_then(|n|u32::try_from(n).ok()).ok_or(CodecError::Json)?;
        let mut draft=ddv_save_patch::preview_empty_storage_pickup(&working,target,selection.2,amount).map_err(|_|CodecError::Patch)?;
        if !draft.changed||!draft.untouched_bytes_preserved||draft.writer_authorized||draft.export_authorized{
            draft.patched_json.zeroize();return Err(CodecError::Patch);
        }
        working.zeroize();*working=std::mem::take(&mut draft.patched_json);
    }
    Ok(std::mem::take(&mut *working))
}

/// Place a clipboard group atomically. All destinations, new identities and
/// stock requirements resolve on the immutable source before staging.
/// Resolve network modes from exact native records; never infer a road's
/// diagonal state or a fence's base family from the rendered footprint.
pub(super) fn inspect_scene_network(profile:&[u8],plan:&str)->Result<String,CodecError>{
 let bad=CodecError::Json;
 if plan.len()>65536{return Err(CodecError::Bounds);}
 let requests:Value=serde_json::from_str(plan).map_err(|_|bad)?;
 let rows=requests.as_array().filter(|a|!a.is_empty()&&a.len()<=384).ok_or(bad)?;
 let root:Value=serde_json::from_slice(profile).map_err(|_|bad)?;
 let (scan,_)=scan_grid_instances(profile)?;
 if scan.sampled||scan.invalid>0{return Err(bad);}
 let grids=root.get("World").and_then(|v|v.get("GridCollection")).and_then(|v|v.get("Grids")).and_then(Value::as_object).ok_or(bad)?;
 let mut seen=HashSet::new();let mut output=Vec::new();
 let mut fence_groups=HashMap::<(String,u32,bool,u32),Vec<ddv_save_patch::fence_topology::FencePart>>::new();
 let mut chosen=HashSet::new();
 for row in rows{
  let o=row.as_object().filter(|o|o.len()==4).ok_or(bad)?;
  let ordinal=o.get("localOrdinal").and_then(Value::as_u64).and_then(|n|usize::try_from(n).ok()).filter(|n|*n>0&&seen.insert(*n)).ok_or(bad)?;
  let item=o.get("itemId").and_then(Value::as_u64).ok_or(bad)?;
  let int=|k:&str|o.get(k).and_then(Value::as_i64).and_then(|n|i32::try_from(n).ok()).ok_or(bad);
  let xy=(int("x")?,int("y")?);
  let (target,pos)=scan.private_targets.get(ordinal-1).ok_or(bad)?;
  if target.kind!=GridObjectKind::Full||target.item_id!=item||*pos!=Some(xy){return Err(bad);}
  let g=grids.get(&target.grid_id).ok_or(bad)?;
  let v=g.get("Objects").and_then(|v|v.get(&target.object_id)).ok_or(bad)?;
  if v.as_object().is_none_or(|o|o.keys().any(|k|!matches!(k.as_str(),"ID"|"ItemID"|"X"|"Y"|"Orientation"|"State"))){return Err(bad);}
  let diagonal=ddv_save_patch::road_mode(v).ok_or(bad)?;
  let orientation=v.get("Orientation").and_then(Value::as_str).ok_or(bad)?;
  let network=match item/100_000{
   401 if orientation=="GridOrientation_Down"=>serde_json::json!({"kind":"road","diagonal":diagonal}),
   407=>{
    let item=u32::try_from(item).map_err(|_|bad)?;
    let base=ddv_save_patch::fence_topology::family_for_part(item,diagonal).ok_or(bad)?;
    if !matches!(orientation,"GridOrientation_Down"|"GridOrientation_Left"){return Err(bad);}
    let factor=g.get("TessellationFactor").map_or(Some(1),Value::as_u64).filter(|n|matches!(n,1|2)).ok_or(bad)? as u32;
    fence_groups.entry((target.grid_id.clone(),base,diagonal,factor)).or_default().push(ddv_save_patch::fence_topology::FencePart{item,x:xy.0,y:xy.1,left:orientation=="GridOrientation_Left",diagonal});
    chosen.insert((target.grid_id.clone(),target.object_id.clone()));
    serde_json::json!({"kind":"fence","diagonal":diagonal,"base":base})
   },
   _=>return Err(bad)
  };
  output.push(serde_json::json!({"localOrdinal":ordinal,"network":network}));
 }
 // Refuse incomplete connected selections. This deliberately uses the
 // existing conservative eight-cell isolation envelope, not a guess.
 for ((grid,base,diagonal,factor),parts) in fence_groups{
  let (nodes,edges)=ddv_save_patch::fence_topology::decompile_fence(base,factor,diagonal,&parts).map_err(|_|bad)?;
  let posts=parts.iter().filter(|p|p.item==base).map(|p|(p.x,p.y)).collect();
  let actual=ddv_save_patch::fence_topology::compile_fence_with_posts(base,factor,diagonal,&nodes,&edges,&posts).map_err(|_|bad)?;
  if actual.into_iter().collect::<std::collections::BTreeSet<_>>()!=parts.iter().copied().collect(){return Err(bad);}
  for (id,v) in grids[&grid]["Objects"].as_object().ok_or(bad)?{
   if chosen.contains(&(grid.clone(),id.clone()))||v.get("ItemID").and_then(Value::as_u64).is_none_or(|n|n/100_000!=407){continue;}
   let x=v.get("X").and_then(Value::as_i64).ok_or(bad)?;let y=v.get("Y").and_then(Value::as_i64).ok_or(bad)?;
   if nodes.iter().any(|&(a,b)|x.abs_diff(i64::from(a))<=u64::from(factor)*8&&y.abs_diff(i64::from(b))<=u64::from(factor)*8){return Err(bad);}
  }
 }
 serde_json::to_string(&output).map_err(|_|bad)
}
/// Stage networks and furniture together, preserving stock semantics.
/// No intermediate candidate is returned even if a later network fails.
const MAX_SCENE_FURNITURE:usize=128;
fn area_scene_candidate(profile:&[u8],rows:&[Value])->Result<String,CodecError>{
 use ddv_save_patch::fence_topology::{FencePart,decompile_fence,compile_fence_with_posts};
 use zeroize::{Zeroize,Zeroizing};
 let bad=CodecError::Json;
 if rows.is_empty()||rows.len()>MAX_SCENE_FURNITURE+256+128{return Err(bad);}
 let root:Value=serde_json::from_slice(profile).map_err(|_|bad)?;
 if root.get("GameInfo").and_then(|g|g.get("Version")).and_then(Value::as_u64)!=Some(643){return Err(bad);}
 let mut ordinary=Vec::new();
 let mut roads=std::collections::BTreeMap::<(String,u64,bool),Vec<(i32,i32)>>::new();
 let mut fences=std::collections::BTreeMap::<(String,u32,bool),Vec<FencePart>>::new();
 let mut destinations=HashMap::new();let mut seen=HashSet::new();let mut network_count=0;
 for row in rows{
  let Some(n)=row.get("network") else{ordinary.push(row.clone());continue;};
  network_count+=1;if network_count>384{return Err(bad);}
  let o=row.as_object().filter(|o|o.len()==6&&o.keys().all(|k|matches!(k.as_str(),"network"|"itemId"|"x"|"y"|"orientation"|"destination"))).ok_or(bad)?;
  let item=o.get("itemId").and_then(Value::as_str).and_then(|s|s.parse::<u32>().ok().filter(|i|i.to_string()==s)).ok_or(bad)?;
  let int=|k:&str|o.get(k).and_then(Value::as_i64).and_then(|n|i32::try_from(n).ok()).ok_or(bad);
  let (x,y)=(int("x")?,int("y")?);
  let orientation=o.get("orientation").and_then(Value::as_str).ok_or(bad)?;
  let d=resolve_plain_grid_destination(profile,o.get("destination").ok_or(bad)?)?;
  let kind=n.get("kind").and_then(Value::as_str).ok_or(bad)?;
  let diagonal=n.get("diagonal").and_then(Value::as_bool).ok_or(bad)?;
  if !seen.insert((d.grid_id.clone(),kind.to_owned(),x,y)){return Err(bad);}
  let grid=d.grid_id.clone();destinations.insert(grid.clone(),d);
  match kind{
   "road" if item/100_000==401&&orientation=="GridOrientation_Down"&&n.as_object().is_some_and(|m|m.len()==2)=>{roads.entry((grid,u64::from(item),diagonal)).or_default().push((x,y));},
   "fence" if item/100_000==407&&matches!(orientation,"GridOrientation_Down"|"GridOrientation_Left")&&n.as_object().is_some_and(|m|m.len()==3)=>{
    let base=n.get("base").and_then(Value::as_u64).and_then(|n|u32::try_from(n).ok()).ok_or(bad)?;
    if ddv_save_patch::fence_topology::family_for_part(item,diagonal)!=Some(base){return Err(bad);}
    fences.entry((grid,base,diagonal)).or_default().push(FencePart{item,x,y,left:orientation=="GridOrientation_Left",diagonal});
   },_=>return Err(bad)
  }
 }
 if ordinary.len()>MAX_SCENE_FURNITURE||roads.values().map(Vec::len).sum::<usize>()>256||fences.values().map(Vec::len).sum::<usize>()>128{return Err(bad);}
 let mut working=Zeroizing::new(std::str::from_utf8(profile).map_err(|_|bad)?.to_owned());
 if !ordinary.is_empty(){let draft=group_paste_candidate(profile,&serde_json::to_string(&ordinary).map_err(|_|bad)?)?;working.zeroize();*working=draft;}
 let install=|working:&mut Zeroizing<String>,d:&ddv_save_patch::PlainGridDestination,mut draft:ddv_save_patch::GridCoordinateDraft,count:usize|->Result<(),CodecError>{
  let current:Value=serde_json::from_str(working).map_err(|_|bad)?;
  let next=current["World"]["GridCollection"]["Grids"][&d.grid_id]["NextGridObjectID"].as_u64().ok_or(bad)?;
  let ids=(0..count).map(|i|next.checked_add(i as u64).filter(|n|*n<u32::MAX as u64).map(|n|n.to_string()).ok_or(bad)).collect::<Result<Vec<_>,_>>()?;
  let refs=grid_identity_dependencies_for_ids(working.as_bytes(),&d.grid_id,&ids)?;
  if refs.blocking()>0||refs.historical>0||!draft.changed||!draft.untouched_bytes_preserved||draft.writer_authorized||draft.export_authorized{draft.patched_json.zeroize();return Err(bad);}
  working.zeroize();**working=std::mem::take(&mut draft.patched_json);Ok(())
 };
 // Diagonal roads first would block subsequent cardinal neighbors;
 // keep cardinal cells first and preserve exact requested modes.
 let mut road_groups:Vec<_>=roads.into_iter().collect();road_groups.sort_by_key(|((_,_,diag),_)|*diag);
 for ((grid,item,diag),cells) in road_groups{
  let d=destinations.get(&grid).ok_or(bad)?;
  let draft=ddv_save_patch::preview_road_mutation(&working,d,item,&cells,false,diag,None).map_err(|_|bad)?;
  install(&mut working,d,draft,cells.len())?;
 }
 for ((grid,base,diag),parts) in fences{
  let d=destinations.get(&grid).ok_or(bad)?;
  let (nodes,edges)=decompile_fence(base,d.tessellation,diag,&parts).map_err(|_|bad)?;
  let posts=parts.iter().filter(|p|p.item==base).map(|p|(p.x,p.y)).collect();
  let actual=compile_fence_with_posts(base,d.tessellation,diag,&nodes,&edges,&posts).map_err(|_|bad)?;
  // Preserve exact original representation: no implicit extra posts.
  if actual.iter().copied().collect::<std::collections::BTreeSet<_>>()!=parts.iter().copied().collect(){return Err(bad);}
  let draft=ddv_save_patch::preview_isolated_fence_with_posts(&working,d,base,diag,&nodes,&edges,&posts).map_err(|_|bad)?;
  install(&mut working,d,draft,actual.len())?;
 }
 Ok(std::mem::take(&mut *working))
}
/// An explicit exterior-only operation, not a generic Building placement.
pub(super) fn player_house_grid_scope(root:&Value,gid:&str)->Result<String,CodecError>{
    let scope=outdoor_identity(root,gid)?.0;
    if scope=="FloatingIslands"{return Err(CodecError::Json);}
    Ok(scope)
}
pub(super) fn house_exterior_identity(root:&Value,gid:&str)->Result<(String,String,u64,u64,u64),CodecError>{
    let mut identity=outdoor_identity(root,gid)?;
    if identity.0=="FloatingIslands"{
        let data=root["World"]["GridCollection"]["Grids"][gid]["GridDataPath"].as_str().ok_or(CodecError::Json)?;
        island_scope(&serde_json::json!({"layoutId":identity.1,"gridDataPath":data}))?;
        identity.0=identity.1.clone();
    }
    Ok(identity)
}
fn player_house_duplicate_candidate(profile:&[u8],plan:&Value,remove:bool)->Result<String,CodecError>{
    let bad=CodecError::Json;
    let o=plan.as_object().filter(|o|if remove{o.len()==5}else{o.len()==8||o.len()==9&&o.contains_key("replacementOrientation")}).ok_or(bad)?;
    if o.keys().any(|k|!matches!(k.as_str(),"localOrdinal"|"itemId"|"expectedX"|"expectedY"|"orientation")&&(remove||!matches!(k.as_str(),"destination"|"x"|"y"|"replacementOrientation"))){return Err(bad);}
    let root:Value=serde_json::from_slice(profile).map_err(|_|bad)?;
    if root["GameInfo"]["Version"].as_u64()!=Some(643){return Err(bad);}
    let item=o.get("itemId").ok_or(bad)?.as_str().and_then(|s|s.parse::<u64>().ok().filter(|n|n.to_string()==s&&n/100_000==205)).ok_or(bad)?;
    let ordinal=o.get("localOrdinal").ok_or(bad)?.as_u64().and_then(|n|usize::try_from(n).ok()).filter(|n|*n>0).ok_or(bad)?;
    let int=|k:&str|o.get(k).and_then(Value::as_i64).and_then(|n|i32::try_from(n).ok()).ok_or(bad);
    let expected=(int("expectedX")?,int("expectedY")?);
    let orientation=o.get("orientation").ok_or(bad)?.as_str().filter(|s|ddv_save_patch::OBSERVED_CARDINAL_ORIENTATIONS.contains(s)).ok_or(bad)?;
    let (scan,_)=scan_grid_instances(profile)?;
    if scan.sampled||scan.invalid>0||scan.subgrid_parents.contains(&ordinal){return Err(bad);}
    let (target,xy)=scan.private_targets.get(ordinal-1).ok_or(bad)?;
    if target.kind!=GridObjectKind::Full||target.item_id!=item||*xy!=Some(expected){return Err(bad);}
    let scope=house_exterior_identity(&root,&target.grid_id)?.0;
    let refs=grid_identity_dependencies(profile,target)?;
    if refs.active>0||refs.related>0||refs.unknown>0||remove&&refs.blocking()>0{return Err(bad);}
    let json=std::str::from_utf8(profile).map_err(|_|bad)?;
    let draft=if remove{
        let verified_grids:HashSet<String>=root["World"]["GridCollection"]["Grids"].as_object().ok_or(bad)?.iter().filter(|(_,g)|g.get("Objects").and_then(Value::as_object).is_some_and(|m|m.values().any(|v|v.get("ItemID").and_then(Value::as_u64)==Some(item)))).filter_map(|(id,_)|house_exterior_identity(&root,id).ok().filter(|s|s.0==scope).map(|_|id.clone())).collect();
        match ddv_save_patch::preview_player_house_remove(json,target,expected,orientation,&verified_grids){
            Ok(d)=>Ok(d),
            Err(_)=>{
                if refs.historical>0{return Err(bad);}
                let object=&root["World"]["GridCollection"]["Grids"][&target.grid_id]["Objects"][&target.object_id];
                let index=object["State"]["HouseData"]["PlayerHouseIndex"].as_u64().and_then(|n|usize::try_from(n).ok()).filter(|i|*i>0).ok_or(bad)?;
                let d=ddv_save_patch::preview_player_house_detach(json,target,expected,orientation).map_err(|_|CodecError::Patch)?;
                if detached_player_house_indices(d.patched_json.as_bytes())?.get(&item)!=Some(&index){return Err(bad);}
                Ok(d)
            }
        }
    }else{
        let witness=o.get("destination").ok_or(bad)?;
        let dest=resolve_plain_grid_destination(profile,witness)?;
        let native=house_exterior_identity(&root,&dest.grid_id)?;
        if native.0!=scope||native.1!=dest.layout_path||native.2!=u64::from(dest.tessellation)||native.3!=u64::from(dest.size.0)||native.4!=u64::from(dest.size.1){return Err(bad);}
        let replacement=match o.get("replacementOrientation"){None=>orientation,Some(v)=>v.as_str().filter(|s|ddv_save_patch::OBSERVED_CARDINAL_ORIENTATIONS.contains(s)).ok_or(bad)?};
        ddv_save_patch::preview_player_house_duplicate_oriented(json,target,expected,&dest,(int("x")?,int("y")?),orientation,replacement)
    }.map_err(|_|CodecError::Patch)?;
    if !draft.changed||!draft.untouched_bytes_preserved||draft.writer_authorized||draft.export_authorized{return Err(bad);}
    Ok(draft.patched_json)
}

/// Only clone state whose observed fields do not embed another native identity.
/// The last stateful instance is not removed until its game-level lifecycle is known.
/// Cross-world references outside the object cannot be inferred from item
/// category. Start with state-free objects and verified simple skin state.
pub(super) fn cross_world_building_state(item:u64,state:Option<&Value>)->bool{
    if !matches!(item/100_000,200..=203){return false;}
    if state.is_none_or(|v|v.is_null()||v.as_object().is_some_and(|m|m.is_empty())){return true;}
    item/100_000==203&&state.is_some_and(|v|v.get("BuildingWithSkinData").is_some())&&building_clone_state(item,state)
}
fn building_clone_state(item:u64,state:Option<&Value>)->bool{
    let Some(v)=state.filter(|v|!v.is_null()&&!v.as_object().is_some_and(|o|o.is_empty())) else{return true;};
    let Some(m)=v.as_object().filter(|m|m.len()==1) else{return false;};
    let family=item/100_000;
    let upgrade=|v:&Value|v.is_null()||v.as_object().is_some_and(|o|o.keys().all(|k|k=="Level")&&o.get("Level").and_then(Value::as_u64).is_some());
    let int=|v:&Value|v.as_i64().is_some();
    let timestamp=|v:&Value|v.as_str().is_some_and(|s|!s.is_empty()&&s.len()<=64);
    if matches!(family,200|203){
        if let Some(h)=m.get("HouseData").and_then(Value::as_object){
            // The non-player house index is a scalar default (0 in observed
            // schema 643); a nonzero interior index is not cloned.
            return h.keys().all(|k|matches!(k.as_str(),"Built"|"UpgradeState"|"PlayerHouseIndex"))&&h.get("Built").and_then(Value::as_bool)==Some(true)&&h.get("UpgradeState").is_none_or(upgrade)&&h.get("PlayerHouseIndex").is_none_or(|v|matches!(v.as_i64(),Some(-1|0)));
        }
    }
    if matches!(family,200|201|203){
        if let Some(h)=m.get("BuildingWithSkinData").and_then(Value::as_object){
            return h.keys().all(|k|matches!(k.as_str(),"UpgradeState"|"CurrentSkinItemID"))&&h.get("UpgradeState").is_some_and(upgrade)&&h.get("CurrentSkinItemID").is_none_or(int);
        }
    }
    match family{
        201=>{
            if let Some(h)=m.get("StallData").and_then(Value::as_object){
                return h.keys().all(|k|matches!(k.as_str(),"UpgradeState"|"ShopData"|"CurrentSkinItemID"))&&h.get("UpgradeState").is_some_and(upgrade)&&h.get("CurrentSkinItemID").is_none_or(int)&&
                h.get("ShopData").is_some_and(|v|v.is_null()||v.as_object().is_some_and(|shop|{
                    if shop.is_empty(){return true;}
                    shop.len()==4&&shop.get("LastRefresh").is_some_and(timestamp)&&shop.get("NumRefresh").is_some_and(int)&&shop.get("Seed").is_some_and(int)&&
                    shop.get("Slots").and_then(Value::as_array).is_some_and(|a|a.len()<=128&&a.iter().all(|slot|slot.as_object().is_some_and(|s|
                        s.len()==4&&s.get("SlotId").is_some_and(int)&&s.get("MaxAmount").is_some_and(int)&&s.get("Regen").is_some_and(Value::is_null)&&
                        s.get("Item").and_then(Value::as_object).is_some_and(|i|i.len()==2&&i.get("id").is_some_and(int)&&i.get("amount").is_some_and(int)))))
                }));
            }
            m.get("FishingStallData").and_then(Value::as_object).is_some_and(|h|h.len()==3&&h.get("UpgradeState").is_some_and(upgrade)&&h.get("LastCollect").is_some_and(timestamp)&&h.get("PendingFishes").and_then(Value::as_array).is_some_and(|a|a.is_empty()))
        },
        202=>m.get("GardenData").and_then(Value::as_object).is_some_and(|h|h.len()==1&&h.get("Slots").and_then(Value::as_array).is_some_and(|a|a.len()<=128&&a.iter().all(|slot|slot.as_object().is_some_and(|s|
            s.len()==3&&s.get("PlantedSeedItemID").is_some_and(int)&&s.get("LastActivity").is_some_and(timestamp)&&
            s.get("Harvest").and_then(Value::as_object).is_some_and(|harvest|harvest.len()==4&&harvest.get("EndOfGrowth").is_some_and(timestamp)&&harvest.get("EndOfLife").is_some_and(|v|v.is_null()||timestamp(v))&&harvest.get("NumberOfProductionLeft").is_some_and(int)&&harvest.get("SaplingGridObjectID").and_then(Value::as_i64)==Some(0)))))),
        _=>false
    }
}
/// The shared DB projection is generated from the reviewed Character.House
/// field. No inference from translated names or the 200-family alone.
pub(super) fn character_house_exterior(item:u64)->bool{
    static IDS:std::sync::OnceLock<HashSet<u64>>=std::sync::OnceLock::new();
    IDS.get_or_init(||{
        let v:Value=serde_json::from_str(include_str!("../../../src/lib/world/character-house-exteriors.json")).unwrap_or(Value::Null);
        if v["gameVersion"]!="1.26.2"||v["sourceField"]!="Character.House@int"{return HashSet::new();}
        v["itemIds"].as_array().into_iter().flatten().filter_map(Value::as_u64).filter(|n|n/100_000==200).collect()
    }).contains(&item)
}
pub(super) fn character_house_copy_candidate(profile:&[u8],target:&GridCoordinateTarget,expected:(i32,i32),dest:&ddv_save_patch::PlainGridDestination,xy:(i32,i32),orientation:&str,replacement:&str,cross:bool)->Result<ddv_save_patch::GridCoordinateDraft,CodecError>{
    let bad=CodecError::Json;
    if !character_house_exterior(target.item_id){return Err(bad);}
    let root:Value=serde_json::from_slice(profile).map_err(|_|bad)?;
    if root["GameInfo"]["Version"].as_u64()!=Some(643){return Err(bad);}
    let from=house_exterior_identity(&root,&target.grid_id)?;
    let to=house_exterior_identity(&root,&dest.grid_id)?;
    if (from.0!=to.0)!=cross||from.2!=to.2||to.1!=dest.layout_path||to.2!=u64::from(dest.tessellation)||to.3!=u64::from(dest.size.0)||to.4!=u64::from(dest.size.1)||
       expected.0<0||expected.1<0||expected.0 as u64>=from.2*from.3||expected.1 as u64>=from.2*from.4{return Err(bad);}
    let grids=&root["World"]["GridCollection"]["Grids"];
    let object=&grids[&target.grid_id]["Objects"][&target.object_id];
    let state=object.get("State").filter(|s|s.get("HouseData").is_some()).ok_or(bad)?;
    if !building_clone_state(target.item_id,Some(state)){return Err(bad);}
    let refs=grid_identity_dependencies(profile,target)?;
    // Source navigation and historical addresses stay valid: this is a copy,
    // not a move or removal. New destination identities must be unreferenced.
    if refs.active+refs.related+refs.unknown>0{return Err(bad);}
    let next=grids[&dest.grid_id]["NextGridObjectID"].as_u64().filter(|n|*n>0&&*n<u32::MAX as u64).ok_or(bad)?;
    let refs=grid_identity_dependencies_for_ids(profile,&dest.grid_id,&[next.to_string()])?;
    if refs.blocking()>0||refs.historical>0{return Err(bad);}
    ddv_save_patch::preview_character_house_exterior_duplicate(std::str::from_utf8(profile).map_err(|_|bad)?,target,expected,dest,xy,orientation,replacement).map_err(|_|CodecError::Patch)
}

/// Resolve a Grid's actual owning village/island, not a filename or a
/// character's default world. An absent/ambiguous routing record is not proof.
fn character_house_world_owner<'a>(root:&'a Value,gid:&str)->Option<&'a Value>{
    let id=key_id(gid)?;
    let world=&root["World"];
    let mut owners=Vec::new();
    for village in world["Villages"].as_array()?{
        let areas=village["Areas"].as_object()?;
        let mut hits=0;
        for area in areas.values(){
            hits+=area["GridIDs"].as_array()?.iter().filter(|v|v.as_u64()==Some(id)).count();
        }
        if hits>1{return None;}
        if hits==1{owners.push(village);}
    }
    for island in world["FloatingIslands"].as_object()?.values(){
        let hits=island["GridIDs"].as_array()?.iter().filter(|v|v.as_u64()==Some(id)).count();
        if hits>1{return None;}
        if hits==1{owners.push(island);}
    }
    if owners.len()!=1{return None;}
    let owner=owners[0];
    owner["CharacterStates"].as_object()?;
    Some(owner)
}
fn character_house_foreign_copy_removable(root:&Value,item:u64,from_gid:&str,to_gid:&str)->bool{
    let Some(from)=character_house_world_owner(root,from_gid)else{return false;};
    let Some(to)=character_house_world_owner(root,to_gid)else{return false;};
    if std::ptr::eq(from,to){return false;}
    let Ok(projection)=serde_json::from_str::<Value>(include_str!("../../../src/lib/world/character-house-exteriors.json"))else{return false;};
    let Some(ids)=projection["characterIdsByHouse"][item.to_string()].as_array().filter(|a|!a.is_empty())else{return false;};
    let Some(source)=from["CharacterStates"].as_object()else{return false;};
    let Some(destination)=to["CharacterStates"].as_object()else{return false;};
    let mut found=false;
    for v in ids{
        let Some(id)=v.as_u64().filter(|n|n/100_000==100)else{return false;};
        let key=id.to_string();
        // Presence enum semantics are not assumed. Any saved source entry
        // blocks removal of the local last entrance.
        if source.contains_key(&key){return false;}
        found|=destination.contains_key(&key);
    }
    found
}
fn character_house_remove_candidate(profile:&[u8],root:&Value,target:&GridCoordinateTarget,expected:(i32,i32),orientation:&str)->Result<ddv_save_patch::GridCoordinateDraft,CodecError>{
    let bad=CodecError::Json;
    if !character_house_exterior(target.item_id){return Err(bad);}
    let from=house_exterior_identity(root,&target.grid_id)?;
    if expected.0<0||expected.1<0||expected.0 as u64>=from.2*from.3||expected.1 as u64>=from.2*from.4{return Err(bad);}
    let grids=root["World"]["GridCollection"]["Grids"].as_object().ok_or(bad)?;
    let source=&grids[&target.grid_id]["Objects"][&target.object_id];
    let state=source.get("State").filter(|s|s.get("HouseData").is_some()).ok_or(bad)?;
    if !building_clone_state(target.item_id,Some(state)){return Err(bad);}
    let refs=grid_identity_dependencies(profile,target)?;
    if refs.blocking()>0||refs.historical>0{return Err(bad);}
    // Preserve a local entrance unless the exact save routing shows this
    // world has no related character record and a surviving house elsewhere does.
    let survivor=grids.iter().any(|(gid,g)|{
        let Some(to)=house_exterior_identity(root,gid).ok() else{return false;};
        if to.0!=from.0&&!character_house_foreign_copy_removable(root,target.item_id,&target.grid_id,gid){return false;}
        g["Objects"].as_object().is_some_and(|objects|objects.iter().any(|(oid,o)|{
            if (gid==&target.grid_id&&oid==&target.object_id)||o["ItemID"].as_u64()!=Some(target.item_id)||o.get("State")!=Some(state)||o["ID"].as_u64()!=key_id(oid){return false;}
            let coord=|k:&str,limit:u64|o[k].as_u64().is_some_and(|n|n<limit);
            o.as_object().is_some_and(|m|m.len()==6&&m.keys().all(|k|matches!(k.as_str(),"ID"|"ItemID"|"X"|"Y"|"Orientation"|"State")))&&
            coord("X",to.2*to.3)&&coord("Y",to.2*to.4)&&o["Orientation"].as_str().is_some_and(|s|ddv_save_patch::OBSERVED_CARDINAL_ORIENTATIONS.contains(&s))
        }))
    });
    if !survivor{return Err(bad);}
    ddv_save_patch::preview_character_house_exterior_remove(std::str::from_utf8(profile).map_err(|_|bad)?,target,expected,orientation).map_err(|_|CodecError::Patch)
}

/// Move an exterior only when the existing removal contract still proves
/// a surviving entrance after the copy. Never relocate CharacterStates,
/// interior scenes, quests, or navigation pointers to force the move.
pub(super) fn character_house_move_candidate(profile:&[u8],target:&GridCoordinateTarget,expected:(i32,i32),dest:&ddv_save_patch::PlainGridDestination,xy:(i32,i32),orientation:&str,cross:bool)->Result<ddv_save_patch::GridCoordinateDraft,CodecError>{
    use zeroize::{Zeroize,Zeroizing};
    if target.grid_id==dest.grid_id{return Err(CodecError::Json);}
    let refs=grid_identity_dependencies(profile,target)?;
    if refs.blocking()>0||refs.historical>0{return Err(CodecError::Patch);}
    let mut copy=character_house_copy_candidate(profile,target,expected,dest,xy,orientation,orientation,cross)?;
    let candidate=Zeroizing::new(std::mem::take(&mut copy.patched_json));
    let root:Value=serde_json::from_str(&candidate).map_err(|_|CodecError::Json)?;
    let result=character_house_remove_candidate(candidate.as_bytes(),&root,target,expected,orientation);
    copy.patched_json.zeroize();
    result
}

fn building_duplicate_candidate(profile:&[u8],plan:&Value,remove:bool)->Result<String,CodecError>{
    let bad=CodecError::Json;
    let o=plan.as_object().filter(|o|if remove{o.len()==5}else{o.len()==8||o.len()==9&&o.contains_key("replacementOrientation")}).ok_or(bad)?;
    if o.keys().any(|k|!matches!(k.as_str(),"localOrdinal"|"itemId"|"expectedX"|"expectedY"|"orientation")&&(remove||!matches!(k.as_str(),"destination"|"x"|"y"|"replacementOrientation"))){return Err(bad);}
    let root:Value=serde_json::from_slice(profile).map_err(|_|bad)?;
    if root["GameInfo"]["Version"].as_u64()!=Some(643){return Err(bad);}
    let item=o.get("itemId").and_then(Value::as_str).and_then(|s|s.parse::<u64>().ok().filter(|n|n.to_string()==s&&matches!(n/100_000,200..=203))).ok_or(bad)?;
    let ordinal=o.get("localOrdinal").and_then(Value::as_u64).and_then(|n|usize::try_from(n).ok()).filter(|n|*n>0).ok_or(bad)?;
    let int=|k:&str|o.get(k).and_then(Value::as_i64).and_then(|n|i32::try_from(n).ok()).ok_or(bad);
    let expected=(int("expectedX")?,int("expectedY")?);
    let orientation=o.get("orientation").and_then(Value::as_str).filter(|s|ddv_save_patch::OBSERVED_CARDINAL_ORIENTATIONS.contains(s)).ok_or(bad)?;
    let target=if !remove&&character_house_exterior(item){
        // Exact source identity + orientation/state/dependencies are checked by
        // the copy-specific writer; a preserved navigation cache is permitted.
        resolve_grid_coordinate_target(profile,ordinal,item,expected,"full")?
    }else{resolve_grid_mixed_targets(profile,&[(ordinal,item,expected,"full".to_owned(),Some(orientation.to_owned()))])?.pop().ok_or(bad)?};
    if character_house_exterior(item){
        let draft=if remove{character_house_remove_candidate(profile,&root,&target,expected,orientation)?}else{
            let dest=resolve_plain_grid_destination(profile,o.get("destination").ok_or(bad)?)?;
            let replacement=match o.get("replacementOrientation"){None=>orientation,Some(v)=>v.as_str().filter(|s|ddv_save_patch::OBSERVED_CARDINAL_ORIENTATIONS.contains(s)).ok_or(bad)?};
            character_house_copy_candidate(profile,&target,expected,&dest,(int("x")?,int("y")?),orientation,replacement,false)?
        };
        if !draft.changed||!draft.untouched_bytes_preserved||draft.writer_authorized||draft.export_authorized{return Err(bad);}
        return Ok(draft.patched_json);
    }
    let scope=player_house_grid_scope(&root,&target.grid_id)?;
    let (sx,sy)=building_transform_grid_size(&root,&target.grid_id)?;
    if expected.0<0||expected.1<0||expected.0 as u64>=sx||expected.1 as u64>=sy{return Err(bad);}
    let refs=grid_identity_dependencies(profile,&target)?;
    if refs.blocking()>0||refs.historical>0{return Err(bad);}
    let grids=root["World"]["GridCollection"]["Grids"].as_object().ok_or(bad)?;
    let obj=&grids[&target.grid_id]["Objects"][&target.object_id];
    let state=obj.get("State");
    if !building_clone_state(item,state){return Err(bad);}
    let json=std::str::from_utf8(profile).map_err(|_|bad)?;
    let draft=if remove{
        if state.is_some_and(|v|!v.is_null()&&!v.as_object().is_some_and(|m|m.is_empty())){
            let survivor=grids.iter().any(|(gid,g)|player_house_grid_scope(&root,gid).is_ok_and(|s|s==scope)&&
                !root["World"]["GridCollection"].get("DiffGrids").is_some_and(|v|v.as_object().is_none_or(|m|m.contains_key(gid)))&&
                g["Objects"].as_object().is_some_and(|m|m.iter().any(|(oid,v)|(gid!=&target.grid_id||oid!=&target.object_id)&&v["ID"].as_u64()==key_id(oid)&&v["ItemID"].as_u64()==Some(item)&&v.get("State")==state)));
            if !survivor{return Err(bad);}
        }
        ddv_save_patch::preview_checked_building_remove(json,&target,expected,orientation)
    }else{
        let witness=o.get("destination").ok_or(bad)?;
        if world_grid_scope(witness)?.0!=scope{return Err(bad);}
        let dest=resolve_plain_grid_destination(profile,witness)?;
        if player_house_grid_scope(&root,&dest.grid_id)?!=scope{return Err(bad);}
        let replacement=match o.get("replacementOrientation"){None=>orientation,Some(v)=>v.as_str().filter(|s|ddv_save_patch::OBSERVED_CARDINAL_ORIENTATIONS.contains(s)).ok_or(bad)?};
        ddv_save_patch::preview_checked_building_duplicate_oriented(json,&target,expected,&dest,(int("x")?,int("y")?),orientation,replacement)
    }.map_err(|_|CodecError::Patch)?;
    if !draft.changed||!draft.untouched_bytes_preserved||draft.writer_authorized||draft.export_authorized{return Err(bad);}
    Ok(draft.patched_json)
}

/// Existing detached, non-primary interiors only. No new interior or Grid is allocated.
fn detached_player_house_indices(profile:&[u8])->Result<HashMap<u64,usize>,CodecError>{
    let bad=CodecError::Json;
    let root:Value=serde_json::from_slice(profile).map_err(|_|bad)?;
    if root["GameInfo"]["Version"].as_u64()!=Some(643){return Err(bad);}
    let world=&root["World"];
    let houses=world["PlayerHouses"].as_array().filter(|h|h.len()<=128).ok_or(bad)?;
    let collection=&world["GridCollection"];let grids=collection["Grids"].as_object().ok_or(bad)?;
    let (scan,_)=scan_grid_instances(profile)?;
    if scan.sampled||scan.invalid>0{return Err(bad);}
    let placed:HashSet<u64>=scan.private_targets.iter().map(|(t,_)|t.item_id).collect();
    let mut used_indices=HashSet::new();
    for (key,field) in [("Grids","Objects"),("DiffGrids","ModifiedObjects")]{
        if let Some(m)=collection.get(key).and_then(Value::as_object){
            for grid in m.values(){if let Some(objects)=grid.get(field).and_then(Value::as_object){
                for obj in objects.values(){
                    if obj["ItemID"].as_u64().is_some_and(|n|n/100_000==205){
                        if let Some(i)=obj["State"]["HouseData"]["PlayerHouseIndex"].as_u64(){used_indices.insert(i);}
                    }
                }
            }}
        }
    }
    let mut refs=HashMap::<u64,usize>::new();let mut per_house=Vec::new();
    for house in houses{
        let mut ids=Vec::new();let mut valid=true;
        if let Some(floors)=house["Floors"].as_array().filter(|a|!a.is_empty()&&a.len()<=128){
            for floor in floors{
                if let Some(rooms)=floor["Rooms"].as_object().filter(|m|!m.is_empty()&&m.len()<=4){
                    for room in rooms.values(){
                        if let Some(n)=room["FloorGridID"].as_u64().filter(|n|*n>0){ids.push(n);}else{valid=false;}
                        if let Some(walls)=room["WallGridIDs"].as_object(){for v in walls.values(){
                            if let Some(n)=v.as_u64().filter(|n|*n>0){ids.push(n);}else{valid=false;}
                        }}else if room.get("WallGridIDs").is_some(){valid=false;}
                    }
                }else{valid=false;}
            }
        }else{valid=false;}
        for id in &ids{*refs.entry(*id).or_default()+=1;}
        per_house.push((valid,ids));
    }
    let mut out=HashMap::new();
    for (index,house) in houses.iter().enumerate().skip(1){
        let Some(item)=house["HouseItemID"].as_u64().filter(|n|n/100_000==205) else{continue;};
        if placed.contains(&item)||used_indices.contains(&(index as u64))||houses.iter().filter(|h|h["HouseItemID"].as_u64()==Some(item)).count()!=1{continue;}
        let (valid,ids)=&per_house[index];
        if !valid||ids.is_empty()||ids.iter().any(|n|{
            let key=n.to_string();let g=grids.get(&key);
            refs.get(n)!=Some(&1)||collection.get("DiffGrids").is_some_and(|v|v.as_object().is_none_or(|m|m.contains_key(&key)))||
            g.is_none_or(|g|g["ID"].as_u64()!=Some(*n)||g["Objects"].as_object().is_none()||g["GridDataPath"].as_str().is_none_or(|p|!p.starts_with("GridData/Rooms/")))
        }){continue;}
        out.insert(item,index);
    }
    Ok(out)
}
pub(super) fn detached_player_houses_json(profile:&[u8])->Result<String,CodecError>{
    let mut ids:Vec<_>=detached_player_house_indices(profile)?.into_keys().collect();ids.sort_unstable();
    let root:Value=serde_json::from_slice(profile).map_err(|_|CodecError::Json)?;
    let houses=root["World"]["PlayerHouses"].as_array().ok_or(CodecError::Json)?;
    let (scan,_)=scan_grid_instances(profile)?;
    if scan.invalid>0||scan.sampled{return Err(CodecError::Json);}
    let mut existing:HashSet<u64>=scan.private_targets.iter().map(|(t,_)|t.item_id).collect();
    existing.extend(houses.iter().filter_map(|h|h["HouseItemID"].as_u64()));
    let manifest:Value=serde_json::from_str(include_str!("../../../src/lib/world/player-house-source.json")).map_err(|_|CodecError::Json)?;
    let new_ids:Vec<u64>=manifest["templates"].as_array().ok_or(CodecError::Json)?.iter().flat_map(|t|t["itemIds"].as_array().into_iter().flatten()).filter_map(Value::as_u64).filter(|id|houses.len()<128&&!houses.is_empty()&&!existing.contains(id)).collect();
    Ok(serde_json::json!({"contract":"wand.db05.detached-player-houses@1","itemIds":ids,"newItemIds":new_ids,"writerAuthorized":false}).to_string())
}

/// Source-pinned experimental initial placement. No arbitrary State is accepted
/// from a preset, and existing native instances must use the clone path instead.
fn building_initial_candidate(profile:&[u8],plan:&Value)->Result<String,CodecError>{
    let bad=CodecError::Json;
    let o=plan.as_object().filter(|o|(o.len()==5||o.len()==6&&o.contains_key("nativeHouseTemplate"))&&o.keys().all(|k|matches!(k.as_str(),"itemId"|"destination"|"x"|"y"|"orientation"|"nativeHouseTemplate"))).ok_or(bad)?;
    let root:Value=serde_json::from_slice(profile).map_err(|_|bad)?;
    let templates:Value=serde_json::from_str(include_str!("../../../src/lib/world/building-initial-templates.json")).map_err(|_|bad)?;
    if root["GameInfo"]["Version"].as_u64()!=templates["saveVersion"].as_u64()||templates["saveVersion"].as_u64()!=Some(643){return Err(bad);}
    let item=o["itemId"].as_str().and_then(|s|s.parse::<u64>().ok().filter(|n|n.to_string()==s)).ok_or(bad)?;
    let witness=&o["destination"];let (scope,_)=if item/100_000==205&&witness["layoutId"].as_str().is_some_and(|s|s.starts_with("SceneLayouts/FloatingIslands/")){island_scope(witness)?}else{world_grid_scope(witness)?};
    let well=templates["scopes"][&scope].as_array().is_some_and(|a|a.iter().any(|v|v.as_u64()==Some(item)));
    let other=templates["otherBuildings"][&scope].get(item.to_string());
    let detached=if item/100_000==205{detached_player_house_indices(profile)?.get(&item).copied()}else{None};
    let native_source=o.get("nativeHouseTemplate");
    if native_source.is_some()&&(item/100_000!=205||detached.is_some()){return Err(bad);}
    if !well&&other.is_none()&&detached.is_none()&&native_source.is_none(){return Err(bad);}
    let d=resolve_plain_grid_destination(profile,witness)?;
    let native=house_exterior_identity(&root,&d.grid_id)?;
    if native.0!=scope||native.1!=d.layout_path||native.2!=u64::from(d.tessellation)||native.3!=u64::from(d.size.0)||native.4!=u64::from(d.size.1){return Err(bad);}
    let collection=&root["World"]["GridCollection"];
    // Refuse unknown or diff representations rather than creating a second
    // identity for a native instance that is already present.
    let (scan,_)=scan_grid_instances(profile)?;
    if scan.sampled||scan.invalid>0||scan.private_targets.iter().any(|(t,_)|t.item_id==item){return Err(bad);}
    if collection.get("DiffGrids").is_some_and(|v|v.as_object().is_none_or(|m|m.values().any(|g|g["GridDefaultLayoutPath"].as_str().and_then(|p|p.split('/').nth(1))==Some(scope.as_str())))){return Err(bad);}
    let int=|k:&str|o[k].as_i64().and_then(|n|i32::try_from(n).ok()).ok_or(bad);
    let orientation=o["orientation"].as_str().filter(|s|ddv_save_patch::OBSERVED_CARDINAL_ORIENTATIONS.contains(s)).ok_or(bad)?;
    if let Some(source)=native_source{
        let template=crate::player_house_source::verified_template(item,source.as_str().ok_or(bad)?)?;
        let layout=template["layoutPath"].as_str().ok_or(bad)?;
        let next=collection["Grids"][&d.grid_id]["NextGridObjectID"].as_u64().ok_or(bad)?.to_string();
        let refs=grid_identity_dependencies_for_ids(profile,&d.grid_id,&[next])?;
        if refs.blocking()>0||refs.historical>0{return Err(bad);}
        let draft=ddv_save_patch::player_house_create::preview_new_player_house(std::str::from_utf8(profile).map_err(|_|bad)?,&template,layout,item,&d,(int("x")?,int("y")?),orientation).map_err(|_|CodecError::Patch)?;
        if !draft.changed||!draft.untouched_bytes_preserved||draft.writer_authorized||draft.export_authorized{return Err(bad);}
        return Ok(draft.patched_json);
    }
    use ddv_save_patch::InitialBuildingState;
    let initial=if let Some(index)=detached{InitialBuildingState::ExistingPlayerHouse{index}}else if well{
        let template=templates["scopeTemplates"].get(&scope).unwrap_or(&templates["template"]);
        let level=if template.get("withoutUpgrade").and_then(Value::as_array).is_some_and(|a|a.iter().any(|v|v.as_u64()==Some(item))){None}else{Some(template["upgradeLevel"].as_u64().ok_or(bad)?)};
        InitialBuildingState::Well{level,skin:template["skinItemId"].as_u64().ok_or(bad)?}
    }else{
        let t=other.ok_or(bad)?;
        match t["kind"].as_str(){
            Some("house") if item/100_000==200=>InitialBuildingState::House{level:match t.get("upgradeLevel"){Some(Value::Null)=>None,Some(v) if v.as_u64()==Some(0)=>Some(0),_=>return Err(bad)}},
            Some("stall") if item/100_000==201&&t["upgradeLevel"].as_u64()==Some(0)=>InitialBuildingState::UnbuiltStall,
            _=>return Err(bad),
        }
    };
    let draft=ddv_save_patch::preview_checked_building_initial(std::str::from_utf8(profile).map_err(|_|bad)?,&d,item,(int("x")?,int("y")?),orientation,initial).map_err(|_|CodecError::Patch)?;
    if !draft.changed||!draft.untouched_bytes_preserved||draft.writer_authorized||draft.export_authorized{return Err(bad);}
    Ok(draft.patched_json)
}

fn storage_pickup_candidate(profile:&[u8],plan:&Value)->Result<String,CodecError>{
 let bad=CodecError::Json;
 let o=plan.as_object().filter(|o|o.len()==5&&o.keys().all(|k|matches!(k.as_str(),"localOrdinal"|"itemId"|"expectedX"|"expectedY"|"expectedOrientation"))).ok_or(bad)?;
 let root:Value=serde_json::from_slice(profile).map_err(|_|bad)?;
 if root["GameInfo"]["Version"].as_u64()!=Some(643){return Err(bad);}
 let ordinal=o["localOrdinal"].as_u64().and_then(|n|usize::try_from(n).ok()).ok_or(bad)?;
 let item=o["itemId"].as_str().and_then(|s|s.parse::<u64>().ok().filter(|n|n.to_string()==s&&n/100_000==400)).ok_or(bad)?;
 let int=|k:&str|o[k].as_i64().and_then(|n|i32::try_from(n).ok()).ok_or(bad);
 let old=(int("expectedX")?,int("expectedY")?);
 let ori=o["expectedOrientation"].as_str().filter(|s|ddv_save_patch::OBSERVED_CARDINAL_ORIENTATIONS.contains(s)).ok_or(bad)?;
 let target=resolve_grid_orientation_target(profile,ordinal,item,old,"full",ori)?;
 let from=house_exterior_identity(&root,&target.grid_id)?;
 if old.0<0||old.1<0||old.0 as u64>=from.3*from.2||old.1 as u64>=from.4*from.2{return Err(bad);}
 let refs=grid_identity_dependencies(profile,&target)?;if refs.blocking()>0||refs.historical>0{return Err(bad);}
 let amount=root["Player"]["ListInventories"]["0"]["Inventory"][item.to_string()]["Amount"].as_u64().and_then(|n|u32::try_from(n).ok()).ok_or(bad)?;
 let draft=ddv_save_patch::preview_empty_storage_pickup(std::str::from_utf8(profile).map_err(|_|bad)?,&target,old,amount).map_err(|_|CodecError::Patch)?;
 Ok(draft.patched_json)
}
fn storage_duplicate_candidate(profile:&[u8],plan:&Value)->Result<String,CodecError>{
    storage_duplicate_with_target(profile,plan,None)
}
fn storage_duplicate_with_target(profile:&[u8],plan:&Value,resolved:Option<&ddv_save_patch::GridCoordinateTarget>)->Result<String,CodecError>{
    let bad=CodecError::Json;
    let o=plan.as_object().filter(|o|o.len()==11&&o.keys().all(|k|matches!(k.as_str(),"localOrdinal"|"itemId"|"expectedX"|"expectedY"|"expectedOrientation"|"destination"|"x"|"y"|"orientation"|"copyContents"|"freePlacement"))).ok_or(bad)?;
    let root:Value=serde_json::from_slice(profile).map_err(|_|bad)?;
    if root["GameInfo"]["Version"].as_u64()!=Some(643){return Err(bad);}
    let ordinal=o["localOrdinal"].as_u64().and_then(|n|usize::try_from(n).ok()).ok_or(bad)?;
    let item=o["itemId"].as_str().and_then(|s|s.parse::<u64>().ok().filter(|n|n.to_string()==s&&n/100_000==400)).ok_or(bad)?;
    let int=|k:&str|o[k].as_i64().and_then(|n|i32::try_from(n).ok()).ok_or(bad);
    let cardinal=|k:&str|o[k].as_str().filter(|s|ddv_save_patch::OBSERVED_CARDINAL_ORIENTATIONS.contains(s)).ok_or(bad);
    let old=(int("expectedX")?,int("expectedY")?);let xy=(int("x")?,int("y")?);
    let free=o["freePlacement"].as_bool().ok_or(bad)?;let copy=o["copyContents"].as_bool().ok_or(bad)?;
    let target=if let Some(target)=resolved{if target.item_id!=item||target.kind!=GridObjectKind::Full{return Err(bad);}target.clone()}else{resolve_grid_orientation_target(profile,ordinal,item,old,"full",cardinal("expectedOrientation")?)?};
    let from=house_exterior_identity(&root,&target.grid_id)?;
    let d=resolve_plain_grid_destination(profile,&o["destination"])?;
    let to=house_exterior_identity(&root,&d.grid_id)?;
    if to.1!=d.layout_path||to.2!=u64::from(d.tessellation)||to.3!=u64::from(d.size.0)||to.4!=u64::from(d.size.1)||old.0<0||old.1<0||old.0 as u64>=from.3*from.2||old.1 as u64>=from.4*from.2{return Err(bad);}
    let grids=&root["World"]["GridCollection"]["Grids"];
    let object=&grids[&target.grid_id]["Objects"][&target.object_id];
    if object["Orientation"].as_str()!=Some(cardinal("expectedOrientation")?)||!ddv_save_patch::storage_pose(&root,object)||grid_identity_dependencies(profile,&target)?.blocking()>0{return Err(bad);}
    if !free&&grids[&d.grid_id]["Objects"].as_object().ok_or(bad)?.values().any(|v|v["ItemID"].as_u64().is_none_or(|n|n/100_000!=401)&&v["X"].as_i64()==Some(i64::from(xy.0))&&v["Y"].as_i64()==Some(i64::from(xy.1))){return Err(bad);}
    let fresh=grids[&d.grid_id]["NextGridObjectID"].as_u64().filter(|n|*n>0&&*n<u32::MAX as u64).ok_or(bad)?.to_string();
    let refs=grid_identity_dependencies_for_ids(profile,&d.grid_id,&[fresh])?;if refs.blocking()>0||refs.historical>0{return Err(bad);}
    let amount=root["Player"]["ListInventories"]["0"]["Inventory"][item.to_string()]["Amount"].as_u64().and_then(|n|u32::try_from(n).ok()).ok_or(bad)?;
    let draft=ddv_save_patch::preview_storage_duplicate(std::str::from_utf8(profile).map_err(|_|bad)?,&target,old,&d,xy,cardinal("orientation")?,amount,copy,free).map_err(|_|CodecError::Patch)?;
    Ok(draft.patched_json)
}
/// All source ordinals refer to the immutable original. Stage normal furniture
/// first and use stable native identities for the remaining storage clones.
fn storage_group_candidate(profile:&[u8],plan:&Value)->Result<String,CodecError>{
    use zeroize::{Zeroize,Zeroizing};
    let bad=CodecError::Json;
    let o=plan.as_object().filter(|o|o.len()==2&&o.contains_key("rows")&&o.contains_key("freePlacement")).ok_or(bad)?;
    let free=o["freePlacement"].as_bool().ok_or(bad)?;
    let rows=o["rows"].as_array().filter(|r|!r.is_empty()&&r.len()<=ddv_save_patch::MAX_GRID_MIXED_EDITS).ok_or(bad)?;
    let mut normal=Vec::new();let mut storage=Vec::new();let mut seen=HashSet::new();
    for row in rows{
        if row.get("copyContents").is_none(){normal.push(row.clone());continue;}
        if row["freePlacement"].as_bool()!=Some(free){return Err(bad);}
        let ordinal=row["localOrdinal"].as_u64().and_then(|n|usize::try_from(n).ok()).filter(|n|*n>0&&seen.insert(*n)).ok_or(bad)?;
        let item=row["itemId"].as_str().and_then(|s|s.parse::<u64>().ok()).ok_or(bad)?;
        let x=row["expectedX"].as_i64().and_then(|n|i32::try_from(n).ok()).ok_or(bad)?;
        let y=row["expectedY"].as_i64().and_then(|n|i32::try_from(n).ok()).ok_or(bad)?;
        let orientation=row["expectedOrientation"].as_str().ok_or(bad)?;
        let target=resolve_grid_orientation_target(profile,ordinal,item,(x,y),"full",orientation)?;
        storage.push((row,target));
    }
    if storage.is_empty(){return Err(bad);}
    let mut working=Zeroizing::new(std::str::from_utf8(profile).map_err(|_|bad)?.to_owned());
    if !normal.is_empty(){
        let next=if normal.iter().any(|r|r.get("scene").is_some()){
            if free{for row in &mut normal{let o=row.as_object_mut().ok_or(bad)?;if o.contains_key("freePlacement"){return Err(bad);}o.insert("freePlacement".into(),Value::Bool(true));}}
            mixed_scene_bounded_mode(profile,&Value::Array(normal),MAX_SCENE_FURNITURE,free)?
        }else{plain_group_paste_with_mode(profile,&serde_json::to_string(&normal).map_err(|_|bad)?,ddv_save_patch::MAX_GRID_MIXED_EDITS,free)?};
        working.zeroize();*working=next;
    }
    for (row,target) in storage{
        let next=storage_duplicate_with_target(working.as_bytes(),row,Some(&target))?;
        working.zeroize();*working=next;
    }
    Ok(std::mem::take(&mut *working))
}
/// Source-bound mixed duplication, using the same native pose contract as
/// cut/paste. Each state adapter allocates its own verified native identities.
fn mixed_native_duplicate(profile:&[u8],plan:&Value)->Result<String,CodecError>{
    use zeroize::{Zeroize,Zeroizing};
    let bad=CodecError::Json;
    let o=plan.as_object().filter(|o|o.len()==2).ok_or(bad)?;
    let copy=o.get("copyContents").and_then(Value::as_bool).ok_or(bad)?;
    let rows=o.get("rows").and_then(Value::as_array).filter(|a|!a.is_empty()&&a.len()<=ddv_save_patch::MAX_GRID_MIXED_EDITS).ok_or(bad)?;
    let root:Value=serde_json::from_slice(profile).map_err(|_|bad)?;
    if root["GameInfo"]["Version"].as_u64()!=Some(643){return Err(bad);}
    let (scan,_)=scan_grid_instances(profile)?;
    if scan.sampled||scan.invalid>0{return Err(bad);}
    let mut seen=HashSet::new();let mut sources=Vec::new();
    for row in rows{
        let r=row.as_object().filter(|r|r.len()==9+usize::from(r.contains_key("supportFactor"))+usize::from(r.contains_key("storage"))&&["localOrdinal","itemId","expectedX","expectedY","expectedOrientation","destination","x","y","orientation"].iter().all(|k|r.contains_key(*k))).ok_or(bad)?;
        let ordinal=r["localOrdinal"].as_u64().and_then(|n|usize::try_from(n).ok()).filter(|n|*n>0&&seen.insert(*n)).ok_or(bad)?;
        let item=r["itemId"].as_str().and_then(|s|s.parse::<u64>().ok().filter(|n|n.to_string()==s&&matches!(n/100_000,200..=203|205|400|402))).ok_or(bad)?;
        let int=|k:&str|r.get(k).and_then(Value::as_i64).and_then(|n|i32::try_from(n).ok()).ok_or(bad);
        let old=(int("expectedX")?,int("expectedY")?);let xy=(int("x")?,int("y")?);
        let ori=r["expectedOrientation"].as_str().filter(|s|ddv_save_patch::OBSERVED_CARDINAL_ORIENTATIONS.contains(s)).ok_or(bad)?;
        let new=r["orientation"].as_str().filter(|s|ddv_save_patch::OBSERVED_CARDINAL_ORIENTATIONS.contains(s)).ok_or(bad)?;
        let (target,pos)=scan.private_targets.get(ordinal-1).ok_or(bad)?;
        if target.kind!=GridObjectKind::Full||target.item_id!=item||*pos!=Some(old)||scan.rows.get(ordinal-1).and_then(|r|r.get("orientation")).and_then(Value::as_str)!=Some(ori){return Err(bad);}
        let from=house_exterior_identity(&root,&target.grid_id)?;
        let d=resolve_plain_grid_destination(profile,&r["destination"])?;
        let to=house_exterior_identity(&root,&d.grid_id)?;
        if to.1!=d.layout_path||to.2!=u64::from(d.tessellation)||to.3!=u64::from(d.size.0)||to.4!=u64::from(d.size.1)||old.0<0||old.1<0||old.0 as u64>=from.2*from.3||old.1 as u64>=from.2*from.4||xy.0<0||xy.1<0||xy.0 as u64>=to.2*to.3||xy.1 as u64>=to.2*to.4{return Err(bad);}
        let support=r.get("supportFactor").map(|v|v.as_u64().filter(|n|*n==from.2&&*n==to.2).ok_or(bad)).transpose()?.is_some();
        let storage=r.get("storage").map(|v|v.as_bool().filter(|v|*v).ok_or(bad)).transpose()?.unwrap_or(false);
        if support!=scan.subgrid_parents.contains(&ordinal)||support&&storage||item/100_000!=400&&(support||storage)||item/100_000!=400&&(from.0!=to.0||from.2!=to.2||ori!=new){return Err(bad);}
        let obj=&root["World"]["GridCollection"]["Grids"][&target.grid_id]["Objects"][&target.object_id];
        if storage&&!ddv_save_patch::storage_transform_pose(&root,obj)||!storage&&!support&&item/100_000==400&&(crate::storage_source::is_storage(item)||obj.get("State").is_some_and(|s|!s.is_null())){return Err(bad);}
        if support&&from.0!=to.0{return Err(bad);}
        let refs=grid_identity_dependencies(profile,target)?;
        if if character_house_exterior(item){refs.active+refs.related+refs.unknown>0}else{refs.blocking()>0}{return Err(bad);}
        sources.push((row,target.clone(),old,xy,ori,new,support,storage,from,d));
    }
    let mut working=Zeroizing::new(std::str::from_utf8(profile).map_err(|_|bad)?.to_owned());
    for (row,target,old,xy,ori,new,support,storage,from,d) in sources{
        let now:Value=serde_json::from_str(&working).map_err(|_|bad)?;
        let fresh=now["World"]["GridCollection"]["Grids"][&d.grid_id]["NextGridObjectID"].as_u64().filter(|n|*n>0&&*n<u32::MAX as u64).ok_or(bad)?.to_string();
        let refs=grid_identity_dependencies_for_ids(working.as_bytes(),&d.grid_id,&[fresh])?;
        if refs.blocking()>0||refs.historical>0{return Err(bad);}
        let (scan,_)=scan_grid_instances(working.as_bytes())?;
        if scan.sampled||scan.invalid>0{return Err(bad);}
        let idx=scan.private_targets.iter().position(|(t,pos)|t.kind==target.kind&&t.grid_id==target.grid_id&&t.object_id==target.object_id&&t.item_id==target.item_id&&*pos==Some(old)).ok_or(bad)?;
        let ordinal=idx+1;let id=target.item_id.to_string();let witness=&row["destination"];
        let next=if storage{
            storage_duplicate_with_target(working.as_bytes(),&serde_json::json!({"localOrdinal":ordinal,"itemId":id,"expectedX":old.0,"expectedY":old.1,"expectedOrientation":ori,"destination":witness,"x":xy.0,"y":xy.1,"orientation":new,"copyContents":copy,"freePlacement":true}),Some(&target))?
        }else if support{
            let src=serde_json::json!({"layoutId":from.1,"gridDataPath":now["World"]["GridCollection"]["Grids"][&target.grid_id]["GridDataPath"],"factor":from.2,"sizeX":from.3,"sizeY":from.4});
            free_support_parent_candidate(working.as_bytes(),ordinal,target.item_id,old,xy,witness,(ori!=new).then_some((ori,new)),(target.grid_id!=d.grid_id).then_some(&src),true,None)?.patched_json
        }else{match target.item_id/100_000{
            400=>plain_group_paste_with_mode(working.as_bytes(),&serde_json::json!([{"itemId":id,"destination":witness,"x":xy.0,"y":xy.1,"orientation":new}]).to_string(),ddv_save_patch::MAX_GRID_MIXED_EDITS,true)?,
            402=>landscape_candidate(working.as_bytes(),&serde_json::json!({"action":"duplicate","localOrdinal":ordinal,"itemId":id,"expectedX":old.0,"expectedY":old.1,"x":xy.0,"y":xy.1,"freePlacement":true}).to_string(),&witness.to_string())?,
            205=>player_house_duplicate_candidate(working.as_bytes(),&serde_json::json!({"localOrdinal":ordinal,"itemId":id,"expectedX":old.0,"expectedY":old.1,"orientation":ori,"destination":witness,"x":xy.0,"y":xy.1}),false)?,
            200..=203=>building_duplicate_candidate(working.as_bytes(),&serde_json::json!({"localOrdinal":ordinal,"itemId":id,"expectedX":old.0,"expectedY":old.1,"orientation":ori,"destination":witness,"x":xy.0,"y":xy.1}),false)?,
            _=>return Err(bad)
        }};
        working.zeroize();*working=next;
    }
    Ok(std::mem::take(&mut *working))
}
pub(super) fn group_paste_candidate(profile:&[u8],plan:&str)->Result<String,CodecError>{
    if plan.len()>120*1024{return Err(CodecError::Bounds);}
    let value:Value=serde_json::from_str(plan).map_err(|_|CodecError::Json)?;
    if let Some(o)=value.as_object(){
        if o.len()==1{if let Some(p)=o.get("mixedNativeDuplicate"){return mixed_native_duplicate(profile,p);}if let Some(p)=o.get("storagePickup"){return storage_pickup_candidate(profile,p);}if let Some(p)=o.get("storageDuplicate"){return storage_duplicate_candidate(profile,p);}if let Some(p)=o.get("storageGroup"){return storage_group_candidate(profile,p);}if let Some(p)=o.get("buildingInitial"){return building_initial_candidate(profile,p);}if let Some(p)=o.get("playerHouseDuplicate"){return player_house_duplicate_candidate(profile,p,false);}if let Some(p)=o.get("playerHouseRemove"){return player_house_duplicate_candidate(profile,p,true);}if let Some(p)=o.get("buildingDuplicate"){return building_duplicate_candidate(profile,p,false);}if let Some(p)=o.get("buildingRemove"){return building_duplicate_candidate(profile,p,true);}}
        if o.len()!=2||o.get("freePlacement").and_then(Value::as_bool)!=Some(true){return Err(CodecError::Json);}
        let rows=o.get("rows").and_then(Value::as_array).ok_or(CodecError::Json)?;
        if rows.iter().any(|r|r.get("scene").is_some()){
            let mut rows=rows.clone();
            for row in &mut rows{
                let o=row.as_object_mut().ok_or(CodecError::Json)?;
                if o.contains_key("freePlacement"){return Err(CodecError::Json);}
                o.insert("freePlacement".into(),Value::Bool(true));
            }
            return mixed_scene_bounded_mode(profile,&Value::Array(rows),MAX_SCENE_FURNITURE,true);
        }
        return plain_group_paste_with_mode(profile,&serde_json::to_string(rows).map_err(|_|CodecError::Json)?,ddv_save_patch::MAX_GRID_MIXED_EDITS,true);
    }
    if let Some(rows)=value.as_array().filter(|rows|rows.iter().any(|r|r.get("network").is_some())){return area_scene_candidate(profile,rows);}
    if value.as_array().is_some_and(|rows|rows.iter().any(|r|r.get("scene").is_some())){
        return mixed_scene_candidate(profile,&value);
    }
    plain_group_paste_candidate(profile,plan)
}
/// One private staging transaction. Reuse the same exact destination and
/// allocator checks for each root and never expose a partially placed scene.
fn mixed_scene_candidate(profile:&[u8],value:&Value)->Result<String,CodecError>{
    mixed_scene_bounded(profile,value,MAX_SCENE_FURNITURE)
}
fn mixed_scene_bounded(profile:&[u8],value:&Value,limit:usize)->Result<String,CodecError>{
    mixed_scene_bounded_mode(profile,value,limit,false)
}
fn mixed_scene_bounded_mode(profile:&[u8],value:&Value,limit:usize,free_mode:bool)->Result<String,CodecError>{
    use zeroize::{Zeroize,Zeroizing};
    let bad=CodecError::Json;
    let rows=value.as_array().filter(|r|!r.is_empty()&&r.len()<=limit).ok_or(bad)?;
    let mut total=0usize;
    let mut anchors=HashSet::new();
    let mut destinations=HashMap::<String,ddv_save_patch::PlainGridDestination>::new();
    fn descendants(t:&Value,total:&mut usize,depth:usize)->Result<(),CodecError>{
        if depth>8{return Err(CodecError::Bounds);}
        for o in t.get("objects").and_then(Value::as_array).ok_or(CodecError::Json)?{
            *total+=1;if *total>32{return Err(CodecError::Bounds);}
            let child=o.get("child").ok_or(CodecError::Json)?;
            if !child.is_null(){descendants(child,total,depth+1)?;}
        }Ok(())
    }
    for row in rows{
        let o=row.as_object().filter(|o|o.len()==5+(o.contains_key("scene") as usize)+(o.contains_key("freePlacement") as usize)&&(!o.contains_key("freePlacement")||(free_mode||limit>ddv_save_patch::MAX_GRID_MIXED_EDITS)&&o.get("freePlacement").and_then(Value::as_bool)==Some(true))&&o.keys().all(|k|matches!(k.as_str(),"destination"|"itemId"|"x"|"y"|"orientation"|"scene"|"freePlacement"))).ok_or(bad)?;
        let item=o.get("itemId").and_then(Value::as_str).and_then(|s|s.parse::<u64>().ok().filter(|n|n.to_string()==s&&n/100_000==400)).ok_or(bad)?;
        let int=|k:&str|o.get(k).and_then(Value::as_i64).and_then(|n|i32::try_from(n).ok()).ok_or(bad);
        let xy=(int("x")?,int("y")?);
        let witness=o.get("destination").ok_or(bad)?;let key=witness.to_string();
        if !destinations.contains_key(&key){destinations.insert(key.clone(),resolve_plain_grid_destination(profile,witness)?);}
        let d=destinations.get(&key).ok_or(bad)?;
        if o.get("freePlacement").and_then(Value::as_bool)!=Some(true)&&!anchors.insert((d.grid_id.clone(),xy)){return Err(bad);}
        total+=1;
        if let Some(scene)=o.get("scene"){
            let mut subtree=1;descendants(checked_support_scene(item,scene)?,&mut subtree,0)?;
            total+=subtree-1;
        }
        if total>limit{return Err(CodecError::Bounds);}
    }
    if free_mode||limit>ddv_save_patch::MAX_GRID_MIXED_EDITS{
        use ddv_save_patch::bulk_furniture::{BulkPlace,BulkScenePlace,preview_bulk_scene_place,preview_bulk_storage_scene_place};
        let root:Value=serde_json::from_slice(profile).map_err(|_|bad)?;
        if root.get("GameInfo").and_then(|v|v.get("Version")).and_then(Value::as_u64)!=Some(643){return Err(bad);}
        let grids=root.get("World").and_then(|v|v.get("GridCollection")).and_then(|v|v.get("Grids")).and_then(Value::as_object).ok_or(bad)?;
        let mut checked_world_grids=HashSet::new();let mut places=Vec::new();let mut allocated=HashMap::<String,Vec<String>>::new();let mut templates=HashMap::new();
        for row in rows{
            let witness=&row["destination"];let d=destinations.get(&witness.to_string()).ok_or(bad)?;
            let item=row["itemId"].as_str().ok_or(bad)?.parse::<u64>().map_err(|_|bad)?;
            let x=row["x"].as_i64().and_then(|n|i32::try_from(n).ok()).ok_or(bad)?;
            let y=row["y"].as_i64().and_then(|n|i32::try_from(n).ok()).ok_or(bad)?;
            let orientation=row["orientation"].as_str().ok_or(bad)?;
            let free_placement=row.get("freePlacement").and_then(Value::as_bool)==Some(true);
            if free_placement&&checked_world_grids.insert(witness.to_string()){
                let (_,layout,factor,sx,sy)=house_exterior_identity(&root,&d.grid_id)?;
                if layout!=d.layout_path||factor!=u64::from(d.tessellation)||sx!=u64::from(d.size.0)||sy!=u64::from(d.size.1){return Err(bad);}
            }
            if !ddv_save_patch::OBSERVED_CARDINAL_ORIENTATIONS.contains(&orientation){
                if row.get("scene").is_some()||d.tessellation!=1||!ddv_save_patch::EXPERIMENTAL_EIGHT_WAY_ORIENTATIONS.contains(&orientation){return Err(bad);}
                player_house_grid_scope(&root,&d.grid_id)?;
            }
            let tree=if let Some(scene)=row.get("scene"){
                let scope=d.layout_path.strip_prefix("SceneLayouts/").and_then(|s|s.split('/').next()).ok_or(bad)?;
                if !matches!(scope,"Village04"|"VillageExpansion01"|"VillageExpansion02"|"VillageExpansion03"|"VillageExpansion04"|"VillageWinnieDLC"){island_scope(witness)?;}
                Some(checked_support_scene(item,scene)?)
            }else{None};
            if crate::storage_source::is_storage(item){
                if tree.is_some(){return Err(bad);}
                let (template,capacity)=if let Some(t)=templates.get(&item){*t}else{crate::storage_source::placement_storage_template(&root,item).ok_or(bad)?};
                let (_,layout,factor,sx,sy)=house_exterior_identity(&root,&d.grid_id)?;
                if layout!=d.layout_path||factor!=u64::from(d.tessellation)||sx!=u64::from(d.size.0)||sy!=u64::from(d.size.1){return Err(bad);}
                templates.insert(item,(template,capacity));
            }
            let ids=allocated.entry(d.grid_id.clone()).or_default();
            let next=grids.get(&d.grid_id).and_then(|g|g.get("NextGridObjectID")).and_then(Value::as_u64).ok_or(bad)?;
            let id=next.checked_add(ids.len() as u64).filter(|n|*n<u32::MAX as u64).ok_or(bad)?.to_string();ids.push(id);
            places.push(BulkScenePlace{pose:BulkPlace{destination:d,item_id:item,xy:(x,y),orientation,free_placement},tree});
        }
        for (grid,ids) in allocated{for chunk in ids.chunks(512){let refs=grid_identity_dependencies_for_ids(profile,&grid,chunk)?;if refs.blocking()>0||refs.historical>0{return Err(bad);}}}
        let json=std::str::from_utf8(profile).map_err(|_|bad)?;
        let mut draft=if templates.is_empty(){preview_bulk_scene_place(json,&places)}else{preview_bulk_storage_scene_place(json,&places,&templates)}.map_err(|_|CodecError::Patch)?;
        if !draft.changed||!draft.untouched_bytes_preserved||draft.writer_authorized||draft.export_authorized{draft.patched_json.zeroize();return Err(bad);}
        return Ok(draft.patched_json);
    }
    let mut working=Zeroizing::new(std::str::from_utf8(profile).map_err(|_|bad)?.to_owned());
    let mut cursor=0;
    while cursor<rows.len(){
        let row=&rows[cursor];
        if let Some(scene)=row.get("scene"){
            let item=row["itemId"].as_str().ok_or(bad)?.parse::<u64>().map_err(|_|bad)?;
            let x=row["x"].as_i64().and_then(|n|i32::try_from(n).ok()).ok_or(bad)?;
            let y=row["y"].as_i64().and_then(|n|i32::try_from(n).ok()).ok_or(bad)?;
            let orientation=row["orientation"].as_str().ok_or(bad)?;
            let mut draft=support_scene_place_candidate(working.as_bytes(),item,(x,y),&row["destination"],orientation,scene)?;
            if !draft.changed||!draft.untouched_bytes_preserved||draft.writer_authorized||draft.export_authorized{draft.patched_json.zeroize();return Err(bad);}
            working.zeroize();*working=std::mem::take(&mut draft.patched_json);cursor+=1;
        }else{
            let end=if limit>ddv_save_patch::MAX_GRID_MIXED_EDITS{cursor+rows[cursor..].iter().take_while(|r|r.get("scene").is_none()).count()}else{cursor+1};
            let plan=serde_json::to_string(&rows[cursor..end]).map_err(|_|bad)?;
            let draft=plain_group_paste_bounded(working.as_bytes(),&plan,limit)?;cursor=end;
            working.zeroize();*working=draft;
        }
    }
    Ok(std::mem::take(&mut *working))
}
fn plain_group_paste_candidate(profile:&[u8],plan:&str)->Result<String,CodecError>{
    plain_group_paste_bounded(profile,plan,ddv_save_patch::MAX_GRID_MIXED_EDITS)
}
fn plain_group_paste_bounded(profile:&[u8],plan:&str,limit:usize)->Result<String,CodecError>{
    plain_group_paste_with_mode(profile,plan,limit,false)
}
fn plain_group_paste_with_mode(profile:&[u8],plan:&str,limit:usize,free:bool)->Result<String,CodecError>{
    use ddv_save_patch::{PlainGridDestination,FurnitureStockAction,preview_furniture_stock_transaction};
    use zeroize::{Zeroize,Zeroizing};
    let bad=CodecError::Json;
    if plan.len()>if limit>MAX_SCENE_FURNITURE{2_000_000}else{120*1024}{return Err(CodecError::Bounds);}
    let root:Value=serde_json::from_slice(profile).map_err(|_|bad)?;
    if root.get("GameInfo").and_then(|g|g.get("Version")).and_then(Value::as_u64)!=Some(643){return Err(bad);}
    let value:Value=serde_json::from_str(plan).map_err(|_|bad)?;
    let rows=value.as_array().filter(|a|!a.is_empty()&&a.len()<=limit).ok_or(bad)?;
    let grids=root.get("World").and_then(|v|v.get("GridCollection")).and_then(|v|v.get("Grids")).and_then(Value::as_object).ok_or(bad)?;
    let inventory=root.get("Player").and_then(|p|p.get("ListInventories")).and_then(|m|m.get("0")).and_then(|r|r.get("Inventory")).and_then(Value::as_object).ok_or(bad)?;
    let mut destinations=HashMap::<String,PlainGridDestination>::new();
    let mut checked_world_grids=HashSet::new();let mut poses=Vec::new();let mut anchors=HashSet::new();let mut count_by_grid=HashMap::<String,u64>::new();let mut counts=HashMap::<u64,(u32,u32)>::new();
    for row in rows{
        let o=row.as_object().filter(|o|((o.len()==5&&!o.contains_key("freePlacement"))||(limit>ddv_save_patch::MAX_GRID_MIXED_EDITS&&o.len()==6&&o.get("freePlacement").and_then(Value::as_bool)==Some(true)))&&o.keys().all(|k|matches!(k.as_str(),"destination"|"itemId"|"x"|"y"|"orientation"|"freePlacement"))).ok_or(bad)?;
        let witness=o.get("destination").ok_or(bad)?;let key=witness.to_string();
        if !destinations.contains_key(&key){destinations.insert(key.clone(),resolve_plain_grid_destination(profile,witness)?);}
        let d=destinations.get(&key).ok_or(bad)?;
        let row_free=free||o.get("freePlacement").and_then(Value::as_bool)==Some(true);
        if row_free&&checked_world_grids.insert(key.clone()){
            let (_,layout,factor,sx,sy)=house_exterior_identity(&root,&d.grid_id)?;
            if layout!=d.layout_path||factor!=u64::from(d.tessellation)||sx!=u64::from(d.size.0)||sy!=u64::from(d.size.1){return Err(bad);}
        }
        let item=o.get("itemId").and_then(Value::as_str).and_then(|s|s.parse::<u64>().ok().filter(|n|n.to_string()==s&&n/100_000==400)).ok_or(bad)?;
        let int=|k:&str|o.get(k).and_then(Value::as_i64).and_then(|n|i32::try_from(n).ok()).ok_or(bad);
        let (x,y)=(int("x")?,int("y")?);
        let orientation=o.get("orientation").and_then(Value::as_str).filter(|s|ddv_save_patch::OBSERVED_CARDINAL_ORIENTATIONS.contains(s)||(free||limit>ddv_save_patch::MAX_GRID_MIXED_EDITS)&&d.tessellation==1&&ddv_save_patch::EXPERIMENTAL_EIGHT_WAY_ORIENTATIONS.contains(s)).ok_or(bad)?;
        if !ddv_save_patch::OBSERVED_CARDINAL_ORIENTATIONS.contains(&orientation){player_house_grid_scope(&root,&d.grid_id)?;}
        if x<0||y<0||x as u32>=d.size.0*d.tessellation||y as u32>=d.size.1*d.tessellation||!row_free&&!anchors.insert((d.grid_id.clone(),x,y)){return Err(bad);}
        let grid=grids.get(&d.grid_id).ok_or(bad)?;
        let objects=grid.get("Objects").and_then(Value::as_object).ok_or(bad)?;
        // Ground paths may remain under furniture. Do not silently stack new
        // ordinary furniture on another non-ground anchor.
        if !row_free&&objects.values().any(|v|v.get("ItemID").and_then(Value::as_u64).is_none_or(|n|n/100_000!=401)&&v.get("X").and_then(Value::as_i64)==Some(i64::from(x))&&v.get("Y").and_then(Value::as_i64)==Some(i64::from(y))){return Err(bad);}
        *count_by_grid.entry(d.grid_id.clone()).or_default()+=1;
        let stock=inventory.get(&item.to_string()).and_then(|v|v.get("Amount")).and_then(Value::as_u64).and_then(|n|u32::try_from(n).ok()).ok_or(bad)?;
        let c=counts.entry(item).or_insert((stock,0));c.1+=1;if c.1>c.0{return Err(bad);}
        poses.push((key,item,(x,y),orientation.to_owned(),row_free));
    }
    for (grid,count) in count_by_grid{
        let next=grids.get(&grid).and_then(|v|v.get("NextGridObjectID")).and_then(Value::as_u64).ok_or(bad)?;
        let ids=(0..count).map(|offset|next.checked_add(offset).filter(|n|*n<u32::MAX as u64).map(|n|n.to_string()).ok_or(bad)).collect::<Result<Vec<_>,_>>()?;
        for chunk in ids.chunks(512){let refs=grid_identity_dependencies_for_ids(profile,&grid,chunk)?;if refs.blocking()>0||refs.historical>0{return Err(bad);}}
    }
    if limit>ddv_save_patch::MAX_GRID_MIXED_EDITS{
        use ddv_save_patch::bulk_furniture::{BulkPlace,BulkScenePlace,preview_bulk_furniture,preview_bulk_storage_scene_place};
        let places=poses.iter().map(|(key,item,xy,orientation,row_free)|Ok(BulkPlace{destination:destinations.get(key).ok_or(bad)?,item_id:*item,xy:*xy,orientation,free_placement:*row_free})).collect::<Result<Vec<_>,CodecError>>()?;
        let mut templates=HashMap::new();
        for p in &places{if crate::storage_source::is_storage(p.item_id){
            let (template,capacity)=if let Some(t)=templates.get(&p.item_id){*t}else{crate::storage_source::placement_storage_template(&root,p.item_id).ok_or(bad)?};
            let (_,layout,factor,sx,sy)=house_exterior_identity(&root,&p.destination.grid_id)?;
            if layout!=p.destination.layout_path||factor!=u64::from(p.destination.tessellation)||sx!=u64::from(p.destination.size.0)||sy!=u64::from(p.destination.size.1){return Err(bad);}
            templates.insert(p.item_id,(template,capacity));
        }}
        let json=std::str::from_utf8(profile).map_err(|_|bad)?;
        let mut draft=if templates.is_empty(){preview_bulk_furniture(json,&[],&places)}else{
            let rows=places.into_iter().map(|pose|BulkScenePlace{pose,tree:None}).collect::<Vec<_>>();
            preview_bulk_storage_scene_place(json,&rows,&templates)
        }.map_err(|_|CodecError::Patch)?;
        if !draft.changed||!draft.untouched_bytes_preserved||draft.writer_authorized||draft.export_authorized{draft.patched_json.zeroize();return Err(CodecError::Patch);}
        return Ok(draft.patched_json);
    }
    let mut working=Zeroizing::new(std::str::from_utf8(profile).map_err(|_|bad)?.to_owned());
    for (key,item,xy,orientation,row_free) in poses{
        let amount=&mut counts.get_mut(&item).ok_or(bad)?.0;
        let dest=destinations.get(&key).ok_or(bad)?;
        let mut draft=if crate::storage_source::is_storage(item){
            let (_,layout,factor,sx,sy)=house_exterior_identity(&root,&dest.grid_id)?;
            if layout!=dest.layout_path||factor!=u64::from(dest.tessellation)||sx!=u64::from(dest.size.0)||sy!=u64::from(dest.size.1){return Err(bad);}
            let (template,capacity)=crate::storage_source::placement_storage_template(&root,item).ok_or(bad)?;
            ddv_save_patch::preview_initial_storage(&working,dest,item,xy,&orientation,*amount,template,capacity,false,row_free)
        }else{preview_furniture_stock_transaction(&working,*amount,FurnitureStockAction::Place{destination:dest,item_id:item,xy,orientation:&orientation})}.map_err(|_|CodecError::Patch)?;
        if !draft.changed||!draft.untouched_bytes_preserved||draft.writer_authorized||draft.export_authorized{draft.patched_json.zeroize();return Err(CodecError::Patch);}
        working.zeroize();*working=draft.patched_json;*amount-=1;
    }
    Ok(std::mem::take(&mut *working))
}

/// One biome furniture replacement: preserve every unselected record and
/// apply pickup + placement privately. The source witness is resolved on
/// the immutable original; only ordinary leaf furniture is accepted by the
/// existing stock transaction. No intermediate Save leaves this function.
const MAX_AREA_FURNITURE_CHANGES:usize=2048;
pub(super) fn biome_furniture_candidate(profile:&[u8],plan:&str)->Result<String,CodecError>{
 use zeroize::{Zeroize,Zeroizing};
 let bad=CodecError::Json;
 if plan.len()>2_000_000{return Err(CodecError::Bounds);}
 let v:Value=serde_json::from_str(plan).map_err(|_|bad)?;
 let o=v.as_object().filter(|o|o.len()==3&&o.keys().all(|k|matches!(k.as_str(),"destination"|"remove"|"add"))).ok_or(bad)?;
 let witness=o.get("destination").ok_or(bad)?;
 // Only the eight original Valley biome root layouts.
 let layout=witness.get("layoutId").and_then(Value::as_str).ok_or(bad)?;
 if !["Beach","Cliff","DarkMountains","Forest","Meadow","Savannah","Urban","Wetland"].iter().any(|key|layout==format!("SceneLayouts/Village04/DefaultVillageLayout01-{key}Grids.json")){return Err(bad);}
 let d=resolve_plain_grid_destination(profile,witness)?;
 let remove=o.get("remove").and_then(Value::as_array).ok_or(bad)?;
 let add=o.get("add").and_then(Value::as_array).ok_or(bad)?;
 if remove.len()+add.len()==0||remove.len()+add.len()>MAX_AREA_FURNITURE_CHANGES{return Err(CodecError::Bounds);}
 // Every new pose must target exactly the selected original grid. The
 // plain writer rejects unsupported state, stock and occupied anchors.
 if add.iter().any(|p|p.get("destination")!=Some(witness)){return Err(bad);}
 let mut working=Zeroizing::new(std::str::from_utf8(profile).map_err(|_|bad)?.to_owned());
 if !remove.is_empty(){
  let r=group_pickup_bounded(profile,&serde_json::to_string(remove).map_err(|_|bad)?,1,Some(&d.grid_id),MAX_AREA_FURNITURE_CHANGES)?;
  working.zeroize();*working=r;
 }
 if !add.is_empty(){
  let r=plain_group_paste_bounded(working.as_bytes(),&serde_json::to_string(add).map_err(|_|bad)?,MAX_AREA_FURNITURE_CHANGES)?;
  working.zeroize();*working=r;
 }
 Ok(std::mem::take(&mut *working))
}

/// Atomic whole-island ordinary furniture replacement. Every exact full
/// destination must belong to the same playable island. All removals resolve
/// on the immutable source before any ordinal can shift. Returned inventory
/// is available to every destination, and no intermediate copy is emitted.
/// Match an exact source-published world grid and its dimensions.
fn world_grid_scope(witness:&Value)->Result<(String,usize),CodecError>{
 let bad=CodecError::Json;
 let layout=witness["layoutId"].as_str().ok_or(bad)?;
 let scope=layout.split('/').nth(1).filter(|s|matches!(*s,"Village04"|"VillageExpansion01"|"VillageExpansion02"|"VillageExpansion03"|"VillageExpansion04"|"VillageWinnieDLC")).ok_or(bad)?;
 let catalog:Value=serde_json::from_str(include_str!("../../../static/ddv/world/steam-1.26.2/index.json")).map_err(|_|bad)?;
 let entry=catalog["entries"].as_array().ok_or(bad)?.iter().find(|e|e["scope"].as_str()==Some(scope)).ok_or(bad)?;
 let grids=entry["grids"].as_array().filter(|g|!g.is_empty()&&g.len()<=64).ok_or(bad)?;
 if grids.iter().filter(|g|g["layoutId"]==witness["layoutId"]&&g["gridDataPath"]==witness["gridDataPath"]&&g["sizeX"]==witness["sizeX"]&&g["sizeY"]==witness["sizeY"]).count()!=1{return Err(bad);}
 Ok((scope.to_owned(),grids.len()))
}
fn island_scope(witness:&Value)->Result<(String,usize),CodecError>{
 let bad=CodecError::Json;
  let layout=witness.get("layoutId").and_then(Value::as_str).ok_or(bad)?;
  let data=witness.get("gridDataPath").and_then(Value::as_str).ok_or(bad)?;
  let family=layout.strip_prefix("SceneLayouts/FloatingIslands/").and_then(|s|s.split('/').next()).ok_or(bad)?;
  let name=family.strip_prefix("FloatingIsland_").ok_or(bad)?;
  if !["Atlantean","Beach","Dark","Desert","FairyTales","Forest","Jungle","Library","Meadow","Mythology","Savannah","Snow","Urban","Wetlands"].contains(&name)||
   layout!=format!("SceneLayouts/FloatingIslands/{family}/{family}Layout.json")||
   !data.starts_with(&format!("GridData/FloatingIslands/{}/{family}",if name=="Desert"{"FloatingIlsnad_Desert"}else{family})){return Err(bad);}
  let expected=match name{"Desert"|"Jungle"|"Meadow"=>4,"Atlantean"|"FairyTales"|"Library"|"Mythology"|"Wetlands"=>2,_=>1};
  Ok((layout.to_owned(),expected))
}
pub(super) fn island_furniture_candidate(profile:&[u8],plan:&str)->Result<String,CodecError>{
 island_area_candidate(profile,plan,false)
}
pub(super) fn island_decoration_candidate(profile:&[u8],plan:&str)->Result<String,CodecError>{
 island_area_candidate(profile,plan,true)
}
type HouseLayoutPose=(u64,i32,i32,usize);
fn house_layout_poses(v:&Value,d:&ddv_save_patch::PlainGridDestination)->Result<Vec<HouseLayoutPose>,CodecError>{
 let bad=CodecError::Json;
 let rows=v.as_array().filter(|a|a.len()<=128).ok_or(bad)?;
 rows.iter().map(|p|{
  let o=p.as_object().filter(|o|o.len()==4&&o.keys().all(|k|matches!(k.as_str(),"itemId"|"x"|"y"|"orientation"))).ok_or(bad)?;
  let item=o["itemId"].as_u64().filter(|n|*n/100_000==205).ok_or(bad)?;
  let coord=|key:&str,size:u32|o[key].as_u64().filter(|n|*n<u64::from(size)*u64::from(d.tessellation)).and_then(|n|i32::try_from(n).ok()).ok_or(bad);
  Ok((item,coord("x",d.size.0)?,coord("y",d.size.1)?,o["orientation"].as_u64().filter(|n|*n<4).ok_or(bad)? as usize))
 }).collect()
}
/// Exact full-world exterior replacement. Retain matching records, clone
/// from checked existing interiors before removing any redundant exterior.
fn player_house_layout_candidate(profile:&[u8],rows:&[Value])->Result<String,CodecError>{
 use ddv_save_patch::{GridMixedEdit,OBSERVED_CARDINAL_ORIENTATIONS as DIR};
 use zeroize::{Zeroize,Zeroizing};
 let bad=CodecError::Json;
 let root:Value=serde_json::from_slice(profile).map_err(|_|bad)?;
 if root["GameInfo"]["Version"].as_u64()!=Some(643){return Err(bad);}
 let world=&root["World"];let grids=world["GridCollection"]["Grids"].as_object().ok_or(bad)?;
 let mut scope=None::<String>;let mut count=0;let mut verified=HashSet::new();
 let mut sources=HashMap::<(u64,u32),(GridCoordinateTarget,HouseLayoutPose)>::new();
 let mut states=HashMap::<u64,serde_json::Map<String,Value>>::new();
 let mut wanted=HashSet::new();let mut remove=Vec::<(GridCoordinateTarget,HouseLayoutPose)>::new();let mut add=Vec::<(Value,HouseLayoutPose,u32)>::new();
 for row in rows{
  let o=row.as_object().filter(|m|m.len()==3&&m.keys().all(|k|matches!(k.as_str(),"destination"|"before"|"after"))).ok_or(bad)?;
  let witness=&o["destination"];let (name,n)=world_grid_scope(witness)?;
  if scope.as_ref().is_some_and(|s|s!=&name){return Err(bad);}scope=Some(name.clone());count=n;
  let d=resolve_plain_grid_destination(profile,witness)?;
  if player_house_grid_scope(&root,&d.grid_id)?!=name||!verified.insert(d.grid_id.clone()){return Err(bad);}
  let mut before=house_layout_poses(&o["before"],&d)?;let after=house_layout_poses(&o["after"],&d)?;
  let mut actual=Vec::<(GridCoordinateTarget,HouseLayoutPose)>::new();
  for (oid,v) in grids[&d.grid_id]["Objects"].as_object().ok_or(bad)?{
   let item=v["ItemID"].as_u64().ok_or(bad)?;if item/100_000!=205{continue;}
   let (x,y)=observed_coordinates(v.as_object().ok_or(bad)?).ok_or(bad)?;
   let direction=v["Orientation"].as_str().and_then(|s|DIR.iter().position(|n|*n==s)).ok_or(bad)?;
   let target=GridCoordinateTarget{kind:GridObjectKind::Full,grid_id:d.grid_id.clone(),object_id:oid.clone(),item_id:item};
   let state=ddv_save_patch::checked_player_house_state(world,&target,(x,y),DIR[direction]).map_err(|_|bad)?;
   if states.get(&item).is_some_and(|s|s!=state){return Err(bad);}states.entry(item).or_insert_with(||state.clone());
   let p=(item,x,y,direction);sources.entry((item,d.tessellation)).or_insert_with(||(target.clone(),p));actual.push((target,p));
  }
  let mut observed=actual.iter().map(|(_,p)|*p).collect::<Vec<_>>();before.sort_unstable();observed.sort_unstable();if observed!=before{return Err(bad);}
  for p in after{
   wanted.insert((p.0,d.tessellation));
   if let Some(i)=actual.iter().position(|(_,q)|q==&p){actual.remove(i);}else{add.push((witness.clone(),p,d.tessellation));}
  }
  remove.extend(actual);
 }
 if verified.len()!=count||scope.is_none()||sources.len()!=wanted.len()||sources.keys().any(|k|!wanted.contains(k))||add.len()+remove.len()>128||add.is_empty()&&remove.is_empty(){return Err(bad);}
 if grids.iter().any(|(k,g)|(g["GridDefaultLayoutPath"].as_str().and_then(|s|s.split('/').nth(1))==scope.as_deref()||g["GridDefaultLayoutPath"].as_str()==Some("")&&outdoor_catalog_identity(g).ok().is_some_and(|v|Some(v.0.as_str())==scope.as_deref()))&&!verified.contains(k)){return Err(bad);}
 let mut working=Zeroizing::new(std::str::from_utf8(profile).map_err(|_|bad)?.to_owned());
 for (witness,(item,x,y,dir),factor) in add{
  let (source,old)=sources.get(&(item,factor)).ok_or(bad)?;
  let refs=grid_identity_dependencies(working.as_bytes(),source)?;
  if refs.active>0||refs.related>0||refs.unknown>0{return Err(bad);}
  let d=resolve_plain_grid_destination(working.as_bytes(),&witness)?;
  let current:Value=serde_json::from_str(&working).map_err(|_|bad)?;
  let fresh=current["World"]["GridCollection"]["Grids"][&d.grid_id]["NextGridObjectID"].as_u64().ok_or(bad)?.to_string();
  let mut copy=ddv_save_patch::preview_player_house_duplicate(&working,source,(old.1,old.2),&d,(x,y),DIR[old.3]).map_err(|_|CodecError::Patch)?;
  if dir!=old.3{
   let target=GridCoordinateTarget{kind:GridObjectKind::Full,grid_id:d.grid_id.clone(),object_id:fresh,item_id:item};
   let edit=GridMixedEdit{target,expected:(x,y),position:None,orientation:Some((DIR[old.3].to_owned(),DIR[dir].to_owned()))};
   let rotated=ddv_save_patch::preview_existing_grid_mixed_batch(&copy.patched_json,&[edit]).map_err(|_|CodecError::Patch)?;
   copy.patched_json.zeroize();copy=rotated;
  }
  working.zeroize();*working=std::mem::take(&mut copy.patched_json);
 }
 for (target,p) in remove{
  if grid_identity_dependencies(working.as_bytes(),&target)?.blocking()>0{return Err(bad);}
  let mut copy=ddv_save_patch::preview_player_house_remove(&working,&target,(p.1,p.2),DIR[p.3],&verified).map_err(|_|CodecError::Patch)?;
  working.zeroize();*working=std::mem::take(&mut copy.patched_json);
 }
 let after:Value=serde_json::from_str(&working).map_err(|_|bad)?;
 if after["World"]["PlayerHouses"]!=root["World"]["PlayerHouses"]||after["Player"]!=root["Player"]{return Err(bad);}
 Ok(std::mem::take(&mut *working))
}
fn building_layout_poses(v:&Value,d:&ddv_save_patch::PlainGridDestination)->Result<Vec<HouseLayoutPose>,CodecError>{
 let bad=CodecError::Json;
 let rows=v.as_array().filter(|a|a.len()<=256).ok_or(bad)?;
 rows.iter().map(|p|{
  let o=p.as_object().filter(|o|o.len()==4&&o.keys().all(|k|matches!(k.as_str(),"itemId"|"x"|"y"|"orientation"))).ok_or(bad)?;
  let item=o["itemId"].as_u64().filter(|n|matches!(*n/100_000,200..=203)).ok_or(bad)?;
  let coord=|key:&str,size:u32|o[key].as_u64().filter(|n|*n<u64::from(size)*u64::from(d.tessellation)).and_then(|n|i32::try_from(n).ok()).ok_or(bad);
  Ok((item,coord("x",d.size.0)?,coord("y",d.size.1)?,o["orientation"].as_u64().filter(|n|*n<4).ok_or(bad)? as usize))
 }).collect()
}
/// Restore only the unambiguous unmatched existing building of each ItemID
/// family, never allocate, delete, transfer, or reconstruct its native State.
fn building_layout_candidate(profile:&[u8],rows:&[Value])->Result<String,CodecError>{
 building_layout_candidate_scoped(profile,rows,true)
}
fn building_layout_candidate_scoped(profile:&[u8],rows:&[Value],whole_world:bool)->Result<String,CodecError>{
 if !whole_world&&rows.len()!=1{return Err(CodecError::Json);}
 use ddv_save_patch::{GridMixedEdit,OBSERVED_CARDINAL_ORIENTATIONS as DIR};
 use zeroize::{Zeroize,Zeroizing};
 let bad=CodecError::Json;
 let root:Value=serde_json::from_slice(profile).map_err(|_|bad)?;
 if root["GameInfo"]["Version"].as_u64()!=Some(643){return Err(bad);}
 let grids=root["World"]["GridCollection"]["Grids"].as_object().ok_or(bad)?;
 let mut scope=None::<String>;let mut count=0;let mut verified=HashSet::new();let mut edits=Vec::<GridMixedEdit>::new();
 let mut clones=Vec::new();let mut removals=Vec::new();
 for row in rows{
  let o=row.as_object().filter(|m|(m.len()==3||m.len()==4&&m.get("freePlacement").and_then(Value::as_bool)==Some(true))&&m.keys().all(|k|matches!(k.as_str(),"destination"|"before"|"after"|"freePlacement"))).ok_or(bad)?;
  let free=o.get("freePlacement").and_then(Value::as_bool)==Some(true);
  let witness=&o["destination"];let (name,n)=world_grid_scope(witness)?;
  if scope.as_ref().is_some_and(|s|s!=&name){return Err(bad);}scope=Some(name.clone());count=n;
  let d=resolve_plain_grid_destination(profile,witness)?;
  if player_house_grid_scope(&root,&d.grid_id)?!=name||!verified.insert(d.grid_id.clone()){return Err(bad);}
  let mut before=building_layout_poses(&o["before"],&d)?;let after=building_layout_poses(&o["after"],&d)?;
  let families=after.iter().map(|p|p.0).collect::<HashSet<_>>();
  let mut actual=Vec::<(GridCoordinateTarget,HouseLayoutPose)>::new();
  for (oid,v) in grids[&d.grid_id]["Objects"].as_object().ok_or(bad)?{
   let item=v["ItemID"].as_u64().ok_or(bad)?;if !families.contains(&item){continue;}
   let (x,y)=observed_coordinates(v.as_object().ok_or(bad)?).ok_or(bad)?;
   let direction=v["Orientation"].as_str().and_then(|s|DIR.iter().position(|n|*n==s)).ok_or(bad)?;
   if v["ID"].as_u64()!=key_id(oid){return Err(bad);}
   let target=GridCoordinateTarget{kind:GridObjectKind::Full,grid_id:d.grid_id.clone(),object_id:oid.clone(),item_id:item};
   actual.push((target,(item,x,y,direction)));
  }
  let mut observed=actual.iter().map(|(_,p)|*p).collect::<Vec<_>>();before.sort_unstable();observed.sort_unstable();if observed!=before{return Err(bad);}
  actual.sort_by_key(|(t,_)|key_id(&t.object_id));
  let mut ids=families.iter().copied().collect::<Vec<_>>();ids.sort_unstable();
  for id in ids{
   let mut old=actual.iter().filter(|(_,p)|p.0==id).cloned().collect::<Vec<_>>();
   let mut wanted=after.iter().filter(|p|p.0==id).copied().collect::<Vec<_>>();
   wanted.sort_unstable();
   if old.is_empty(){return Err(bad);}
   let count_change=old.len()!=wanted.len();
   let source=old[0].clone();
   if count_change{
    if !free{return Err(bad);}
    let state=grids[&d.grid_id]["Objects"][&source.0.object_id].get("State");
    // Count-changing layouts have no instance state in the preset. Only
    // identical, clone-safe source families may gain or lose instances.
    for (t,_) in &old{
     validate_building_transform(profile,t)?;
     let refs=grid_identity_dependencies(profile,t)?;
     if refs.blocking()>0||refs.historical>0||grids[&d.grid_id]["Objects"][&t.object_id].get("State")!=state{return Err(bad);}
    }
    if !building_clone_state(id,state){return Err(bad);}
   }
   let mut pending=Vec::new();
   for p in wanted{if let Some(k)=old.iter().position(|(_,q)|q==&p){old.remove(k);}else{pending.push(p);}}
   if old.len()>1&&!pending.is_empty(){return Err(bad);}
   for p in pending{
    if let Some((target,previous))=old.pop(){
     validate_building_transform(profile,&target)?;
     let (sx,sy)=building_transform_grid_size(&root,&d.grid_id)?;
     let within=|(x,y):(i32,i32)|x>=0&&y>=0&&(x as u64)<sx&&(y as u64)<sy;
     if !within((previous.1,previous.2))||!within((p.1,p.2)){return Err(bad);}
     edits.push(GridMixedEdit{target,expected:(previous.1,previous.2),position:((p.1,p.2)!=(previous.1,previous.2)).then_some((p.1,p.2)),orientation:(p.3!=previous.3).then(||(DIR[previous.3].to_owned(),DIR[p.3].to_owned()))});
    }else{
     if !count_change{return Err(bad);}
     clones.push((source.clone(),d.clone(),p));
    }
   }
   if !old.is_empty()&&!count_change{return Err(bad);}
   for entry in old{removals.push(entry);}
  }
 }
 if (whole_world&&verified.len()!=count)||scope.is_none()||edits.is_empty()&&clones.is_empty()&&removals.is_empty()||edits.len()+clones.len()+removals.len()>256{return Err(bad);}
 if whole_world&&grids.iter().any(|(k,g)|(g["GridDefaultLayoutPath"].as_str().and_then(|s|s.split('/').nth(1))==scope.as_deref()||g["GridDefaultLayoutPath"].as_str()==Some("")&&outdoor_catalog_identity(g).ok().is_some_and(|v|Some(v.0.as_str())==scope.as_deref()))&&!verified.contains(k)){return Err(bad);}
 let mut working=Zeroizing::new(std::str::from_utf8(profile).map_err(|_|bad)?.to_owned());
 for ((target,old),destination,new) in clones{
  let mut copy=ddv_save_patch::preview_checked_building_duplicate_oriented(&working,&target,(old.1,old.2),&destination,(new.1,new.2),DIR[old.3],DIR[new.3]).map_err(|_|CodecError::Patch)?;
  working.zeroize();*working=std::mem::take(&mut copy.patched_json);
 }
 for (target,old) in removals{
  let mut copy=ddv_save_patch::preview_checked_building_remove(&working,&target,(old.1,old.2),DIR[old.3]).map_err(|_|CodecError::Patch)?;
  working.zeroize();*working=std::mem::take(&mut copy.patched_json);
 }
 for batch in edits.chunks(ddv_save_patch::MAX_GRID_MIXED_EDITS){
  let mut copy=ddv_save_patch::preview_existing_grid_mixed_batch(&working,batch).map_err(|_|CodecError::Patch)?;
  if !copy.changed||!copy.untouched_bytes_preserved||copy.writer_authorized||copy.export_authorized{return Err(bad);}
  working.zeroize();*working=std::mem::take(&mut copy.patched_json);
 }
 Ok(std::mem::take(&mut *working))
}
fn island_area_candidate(profile:&[u8],plan:&str,decoration:bool)->Result<String,CodecError>{
 use zeroize::{Zeroize,Zeroizing};
 let bad=CodecError::Json;
 if plan.len()>if decoration{6_000_000}else{2_000_000}{return Err(CodecError::Bounds);}
 let value:Value=serde_json::from_str(plan).map_err(|_|bad)?;
 let rows=value.as_array().filter(|a|!a.is_empty()&&a.len()<=if decoration{64}else{16}).ok_or(bad)?;
 let (scan,_)=scan_grid_instances(profile)?;
 if scan.sampled||scan.invalid>0{return Err(bad);}
 let mut layout_id=None::<String>;let mut world_mode=None::<bool>;let mut expected_grids=0;let mut grids=HashSet::new();let mut ordinals=HashSet::new();
 let mut remove=Vec::new();let mut add=Vec::new();let mut networks=Vec::new();let mut landscapes=Vec::new();let mut houses=Vec::new();let mut buildings=Vec::new();
 for row in rows{
  let (row,network,landscape,house,building)=if decoration{let m=row.as_object().filter(|m|m.keys().all(|k|matches!(k.as_str(),"furniture"|"network"|"landscape"|"houses"|"buildings"))).ok_or(bad)?;(m.get("furniture").ok_or(bad)?,Some(m.get("network").ok_or(bad)?),m.get("landscape"),m.get("houses"),m.get("buildings"))}else{(row,None,None,None,None)};
  let o=row.as_object().filter(|o|o.len()==3&&o.keys().all(|k|matches!(k.as_str(),"destination"|"remove"|"add"))).ok_or(bad)?;
  let witness=o.get("destination").ok_or(bad)?;
  let (layout,expected,world)=match island_scope(witness){Ok((s,n))=>(s,n,false),Err(_) if decoration=>{let (s,n)=world_grid_scope(witness)?;(s,n,true)},Err(e)=>return Err(e)};
  if layout_id.as_ref().is_some_and(|s|s!=&layout)||world_mode.is_some_and(|v|v!=world){return Err(bad);}
  layout_id=Some(layout);world_mode=Some(world);expected_grids=expected;
  let d=resolve_plain_grid_destination(profile,witness)?;
  if !grids.insert(d.grid_id.clone()){return Err(bad);}
  if let Some(h)=building{if !world||h.get("destination")!=Some(witness){return Err(bad);}building_layout_poses(&h["before"],&d)?;building_layout_poses(&h["after"],&d)?;buildings.push(h.clone());}
  if let Some(h)=house{if !world||h.get("destination")!=Some(witness){return Err(bad);}house_layout_poses(&h["before"],&d)?;house_layout_poses(&h["after"],&d)?;houses.push(h.clone());}
  if let Some(l)=landscape{if l.get("destination")!=Some(witness){return Err(bad);}landscape_destination(profile,witness)?;let free=landscape_free_mode(l)?;landscape_poses(&l["before"],&d,free)?;landscape_poses(&l["after"],&d,free)?;if l["before"]!=l["after"]{landscapes.push(l.clone());}}
  if let Some(network)=network{
   let n=network.as_object().filter(|m|m.len()==3&&m.keys().all(|k|matches!(k.as_str(),"destination"|"before"|"after"))).ok_or(bad)?;
   if n.get("destination")!=Some(witness){return Err(bad);}
   let before=parse_area_network_poses(n.get("before").ok_or(bad)?)?;let after=parse_area_network_poses(n.get("after").ok_or(bad)?)?;
   let old:HashSet<_>=before.iter().copied().collect();let desired:HashSet<_>=after.iter().copied().collect();
   let actual=parse_area_network_poses(&Value::Array(area_network_rows(profile,&d)?))?;
   if old.len()!=before.len()||desired.len()!=after.len()||actual.len()!=old.len()||actual.into_iter().collect::<HashSet<_>>()!=old{return Err(bad);}
   ddv_save_patch::validate_area_network(&d,&before).map_err(|_|bad)?;ddv_save_patch::validate_area_network(&d,&after).map_err(|_|bad)?;
   if old!=desired{networks.push(network.clone());}
  }
  for r in o.get("remove").and_then(Value::as_array).ok_or(bad)?{
   let ordinal=r.get("localOrdinal").and_then(Value::as_u64).and_then(|n|usize::try_from(n).ok()).filter(|n|*n>0).ok_or(bad)?;
   let (target,_)=scan.private_targets.get(ordinal-1).ok_or(bad)?;
   if target.grid_id!=d.grid_id||!ordinals.insert(ordinal){return Err(bad);}
   remove.push(r.clone());
  }
  for a in o.get("add").and_then(Value::as_array).ok_or(bad)?{
   if a.get("destination")!=Some(witness){return Err(bad);}add.push(a.clone());
  }
 }
 if grids.len()!=expected_grids||!houses.is_empty()&&houses.len()!=rows.len()||!buildings.is_empty()&&buildings.len()!=rows.len(){return Err(bad);}
 let root:Value=serde_json::from_slice(profile).map_err(|_|bad)?;
 let full=root.get("World").and_then(|v|v.get("GridCollection")).and_then(|v|v.get("Grids")).and_then(Value::as_object).ok_or(bad)?;
 if full.iter().filter(|(_,g)|{
     let raw=g.get("GridDefaultLayoutPath").and_then(Value::as_str);
     let recovered=if raw==Some(""){outdoor_catalog_identity(g).ok()}else{None};
     let layout=recovered.as_ref().map(|v|v.1.as_str()).or(raw);
     if world_mode==Some(true){layout.and_then(|l|l.split('/').nth(1))==layout_id.as_deref()}else{layout==layout_id.as_deref()}
 }).any(|(key,_)|!grids.contains(key)){return Err(bad);}
 if remove.is_empty()&&add.is_empty()&&networks.is_empty()&&landscapes.is_empty()&&houses.is_empty()&&buildings.is_empty()||remove.len()+add.len()>MAX_AREA_FURNITURE_CHANGES{return Err(CodecError::Bounds);}
 if decoration{check_area_support_change_count(profile,&remove,&add)?;}
 let mut working=Zeroizing::new(std::str::from_utf8(profile).map_err(|_|bad)?.to_owned());
 if !remove.is_empty(){
  let r=group_pickup_bounded(profile,&serde_json::to_string(&remove).map_err(|_|bad)?,1,None,MAX_AREA_FURNITURE_CHANGES)?;
  working.zeroize();*working=r;
 }
 for l in landscapes{let next=landscape_area_candidate(working.as_bytes(),&l)?;working.zeroize();*working=next;}
 for n in networks{
  let next=biome_network_candidate(working.as_bytes(),&serde_json::to_string(&n).map_err(|_|bad)?)?;
  working.zeroize();*working=next;
 }
 if !add.is_empty(){
  let r=if decoration&&add.iter().any(|r|r.get("scene").is_some()){mixed_scene_bounded(working.as_bytes(),&Value::Array(add.clone()),MAX_AREA_FURNITURE_CHANGES)}else{plain_group_paste_bounded(working.as_bytes(),&serde_json::to_string(&add).map_err(|_|bad)?,MAX_AREA_FURNITURE_CHANGES)}?;
  working.zeroize();*working=r;
 }
 if !buildings.is_empty(){let next=building_layout_candidate(working.as_bytes(),&buildings)?;working.zeroize();*working=next;}
 if !houses.is_empty(){let next=player_house_layout_candidate(working.as_bytes(),&houses)?;working.zeroize();*working=next;}
 Ok(std::mem::take(&mut *working))
}

/// Cut is a deferred relocation: no stock changes, no intermediate Save
/// output. Same-grid objects retain their native identities; cross-grid
/// ordinary leaves require unreferenced old and newly allocated identities.
pub(super) fn group_cut_candidate(profile:&[u8],plan:&str)->Result<String,CodecError>{
    use ddv_save_patch::{PlainGridDestination,GridMixedEdit,preview_existing_grid_mixed_batch,preview_plain_world_transfer,preview_support_parent_world_transfer};
    use zeroize::{Zeroize,Zeroizing};
    let bad=CodecError::Json;
    if plan.len()>65536{return Err(CodecError::Bounds);}
    let root:Value=serde_json::from_slice(profile).map_err(|_|bad)?;
    if root.get("GameInfo").and_then(|g|g.get("Version")).and_then(Value::as_u64)!=Some(643){return Err(bad);}
    let value:Value=serde_json::from_str(plan).map_err(|_|bad)?;
    let free=value.is_object();
    let row_value=if free{let o=value.as_object().filter(|o|o.len()==2&&o.get("freePlacement").and_then(Value::as_bool)==Some(true)).ok_or(bad)?;o.get("rows").ok_or(bad)?}else{&value};
    let rows=row_value.as_array().filter(|a|!a.is_empty()&&a.len()<=ddv_save_patch::MAX_GRID_MIXED_EDITS).ok_or(bad)?;
    if rows.iter().any(|r|r.get("supportSource").is_some()){
        if !free||rows.len()>32{return Err(bad);}
        let mut moves=Vec::new();let mut seen=HashSet::new();let mut allocations=HashMap::<String,u64>::new();
        for row in rows{
        let o=row.as_object().filter(|o|o.len()==10&&o.keys().all(|k|matches!(k.as_str(),"localOrdinal"|"supportSource"|"itemId"|"expectedX"|"expectedY"|"expectedOrientation"|"destination"|"x"|"y"|"orientation"))).ok_or(bad)?;
        let ordinal=o.get("localOrdinal").and_then(Value::as_u64).and_then(|n|usize::try_from(n).ok()).ok_or(bad)?;
        let item=o.get("itemId").and_then(Value::as_str).and_then(|s|s.parse::<u64>().ok().filter(|n|n.to_string()==s&&n/100_000==400)).ok_or(bad)?;
        let int=|k:&str|o.get(k).and_then(Value::as_i64).and_then(|n|i32::try_from(n).ok()).ok_or(bad);
        let expected=(int("expectedX")?,int("expectedY")?);
        let target=resolve_support_leaf_cut(profile,ordinal,o.get("supportSource").ok_or(bad)?,item,expected,o.get("expectedOrientation").and_then(Value::as_str).ok_or(bad)?)?;
        let d=resolve_plain_grid_destination(profile,o.get("destination").ok_or(bad)?)?;
        let (scope,layout,factor,sx,sy)=house_exterior_identity(&root,&d.grid_id)?;
        let xy=(int("x")?,int("y")?);
        let orientation=o.get("orientation").and_then(Value::as_str).ok_or(bad)?;
        if layout!=d.layout_path||factor!=u64::from(d.tessellation)||sx!=u64::from(d.size.0)||sy!=u64::from(d.size.1)||xy.0<0||xy.1<0||xy.0 as u64>=sx*factor||xy.1 as u64>=sy*factor||
          !(ddv_save_patch::OBSERVED_CARDINAL_ORIENTATIONS.contains(&orientation)||factor==1&&!scope.starts_with("SceneLayouts/FloatingIslands/")&&ddv_save_patch::EXPERIMENTAL_EIGHT_WAY_ORIENTATIONS.contains(&orientation)){return Err(bad);}
        let grid=&root["World"]["GridCollection"]["Grids"][&d.grid_id];
        let next=grid.get("NextGridObjectID").and_then(Value::as_u64).filter(|n|*n>0&&*n<u32::MAX as u64).ok_or(bad)?;
        if !seen.insert((target.grid_id.clone(),target.object_id.clone())){return Err(bad);}
        let offset=allocations.entry(d.grid_id.clone()).or_default();
        let fresh=next.checked_add(*offset).filter(|n|*n<u32::MAX as u64).ok_or(bad)?;*offset+=1;
        let refs=grid_identity_dependencies_for_ids(profile,&d.grid_id,&[fresh.to_string()])?;
        if refs.blocking()>0||refs.historical>0{return Err(bad);}
        moves.push((target,expected,d,xy,orientation.to_owned()));
        }
        let mut working=Zeroizing::new(std::str::from_utf8(profile).map_err(|_|bad)?.to_owned());
        for (target,expected,d,xy,orientation) in moves{
            let mut draft=ddv_save_patch::preview_free_indoor_to_outdoor_transfer(&working,&target,expected,&d,xy,&orientation).map_err(|_|CodecError::Patch)?;
            if !draft.changed||!draft.untouched_bytes_preserved||draft.writer_authorized||draft.export_authorized{draft.patched_json.zeroize();return Err(bad);}
            working.zeroize();*working=std::mem::take(&mut draft.patched_json);
        }
        return Ok(std::mem::take(&mut *working));
    }
    if rows.iter().any(|r|r.get("roomSource").is_some()){
        if rows.len()>32{return Err(bad);}
        // All source indices refer to one unchanged room; remove highest first
        // so the remaining indices cannot shift. Reject mixed/duplicate witnesses.
        let mut sorted=Vec::new();let mut room=None;let mut seen=HashSet::new();
        for r in rows{
            let w=r.get("roomSource").ok_or(bad)?;
            let ordinal=w.get("roomOrdinal").and_then(Value::as_u64).ok_or(bad)?;
            let index=w.get("index").and_then(Value::as_u64).ok_or(bad)?;
            if room.is_some_and(|n|n!=ordinal)||!seen.insert(index){return Err(bad);}
            room=Some(ordinal);sorted.push((index,r));
        }
        sorted.sort_by_key(|(index,_)|std::cmp::Reverse(*index));
        let mut working=Zeroizing::new(std::str::from_utf8(profile).map_err(|_|bad)?.to_owned());
        for (_,row) in sorted{
            let next=crate::indoor_room_view::room_to_outdoor_candidate_mode(working.as_bytes(),row,free)?;
            working.zeroize();*working=next;
        }
        return Ok(std::mem::take(&mut *working));
    }
    let collection=root.get("World").and_then(|v|v.get("GridCollection")).ok_or(bad)?;
    let grids=collection.get("Grids").and_then(Value::as_object).ok_or(bad)?;
    let mut selections=Vec::with_capacity(rows.len());
    let mut hierarchy=Vec::with_capacity(rows.len());
    let mut storage_flags=Vec::with_capacity(rows.len());
    let mut destinations=HashMap::<String,PlainGridDestination>::new();
    let mut poses=Vec::with_capacity(rows.len());
    let mut anchors=HashSet::new();
    for row in rows{
        let storage=row.get("storage").map(|v|v.as_bool().filter(|b|*b).ok_or(bad)).transpose()?.unwrap_or(false);
        if storage&&row.get("supportFactor").is_some(){return Err(bad);}
        let o=row.as_object().filter(|o|o.len()==9+usize::from(o.contains_key("supportFactor"))+usize::from(storage)&&o.keys().all(|k|matches!(k.as_str(),"localOrdinal"|"itemId"|"expectedX"|"expectedY"|"expectedOrientation"|"destination"|"x"|"y"|"orientation"|"supportFactor"|"storage"))).ok_or(bad)?;
        storage_flags.push(storage);
        let ordinal=o.get("localOrdinal").and_then(Value::as_u64).and_then(|n|usize::try_from(n).ok()).ok_or(bad)?;
        let item=o.get("itemId").and_then(Value::as_str).and_then(|s|s.parse::<u64>().ok().filter(|n|n.to_string()==s&&(n/100_000==400||free&&matches!(n/100_000,200..=203|205|402)))).ok_or(bad)?;
        let int=|k:&str|o.get(k).and_then(Value::as_i64).and_then(|n|i32::try_from(n).ok()).ok_or(bad);
        let orientation=|k:&str|o.get(k).and_then(Value::as_str).filter(|s|ddv_save_patch::OBSERVED_CARDINAL_ORIENTATIONS.contains(s)||free&&ddv_save_patch::EXPERIMENTAL_EIGHT_WAY_ORIENTATIONS.contains(s)).map(str::to_owned).ok_or(bad);
        let factor=match o.get("supportFactor"){None=>None,Some(v)=>Some(v.as_u64().filter(|n|matches!(n,1|2)).ok_or(bad)?)};
        hierarchy.push(factor);
        selections.push((ordinal,item,(int("expectedX")?,int("expectedY")?),"full".to_owned(),Some(orientation("expectedOrientation")?)));
        let witness=o.get("destination").ok_or(bad)?;let key=witness.to_string();
        if !destinations.contains_key(&key){destinations.insert(key.clone(),resolve_plain_grid_destination(profile,witness)?);}
        let d=destinations.get(&key).ok_or(bad)?;
        let xy=(int("x")?,int("y")?);
        if xy.0<0||xy.1<0||xy.0 as u32>=d.size.0*d.tessellation||xy.1 as u32>=d.size.1*d.tessellation||!free&&!anchors.insert((d.grid_id.clone(),xy)){return Err(bad);}
        poses.push((key,xy,orientation("orientation")?));
    }
    let targets=if hierarchy.iter().any(Option::is_some){
        if rows.len()>32{return Err(bad);}
        let (scan,_)=scan_grid_instances(profile)?;
        if scan.sampled||scan.invalid>0{return Err(bad);}
        let mut seen=HashSet::new();let mut out=Vec::new();
        for (s,factor) in selections.iter().zip(&hierarchy){
            if s.0==0||!seen.insert(s.0){return Err(bad);}
            let (target,xy)=scan.private_targets.get(s.0-1).ok_or(bad)?;
            if target.kind!=GridObjectKind::Full||target.item_id!=s.1||*xy!=Some(s.2)||
               scan.subgrid_parents.contains(&s.0)!=factor.is_some()||
               scan.rows.get(s.0-1).and_then(|r|r.get("orientation")).and_then(Value::as_str)!=s.4.as_deref(){return Err(bad);}
            out.push(target.clone());
        }
        out
    }else{resolve_grid_mixed_targets(profile,&selections)?};
    let selected:HashSet<_>=targets.iter().map(|t|(t.grid_id.clone(),t.object_id.clone())).collect();
    let mut new_counts=HashMap::<String,u64>::new();
    let mut old_refs=HashMap::<String,Vec<String>>::new();
    let mut same=Vec::new();
    let mut cross=Vec::new();
    let mut same_trees=Vec::new();
    for ((((target,selection),(key,xy,orientation)),factor),&storage) in targets.iter().zip(&selections).zip(&poses).zip(&hierarchy).zip(&storage_flags){
        let source=grids.get(&target.grid_id).ok_or(bad)?;
        let raw_layout=source.get("GridDefaultLayoutPath").and_then(Value::as_str).ok_or(bad)?;
        let recovered;
        let layout=if raw_layout.is_empty(){recovered=outdoor_identity(&root,&target.grid_id)?.1;recovered.as_str()}else{raw_layout};
        let data=source.get("GridDataPath").and_then(Value::as_str).ok_or(bad)?;
        let d=destinations.get(key).ok_or(bad)?;
        let scope=|s:&str|s.strip_prefix("SceneLayouts/").and_then(|s|s.split('/').next()).map(str::to_owned);
        if scope(layout).is_none()||scope(&d.layout_path).is_none()||!data.starts_with("GridData/")||
           source.get("ID").and_then(Value::as_u64)!=key_id(&target.grid_id)||
           collection.get("DiffGrids").is_some_and(|v|v.as_object().is_none_or(|m|m.contains_key(&target.grid_id)))||
           grids.values().filter(|g|g.get("GridDataPath").and_then(Value::as_str)==Some(data)&&(raw_layout.is_empty()||g.get("GridDefaultLayoutPath").and_then(Value::as_str)==Some(layout))).count()!=1{return Err(bad);}
        let old=source.get("Objects").and_then(|v|v.get(&target.object_id)).and_then(Value::as_object).ok_or(bad)?;
        if !matches!(old.len(),5|6)||old.keys().any(|k|!matches!(k.as_str(),"ID"|"ItemID"|"X"|"Y"|"Orientation"|"State"))||
           old.get("ID").and_then(Value::as_u64)!=key_id(&target.object_id){return Err(bad);}
        if free||storage{
            let from=house_exterior_identity(&root,&target.grid_id)?;
            let to=house_exterior_identity(&root,&d.grid_id)?;
            let diagonal=|o:&str|!ddv_save_patch::OBSERVED_CARDINAL_ORIENTATIONS.contains(&o);
            if to.1!=d.layout_path||to.2!=u64::from(d.tessellation)||to.3!=u64::from(d.size.0)||to.4!=u64::from(d.size.1)||
               selection.2.0<0||selection.2.1<0||selection.2.0 as u64>=from.3*from.2||selection.2.1 as u64>=from.4*from.2||
               diagonal(selection.4.as_deref().ok_or(bad)?)&&(storage||from.2!=1||from.0.starts_with("SceneLayouts/FloatingIslands/"))||
               diagonal(orientation)&&(storage||to.2!=1||to.0.starts_with("SceneLayouts/FloatingIslands/"))||
               grid_identity_dependencies(profile,target)?.blocking()>0{return Err(bad);}
        }
        let native_class=target.item_id/100_000;
        let building=matches!(native_class,200..=203|205);
        let landscape=native_class==402;
        if building||landscape{
            if !free||storage||factor.is_some()||selection.4.as_deref()!=Some(orientation.as_str())||!ddv_save_patch::OBSERVED_CARDINAL_ORIENTATIONS.contains(&orientation.as_str()){return Err(bad);}
            let from=house_exterior_identity(&root,&target.grid_id)?;
            let to=house_exterior_identity(&root,&d.grid_id)?;
            if from.2!=to.2||landscape&&from.0!=to.0{return Err(bad);}
            if building{validate_building_transform(profile,target)?;}
            if building&&from.0!=to.0&&native_class!=205&&!character_house_exterior(target.item_id)&&!cross_world_building_state(target.item_id,old.get("State")){return Err(bad);}
        }
        let tree=if let Some(factor)=factor{
            if !ddv_save_patch::OBSERVED_CARDINAL_ORIENTATIONS.contains(&orientation.as_str())||selection.4.as_deref().is_none_or(|o|!ddv_save_patch::OBSERVED_CARDINAL_ORIENTATIONS.contains(&o))||u64::from(d.tessellation)!=*factor||
               source.get("TessellationFactor").map_or(Some(1),Value::as_u64)!=Some(*factor)||
               old.get("State").and_then(Value::as_object).is_none_or(|s|s.len()!=1||!s.contains_key("SubGrid")){return Err(bad);}
            let refs=grid_identity_dependencies(profile,target)?;
            if refs.blocking()>0||target.grid_id!=d.grid_id&&refs.historical>0{return Err(bad);}
            if free&&target.grid_id!=d.grid_id{
                support_pickup_references(profile,grids,&target.grid_id,&target.object_id,&mut HashSet::new(),&mut 0,0,512)?;
            }else if !free&&scope(layout)!=scope(&d.layout_path){
                let from=outdoor_identity(&root,&target.grid_id)?;
                let to=outdoor_identity(&root,&d.grid_id)?;
                if from.0!=player_house_grid_scope(&root,&target.grid_id)?||to.0!=player_house_grid_scope(&root,&d.grid_id)?||
                   to.1!=d.layout_path||to.2!=u64::from(d.tessellation)||to.3!=u64::from(d.size.0)||to.4!=u64::from(d.size.1)||
                   selection.2.0<0||selection.2.1<0||selection.2.0 as u64>=from.3*from.2||selection.2.1 as u64>=from.4*from.2{return Err(bad);}
                support_pickup_references(profile,grids,&target.grid_id,&target.object_id,&mut HashSet::new(),&mut 0,0,512)?;
            }
            Some(subgrid_tree(collection.as_object().ok_or(bad)?,&target.grid_id,&target.object_id)?)
        }else{
            if storage{if !ddv_save_patch::storage_transform_pose(&root,&Value::Object(old.clone())){return Err(bad);}}else if !building&&old.get("State").is_some_and(|v|!v.is_null()){return Err(bad);}
            None
        };
        let occupied=grids.get(&d.grid_id).and_then(|v|v.get("Objects")).and_then(Value::as_object).ok_or(bad)?;
        if !free&&occupied.iter().any(|(id,v)|!selected.contains(&(d.grid_id.clone(),id.clone()))&&v.get("ItemID").and_then(Value::as_u64).is_none_or(|n|n/100_000!=401)&&v.get("X").and_then(Value::as_i64)==Some(i64::from(xy.0))&&v.get("Y").and_then(Value::as_i64)==Some(i64::from(xy.1))){return Err(bad);}
        let before=selection.4.as_ref().ok_or(bad)?;
        if target.grid_id==d.grid_id{
            if let Some(tree)=tree{same_trees.push((target,tree));}
            if *xy!=selection.2||before!=orientation{
                same.push(GridMixedEdit{target:target.clone(),expected:selection.2,position:(*xy!=selection.2).then_some(*xy),orientation:(before!=orientation).then(||(before.clone(),orientation.clone()))});
            }
        }else{
            *new_counts.entry(d.grid_id.clone()).or_default()+=1;
            old_refs.entry(target.grid_id.clone()).or_default().push(target.object_id.clone());
            cross.push((target,selection.2,d,*xy,orientation,tree,storage));
        }
    }
    if same.is_empty()&&cross.is_empty(){return Err(bad);}
    for (grid,ids) in old_refs{
        let refs=grid_identity_dependencies_for_ids(profile,&grid,&ids)?;
        if refs.blocking()>0||refs.historical>0{return Err(bad);}
    }
    for (grid,count) in new_counts{
        let next=grids.get(&grid).and_then(|g|g.get("NextGridObjectID")).and_then(Value::as_u64).ok_or(bad)?;
        let ids=(0..count).map(|offset|next.checked_add(offset).filter(|n|*n<u32::MAX as u64).map(|n|n.to_string()).ok_or(bad)).collect::<Result<Vec<_>,_>>()?;
        let refs=grid_identity_dependencies_for_ids(profile,&grid,&ids)?;
        if refs.blocking()>0||refs.historical>0{return Err(bad);}
    }
    let mut working=Zeroizing::new(std::str::from_utf8(profile).map_err(|_|bad)?.to_owned());
    let update=|working:&mut Zeroizing<String>,mut draft:ddv_save_patch::GridCoordinateDraft|->Result<(),CodecError>{
        if !draft.changed||!draft.untouched_bytes_preserved||draft.writer_authorized||draft.export_authorized{draft.patched_json.zeroize();return Err(CodecError::Patch);}
        working.zeroize();**working=draft.patched_json;Ok(())
    };
    if !same.is_empty(){
        let draft=preview_existing_grid_mixed_batch(&working,&same).map_err(|_|CodecError::Patch)?;
        update(&mut working,draft)?;
    }
    for (target,expected,d,xy,orientation,tree,storage) in cross{
        let draft=if storage{ddv_save_patch::preview_storage_transfer(&working,target,expected,d,xy,orientation,false,free).map_err(|_|CodecError::Patch)?}else if let Some(tree)=tree{
            let current:Value=serde_json::from_str(&working).map_err(|_|bad)?;
            let next=current.get("World").and_then(|v|v.get("GridCollection")).and_then(|v|v.get("Grids")).and_then(|v|v.get(&d.grid_id)).and_then(|v|v.get("NextGridObjectID")).and_then(Value::as_u64).ok_or(bad)?.to_string();
            let draft=if free{ddv_save_patch::preview_free_support_parent_world_transfer(&working,target,expected,d,xy,orientation)}else{preview_support_parent_world_transfer(&working,target,expected,d,xy,orientation)}.map_err(|_|CodecError::Patch)?;
            let parsed:Value=serde_json::from_str(&draft.patched_json).map_err(|_|bad)?;
            let c=parsed.get("World").and_then(|v|v.get("GridCollection")).and_then(Value::as_object).ok_or(bad)?;
            if subgrid_tree(c,&d.grid_id,&next)?!=tree{return Err(bad);}
            draft
        }else if matches!(target.item_id/100_000,200..=203|205){
            let from=house_exterior_identity(&root,&target.grid_id)?;
            let to=house_exterior_identity(&root,&d.grid_id)?;
            let world_change=from.0!=to.0;
            if character_house_exterior(target.item_id){character_house_move_candidate(working.as_bytes(),target,expected,d,xy,orientation,world_change)?}
            else if target.item_id/100_000==205{
                (if world_change{ddv_save_patch::preview_player_house_world_change(&working,target,expected,d,xy,orientation,false)}else{ddv_save_patch::preview_player_house_transfer(&working,target,expected,d,xy,orientation)}).map_err(|_|CodecError::Patch)?
            }else{
                (if world_change{ddv_save_patch::preview_checked_building_world_change(&working,target,expected,d,xy,orientation,false)}else{ddv_save_patch::preview_checked_building_transfer(&working,target,expected,d,xy,orientation)}).map_err(|_|CodecError::Patch)?
            }
        }else if target.item_id/100_000==402{ddv_save_patch::preview_plain_grid_transfer(&working,target,expected,d,xy,orientation).map_err(|_|CodecError::Patch)?}
        else if free{ddv_save_patch::preview_free_outdoor_world_transfer(&working,target,expected,d,xy,orientation).map_err(|_|CodecError::Patch)?}else{preview_plain_world_transfer(&working,target,expected,d,xy,orientation).map_err(|_|CodecError::Patch)?};
        update(&mut working,draft)?;
    }
    if !same_trees.is_empty(){
        let parsed:Value=serde_json::from_str(&working).map_err(|_|bad)?;
        let c=parsed.get("World").and_then(|v|v.get("GridCollection")).and_then(Value::as_object).ok_or(bad)?;
        for (target,tree) in same_trees{if subgrid_tree(c,&target.grid_id,&target.object_id)?!=tree{return Err(bad);}}
    }
    Ok(std::mem::take(&mut *working))
}

#[cfg(test)]
mod tests{
    use super::*;

    #[test]
    fn landscape_copy_and_remove_keep_inventory_and_unknown_fields(){
        let source=r#"{"GameInfo":{"Version":643},"Player":{"ListInventories":{"0":{"Inventory":{"40200001":{"Amount":5}}}}},"World":{"GridCollection":{"Grids":{"10":{"ID":10,"GridDefaultLayoutPath":"SceneLayouts/Village04/A.json","GridDataPath":"GridData/Villages/Village04-A.json","NextGridObjectID":8,"Objects":{"2":{"ID":2,"ItemID":40200001,"X":1,"Y":2,"Orientation":"GridOrientation_Down"}}}}}},"Unknown":{"value":17}}"#;
        let plan=r#"{"action":"duplicate","localOrdinal":1,"itemId":"40200001","expectedX":1,"expectedY":2,"x":4,"y":4}"#;
        let witness=r#"{"layoutId":"SceneLayouts/Village04/A.json","gridDataPath":"GridData/Villages/Village04-A.json","factor":1,"sizeX":10,"sizeY":10}"#;
        let copied=landscape_candidate(source.as_bytes(),plan,witness).unwrap();
        let a:Value=serde_json::from_str(source).unwrap();let b:Value=serde_json::from_str(&copied).unwrap();
        assert_eq!(a["Player"],b["Player"]);assert_eq!(a["Unknown"],b["Unknown"]);
        assert_eq!(b["World"]["GridCollection"]["Grids"]["10"]["Objects"]["8"]["ItemID"],40200001);
        let removed=landscape_candidate(source.as_bytes(),r#"{"action":"remove","localOrdinal":1,"itemId":"40200001","expectedX":1,"expectedY":2,"x":null,"y":null}"#,"null").unwrap();
        let c:Value=serde_json::from_str(&removed).unwrap();assert_eq!(a["Player"],c["Player"]);assert!(c["World"]["GridCollection"]["Grids"]["10"]["Objects"].as_object().unwrap().is_empty());
        assert!(landscape_candidate(source.replace("\"Orientation\":\"GridOrientation_Down\"","\"Orientation\":\"GridOrientation_Down\",\"State\":{\"Unknown\":1}").as_bytes(),plan,witness).is_err());
    }

    #[test]
    fn group_pickup_resolves_once_and_returns_all_stock_or_nothing(){
        let raw=br#"{"GameInfo":{"Version":643},"Player":{"Unknown":1e2,"ListInventories":{"0":{"ID":0,"CompatibleItemType":"ItemType_Furniture","CompatibleFurnitureTypes":{"List":["FurnitureItemType_Default"]},"Inventory":{"40000001":{"Amount":2}}}}},"World":{"GridCollection":{"Grids":{"42":{"ID":42,"GridDefaultLayoutPath":"SceneLayouts/Village04/A.json","GridDataPath":"GridData/A.json","NextGridObjectID":3,"Objects":{"1":{"ID":1,"ItemID":40000001,"X":1,"Y":1,"Orientation":"GridOrientation_Down"},"2":{"ID":2,"ItemID":40000001,"X":2,"Y":2,"Orientation":"GridOrientation_Down"}}}}}}}"#;
        let mut rows=serde_json::json!([
         {"localOrdinal":1,"itemId":"40000001","expectedX":1,"expectedY":1,"expectedOrientation":"GridOrientation_Down"},
         {"localOrdinal":2,"itemId":"40000001","expectedX":2,"expectedY":2,"expectedOrientation":"GridOrientation_Down"}
        ]);
        let d=group_pickup_candidate(raw,&rows.to_string()).unwrap();
        let result:Value=serde_json::from_str(&d).unwrap();
        assert_eq!(result["Player"]["ListInventories"]["0"]["Inventory"]["40000001"]["Amount"],4);
        assert!(result["World"]["GridCollection"]["Grids"]["42"]["Objects"].as_object().unwrap().is_empty());
        assert_eq!(result["World"]["GridCollection"]["Grids"]["42"]["NextGridObjectID"],3);
        assert!(d.contains("\"Unknown\":1e2"));
        rows[1]["expectedX"]=Value::from(3);
        assert!(group_pickup_candidate(raw,&rows.to_string()).is_err());
        rows[1]["expectedX"]=Value::from(2);
        let mut invalid:Value=serde_json::from_slice(raw).unwrap();
        invalid["World"]["GridCollection"]["Grids"]["42"]["Objects"]["2"]["State"]=serde_json::json!({"Unknown":5});
        assert!(group_pickup_candidate(&serde_json::to_vec(&invalid).unwrap(),&rows.to_string()).is_err());
    }

    #[test]
    fn mixed_removal_uses_native_identity_and_stock_semantics_atomically(){
        let mut source=serde_json::json!({"GameInfo":{"Version":643},"Player":{"ListInventories":{"0":{"ID":0,"CompatibleItemType":"ItemType_Furniture","CompatibleFurnitureTypes":{"List":["FurnitureItemType_Default"]},"Inventory":{"40000001":{"Amount":2},"40200001":{"Amount":7}}}}},"World":{"GridCollection":{"Grids":{"42":{"ID":42,"GridDefaultLayoutPath":"SceneLayouts/Village04/DefaultVillageLayout01-MeadowGrids.json","GridDataPath":"GridData/Villages/Village04-MeadowLevel-GridData.json","TessellationFactor":1,"NextGridObjectID":5,"Objects":{
            "1":{"ID":1,"ItemID":40000001,"X":1,"Y":1,"Orientation":"GridOrientation_Down"},
            "2":{"ID":2,"ItemID":40200001,"X":2,"Y":2,"Orientation":"GridOrientation_Down"},
            "3":{"ID":3,"ItemID":20000001,"X":3,"Y":3,"Orientation":"GridOrientation_Down","State":null},
            "4":{"ID":4,"ItemID":40200001,"X":4,"Y":4,"Orientation":"GridOrientation_Down"}
        }}}}}});
        let rows=serde_json::json!([
            {"localOrdinal":3,"itemId":"20000001","expectedX":3,"expectedY":3,"expectedOrientation":"GridOrientation_Down"},
            {"localOrdinal":1,"itemId":"40000001","expectedX":1,"expectedY":1,"expectedOrientation":"GridOrientation_Down"},
            {"localOrdinal":2,"itemId":"40200001","expectedX":2,"expectedY":2,"expectedOrientation":"GridOrientation_Down"}
        ]);
        let d=group_pickup_candidate(source.to_string().as_bytes(),&rows.to_string()).unwrap();
        let after:Value=serde_json::from_str(&d).unwrap();
        let g=&after["World"]["GridCollection"]["Grids"]["42"];
        assert_eq!(g["Objects"].as_object().unwrap().len(),1);assert_eq!(g["Objects"]["4"],source["World"]["GridCollection"]["Grids"]["42"]["Objects"]["4"]);
        assert_eq!(g["NextGridObjectID"],5);
        assert_eq!(after["Player"]["ListInventories"]["0"]["Inventory"]["40000001"]["Amount"],3);
        assert_eq!(after["Player"]["ListInventories"]["0"]["Inventory"]["40200001"]["Amount"],7);
        source["World"]["SpawnedObjects"]=serde_json::json!([{"GridID":42,"GridObjectID":2}]);
        assert!(group_pickup_candidate(source.to_string().as_bytes(),&rows.to_string()).is_err());
        let mut stale=rows.clone();stale[0]["expectedX"]=4.into();
        assert!(group_pickup_candidate(source.to_string().as_bytes(),&stale.to_string()).is_err());
    }

    #[test]
    fn biome_replacement_reuses_returned_stock_and_preserves_unselected_state(){
        let raw=br#"{"GameInfo":{"Version":643},"Player":{"Marker":1e2,"ListInventories":{"0":{"ID":0,"CompatibleItemType":"ItemType_Furniture","CompatibleFurnitureTypes":{"List":["FurnitureItemType_Default"]},"Inventory":{"40000001":{"Amount":0}}}}},"World":{"GridCollection":{"Grids":{"42":{"ID":42,"GridDefaultLayoutPath":"SceneLayouts/Village04/DefaultVillageLayout01-MeadowGrids.json","GridDataPath":"GridData/Villages/Village04-MeadowLevel-GridData.json","TessellationFactor":1,"NextGridObjectID":3,"Objects":{"1":{"ID":1,"ItemID":40000001,"X":1,"Y":1,"Orientation":"GridOrientation_Down"},"2":{"ID":2,"ItemID":40000001,"X":2,"Y":2,"Orientation":"GridOrientation_Down"}}},"43":{"ID":43,"GridDefaultLayoutPath":"SceneLayouts/Village04/DefaultVillageLayout01-UrbanGrids.json","GridDataPath":"GridData/Villages/Village04-UrbanLevel-GridData.json","NextGridObjectID":2,"Objects":{"1":{"ID":1,"ItemID":40000001,"X":1,"Y":1,"Orientation":"GridOrientation_Down"}}}}}}}"#;
        let d=serde_json::json!({"layoutId":"SceneLayouts/Village04/DefaultVillageLayout01-MeadowGrids.json","gridDataPath":"GridData/Villages/Village04-MeadowLevel-GridData.json","factor":1,"sizeX":16,"sizeY":16});
        let mut plan=serde_json::json!({"destination":d,"remove":[{"localOrdinal":1,"itemId":"40000001","expectedX":1,"expectedY":1,"expectedOrientation":"GridOrientation_Down"}],"add":[{"itemId":"40000001","destination":d,"x":5,"y":5,"orientation":"GridOrientation_Left"}]});
        let result=biome_furniture_candidate(raw,&plan.to_string()).unwrap();
        let old:Value=serde_json::from_slice(raw).unwrap();let new:Value=serde_json::from_str(&result).unwrap();
        assert_eq!(new["Player"],old["Player"]);assert_eq!(new["World"]["GridCollection"]["Grids"]["43"],old["World"]["GridCollection"]["Grids"]["43"]);
        assert_eq!(new["World"]["GridCollection"]["Grids"]["42"]["Objects"]["2"],old["World"]["GridCollection"]["Grids"]["42"]["Objects"]["2"]);
        assert!(new["World"]["GridCollection"]["Grids"]["42"]["Objects"].get("1").is_none());
        assert_eq!(new["World"]["GridCollection"]["Grids"]["42"]["Objects"]["3"]["X"],5);
        assert!(result.contains("\"Marker\":1e2"));
        plan["remove"][0]["localOrdinal"]=Value::from(3);
        assert!(biome_furniture_candidate(raw,&plan.to_string()).is_err());
        plan["remove"][0]["localOrdinal"]=Value::from(1);
        plan["add"][0]["x"]=Value::from(2);plan["add"][0]["y"]=Value::from(2);
        assert!(biome_furniture_candidate(raw,&plan.to_string()).is_err());
        plan["add"][0]["x"]=Value::from(5);plan["add"][0]["y"]=Value::from(5);
        let mut stateful=old;stateful["World"]["GridCollection"]["Grids"]["42"]["Objects"]["1"]["State"]=serde_json::json!({"Unknown":5});
        assert!(biome_furniture_candidate(&serde_json::to_vec(&stateful).unwrap(),&plan.to_string()).is_err());
    }

    #[test]
    fn island_replacement_resolves_all_native_grids_and_reuses_stock_across_grids(){
        let layout="SceneLayouts/FloatingIslands/FloatingIsland_Atlantean/FloatingIsland_AtlanteanLayout.json";
        let land="GridData/FloatingIslands/FloatingIsland_Atlantean/FloatingIsland_AtlanteanGrid-GridData.json";
        let water="GridData/FloatingIslands/FloatingIsland_Atlantean/FloatingIsland_AtlanteanWaterGrid-GridData.json";
        let raw=serde_json::json!({"GameInfo":{"Version":643},"Player":{"ListInventories":{"0":{"ID":0,"CompatibleItemType":"ItemType_Furniture","CompatibleFurnitureTypes":{"List":["FurnitureItemType_Default"]},"Inventory":{"40000001":{"Amount":0}}}}},"World":{"GridCollection":{"Grids":{"42":{"ID":42,"GridDefaultLayoutPath":layout,"GridDataPath":land,"TessellationFactor":1,"NextGridObjectID":3,"Objects":{"1":{"ID":1,"ItemID":40000001,"X":1,"Y":1,"Orientation":"GridOrientation_Down"}}},"43":{"ID":43,"GridDefaultLayoutPath":layout,"GridDataPath":water,"TessellationFactor":1,"NextGridObjectID":5,"Objects":{}},"44":{"ID":44,"GridDefaultLayoutPath":"SceneLayouts/Village04/A.json","GridDataPath":"GridData/A.json","NextGridObjectID":2,"Objects":{"1":{"ID":1,"ItemID":40000001,"X":1,"Y":1,"Orientation":"GridOrientation_Down"}}}}}}});
        let dest=|data:&str|serde_json::json!({"layoutId":layout,"gridDataPath":data,"factor":1,"sizeX":16,"sizeY":16});
        let mut plan=serde_json::json!([{"destination":dest(land),"remove":[{"localOrdinal":1,"itemId":"40000001","expectedX":1,"expectedY":1,"expectedOrientation":"GridOrientation_Down"}],"add":[]},{"destination":dest(water),"remove":[],"add":[{"itemId":"40000001","destination":dest(water),"x":3,"y":4,"orientation":"GridOrientation_Left"}]}]);
        let bytes=serde_json::to_vec(&raw).unwrap();let output=island_furniture_candidate(&bytes,&plan.to_string()).unwrap();
        let new:Value=serde_json::from_str(&output).unwrap();let g=&new["World"]["GridCollection"]["Grids"];
        assert_eq!(new["Player"],raw["Player"]);assert_eq!(g["44"],raw["World"]["GridCollection"]["Grids"]["44"]);
        assert!(g["42"]["Objects"].as_object().unwrap().is_empty());assert_eq!(g["43"]["Objects"]["5"]["X"],3);
        let partial=serde_json::json!([plan[0].clone()]);assert!(island_furniture_candidate(&bytes,&partial.to_string()).is_err());
        plan[0]["remove"][0]["localOrdinal"]=Value::from(2);assert!(island_furniture_candidate(&bytes,&plan.to_string()).is_err());
        plan[0]["remove"][0]["localOrdinal"]=Value::from(1);
        plan[1]["add"][0]["destination"]=dest(land);assert!(island_furniture_candidate(&bytes,&plan.to_string()).is_err());
    }

    #[test]
    fn island_decoration_reuses_stock_after_network_edits_and_rejects_partial_scope(){
        let layout="SceneLayouts/FloatingIslands/FloatingIsland_Atlantean/FloatingIsland_AtlanteanLayout.json";
        let land="GridData/FloatingIslands/FloatingIsland_Atlantean/FloatingIsland_AtlanteanGrid-GridData.json";
        let water="GridData/FloatingIslands/FloatingIsland_Atlantean/FloatingIsland_AtlanteanWaterGrid-GridData.json";
        let raw=serde_json::json!({"GameInfo":{"Version":643},"Player":{"ListInventories":{"0":{"ID":0,"CompatibleItemType":"ItemType_Furniture","CompatibleFurnitureTypes":{"List":["FurnitureItemType_Default"]},"Inventory":{"40000001":{"Amount":0}}}}},"World":{"GridCollection":{"Grids":{"42":{"ID":42,"GridDefaultLayoutPath":layout,"GridDataPath":land,"TessellationFactor":1,"NextGridObjectID":3,"Objects":{"1":{"ID":1,"ItemID":40000001,"X":1,"Y":1,"Orientation":"GridOrientation_Down"},"2":{"ID":2,"ItemID":40100068,"X":4,"Y":4,"Orientation":"GridOrientation_Down","State":null}}},"43":{"ID":43,"GridDefaultLayoutPath":layout,"GridDataPath":water,"TessellationFactor":1,"NextGridObjectID":5,"Objects":{"1":{"ID":1,"ItemID":40100068,"X":6,"Y":4,"Orientation":"GridOrientation_Down","State":{"FenceMode":{"Diagonal":true}}}}},"44":{"ID":44,"GridDefaultLayoutPath":"SceneLayouts/Village04/A.json","GridDataPath":"GridData/A.json","NextGridObjectID":2,"Objects":{"1":{"ID":1,"ItemID":40000001,"X":1,"Y":1,"Orientation":"GridOrientation_Down"}}}}}}});
        let dest=|data:&str|serde_json::json!({"layoutId":layout,"gridDataPath":data,"factor":1,"sizeX":16,"sizeY":16});
        let a=serde_json::json!({"itemId":40100068,"x":4,"y":4,"orientation":2,"network":{"kind":"road","diagonal":false}});
        let b=serde_json::json!({"itemId":40100068,"x":6,"y":4,"orientation":2,"network":{"kind":"road","diagonal":true}});
        let mut plan=serde_json::json!([{"furniture":{"destination":dest(land),"remove":[{"localOrdinal":1,"itemId":"40000001","expectedX":1,"expectedY":1,"expectedOrientation":"GridOrientation_Down"}],"add":[]},"network":{"destination":dest(land),"before":[a.clone()],"after":[a.clone()]}},{"furniture":{"destination":dest(water),"remove":[],"add":[{"itemId":"40000001","destination":dest(water),"x":6,"y":4,"orientation":"GridOrientation_Left"}]},"network":{"destination":dest(water),"before":[b.clone()],"after":[]}}]);
        let bytes=serde_json::to_vec(&raw).unwrap();let output=island_decoration_candidate(&bytes,&plan.to_string()).unwrap();
        let result:Value=serde_json::from_str(&output).unwrap();let g=&result["World"]["GridCollection"]["Grids"];
        assert_eq!(result["Player"],raw["Player"]);assert_eq!(g["44"],raw["World"]["GridCollection"]["Grids"]["44"]);
        assert_eq!(g["42"]["Objects"]["2"],raw["World"]["GridCollection"]["Grids"]["42"]["Objects"]["2"]);
        assert!(g["42"]["Objects"].get("1").is_none());assert!(g["43"]["Objects"].get("1").is_none());assert_eq!(g["43"]["Objects"]["5"]["X"],6);
        assert!(island_decoration_candidate(&bytes,&serde_json::json!([plan[0].clone()]).to_string()).is_err());
        plan[1]["network"]["before"][0]["network"]["diagonal"]=Value::Bool(false);
        assert!(island_decoration_candidate(&bytes,&plan.to_string()).is_err());
        plan[1]["network"]["before"]=serde_json::json!([b]);
        plan[1]["furniture"]["add"][0]["itemId"]=Value::from("40000002");
        assert!(island_decoration_candidate(&bytes,&plan.to_string()).is_err());
    }

    #[test]
    fn group_cut_preserves_stock_and_same_grid_ids_and_checks_cross_grid_refs(){
        let raw=br#"{"GameInfo":{"Version":643},"Player":{"Marker":1e2},"World":{"GridCollection":{"Grids":{"42":{"ID":42,"GridDefaultLayoutPath":"SceneLayouts/Village04/A.json","GridDataPath":"GridData/A.json","TessellationFactor":1,"NextGridObjectID":3,"Objects":{"1":{"ID":1,"ItemID":40000001,"X":1,"Y":1,"Orientation":"GridOrientation_Down"},"2":{"ID":2,"ItemID":40000001,"X":2,"Y":2,"Orientation":"GridOrientation_Down"}}},"43":{"ID":43,"GridDefaultLayoutPath":"SceneLayouts/Village04/B.json","GridDataPath":"GridData/B.json","TessellationFactor":1,"NextGridObjectID":5,"Objects":{}}}}}}"#;
        let a=serde_json::json!({"layoutId":"SceneLayouts/Village04/A.json","gridDataPath":"GridData/A.json","factor":1,"sizeX":16,"sizeY":16});
        let b=serde_json::json!({"layoutId":"SceneLayouts/Village04/B.json","gridDataPath":"GridData/B.json","factor":1,"sizeX":16,"sizeY":16});
        let mut plan=serde_json::json!([
          {"localOrdinal":1,"itemId":"40000001","expectedX":1,"expectedY":1,"expectedOrientation":"GridOrientation_Down","destination":a,"x":4,"y":4,"orientation":"GridOrientation_Left"},
          {"localOrdinal":2,"itemId":"40000001","expectedX":2,"expectedY":2,"expectedOrientation":"GridOrientation_Down","destination":b,"x":5,"y":5,"orientation":"GridOrientation_Down"}
        ]);
        let d=group_cut_candidate(raw,&plan.to_string()).unwrap();
        let j:Value=serde_json::from_str(&d).unwrap();
        assert_eq!(j["World"]["GridCollection"]["Grids"]["42"]["Objects"]["1"]["ID"],1);
        assert_eq!(j["World"]["GridCollection"]["Grids"]["42"]["Objects"]["1"]["X"],4);
        assert!(j["World"]["GridCollection"]["Grids"]["42"]["Objects"].get("2").is_none());
        assert_eq!(j["World"]["GridCollection"]["Grids"]["43"]["Objects"]["5"]["ItemID"],40000001);
        assert_eq!(j["World"]["GridCollection"]["Grids"]["43"]["NextGridObjectID"],6);
        assert!(d.contains("\"Marker\":1e2"));
        let mut stale:Value=serde_json::from_slice(raw).unwrap();
        stale["World"]["SpawnedObjects"]=serde_json::json!([{"GridID":42,"GridObjectID":2}]);
        assert!(group_cut_candidate(&serde_json::to_vec(&stale).unwrap(),&plan.to_string()).is_err());
        plan[1]["expectedX"]=Value::from(3);assert!(group_cut_candidate(raw,&plan.to_string()).is_err());
    }

    #[test]
    fn cross_world_support_cut_keeps_child_identity_and_stock(){
        let layout="SceneLayouts/VillageExpansion01/DefaultExpansion01Layout01-AtlanteanOutpost01Grids.json";
        let data="GridData/Villages/VillageExpansion01/VillageExpansion01-OutpostArea01LevelGrid02-GridData.json";
        let raw=serde_json::json!({"GameInfo":{"Version":643},"Player":{"Marker":7},"World":{"GridCollection":{"Grids":{
          "42":{"ID":42,"GridDefaultLayoutPath":"","GridDataPath":"GridData/Villages/Village04-MeadowLevel-GridData.json","TessellationFactor":1,"NextGridObjectID":3,"Objects":{"1":{"ID":1,"ItemID":40005160,"X":1,"Y":1,"Orientation":"GridOrientation_Down","State":{"SubGrid":{"GridID":80}}}}},
          "43":{"ID":43,"GridDefaultLayoutPath":"","GridDataPath":data,"TessellationFactor":1,"NextGridObjectID":5,"Objects":{}},
          "80":{"ID":80,"GridDataPath":"GridData/Furniture/NonIP_SetLess/CornerWallShelf01-GridData.json","TessellationFactor":2,"NextGridObjectID":2,"Objects":{"1":{"ID":1,"ItemID":40005161,"X":0,"Y":0,"Orientation":"GridOrientation_Down"}}}
        }}}});
        let plan=serde_json::json!([{"localOrdinal":1,"itemId":"40005160","expectedX":1,"expectedY":1,"expectedOrientation":"GridOrientation_Down","destination":{"layoutId":layout,"gridDataPath":data,"factor":1,"sizeX":96,"sizeY":48},"x":5,"y":5,"orientation":"GridOrientation_Left","supportFactor":1}]);
        let d=group_cut_candidate(raw.to_string().as_bytes(),&plan.to_string()).unwrap();
        let out:Value=serde_json::from_str(&d).unwrap();
        let grids=&out["World"]["GridCollection"]["Grids"];
        assert!(grids["42"]["Objects"].as_object().unwrap().is_empty());
        assert_eq!(grids["43"]["Objects"]["5"]["State"],raw["World"]["GridCollection"]["Grids"]["42"]["Objects"]["1"]["State"]);
        assert_eq!(grids["80"],raw["World"]["GridCollection"]["Grids"]["80"]);
        assert_eq!(out["Player"],raw["Player"]);
        let mut invalid=plan.clone();invalid[0]["destination"]["sizeX"]=95.into();
        assert!(group_cut_candidate(raw.to_string().as_bytes(),&invalid.to_string()).is_err());
        let mut linked=raw.clone();linked["World"]["SpawnedObjects"]=serde_json::json!([{"GridID":80,"GridObjectID":1}]);
        assert!(group_cut_candidate(linked.to_string().as_bytes(),&plan.to_string()).is_err());
        let mut occupied=raw.clone();
        occupied["World"]["GridCollection"]["Grids"]["43"]["Objects"]["2"]=serde_json::json!({"ID":2,"ItemID":40005161,"X":5,"Y":5,"Orientation":"GridOrientation_Down"});
        let mut free=serde_json::json!({"freePlacement":true,"rows":plan});
        assert!(group_cut_candidate(occupied.to_string().as_bytes(),&free["rows"].to_string()).is_err());
        let d=group_cut_candidate(occupied.to_string().as_bytes(),&free.to_string()).unwrap();
        let out:Value=serde_json::from_str(&d).unwrap();
        assert_eq!(out["World"]["GridCollection"]["Grids"]["43"]["Objects"]["5"]["State"],raw["World"]["GridCollection"]["Grids"]["42"]["Objects"]["1"]["State"]);
        assert_eq!(out["World"]["GridCollection"]["Grids"]["43"]["Objects"]["2"],occupied["World"]["GridCollection"]["Grids"]["43"]["Objects"]["2"]);
        assert_eq!(out["World"]["GridCollection"]["Grids"]["80"],raw["World"]["GridCollection"]["Grids"]["80"]);
        assert_eq!(out["Player"],raw["Player"]);
        assert!(group_cut_candidate(linked.to_string().as_bytes(),&free.to_string()).is_err());
        free["rows"][0]["orientation"]="GridOrientation_DownLeft".into();
        assert!(group_cut_candidate(occupied.to_string().as_bytes(),&free.to_string()).is_err());
        free["rows"][0]["orientation"]="GridOrientation_Left".into();
        occupied["World"]["GridCollection"]["Grids"]["43"]["GridDefaultLayoutPath"]="SceneLayouts/FloatingIslands/FloatingIsland_Atlantean/FloatingIsland_AtlanteanLayout.json".into();
        occupied["World"]["GridCollection"]["Grids"]["43"]["GridDataPath"]="GridData/FloatingIslands/FloatingIsland_Atlantean/FloatingIsland_AtlanteanGrid-GridData.json".into();
        free["rows"][0]["destination"]=serde_json::json!({"layoutId":"SceneLayouts/FloatingIslands/FloatingIsland_Atlantean/FloatingIsland_AtlanteanLayout.json","gridDataPath":"GridData/FloatingIslands/FloatingIsland_Atlantean/FloatingIsland_AtlanteanGrid-GridData.json","factor":1,"sizeX":130,"sizeY":130});
        let out:Value=serde_json::from_str(&group_cut_candidate(occupied.to_string().as_bytes(),&free.to_string()).unwrap()).unwrap();
        assert_eq!(out["World"]["GridCollection"]["Grids"]["80"],raw["World"]["GridCollection"]["Grids"]["80"]);
        assert_eq!(out["Player"],raw["Player"]);
    }
    #[test]
    fn cut_between_outdoor_worlds_rechecks_both_addresses_and_preserves_inventory(){
        let raw=br#"{"GameInfo":{"Version":643},"Player":{"Marker":1e2},"World":{"GridCollection":{"Grids":{"42":{"ID":42,"GridDefaultLayoutPath":"SceneLayouts/Village04/A.json","GridDataPath":"GridData/Villages/Village04-MeadowLevel-GridData.json","NextGridObjectID":3,"Objects":{"1":{"ID":1,"ItemID":40000001,"X":1,"Y":1,"Orientation":"GridOrientation_Down"}}},"43":{"ID":43,"GridDefaultLayoutPath":"SceneLayouts/VillageExpansion01/B.json","GridDataPath":"GridData/Villages/VillageExpansion01/VillageExpansion01-DesertArea01LevelGrid01-GridData.json","TessellationFactor":2,"NextGridObjectID":5,"Objects":{}}}}}}"#;
        let dest=serde_json::json!({"layoutId":"SceneLayouts/VillageExpansion01/B.json","gridDataPath":"GridData/Villages/VillageExpansion01/VillageExpansion01-DesertArea01LevelGrid01-GridData.json","factor":2,"sizeX":16,"sizeY":16});
        let plan=serde_json::json!([{"localOrdinal":1,"itemId":"40000001","expectedX":1,"expectedY":1,"expectedOrientation":"GridOrientation_Down","destination":dest,"x":5,"y":5,"orientation":"GridOrientation_Left"}]);
        let d=group_cut_candidate(raw,&plan.to_string()).unwrap();let j:Value=serde_json::from_str(&d).unwrap();
        assert!(j["World"]["GridCollection"]["Grids"]["42"]["Objects"].as_object().unwrap().is_empty());
        assert_eq!(j["World"]["GridCollection"]["Grids"]["43"]["Objects"]["5"]["Orientation"],"GridOrientation_Left");
        assert_eq!(j["World"]["GridCollection"]["Grids"]["43"]["NextGridObjectID"],6);
        assert!(d.contains("\"Marker\":1e2"));
        let mut stale:Value=serde_json::from_slice(raw).unwrap();
        stale["World"]["SpawnedObjects"]=serde_json::json!([{"GridID":42,"GridObjectID":1}]);
        assert!(group_cut_candidate(&serde_json::to_vec(&stale).unwrap(),&plan.to_string()).is_err());
        let mut wrong:Value=serde_json::from_slice(raw).unwrap();
        wrong["World"]["GridCollection"]["Grids"]["42"]["GridDataPath"]=Value::from("GridData/Room.json");
        assert!(group_cut_candidate(&serde_json::to_vec(&wrong).unwrap(),&plan.to_string()).is_err());
    }

    #[test]
    fn group_paste_checks_stock_and_all_allocator_addresses_before_staging(){
        let raw=br#"{"GameInfo":{"Version":643},"Player":{"Marker":1e2,"ListInventories":{"0":{"ID":0,"CompatibleItemType":"ItemType_Furniture","CompatibleFurnitureTypes":{"List":["FurnitureItemType_Default"]},"Inventory":{"40000001":{"Amount":2}}}}},"World":{"GridCollection":{"Grids":{"42":{"ID":42,"GridDefaultLayoutPath":"SceneLayouts/Village04/DefaultVillageLayout01-MeadowGrids.json","GridDataPath":"GridData/Villages/Village04-MeadowLevel-GridData.json","TessellationFactor":1,"NextGridObjectID":3,"Objects":{}}}}}}"#;
        let dest=serde_json::json!({"layoutId":"SceneLayouts/Village04/DefaultVillageLayout01-MeadowGrids.json","gridDataPath":"GridData/Villages/Village04-MeadowLevel-GridData.json","factor":1,"sizeX":196,"sizeY":100});
        let mut plan=serde_json::json!([
          {"itemId":"40000001","destination":dest,"x":1,"y":2,"orientation":"GridOrientation_Down"},
          {"itemId":"40000001","destination":dest,"x":4,"y":2,"orientation":"GridOrientation_Left"}
        ]);
        let d=group_paste_candidate(raw,&plan.to_string()).unwrap();
        let j:Value=serde_json::from_str(&d).unwrap();
        assert_eq!(j["Player"]["ListInventories"]["0"]["Inventory"]["40000001"]["Amount"],0);
        assert_eq!(j["World"]["GridCollection"]["Grids"]["42"]["NextGridObjectID"],5);
        assert_eq!(j["World"]["GridCollection"]["Grids"]["42"]["Objects"]["4"]["Orientation"],"GridOrientation_Left");
        assert!(d.contains("\"Marker\":1e2"));
        plan[1]["x"]=Value::from(1);assert!(group_paste_candidate(raw,&plan.to_string()).is_err());
        let free=serde_json::json!({"freePlacement":true,"rows":plan});
        let stacked:Value=serde_json::from_str(&group_paste_candidate(raw,&free.to_string()).unwrap()).unwrap();
        let objects=&stacked["World"]["GridCollection"]["Grids"]["42"]["Objects"];
        assert_eq!(objects["3"]["X"],1);assert_eq!(objects["4"]["X"],1);
        assert_eq!(objects["3"]["ID"],3);assert_eq!(objects["4"]["ID"],4);
        assert_eq!(stacked["Player"]["ListInventories"]["0"]["Inventory"]["40000001"]["Amount"],0);
        let mut invalid=free.clone();invalid["rows"][0]["x"]=Value::from(196);
        assert!(group_paste_candidate(raw,&invalid.to_string()).is_err());
        invalid=free.clone();invalid["rows"][1]["destination"]["sizeX"]=197.into();
        assert!(group_paste_candidate(raw,&invalid.to_string()).is_err());
        invalid=free.clone();invalid["rows"][0]["scene"]=Value::Null;
        assert!(group_paste_candidate(raw,&invalid.to_string()).is_err());
        plan[1]["x"]=Value::from(4);let mut stale:Value=serde_json::from_slice(raw).unwrap();
        stale["Player"]["ListInventories"]["0"]["Inventory"]["40000001"]["Amount"]=Value::from(1);
        assert!(group_paste_candidate(&serde_json::to_vec(&stale).unwrap(),&plan.to_string()).is_err());
        stale["Player"]["ListInventories"]["0"]["Inventory"]["40000001"]["Amount"]=Value::from(2);
        stale["World"]["SpawnedObjects"]=serde_json::json!([{"GridID":42,"GridObjectID":4}]);
        assert!(group_paste_candidate(&serde_json::to_vec(&stale).unwrap(),&plan.to_string()).is_err());
    }

    #[test]
    fn building_layout_count_changes_keep_identical_native_state(){
        let state=serde_json::json!({"BuildingWithSkinData":{"UpgradeState":{"Level":1},"CurrentSkinItemID":0}});
        let layout="SceneLayouts/Village04/DefaultVillageLayout01-MeadowGrids.json";
        let data="GridData/Villages/Village04-MeadowLevel-GridData.json";
        let raw=serde_json::json!({"GameInfo":{"Version":643},"Player":{"Keep":17},"World":{"GridCollection":{"Grids":{"42":{"ID":42,"GridDefaultLayoutPath":layout,"GridDataPath":data,"TessellationFactor":1,"NextGridObjectID":5,"Objects":{"1":{"ID":1,"ItemID":20300001,"X":1,"Y":1,"Orientation":"GridOrientation_Down","State":state}}}}}}});
        let dest=serde_json::json!({"layoutId":layout,"gridDataPath":data,"factor":1,"sizeX":196,"sizeY":100});
        let pose=serde_json::json!({"itemId":20300001,"x":1,"y":1,"orientation":2});
        let other=serde_json::json!({"itemId":20300001,"x":2,"y":3,"orientation":1});
        let add=serde_json::json!({"destination":dest,"before":[pose],"after":[pose,other],"freePlacement":true});
        let result=building_layout_candidate_scoped(raw.to_string().as_bytes(),&[add.clone()],false).unwrap();
        let v:Value=serde_json::from_str(&result).unwrap();
        let g=&v["World"]["GridCollection"]["Grids"]["42"];
        assert_eq!(g["Objects"]["1"],raw["World"]["GridCollection"]["Grids"]["42"]["Objects"]["1"]);
        assert_eq!(g["Objects"]["5"]["State"],state);
        assert_eq!(g["Objects"]["5"]["Orientation"],ddv_save_patch::OBSERVED_CARDINAL_ORIENTATIONS[1]);
        assert_eq!(g["NextGridObjectID"],6);assert_eq!(v["Player"],raw["Player"]);
        let remove=serde_json::json!({"destination":dest,"before":[pose,other],"after":[pose],"freePlacement":true});
        let reduced=building_layout_candidate_scoped(result.as_bytes(),&[remove.clone()],false).unwrap();
        let v2:Value=serde_json::from_str(&reduced).unwrap();
        assert_eq!(v2["World"]["GridCollection"]["Grids"]["42"]["Objects"],raw["World"]["GridCollection"]["Grids"]["42"]["Objects"]);
        let mut different=v.clone();different["World"]["GridCollection"]["Grids"]["42"]["Objects"]["5"]["State"]["BuildingWithSkinData"]["UpgradeState"]["Level"]=2.into();
        assert!(building_layout_candidate_scoped(different.to_string().as_bytes(),&[remove],false).is_err());
        let mut standard=add;standard.as_object_mut().unwrap().remove("freePlacement");
        assert!(building_layout_candidate_scoped(raw.to_string().as_bytes(),&[standard],false).is_err());
    }
    #[test]
    fn initial_house_and_stall_templates_preserve_original_state_families(){
        let templates:Value=serde_json::from_str(include_str!("../../../src/lib/world/building-initial-templates.json")).unwrap();
        let catalog:Value=serde_json::from_str(include_str!("../../../static/ddv/world/steam-1.26.2/index.json")).unwrap();
        let mut count=0;
        for (scope,items) in templates["otherBuildings"].as_object().unwrap(){
            let d=catalog["entries"].as_array().unwrap().iter().find(|e|e["scope"].as_str()==Some(scope.as_str())).unwrap()["grids"].as_array().unwrap().iter().find(|g|g["gridDataPath"].as_str().is_some_and(|p|p.starts_with("GridData/Villages/"))).unwrap();
            for (item,t) in items.as_object().unwrap(){
                let raw=serde_json::json!({"GameInfo":{"Version":643},"Player":{"Keep":17},"World":{"GridCollection":{"Grids":{"42":{"ID":42,"GridDefaultLayoutPath":d["layoutId"],"GridDataPath":d["gridDataPath"],"TessellationFactor":d["factor"],"NextGridObjectID":5,"Objects":{}}}}}});
                let plan=serde_json::json!({"buildingInitial":{"itemId":item,"destination":{"layoutId":d["layoutId"],"gridDataPath":d["gridDataPath"],"factor":d["factor"],"sizeX":d["sizeX"],"sizeY":d["sizeY"]},"x":1,"y":1,"orientation":"GridOrientation_Down"}});
                let output=group_paste_candidate(raw.to_string().as_bytes(),&plan.to_string()).unwrap();
                let v:Value=serde_json::from_str(&output).unwrap();
                let g=&v["World"]["GridCollection"]["Grids"]["42"];
                let upgrade=if t["upgradeLevel"].is_null(){Value::Null}else{serde_json::json!({"Level":0})};
                let expected=if t["kind"]=="house"{serde_json::json!({"HouseData":{"Built":true,"UpgradeState":upgrade,"PlayerHouseIndex":0}})}else{serde_json::json!({"StallData":{"UpgradeState":upgrade,"ShopData":null,"CurrentSkinItemID":0}})};
                assert_eq!(g["Objects"]["5"]["State"],expected);
                assert_eq!(g["NextGridObjectID"],6);assert_eq!(v["Player"],raw["Player"]);
                assert!(group_paste_candidate(output.as_bytes(),&plan.to_string()).is_err());
                count+=1;
            }
        }
        assert_eq!(count,12);
    }

    #[test]
    fn initial_wells_cover_six_original_worlds_and_distinct_native_states(){
        let templates:Value=serde_json::from_str(include_str!("../../../src/lib/world/building-initial-templates.json")).unwrap();
        let catalog:Value=serde_json::from_str(include_str!("../../../static/ddv/world/steam-1.26.2/index.json")).unwrap();
        let mut seen=HashSet::new();
        for (scope,items) in templates["scopes"].as_object().unwrap(){
            let d=catalog["entries"].as_array().unwrap().iter().find(|e|e["scope"].as_str()==Some(scope.as_str())).unwrap()["grids"].as_array().unwrap().iter().find(|g|g["gridDataPath"].as_str().is_some_and(|p|p.starts_with("GridData/Villages/"))).unwrap();
            for item in items.as_array().unwrap(){
                let item=item.as_u64().unwrap();assert!(seen.insert(item));
                let raw=serde_json::json!({"GameInfo":{"Version":643},"Player":{"Keep":17},"World":{"GridCollection":{"Grids":{"42":{"ID":42,"GridDefaultLayoutPath":d["layoutId"],"GridDataPath":d["gridDataPath"],"TessellationFactor":d["factor"],"NextGridObjectID":5,"Objects":{}}}}}});
                let plan=serde_json::json!({"buildingInitial":{"itemId":item.to_string(),"destination":{"layoutId":d["layoutId"],"gridDataPath":d["gridDataPath"],"factor":d["factor"],"sizeX":d["sizeX"],"sizeY":d["sizeY"]},"x":1,"y":1,"orientation":"GridOrientation_Down"}});
                let output=group_paste_candidate(raw.to_string().as_bytes(),&plan.to_string()).unwrap();
                let out:Value=serde_json::from_str(&output).unwrap();
                let g=&out["World"]["GridCollection"]["Grids"]["42"];
                let state=&g["Objects"]["5"]["State"]["BuildingWithSkinData"];
                let level=if matches!(item,20300093|20300097){Value::Null}else{serde_json::json!({"Level":if scope=="VillageExpansion04"{0}else{1}})};
                assert_eq!(state["UpgradeState"],level);
                assert_eq!(state["CurrentSkinItemID"],if matches!(scope.as_str(),"VillageExpansion04"|"VillageWinnieDLC"){0}else{170200005});
                assert_eq!(g["NextGridObjectID"],6);
                assert_eq!(out["Player"],raw["Player"]);
            }
        }
        assert_eq!(seen.len(),47);
    }

    #[test]
    fn initial_well_requires_pinned_scope_template_and_absent_native_instance(){
        let layout="SceneLayouts/Village04/DefaultVillageLayout01-MeadowGrids.json";
        let data="GridData/Villages/Village04-MeadowLevel-GridData.json";
        let raw=serde_json::json!({"GameInfo":{"Version":643},"Player":{"Keep":17},"World":{"GridCollection":{"Grids":{"42":{"ID":42,"GridDefaultLayoutPath":layout,"GridDataPath":data,"TessellationFactor":1,"NextGridObjectID":5,"Objects":{}}}}}});
        let plan=serde_json::json!({"buildingInitial":{"itemId":"20300002","destination":{"layoutId":layout,"gridDataPath":data,"factor":1,"sizeX":196,"sizeY":100},"x":9,"y":10,"orientation":"GridOrientation_Down"}});
        let output=group_paste_candidate(raw.to_string().as_bytes(),&plan.to_string()).unwrap();
        let v:Value=serde_json::from_str(&output).unwrap();
        let grid=&v["World"]["GridCollection"]["Grids"]["42"];
        assert_eq!(grid["NextGridObjectID"],6);
        assert_eq!(grid["Objects"]["5"]["ItemID"],20300002);
        assert_eq!(grid["Objects"]["5"]["State"],serde_json::json!({"BuildingWithSkinData":{"UpgradeState":{"Level":1},"CurrentSkinItemID":170200005}}));
        assert_eq!(v["Player"],raw["Player"]);
        assert!(group_paste_candidate(output.as_bytes(),&plan.to_string()).is_err());
        for id in ["20300029","20300009","20500001"]{
            let mut p=plan.clone();p["buildingInitial"]["itemId"]=id.into();
            assert!(group_paste_candidate(raw.to_string().as_bytes(),&p.to_string()).is_err());
        }
        let mut p=plan.clone();p["buildingInitial"]["State"]=Value::Null;
        assert!(group_paste_candidate(raw.to_string().as_bytes(),&p.to_string()).is_err());
        p=plan.clone();p["buildingInitial"]["x"]=196.into();
        assert!(group_paste_candidate(raw.to_string().as_bytes(),&p.to_string()).is_err());
    }
    #[test]
    fn world_building_layout_preserves_native_state_and_identity(){
        let catalog:Value=serde_json::from_str(include_str!("../../../static/ddv/world/steam-1.26.2/index.json")).unwrap();
        let entry=catalog["entries"].as_array().unwrap().iter().find(|e|e["scope"]=="Village04").unwrap();
        let mut grids=serde_json::Map::new();let mut plan=Vec::new();let mut beach=String::new();
        let stall=serde_json::json!({"ID":1,"ItemID":20100001,"X":1,"Y":2,"Orientation":"GridOrientation_Down","State":{"StallData":{"UpgradeState":{"Level":2},"ShopData":{"Marker":7},"CurrentSkinItemID":20100002}}});
        let garden=serde_json::json!({"ID":2,"ItemID":20200001,"X":5,"Y":6,"Orientation":"GridOrientation_Up","State":{"GardenData":{"Slots":[{"Marker":8}]}}});
        for (i,g) in entry["grids"].as_array().unwrap().iter().enumerate(){
            let id=(i+1) as u64;let mut objects=serde_json::Map::new();let mut before=Vec::new();let mut after=Vec::new();
            if g["key"]=="Beach"{
                beach=id.to_string();objects.insert("1".into(),stall.clone());objects.insert("2".into(),garden.clone());
                before.extend([serde_json::json!({"itemId":20100001,"x":1,"y":2,"orientation":2}),serde_json::json!({"itemId":20200001,"x":5,"y":6,"orientation":0})]);
                after.extend([serde_json::json!({"itemId":20100001,"x":9,"y":10,"orientation":1}),serde_json::json!({"itemId":20200001,"x":9,"y":10,"orientation":3})]);
            }
            grids.insert(id.to_string(),serde_json::json!({"ID":id,"GridDefaultLayoutPath":g["layoutId"],"GridDataPath":g["gridDataPath"],"TessellationFactor":g["factor"],"NextGridObjectID":3,"Objects":objects}));
            plan.push(serde_json::json!({"destination":{"layoutId":g["layoutId"],"gridDataPath":g["gridDataPath"],"factor":g["factor"],"sizeX":g["sizeX"],"sizeY":g["sizeY"]},"before":before,"after":after}));
        }
        assert!(!beach.is_empty());
        let original=serde_json::json!({"GameInfo":{"Version":643},"Player":{"Marker":100},"World":{"Shops":{"Unchanged":true},"GridCollection":{"Grids":grids}}});
        let raw=original.to_string().replace("\"Marker\":100","\"Marker\":1e2");
        let result=building_layout_candidate(raw.as_bytes(),&plan).unwrap();
        let v:Value=serde_json::from_str(&result).unwrap();let g=&v["World"]["GridCollection"]["Grids"][&beach];
        assert_eq!(g["Objects"]["1"]["State"],stall["State"]);assert_eq!(g["Objects"]["2"]["State"],garden["State"]);
        assert_eq!(g["Objects"]["1"]["X"],9);assert_eq!(g["Objects"]["2"]["X"],9);assert_eq!(g["Objects"]["2"]["Orientation"],"GridOrientation_Left");
        assert_eq!(g["NextGridObjectID"],3);assert_eq!(v["World"]["Shops"],original["World"]["Shops"]);assert!(result.contains("1e2"));
        let i=plan.iter().position(|r|r["before"].as_array().unwrap().len()==2).unwrap();
        let partial=building_layout_candidate_scoped(raw.as_bytes(),std::slice::from_ref(&plan[i]),false).unwrap();
        assert_eq!(serde_json::from_str::<Value>(&partial).unwrap(),v);
        assert!(building_layout_candidate(raw.as_bytes(),std::slice::from_ref(&plan[i])).is_err());
        let dest=plan[i]["destination"].clone();
        let mut biome=serde_json::json!({"furniture":{"destination":dest,"remove":[],"add":[]},"network":{"destination":dest,"before":[],"after":[]},"buildings":plan[i].clone()});
        let output=biome_decoration_candidate(raw.as_bytes(),&biome.to_string()).unwrap();
        assert_eq!(serde_json::from_str::<Value>(&output).unwrap(),v);
        biome["buildings"]["destination"]["sizeX"]=1.into();
        assert!(biome_decoration_candidate(raw.as_bytes(),&biome.to_string()).is_err());
        plan[i]["after"][0]["itemId"]=serde_json::json!(20300001);
        assert!(building_layout_candidate(raw.as_bytes(),&plan).is_err());
        plan[i]["after"][0]["itemId"]=serde_json::json!(20100001);
        let mut unsupported=original.clone();unsupported["World"]["GridCollection"]["Grids"][&beach]["Objects"]["1"]["State"]=serde_json::json!({"UnknownState":{}});
        assert!(building_layout_candidate(unsupported.to_string().as_bytes(),&plan).is_err());
    }
    #[test]
    fn world_house_layout_restores_multiple_exteriors_and_preserves_interior(){
        let catalog:Value=serde_json::from_str(include_str!("../../../static/ddv/world/steam-1.26.2/index.json")).unwrap();
        let entry=catalog["entries"].as_array().unwrap().iter().find(|e|e["scope"]=="Village04").unwrap();
        let mut grids=serde_json::Map::new();let mut plan=Vec::new();let mut beach=String::new();let mut meadow=String::new();
        let exterior=serde_json::json!({"ID":1,"ItemID":20500001,"X":1,"Y":2,"Orientation":"GridOrientation_Down","State":{"HouseData":{"Built":true,"PlayerHouseIndex":0,"UpgradeState":{"Level":1}}}});
        for (i,g) in entry["grids"].as_array().unwrap().iter().enumerate(){
            let id=(i+1) as u64;let mut objects=serde_json::Map::new();let mut before=Vec::new();let mut after=Vec::new();
            if g["key"]=="Beach"{beach=id.to_string();objects.insert("1".to_owned(),exterior.clone());before.push(serde_json::json!({"itemId":20500001,"x":1,"y":2,"orientation":2}));}
            if g["key"]=="Meadow"{meadow=id.to_string();for _ in 0..3{after.push(serde_json::json!({"itemId":20500001,"x":8,"y":9,"orientation":1}));}}
            grids.insert(id.to_string(),serde_json::json!({"ID":id,"GridDefaultLayoutPath":g["layoutId"],"GridDataPath":g["gridDataPath"],"TessellationFactor":g["factor"],"NextGridObjectID":2,"Objects":objects}));
            plan.push(serde_json::json!({"destination":{"layoutId":g["layoutId"],"gridDataPath":g["gridDataPath"],"factor":g["factor"],"sizeX":g["sizeX"],"sizeY":g["sizeY"]},"before":before,"after":after}));
        }
        assert!(!beach.is_empty()&&!meadow.is_empty());
        grids.insert("90".into(),serde_json::json!({"ID":90,"GridDataPath":"GridData/Rooms/Room8x8-GridData.json","NextGridObjectID":1,"Objects":{}}));
        let original=serde_json::json!({"GameInfo":{"Version":643},"Player":{"Marker":100},"World":{"PlayerHouses":[{"HouseItemID":20500001,"Floors":[{"Rooms":{"0":{"FloorGridID":90}}}]}],"GridCollection":{"Grids":grids}}});
        let raw=original.to_string().replace("\"Marker\":100","\"Marker\":1e2");
        let result=player_house_layout_candidate(raw.as_bytes(),&plan).unwrap();let patched:Value=serde_json::from_str(&result).unwrap();let gs=&patched["World"]["GridCollection"]["Grids"];
        assert!(gs[&beach]["Objects"].as_object().unwrap().is_empty());
        let objects=gs[&meadow]["Objects"].as_object().unwrap();assert_eq!(objects.len(),3);
        for o in objects.values(){assert_eq!(o["State"],exterior["State"]);assert_eq!(o["Orientation"],"GridOrientation_Right");assert_eq!(o["X"],8);}
        assert_eq!(patched["World"]["PlayerHouses"],original["World"]["PlayerHouses"]);assert_eq!(gs["90"],original["World"]["GridCollection"]["Grids"]["90"]);assert!(result.contains("1e2"));
        for row in &mut plan{row["after"]=serde_json::json!([]);}
        assert!(player_house_layout_candidate(raw.as_bytes(),&plan).is_err());
    }

    #[test]
    fn detached_house_reattachment_preserves_interior_and_rejects_ambiguity(){
        let layout="SceneLayouts/Village04/DefaultVillageLayout01-MeadowGrids.json";
        let data="GridData/Villages/Village04-MeadowLevel-GridData.json";
        let raw=serde_json::json!({"GameInfo":{"Version":643},"Player":{"Keep":7},"World":{"PlayerHouses":[{"HouseItemID":20500001,"Floors":[]},{"HouseItemID":20500002,"Floors":[{"Rooms":{"0":{"FloorGridID":90,"Flooring":160100104}}}]}],"GridCollection":{"Grids":{"42":{"ID":42,"GridDefaultLayoutPath":"","GridDataPath":data,"TessellationFactor":1,"NextGridObjectID":3,"Objects":{}},"90":{"ID":90,"GridDataPath":"GridData/Rooms/Room8x8-GridData.json","NextGridObjectID":1,"Objects":{}}}}}});
        let plan=serde_json::json!({"buildingInitial":{"itemId":"20500002","destination":{"layoutId":layout,"gridDataPath":data,"factor":1,"sizeX":196,"sizeY":100},"x":3,"y":4,"orientation":"GridOrientation_Right"}});
        let input=raw.to_string();
        let list:Value=serde_json::from_str(&detached_player_houses_json(input.as_bytes()).unwrap()).unwrap();
        assert_eq!(list["itemIds"],serde_json::json!([20500002]));
        let result=group_paste_candidate(input.as_bytes(),&plan.to_string()).unwrap();
        let out:Value=serde_json::from_str(&result).unwrap();
        assert_eq!(out["World"]["PlayerHouses"],raw["World"]["PlayerHouses"]);
        assert_eq!(out["World"]["GridCollection"]["Grids"]["90"],raw["World"]["GridCollection"]["Grids"]["90"]);
        assert_eq!(out["World"]["GridCollection"]["Grids"]["42"]["Objects"]["3"]["State"]["HouseData"]["PlayerHouseIndex"],1);
        assert_eq!(out["Player"],raw["Player"]);
        assert!(group_paste_candidate(result.as_bytes(),&plan.to_string()).is_err());
        let mut invalid=raw.clone();invalid["World"]["PlayerHouses"][0]["HouseItemID"]=20500002.into();
        assert!(group_paste_candidate(invalid.to_string().as_bytes(),&plan.to_string()).is_err());
        let mut invalid=raw.clone();invalid["World"]["PlayerHouses"][1]["Floors"][0]["Rooms"]["0"]["FloorGridID"]=91.into();
        assert!(group_paste_candidate(invalid.to_string().as_bytes(),&plan.to_string()).is_err());
    }

    #[test]
    fn player_house_exterior_duplicate_keeps_existing_interior_and_allocates_id(){
        let raw=br#"{"GameInfo":{"Version":643},"Player":{"Marker":1e2},"World":{"PlayerHouses":[{"HouseItemID":20500001,"Floors":[{"Rooms":{"0":{"FloorGridID":90}}}]}],"GridCollection":{"Grids":{"42":{"ID":42,"GridDefaultLayoutPath":"SceneLayouts/Village04/DefaultVillageLayout01-BeachGrids.json","GridDataPath":"GridData/Villages/Village04-BeachLevel-GridData.json","TessellationFactor":1,"NextGridObjectID":3,"Objects":{"1":{"ID":1,"ItemID":20500001,"X":1,"Y":2,"Orientation":"GridOrientation_Down","State":{"HouseData":{"Built":true,"PlayerHouseIndex":0,"UpgradeState":{"Level":1}}}}}},"90":{"ID":90,"GridDataPath":"GridData/Rooms/Room8x8-GridData.json","NextGridObjectID":1,"Objects":{}}}}}}"#;
        let mut plan=serde_json::json!({"playerHouseDuplicate":{"localOrdinal":1,"itemId":"20500001","expectedX":1,"expectedY":2,"orientation":"GridOrientation_Down","destination":{"layoutId":"SceneLayouts/Village04/DefaultVillageLayout01-BeachGrids.json","gridDataPath":"GridData/Villages/Village04-BeachLevel-GridData.json","factor":1,"sizeX":400,"sizeY":350},"x":10,"y":12}});
        let original:Value=serde_json::from_slice(raw).unwrap();
        let result=group_paste_candidate(raw,&plan.to_string()).unwrap();
        let patched:Value=serde_json::from_str(&result).unwrap();
        assert_eq!(original["World"]["PlayerHouses"],patched["World"]["PlayerHouses"]);
        assert_eq!(original["World"]["GridCollection"]["Grids"]["90"],patched["World"]["GridCollection"]["Grids"]["90"]);
        assert_eq!(patched["World"]["GridCollection"]["Grids"]["42"]["Objects"]["3"]["State"],original["World"]["GridCollection"]["Grids"]["42"]["Objects"]["1"]["State"]);
        assert_eq!(patched["World"]["GridCollection"]["Grids"]["42"]["NextGridObjectID"],4);
        assert!(result.contains("\"Marker\":1e2"));
        let mut rotated=plan.clone();rotated["playerHouseDuplicate"]["replacementOrientation"]="GridOrientation_Right".into();
        let turned:Value=serde_json::from_str(&group_paste_candidate(raw,&rotated.to_string()).unwrap()).unwrap();
        assert_eq!(turned["World"]["GridCollection"]["Grids"]["42"]["Objects"]["3"]["Orientation"],"GridOrientation_Right");
        assert_eq!(turned["World"]["GridCollection"]["Grids"]["42"]["Objects"]["1"],original["World"]["GridCollection"]["Grids"]["42"]["Objects"]["1"]);
        assert_eq!(turned["World"]["GridCollection"]["Grids"]["42"]["Objects"]["3"]["State"],original["World"]["GridCollection"]["Grids"]["42"]["Objects"]["1"]["State"]);
        assert_eq!(turned["World"]["PlayerHouses"],original["World"]["PlayerHouses"]);
        rotated["playerHouseDuplicate"]["replacementOrientation"]="invalid".into();
        assert!(group_paste_candidate(raw,&rotated.to_string()).is_err());
        let mut stale=original.clone();stale["World"]["PlayerHouses"][0]["HouseItemID"]=Value::from(20500002);
        assert!(group_paste_candidate(&serde_json::to_vec(&stale).unwrap(),&plan.to_string()).is_err());
        let remove=serde_json::json!({"playerHouseRemove":{"localOrdinal":1,"itemId":"20500001","expectedX":1,"expectedY":2,"orientation":"GridOrientation_Down"}});
        assert!(group_paste_candidate(raw,&remove.to_string()).is_err());
        let removed=group_paste_candidate(result.as_bytes(),&remove.to_string()).unwrap();
        let removed:Value=serde_json::from_str(&removed).unwrap();
        assert!(removed["World"]["GridCollection"]["Grids"]["42"]["Objects"].get("1").is_none());
        assert_eq!(removed["World"]["PlayerHouses"],original["World"]["PlayerHouses"]);
        assert_eq!(removed["World"]["GridCollection"]["Grids"]["42"]["NextGridObjectID"],4);
        let mut expanded=original.clone();
        expanded["World"]["GridCollection"]["Grids"]["43"]=serde_json::json!({"ID":43,"GridDefaultLayoutPath":"SceneLayouts/Village04/DefaultVillageLayout01-MeadowGrids.json","GridDataPath":"GridData/Villages/Village04-MeadowLevel-GridData.json","TessellationFactor":1,"NextGridObjectID":1,"Objects":{}});
        let mut cross=plan.clone();
        cross["playerHouseDuplicate"]["destination"]=serde_json::json!({"layoutId":"SceneLayouts/Village04/DefaultVillageLayout01-MeadowGrids.json","gridDataPath":"GridData/Villages/Village04-MeadowLevel-GridData.json","factor":1,"sizeX":196,"sizeY":100});
        let cross_result=group_paste_candidate(&serde_json::to_vec(&expanded).unwrap(),&cross.to_string()).unwrap();
        let cross_value:Value=serde_json::from_str(&cross_result).unwrap();
        assert_eq!(cross_value["World"]["GridCollection"]["Grids"]["43"]["Objects"]["1"]["State"],original["World"]["GridCollection"]["Grids"]["42"]["Objects"]["1"]["State"]);
        assert_eq!(cross_value["World"]["GridCollection"]["Grids"]["42"],original["World"]["GridCollection"]["Grids"]["42"]);
        assert_eq!(cross_value["World"]["PlayerHouses"],original["World"]["PlayerHouses"]);
        assert!(group_paste_candidate(cross_result.as_bytes(),&remove.to_string()).is_ok());
        let expanded_raw=serde_json::to_vec(&expanded).unwrap();
        let destination=resolve_plain_grid_destination(&expanded_raw,&cross["playerHouseDuplicate"]["destination"]).unwrap();
        let target=GridCoordinateTarget{kind:GridObjectKind::Full,grid_id:"42".into(),object_id:"1".into(),item_id:20500001};
        let moved=ddv_save_patch::preview_player_house_transfer(std::str::from_utf8(&expanded_raw).unwrap(),&target,(1,2),&destination,(10,12),"GridOrientation_Down").unwrap();
        let moved:Value=serde_json::from_str(&moved.patched_json).unwrap();
        assert!(moved["World"]["GridCollection"]["Grids"]["42"]["Objects"].get("1").is_none());
        assert_eq!(moved["World"]["GridCollection"]["Grids"]["42"]["NextGridObjectID"],3);
        assert_eq!(moved["World"]["GridCollection"]["Grids"]["43"]["Objects"]["1"]["State"],original["World"]["GridCollection"]["Grids"]["42"]["Objects"]["1"]["State"]);
        assert_eq!(moved["World"]["PlayerHouses"],original["World"]["PlayerHouses"]);
        assert_eq!(moved["World"]["GridCollection"]["Grids"]["90"],original["World"]["GridCollection"]["Grids"]["90"]);
        plan["playerHouseDuplicate"]["x"]=Value::from(400);
        assert!(group_paste_candidate(raw,&plan.to_string()).is_err());
    }

    fn project(input:&[u8])->Value{
        serde_json::from_str(&saved_grid_instances_json(input).unwrap()).unwrap()
    }

    #[test]
    fn per_object_source_candidates_do_not_claim_native_save_identity(){
        let save=br#"{"World":{"GridCollection":{
          "Grids":{
            "101":{"ID":101,
              "GridDefaultLayoutPath":"SceneLayouts/Test/Grid.json",
              "GridDataPath":"GridData/Test/Grid.json",
              "Objects":{"1":{"ID":1,"ItemID":77,"X":31,"Y":2}}},
            "102":{"ID":102,
              "GridDefaultLayoutPath":"SceneLayouts/Test/Other.json",
              "GridDataPath":"GridData/Test/Other.json",
              "Objects":{"3":{"ID":3,"ItemID":33,"X":12,"Y":1}}},
            "103":{"ID":103,
              "GridDefaultLayoutPath":"SceneLayouts/Test/Grid.json",
              "GridDataPath":"GridData/Test/Missing.json",
              "Objects":{"4":{"ID":4,"ItemID":44,"X":4,"Y":5}}}
          },
          "DiffGrids":{"202":{"ID":202,
            "GridDefaultLayoutPath":"SceneLayouts/Test/Grid.json",
            "GridDefaultLayoutType":"Meta.GridCollection, Meta",
            "DefaultLayoutGridID":7,"DefaultGridHashCode":19,
            "DefaultGridDataHashCode":-9,
            "ModifiedObjects":{"6":{"ID":6,"ItemID":88,"X":3,"Y":3}}}}
        }}}"#;
        let witness=serde_json::json!({
            "contract":"wand.db05.db04-object-source-witness@1",
            "gridRefs":[
                {"layoutId":"SceneLayouts/Test/Grid.json",
                 "gridDataPath":"GridData/Test/Grid.json",
                 "nativeGridId":7,"nativeSizeX":10,"nativeSizeY":20,
                 "tessellationFactor":2},
                {"layoutId":"SceneLayouts/Test/Other.json",
                 "gridDataPath":"GridData/Test/Other.json",
                 "nativeGridId":8,"nativeSizeX":null,"nativeSizeY":null,
                 "tessellationFactor":null},
                {"layoutId":"SceneLayouts/Test/Grid.json",
                 "gridDataPath":"GridData/Test/Missing.json",
                 "nativeGridId":9,"nativeSizeX":null,"nativeSizeY":null,
                 "tessellationFactor":1}
            ]
        }).to_string();
        let r=saved_db04_object_source_context_json(save,&witness).unwrap();
        let result:Value=serde_json::from_str(&r).unwrap();
        let rows=result["rows"].as_array().unwrap();
        assert_eq!(rows.len(),4);
        assert_eq!(rows[0]["sourceStatus"],"full_exact_source_path_candidate");
        assert_eq!(rows[0]["nativeSizeX"],10);
        assert_eq!(rows[0]["nativeSizeY"],20);
        assert_eq!(rows[0]["tessellationFactor"],2);
        assert_eq!(rows[0]["sourceAnchorEnvelopeWidth"],20);
        assert_eq!(rows[0]["sourceAnchorEnvelopeHeight"],40);
        assert_eq!(rows[0]["savedPositionNumericRelation"],
            "outside_source_anchor_numeric_envelope");
        assert_eq!(rows[1]["sourceStatus"],"full_exact_source_path_candidate");
        assert_eq!(rows[1]["nativeSizeX"],Value::Null);
        assert_eq!(rows[2]["sourceStatus"],"full_exact_source_path_candidate");
        assert_eq!(rows[2]["nativeSizeX"],Value::Null);
        assert_eq!(rows[3]["sourceStatus"],
            "diff_structural_candidate_hash_unverified");
        assert_eq!(rows[3]["nativeSizeX"],10);
        assert_eq!(rows[1]["savedPositionNumericRelation"],"not_comparable");
        assert_eq!(rows[2]["savedPositionNumericRelation"],"not_comparable");
        assert_eq!(rows[3]["savedPositionNumericRelation"],"not_comparable");
        assert_eq!(rows[3]["sourceAnchorEnvelopeWidth"],Value::Null);
        assert_eq!(result["savedSourceCoordinateEquivalenceVerified"],false);
        // Source factor-two bounds are [0,2*SizeX) x [0,2*SizeY)
        // only as a numeric observation, not a legal placement condition.
        let inside=String::from_utf8(save.to_vec()).unwrap()
            .replacen(r#""X":31,"Y":2"#,r#""X":19,"Y":39"#,1);
        let inside_result:Value=serde_json::from_str(
            &saved_db04_object_source_context_json(inside.as_bytes(),&witness)
                .unwrap()
        ).unwrap();
        assert_eq!(inside_result["rows"][0]["savedPositionNumericRelation"],
            "within_source_anchor_numeric_envelope");
        let boundary=String::from_utf8(save.to_vec()).unwrap()
            .replacen(r#""X":31,"Y":2"#,r#""X":20,"Y":0"#,1);
        let boundary_result:Value=serde_json::from_str(
            &saved_db04_object_source_context_json(boundary.as_bytes(),&witness)
                .unwrap()
        ).unwrap();
        assert_eq!(boundary_result["rows"][0]["savedPositionNumericRelation"],
            "outside_source_anchor_numeric_envelope");
        for text in ["SceneLayouts/","GridData/","\"101\"","\"202\"",
                     "\"GridDefaultLayoutPath\"","\"ItemID\""]{
            assert!(!r.contains(text),"unexpected private/source field: {text}");
        }
        assert_eq!(result["savedGridIdentityVerified"],false);
        assert_eq!(result["placementLegalityVerified"],false);
        let duplicate=serde_json::json!({
            "contract":"wand.db05.db04-object-source-witness@1",
            "gridRefs":[
                {"layoutId":"SceneLayouts/Test/Grid.json",
                 "gridDataPath":"GridData/Test/Grid.json",
                 "nativeGridId":7,"nativeSizeX":10,"nativeSizeY":20,
                 "tessellationFactor":2},
                {"layoutId":"SceneLayouts/Test/Grid.json",
                 "gridDataPath":"GridData/Test/Grid.json",
                 "nativeGridId":11,"nativeSizeX":10,"nativeSizeY":20,
                 "tessellationFactor":2}
            ]
        }).to_string();
        let result:Value=serde_json::from_str(
            &saved_db04_object_source_context_json(save,&duplicate).unwrap()
        ).unwrap();
        assert_eq!(result["rows"][0]["sourceStatus"],"ambiguous_source_candidates");
        assert_eq!(result["rows"][0]["candidateCount"],2);
        assert_eq!(result["rows"][0]["nativeSizeX"],Value::Null);
        assert_eq!(result["rows"][3]["sourceStatus"],
            "diff_structural_candidate_hash_unverified");
        assert_eq!(saved_db04_object_source_context_json(save,r#"{"x":1}"#).err(),
            Some(CodecError::Json));
    }

    #[test]
    fn scans_full_and_modified_objects_preserving_signed_coordinates(){
        let sample=br#"{"GameInfo":{"Version":643},"Player":{},
          "World":{"GridCollection":{
            "Grids":{"101":{"ID":101,"GridDataPath":"GridData/private.json",
              "Objects":{
                "1":{"ID":1,"ItemID":40000001,"X":-12,"Y":45,
                  "Orientation":"West","PrivateState":{"PlayerName":"secret"}},
                "2":{"ID":2,"ItemID":9999,"X":15,"Other":true},
                "3":{"ID":3,"ItemID":0,"X":7,"Y":4}
              }}},
            "DiffGrids":{"202":{"ID":202,"RemovedObjects":[4],
              "ModifiedObjects":{
                "4":{"ID":4,"ItemID":40000001,"X":333,"Y":9},
                "5":{"ID":5,"ItemID":40000002,"X":32,"Y":-7,
                  "Orientation":"South","Private":"do-not-project"}
              }}}
            }},"Future":"stay-private"}"#;
        let v=project(sample);
        assert_eq!(v["status"],"saved_object_instances");
        assert_eq!(v["rows"].as_array().unwrap().len(),3);
        assert_eq!(v["rows"][0]["itemId"],"40000001");
        assert_eq!(v["rows"][0]["x"],-12);
        assert_eq!(v["rows"][0]["y"],45);
        assert_eq!(v["rows"][0]["orientation"],"West");
        assert_eq!(v["rows"][0]["localOrdinal"],1);
        assert_eq!(v["rows"][0]["localGridOrdinal"],1);
        assert_eq!(v["rows"][1]["localGridOrdinal"],1);
        assert_eq!(v["rows"][2]["localGridOrdinal"],2);
        assert_eq!(v["rows"][1]["coordinatesObserved"],false);
        assert_eq!(v["rows"][1]["x"],Value::Null);
        assert_eq!(v["rows"][2]["recordKind"],"diff_modified");
        assert_eq!(v["rows"][2]["y"],-7);
        assert_eq!(v["removedObjectMarkers"],1);
        assert_eq!(v["rowsMissingCoordinates"],1);
        assert_eq!(v["effectivePlacementVerified"],false);
        assert_eq!(v["saveWritingAuthorized"],false);
        // UI-only ordinals intentionally do not disclose the private grid ID.
        let report=saved_grid_instances_json(sample).unwrap();
        for secret in [
            "secret","do-not-project","private.json","\"101\"","\"202\"",
            "\"GridDataPath\"","\"PlayerName\"","\"Future\""
        ]{assert!(!report.contains(secret),"{secret}");}
    }

    #[test]
    fn deletion_only_and_missing_world_grid_are_not_save_corruption(){
        let removed=br#"{"World":{"GridCollection":{"DiffGrids":{
          "42":{"RemovedObjects":[1,2,2]}
        }}}}"#;
        let v=project(removed);
        assert_eq!(v["status"],"observed_no_item_refs");
        assert_eq!(v["removedObjectMarkers"],2);
        assert_eq!(v["invalidRecords"],0);
        let missing=br#"{"World":{}}"#;
        assert_eq!(project(missing)["status"],"not_observed");
        let future=br#"{"World":{"GridCollection":{"Grids":null}}}"#;
        assert_eq!(project(future)["status"],"partial_inconclusive");
    }

    #[test]
    fn skips_stale_colliding_numeric_keys_and_rejects_unsafe_coordinates(){
        let sample=br#"{"World":{"GridCollection":{"Grids":{
          "00":{"Objects":{"1":{"ItemID":45,"X":5,"Y":6}}},
          "2":{"ID":3,"Objects":{"1":{"ItemID":46,"X":5,"Y":6}}},
          "3":{"Objects":{"1":{"ID":2,"ItemID":47,"X":5,"Y":6}}},
          "4":{"Objects":{"1":{"ItemID":48,"X":2147483648,"Y":6,
            "Orientation":"do-not-echo-unsafe-str"}}}
        }}}}"#;
        let v=project(sample);
        assert_eq!(v["status"],"partial_inconclusive");
        assert_eq!(v["invalidRecords"],3);
        assert_eq!(v["rows"].as_array().unwrap().len(),1);
        assert_eq!(v["rows"][0]["coordinatesObserved"],false);
        assert_eq!(v["rows"][0]["orientation"],Value::Null);
    }

    #[test]
    fn exclusive_anchor_moves_reject_same_class_only_with_atomic_final_positions(){
        let source=br#"{"World":{"GridCollection":{"Grids":{
          "101":{"Objects":{
            "1":{"ItemID":40100001,"X":0,"Y":0},
            "2":{"ItemID":40100002,"X":1,"Y":0},
            "3":{"ItemID":40700001,"X":2,"Y":0},
            "4":{"ItemID":40700002,"X":3,"Y":0},
            "5":{"ItemID":40000001,"X":4,"Y":0},
            "6":{"ItemID":40100003,"X":8,"Y":0},
            "7":{"ItemID":40100004,"X":8,"Y":0}}},
          "102":{"Objects":{"1":{"ItemID":40100002,"X":9,"Y":0}}}
        },"DiffGrids":{"201":{"ModifiedObjects":{
          "1":{"ItemID":40100001,"X":0,"Y":0}}}}}}}"#;
        let t=|id:&str,item_id:u64|GridCoordinateTarget{kind:GridObjectKind::Full,
            grid_id:"101".into(),object_id:id.into(),item_id};
        let road=t("1",40100001);let road2=t("2",40100002);
        let fence=t("3",40700001);let furniture=t("5",40000001);
        assert!(validate_exclusive_grid_moves(source,&[(&road,(1,0))]).is_err());
        assert!(validate_exclusive_grid_moves(source,&[(&fence,(3,0))]).is_err());
        assert!(validate_exclusive_grid_moves(source,&[(&road,(8,0))]).is_err());
        assert!(validate_exclusive_grid_moves(source,&[(&road,(2,0))]).is_ok());
        assert!(validate_exclusive_grid_moves(source,&[(&road,(4,0))]).is_ok());
        assert!(validate_exclusive_grid_moves(source,&[(&road,(9,0))]).is_ok());
        assert!(validate_exclusive_grid_moves(source,&[(&furniture,(1,0))]).is_ok());
        assert!(validate_exclusive_grid_moves(source,&[(&road,(1,0)),(&road2,(0,0))]).is_ok());
        assert!(validate_exclusive_grid_moves(source,&[(&road,(5,0)),(&road2,(5,0))]).is_err());
        let diff=GridCoordinateTarget{kind:GridObjectKind::DiffModified,grid_id:"201".into(),
            object_id:"1".into(),item_id:40100001};
        assert!(validate_exclusive_grid_moves(source,&[(&diff,(5,0))]).is_err());
        assert_eq!(exclusive_anchor_class(50100001),None);
        assert_eq!(exclusive_anchor_class(40200001),None);
    }
    #[test]
    fn exclusive_move_requires_known_other_same_class_coordinates(){
        let source=br#"{"World":{"GridCollection":{"Grids":{"1":{"Objects":{
          "1":{"ItemID":40100001,"X":0,"Y":0},"2":{"ItemID":40100002,"X":2}
        }}}}}}"#;
        let target=GridCoordinateTarget{kind:GridObjectKind::Full,grid_id:"1".into(),
            object_id:"1".into(),item_id:40100001};
        assert!(validate_exclusive_grid_moves(source,&[(&target,(3,0))]).is_err());
    }
}

#[cfg(test)]
mod terrain_session_tests{
    use super::*;
    #[test]
    fn terrain_session_uses_exact_paths_and_native_default_factor(){
        let save=br#"{"World":{"GridCollection":{"Grids":{
          "1":{"GridDefaultLayoutPath":"SceneLayouts/Test.json","GridDataPath":"GridData/Test.json","Objects":{"1":{"ItemID":40005160,"X":0,"Y":1,"Orientation":"GridOrientation_Down"}}},
          "2":{"GridDefaultLayoutPath":"SceneLayouts/Test.json","GridDataPath":"GridData/Test.json","TessellationFactor":2,"Objects":{"2":{"ItemID":40005160,"X":2,"Y":3}}},
          "3":{"GridDefaultLayoutPath":"SceneLayouts/Other.json","GridDataPath":"GridData/Test.json","Objects":{"3":{"ItemID":40005160,"X":0,"Y":0}}}
        }}}}"#;
        let witness=r#"{"contract":"wand.db05.db04-object-source-witness@1","gridRefs":[{"layoutId":"SceneLayouts/Test.json","gridDataPath":"GridData/Test.json","nativeGridId":0,"nativeSizeX":10,"nativeSizeY":10,"tessellationFactor":1}]}"#;
        let r:Value=serde_json::from_str(&saved_db04_terrain_session_json(save,witness).unwrap()).unwrap();
        assert_eq!(r["rows"].as_array().unwrap().len(),3);
        assert_eq!(r["bindings"].as_array().unwrap().len(),2);
        assert_eq!(r["bindings"][0]["savedFactor"],1);
        assert_eq!(r["bindings"][0]["sourceLocalCoordinateMappingVerified"],true);
        assert_eq!(r["bindings"][1]["sourceLocalCoordinateMappingVerified"],false);
        assert!(!r.to_string().contains("SceneLayouts/"));
    }
    #[test]
    fn dependency_scan_distinguishes_historical_active_and_unknown_addresses(){
        let profile=br#"{"World":{"GridCollection":{"Grids":{"10":{"ID":10,"NextGridObjectID":2,"Objects":{"2":{"ID":2,"ItemID":40005160},"7":{"ID":7,"State":{"TreeAndBush":{"SaplingGridObjectID":2}}}}},"20":{"ID":20,"Objects":{"7":{"ID":7,"State":{"TreeAndBush":{"SaplingGridObjectID":2}}}}}}},"Events":{"SpawnedObjects":[{"GridID":10,"GridObjectID":2},{"GridID":20,"GridObjectID":2}]}},"Player":{"Achievements":{"GridObjectsCollected":[{"GridId":10,"GridObjectId":2}]},"LastUsedLinkedEnvironmentEnter":{"1":{"GridID":10,"GridObjectID":2}},"Unknown":{"GridID":10,"GridObjectID":2}}}"#;
        let target=GridCoordinateTarget{kind:GridObjectKind::Full,grid_id:"10".into(),object_id:"2".into(),item_id:40005160};
        let r=grid_identity_dependencies(profile,&target).unwrap();
        assert_eq!((r.active,r.historical,r.navigation,r.related,r.unknown),(1,1,1,1,1));assert_eq!(r.blocking(),4);
    }
    #[test]
    fn mission_slot_identity_references_never_inherit_achievement_history_exemption(){
        let target=GridCoordinateTarget{kind:GridObjectKind::Full,grid_id:"10".into(),object_id:"2".into(),item_id:40005160};
        let mut save=serde_json::json!({
            "World":{"MissionSlots":{"owner":{"Slots":[{"MissionId":2070000001,"GridObjectsCollected":[{"GridID":10,"GridObjectID":2},{"GridID":20,"GridObjectID":2}]}]}}},
            "Player":{"Achievements":{"GridObjectsCollected":[{"GridID":10,"GridObjectID":2}]}}
        });
        let scan=|v:&Value|grid_identity_dependencies(&serde_json::to_vec(v).unwrap(),&target).unwrap();
        let refs=scan(&save);assert_eq!(refs.unknown,1);assert_eq!(refs.historical,1);assert_eq!(refs.blocking(),1);
        let slot=&mut save["World"]["MissionSlots"]["owner"]["Slots"][0];
        slot["GridObjectsCollected"]=serde_json::json!([{"GridID":20,"GridObjectID":2},{"GridID":10,"GridObjectID":9}]);
        assert_eq!(scan(&save).blocking(),0);
        save["World"]["MissionSlots"]["owner"]["Slots"][0]["GridObjectIdsCollected"]=serde_json::json!([2,9]);
        assert_eq!(scan(&save).blocking(),1);
        save["World"]["MissionSlots"]["owner"]["Slots"][0]["GridID"]=20.into();
        assert_eq!(scan(&save).blocking(),0);
        save["World"]["MissionSlots"]["owner"]["Slots"][0]["GridID"]=10.into();
        assert_eq!(scan(&save).blocking(),1);
        save["World"]["MissionSlots"]["owner"]["Slots"][0]["GridObjectIdsCollected"]=serde_json::json!([9]);
        assert_eq!(scan(&save).blocking(),0);
        save["World"]["MissionSlots"]["owner"]["Slots"][0]["SpawnedObjects"]=serde_json::json!([{"GridID":10,"GridObjectID":2}]);
        assert_eq!(scan(&save).active,1);
        // A verified old objective history field is not an exact native address.
        // Keep the list untouched, without blocking every matching local ID.
        save["World"]["MissionSlots"]["owner"]["Slots"][0]=serde_json::json!({
            "MissionId":2070000001,"State":"MissionSlotState_OnGoing",
            "MissionSteps":[{"SubSteps":[{"Objectives":[{"GridObjectIdsCollected":[2,9]}]}]}]
        });
        assert_eq!(scan(&save).blocking(),0);
        save["World"]["MissionSlots"]["owner"]["Slots"][0]["MissionSteps"][0]["SubSteps"][0]["Objectives"][0]["GridObjectIdsCollected"]=serde_json::json!([2,{"GridID":10,"GridObjectID":2}]);
        assert!(scan(&save).blocking()>0);
    }
    #[test]
    fn mission_identity_arrays_protect_unknown_and_addressed_objective_dependencies(){
        let target=GridCoordinateTarget{kind:GridObjectKind::Full,grid_id:"10".into(),object_id:"2".into(),item_id:40005160};
        let scan=|slot:Value|grid_identity_dependencies(&serde_json::to_vec(&serde_json::json!({
            "World":{"MissionSlots":{"owner":{"Slots":[slot]}}}
        })).unwrap(),&target).unwrap();
        assert_eq!(scan(serde_json::json!({"SpawnedGridObjectIds":[2,9]})).active,1);
        assert_eq!(scan(serde_json::json!({"Required_Grid_Object_IDs":[2]})).unknown,1);
        assert_eq!(scan(serde_json::json!({"GridID":20,"RequiredGridObjectIds":[2]})).blocking(),0);
        assert_eq!(scan(serde_json::json!({"GridID":null,"RequiredGridObjectIds":[2]})).unknown,1);
        assert_eq!(scan(serde_json::json!({"GridID":10,"RequiredGridObjectIds":[9]})).blocking(),0);
        let objective=|obj:Value|serde_json::json!({"MissionId":2070000001,
            "MissionSteps":[{"SubSteps":[{"Objectives":[obj]}]}]});
        assert_eq!(scan(objective(serde_json::json!({"GridObjectIdsCollected":[2]}))).blocking(),0);
        assert_eq!(scan(objective(serde_json::json!({"GridID":10,"GridObjectIdsCollected":[2]}))).unknown,1);
        assert_eq!(scan(objective(serde_json::json!({"GridID":20,"GridObjectIdsCollected":[2]}))).blocking(),0);
        assert_eq!(scan(objective(serde_json::json!({"GridID":"10","GridObjectIdsCollected":[2]}))).unknown,1);
        // Ordinary history outside MissionSlots remains unchanged.
        let profile=br#"{"Player":{"Achievements":{"RequiredGridObjectIds":[2]}}}"#;
        assert_eq!(grid_identity_dependencies(profile,&target).unwrap().blocking(),0);
    }
    #[test]
    fn native_blank_floating_island_layout_is_resolved_without_rewriting_save(){
        let catalog:Value=serde_json::from_str(include_str!("../../../static/ddv/world/steam-1.26.2/index.json")).unwrap();
        let entries=catalog["entries"].as_array().unwrap().iter().find(|e|e["scope"]=="FloatingIslands").unwrap()["grids"].as_array().unwrap();
        let (mut playable,mut templates)=(0,0);
        for g in entries{
            let raw=serde_json::json!({"GameInfo":{"Version":643},"World":{"GridCollection":{"Grids":{"42":{"ID":42,"GridDefaultLayoutPath":"","GridDataPath":g["gridDataPath"],"TessellationFactor":g["factor"],"NextGridObjectID":5,"Objects":{}}}}}});
            let witness=serde_json::json!({"layoutId":g["layoutId"],"gridDataPath":g["gridDataPath"],"factor":g["factor"],"sizeX":g["sizeX"],"sizeY":g["sizeY"]});
            if g["layoutId"].as_str().unwrap().starts_with("SceneLayouts/FloatingIslands/FloatingIsland_TEMPLATE/"){
                templates+=1;
                assert!(resolve_plain_grid_destination(raw.to_string().as_bytes(),&witness).is_err());
                continue;
            }
            playable+=1;
            let d=resolve_plain_grid_destination(raw.to_string().as_bytes(),&witness).unwrap();
            assert_eq!(d.grid_id,"42");
            assert!(player_house_grid_scope(&raw,"42").is_err());
            let copy=ddv_save_patch::preview_plain_grid_place(&raw.to_string(),&d,40005160,(1,1),"GridOrientation_Down").unwrap();
            let v:Value=serde_json::from_str(&copy.patched_json).unwrap();
            assert_eq!(v["World"]["GridCollection"]["Grids"]["42"]["GridDefaultLayoutPath"],"");
            assert_eq!(v["World"]["GridCollection"]["Grids"]["42"]["Objects"]["5"]["ItemID"],40005160);
            let mut wrong=witness.clone();wrong["sizeX"]=(g["sizeX"].as_u64().unwrap()+1).into();
            assert!(resolve_plain_grid_destination(raw.to_string().as_bytes(),&wrong).is_err());
        }
        assert_eq!((playable,templates),(28,4));
    }

    #[test]
    fn native_blank_full_layout_and_large_grid_collection_are_supported(){
        let layout="SceneLayouts/Village04/DefaultVillageLayout01-MeadowGrids.json";
        let data="GridData/Villages/Village04-MeadowLevel-GridData.json";
        let mut full=Map::new();
        full.insert("42".into(),serde_json::json!({"ID":42,"GridDefaultLayoutPath":"","GridDataPath":data,"TessellationFactor":1,"NextGridObjectID":5,"Objects":{"1":{"ID":1,"ItemID":20300002,"X":2,"Y":3,"Orientation":"GridOrientation_Down","State":{"BuildingWithSkinData":{"UpgradeState":{"Level":1},"CurrentSkinItemID":170200005}}}}}));
        for i in 100..2600{full.insert(i.to_string(),serde_json::json!({"ID":i,"GridDefaultLayoutPath":"","GridDataPath":"GridData/Rooms/Room8x8-GridData.json","Objects":{}}));}
        let mut root=serde_json::json!({"GameInfo":{"Version":643},"World":{"GridCollection":{"Grids":full,"DiffGrids":{}}}});
        let raw=root.to_string();
        let (scan,_)=scan_grid_instances(raw.as_bytes()).unwrap();
        assert!(!scan.sampled);assert_eq!(scan.full,2501);assert_eq!(scan.invalid,0);
        let witness=serde_json::json!({"layoutId":layout,"gridDataPath":data,"factor":1,"sizeX":196,"sizeY":100});
        let d=resolve_plain_grid_destination(raw.as_bytes(),&witness).unwrap();
        assert_eq!(d.grid_id,"42");
        assert_eq!(building_transform_grid_size(&root,"42").unwrap(),(196,100));
        let source=serde_json::json!({"contract":"wand.db05.db04-object-source-witness@1","gridRefs":[{"layoutId":layout,"gridDataPath":data,"nativeGridId":0,"nativeSizeX":196,"nativeSizeY":100,"tessellationFactor":1}]});
        let projected:Value=serde_json::from_str(&saved_db04_terrain_session_json(raw.as_bytes(),&source.to_string()).unwrap()).unwrap();
        assert_eq!(projected["bindings"].as_array().unwrap().len(),1);
        assert_eq!(projected["gridBindings"].as_array().unwrap().len(),1);
        let mut wrong_source=source.clone();
        wrong_source["gridRefs"][0]["nativeSizeX"]=195.into();
        let p:Value=serde_json::from_str(&saved_db04_terrain_session_json(raw.as_bytes(),&wrong_source.to_string()).unwrap()).unwrap();
        assert_eq!(p["bindings"][0]["sourceLocalCoordinateMappingVerified"],false);
        assert!(p["gridBindings"].as_array().unwrap().is_empty());
        let mut ambiguous=root.clone();
        let mut duplicate=ambiguous["World"]["GridCollection"]["Grids"]["42"].clone();
        duplicate["ID"]=43.into();duplicate["GridDefaultLayoutPath"]=layout.into();
        ambiguous["World"]["GridCollection"]["Grids"]["43"]=duplicate;
        let p:Value=serde_json::from_str(&saved_db04_terrain_session_json(ambiguous.to_string().as_bytes(),&source.to_string()).unwrap()).unwrap();
        assert!(p["gridBindings"].as_array().unwrap().is_empty());
        assert!(p["bindings"].as_array().unwrap().iter().all(|b|b["sourceLocalCoordinateMappingVerified"]==false));
        let t=resolve_grid_mixed_targets(raw.as_bytes(),&[(1,20300002,(2,3),"full".into(),Some("GridOrientation_Down".into()))]).unwrap().pop().unwrap();
        let copy=ddv_save_patch::preview_checked_building_duplicate(&raw,&t,(2,3),&d,(4,5),"GridOrientation_Down").unwrap();
        let out:Value=serde_json::from_str(&copy.patched_json).unwrap();
        assert_eq!(out["World"]["GridCollection"]["Grids"]["42"]["GridDefaultLayoutPath"],"");
        assert_eq!(out["World"]["GridCollection"]["Grids"]["42"]["Objects"]["5"]["ItemID"],20300002);
        let mut wrong=witness.clone();wrong["sizeX"]=195.into();assert!(resolve_plain_grid_destination(raw.as_bytes(),&wrong).is_err());
        wrong=witness.clone();wrong["layoutId"]="SceneLayouts/Village04/Other.json".into();assert!(resolve_plain_grid_destination(raw.as_bytes(),&wrong).is_err());
        let other=root["World"]["GridCollection"]["Grids"]["42"].clone();
        root["World"]["GridCollection"]["Grids"]["43"]=other;
        root["World"]["GridCollection"]["Grids"]["43"]["ID"]=43.into();
        assert!(resolve_plain_grid_destination(root.to_string().as_bytes(),&witness).is_err());
    }

    #[test]
    fn transfer_destination_resolves_empty_full_grid_and_rejects_ambiguity(){
        let save=br#"{"World":{"GridCollection":{"Grids":{"20":{"ID":20,"GridDefaultLayoutPath":"SceneLayouts/Village04/B.json","GridDataPath":"GridData/B.json","NextGridObjectID":3,"Objects":{}}},"DiffGrids":{}}}}"#;
        let witness=serde_json::json!({"layoutId":"SceneLayouts/Village04/B.json","gridDataPath":"GridData/B.json","factor":1,"sizeX":20,"sizeY":20});
        let d=resolve_plain_grid_destination(save,&witness).unwrap();
        assert_eq!(d.grid_id,"20");assert_eq!(d.tessellation,1);
        let mut wrong=witness.clone();wrong["factor"]=serde_json::json!(2);
        assert!(resolve_plain_grid_destination(save,&wrong).is_err());
        for key in ["SpawnedObjects","GridObjectsCollected","LastUsedLinkedEnvironmentEnter","Unknown"]{
            let mut referenced:Value=serde_json::from_slice(save).unwrap();
            referenced["Player"]=serde_json::json!({(key):[{"GridID":20,"GridObjectID":3}]});
            assert!(resolve_plain_grid_destination(&serde_json::to_vec(&referenced).unwrap(),&witness).is_err());
            referenced["Player"][key][0]["GridID"]=serde_json::json!(21);
            assert!(resolve_plain_grid_destination(&serde_json::to_vec(&referenced).unwrap(),&witness).is_ok());
        }
        let mut root:Value=serde_json::from_slice(save).unwrap();
        let other=root["World"]["GridCollection"]["Grids"]["20"].clone();
        root["World"]["GridCollection"]["Grids"]["21"]=other;
        root["World"]["GridCollection"]["Grids"]["21"]["ID"]=serde_json::json!(21);
        assert!(resolve_plain_grid_destination(&serde_json::to_vec(&root).unwrap(),&witness).is_err());
    }
    #[test]
    fn complete_support_pickup_returns_root_and_children_and_rejects_external_references(){
        let save=br#"{"GameInfo":{"Version":643},"Player":{"ListInventories":{"0":{"ID":0,"CompatibleItemType":"ItemType_Furniture","CompatibleFurnitureTypes":{"List":["FurnitureItemType_Default"]},"Inventory":{"40005160":{"Amount":0},"40005161":{"Amount":2}}}},"Other":1e2},"World":{"GridCollection":{"NextGridID":10,"Grids":{"7":{"ID":7,"GridDefaultLayoutPath":"SceneLayouts/Village04/Test.json","GridDataPath":"GridData/Test.json","NextGridObjectID":3,"Objects":{"1":{"ID":1,"ItemID":40005160,"X":4,"Y":6,"Orientation":"GridOrientation_Down","State":{"SubGrid":{"GridID":8}}},"2":{"ID":2,"ItemID":40005161,"X":9,"Y":9,"Orientation":"GridOrientation_Down","Unknown":1e2}}},"8":{"ID":8,"GridDataPath":"GridData/Furniture/NonIP_SetLess/CornerWallShelf01-GridData.json","TessellationFactor":2,"NextGridObjectID":2,"Objects":{"1":{"ID":1,"ItemID":40005161,"X":0,"Y":0,"Orientation":"GridOrientation_Down","State":null}}}}}}}"#;
        let plan=serde_json::json!([{"localOrdinal":1,"itemId":"40005160","expectedX":4,"expectedY":6,"expectedOrientation":"GridOrientation_Down","includeSupport":true}]);
        let before:Value=serde_json::from_slice(save).unwrap();
        let copy=group_pickup_candidate(save,&plan.to_string()).unwrap();
        let mut expected=before.clone();
        expected["Player"]["ListInventories"]["0"]["Inventory"]["40005160"]["Amount"]=Value::from(1);
        expected["Player"]["ListInventories"]["0"]["Inventory"]["40005161"]["Amount"]=Value::from(3);
        expected["World"]["GridCollection"]["Grids"]["7"]["Objects"].as_object_mut().unwrap().remove("1");
        expected["World"]["GridCollection"]["Grids"].as_object_mut().unwrap().remove("8");
        assert_eq!(serde_json::from_str::<Value>(&copy).unwrap(),expected);
        assert!(copy.contains("\"Unknown\":1e2"));assert!(copy.contains("\"Other\":1e2"));
        let mut external=before.clone();external["OtherGridID"]=Value::from(8);
        assert!(group_pickup_candidate(&serde_json::to_vec(&external).unwrap(),&plan.to_string()).is_err());
        let mut stateful=before.clone();stateful["World"]["GridCollection"]["Grids"]["8"]["Objects"]["1"]["State"]=serde_json::json!({"Other":1});
        assert!(group_pickup_candidate(&serde_json::to_vec(&stateful).unwrap(),&plan.to_string()).is_err());
        let mut wrong=plan.clone();wrong[0].as_object_mut().unwrap().remove("includeSupport");
        assert!(group_pickup_candidate(save,&wrong.to_string()).is_err());
    }
    #[test]
    fn free_support_stock_batch_duplicates_and_picks_up_without_partial_changes(){
        let save=br#"{"GameInfo":{"Version":643},"Player":{"ListInventories":{"0":{"ID":0,"CompatibleItemType":"ItemType_Furniture","CompatibleFurnitureTypes":{"List":["FurnitureItemType_Default"]},"Inventory":{"40005161":{"Amount":2,"Marker":"ItemMarker_Favorite"}}}},"Other":1e2},"World":{"GridCollection":{"Grids":{
          "7":{"ID":7,"Objects":{"1":{"ID":1,"ItemID":40005160,"X":4,"Y":6,"Orientation":"GridOrientation_Down","State":{"SubGrid":{"GridID":8}}}}},
          "8":{"ID":8,"GridDataPath":"GridData/Furniture/NonIP_SetLess/CornerWallShelf01-GridData.json","TessellationFactor":2,"NextGridObjectID":2,"Objects":{"1":{"ID":1,"ItemID":40005161,"X":0,"Y":0,"Orientation":"GridOrientation_Down","State":null}}}
        }}}}"#;
        let mut plan=serde_json::json!({"localOrdinal":1,"itemId":40005160,"expectedX":4,"expectedY":6,"path":[],"freePlacement":true,"terrainPath":"GridData/Furniture/NonIP_SetLess/CornerWallShelf01-GridData.json","stock":[
          {"action":"place","itemId":40005161,"expectedStock":2,"x":0,"y":0,"orientation":"GridOrientation_Down"},
          {"action":"place","itemId":40005161,"expectedStock":1,"x":2,"y":2,"orientation":"GridOrientation_Left"}
        ]});
        let draft=support_child_candidate(save,&plan).unwrap();
        let mut original:Value=serde_json::from_slice(save).unwrap();let mut expected=original.clone();
        expected["Player"]["ListInventories"]["0"]["Inventory"]["40005161"]["Amount"]=0.into();
        let grid=&mut expected["World"]["GridCollection"]["Grids"]["8"];
        grid["NextGridObjectID"]=4.into();
        grid["Objects"]["2"]=serde_json::json!({"ID":2,"ItemID":40005161,"X":0,"Y":0,"Orientation":"GridOrientation_Down"});
        grid["Objects"]["3"]=serde_json::json!({"ID":3,"ItemID":40005161,"X":2,"Y":2,"Orientation":"GridOrientation_Left"});
        assert_eq!(serde_json::from_str::<Value>(&draft.patched_json).unwrap(),expected);
        plan["stock"][1]["expectedStock"]=2.into();assert!(support_child_candidate(save,&plan).is_err());
        plan["stock"]=serde_json::json!([
          {"action":"pickup","itemId":40005161,"expectedStock":0,"index":1,"expectedX":0,"expectedY":0,"expectedOrientation":"GridOrientation_Down"},
          {"action":"pickup","itemId":40005161,"expectedStock":1,"index":2,"expectedX":2,"expectedY":2,"expectedOrientation":"GridOrientation_Left"}
        ]);
        let picked=support_child_candidate(draft.patched_json.as_bytes(),&plan).unwrap();
        original["World"]["GridCollection"]["Grids"]["8"]["NextGridObjectID"]=4.into();
        assert_eq!(serde_json::from_str::<Value>(&picked.patched_json).unwrap(),original);assert!(picked.patched_json.contains("1e2"));
        plan["stock"][1]["index"]=1.into();assert!(support_child_candidate(draft.patched_json.as_bytes(),&plan).is_err());
        plan["stock"][1]["index"]=2.into();
        expected["World"]["SpawnedObjects"]=serde_json::json!([{"GridID":8,"GridObjectID":3}]);
        assert!(support_child_candidate(&serde_json::to_vec(&expected).unwrap(),&plan).is_err());
    }
    #[test]
    fn support_stock_place_and_pickup_are_atomic_and_preserve_other_records(){
        let save=br#"{"GameInfo":{"Version":643},"Player":{"ListInventories":{"0":{"ID":0,"CompatibleItemType":"ItemType_Furniture","CompatibleFurnitureTypes":{"List":["FurnitureItemType_Default"]},"Inventory":{"40005161":{"Amount":2,"Marker":"ItemMarker_Favorite"}}}},"Other":1e2},"World":{"GridCollection":{"Grids":{
          "7":{"ID":7,"Objects":{"1":{"ID":1,"ItemID":40005160,"X":4,"Y":6,"Orientation":"GridOrientation_Down","State":{"SubGrid":{"GridID":8}}}}},
          "8":{"ID":8,"GridDataPath":"GridData/Furniture/NonIP_SetLess/CornerWallShelf01-GridData.json","TessellationFactor":2,"NextGridObjectID":2,"Objects":{"1":{"ID":1,"ItemID":40005161,"X":0,"Y":0,"Orientation":"GridOrientation_Down","State":null}}}
        }}}}"#;
        let mut plan=serde_json::json!({"localOrdinal":1,"itemId":40005160,"expectedX":4,"expectedY":6,"path":[],"terrainPath":"GridData/Furniture/NonIP_SetLess/CornerWallShelf01-GridData.json","stock":{"action":"place","itemId":40005161,"expectedStock":2,"x":2,"y":0,"orientation":"GridOrientation_Left"}});
        let draft=support_child_candidate(save,&plan).unwrap();
        let original:Value=serde_json::from_slice(save).unwrap();let mut expected=original.clone();
        expected["Player"]["ListInventories"]["0"]["Inventory"]["40005161"]["Amount"]=Value::from(1);
        expected["World"]["GridCollection"]["Grids"]["8"]["NextGridObjectID"]=Value::from(3);
        expected["World"]["GridCollection"]["Grids"]["8"]["Objects"]["2"]=serde_json::json!({"ID":2,"ItemID":40005161,"X":2,"Y":0,"Orientation":"GridOrientation_Left"});
        assert_eq!(serde_json::from_str::<Value>(&draft.patched_json).unwrap(),expected);assert!(draft.patched_json.contains("\"Other\":1e2"));
        plan["stock"]["y"]=Value::from(2);assert!(support_child_candidate(save,&plan).is_err());
        plan["stock"]["y"]=Value::from(0);plan["stock"]["expectedStock"]=Value::from(1);assert!(support_child_candidate(save,&plan).is_err());
        plan["stock"]["expectedStock"]=Value::from(2);plan["stock"]["x"]=Value::from(0);assert!(support_child_candidate(save,&plan).is_err());
        let mut free=plan.clone();free["freePlacement"]=true.into();
        let overlap=support_child_candidate(save,&free).unwrap();let j:Value=serde_json::from_str(&overlap.patched_json).unwrap();
        assert_eq!(j["World"]["GridCollection"]["Grids"]["8"]["Objects"]["1"],original["World"]["GridCollection"]["Grids"]["8"]["Objects"]["1"]);
        assert_eq!(j["World"]["GridCollection"]["Grids"]["8"]["Objects"]["2"]["X"],0);
        assert_eq!(j["World"]["GridCollection"]["Grids"]["8"]["NextGridObjectID"],3);
        assert_eq!(j["Player"]["ListInventories"]["0"]["Inventory"]["40005161"]["Amount"],1);
        free["stock"]["orientation"]="GridOrientation_DownLeft".into();assert!(support_child_candidate(save,&free).is_err());
        free["stock"]["orientation"]="GridOrientation_Left".into();free["stock"]["x"]=999.into();assert!(support_child_candidate(save,&free).is_err());
        plan.as_object_mut().unwrap().remove("terrainPath");
        plan["stock"]=serde_json::json!({"action":"pickup","itemId":40005161,"expectedStock":1,"index":1,"expectedX":2,"expectedY":0,"expectedOrientation":"GridOrientation_Left"});
        let picked=support_child_candidate(draft.patched_json.as_bytes(),&plan).unwrap();
        let mut expected_after=original.clone();expected_after["World"]["GridCollection"]["Grids"]["8"]["NextGridObjectID"]=Value::from(3);
        assert_eq!(serde_json::from_str::<Value>(&picked.patched_json).unwrap(),expected_after);
        let mut empty=original.clone();empty["World"]["GridCollection"]["Grids"]["8"]["Objects"]=serde_json::json!({});
        plan["terrainPath"]=Value::from("GridData/Furniture/NonIP_SetLess/CornerWallShelf01-GridData.json");
        plan["stock"]=serde_json::json!({"action":"place","itemId":40005161,"expectedStock":2,"x":2,"y":0,"orientation":"GridOrientation_Left"});
        assert!(support_child_candidate(&serde_json::to_vec(&empty).unwrap(),&plan).is_ok());
        let raw=serde_json::to_vec(&empty).unwrap();
        plan["stock"]=serde_json::json!([
         {"action":"place","itemId":40005161,"expectedStock":2,"x":0,"y":0,"orientation":"GridOrientation_Down"},
         {"action":"place","itemId":40005161,"expectedStock":1,"x":2,"y":0,"orientation":"GridOrientation_Left"}
        ]);
        let d=support_child_candidate(&raw,&plan).unwrap();
        let j:Value=serde_json::from_str(&d.patched_json).unwrap();
        assert_eq!(j["World"]["GridCollection"]["Grids"]["8"]["Objects"].as_object().unwrap().len(),2);
        assert_eq!(j["World"]["GridCollection"]["Grids"]["8"]["NextGridObjectID"],4);
        assert_eq!(j["World"]["GridCollection"]["Grids"]["7"],empty["World"]["GridCollection"]["Grids"]["7"]);
        assert_eq!(j["Player"]["ListInventories"]["0"]["Inventory"]["40005161"]["Amount"],0);
        assert!(support_child_candidate(save,&plan).is_err());
        plan["stock"][1]["expectedStock"]=Value::from(2);assert!(support_child_candidate(&raw,&plan).is_err());
        plan["stock"][1]["expectedStock"]=Value::from(1);plan["stock"][1]["x"]=Value::from(0);assert!(support_child_candidate(&raw,&plan).is_err());
        plan["stock"][1]["x"]=Value::from(2);plan["stock"][1]["y"]=Value::from(2);assert!(support_child_candidate(&raw,&plan).is_err());
        plan["stock"][1]["y"]=Value::from(0);
        empty["World"]["GridCollection"]["Grids"]["8"]["NextGridObjectID"]=Value::from(0);
        let d=support_child_candidate(&serde_json::to_vec(&empty).unwrap(),&plan).unwrap();
        let j:Value=serde_json::from_str(&d.patched_json).unwrap();
        assert_eq!(j["World"]["GridCollection"]["Grids"]["8"]["Objects"]["1"]["ID"],1);
        assert_eq!(j["World"]["GridCollection"]["Grids"]["8"]["Objects"]["2"]["ID"],2);
        assert_eq!(j["World"]["GridCollection"]["Grids"]["8"]["NextGridObjectID"],3);
        let mut stale=empty.clone();stale["World"]["SpawnedObjects"]=serde_json::json!([{"GridID":8,"GridObjectID":1}]);
        assert!(support_child_candidate(&serde_json::to_vec(&stale).unwrap(),&plan).is_err());
        let mut malformed=empty.clone();
        malformed["World"]["GridCollection"]["Grids"]["8"]["Objects"]["0"]=serde_json::json!({"ID":0,"ItemID":40005161,"X":0,"Y":0,"Orientation":"GridOrientation_Down"});
        assert!(support_child_candidate(&serde_json::to_vec(&malformed).unwrap(),&plan).is_err());

    }
    #[test]
    fn support_factor_one_eight_way_transform_stock_and_transfer(){
        let mut save:Value=serde_json::from_str(r#"{"GameInfo":{"Version":643},"Player":{"Marker":100,"ListInventories":{"0":{"ID":0,"CompatibleItemType":"ItemType_Furniture","CompatibleFurnitureTypes":{"List":["FurnitureItemType_Default"]},"Inventory":{"40005161":{"Amount":2}}}}},"World":{"GridCollection":{"Grids":{"7":{"ID":7,"Objects":{"1":{"ID":1,"ItemID":40005160,"X":4,"Y":6,"Orientation":"GridOrientation_Down","State":{"SubGrid":{"GridID":8}}},"2":{"ID":2,"ItemID":40005160,"X":8,"Y":6,"Orientation":"GridOrientation_Down","State":{"SubGrid":{"GridID":9}}}}},"8":{"ID":8,"GridDataPath":"GridData/Furniture/NonIP_SetLess/CornerWallShelf01-GridData.json","TessellationFactor":1,"NextGridObjectID":2,"Objects":{"1":{"ID":1,"ItemID":40005161,"X":0,"Y":0,"Orientation":"GridOrientation_Down"}}},"9":{"ID":9,"GridDataPath":"GridData/Furniture/NonIP_SetLess/CornerWallShelf01-GridData.json","TessellationFactor":1,"NextGridObjectID":1,"Objects":{}}}}}}"#).unwrap();
        let raw=serde_json::to_vec(&save).unwrap();
        let parents=room_support_ordinals(&raw).unwrap();
        let from=parents[&("7".to_owned(),"1".to_owned())];let to=parents[&("7".to_owned(),"2".to_owned())];
        let mut plan=serde_json::json!({"localOrdinal":from,"itemId":40005160,"expectedX":4,"expectedY":6,"path":[],"terrainPath":"GridData/Furniture/NonIP_SetLess/CornerWallShelf01-GridData.json","freePlacement":true,"edits":[{"index":0,"itemId":40005161,"expectedX":0,"expectedY":0,"expectedOrientation":"GridOrientation_Down","x":0,"y":0,"orientation":"GridOrientation_DownLeft"}]});
        let changed=support_child_candidate(&raw,&plan).unwrap();
        let mut expected=save.clone();expected["World"]["GridCollection"]["Grids"]["8"]["Objects"]["1"]["Orientation"]="GridOrientation_DownLeft".into();
        assert_eq!(serde_json::from_str::<Value>(&changed.patched_json).unwrap(),expected);
        plan.as_object_mut().unwrap().remove("freePlacement");assert!(support_child_candidate(&raw,&plan).is_err());plan["freePlacement"]=true.into();
        save["World"]["GridCollection"]["Grids"]["8"]["TessellationFactor"]=2.into();assert!(support_child_candidate(&serde_json::to_vec(&save).unwrap(),&plan).is_err());
        let witness=serde_json::json!({"parentItemId":40005160,"parentX":4,"parentY":6,"path":[],"index":0});
        let paste=serde_json::json!({"localOrdinal":to,"itemId":40005160,"expectedX":8,"expectedY":6,"path":[],"terrainPath":"GridData/Furniture/NonIP_SetLess/CornerWallShelf01-GridData.json","freePlacement":true,"floorTransfer":{"localOrdinal":from,"supportSource":witness,"itemId":40005161,"expectedX":0,"expectedY":0,"expectedOrientation":"GridOrientation_DownLeft","x":0,"y":0,"orientation":"GridOrientation_UpRight"}});
        let moved=support_child_candidate(changed.patched_json.as_bytes(),&paste).unwrap();let after:Value=serde_json::from_str(&moved.patched_json).unwrap();
        assert_eq!(after["Player"],expected["Player"]);assert_eq!(after["World"]["GridCollection"]["Grids"]["8"]["Objects"],serde_json::json!({}));assert_eq!(after["World"]["GridCollection"]["Grids"]["9"]["Objects"]["1"]["Orientation"],"GridOrientation_UpRight");
        let stock=serde_json::json!({"localOrdinal":to,"itemId":40005160,"expectedX":8,"expectedY":6,"path":[],"terrainPath":"GridData/Furniture/NonIP_SetLess/CornerWallShelf01-GridData.json","freePlacement":true,"stock":{"action":"place","itemId":40005161,"expectedStock":2,"x":0,"y":0,"orientation":"GridOrientation_UpLeft"}});
        let d=support_child_candidate(moved.patched_json.as_bytes(),&stock).unwrap();let after:Value=serde_json::from_str(&d.patched_json).unwrap();assert_eq!(after["World"]["GridCollection"]["Grids"]["9"]["Objects"]["2"]["Orientation"],"GridOrientation_UpLeft");
        assert_eq!(after["Player"]["ListInventories"]["0"]["Inventory"]["40005161"]["Amount"],1);
    }
    #[test]
    fn support_free_move_uses_exact_source_raster_and_rejects_holes(){
        let save=br#"{"GameInfo":{"Version":643},"Player":{"Marker":1e2},"World":{"GridCollection":{"Grids":{
          "7":{"ID":7,"Objects":{"1":{"ID":1,"ItemID":40005160,"X":4,"Y":6,"Orientation":"GridOrientation_Down","State":{"SubGrid":{"GridID":8}}}}},
          "8":{"ID":8,"GridDataPath":"GridData/Furniture/NonIP_SetLess/CornerWallShelf01-GridData.json","TessellationFactor":2,"Objects":{"1":{"ID":1,"ItemID":40005161,"X":0,"Y":0,"Orientation":"GridOrientation_Down","State":null}}}
        }}}}"#;
        let mut plan=serde_json::json!({"localOrdinal":1,"itemId":40005160,"expectedX":4,"expectedY":6,"path":[],"terrainPath":"GridData/Furniture/NonIP_SetLess/CornerWallShelf01-GridData.json","edits":[{"index":0,"itemId":40005161,"expectedX":0,"expectedY":0,"expectedOrientation":"GridOrientation_Down","x":2,"y":0,"orientation":"GridOrientation_Left"}]});
        let draft=support_child_candidate(save,&plan).unwrap();
        let mut expected:Value=serde_json::from_slice(save).unwrap();
        expected["World"]["GridCollection"]["Grids"]["8"]["Objects"]["1"]["X"]=Value::from(2);
        expected["World"]["GridCollection"]["Grids"]["8"]["Objects"]["1"]["Orientation"]=Value::from("GridOrientation_Left");
        assert_eq!(serde_json::from_str::<Value>(&draft.patched_json).unwrap(),expected);
        assert!(draft.patched_json.contains("\"Marker\":1e2"));
        plan["edits"][0]["y"]=Value::from(2);assert!(support_child_candidate(save,&plan).is_err());
        plan["edits"][0]["y"]=Value::from(4);assert!(support_child_candidate(save,&plan).is_err());
        plan["freePlacement"]=true.into();plan["edits"][0]["y"]=2.into();
        let free=support_child_candidate(save,&plan).unwrap();let v:Value=serde_json::from_str(&free.patched_json).unwrap();
        assert_eq!(v["World"]["GridCollection"]["Grids"]["8"]["Objects"]["1"]["Y"],2);
        plan["edits"][0]["y"]=999.into();assert!(support_child_candidate(save,&plan).is_err());
        plan.as_object_mut().unwrap().remove("freePlacement");
        plan["edits"][0]["y"]=Value::from(0);plan["terrainPath"]=Value::from("GridData/Furniture/NonIP_SetLess/Table01-GridData.json");assert!(support_child_candidate(save,&plan).is_err());
    }
    #[test]
    fn free_support_group_transform_is_atomic_and_preserves_ids(){
        let mut save=serde_json::json!({"GameInfo":{"Version":643},"Player":{"Marker":100},"World":{"GridCollection":{"Grids":{
            "7":{"ID":7,"Objects":{"1":{"ID":1,"ItemID":40005160,"X":4,"Y":6,"Orientation":"GridOrientation_Down","State":{"SubGrid":{"GridID":8}}}}},
            "8":{"ID":8,"GridDataPath":"GridData/Furniture/NonIP_SetLess/CornerWallShelf01-GridData.json","TessellationFactor":2,"Objects":{
                "1":{"ID":1,"ItemID":40005161,"X":0,"Y":0,"Orientation":"GridOrientation_Down"},
                "2":{"ID":2,"ItemID":40005162,"X":2,"Y":0,"Orientation":"GridOrientation_Down"},
                "3":{"ID":3,"ItemID":40005161,"X":0,"Y":2,"Orientation":"GridOrientation_Down"}
            }}
        }}}});
        let mut plan=serde_json::json!({"localOrdinal":1,"itemId":40005160,"expectedX":4,"expectedY":6,"path":[],"groupEdit":true,
            "freePlacement":true,"terrainPath":"GridData/Furniture/NonIP_SetLess/CornerWallShelf01-GridData.json","edits":[
                {"index":0,"itemId":40005161,"expectedX":0,"expectedY":0,"expectedOrientation":"GridOrientation_Down","x":2,"y":0,"orientation":"GridOrientation_Left"},
                {"index":1,"itemId":40005162,"expectedX":2,"expectedY":0,"expectedOrientation":"GridOrientation_Down","x":2,"y":2,"orientation":"GridOrientation_Left"},
                {"index":2,"itemId":40005161,"expectedX":0,"expectedY":2,"expectedOrientation":"GridOrientation_Down","x":0,"y":0,"orientation":"GridOrientation_Left"}
            ]});
        let raw=serde_json::to_vec(&save).unwrap();
        let d=support_child_candidate(&raw,&plan).unwrap();let after:Value=serde_json::from_str(&d.patched_json).unwrap();
        let mut expected=save.clone();
        for (id,x,y) in [("1",2,0),("2",2,2),("3",0,0)]{
            let v=&mut expected["World"]["GridCollection"]["Grids"]["8"]["Objects"][id];
            v["X"]=x.into();v["Y"]=y.into();v["Orientation"]="GridOrientation_Left".into();
        }
        assert_eq!(after,expected);assert!(d.untouched_bytes_preserved);
        let mut strict=plan.clone();strict.as_object_mut().unwrap().remove("groupEdit");assert!(support_child_candidate(&raw,&strict).is_err());
        let mut stale=plan.clone();stale["edits"][2]["index"]=0.into();assert!(support_child_candidate(&raw,&stale).is_err());
        stale=plan.clone();stale["edits"][2]["x"]=999.into();assert!(support_child_candidate(&raw,&stale).is_err());
        save["World"]["SpawnedObjects"]=serde_json::json!([{"GridID":8,"GridObjectID":3}]);
        assert!(support_child_candidate(&serde_json::to_vec(&save).unwrap(),&plan).is_err());
        plan.as_object_mut().unwrap().remove("freePlacement");assert!(support_child_candidate(&raw,&plan).is_err());
    }
    #[test]
    fn free_support_swap_preserves_ids_and_requires_exact_bounds_and_reference_closure(){
        let mut save=serde_json::json!({"GameInfo":{"Version":643},"Player":{"Marker":100},"World":{"GridCollection":{"Grids":{
            "7":{"ID":7,"Objects":{"1":{"ID":1,"ItemID":40005160,"X":4,"Y":6,"Orientation":"GridOrientation_Down","State":{"SubGrid":{"GridID":8}}}}},
            "8":{"ID":8,"GridDataPath":"GridData/Furniture/NonIP_SetLess/CornerWallShelf01-GridData.json","TessellationFactor":2,"Objects":{
                "1":{"ID":1,"ItemID":40005161,"X":0,"Y":0,"Orientation":"GridOrientation_Left","State":null},
                "2":{"ID":2,"ItemID":40005162,"X":2,"Y":2,"Orientation":"GridOrientation_Down","State":null},
                "3":{"ID":3,"ItemID":40005161,"X":2,"Y":2,"Orientation":"GridOrientation_Down","State":null}
            }}
        }}}});
        let mut plan=serde_json::json!({"localOrdinal":1,"itemId":40005160,"expectedX":4,"expectedY":6,"path":[],
            "freePlacement":true,"terrainPath":"GridData/Furniture/NonIP_SetLess/CornerWallShelf01-GridData.json","edits":[
                {"index":0,"itemId":40005161,"expectedX":0,"expectedY":0,"expectedOrientation":"GridOrientation_Left","x":2,"y":2,"orientation":"GridOrientation_Left"},
                {"index":1,"itemId":40005162,"expectedX":2,"expectedY":2,"expectedOrientation":"GridOrientation_Down","x":0,"y":0,"orientation":"GridOrientation_Down"}
            ]});
        let scan=|v:&Value,p:&Value|support_child_candidate(&serde_json::to_vec(v).unwrap(),p);
        let draft=scan(&save,&plan).unwrap();
        let mut expected=save.clone();
        for (id,x,y) in [("1",2,2),("2",0,0)]{
            expected["World"]["GridCollection"]["Grids"]["8"]["Objects"][id]["X"]=x.into();
            expected["World"]["GridCollection"]["Grids"]["8"]["Objects"][id]["Y"]=y.into();
        }
        assert_eq!(serde_json::from_str::<Value>(&draft.patched_json).unwrap(),expected);
        assert!(draft.untouched_bytes_preserved);
        let mut invalid=plan.clone();invalid.as_object_mut().unwrap().remove("freePlacement");assert!(scan(&save,&invalid).is_err());
        invalid=plan.clone();invalid.as_object_mut().unwrap().remove("terrainPath");assert!(scan(&save,&invalid).is_err());
        invalid=plan.clone();invalid["edits"][1]["orientation"]="GridOrientation_Left".into();assert!(scan(&save,&invalid).is_err());
        invalid=plan.clone();invalid["edits"][1]["y"]=1.into();assert!(scan(&save,&invalid).is_err());
        plan["edits"][1]["expectedY"]=999.into();plan["edits"][0]["y"]=999.into();
        save["World"]["GridCollection"]["Grids"]["8"]["Objects"]["2"]["Y"]=999.into();
        assert!(scan(&save,&plan).is_err());
        plan["edits"][1]["expectedY"]=2.into();plan["edits"][0]["y"]=2.into();
        save["World"]["GridCollection"]["Grids"]["8"]["Objects"]["2"]["Y"]=2.into();
        save["World"]["MissionSlots"]=serde_json::json!({"owner":{"Slots":[{"SpawnedObjects":[{"GridID":8,"GridObjectID":2}]}]}});
        assert!(scan(&save,&plan).is_err());
    }
    #[test]
    fn support_transfer_is_atomic_and_stock_independent(){
        let save=br#"{"GameInfo":{"Version":643},"Player":{"Marker":1e2},"World":{"GridCollection":{"Grids":{
          "7":{"ID":7,"Objects":{"1":{"ID":1,"ItemID":40005160,"X":4,"Y":6,"Orientation":"GridOrientation_Down","State":{"SubGrid":{"GridID":8}}},"2":{"ID":2,"ItemID":40005160,"X":8,"Y":6,"Orientation":"GridOrientation_Down","State":{"SubGrid":{"GridID":9}}}}},
          "8":{"ID":8,"NextGridObjectID":2,"Objects":{"1":{"ID":1,"ItemID":40005161,"X":0,"Y":0,"Orientation":"GridOrientation_Down","State":null}}},
          "9":{"ID":9,"GridDataPath":"GridData/Furniture/NonIP_SetLess/CornerWallShelf01-GridData.json","TessellationFactor":2,"NextGridObjectID":4,"Objects":{}}
        }}}}"#;
        let mut plan=serde_json::json!({"localOrdinal":1,"itemId":40005160,"expectedX":4,"expectedY":6,"path":[],"transfer":{"index":0,"itemId":40005161,"expectedX":0,"expectedY":0,"expectedOrientation":"GridOrientation_Down","destination":{"localOrdinal":2,"itemId":40005160,"expectedX":8,"expectedY":6,"terrainPath":"GridData/Furniture/NonIP_SetLess/CornerWallShelf01-GridData.json"},"x":2,"y":0,"orientation":"GridOrientation_Left"}});
        let draft=support_child_candidate(save,&plan).unwrap();
        let mut expected:Value=serde_json::from_slice(save).unwrap();
        expected["World"]["GridCollection"]["Grids"]["8"]["Objects"]=serde_json::json!({});
        expected["World"]["GridCollection"]["Grids"]["9"]["Objects"]=serde_json::json!({"4":{"ID":4,"ItemID":40005161,"X":2,"Y":0,"Orientation":"GridOrientation_Left"}});
        expected["World"]["GridCollection"]["Grids"]["9"]["NextGridObjectID"]=Value::from(5);
        assert_eq!(serde_json::from_str::<Value>(&draft.patched_json).unwrap(),expected);
        assert!(draft.patched_json.contains("\"Marker\":1e2"));
        plan["transfer"]["y"]=Value::from(2);assert!(support_child_candidate(save,&plan).is_err());
        plan["transfer"]["y"]=Value::from(0);plan["transfer"]["destination"]["expectedX"]=Value::from(9);assert!(support_child_candidate(save,&plan).is_err());
        plan["transfer"]["destination"]["expectedX"]=8.into();
        let mut occupied:Value=serde_json::from_slice(save).unwrap();occupied["World"]["GridCollection"]["Grids"]["9"]["Objects"]["1"]=serde_json::json!({"ID":1,"ItemID":40005161,"X":2,"Y":0,"Orientation":"GridOrientation_Down"});
        let raw=serde_json::to_vec(&occupied).unwrap();assert!(support_child_candidate(&raw,&plan).is_err());
        plan["freePlacement"]=true.into();let d=support_child_candidate(&raw,&plan).unwrap();let j:Value=serde_json::from_str(&d.patched_json).unwrap();
        assert_eq!(j["World"]["GridCollection"]["Grids"]["9"]["Objects"]["1"],occupied["World"]["GridCollection"]["Grids"]["9"]["Objects"]["1"]);
        assert_eq!(j["World"]["GridCollection"]["Grids"]["9"]["Objects"]["4"]["X"],2);
        assert_eq!(j["World"]["GridCollection"]["Grids"]["8"]["Objects"],serde_json::json!({}));assert_eq!(j["Player"],occupied["Player"]);
        plan["transfer"]["orientation"]="GridOrientation_DownLeft".into();assert!(support_child_candidate(&raw,&plan).is_err());
    }
    #[test]
    fn support_transfer_resolves_distinct_room_grids_and_preserves_inventory(){
        let mut save=serde_json::json!({"GameInfo":{"Version":643},"Player":{"Marker":100},"World":{"GridCollection":{"Grids":{
            "7":{"ID":7,"GridDataPath":"GridData/Rooms/Room10x10-GridData.json","TessellationFactor":1,"Objects":{"1":{"ID":1,"ItemID":40005160,"X":4,"Y":6,"Orientation":"GridOrientation_Down","State":{"SubGrid":{"GridID":8}}}}},
            "8":{"ID":8,"GridDataPath":"GridData/Furniture/NonIP_SetLess/CornerWallShelf01-GridData.json","TessellationFactor":1,"NextGridObjectID":2,"Objects":{"1":{"ID":1,"ItemID":40005161,"X":0,"Y":0,"Orientation":"GridOrientation_Down","State":null}}},
            "9":{"ID":9,"GridDataPath":"GridData/Rooms/Room10x10-GridData.json","TessellationFactor":2,"Objects":{"1":{"ID":1,"ItemID":40005160,"X":4,"Y":6,"Orientation":"GridOrientation_Down","State":{"SubGrid":{"GridID":10}}}}},
            "10":{"ID":10,"GridDataPath":"GridData/Furniture/NonIP_SetLess/CornerWallShelf01-GridData.json","TessellationFactor":2,"NextGridObjectID":4,"Objects":{}}
        }}}});
        let raw=serde_json::to_vec(&save).unwrap();
        let ordinals=room_support_ordinals(&raw).unwrap();
        let from=ordinals[&("7".to_owned(),"1".to_owned())];
        let to=ordinals[&("9".to_owned(),"1".to_owned())];
        assert_ne!(from,to);
        let mut plan=serde_json::json!({"localOrdinal":from,"itemId":40005160,"expectedX":4,"expectedY":6,"path":[],"freePlacement":true,
            "transfer":{"index":0,"itemId":40005161,"expectedX":0,"expectedY":0,"expectedOrientation":"GridOrientation_Down",
                "destination":{"localOrdinal":to,"itemId":40005160,"expectedX":4,"expectedY":6,"terrainPath":"GridData/Furniture/NonIP_SetLess/CornerWallShelf01-GridData.json"},
                "x":2,"y":2,"orientation":"GridOrientation_Left"}});
        let draft=support_child_candidate(&raw,&plan).unwrap();
        let result:Value=serde_json::from_str(&draft.patched_json).unwrap();
        assert_eq!(result["Player"],save["Player"]);
        for g in ["7","9"]{assert_eq!(result["World"]["GridCollection"]["Grids"][g],save["World"]["GridCollection"]["Grids"][g]);}
        assert_eq!(result["World"]["GridCollection"]["Grids"]["8"]["Objects"],serde_json::json!({}));
        assert_eq!(result["World"]["GridCollection"]["Grids"]["10"]["Objects"]["4"],serde_json::json!({"ID":4,"ItemID":40005161,"X":2,"Y":2,"Orientation":"GridOrientation_Left"}));
        plan["transfer"]["destination"]["localOrdinal"]=from.into();assert!(support_child_candidate(&raw,&plan).is_err());
        plan["transfer"]["destination"]["localOrdinal"]=to.into();
        save["World"]["MissionSlots"]=serde_json::json!({"owner":{"Slots":[{"SpawnedObjects":[{"GridID":8,"GridObjectID":1}]}]}});
        assert!(support_child_candidate(&serde_json::to_vec(&save).unwrap(),&plan).is_err());
    }
    #[test]
    fn free_room_floor_to_support_transfer_is_atomic_and_stock_independent(){
        let mut save:Value=serde_json::from_str(r#"{"GameInfo":{"Version":643},"Player":{"Marker":100},"World":{"PlayerHouses":[{"Floors":[{"Rooms":{"0":{"FloorGridID":42}}}]}],"GridCollection":{"Grids":{"42":{"ID":42,"GridDataPath":"GridData/Rooms/Room8x8-GridData.json","TessellationFactor":2,"NextGridObjectID":3,"Objects":{"1":{"ID":1,"ItemID":40005160,"X":4,"Y":4,"Orientation":"GridOrientation_Down","State":{"SubGrid":{"GridID":43,"DesignID":null}}},"2":{"ID":2,"ItemID":40005162,"X":6,"Y":4,"Orientation":"GridOrientation_Down"}}},"43":{"ID":43,"GridDataPath":"GridData/Furniture/NonIP_SetLess/CornerWallShelf01-GridData.json","TessellationFactor":2,"NextGridObjectID":2,"Objects":{"1":{"ID":1,"ItemID":40005162,"X":2,"Y":2,"Orientation":"GridOrientation_Down"}}}}}}}"#).unwrap();
        let raw=serde_json::to_vec(&save).unwrap();
        let ordinal=room_support_ordinals(&raw).unwrap()[&("42".to_owned(),"1".to_owned())];
        let mut plan=serde_json::json!({"localOrdinal":ordinal,"itemId":40005160,"expectedX":4,"expectedY":4,"path":[],
            "freePlacement":true,"terrainPath":"GridData/Furniture/NonIP_SetLess/CornerWallShelf01-GridData.json",
            "floorTransfer":{"roomSource":{"roomOrdinal":1,"index":1},"itemId":40005162,"expectedX":6,"expectedY":4,
                "expectedOrientation":"GridOrientation_Down","x":2,"y":2,"orientation":"GridOrientation_Left"}});
        let draft=support_child_candidate(&raw,&plan).unwrap();
        let result:Value=serde_json::from_str(&draft.patched_json).unwrap();
        assert_eq!(result["Player"],save["Player"]);
        assert_eq!(result["World"]["PlayerHouses"],save["World"]["PlayerHouses"]);
        let mut expected=save.clone();
        expected["World"]["GridCollection"]["Grids"]["42"]["Objects"].as_object_mut().unwrap().remove("2");
        expected["World"]["GridCollection"]["Grids"]["43"]["Objects"]["2"]=serde_json::json!({"ID":2,"ItemID":40005162,"X":2,"Y":2,"Orientation":"GridOrientation_Left"});
        expected["World"]["GridCollection"]["Grids"]["43"]["NextGridObjectID"]=3.into();
        assert_eq!(result,expected);
        plan["floorTransfer"]["x"]=999.into();assert!(support_child_candidate(&raw,&plan).is_err());
        plan["floorTransfer"]["x"]=2.into();plan["floorTransfer"]["expectedX"]=5.into();assert!(support_child_candidate(&raw,&plan).is_err());
        plan["floorTransfer"]["expectedX"]=6.into();
        let mut strict=plan.clone();strict.as_object_mut().unwrap().remove("freePlacement");assert!(support_child_candidate(&raw,&strict).is_err());
        save["World"]["MissionSlots"]=serde_json::json!({"owner":{"Slots":[{"SpawnedObjects":[{"GridID":42,"GridObjectID":2}]}]}});
        assert!(support_child_candidate(&serde_json::to_vec(&save).unwrap(),&plan).is_err());
    }
    #[test]
    fn child_rotation_and_swap_change_only_selected_scalars(){
        let save=br#"{"GameInfo":{"Version":643},"Player":{"Marker":1e2},"World":{"GridCollection":{"Grids":{
          "7":{"ID":7,"Objects":{"1":{"ID":1,"ItemID":40005160,"X":4,"Y":6,"Orientation":"GridOrientation_Down","State":{"SubGrid":{"GridID":8}}}}},
          "8":{"ID":8,"Objects":{"1":{"ID":1,"ItemID":40005161,"X":1,"Y":2,"Orientation":"GridOrientation_Left","State":null},"2":{"ID":2,"ItemID":40005162,"X":3,"Y":4,"Orientation":"GridOrientation_Down","State":null}}}
        }}}}"#;
        let mut plan=serde_json::json!({"localOrdinal":1,"itemId":40005160,"expectedX":4,"expectedY":6,"path":[],"edits":[{"index":0,"itemId":40005161,"expectedX":1,"expectedY":2,"expectedOrientation":"GridOrientation_Left","x":1,"y":2,"orientation":"GridOrientation_Down"}]});
        let draft=support_child_candidate(save,&plan).unwrap();
        let mut expected:Value=serde_json::from_slice(save).unwrap();
        expected["World"]["GridCollection"]["Grids"]["8"]["Objects"]["1"]["Orientation"]=Value::from("GridOrientation_Down");
        assert_eq!(serde_json::from_str::<Value>(&draft.patched_json).unwrap(),expected);assert!(draft.patched_json.contains("\"Marker\":1e2"));
        plan["edits"][0]["x"]=Value::from(3);assert!(support_child_candidate(save,&plan).is_err());
        plan["edits"]=serde_json::json!([
          {"index":0,"itemId":40005161,"expectedX":1,"expectedY":2,"expectedOrientation":"GridOrientation_Left","x":3,"y":4,"orientation":"GridOrientation_Left"},
          {"index":1,"itemId":40005162,"expectedX":3,"expectedY":4,"expectedOrientation":"GridOrientation_Down","x":1,"y":2,"orientation":"GridOrientation_Down"}
        ]);
        let draft=support_child_candidate(save,&plan).unwrap();let mut expected:Value=serde_json::from_slice(save).unwrap();
        for (id,x,y) in [("1",3,4),("2",1,2)]{expected["World"]["GridCollection"]["Grids"]["8"]["Objects"][id]["X"]=Value::from(x);expected["World"]["GridCollection"]["Grids"]["8"]["Objects"][id]["Y"]=Value::from(y);}
        assert_eq!(serde_json::from_str::<Value>(&draft.patched_json).unwrap(),expected);
        plan["edits"][1]["y"]=Value::from(7);assert!(support_child_candidate(save,&plan).is_err());
        plan["path"]=serde_json::json!([0]);assert!(support_child_candidate(save,&plan).is_err());
    }
    #[test]
    fn area_scene_preserves_road_mode_and_exact_fence_topology_with_furniture(){
        let source=br#"{"GameInfo":{"Version":643},"Player":{"ListInventories":{"0":{"ID":0,"CompatibleItemType":"ItemType_Furniture","CompatibleFurnitureTypes":{"List":["FurnitureItemType_Default"]},"Inventory":{"40000001":{"Amount":1},"40100068":{"Amount":8},"40700246":{"Amount":9}}}}},"World":{"GridCollection":{"NextGridID":8,"Grids":{"7":{"ID":7,"GridDefaultLayoutPath":"SceneLayouts/Village04/Test.json","GridDataPath":"GridData/Test.json","TessellationFactor":2,"NextGridObjectID":1,"Objects":{}}}}}}"#;
        let witness=serde_json::json!({"layoutId":"SceneLayouts/Village04/Test.json","gridDataPath":"GridData/Test.json","factor":2,"sizeX":30,"sizeY":30});
        let mut rows=serde_json::json!([
          {"itemId":"40000001","x":4,"y":4,"orientation":"GridOrientation_Down","destination":witness},
          {"itemId":"40100068","x":4,"y":4,"orientation":"GridOrientation_Down","destination":witness,"network":{"kind":"road","diagonal":false}},
          {"itemId":"40100068","x":8,"y":4,"orientation":"GridOrientation_Down","destination":witness,"network":{"kind":"road","diagonal":true}},
          {"itemId":"40700246","x":20,"y":20,"orientation":"GridOrientation_Down","destination":witness,"network":{"kind":"fence","base":40700246,"diagonal":false}},
          {"itemId":"40700247","x":22,"y":20,"orientation":"GridOrientation_Down","destination":witness,"network":{"kind":"fence","base":40700246,"diagonal":false}},
          {"itemId":"40700246","x":24,"y":20,"orientation":"GridOrientation_Down","destination":witness,"network":{"kind":"fence","base":40700246,"diagonal":false}}
        ]);
        let result=group_paste_candidate(source,&rows.to_string()).unwrap();
        let v:Value=serde_json::from_str(&result).unwrap();
        let grid=&v["World"]["GridCollection"]["Grids"]["7"];
        assert_eq!(grid["NextGridObjectID"],7);
        assert_eq!(grid["Objects"]["2"]["State"],Value::Null);
        assert_eq!(grid["Objects"]["3"]["State"]["FenceMode"]["Diagonal"],true);
        assert_eq!(grid["Objects"]["5"]["ItemID"],40700247);
        assert_eq!(v["Player"]["ListInventories"]["0"]["Inventory"]["40000001"]["Amount"],0);
        assert_eq!(v["Player"]["ListInventories"]["0"]["Inventory"]["40100068"]["Amount"],8);
        assert_eq!(v["Player"]["ListInventories"]["0"]["Inventory"]["40700246"]["Amount"],9);
        let (scan,_)=scan_grid_instances(result.as_bytes()).unwrap();
        let requests:Vec<_>=scan.private_targets.iter().enumerate().filter(|(_, (t,_))|t.item_id/100_000==401||t.item_id/100_000==407).map(|(i,(t,xy))|{let (x,y)=xy.unwrap();serde_json::json!({"localOrdinal":i+1,"itemId":t.item_id,"x":x,"y":y})}).collect();
        let captured:Value=serde_json::from_str(&inspect_scene_network(result.as_bytes(),&serde_json::to_string(&requests).unwrap()).unwrap()).unwrap();
        assert_eq!(captured.as_array().unwrap().len(),5);
        assert!(captured.as_array().unwrap().iter().any(|r|r["network"]["diagonal"]==true));
        let mut incomplete=requests.clone();incomplete.pop();
        assert!(inspect_scene_network(result.as_bytes(),&serde_json::to_string(&incomplete).unwrap()).is_err());
        rows[5]["x"]=Value::from(26);
        assert!(group_paste_candidate(source,&rows.to_string()).is_err());
    }
    #[test]
    fn free_outdoor_support_parent_preserves_children_and_allocates_independent_clone(){
        let layout="SceneLayouts/Village04/DefaultVillageLayout01-MeadowGrids.json";
        let data="GridData/Villages/Village04-MeadowLevel-GridData.json";
        let raw=serde_json::json!({"GameInfo":{"Version":643},"Player":{"ListInventories":{"0":{"ID":0,"CompatibleItemType":"ItemType_Furniture","CompatibleFurnitureTypes":{"List":["FurnitureItemType_Default"]},"Inventory":{"40005160":{"Amount":1},"40005161":{"Amount":1}}}}},"World":{"GridCollection":{"NextGridID":20,"Grids":{
            "7":{"ID":7,"GridDefaultLayoutPath":layout,"GridDataPath":data,"TessellationFactor":1,"NextGridObjectID":3,"Objects":{"1":{"ID":1,"ItemID":40005160,"X":4,"Y":6,"Orientation":"GridOrientation_Down","State":{"SubGrid":{"GridID":8}}},"2":{"ID":2,"ItemID":40005161,"X":5,"Y":6,"Orientation":"GridOrientation_Down"}}},
            "8":{"ID":8,"GridDataPath":"GridData/Furniture/NonIP_SetLess/CornerWallShelf01-GridData.json","TessellationFactor":2,"NextGridObjectID":2,"Objects":{"1":{"ID":1,"ItemID":40005161,"X":0,"Y":0,"Orientation":"GridOrientation_Down"}}}
        }}}});
        let witness=serde_json::json!({"layoutId":layout,"gridDataPath":data,"factor":1,"sizeX":196,"sizeY":100});
        let input=raw.to_string();
        let draft=free_support_parent_candidate(input.as_bytes(),1,40005160,(4,6),(4,6),&witness,None,None,true,None).unwrap();
        let result:Value=serde_json::from_str(&draft.patched_json).unwrap();
        let grids=&result["World"]["GridCollection"]["Grids"];
        assert_eq!(grids["7"]["Objects"]["3"]["State"]["SubGrid"]["GridID"],20);
        assert_eq!(grids["7"]["Objects"]["3"]["X"],4);
        assert_eq!(grids["8"],raw["World"]["GridCollection"]["Grids"]["8"]);
        assert_eq!(grids["20"]["Objects"],grids["8"]["Objects"]);
        assert_eq!(result["Player"]["ListInventories"]["0"]["Inventory"]["40005161"]["Amount"],0);
        assert!(support_parent_duplicate_candidate(input.as_bytes(),1,40005160,(4,6),(4,6),&witness,None,None).is_err());
        // The same mixed writer now accepts a support root and ordinary root
        // together, without allocating new IDs or touching the child's state.
        let selectors=vec![(1,40005160,(4,6),"full".into(),Some("GridOrientation_Down".into())),(2,40005161,(5,6),"full".into(),Some("GridOrientation_Down".into()))];
        let targets=resolve_grid_transform_targets(input.as_bytes(),&selectors).unwrap();
        let edits=targets.into_iter().zip([(4,6),(5,6)]).map(|(target,expected)|ddv_save_patch::GridMixedEdit{target,expected,position:Some((expected.0+1,expected.1+1)),orientation:Some(("GridOrientation_Down".into(),"GridOrientation_Left".into()))}).collect::<Vec<_>>();
        validate_oblique_grid_edits(input.as_bytes(),&edits).unwrap();
        let mixed=ddv_save_patch::preview_existing_grid_mixed_batch(&input,&edits).unwrap();
        let mut expected=raw.clone();
        for (id,x) in [("1",5),("2",6)]{let o=&mut expected["World"]["GridCollection"]["Grids"]["7"]["Objects"][id];o["X"]=x.into();o["Y"]=7.into();o["Orientation"]="GridOrientation_Left".into();}
        assert_eq!(serde_json::from_str::<Value>(&mixed.patched_json).unwrap(),expected);
        let mut blocked=raw.clone();blocked["World"]["SpawnedObjects"]=serde_json::json!([{"GridID":8,"GridObjectID":1}]);
        assert!(resolve_grid_transform_targets(blocked.to_string().as_bytes(),&selectors).is_err());
        let mut blocked=raw.clone();blocked["World"]["SpawnedObjects"]=serde_json::json!([{"GridID":7,"GridObjectID":2}]);
        assert!(validate_oblique_grid_edits(blocked.to_string().as_bytes(),&edits).is_err());
        let mut unsafe_pose=edits.clone();unsafe_pose[0].position=Some((196,0));
        assert!(validate_oblique_grid_edits(input.as_bytes(),&unsafe_pose).is_err());
        let moved=free_support_parent_candidate(input.as_bytes(),1,40005160,(4,6),(5,6),&witness,Some(("GridOrientation_Down","GridOrientation_Left")),None,false,None).unwrap();
        let moved:Value=serde_json::from_str(&moved.patched_json).unwrap();
        assert_eq!(moved["World"]["GridCollection"]["Grids"]["7"]["Objects"]["1"]["State"],raw["World"]["GridCollection"]["Grids"]["7"]["Objects"]["1"]["State"]);
        assert_eq!(moved["World"]["GridCollection"]["Grids"]["8"],raw["World"]["GridCollection"]["Grids"]["8"]);
        assert_eq!(moved["Player"],raw["Player"]);
        assert_eq!(moved["World"]["GridCollection"]["Grids"]["7"]["Objects"]["1"]["X"],5);
        let mut invalid=witness.clone();invalid["sizeX"]=197.into();
        assert!(free_support_parent_candidate(input.as_bytes(),1,40005160,(4,6),(5,6),&invalid,None,None,false,None).is_err());
        let mut linked=raw.clone();linked["World"]["SpawnedObjects"]=serde_json::json!([{"GridID":7,"GridObjectID":1}]);
        assert!(free_support_parent_candidate(linked.to_string().as_bytes(),1,40005160,(4,6),(5,6),&witness,None,None,false,None).is_err());
    }
    #[test]
    fn support_duplicate_allocates_fresh_nested_grids_and_consumes_exact_stock(){
        let save=br#"{"GameInfo":{"Version":643},"Player":{"Other":1e2,"ListInventories":{"0":{"ID":0,"CompatibleItemType":"ItemType_Furniture","CompatibleFurnitureTypes":{"List":["FurnitureItemType_Default"]},"Inventory":{"40005160":{"Amount":1},"40005161":{"Amount":1},"40005162":{"Amount":2}}}}},"World":{"GridCollection":{"NextGridID":20,"Grids":{
          "7":{"ID":7,"GridDefaultLayoutPath":"SceneLayouts/Village04/Test.json","GridDataPath":"GridData/Test.json","TessellationFactor":2,"NextGridObjectID":2,"Objects":{
            "1":{"ID":1,"ItemID":40005160,"X":4,"Y":6,"Orientation":"GridOrientation_Down","State":{"SubGrid":{"GridID":8,"DesignID":null}}}}},
          "8":{"ID":8,"GridDataPath":"GridData/Furniture/NonIP_SetLess/CornerWallShelf01-GridData.json","TessellationFactor":2,"NextGridObjectID":2,"Objects":{"1":{"ID":1,"ItemID":40005161,"X":0,"Y":0,"Orientation":"GridOrientation_Left","State":{"SubGrid":{"GridID":9}}}}},
          "9":{"ID":9,"GridDataPath":"GridData/Furniture/NonIP_SetLess/CornerWallShelf01-GridData.json","TessellationFactor":2,"NextGridObjectID":3,"Objects":{"1":{"ID":1,"ItemID":40005162,"X":0,"Y":0,"Orientation":"GridOrientation_Down"},"2":{"ID":2,"ItemID":40005162,"X":2,"Y":0,"Orientation":"GridOrientation_Down"}}}
        }}}}"#;
        let witness=serde_json::json!({"layoutId":"SceneLayouts/Village04/Test.json","gridDataPath":"GridData/Test.json","factor":2,"sizeX":20,"sizeY":20});
        let draft=support_parent_duplicate_candidate(save,1,40005160,(4,6),(10,12),&witness,Some(("GridOrientation_Down","GridOrientation_Left")),None).unwrap();
        let original:Value=serde_json::from_slice(save).unwrap();
        let result:Value=serde_json::from_str(&draft.patched_json).unwrap();
        let c=&result["World"]["GridCollection"];let g=&c["Grids"];
        assert_eq!(c["NextGridID"],22);
        assert_eq!(g["7"]["NextGridObjectID"],3);
        assert_eq!(g["7"]["Objects"]["2"]["State"]["SubGrid"]["GridID"],20);
        assert_eq!(g["7"]["Objects"]["2"]["Orientation"],"GridOrientation_Left");
        assert_eq!(g["20"]["Objects"]["1"]["State"]["SubGrid"]["GridID"],21);
        assert_eq!(g["21"]["Objects"],g["9"]["Objects"]);
        for id in ["8","9"]{assert_eq!(g[id],original["World"]["GridCollection"]["Grids"][id]);}
        assert_eq!(g["7"]["Objects"]["1"],original["World"]["GridCollection"]["Grids"]["7"]["Objects"]["1"]);
        for id in ["40005160","40005161","40005162"]{assert_eq!(result["Player"]["ListInventories"]["0"]["Inventory"][id]["Amount"],0);}
        assert!(draft.patched_json.contains("\"Other\":1e2"));
        // Restore a different portable arrangement, not just a clone.
        let original_tree=subgrid_tree(original["World"]["GridCollection"].as_object().unwrap(),"7","1").unwrap();
        let mut scene=serde_json::json!({"schema":"wand.preset.support-scene@1","gameVersion":"1.26.2","ownerItemId":40005160,"tree":original_tree});
        scene["tree"]["objects"][0]["x"]=Value::from(2);
        scene["tree"]["objects"][0]["child"]["objects"][0]["x"]=Value::from(2);
        scene["tree"]["objects"][0]["child"]["objects"][1]["x"]=Value::from(0);
        let d=support_parent_scene_candidate(save,1,40005160,(4,6),(10,12),&witness,None,None,&scene).unwrap();
        let j:Value=serde_json::from_str(&d.patched_json).unwrap();
        let collection=j["World"]["GridCollection"].as_object().unwrap();
        assert_eq!(subgrid_tree(collection,"7","2").unwrap(),scene["tree"]);
        assert_eq!(subgrid_tree(collection,"7","1").unwrap(),original_tree);
        let mut incompatible=scene.clone();
        incompatible["tree"]["objects"][0]["child"]["sourcePath"]=Value::from("GridData/Furniture/Unknown.json");
        assert!(support_parent_scene_candidate(save,1,40005160,(4,6),(10,12),&witness,None,None,&incompatible).is_err());
        let mut incompatible=scene.clone();
        incompatible["tree"]["objects"][0]["child"]["objects"][0]["itemId"]=Value::from(40009999);
        assert!(support_parent_scene_candidate(save,1,40005160,(4,6),(10,12),&witness,None,None,&incompatible).is_err());
        let mut incompatible=scene.clone();
        incompatible["tree"]["objects"][0]["child"]["objects"][0]["x"]=Value::from(999);
        assert!(support_parent_scene_candidate(save,1,40005160,(4,6),(10,12),&witness,None,None,&incompatible).is_err());
        // The same portable file works even when none of its furniture
        // has been placed in this Save. No native source IDs are supplied.
        let mut blank=original.clone();
        let grids=blank["World"]["GridCollection"]["Grids"].as_object_mut().unwrap();
        grids.remove("8");grids.remove("9");grids.get_mut("7").unwrap()["Objects"]=serde_json::json!({});
        let raw=serde_json::to_vec(&blank).unwrap();
        let placed=support_scene_place_candidate(&raw,40005160,(10,12),&witness,"GridOrientation_Left",&scene).unwrap();
        let placed:Value=serde_json::from_str(&placed.patched_json).unwrap();
        let c=placed["World"]["GridCollection"].as_object().unwrap();
        assert_eq!(c["NextGridID"],22);
        assert_eq!(subgrid_tree(c,"7","2").unwrap(),scene["tree"]);
        assert_eq!(c["Grids"]["20"]["NextGridObjectID"],2);
        assert_eq!(c["Grids"]["21"]["NextGridObjectID"],3);
        assert!(c["Grids"].get("8").is_none());
        assert_eq!(placed["Player"]["ListInventories"]["0"]["Inventory"]["40005162"]["Amount"],0);
        let mut conflict=blank.clone();conflict["World"]["FutureGridID"]=Value::from(20);
        assert!(support_scene_place_candidate(&serde_json::to_vec(&conflict).unwrap(),40005160,(10,12),&witness,"GridOrientation_Left",&scene).is_err());
        let mut no_stock=blank.clone();no_stock["Player"]["ListInventories"]["0"]["Inventory"]["40005160"]["Amount"]=Value::from(0);
        assert!(support_scene_place_candidate(&serde_json::to_vec(&no_stock).unwrap(),40005160,(10,12),&witness,"GridOrientation_Left",&scene).is_err());
        // Two identical support roots with different orientations and a
        // plain root share a single stock and allocation transaction.
        let mut mixed=blank.clone();
        for (id,n) in [("40005160",2),("40005161",2),("40005162",5)]{
            mixed["Player"]["ListInventories"]["0"]["Inventory"][id]["Amount"]=Value::from(n);
        }
        let raw_mixed=serde_json::to_vec(&mixed).unwrap();
        let mut rows=serde_json::json!([
            {"itemId":"40005160","x":2,"y":2,"orientation":"GridOrientation_Down","destination":witness,"scene":scene},
            {"itemId":"40005162","x":6,"y":6,"orientation":"GridOrientation_Down","destination":witness},
            {"itemId":"40005160","x":10,"y":12,"orientation":"GridOrientation_Left","destination":witness,"scene":scene}
        ]);
        let result=group_paste_candidate(&raw_mixed,&rows.to_string()).unwrap();
        let result:Value=serde_json::from_str(&result).unwrap();
        let c=result["World"]["GridCollection"].as_object().unwrap();
        assert_eq!(c["NextGridID"],24);
        assert_eq!(subgrid_tree(c,"7","2").unwrap(),scene["tree"]);
        assert_eq!(subgrid_tree(c,"7","4").unwrap(),scene["tree"]);
        assert_eq!(c["Grids"]["7"]["Objects"]["3"]["ItemID"],40005162);
        assert_eq!(c["Grids"]["7"]["NextGridObjectID"],5);
        for id in ["40005160","40005161","40005162"]{assert_eq!(result["Player"]["ListInventories"]["0"]["Inventory"][id]["Amount"],0);}
        assert_eq!(c["Grids"]["7"]["Objects"]["2"]["State"]["SubGrid"]["GridID"],20);
        assert_eq!(c["Grids"]["7"]["Objects"]["4"]["State"]["SubGrid"]["GridID"],22);
        // Exceed the old aggregate 32-object limit without increasing
        // either native tree's independent safety bound.
        let mut expanded=mixed.clone();
        expanded["Player"]["ListInventories"]["0"]["Inventory"]["40005162"]["Amount"]=Value::from(36);
        let mut large_rows=rows.as_array().unwrap().clone();
        for i in 0..31{
            large_rows.push(serde_json::json!({"itemId":"40005162","x":i,"y":25,"orientation":"GridOrientation_Down","destination":witness}));
        }
        let large_result=group_paste_candidate(&serde_json::to_vec(&expanded).unwrap(),&serde_json::to_string(&large_rows).unwrap()).unwrap();
        let large_result:Value=serde_json::from_str(&large_result).unwrap();
        assert_eq!(large_result["World"]["GridCollection"]["Grids"]["7"]["Objects"].as_object().unwrap().len(),34);
        assert_eq!(large_result["Player"]["ListInventories"]["0"]["Inventory"]["40005162"]["Amount"],0);
        // Existing roads may share the furniture's anchor without consuming stock.
        let mut paved=blank.clone();
        paved["World"]["GridCollection"]["Grids"]["7"]["Objects"]["1"]=serde_json::json!({"ID":1,"ItemID":40100068,"X":12,"Y":12,"Orientation":"GridOrientation_Down","State":null});
        let on_road=support_scene_place_candidate(&serde_json::to_vec(&paved).unwrap(),40005160,(12,12),&witness,"GridOrientation_Down",&scene).unwrap();
        let on_road:Value=serde_json::from_str(&on_road.patched_json).unwrap();
        assert_eq!(on_road["World"]["GridCollection"]["Grids"]["7"]["Objects"]["1"]["ItemID"],40100068);
        assert_eq!(on_road["World"]["GridCollection"]["Grids"]["7"]["Objects"]["2"]["ItemID"],40005160);
        // Failure after staging the first roots must return no candidate.
        assert!(group_paste_candidate(&raw,&rows.to_string()).is_err());
        rows[2]["x"]=Value::from(2);rows[2]["y"]=Value::from(2);
        assert!(group_paste_candidate(&raw_mixed,&rows.to_string()).is_err());
        let run=|v:&Value|support_parent_duplicate_candidate(&serde_json::to_vec(v).unwrap(),1,40005160,(4,6),(10,12),&witness,None,None);
        let mut bad=original.clone();bad["World"]["GridCollection"]["NextGridID"]=Value::from(9);assert!(run(&bad).is_err());
        let mut bad=original.clone();bad["World"]["FutureGridID"]=Value::from(21);assert!(run(&bad).is_err());
        let mut bad=original.clone();bad["Player"]["ListInventories"]["0"]["Inventory"]["40005162"]["Amount"]=Value::from(1);assert!(run(&bad).is_err());
        let mut bad=original.clone();bad["World"]["GridCollection"]["Grids"]["9"]["Objects"]["1"]["Unknown"]=Value::from(1);assert!(run(&bad).is_err());
        let mut bad=original.clone();bad["World"]["GridCollection"]["Grids"]["8"]["Objects"]["1"]["State"]["SubGrid"]["DesignID"]=Value::from(1);assert!(run(&bad).is_err());
    }
    #[test]
    fn support_tree_and_parent_translation_preserve_descendants_and_block_aliases(){
        let save=br#"{"GameInfo":{"Version":643},"Player":{"Other":1e2},"World":{"GridCollection":{"Grids":{
          "7":{"ID":7,"GridDefaultLayoutPath":"SceneLayouts/Village04/Test.json","GridDataPath":"GridData/Test.json","TessellationFactor":2,"NextGridObjectID":2,"Objects":{
            "1":{"ID":1,"ItemID":40005160,"X":4,"Y":6,"Orientation":"GridOrientation_Down","State":{"SubGrid":{"GridID":8}}}}},
          "8":{"ID":8,"TessellationFactor":1,"Objects":{"1":{"ID":1,"ItemID":40005161,"X":1,"Y":2,"Orientation":"GridOrientation_Left","State":{"SubGrid":{"GridID":9}}}}},
          "9":{"ID":9,"Objects":{"1":{"ID":1,"ItemID":40005162,"X":0,"Y":1,"Orientation":"GridOrientation_Down","Unknown":1e2}}}
        }}}}"#;
        let witness=serde_json::json!({"layoutId":"SceneLayouts/Village04/Test.json","gridDataPath":"GridData/Test.json","factor":2,"sizeX":20,"sizeY":20});
        let view:Value=serde_json::from_str(&inspect_subgrid_json(save,1,40005160,(4,6)).unwrap()).unwrap();
        assert_eq!(view["tree"]["objects"][0]["child"]["objects"][0]["itemId"],40005162);
        assert_eq!(view["tree"]["objects"][0]["orientation"],"GridOrientation_Left");
        assert!(!view.to_string().contains("GridID"));assert!(!view.to_string().contains("Unknown"));
        let draft=support_parent_move_candidate(save,1,40005160,(4,6),(10,12),&witness,None,None).unwrap();
        let mut expected:Value=serde_json::from_slice(save).unwrap();expected["World"]["GridCollection"]["Grids"]["7"]["Objects"]["1"]["X"]=Value::from(10);expected["World"]["GridCollection"]["Grids"]["7"]["Objects"]["1"]["Y"]=Value::from(12);
        assert_eq!(serde_json::from_str::<Value>(&draft.patched_json).unwrap(),expected);
        assert!(draft.patched_json.contains("\"Unknown\":1e2"));assert!(draft.patched_json.contains("\"Other\":1e2"));
        assert!(support_parent_move_candidate(save,1,40005160,(4,6),(40,12),&witness,None,None).is_err());
        let rotation=support_parent_move_candidate(save,1,40005160,(4,6),(4,6),&witness,Some(("GridOrientation_Down","GridOrientation_Left")),None).unwrap();
        let mut rotated:Value=serde_json::from_slice(save).unwrap();
        rotated["World"]["GridCollection"]["Grids"]["7"]["Objects"]["1"]["Orientation"]=Value::from("GridOrientation_Left");
        assert_eq!(serde_json::from_str::<Value>(&rotation.patched_json).unwrap(),rotated);
        assert!(rotation.patched_json.contains("\"Unknown\":1e2"));
        assert!(support_parent_move_candidate(save,1,40005160,(4,6),(4,6),&witness,Some(("GridOrientation_Up","GridOrientation_Left")),None).is_err());
        let mut cross:Value=serde_json::from_slice(save).unwrap();
        cross["World"]["GridCollection"]["Grids"]["10"]=serde_json::json!({"ID":10,"GridDefaultLayoutPath":"SceneLayouts/Village04/Other.json","GridDataPath":"GridData/Other.json","TessellationFactor":2,"NextGridObjectID":3,"Objects":{}});
        let dest=serde_json::json!({"layoutId":"SceneLayouts/Village04/Other.json","gridDataPath":"GridData/Other.json","factor":2,"sizeX":20,"sizeY":20});
        let bytes=serde_json::to_vec(&cross).unwrap();
        let d=support_parent_move_candidate(&bytes,1,40005160,(4,6),(4,6),&dest,None,Some(&witness)).unwrap();
        let mut moved=cross.clone();let mut parent=moved["World"]["GridCollection"]["Grids"]["7"]["Objects"].as_object_mut().unwrap().remove("1").unwrap();
        parent["ID"]=Value::from(3);moved["World"]["GridCollection"]["Grids"]["10"]["Objects"]["3"]=parent;
        moved["World"]["GridCollection"]["Grids"]["10"]["NextGridObjectID"]=Value::from(4);
        assert_eq!(serde_json::from_str::<Value>(&d.patched_json).unwrap(),moved);
        assert!(support_parent_move_candidate(&bytes,1,40005160,(4,6),(4,6),&dest,None,None).is_err());
        // A mixed support/ordinary group retains the full nested hierarchy,
        // including unknown descendant bytes, and rejects unmarked parents.
        let mut group:Value=serde_json::from_slice(save).unwrap();
        group["World"]["GridCollection"]["Grids"]["7"]["Objects"]["2"]=serde_json::json!({"ID":2,"ItemID":40000001,"X":12,"Y":6,"Orientation":"GridOrientation_Down"});
        group["World"]["GridCollection"]["Grids"]["7"]["NextGridObjectID"]=Value::from(3);
        let raw=serde_json::to_vec(&group).unwrap();
        let mut plan=serde_json::json!([
         {"localOrdinal":1,"itemId":"40005160","expectedX":4,"expectedY":6,"expectedOrientation":"GridOrientation_Down","destination":witness.clone(),"x":8,"y":10,"orientation":"GridOrientation_Left","supportFactor":2},
         {"localOrdinal":2,"itemId":"40000001","expectedX":12,"expectedY":6,"expectedOrientation":"GridOrientation_Down","destination":witness.clone(),"x":16,"y":10,"orientation":"GridOrientation_Down"}
        ]);
        let result:Value=serde_json::from_str(&group_cut_candidate(&raw,&plan.to_string()).unwrap()).unwrap();
        let grids=&result["World"]["GridCollection"]["Grids"];
        assert_eq!(grids["7"]["Objects"]["1"]["State"],group["World"]["GridCollection"]["Grids"]["7"]["Objects"]["1"]["State"]);
        assert_eq!(grids["7"]["Objects"]["1"]["Orientation"],"GridOrientation_Left");
        assert_eq!(grids["7"]["Objects"]["2"]["X"],16);
        assert_eq!(grids["8"],group["World"]["GridCollection"]["Grids"]["8"]);
        assert_eq!(grids["9"],group["World"]["GridCollection"]["Grids"]["9"]);
        group["World"]["GridCollection"]["Grids"]["10"]=cross["World"]["GridCollection"]["Grids"]["10"].clone();
        let raw=serde_json::to_vec(&group).unwrap();
        plan[0]["destination"]=dest.clone();plan[1]["destination"]=dest.clone();
        // Plain cross-grid transfer requires outdoor scope paths, so leave
        // the ordinary record on its original Grid in this synthetic fixture.
        plan[1]["destination"]=witness.clone();
        let result:Value=serde_json::from_str(&group_cut_candidate(&raw,&plan.to_string()).unwrap()).unwrap();
        assert_eq!(result["World"]["GridCollection"]["Grids"]["10"]["Objects"]["3"]["State"],group["World"]["GridCollection"]["Grids"]["7"]["Objects"]["1"]["State"]);
        assert_eq!(result["World"]["GridCollection"]["Grids"]["8"],group["World"]["GridCollection"]["Grids"]["8"]);
        assert_eq!(result["World"]["GridCollection"]["Grids"]["9"],group["World"]["GridCollection"]["Grids"]["9"]);
        plan[0]["supportFactor"]=Value::from(1);assert!(group_cut_candidate(&raw,&plan.to_string()).is_err());
        plan[0].as_object_mut().unwrap().remove("supportFactor");assert!(group_cut_candidate(&raw,&plan.to_string()).is_err());
        let mut alias:Value=serde_json::from_slice(save).unwrap();
        let mut duplicate=alias["World"]["GridCollection"]["Grids"]["7"]["Objects"]["1"].clone();duplicate["ID"]=Value::from(2);alias["World"]["GridCollection"]["Grids"]["7"]["Objects"]["2"]=duplicate;
        alias["World"]["GridCollection"]["Grids"]["7"]["NextGridObjectID"]=Value::from(3);
        assert!(inspect_subgrid_json(&serde_json::to_vec(&alias).unwrap(),1,40005160,(4,6)).is_err());
        let mut cycle:Value=serde_json::from_slice(save).unwrap();cycle["World"]["GridCollection"]["Grids"]["9"]["Objects"]["1"]["State"]=serde_json::json!({"SubGrid":{"GridID":7}});
        assert!(inspect_subgrid_json(&serde_json::to_vec(&cycle).unwrap(),1,40005160,(4,6)).is_err());
    }
    #[test]
    fn building_mixed_transform_preserves_identity_and_rejects_linked_or_unknown_state(){
        let source=serde_json::json!({"GameInfo":{"Version":643},"World":{"GridCollection":{"Grids":{"10":{"ID":10,"Objects":{"2":{"ID":2,"ItemID":20000001,"X":4,"Y":5,"Orientation":"GridOrientation_Down","State":null}}}}}}});
        let check=|v:&Value,item:u64|resolve_grid_mixed_targets(&serde_json::to_vec(v).unwrap(),&[(1,item,(4,5),"full".into(),Some("GridOrientation_Down".into()))]);
        let targets=check(&source,20000001).unwrap();
        let raw=source.to_string();
        let draft=ddv_save_patch::preview_existing_grid_mixed_batch(&raw,&[ddv_save_patch::GridMixedEdit{target:targets[0].clone(),expected:(4,5),position:Some((6,7)),orientation:Some(("GridOrientation_Down".into(),"GridOrientation_Left".into()))}]).unwrap();
        let mut expected=source.clone();
        let obj=&mut expected["World"]["GridCollection"]["Grids"]["10"]["Objects"]["2"];
        obj["X"]=6.into();obj["Y"]=7.into();obj["Orientation"]="GridOrientation_Left".into();
        assert_eq!(serde_json::from_str::<Value>(&draft.patched_json).unwrap(),expected);
        let mut linked=source.clone();linked["World"]["LastUsedLinkedEnvironmentEnter"]=serde_json::json!({"GridID":10,"GridObjectID":2});
        assert!(check(&linked,20000001).is_err());
        let mut state=source.clone();state["World"]["GridCollection"]["Grids"]["10"]["Objects"]["2"]["State"]=serde_json::json!({"Unknown":true});
        assert!(check(&state,20000001).is_err());
        let mut offgrid=source.clone();offgrid["World"]["GridCollection"]["Grids"]["10"]["Objects"]["2"]["ItemID"]=20400001.into();
        assert!(check(&offgrid,20400001).is_err());
    }
    #[test]
    fn free_outdoor_cut_crosses_native_grids_and_keeps_same_grid_ids(){
        let catalog:Value=serde_json::from_str(include_str!("../../../static/ddv/world/steam-1.26.2/index.json")).unwrap();
        let mut entries=catalog["entries"].as_array().unwrap().iter().filter(|e|e["scope"]=="Village04").flat_map(|e|e["grids"].as_array().unwrap()).filter(|g|g["factor"]==1&&g["sizeX"].as_u64().unwrap_or(0)>5&&g["sizeY"].as_u64().unwrap_or(0)>5);
        let a=entries.next().unwrap();let b=entries.find(|g|g["gridDataPath"]!=a["gridDataPath"]).unwrap();
        let witness=|g:&Value|serde_json::json!({"layoutId":g["layoutId"],"gridDataPath":g["gridDataPath"],"factor":g["factor"],"sizeX":g["sizeX"],"sizeY":g["sizeY"]});
        let grid=|id:u64,g:&Value,objects:Value|serde_json::json!({"ID":id,"GridDefaultLayoutPath":g["layoutId"],"GridDataPath":g["gridDataPath"],"TessellationFactor":1,"NextGridObjectID":5,"Objects":objects});
        let source=serde_json::json!({"GameInfo":{"Version":643},"Player":{"Marker":123},"World":{"GridCollection":{"Grids":{"10":grid(10,a,serde_json::json!({"1":{"ID":1,"ItemID":40000001,"X":2,"Y":2,"Orientation":"GridOrientation_DownLeft"},"2":{"ID":2,"ItemID":40000001,"X":2,"Y":2,"Orientation":"GridOrientation_Down"}})),"20":grid(20,b,serde_json::json!({"1":{"ID":1,"ItemID":40000002,"X":4,"Y":4,"Orientation":"GridOrientation_Down"}}))}}}});
        let raw=serde_json::to_vec(&source).unwrap();
        let (scan,_)=scan_grid_instances(&raw).unwrap();
        let ord=|id:&str|scan.private_targets.iter().position(|(t,_)|t.grid_id=="10"&&t.object_id==id).unwrap()+1;
        let mut plan=serde_json::json!({"freePlacement":true,"rows":[{"localOrdinal":ord("1"),"itemId":"40000001","expectedX":2,"expectedY":2,"expectedOrientation":"GridOrientation_DownLeft","destination":witness(b),"x":4,"y":4,"orientation":"GridOrientation_DownLeft"},{"localOrdinal":ord("2"),"itemId":"40000001","expectedX":2,"expectedY":2,"expectedOrientation":"GridOrientation_Down","destination":witness(a),"x":3,"y":3,"orientation":"GridOrientation_Left"}]});
        let result:Value=serde_json::from_str(&group_cut_candidate(&raw,&plan.to_string()).unwrap()).unwrap();
        assert_eq!(result["Player"],source["Player"]);let g=&result["World"]["GridCollection"]["Grids"];
        assert!(g["10"]["Objects"].get("1").is_none());assert_eq!(g["10"]["Objects"]["2"]["X"],3);assert_eq!(g["10"]["NextGridObjectID"],5);
        assert_eq!(g["20"]["Objects"]["1"],source["World"]["GridCollection"]["Grids"]["20"]["Objects"]["1"]);assert_eq!(g["20"]["Objects"]["5"]["Orientation"],"GridOrientation_DownLeft");
        plan["rows"][0]["destination"]["sizeX"]=Value::from(b["sizeX"].as_u64().unwrap()+1);assert!(group_cut_candidate(&raw,&plan.to_string()).is_err());
    }
    #[test]
    fn storage_duplicate_outdoor_uses_independent_container_and_existing_stock(){
        let raw=br#"{"GameInfo":{"Version":643},"Player":{"NextContainerInventoryID":10,"ListInventories":{"0":{"ID":0,"CompatibleItemType":"ItemType_Furniture","CompatibleFurnitureTypes":{"List":["FurnitureItemType_Default"]},"Inventory":{"40001680":{"Amount":2}}}},"ContainerInventories":{"9":{"ID":9,"ParentItemID":40001680,"Size":48,"BelongsToPlayer":true,"Inventory":[{"ItemID":30000001,"Amount":17,"State":null}],"BlockMoveTo":false,"ExtraSize":0}}},"World":{"GridCollection":{"Grids":{"10":{"ID":10,"GridDefaultLayoutPath":"SceneLayouts/Village04/DefaultVillageLayout01-BeachGrids.json","GridDataPath":"GridData/Villages/Village04-BeachLevel-GridData.json","TessellationFactor":1,"NextGridObjectID":3,"Objects":{"1":{"ID":1,"ItemID":40001680,"X":2,"Y":2,"Orientation":"GridOrientation_Down","State":{"Storage":{"ContainerInventoryID":9,"DefaultContainerInventoryData":"Chest_48Slot","UnlockKeyItemID":0,"UnlockLocId":"","DesignID":null}}}}}}}},"Marker":1e2}"#;
        let old:Value=serde_json::from_slice(raw).unwrap();
        let (_,layout,factor,sx,sy)=outdoor_identity(&old,"10").unwrap();
        let mut plan=serde_json::json!({"storageDuplicate":{"localOrdinal":1,"itemId":"40001680","expectedX":2,"expectedY":2,"expectedOrientation":"GridOrientation_Down","destination":{"layoutId":layout,"gridDataPath":"GridData/Villages/Village04-BeachLevel-GridData.json","factor":factor,"sizeX":sx,"sizeY":sy},"x":4,"y":5,"orientation":"GridOrientation_Left","copyContents":true,"freePlacement":true}});
        let mut stateful=old.clone();
        let contents=serde_json::json!([{"ItemID":30300001,"Amount":2,"State":{"MealData":{"IngredientsUsed":[30200001],"SceneRestriction":null}}},{"ItemID":31500001,"Amount":1,"State":{"ConsummableData":{"ItemID":70100001,"Amount":1,"State":null}}}]);
        stateful["Player"]["ContainerInventories"]["9"]["Inventory"]=contents.clone();
        let candidate=group_paste_candidate(&serde_json::to_vec(&stateful).unwrap(),&plan.to_string()).unwrap();
        let copied:Value=serde_json::from_str(&candidate).unwrap();
        assert_eq!(copied["Player"]["ContainerInventories"]["10"]["Inventory"],contents);
        assert_eq!(copied["Player"]["ContainerInventories"]["9"],stateful["Player"]["ContainerInventories"]["9"]);
        stateful["Player"]["ContainerInventories"]["9"]["Inventory"][1]["State"]["ConsummableData"]["State"]=serde_json::json!({"Unknown":1});
        assert!(group_paste_candidate(&serde_json::to_vec(&stateful).unwrap(),&plan.to_string()).is_err());
        let result=group_paste_candidate(raw,&plan.to_string()).unwrap();let v:Value=serde_json::from_str(&result).unwrap();
        assert_eq!(v["Player"]["ContainerInventories"]["9"],old["Player"]["ContainerInventories"]["9"]);
        assert_eq!(v["Player"]["ContainerInventories"]["10"]["Inventory"],old["Player"]["ContainerInventories"]["9"]["Inventory"]);
        assert_eq!(v["Player"]["NextContainerInventoryID"],11);assert_eq!(v["Player"]["ListInventories"]["0"]["Inventory"]["40001680"]["Amount"],1);
        assert_eq!(v["World"]["GridCollection"]["Grids"]["10"]["Objects"]["1"],old["World"]["GridCollection"]["Grids"]["10"]["Objects"]["1"]);
        assert_eq!(v["World"]["GridCollection"]["Grids"]["10"]["Objects"]["3"]["State"]["Storage"]["ContainerInventoryID"],10);assert!(result.contains("1e2"));
        // Two independent sources sharing the original container witness.
        // The original ordinals remain valid after insertion; stock is staged.
        let mut mixed=old.clone();mixed["World"]["GridCollection"]["Grids"]["10"]["NextGridObjectID"]=4.into();
        let mut second=mixed["World"]["GridCollection"]["Grids"]["10"]["Objects"]["1"].clone();second["ID"]=2.into();second["X"]=3.into();
        mixed["World"]["GridCollection"]["Grids"]["10"]["Objects"]["2"]=second;
        let first=plan["storageDuplicate"].clone();let mut other=first.clone();
        other["localOrdinal"]=2.into();other["expectedX"]=3.into();other["x"]=6.into();
        let batch=serde_json::json!({"storageGroup":{"rows":[first,other],"freePlacement":true}});
        let result=group_paste_candidate(&serde_json::to_vec(&mixed).unwrap(),&batch.to_string()).unwrap();let v:Value=serde_json::from_str(&result).unwrap();
        assert_eq!(v["Player"]["ContainerInventories"]["10"]["Inventory"],old["Player"]["ContainerInventories"]["9"]["Inventory"]);
        assert_eq!(v["Player"]["ContainerInventories"]["11"]["Inventory"],old["Player"]["ContainerInventories"]["9"]["Inventory"]);
        assert_eq!(v["Player"]["NextContainerInventoryID"],12);assert_eq!(v["Player"]["ListInventories"]["0"]["Inventory"]["40001680"]["Amount"],0);
        let mut invalid=batch.clone();invalid["storageGroup"]["rows"][1]["expectedX"]=99.into();
        assert!(group_paste_candidate(&serde_json::to_vec(&mixed).unwrap(),&invalid.to_string()).is_err());
        plan["storageDuplicate"]["copyContents"]=Value::Bool(false);
        let v:Value=serde_json::from_str(&group_paste_candidate(raw,&plan.to_string()).unwrap()).unwrap();assert_eq!(v["Player"]["ContainerInventories"]["10"]["Inventory"],serde_json::json!([]));
        plan["storageDuplicate"]["destination"]["sizeX"]=Value::from(sx+1);assert!(group_paste_candidate(raw,&plan.to_string()).is_err());
        let pickup=serde_json::json!({"storagePickup":{"localOrdinal":1,"itemId":"40001680","expectedX":2,"expectedY":2,"expectedOrientation":"GridOrientation_Down"}});
        assert!(group_paste_candidate(raw,&pickup.to_string()).is_err());
        let mut empty=old.clone();empty["Player"]["ContainerInventories"]["9"]["Inventory"]=serde_json::json!([]);
        let result=group_paste_candidate(&serde_json::to_vec(&empty).unwrap(),&pickup.to_string()).unwrap();let v:Value=serde_json::from_str(&result).unwrap();
        assert!(v["Player"]["ContainerInventories"].as_object().unwrap().is_empty());assert_eq!(v["Player"]["ListInventories"]["0"]["Inventory"]["40001680"]["Amount"],3);

    }
    #[test]
    fn group_pickup_mixes_empty_storage_and_ordinary_furniture(){
        let raw=br#"{"GameInfo":{"Version":643},"Player":{"NextContainerInventoryID":10,"ListInventories":{"0":{"ID":0,"CompatibleItemType":"ItemType_Furniture","CompatibleFurnitureTypes":{"List":["FurnitureItemType_Default"]},"Inventory":{"40001680":{"Amount":2},"40000001":{"Amount":1}}}},"ContainerInventories":{"9":{"ID":9,"ParentItemID":40001680,"Size":48,"BelongsToPlayer":true,"Inventory":[],"BlockMoveTo":false,"ExtraSize":0}}},"World":{"GridCollection":{"Grids":{"10":{"ID":10,"GridDefaultLayoutPath":"SceneLayouts/Village04/DefaultVillageLayout01-BeachGrids.json","GridDataPath":"GridData/Villages/Village04-BeachLevel-GridData.json","TessellationFactor":1,"NextGridObjectID":3,"Objects":{"1":{"ID":1,"ItemID":40001680,"X":2,"Y":2,"Orientation":"GridOrientation_Down","State":{"Storage":{"ContainerInventoryID":9,"DefaultContainerInventoryData":"Chest_48Slot","UnlockKeyItemID":0,"UnlockLocId":"","DesignID":null}}},"2":{"ID":2,"ItemID":40000001,"X":4,"Y":4,"Orientation":"GridOrientation_Down"}}}}}},"Marker":1e2}"#;
        let (scan,_)=scan_grid_instances(raw).unwrap();
        let ord=|id:&str|scan.private_targets.iter().position(|(t,_)|t.grid_id=="10"&&t.object_id==id).unwrap()+1;
        let rows=serde_json::json!([{"localOrdinal":ord("1"),"itemId":"40001680","expectedX":2,"expectedY":2,"expectedOrientation":"GridOrientation_Down","includeStorage":true},{"localOrdinal":ord("2"),"itemId":"40000001","expectedX":4,"expectedY":4,"expectedOrientation":"GridOrientation_Down"}]);
        for limit in [ddv_save_patch::MAX_GRID_MIXED_EDITS,MAX_AREA_FURNITURE_CHANGES]{
            let result=group_pickup_bounded(raw,&rows.to_string(),2,None,limit).unwrap();
            let v:Value=serde_json::from_str(&result).unwrap();
            assert!(v["Player"]["ContainerInventories"].as_object().unwrap().is_empty());
            assert!(v["World"]["GridCollection"]["Grids"]["10"]["Objects"].as_object().unwrap().is_empty());
            assert_eq!(v["Player"]["NextContainerInventoryID"],10);
            assert_eq!(v["Player"]["ListInventories"]["0"]["Inventory"]["40001680"]["Amount"],3);
            assert_eq!(v["Player"]["ListInventories"]["0"]["Inventory"]["40000001"]["Amount"],2);
            assert!(result.contains("1e2"));
        }
        let mut noncanonical:Value=serde_json::from_slice(raw).unwrap();
        noncanonical["Player"]["ContainerInventories"]["9"]["ExtraSize"]=2.into();
        assert!(group_pickup_bounded(&serde_json::to_vec(&noncanonical).unwrap(),&rows.to_string(),2,None,MAX_AREA_FURNITURE_CHANGES).is_err());
        let mut full:Value=serde_json::from_slice(raw).unwrap();
        full["Player"]["ContainerInventories"]["9"]["Inventory"]=serde_json::json!([{"ItemID":30000001,"Amount":1,"State":null}]);
        assert!(group_pickup_bounded(&serde_json::to_vec(&full).unwrap(),&rows.to_string(),2,None,ddv_save_patch::MAX_GRID_MIXED_EDITS).is_err());
        let mut wrong=rows.clone();wrong[0].as_object_mut().unwrap().remove("includeStorage");
        assert!(group_pickup_bounded(raw,&wrong.to_string(),2,None,ddv_save_patch::MAX_GRID_MIXED_EDITS).is_err());
        let mut wrong=rows.clone();wrong[1]["includeStorage"]=true.into();
        assert!(group_pickup_bounded(raw,&wrong.to_string(),2,None,ddv_save_patch::MAX_GRID_MIXED_EDITS).is_err());
    }
    #[test]
    fn storage_cut_roundtrip_native_world_and_room_preserves_inventory(){
        let raw=br#"{"GameInfo":{"Version":643},"Player":{"ContainerInventories":{"9":{"ID":9,"ParentItemID":40001680,"Size":48,"BelongsToPlayer":true,"Inventory":[{"ItemID":30000001,"Amount":17,"State":null}],"Unknown":1e2}}},"World":{"PlayerHouses":[{"Floors":[{"Rooms":{"0":{"FloorGridID":43}}}]}],"GridCollection":{"Grids":{"10":{"ID":10,"GridDefaultLayoutPath":"SceneLayouts/Village04/DefaultVillageLayout01-BeachGrids.json","GridDataPath":"GridData/Villages/Village04-BeachLevel-GridData.json","TessellationFactor":1,"NextGridObjectID":3,"Objects":{"1":{"ID":1,"ItemID":40001680,"X":2,"Y":2,"Orientation":"GridOrientation_Down","State":{"Storage":{"ContainerInventoryID":9,"DefaultContainerInventoryData":"Chest_48Slot","UnlockKeyItemID":0,"UnlockLocId":"","DesignID":null}}},"2":{"ID":2,"ItemID":40000001,"X":2,"Y":2,"Orientation":"GridOrientation_Down"}}},"43":{"ID":43,"GridDataPath":"GridData/Rooms/Room8x8-GridData.json","TessellationFactor":1,"NextGridObjectID":5,"Objects":{}}}}}}"#;
        let source:Value=serde_json::from_slice(raw).unwrap();
        let (scan,_)=scan_grid_instances(raw).unwrap();
        let ord=scan.private_targets.iter().position(|(t,_)|t.grid_id=="10"&&t.object_id=="1").unwrap()+1;
        let (_,layout,factor,sx,sy)=outdoor_identity(&source,"10").unwrap();
        let dest=serde_json::json!({"layoutId":layout,"gridDataPath":"GridData/Villages/Village04-BeachLevel-GridData.json","factor":factor,"sizeX":sx,"sizeY":sy});
        let mut world_plan=serde_json::json!({"freePlacement":true,"rows":[{"localOrdinal":ord,"itemId":"40001680","expectedX":2,"expectedY":2,"expectedOrientation":"GridOrientation_Down","destination":dest.clone(),"x":4,"y":5,"orientation":"GridOrientation_Left","storage":true}]});
        let moved=group_cut_candidate(raw,&world_plan.to_string()).unwrap();
        let moved_value:Value=serde_json::from_str(&moved).unwrap();
        assert_eq!(moved_value["Player"],source["Player"]);assert_eq!(moved_value["World"]["GridCollection"]["Grids"]["10"]["Objects"]["1"]["State"],source["World"]["GridCollection"]["Grids"]["10"]["Objects"]["1"]["State"]);
        world_plan["rows"][0]["orientation"]=Value::from("GridOrientation_DownLeft");assert!(group_cut_candidate(raw,&world_plan.to_string()).is_err());
        let plan=serde_json::json!({"roomOrdinal":1,"surfaceOrdinal":1,"freePlacement":true,"transfer":[{"localOrdinal":ord,"itemId":40001680,"expectedX":2,"expectedY":2,"expectedOrientation":"GridOrientation_Down","x":3,"y":3,"orientation":"GridOrientation_Left","storage":true}]});
        let draft=crate::indoor_room_view::furniture_candidate(raw,&plan.to_string()).unwrap();let after:Value=serde_json::from_str(&draft.patched_json).unwrap();
        assert_eq!(after["Player"],source["Player"]);assert_eq!(after["World"]["GridCollection"]["Grids"]["43"]["Objects"]["5"]["State"],source["World"]["GridCollection"]["Grids"]["10"]["Objects"]["1"]["State"]);assert!(after["World"]["GridCollection"]["Grids"]["10"]["Objects"].get("1").is_none());assert!(draft.patched_json.contains("1e2"));
        let back=serde_json::json!({"freePlacement":true,"rows":[{"roomSource":{"roomOrdinal":1,"index":0},"itemId":"40001680","expectedX":3,"expectedY":3,"expectedOrientation":"GridOrientation_Left","destination":dest,"x":2,"y":2,"orientation":"GridOrientation_Down","storage":true}]});
        let result=group_cut_candidate(draft.patched_json.as_bytes(),&back.to_string()).unwrap();let v:Value=serde_json::from_str(&result).unwrap();assert_eq!(v["Player"],source["Player"]);assert_eq!(v["World"]["GridCollection"]["Grids"]["10"]["Objects"]["3"]["State"],source["World"]["GridCollection"]["Grids"]["10"]["Objects"]["1"]["State"]);assert!(result.contains("1e2"));
    }
    #[test]
    fn support_leaf_crosses_native_outdoor_ground_and_another_support_without_stock(){
        let mut save:Value=serde_json::from_str(r#"{"GameInfo":{"Version":643},"Player":{"Marker":100},"World":{"GridCollection":{"Grids":{"10":{"ID":10,"GridDefaultLayoutPath":"SceneLayouts/Village04/DefaultVillageLayout01-BeachGrids.json","GridDataPath":"GridData/Villages/Village04-BeachLevel-GridData.json","TessellationFactor":1,"NextGridObjectID":4,"Objects":{"1":{"ID":1,"ItemID":40005160,"X":4,"Y":5,"Orientation":"GridOrientation_Down","State":{"SubGrid":{"GridID":11}}},"2":{"ID":2,"ItemID":40005160,"X":8,"Y":5,"Orientation":"GridOrientation_Down","State":{"SubGrid":{"GridID":12}}},"3":{"ID":3,"ItemID":40005162,"X":4,"Y":5,"Orientation":"GridOrientation_Down"}}},"11":{"ID":11,"GridDataPath":"GridData/Furniture/NonIP_SetLess/CornerWallShelf01-GridData.json","TessellationFactor":2,"NextGridObjectID":2,"Objects":{"1":{"ID":1,"ItemID":40005162,"X":0,"Y":0,"Orientation":"GridOrientation_Down"}}},"12":{"ID":12,"GridDataPath":"GridData/Furniture/NonIP_SetLess/CornerWallShelf01-GridData.json","TessellationFactor":2,"NextGridObjectID":1,"Objects":{}}}}}}"#).unwrap();
        let raw=serde_json::to_vec(&save).unwrap();
        let parents=room_support_ordinals(&raw).unwrap();
        let from=parents[&("10".to_owned(),"1".to_owned())];
        let to=parents[&("10".to_owned(),"2".to_owned())];
        let (_,layout,factor,sx,sy)=house_exterior_identity(&save,"10").unwrap();
        let witness=serde_json::json!({"parentItemId":40005160,"parentX":4,"parentY":5,"path":[],"index":0});
        let row=serde_json::json!({"localOrdinal":from,"supportSource":witness,"itemId":"40005162","expectedX":0,"expectedY":0,"expectedOrientation":"GridOrientation_Down","destination":{"layoutId":layout,"gridDataPath":"GridData/Villages/Village04-BeachLevel-GridData.json","factor":factor,"sizeX":sx,"sizeY":sy},"x":4,"y":5,"orientation":"GridOrientation_Left"});
        let plan=serde_json::json!({"freePlacement":true,"rows":[row]});
        let result=group_cut_candidate(&raw,&plan.to_string()).unwrap();let after:Value=serde_json::from_str(&result).unwrap();
        assert_eq!(after["Player"],save["Player"]);
        assert_eq!(after["World"]["GridCollection"]["Grids"]["11"]["Objects"],serde_json::json!({}));
        assert_eq!(after["World"]["GridCollection"]["Grids"]["10"]["Objects"]["4"]["ItemID"],40005162);
        let mut paste=serde_json::json!({"localOrdinal":to,"itemId":40005160,"expectedX":8,"expectedY":5,"path":[],"freePlacement":true,"terrainPath":"GridData/Furniture/NonIP_SetLess/CornerWallShelf01-GridData.json","floorTransfer":{"localOrdinal":from,"supportSource":witness,"itemId":40005162,"expectedX":0,"expectedY":0,"expectedOrientation":"GridOrientation_Down","x":2,"y":2,"orientation":"GridOrientation_Left"}});
        let d=support_child_candidate(&raw,&paste).unwrap();let moved:Value=serde_json::from_str(&d.patched_json).unwrap();
        assert_eq!(moved["Player"],save["Player"]);
        assert_eq!(moved["World"]["GridCollection"]["Grids"]["10"],save["World"]["GridCollection"]["Grids"]["10"]);
        assert_eq!(moved["World"]["GridCollection"]["Grids"]["11"]["Objects"],serde_json::json!({}));
        assert_eq!(moved["World"]["GridCollection"]["Grids"]["12"]["Objects"]["1"]["ItemID"],40005162);
        let ordinal=room_pickup_ordinals(&raw).unwrap()[&("10".to_owned(),"3".to_owned())];
        paste["floorTransfer"].as_object_mut().unwrap().remove("supportSource");
        paste["floorTransfer"]["localOrdinal"]=ordinal.into();paste["floorTransfer"]["expectedX"]=4.into();paste["floorTransfer"]["expectedY"]=5.into();
        let d=support_child_candidate(&raw,&paste).unwrap();let moved:Value=serde_json::from_str(&d.patched_json).unwrap();
        assert_eq!(moved["Player"],save["Player"]);
        assert!(moved["World"]["GridCollection"]["Grids"]["10"]["Objects"].get("3").is_none());
        // Both witnesses refer to the original support, not to the shifted
        // index after the first removal. IDs, stock and parent state survive.
        let mut grouped=save.clone();
        grouped["World"]["GridCollection"]["Grids"]["11"]["Objects"]["2"]=serde_json::json!({"ID":2,"ItemID":40005162,"X":2,"Y":0,"Orientation":"GridOrientation_Down"});
        grouped["World"]["GridCollection"]["Grids"]["11"]["NextGridObjectID"]=3.into();
        let raw_group=serde_json::to_vec(&grouped).unwrap();
        let mut outdoor=plan.clone();
        let mut second=outdoor["rows"][0].clone();
        second["supportSource"]["index"]=1.into();second["expectedX"]=2.into();second["x"]=5.into();
        outdoor["rows"].as_array_mut().unwrap().push(second);
        let result=group_cut_candidate(&raw_group,&outdoor.to_string()).unwrap();
        let after:Value=serde_json::from_str(&result).unwrap();
        assert_eq!(after["Player"],grouped["Player"]);
        assert_eq!(after["World"]["GridCollection"]["Grids"]["11"]["Objects"],serde_json::json!({}));
        assert_eq!(after["World"]["GridCollection"]["Grids"]["10"]["Objects"]["5"]["X"],5);
        let mut support=serde_json::json!({"localOrdinal":to,"itemId":40005160,"expectedX":8,"expectedY":5,"path":[],"freePlacement":true,"terrainPath":"GridData/Furniture/NonIP_SetLess/CornerWallShelf01-GridData.json","floorTransfer":[{"localOrdinal":from,"supportSource":witness,"itemId":40005162,"expectedX":0,"expectedY":0,"expectedOrientation":"GridOrientation_Down","x":0,"y":0,"orientation":"GridOrientation_Left"}]});
        let mut second=support["floorTransfer"][0].clone();second["supportSource"]["index"]=1.into();second["expectedX"]=2.into();second["x"]=2.into();
        support["floorTransfer"].as_array_mut().unwrap().push(second);
        let d=support_child_candidate(&raw_group,&support).unwrap();
        let after:Value=serde_json::from_str(&d.patched_json).unwrap();
        assert_eq!(after["Player"],grouped["Player"]);
        assert_eq!(after["World"]["GridCollection"]["Grids"]["10"],grouped["World"]["GridCollection"]["Grids"]["10"]);
        assert_eq!(after["World"]["GridCollection"]["Grids"]["11"]["Objects"],serde_json::json!({}));
        assert_eq!(after["World"]["GridCollection"]["Grids"]["12"]["Objects"]["2"]["X"],2);
        let mut duplicate=support.clone();duplicate["floorTransfer"][1]=duplicate["floorTransfer"][0].clone();
        assert!(support_child_candidate(&raw_group,&duplicate).is_err());
        grouped["World"]["SpawnedObjects"]=serde_json::json!([{"GridID":11,"GridObjectID":2}]);
        assert!(support_child_candidate(&serde_json::to_vec(&grouped).unwrap(),&support).is_err());
        assert!(group_cut_candidate(&serde_json::to_vec(&grouped).unwrap(),&outdoor.to_string()).is_err());
        save["World"]["SpawnedObjects"]=serde_json::json!([{"GridID":11,"GridObjectID":1}]);
        assert!(group_cut_candidate(&serde_json::to_vec(&save).unwrap(),&plan.to_string()).is_err());
    }
    #[test]
    fn free_room_cut_to_native_world_keeps_overlap_and_inventory(){
        let raw=br#"{"GameInfo":{"Version":643},"Player":{"Marker":1e2},"World":{"PlayerHouses":[{"Floors":[{"Rooms":{"0":{"FloorGridID":43}}}]}],"GridCollection":{"Grids":{"10":{"ID":10,"GridDefaultLayoutPath":"SceneLayouts/Village04/DefaultVillageLayout01-BeachGrids.json","GridDataPath":"GridData/Villages/Village04-BeachLevel-GridData.json","TessellationFactor":1,"NextGridObjectID":2,"Objects":{"1":{"ID":1,"ItemID":40000002,"X":4,"Y":5,"Orientation":"GridOrientation_Down"}}},"43":{"ID":43,"GridDataPath":"GridData/Rooms/Room8x8-GridData.json","TessellationFactor":1,"NextGridObjectID":3,"Objects":{"1":{"ID":1,"ItemID":40000001,"X":2,"Y":2,"Orientation":"GridOrientation_DownLeft"},"2":{"ID":2,"ItemID":40000001,"X":2,"Y":2,"Orientation":"GridOrientation_Down"}}}}}}}"#;
        let original:Value=serde_json::from_slice(raw).unwrap();
        let (_,layout,factor,sx,sy)=outdoor_identity(&original,"10").unwrap();
        let dest=serde_json::json!({"layoutId":layout,"gridDataPath":"GridData/Villages/Village04-BeachLevel-GridData.json","factor":factor,"sizeX":sx,"sizeY":sy});
        let mut plan=serde_json::json!({"freePlacement":true,"rows":[{"roomSource":{"roomOrdinal":1,"index":0},"itemId":"40000001","expectedX":2,"expectedY":2,"expectedOrientation":"GridOrientation_DownLeft","destination":dest.clone(),"x":4,"y":5,"orientation":"GridOrientation_DownLeft"},{"roomSource":{"roomOrdinal":1,"index":1},"itemId":"40000001","expectedX":2,"expectedY":2,"expectedOrientation":"GridOrientation_Down","destination":dest,"x":4,"y":5,"orientation":"GridOrientation_Down"}]});
        let result=group_cut_candidate(raw,&plan.to_string()).unwrap();let after:Value=serde_json::from_str(&result).unwrap();
        assert_eq!(after["Player"],original["Player"]);assert!(result.contains("1e2"));
        let g=&after["World"]["GridCollection"]["Grids"];
        assert!(g["43"]["Objects"].as_object().unwrap().is_empty());assert_eq!(g["10"]["Objects"]["1"],original["World"]["GridCollection"]["Grids"]["10"]["Objects"]["1"]);
        assert_eq!(g["10"]["Objects"]["3"]["Orientation"],"GridOrientation_DownLeft");assert_eq!(g["10"]["Objects"]["2"]["Orientation"],"GridOrientation_Down");assert_eq!(g["10"]["NextGridObjectID"],4);
        assert!(group_cut_candidate(raw,&plan["rows"].to_string()).is_err());
        plan["rows"][0]["destination"]["sizeX"]=Value::from(sx+1);assert!(group_cut_candidate(raw,&plan.to_string()).is_err());
        plan["rows"][0]["destination"]["sizeX"]=Value::from(sx);plan["rows"][0]["x"]=Value::from(999999);assert!(group_cut_candidate(raw,&plan.to_string()).is_err());
    }
    #[test]
    fn oblique_leaf_furniture_requires_factor_one_and_preserves_other_bytes(){
        let raw=br#"{"GameInfo":{"Version":643},"World":{"GridCollection":{"Grids":{"10":{"ID":10,"GridDefaultLayoutPath":"SceneLayouts/Village04/DefaultVillageLayout01-BeachGrids.json","GridDataPath":"GridData/Villages/Village04-BeachLevel-GridData.json","TessellationFactor":1,"Objects":{"1":{"ID":1,"ItemID":40000001,"X":4,"Y":5,"Orientation":"GridOrientation_Down","State":null}}}}}},"Marker":1e2}"#;
        let targets=resolve_grid_mixed_targets(raw,&[(1,40000001,(4,5),"full".into(),Some("GridOrientation_Down".into()))]).unwrap();
        let edit=ddv_save_patch::GridMixedEdit{target:targets[0].clone(),expected:(4,5),position:None,orientation:Some(("GridOrientation_Down".into(),"GridOrientation_DownLeft".into()))};
        let edits=[edit];
        assert!(validate_oblique_grid_edits(raw,&edits).is_ok());
        let draft=ddv_save_patch::preview_existing_grid_mixed_batch(std::str::from_utf8(raw).unwrap(),&edits).unwrap();
        assert_eq!(draft.patched_json,std::str::from_utf8(raw).unwrap().replace("GridOrientation_Down","GridOrientation_DownLeft"));
        let mut wrong:Value=serde_json::from_slice(raw).unwrap();
        wrong["World"]["GridCollection"]["Grids"]["10"]["TessellationFactor"]=Value::from(2);
        assert!(validate_oblique_grid_edits(&serde_json::to_vec(&wrong).unwrap(),&edits).is_err());
        wrong["World"]["GridCollection"]["Grids"]["10"]["TessellationFactor"]=Value::from(1);
        wrong["World"]["GridCollection"]["Grids"]["10"]["Objects"]["1"]["State"]=serde_json::json!({"SubGrid":{"GridID":90}});
        assert!(validate_oblique_grid_edits(&serde_json::to_vec(&wrong).unwrap(),&edits).is_err());
    }
    #[test]
    fn building_clone_accepts_observed_schema643_state_families_and_rejects_embedded_links(){
        let root=serde_json::json!({});
        let house=serde_json::json!({"HouseData":{"Built":true,"PlayerHouseIndex":0,"UpgradeState":null}});
        let skin=serde_json::json!({"BuildingWithSkinData":{"UpgradeState":null,"CurrentSkinItemID":0}});
        let shop=serde_json::json!({"StallData":{"UpgradeState":{"Level":1},"CurrentSkinItemID":0,"ShopData":{"LastRefresh":"2020-01-01T00:00:00Z","NumRefresh":1,"Seed":2,"Slots":[{"SlotId":0,"MaxAmount":5,"Regen":null,"Item":{"id":10000001,"amount":3}}]}}});
        let garden=serde_json::json!({"GardenData":{"Slots":[{"PlantedSeedItemID":400001,"LastActivity":"2020-01-01T00:00:00Z","Harvest":{"EndOfGrowth":"2020-01-01T00:00:00Z","EndOfLife":null,"NumberOfProductionLeft":1,"SaplingGridObjectID":0}}]}});
        let fishing=serde_json::json!({"FishingStallData":{"UpgradeState":{"Level":1},"LastCollect":"2020-01-01T00:00:00Z","PendingFishes":[]}});
        for (item,state) in [(20000001,&house),(20300001,&house),(20000001,&skin),(20100001,&skin),(20300001,&skin),(20100001,&shop),(20200001,&garden),(20100002,&fishing)]{
            assert!(known_building_transform_state(&root,item,state));
            assert!(building_clone_state(item,Some(state)));
        }
        let mut unknown_shop=shop.clone();unknown_shop["StallData"]["ShopData"]["Slots"][0]["Item"]["GridID"]=1.into();
        assert!(!building_clone_state(20100001,Some(&unknown_shop)));
        let mut linked_garden=garden.clone();linked_garden["GardenData"]["Slots"][0]["Harvest"]["SaplingGridObjectID"]=7.into();
        assert!(!building_clone_state(20200001,Some(&linked_garden)));
        let mut fishing_rewards=fishing.clone();fishing_rewards["FishingStallData"]["PendingFishes"]=serde_json::json!([{}]);
        assert!(!building_clone_state(20100002,Some(&fishing_rewards)));
        let mut linked_house=house.clone();linked_house["HouseData"]["PlayerHouseIndex"]=1.into();
        assert!(!building_clone_state(20000001,Some(&linked_house)));
        assert!(!building_clone_state(20500001,Some(&house)));
        assert!(!building_clone_state(20200001,Some(&shop)));
        let mut dormant=shop.clone();dormant["StallData"]["ShopData"]=Value::Null;
        assert!(building_clone_state(20100001,Some(&dormant)));
    }

    #[test]
    fn building_clone_and_remove_preserve_state_and_reject_last_stateful_instance(){
        let layout="SceneLayouts/Village04/DefaultVillageLayout01-MeadowGrids.json";
        let data="GridData/Villages/Village04-MeadowLevel-GridData.json";
        let state=serde_json::json!({"BuildingWithSkinData":{"UpgradeState":{"Level":1},"CurrentSkinItemID":20300002}});
        let raw=serde_json::json!({"GameInfo":{"Version":643},"Player":{"Keep":7},"World":{"GridCollection":{"Grids":{"42":{"ID":42,"GridDefaultLayoutPath":layout,"GridDataPath":data,"TessellationFactor":1,"NextGridObjectID":5,"Objects":{"1":{"ID":1,"ItemID":20300001,"X":1,"Y":1,"Orientation":"GridOrientation_Down","State":state}}}}}}});
        let dest=serde_json::json!({"layoutId":layout,"gridDataPath":data,"factor":1,"sizeX":196,"sizeY":100});
        let plan=serde_json::json!({"localOrdinal":1,"itemId":"20300001","expectedX":1,"expectedY":1,"orientation":"GridOrientation_Down","destination":dest,"x":1,"y":1});
        let remove=serde_json::json!({"localOrdinal":1,"itemId":"20300001","expectedX":1,"expectedY":1,"orientation":"GridOrientation_Down"});
        let bytes=serde_json::to_vec(&raw).unwrap();
        assert!(building_duplicate_candidate(&bytes,&remove,true).is_err());
        let copy=group_paste_candidate(&bytes,&serde_json::json!({"buildingDuplicate":plan}).to_string()).unwrap();
        let cloned:Value=serde_json::from_str(&copy).unwrap();
        let g=&cloned["World"]["GridCollection"]["Grids"]["42"];
        assert_eq!(g["Objects"]["1"],raw["World"]["GridCollection"]["Grids"]["42"]["Objects"]["1"]);
        assert_eq!(g["Objects"]["5"]["State"],state);assert_eq!(g["Objects"]["5"]["ID"],5);
        assert_eq!(g["NextGridObjectID"],6);assert_eq!(cloned["Player"],raw["Player"]);
        let mut rotated=plan.clone();rotated["replacementOrientation"]="GridOrientation_Right".into();
        let turned:Value=serde_json::from_str(&building_duplicate_candidate(&bytes,&rotated,false).unwrap()).unwrap();
        assert_eq!(turned["World"]["GridCollection"]["Grids"]["42"]["Objects"]["5"]["Orientation"],"GridOrientation_Right");
        assert_eq!(turned["World"]["GridCollection"]["Grids"]["42"]["Objects"]["5"]["State"],state);
        rotated["replacementOrientation"]="invalid".into();
        assert!(building_duplicate_candidate(&bytes,&rotated,false).is_err());
        let result=group_paste_candidate(copy.as_bytes(),&serde_json::json!({"buildingRemove":remove}).to_string()).unwrap();
        let after:Value=serde_json::from_str(&result).unwrap();
        assert!(after["World"]["GridCollection"]["Grids"]["42"]["Objects"].get("1").is_none());
        assert_eq!(after["World"]["GridCollection"]["Grids"]["42"]["Objects"]["5"],g["Objects"]["5"]);
        let mut plain=raw.clone();plain["World"]["GridCollection"]["Grids"]["42"]["Objects"]["1"]["State"]=Value::Null;
        assert!(building_duplicate_candidate(&serde_json::to_vec(&plain).unwrap(),&remove,true).is_ok());
        let mut unsafe_state=raw.clone();unsafe_state["World"]["GridCollection"]["Grids"]["42"]["Objects"]["1"]["State"]["BuildingWithSkinData"]["UpgradeState"]["GridID"]=7.into();
        assert!(building_duplicate_candidate(&serde_json::to_vec(&unsafe_state).unwrap(),&plan,false).is_err());
        let mut linked=raw.clone();linked["World"]["SpawnedObjects"]=serde_json::json!([{"GridID":42,"GridObjectID":1}]);
        assert!(building_duplicate_candidate(&serde_json::to_vec(&linked).unwrap(),&plan,false).is_err());
    }

    #[test]
    fn standard_house_entrance_can_share_interior_between_mainland_and_floating_island(){
        let data="GridData/FloatingIslands/FloatingIsland_Beach/FloatingIsland_BeachGrid-GridData.json";
        let layout="SceneLayouts/FloatingIslands/FloatingIsland_Beach/FloatingIsland_BeachLayout.json";
        let state=serde_json::json!({"HouseData":{"Built":true,"UpgradeState":{"Level":1},"PlayerHouseIndex":1}});
        let original=serde_json::json!({"GameInfo":{"Version":643},"Player":{"Keep":100},"World":{"PlayerHouses":[{"HouseItemID":20500001,"Floors":[]},{"HouseItemID":20500002,"Floors":[{"Rooms":{"0":{"FloorGridID":90}}}]}],"GridCollection":{"Grids":{
            "10":{"ID":10,"GridDefaultLayoutPath":"","GridDataPath":"GridData/Villages/Village04-MeadowLevel-GridData.json","TessellationFactor":1,"NextGridObjectID":2,"Objects":{"1":{"ID":1,"ItemID":20500002,"X":1,"Y":2,"Orientation":"GridOrientation_Down","State":state}}},
            "11":{"ID":11,"GridDefaultLayoutPath":"","GridDataPath":data,"TessellationFactor":1,"NextGridObjectID":7,"Objects":{}},
            "90":{"ID":90,"GridDataPath":"GridData/Rooms/Room8x8-GridData.json","NextGridObjectID":1,"Objects":{}}
        }}}});
        let raw=original.to_string();
        let t=resolve_grid_coordinate_target(raw.as_bytes(),1,20500002,(1,2),"full").unwrap();
        let d=resolve_plain_grid_destination(raw.as_bytes(),&serde_json::json!({"layoutId":layout,"gridDataPath":data,"factor":1,"sizeX":200,"sizeY":200})).unwrap();
        assert_eq!(house_exterior_identity(&original,"11").unwrap().0,layout);
        for duplicate in [true,false]{
            let draft=ddv_save_patch::preview_player_house_world_change(&raw,&t,(1,2),&d,(3,4),"GridOrientation_Down",duplicate).unwrap();
            let out:Value=serde_json::from_str(&draft.patched_json).unwrap();
            let grids=&out["World"]["GridCollection"]["Grids"];
            assert_eq!(grids["10"]["Objects"].get("1").is_some(),duplicate);
            assert_eq!(grids["11"]["Objects"]["7"]["State"],state);
            assert_eq!(grids["90"],original["World"]["GridCollection"]["Grids"]["90"]);
            assert_eq!(out["World"]["PlayerHouses"],original["World"]["PlayerHouses"]);
            assert_eq!(out["Player"],original["Player"]);
        }
        let moved=ddv_save_patch::preview_player_house_world_change(&raw,&t,(1,2),&d,(3,4),"GridOrientation_Down",false).unwrap();
        let duplicate=serde_json::json!({"playerHouseDuplicate":{"localOrdinal":1,"itemId":"20500002","expectedX":3,"expectedY":4,"orientation":"GridOrientation_Down","destination":{"layoutId":layout,"gridDataPath":data,"factor":1,"sizeX":200,"sizeY":200},"x":8,"y":9,"replacementOrientation":"GridOrientation_Right"}});
        let copied=group_paste_candidate(moved.patched_json.as_bytes(),&duplicate.to_string()).unwrap();
        let result:Value=serde_json::from_str(&copied).unwrap();
        assert_eq!(result["World"]["GridCollection"]["Grids"]["11"]["Objects"]["8"]["Orientation"],"GridOrientation_Right");
        let remove=serde_json::json!({"playerHouseRemove":{"localOrdinal":1,"itemId":"20500002","expectedX":3,"expectedY":4,"orientation":"GridOrientation_Down"}});
        let removed:Value=serde_json::from_str(&group_paste_candidate(copied.as_bytes(),&remove.to_string()).unwrap()).unwrap();
        assert!(removed["World"]["GridCollection"]["Grids"]["11"]["Objects"].get("7").is_none());
        assert_eq!(removed["World"]["PlayerHouses"],original["World"]["PlayerHouses"]);
        let mut detached=original.clone();detached["World"]["GridCollection"]["Grids"]["10"]["Objects"]=serde_json::json!({});
        let reattach=serde_json::json!({"buildingInitial":{"itemId":"20500002","destination":{"layoutId":layout,"gridDataPath":data,"factor":1,"sizeX":200,"sizeY":200},"x":8,"y":9,"orientation":"GridOrientation_Right"}});
        let restored:Value=serde_json::from_str(&group_paste_candidate(detached.to_string().as_bytes(),&reattach.to_string()).unwrap()).unwrap();
        assert_eq!(restored["World"]["GridCollection"]["Grids"]["11"]["Objects"]["7"]["State"],state);
        assert_eq!(restored["World"]["PlayerHouses"],original["World"]["PlayerHouses"]);
        let remove_last=serde_json::json!({"playerHouseRemove":{"localOrdinal":1,"itemId":"20500002","expectedX":8,"expectedY":9,"orientation":"GridOrientation_Right"}});
        let last=group_paste_candidate(restored.to_string().as_bytes(),&remove_last.to_string()).unwrap();
        let last_root:Value=serde_json::from_str(&last).unwrap();
        assert_eq!(last_root["World"]["PlayerHouses"],original["World"]["PlayerHouses"]);
        assert!(last_root["World"]["GridCollection"]["Grids"]["11"]["Objects"].as_object().unwrap().is_empty());
        let recreated:Value=serde_json::from_str(&group_paste_candidate(last.as_bytes(),&reattach.to_string()).unwrap()).unwrap();
        assert_eq!(recreated["World"]["GridCollection"]["Grids"]["11"]["Objects"]["8"]["State"],state);
        let mut broken=restored.clone();broken["World"]["PlayerHouses"][1]["Floors"][0]["Rooms"]["0"]["FloorGridID"]=91.into();
        assert!(group_paste_candidate(broken.to_string().as_bytes(),&remove_last.to_string()).is_err());
        let mut primary=original.clone();
        primary["World"]["PlayerHouses"].as_array_mut().unwrap().swap(0,1);
        primary["World"]["GridCollection"]["Grids"]["10"]["Objects"]["1"]["State"]["HouseData"]["PlayerHouseIndex"]=0.into();
        assert!(ddv_save_patch::preview_player_house_world_change(&primary.to_string(),&t,(1,2),&d,(3,4),"GridOrientation_Down",true).is_err());
    }
    #[test]
    fn character_house_copy_preserves_original_presence_and_interior_scene_state(){
        let data="GridData/FloatingIslands/FloatingIsland_Beach/FloatingIsland_BeachGrid-GridData.json";
        let layout="SceneLayouts/FloatingIslands/FloatingIsland_Beach/FloatingIsland_BeachLayout.json";
        let state=serde_json::json!({"HouseData":{"Built":true,"UpgradeState":{"Level":0},"PlayerHouseIndex":0}});
        let raw=serde_json::json!({"GameInfo":{"Version":643},"Player":{"Keep":100},"World":{"Villages":[{"CharacterStates":{"10000001":{"Presence":1}}}],"FloatingIslands":{"1":{"CharacterStates":{}}},"PlayerHouses":[],"GridCollection":{"Grids":{
         "10":{"ID":10,"GridDefaultLayoutPath":"","GridDataPath":"GridData/Villages/Village04-MeadowLevel-GridData.json","TessellationFactor":1,"NextGridObjectID":2,"Objects":{"1":{"ID":1,"ItemID":20000016,"X":1,"Y":2,"Orientation":"GridOrientation_Down","State":state}}},
         "11":{"ID":11,"GridDefaultLayoutPath":"","GridDataPath":data,"TessellationFactor":1,"NextGridObjectID":7,"Objects":{}}
        }}}});
        let json=raw.to_string();
        let t=resolve_grid_mixed_targets(json.as_bytes(),&[(1,20000016,(1,2),"full".to_owned(),Some("GridOrientation_Down".to_owned()))]).unwrap().pop().unwrap();
        let d=resolve_plain_grid_destination(json.as_bytes(),&serde_json::json!({"layoutId":layout,"gridDataPath":data,"factor":1,"sizeX":200,"sizeY":200})).unwrap();
        let draft=character_house_copy_candidate(json.as_bytes(),&t,(1,2),&d,(8,9),"GridOrientation_Down","GridOrientation_Right",true).unwrap();
        let mut out:Value=serde_json::from_str(&draft.patched_json).unwrap();
        assert_eq!(out["World"]["GridCollection"]["Grids"]["11"]["Objects"]["7"]["State"],state);
        assert_eq!(out["World"]["GridCollection"]["Grids"]["11"]["Objects"]["7"]["Orientation"],"GridOrientation_Right");
        out["World"]["GridCollection"]["Grids"]["11"]=raw["World"]["GridCollection"]["Grids"]["11"].clone();
        assert_eq!(out,raw);
        assert!(character_house_copy_candidate(json.as_bytes(),&t,(1,2),&d,(8,9),"GridOrientation_Down","GridOrientation_Right",false).is_err());
        let mut broken=raw.clone();broken["World"]["GridCollection"]["Grids"]["10"]["Objects"]["1"]["State"]["HouseData"]["PlayerHouseIndex"]=1.into();
        assert!(character_house_copy_candidate(broken.to_string().as_bytes(),&t,(1,2),&d,(8,9),"GridOrientation_Down","GridOrientation_Right",true).is_err());
        let mut linked=raw.clone();linked["World"]["SpawnedObjects"]=serde_json::json!([{"GridID":11,"GridObjectID":7}]);
        assert!(character_house_copy_candidate(linked.to_string().as_bytes(),&t,(1,2),&d,(8,9),"GridOrientation_Down","GridOrientation_Right",true).is_err());
        let same=serde_json::json!({"buildingDuplicate":{"localOrdinal":1,"itemId":"20000016","expectedX":1,"expectedY":2,"orientation":"GridOrientation_Down","destination":{"layoutId":"SceneLayouts/Village04/DefaultVillageLayout01-MeadowGrids.json","gridDataPath":"GridData/Villages/Village04-MeadowLevel-GridData.json","factor":1,"sizeX":196,"sizeY":100},"x":8,"y":9}});
        let same_copy=group_paste_candidate(json.as_bytes(),&same.to_string()).unwrap();
        let remove=serde_json::json!({"buildingRemove":{"localOrdinal":1,"itemId":"20000016","expectedX":1,"expectedY":2,"orientation":"GridOrientation_Down"}});
        assert!(group_paste_candidate(json.as_bytes(),&remove.to_string()).is_err());
        assert!(group_paste_candidate(same_copy.as_bytes(),&remove.to_string()).is_ok());
        // Same-world transfer may replace the original entrance because
        // the destination stays in the same verified village scope.
        let mut village=raw.clone();
        village["World"]["GridCollection"]["Grids"]["12"]=serde_json::json!({"ID":12,"GridDefaultLayoutPath":"","GridDataPath":"GridData/Villages/Village04-BeachLevel-GridData.json","TessellationFactor":1,"NextGridObjectID":3,"Objects":{}});
        let village_text=village.to_string();
        let beach=resolve_plain_grid_destination(village_text.as_bytes(),&serde_json::json!({"layoutId":"SceneLayouts/Village04/DefaultVillageLayout01-BeachGrids.json","gridDataPath":"GridData/Villages/Village04-BeachLevel-GridData.json","factor":1,"sizeX":400,"sizeY":350})).unwrap();
        let moved=character_house_move_candidate(village_text.as_bytes(),&t,(1,2),&beach,(20,21),"GridOrientation_Down",false).unwrap();
        let after:Value=serde_json::from_str(&moved.patched_json).unwrap();
        assert!(after["World"]["GridCollection"]["Grids"]["10"]["Objects"].as_object().unwrap().is_empty());
        assert_eq!(after["World"]["GridCollection"]["Grids"]["12"]["Objects"]["3"]["State"],state);
        assert_eq!(after["World"]["Villages"],village["World"]["Villages"]);
        assert_eq!(after["Player"],village["Player"]);
        assert!(character_house_move_candidate(village_text.as_bytes(),&t,(1,2),&beach,(20,21),"GridOrientation_Down",true).is_err());
        let mut linked_village=village.clone();
        linked_village["Player"]["LastUsedLinkedEnvironmentEnter"]=serde_json::json!({"1540000001":{"GridID":10,"GridObjectID":1}});
        assert!(character_house_move_candidate(linked_village.to_string().as_bytes(),&t,(1,2),&beach,(20,21),"GridOrientation_Down",false).is_err());
        let mut visited=raw.clone();
        visited["Player"]["LastUsedLinkedEnvironmentEnter"]=serde_json::json!({"1540000001":{"GridID":10,"GridObjectID":1}});
        let before=visited.to_string();
        let visited_copy=character_house_copy_candidate(before.as_bytes(),&t,(1,2),&d,(8,9),"GridOrientation_Down","GridOrientation_Right",true).unwrap();
        let after:Value=serde_json::from_str(&visited_copy.patched_json).unwrap();
        assert_eq!(after["Player"],visited["Player"]);
        let same_visited=group_paste_candidate(before.as_bytes(),&same.to_string()).unwrap();
        let same_visited_root:Value=serde_json::from_str(&same_visited).unwrap();
        assert_eq!(same_visited_root["Player"],visited["Player"]);
        let mut stale=same.clone();stale["buildingDuplicate"]["orientation"]="GridOrientation_Left".into();
        assert!(group_paste_candidate(before.as_bytes(),&stale.to_string()).is_err());
        let mut island_copy:Value=serde_json::from_str(&draft.patched_json).unwrap();
        let remove_island=serde_json::json!({"buildingRemove":{"localOrdinal":2,"itemId":"20000016","expectedX":8,"expectedY":9,"orientation":"GridOrientation_Right"}});
        assert!(group_paste_candidate(island_copy.to_string().as_bytes(),&remove_island.to_string()).is_err());
        let mut routed=island_copy.clone();
        routed["World"]["Villages"][0]["Areas"]=serde_json::json!({"1":{"GridIDs":[10]}});
        routed["World"]["Villages"][0]["CharacterStates"]=serde_json::json!({"10000002":{}});
        routed["World"]["FloatingIslands"]["1"]["GridIDs"]=serde_json::json!([11]);
        let foreign_removed:Value=serde_json::from_str(&group_paste_candidate(routed.to_string().as_bytes(),&remove_island.to_string()).unwrap()).unwrap();
        assert!(foreign_removed["World"]["GridCollection"]["Grids"]["11"]["Objects"].as_object().unwrap().is_empty());
        assert_eq!(foreign_removed["World"]["Villages"],routed["World"]["Villages"]);
        assert_eq!(foreign_removed["World"]["FloatingIslands"],routed["World"]["FloatingIslands"]);
        // Move a redundant foreign entrance as a single transaction, without
        // touching the character presence or original house.
        let moved_target=GridCoordinateTarget{kind:GridObjectKind::Full,grid_id:"11".into(),object_id:"7".into(),item_id:20000016};
        let home_witness=serde_json::json!({"layoutId":"SceneLayouts/Village04/DefaultVillageLayout01-MeadowGrids.json","gridDataPath":"GridData/Villages/Village04-MeadowLevel-GridData.json","factor":1,"sizeX":196,"sizeY":100});
        let routed_text=routed.to_string();
        let home=resolve_plain_grid_destination(routed_text.as_bytes(),&home_witness).unwrap();
        let moved=character_house_move_candidate(routed_text.as_bytes(),&moved_target,(8,9),&home,(20,21),"GridOrientation_Right",true).unwrap();
        let after:Value=serde_json::from_str(&moved.patched_json).unwrap();
        assert_eq!(after["World"]["GridCollection"]["Grids"]["10"]["Objects"]["1"],routed["World"]["GridCollection"]["Grids"]["10"]["Objects"]["1"]);
        assert_eq!(after["World"]["GridCollection"]["Grids"]["10"]["Objects"]["2"]["State"],state);
        assert!(after["World"]["GridCollection"]["Grids"]["11"]["Objects"].as_object().unwrap().is_empty());
        assert_eq!(after["World"]["Villages"],routed["World"]["Villages"]);
        assert_eq!(after["World"]["FloatingIslands"],routed["World"]["FloatingIslands"]);
        assert_eq!(after["Player"],routed["Player"]);
        assert!(character_house_move_candidate(json.as_bytes(),&t,(1,2),&d,(20,21),"GridOrientation_Down",true).is_err());
        let mut local=routed.clone();local["World"]["FloatingIslands"]["1"]["CharacterStates"]["10000007"]=serde_json::json!({});
        assert!(group_paste_candidate(local.to_string().as_bytes(),&remove_island.to_string()).is_err());
        assert!(character_house_move_candidate(local.to_string().as_bytes(),&moved_target,(8,9),&home,(20,21),"GridOrientation_Right",true).is_err());
        let mut ambiguous=routed.clone();ambiguous["World"]["Villages"][0]["Areas"]["1"]["GridIDs"]=serde_json::json!([10,11]);
        assert!(group_paste_candidate(ambiguous.to_string().as_bytes(),&remove_island.to_string()).is_err());
        let mut unrelated=routed.clone();unrelated["World"]["Villages"][0]["CharacterStates"]=serde_json::json!({"10000001":{}});
        assert!(group_paste_candidate(unrelated.to_string().as_bytes(),&remove_island.to_string()).is_err());
        island_copy["World"]["GridCollection"]["Grids"]["11"]["Objects"]["8"]=serde_json::json!({"ID":8,"ItemID":20000016,"X":20,"Y":20,"Orientation":"GridOrientation_Down","State":state});
        island_copy["World"]["GridCollection"]["Grids"]["11"]["NextGridObjectID"]=9.into();
        let removed:Value=serde_json::from_str(&group_paste_candidate(island_copy.to_string().as_bytes(),&remove_island.to_string()).unwrap()).unwrap();
        assert!(removed["World"]["GridCollection"]["Grids"]["11"]["Objects"].get("7").is_none());
        assert_eq!(removed["World"]["Villages"],raw["World"]["Villages"]);
        assert_eq!(removed["World"]["FloatingIslands"],raw["World"]["FloatingIslands"]);
        island_copy["Player"]["LastUsedLinkedEnvironmentEnter"]=serde_json::json!({"1540000001":{"GridID":11,"GridObjectID":7}});
        assert!(group_paste_candidate(island_copy.to_string().as_bytes(),&remove_island.to_string()).is_err());
    }
    #[test]
    fn cross_world_building_move_and_duplicate_preserve_native_state(){
        let catalog:Value=serde_json::from_str(include_str!("../../../static/ddv/world/steam-1.26.2/index.json")).unwrap();
        let dest=catalog["entries"].as_array().unwrap().iter().find(|e|e["scope"]=="VillageExpansion01").unwrap()["grids"].as_array().unwrap().iter().find(|g|g["factor"]==1&&g["gridDataPath"].as_str().is_some_and(|p|p.starts_with("GridData/Villages/VillageExpansion01/"))).unwrap();
        let state=serde_json::json!({"BuildingWithSkinData":{"UpgradeState":{"Level":1},"CurrentSkinItemID":0}});
        assert!(cross_world_building_state(20300001,Some(&state)));
        assert!(cross_world_building_state(20000001,None));
        assert!(!cross_world_building_state(20500001,None));
        assert!(!cross_world_building_state(20000001,Some(&serde_json::json!({"HouseData":{"Built":true}}))));
        let original=serde_json::json!({"GameInfo":{"Version":643},"Player":{"Keep":100},"World":{"GridCollection":{"Grids":{"10":{"ID":10,"GridDefaultLayoutPath":"SceneLayouts/Village04/DefaultVillageLayout01-MeadowGrids.json","GridDataPath":"GridData/Villages/Village04-MeadowLevel-GridData.json","TessellationFactor":1,"NextGridObjectID":2,"Objects":{"1":{"ID":1,"ItemID":20300001,"X":1,"Y":2,"Orientation":"GridOrientation_Down","State":state}}},"11":{"ID":11,"GridDefaultLayoutPath":dest["layoutId"],"GridDataPath":dest["gridDataPath"],"TessellationFactor":1,"NextGridObjectID":7,"Objects":{}}}}}});
        let raw=original.to_string();
        let t=resolve_grid_mixed_targets(raw.as_bytes(),&[(1,20300001,(1,2),"full".to_owned(),Some("GridOrientation_Down".to_owned()))]).unwrap().pop().unwrap();
        let d=resolve_plain_grid_destination(raw.as_bytes(),&serde_json::json!({"layoutId":dest["layoutId"],"gridDataPath":dest["gridDataPath"],"factor":1,"sizeX":dest["sizeX"],"sizeY":dest["sizeY"]})).unwrap();
        assert!(ddv_save_patch::preview_checked_building_transfer(&raw,&t,(1,2),&d,(3,4),"GridOrientation_Down").is_err());
        for duplicate in [true,false]{
            let draft=ddv_save_patch::preview_checked_building_world_change(&raw,&t,(1,2),&d,(3,4),"GridOrientation_Down",duplicate).unwrap();
            let v:Value=serde_json::from_str(&draft.patched_json).unwrap();
            let grids=&v["World"]["GridCollection"]["Grids"];
            assert_eq!(grids["10"]["Objects"].get("1").is_some(),duplicate);
            assert_eq!(grids["11"]["Objects"]["7"]["State"],state);
            assert_eq!(grids["11"]["NextGridObjectID"],8);
            assert_eq!(v["Player"],original["Player"]);
        }
        assert!(ddv_save_patch::preview_checked_building_world_change(&raw,&t,(1,2),&d,(-1,4),"GridOrientation_Down",true).is_err());
    }

    #[test]
    fn checked_building_transfer_retains_state_and_allocates_destination_identity(){
        let raw=br#"{"GameInfo":{"Version":643},"Player":{"Marker":1e2},"World":{"GridCollection":{"Grids":{"10":{"ID":10,"GridDefaultLayoutPath":"SceneLayouts/Village04/DefaultVillageLayout01-BeachGrids.json","GridDataPath":"GridData/Villages/Village04-BeachLevel-GridData.json","TessellationFactor":1,"NextGridObjectID":2,"Objects":{"1":{"ID":1,"ItemID":20100001,"X":8,"Y":9,"Orientation":"GridOrientation_Down","State":{"StallData":{"UpgradeState":{"Level":1},"ShopData":{"Marker":1e2},"CurrentSkinItemID":0}}}}},"11":{"ID":11,"GridDefaultLayoutPath":"SceneLayouts/Village04/DefaultVillageLayout01-MeadowGrids.json","GridDataPath":"GridData/Villages/Village04-MeadowLevel-GridData.json","TessellationFactor":1,"NextGridObjectID":5,"Objects":{}}}}}}"#;
        let target=resolve_grid_mixed_targets(raw,&[(1,20100001,(8,9),"full".to_owned(),Some("GridOrientation_Down".to_owned()))]).unwrap().pop().unwrap();
        let d=resolve_plain_grid_destination(raw,&serde_json::json!({"layoutId":"SceneLayouts/Village04/DefaultVillageLayout01-MeadowGrids.json","gridDataPath":"GridData/Villages/Village04-MeadowLevel-GridData.json","factor":1,"sizeX":196,"sizeY":100})).unwrap();
        let input=std::str::from_utf8(raw).unwrap();
        let draft=ddv_save_patch::preview_checked_building_transfer(input,&target,(8,9),&d,(20,30),"GridOrientation_Down").unwrap();
        let old:Value=serde_json::from_slice(raw).unwrap();let mut expected=old.clone();
        let mut building=expected["World"]["GridCollection"]["Grids"]["10"]["Objects"].as_object_mut().unwrap().remove("1").unwrap();
        building["ID"]=5.into();building["X"]=20.into();building["Y"]=30.into();
        expected["World"]["GridCollection"]["Grids"]["11"]["Objects"]["5"]=building;
        expected["World"]["GridCollection"]["Grids"]["11"]["NextGridObjectID"]=6.into();
        assert_eq!(serde_json::from_str::<Value>(&draft.patched_json).unwrap(),expected);
        assert_eq!(draft.patched_json.matches("1e2").count(),2);
        assert!(ddv_save_patch::preview_checked_building_transfer(input,&target,(8,9),&d,(196,30),"GridOrientation_Down").is_err());
        assert!(ddv_save_patch::preview_checked_building_transfer(input,&target,(7,9),&d,(20,30),"GridOrientation_Down").is_err());
        let mut unknown=old.clone();unknown["World"]["GridCollection"]["Grids"]["10"]["Objects"]["1"]["State"]["SubGrid"]=serde_json::json!({"GridID":99});
        assert!(resolve_grid_mixed_targets(unknown.to_string().as_bytes(),&[(1,20100001,(8,9),"full".to_owned(),Some("GridOrientation_Down".to_owned()))]).is_err());
    }

    #[test]
    fn typed_building_transforms_preserve_state_and_require_original_grid(){
        let raw=br#"{"GameInfo":{"Version":643},"World":{"PlayerHouses":[{"HouseItemID":20500001,"Floors":[{}]}],"GridCollection":{"Grids":{"10":{"ID":10,"GridDefaultLayoutPath":"SceneLayouts/Village04/DefaultVillageLayout01-BeachGrids.json","GridDataPath":"GridData/Villages/Village04-BeachLevel-GridData.json","TessellationFactor":1,"Objects":{"1":{"ID":1,"ItemID":20500001,"X":4,"Y":5,"Orientation":"GridOrientation_Down","State":{"HouseData":{"Built":true,"PlayerHouseIndex":0,"UpgradeState":{"Level":1}}}},"2":{"ID":2,"ItemID":20000001,"X":6,"Y":7,"Orientation":"GridOrientation_Down","State":{"HouseData":{"Built":true,"UpgradeState":null,"PlayerHouseIndex":-1}}},"3":{"ID":3,"ItemID":20100001,"X":8,"Y":9,"Orientation":"GridOrientation_Down","State":{"StallData":{"UpgradeState":{"Level":1},"ShopData":{"Seed":3,"Slots":[],"Marker":1e2},"CurrentSkinItemID":0}}},"4":{"ID":4,"ItemID":20200001,"X":10,"Y":11,"Orientation":"GridOrientation_Down","State":{"GardenData":{"Slots":[{"PlantedSeedItemID":1}]}}},"5":{"ID":5,"ItemID":20300001,"X":12,"Y":13,"Orientation":"GridOrientation_Down","State":{"BuildingWithSkinData":{"UpgradeState":{"Level":1},"CurrentSkinItemID":0}}}}}}}}}"#;
        let items=[20500001,20000001,20100001,20200001,20300001];
        let selectors=items.iter().enumerate().map(|(i,item)|(i+1,*item,(4+i as i32*2,5+i as i32*2),"full".to_owned(),Some("GridOrientation_Down".to_owned()))).collect::<Vec<_>>();
        let targets=resolve_grid_mixed_targets(raw,&selectors).unwrap();
        let moves=targets.iter().map(|t|(t,(20,30))).collect::<Vec<_>>();
        assert!(validate_exclusive_grid_moves(raw,&moves).is_ok());
        assert!(validate_exclusive_grid_moves(raw,&[(&targets[0],(400,30))]).is_err());
        let edits=targets.iter().zip(selectors.iter()).map(|(t,s)|ddv_save_patch::GridMixedEdit{target:t.clone(),expected:s.2,position:Some((20,30)),orientation:Some(("GridOrientation_Down".into(),"GridOrientation_Left".into()))}).collect::<Vec<_>>();
        let draft=ddv_save_patch::preview_existing_grid_mixed_batch(std::str::from_utf8(raw).unwrap(),&edits).unwrap();
        let before:Value=serde_json::from_slice(raw).unwrap();
        let after:Value=serde_json::from_str(&draft.patched_json).unwrap();
        assert_eq!(before["World"]["PlayerHouses"],after["World"]["PlayerHouses"]);
        for i in 1..=5{let k=i.to_string();let a=&after["World"]["GridCollection"]["Grids"]["10"]["Objects"][&k];let b=&before["World"]["GridCollection"]["Grids"]["10"]["Objects"][&k];assert_eq!(a["State"],b["State"]);assert_eq!(a["ID"],b["ID"]);assert_eq!(a["X"],20);assert_eq!(a["Orientation"],"GridOrientation_Left");}
        assert!(draft.patched_json.contains("\"Marker\":1e2"));
        let mut wrong=before.clone();wrong["World"]["PlayerHouses"][0]["HouseItemID"]=Value::from(20500002);
        assert!(resolve_grid_mixed_targets(&serde_json::to_vec(&wrong).unwrap(),&selectors).is_err());
        let mut unknown=before.clone();unknown["World"]["GridCollection"]["Grids"]["10"]["Objects"]["3"]["State"]["SubGrid"]=serde_json::json!({"GridID":90});
        assert!(resolve_grid_mixed_targets(&serde_json::to_vec(&unknown).unwrap(),&selectors).is_err());
    }
    #[test]
    fn subgrid_parent_is_local_structural_evidence_and_mixed_edit_guard(){
        let save=br#"{"World":{"GridCollection":{"Grids":{
          "1":{"GridDefaultLayoutPath":"SceneLayouts/Test.json","GridDataPath":"GridData/Test.json","Objects":{
            "1":{"ItemID":40005160,"X":0,"Y":1,"State":{"SubGrid":{"GridID":99}}},
            "2":{"ItemID":40005160,"X":2,"Y":3,"State":{"SubGrid":{"GridID":88}}},
            "3":{"ItemID":40005160,"X":4,"Y":5}}},
          "99":{"Objects":{"7":{"ItemID":40005160,"X":0,"Y":0}}}
        }}}}"#;
        let witness=r#"{"contract":"wand.db05.db04-object-source-witness@1","gridRefs":[{"layoutId":"SceneLayouts/Test.json","gridDataPath":"GridData/Test.json","nativeGridId":0,"nativeSizeX":10,"nativeSizeY":10,"tessellationFactor":1}]}"#;
        let r:Value=serde_json::from_str(&saved_db04_terrain_session_json(save,witness).unwrap()).unwrap();
        assert_eq!(r["bindings"][0]["subgrid"],serde_json::json!({"status":"resolved_full","objectCount":1}));
        assert_eq!(r["bindings"][1]["subgrid"],serde_json::json!({"status":"unresolved","objectCount":null}));
        assert!(r["bindings"][2]["subgrid"].is_null());
        assert!(!r.to_string().contains("GridID"));
        assert!(resolve_grid_mixed_targets(save,&[(1,40005160,(0,1),"full".into(),None)]).is_err());
        assert!(resolve_grid_mixed_targets(save,&[(2,40005160,(2,3),"full".into(),None)]).is_err());
        assert!(resolve_grid_mixed_targets(save,&[(3,40005160,(4,5),"full".into(),None)]).is_ok());
    }
}

fn area_network_destination(profile:&[u8],witness:&Value)->Result<ddv_save_patch::PlainGridDestination,CodecError>{
 let bad=CodecError::Json;
 let layout=witness.get("layoutId").and_then(Value::as_str).ok_or(bad)?;
 if !["Beach","Cliff","DarkMountains","Forest","Meadow","Savannah","Urban","Wetland"].iter().any(|key|layout==format!("SceneLayouts/Village04/DefaultVillageLayout01-{key}Grids.json")){if island_scope(witness).is_err(){world_grid_scope(witness)?;}}
 resolve_plain_grid_destination(profile,witness)
}
fn area_network_rows(profile:&[u8],d:&ddv_save_patch::PlainGridDestination)->Result<Vec<Value>,CodecError>{
 let bad=CodecError::Json;
 let root:Value=serde_json::from_slice(profile).map_err(|_|bad)?;
 if root.get("GameInfo").and_then(|v|v.get("Version")).and_then(Value::as_u64)!=Some(643){return Err(bad);}
 let map=root.get("World").and_then(|v|v.get("GridCollection")).and_then(|v|v.get("Grids")).and_then(|v|v.get(&d.grid_id)).and_then(|v|v.get("Objects")).and_then(Value::as_object).ok_or(bad)?;
 let mut rows=Vec::new();
 for (id,v) in map{
  let item=v.get("ItemID").and_then(Value::as_u64).ok_or(bad)?;
  if !matches!(item/100_000,401|407){continue;}
  if v.get("ID").and_then(Value::as_u64)!=key_id(id)||v.as_object().is_none_or(|o|o.keys().any(|k|!matches!(k.as_str(),"ID"|"ItemID"|"X"|"Y"|"Orientation"|"State"))){return Err(bad);}
  let int=|k:&str|v.get(k).and_then(Value::as_i64).and_then(|n|i32::try_from(n).ok()).ok_or(bad);
  let orientation=v.get("Orientation").and_then(Value::as_str).ok_or(bad)?;
  if !matches!(orientation,"GridOrientation_Down"|"GridOrientation_Left"){return Err(bad);}
  let diagonal=ddv_save_patch::road_mode(v).ok_or(bad)?;
  let network=if item/100_000==401{serde_json::json!({"kind":"road","diagonal":diagonal})}else{serde_json::json!({"kind":"fence","diagonal":diagonal,"base":ddv_save_patch::fence_topology::family_for_part(u32::try_from(item).map_err(|_|bad)?,diagonal).ok_or(bad)?})};
  rows.push(serde_json::json!({"itemId":item,"x":int("X")?,"y":int("Y")?,"orientation":if orientation=="GridOrientation_Left"{3}else{2},"network":network}));
 }
 if rows.len()>4608{return Err(bad);}
 Ok(rows)
}
fn parse_area_network_poses(rows:&Value)->Result<Vec<ddv_save_patch::AreaNetworkPose>,CodecError>{
 let bad=CodecError::Json;
 rows.as_array().filter(|a|a.len()<=4608).ok_or(bad)?.iter().map(|row|{
  let o=row.as_object().filter(|o|o.len()==5&&o.keys().all(|k|matches!(k.as_str(),"itemId"|"x"|"y"|"orientation"|"network"))).ok_or(bad)?;
  let item=o.get("itemId").and_then(Value::as_u64).and_then(|n|u32::try_from(n).ok()).ok_or(bad)?;
  let int=|k:&str|o.get(k).and_then(Value::as_i64).and_then(|n|i32::try_from(n).ok()).ok_or(bad);
  let orientation=o.get("orientation").and_then(Value::as_u64).filter(|n|matches!(n,2|3)).ok_or(bad)?;
  let n=o.get("network").and_then(Value::as_object).ok_or(bad)?;
  let diagonal=n.get("diagonal").and_then(Value::as_bool).ok_or(bad)?;
  match n.get("kind").and_then(Value::as_str){
   Some("road") if n.len()==2&&item/100_000==401&&orientation==2=>{},
   Some("fence") if n.len()==3&&item/100_000==407&&ddv_save_patch::fence_topology::family_for_part(item,diagonal).map(u64::from)==n.get("base").and_then(Value::as_u64)=>{},
   _=>return Err(bad)
  }
  Ok(ddv_save_patch::AreaNetworkPose{item,x:int("x")?,y:int("y")?,left:orientation==3,diagonal})
 }).collect()
}
pub(super) fn inspect_area_network(profile:&[u8],witness:&str)->Result<String,CodecError>{
 let bad=CodecError::Json;
 let value:Value=serde_json::from_str(witness).map_err(|_|bad)?;
 let d=area_network_destination(profile,&value)?;
 let rows=area_network_rows(profile,&d)?;
 ddv_save_patch::validate_area_network(&d,&parse_area_network_poses(&Value::Array(rows.clone()))?).map_err(|_|bad)?;
 serde_json::to_string(&rows).map_err(|_|bad)
}
type LandscapePose=(u64,i32,i32,usize);
fn landscape_free_mode(v:&Value)->Result<bool,CodecError>{match v.get("freePlacement"){None=>Ok(false),Some(Value::Bool(true))=>Ok(true),_=>Err(CodecError::Json)}}
fn landscape_poses(v:&Value,d:&ddv_save_patch::PlainGridDestination,free:bool)->Result<Vec<LandscapePose>,CodecError>{
 let bad=CodecError::Json;let mut seen=HashSet::new();
 v.as_array().filter(|a|a.len()<=2048).ok_or(bad)?.iter().map(|r|{
  let o=r.as_object().filter(|o|o.len()==4&&o.keys().all(|k|matches!(k.as_str(),"itemId"|"x"|"y"|"orientation"))).ok_or(bad)?;
  let id=o.get("itemId").and_then(Value::as_u64).filter(|id|id/100_000==402).ok_or(bad)?;
  let x=o.get("x").and_then(Value::as_u64).filter(|x|*x<u64::from(d.size.0)*u64::from(d.tessellation)).ok_or(bad)? as i32;
  let y=o.get("y").and_then(Value::as_u64).filter(|y|*y<u64::from(d.size.1)*u64::from(d.tessellation)).ok_or(bad)? as i32;
  let o=o.get("orientation").and_then(Value::as_u64).filter(|o|*o<4).ok_or(bad)? as usize;
  if !free&&!seen.insert((x,y)){return Err(bad);}Ok((id,x,y,o))
 }).collect()
}
fn landscape_orientation(o:usize)->&'static str{["GridOrientation_Up","GridOrientation_Right","GridOrientation_Down","GridOrientation_Left"][o]}
fn landscape_observed(profile:&[u8],d:&ddv_save_patch::PlainGridDestination)->Result<HashMap<LandscapePose,Vec<String>>,CodecError>{
 let bad=CodecError::Json;
 let root:Value=serde_json::from_slice(profile).map_err(|_|bad)?;
 if root["GameInfo"]["Version"].as_u64()!=Some(643){return Err(bad);}
 let map=root["World"]["GridCollection"]["Grids"][&d.grid_id]["Objects"].as_object().ok_or(bad)?;
 let mut rows=HashMap::<LandscapePose,Vec<String>>::new();
 for (key,v) in map{
  let Some(id)=v["ItemID"].as_u64().filter(|id|id/100_000==402)else{continue;};
  if v["ID"].as_u64()!=key_id(key)||v.as_object().is_none_or(|o|o.keys().any(|k|!matches!(k.as_str(),"ID"|"ItemID"|"X"|"Y"|"Orientation"|"State")))||v.get("State").is_some_and(|s|!s.is_null()){continue;}
  let Some(x)=v["X"].as_i64().and_then(|n|i32::try_from(n).ok())else{continue;};
  let Some(y)=v["Y"].as_i64().and_then(|n|i32::try_from(n).ok())else{continue;};
  let Some(o)=(0..4).find(|&o|v["Orientation"].as_str()==Some(landscape_orientation(o)))else{continue;};
  if x<0||y<0||x as u32>=d.size.0*d.tessellation||y as u32>=d.size.1*d.tessellation{continue;}
  rows.entry((id,x,y,o)).or_default().push(key.clone());
 }
 Ok(rows)
}
/// Exact original Grid identity, including the factor. Floating island
/// templates and unknown layouts are excluded; no cross-grid offset exists.
fn landscape_destination(profile:&[u8],witness:&Value)->Result<ddv_save_patch::PlainGridDestination,CodecError>{
 let bad=CodecError::Json;
 let layout=witness["layoutId"].as_str().ok_or(bad)?;
 let scope=if island_scope(witness).is_ok(){"FloatingIslands"}else{layout.split('/').nth(1).filter(|s|matches!(*s,"Village04"|"VillageExpansion01"|"VillageExpansion02"|"VillageExpansion03"|"VillageExpansion04"|"VillageWinnieDLC")).ok_or(bad)?};
 let catalog:Value=serde_json::from_str(include_str!("../../../static/ddv/world/steam-1.26.2/index.json")).map_err(|_|bad)?;
 let entry=catalog["entries"].as_array().ok_or(bad)?.iter().find(|e|e["scope"].as_str()==Some(scope)).ok_or(bad)?;
 let grids=entry["grids"].as_array().ok_or(bad)?;
 if grids.iter().filter(|g|["layoutId","gridDataPath","sizeX","sizeY","factor"].iter().all(|k|g[*k]==witness[*k])).count()!=1{return Err(bad);}
 resolve_plain_grid_destination(profile,witness)
}
pub(super) fn inspect_area_landscape(profile:&[u8],witness:&str)->Result<String,CodecError>{
 let bad=CodecError::Json;let v:Value=serde_json::from_str(witness).map_err(|_|bad)?;
 let d=landscape_destination(profile,&v)?;
 let observed=landscape_observed(profile,&d)?;
 let mut rows:Vec<_>=observed.into_iter().flat_map(|(p,ids)|std::iter::repeat(p).take(ids.len())).collect();
 rows.sort_unstable();if rows.len()>2048{return Err(CodecError::Bounds);}
 serde_json::to_string(&rows.into_iter().map(|(item,x,y,o)|serde_json::json!({"itemId":item,"x":x,"y":y,"orientation":o})).collect::<Vec<_>>()).map_err(|_|bad)
}
fn landscape_area_candidate(profile:&[u8],plan:&Value)->Result<String,CodecError>{
 use zeroize::{Zeroize,Zeroizing};
 use ddv_save_patch::{preview_plain_grid_structure,PlainGridStructureAction,preview_landscape_place_with_mode};
 let bad=CodecError::Json;
 let free=landscape_free_mode(plan)?;
 let p=plan.as_object().filter(|p|p.len()==3+(free as usize)&&p.keys().all(|k|matches!(k.as_str(),"destination"|"before"|"after"|"freePlacement"))).ok_or(bad)?;
 let witness=p.get("destination").ok_or(bad)?;
 let d=landscape_destination(profile,witness)?;
 let before=landscape_poses(p.get("before").ok_or(bad)?,&d,free)?;let after=landscape_poses(p.get("after").ok_or(bad)?,&d,free)?;
 let actual=landscape_observed(profile,&d)?;
 let count=|rows:&[LandscapePose]|{let mut m=HashMap::<LandscapePose,usize>::new();for p in rows{*m.entry(*p).or_default()+=1;}m};
 let old=count(&before);let next=count(&after);
 let mut removed=Vec::new();let mut ids=Vec::new();let mut added=Vec::new();
 for (p,n) in &old{
  let keys=actual.get(p).filter(|v|v.len()==*n).ok_or(bad)?;
  let mut keys=keys.clone();keys.sort_unstable_by_key(|s|key_id(s).unwrap_or(0));
  let keep=(*n).min(*next.get(p).unwrap_or(&0));
  for key in keys.into_iter().skip(keep){removed.push(*p);ids.push(key);}
 }
 for (p,n) in &next{for _ in 0..n.saturating_sub(*old.get(p).unwrap_or(&0)){added.push(*p);}}
 // Sort additions to make allocator results deterministic across runs.
 added.sort_unstable();
 if removed.len()+added.len()>2048{return Err(CodecError::Bounds);}
 if !ids.chunks(512).all(|chunk|grid_identity_dependencies_for_ids(profile,&d.grid_id,chunk).is_ok_and(|r|r.blocking()==0&&r.historical==0)){return Err(bad);}
 let mut working=Zeroizing::new(std::str::from_utf8(profile).map_err(|_|bad)?.to_owned());
 for (p,key) in removed.into_iter().zip(ids){
  let target=GridCoordinateTarget{kind:GridObjectKind::Full,grid_id:d.grid_id.clone(),object_id:key,item_id:p.0};
  let draft=preview_plain_grid_structure(&working,&target,(p.1,p.2),PlainGridStructureAction::Remove).map_err(|_|bad)?;
  working.zeroize();*working=draft.patched_json;
 }
 for p in added{
  let dest=resolve_plain_grid_destination(working.as_bytes(),witness)?;
  let draft=preview_landscape_place_with_mode(&working,&dest,p.0,(p.1,p.2),landscape_orientation(p.3),free).map_err(|_|bad)?;
  working.zeroize();*working=draft.patched_json;
 }
 Ok(std::mem::take(&mut *working))
}

pub(super) fn biome_network_candidate(profile:&[u8],plan:&str)->Result<String,CodecError>{
 use zeroize::Zeroize;
 let bad=CodecError::Json;
 if plan.len()>2_000_000{return Err(CodecError::Bounds);}
 let v:Value=serde_json::from_str(plan).map_err(|_|bad)?;
 let o=v.as_object().filter(|o|o.len()==3&&o.keys().all(|k|matches!(k.as_str(),"destination"|"before"|"after"))).ok_or(bad)?;
 let d=area_network_destination(profile,o.get("destination").ok_or(bad)?)?;
 let actual=area_network_rows(profile,&d)?;
 let before=parse_area_network_poses(o.get("before").ok_or(bad)?)?;
 let after=parse_area_network_poses(o.get("after").ok_or(bad)?)?;
 if parse_area_network_poses(&Value::Array(actual))?.into_iter().collect::<HashSet<_>>()!=before.iter().copied().collect(){return Err(bad);}
 let mut result=ddv_save_patch::preview_area_network_replacement(std::str::from_utf8(profile).map_err(|_|bad)?,&d,&before,&after).map_err(|_|bad)?;
 let ids:Vec<_>=result.removed.iter().chain(&result.allocated).cloned().collect();
 if !ids.chunks(512).all(|chunk|grid_identity_dependencies_for_ids(profile,&d.grid_id,chunk).is_ok_and(|r|r.blocking()==0&&r.historical==0)){result.draft.patched_json.zeroize();return Err(bad);}
 Ok(result.draft.patched_json)
}

/// One transaction for ordinary furniture and complete native networks.
/// Ordinals are resolved against the immutable original before removing
/// any other object. Network mutations occur before furniture placement,
/// so a furniture pose may occupy a previously removed fence anchor.
/// Count roots and descendants on both sides of a complete area change.
fn check_area_support_change_count(profile:&[u8],remove:&[Value],add:&[Value])->Result<(),CodecError>{
 let bad=CodecError::Json;
 let mut total=remove.len()+add.len();
 if total>MAX_AREA_FURNITURE_CHANGES{return Err(CodecError::Bounds);}
 fn count(t:&Value,total:&mut usize,depth:usize)->Result<(),CodecError>{
  if depth>8{return Err(CodecError::Bounds);}
  for o in t.get("objects").and_then(Value::as_array).ok_or(CodecError::Json)?{
   *total+=1;if *total>MAX_AREA_FURNITURE_CHANGES{return Err(CodecError::Bounds);}
   let c=o.get("child").ok_or(CodecError::Json)?;if !c.is_null(){count(c,total,depth+1)?;}
  }Ok(())
 }
 if remove.iter().any(|r|r.get("includeSupport").and_then(Value::as_bool)==Some(true)){
  let (scan,_)=scan_grid_instances(profile)?;if scan.sampled||scan.invalid>0{return Err(bad);}
  let root:Value=serde_json::from_slice(profile).map_err(|_|bad)?;
  let c=root.get("World").and_then(|v|v.get("GridCollection")).and_then(Value::as_object).ok_or(bad)?;
  for r in remove.iter().filter(|r|r.get("includeSupport").and_then(Value::as_bool)==Some(true)){
   let n=r.get("localOrdinal").and_then(Value::as_u64).and_then(|n|usize::try_from(n).ok()).filter(|n|*n>0).ok_or(bad)?;
   let (target,_)=scan.private_targets.get(n-1).ok_or(bad)?;
   count(&subgrid_tree(c,&target.grid_id,&target.object_id)?,&mut total,0)?;
  }
 }
 for row in add{if let Some(scene)=row.get("scene"){let item=row.get("itemId").and_then(Value::as_str).and_then(|s|s.parse::<u64>().ok()).ok_or(bad)?;count(checked_support_scene(item,scene)?,&mut total,0)?;}}
 Ok(())
}
pub(super) fn biome_decoration_candidate(profile:&[u8],plan:&str)->Result<String,CodecError>{
 use zeroize::{Zeroize,Zeroizing};
 let bad=CodecError::Json;
 if plan.len()>2_000_000{return Err(CodecError::Bounds);}
 let v:Value=serde_json::from_str(plan).map_err(|_|bad)?;
 let o=v.as_object().filter(|o|o.keys().all(|k|matches!(k.as_str(),"furniture"|"network"|"landscape"|"buildings"))).ok_or(bad)?;
 let f=o.get("furniture").and_then(Value::as_object).filter(|m|m.len()==3&&m.keys().all(|k|matches!(k.as_str(),"destination"|"remove"|"add"))).ok_or(bad)?;
 let n=o.get("network").and_then(Value::as_object).filter(|m|m.len()==3&&m.keys().all(|k|matches!(k.as_str(),"destination"|"before"|"after"))).ok_or(bad)?;
 let witness=f.get("destination").ok_or(bad)?;
 if n.get("destination")!=Some(witness){return Err(bad);}
 if island_scope(witness).is_ok(){return Err(bad);}
 let dest=area_network_destination(profile,witness)?;
 let remove=f.get("remove").and_then(Value::as_array).ok_or(bad)?;
 let add=f.get("add").and_then(Value::as_array).ok_or(bad)?;
 if remove.len()+add.len()>MAX_AREA_FURNITURE_CHANGES||add.iter().any(|a|a.get("destination")!=Some(witness)){return Err(bad);}
 let before=parse_area_network_poses(n.get("before").ok_or(bad)?)?;
 let after=parse_area_network_poses(n.get("after").ok_or(bad)?)?;
 let actual=parse_area_network_poses(&Value::Array(area_network_rows(profile,&dest)?))?;
 let old:HashSet<_>=before.iter().copied().collect();
 let desired:HashSet<_>=after.iter().copied().collect();
 if old.len()!=before.len()||desired.len()!=after.len()||actual.len()!=old.len()||actual.into_iter().collect::<HashSet<_>>()!=old{return Err(bad);}
 ddv_save_patch::validate_area_network(&dest,&before).map_err(|_|bad)?;
 ddv_save_patch::validate_area_network(&dest,&after).map_err(|_|bad)?;
 let landscape=o.get("landscape");if landscape.is_some_and(|l|l.get("destination")!=Some(witness)){return Err(bad);}
 let buildings=o.get("buildings");if buildings.is_some_and(|l|l.get("destination")!=Some(witness)){return Err(bad);}
 if old==desired&&remove.is_empty()&&add.is_empty()&&landscape.is_none_or(|l|l["before"]==l["after"])&&buildings.is_none(){return Err(bad);}
 check_area_support_change_count(profile,remove,add)?;
 let mut working=Zeroizing::new(std::str::from_utf8(profile).map_err(|_|bad)?.to_owned());
 if !remove.is_empty(){
  let next=group_pickup_bounded(profile,&serde_json::to_string(remove).map_err(|_|bad)?,1,Some(&dest.grid_id),MAX_AREA_FURNITURE_CHANGES)?;
  working.zeroize();*working=next;
 }
 if let Some(l)=landscape{let next=landscape_area_candidate(working.as_bytes(),l)?;working.zeroize();*working=next;}
 if let Some(b)=buildings{let next=building_layout_candidate_scoped(working.as_bytes(),std::slice::from_ref(b),false)?;working.zeroize();*working=next;}
 if old!=desired{
  let next=biome_network_candidate(working.as_bytes(),&serde_json::to_string(n).map_err(|_|bad)?)?;
  working.zeroize();*working=next;
 }
 if !add.is_empty(){
  let next=if add.iter().any(|r|r.get("scene").is_some()){mixed_scene_bounded(working.as_bytes(),&Value::Array(add.clone()),MAX_AREA_FURNITURE_CHANGES)}else{plain_group_paste_bounded(working.as_bytes(),&serde_json::to_string(add).map_err(|_|bad)?,MAX_AREA_FURNITURE_CHANGES)}?;
  working.zeroize();*working=next;
 }
 Ok(std::mem::take(&mut *working))
}

#[cfg(test)]
mod biome_decoration_tests{
 use super::*;
 #[test]
 fn free_landscape_area_restore_preserves_multiplicity_and_retained_identity(){
  let layout="SceneLayouts/Village04/DefaultVillageLayout01-MeadowGrids.json";
  let data="GridData/Villages/Village04-MeadowLevel-GridData.json";
  let raw=serde_json::json!({"GameInfo":{"Version":643},"Player":{"Keep":7},"World":{"GridCollection":{"Grids":{"42":{"ID":42,"GridDefaultLayoutPath":layout,"GridDataPath":data,"TessellationFactor":1,"NextGridObjectID":5,"Objects":{"1":{"ID":1,"ItemID":40200001,"X":1,"Y":1,"Orientation":"GridOrientation_Down","State":null},"2":{"ID":2,"ItemID":40200001,"X":1,"Y":1,"Orientation":"GridOrientation_Down"},"3":{"ID":3,"ItemID":40200002,"X":1,"Y":1,"Orientation":"GridOrientation_Down"}}}}}}});
  let dest=serde_json::json!({"layoutId":layout,"gridDataPath":data,"factor":1,"sizeX":196,"sizeY":100});
  let bytes=serde_json::to_vec(&raw).unwrap();
  let before:Value=serde_json::from_str(&inspect_area_landscape(&bytes,&dest.to_string()).unwrap()).unwrap();
  assert_eq!(before.as_array().unwrap().len(),3);
  let a=serde_json::json!({"itemId":40200001,"x":1,"y":1,"orientation":2});
  let b=serde_json::json!({"itemId":40200002,"x":1,"y":1,"orientation":2});
  let mut plan=serde_json::json!({"destination":dest,"before":before,"after":[a.clone(),b.clone(),b.clone()]});
  assert!(landscape_area_candidate(&bytes,&plan).is_err());
  plan["freePlacement"]=true.into();
  let result:Value=serde_json::from_str(&landscape_area_candidate(&bytes,&plan).unwrap()).unwrap();
  let map=&result["World"]["GridCollection"]["Grids"]["42"]["Objects"];
  assert_eq!(map["1"],raw["World"]["GridCollection"]["Grids"]["42"]["Objects"]["1"]);
  assert!(map.get("2").is_none());assert_eq!(map["3"],raw["World"]["GridCollection"]["Grids"]["42"]["Objects"]["3"]);
  assert_eq!(map["5"]["ItemID"],40200002);assert_eq!(result["Player"],raw["Player"]);
  let observed:Value=serde_json::from_str(&inspect_area_landscape(&serde_json::to_vec(&result).unwrap(),&dest.to_string()).unwrap()).unwrap();
  assert_eq!(observed,plan["after"]);
  plan["before"]=serde_json::json!([a,b]);assert!(landscape_area_candidate(&bytes,&plan).is_err());
 }
 #[test]
 fn free_landscape_placement_and_duplication_allow_shared_anchor_without_stock_changes(){
  let layout="SceneLayouts/Village04/DefaultVillageLayout01-MeadowGrids.json";
  let data="GridData/Villages/Village04-MeadowLevel-GridData.json";
  let raw=serde_json::json!({"GameInfo":{"Version":643},"Player":{"Keep":7},"World":{"GridCollection":{"Grids":{"42":{"ID":42,"GridDefaultLayoutPath":layout,"GridDataPath":data,"TessellationFactor":1,"NextGridObjectID":5,"Objects":{"1":{"ID":1,"ItemID":40200001,"X":1,"Y":1,"Orientation":"GridOrientation_Down"}}}}}}});
  let dest=serde_json::json!({"layoutId":layout,"gridDataPath":data,"factor":1,"sizeX":196,"sizeY":100});
  let bytes=serde_json::to_vec(&raw).unwrap();
  let mut place=serde_json::json!({"action":"place","itemId":"40200002","x":1,"y":1,"orientation":"GridOrientation_Down"});
  assert!(landscape_candidate(&bytes,&place.to_string(),&dest.to_string()).is_err());
  place["freePlacement"]=true.into();
  let placed:Value=serde_json::from_str(&landscape_candidate(&bytes,&place.to_string(),&dest.to_string()).unwrap()).unwrap();
  assert_eq!(placed["Player"],raw["Player"]);
  assert_eq!(placed["World"]["GridCollection"]["Grids"]["42"]["Objects"]["1"],raw["World"]["GridCollection"]["Grids"]["42"]["Objects"]["1"]);
  assert_eq!(placed["World"]["GridCollection"]["Grids"]["42"]["Objects"]["5"]["ItemID"],40200002);
  let mut dup=serde_json::json!({"action":"duplicate","itemId":"40200001","localOrdinal":1,"expectedX":1,"expectedY":1,"x":1,"y":1});
  assert!(landscape_candidate(&bytes,&dup.to_string(),&dest.to_string()).is_err());
  dup["freePlacement"]=true.into();
  let copied:Value=serde_json::from_str(&landscape_candidate(&bytes,&dup.to_string(),&dest.to_string()).unwrap()).unwrap();
  assert_eq!(copied["Player"],raw["Player"]);assert_eq!(copied["World"]["GridCollection"]["Grids"]["42"]["Objects"]["5"]["ItemID"],40200001);
  assert_eq!(copied["World"]["GridCollection"]["Grids"]["42"]["NextGridObjectID"],6);
  dup["x"]=196.into();assert!(landscape_candidate(&bytes,&dup.to_string(),&dest.to_string()).is_err());
  dup["x"]=1.into();dup["freePlacement"]="true".into();assert!(landscape_candidate(&bytes,&dup.to_string(),&dest.to_string()).is_err());
 }
 #[test]
 fn floating_landscape_uses_exact_source_grid_and_preserves_other_island_planes(){
  let layout="SceneLayouts/FloatingIslands/FloatingIsland_Atlantean/FloatingIsland_AtlanteanLayout.json";
  let data="GridData/FloatingIslands/FloatingIsland_Atlantean/FloatingIsland_AtlanteanGrid-GridData.json";
  let water="GridData/FloatingIslands/FloatingIsland_Atlantean/FloatingIsland_AtlanteanWaterGrid-GridData.json";
  let raw=serde_json::json!({"GameInfo":{"Version":643},"Player":{"Keep":7},"World":{"GridCollection":{"Grids":{"42":{"ID":42,"GridDefaultLayoutPath":layout,"GridDataPath":data,"NextGridObjectID":5,"Objects":{"1":{"ID":1,"ItemID":40200001,"X":1,"Y":1,"Orientation":"GridOrientation_Down"}}},"43":{"ID":43,"GridDefaultLayoutPath":layout,"GridDataPath":water,"NextGridObjectID":3,"Objects":{"1":{"ID":1,"ItemID":40200001,"X":1,"Y":1,"Orientation":"GridOrientation_Down"}}}}}}});
  let dest=serde_json::json!({"layoutId":layout,"gridDataPath":data,"factor":1,"sizeX":130,"sizeY":130});
  let bytes=serde_json::to_vec(&raw).unwrap();let before:Value=serde_json::from_str(&inspect_area_landscape(&bytes,&dest.to_string()).unwrap()).unwrap();
  assert_eq!(before.as_array().unwrap().len(),1);
  let mut plan=serde_json::json!({"destination":dest,"before":before,"after":[{"itemId":40200001,"x":2,"y":3,"orientation":2}]});
  let result:Value=serde_json::from_str(&landscape_area_candidate(&bytes,&plan).unwrap()).unwrap();
  let direct=serde_json::json!({"action":"place","itemId":"40200002","x":4,"y":4,"orientation":"GridOrientation_Down"});
  let placed:Value=serde_json::from_str(&landscape_candidate(&bytes,&direct.to_string(),&dest.to_string()).unwrap()).unwrap();
  assert_eq!(placed["Player"],raw["Player"]);assert_eq!(placed["World"]["GridCollection"]["Grids"]["42"]["Objects"]["5"]["ItemID"],40200002);assert_eq!(placed["World"]["GridCollection"]["Grids"]["43"],raw["World"]["GridCollection"]["Grids"]["43"]);
  assert_eq!(result["Player"],raw["Player"]);assert_eq!(result["World"]["GridCollection"]["Grids"]["43"],raw["World"]["GridCollection"]["Grids"]["43"]);
  assert_eq!(result["World"]["GridCollection"]["Grids"]["42"]["Objects"]["5"]["X"],2);
  plan["destination"]["sizeX"]=131.into();assert!(landscape_area_candidate(&bytes,&plan).is_err());
  plan["destination"]["sizeX"]=130.into();plan["destination"]["factor"]=2.into();assert!(landscape_area_candidate(&bytes,&plan).is_err());
 }
 #[test]
 fn combined_replacement_keeps_stock_and_native_retained_rows_and_rejects_stale_network(){
  let layout="SceneLayouts/Village04/DefaultVillageLayout01-MeadowGrids.json";
  let data="GridData/Villages/Village04-MeadowLevel-GridData.json";
  let raw=serde_json::json!({"GameInfo":{"Version":643},"Player":{"ListInventories":{"0":{"ID":0,"CompatibleItemType":"ItemType_Furniture","CompatibleFurnitureTypes":{"List":["FurnitureItemType_Default"]},"Inventory":{"40000001":{"Amount":0}}}}},"World":{"GridCollection":{"Grids":{"42":{"ID":42,"GridDefaultLayoutPath":layout,"GridDataPath":data,"TessellationFactor":1,"NextGridObjectID":5,"Objects":{"1":{"ID":1,"ItemID":40000001,"X":1,"Y":1,"Orientation":"GridOrientation_Down"},"2":{"ID":2,"ItemID":40100068,"X":4,"Y":4,"Orientation":"GridOrientation_Down","State":null},"3":{"ID":3,"ItemID":40100068,"X":6,"Y":4,"Orientation":"GridOrientation_Down","State":{"FenceMode":{"Diagonal":true}}}}},"43":{"ID":43,"GridDefaultLayoutPath":"SceneLayouts/Village04/A.json","GridDataPath":"GridData/A.json","NextGridObjectID":2,"Objects":{"1":{"ID":1,"ItemID":40000001,"X":1,"Y":1,"Orientation":"GridOrientation_Down","Unknown":123}}}}}}});
  let dest=serde_json::json!({"layoutId":layout,"gridDataPath":data,"factor":1,"sizeX":16,"sizeY":16});
  let before=serde_json::json!([{"itemId":40100068,"x":4,"y":4,"orientation":2,"network":{"kind":"road","diagonal":false}},{"itemId":40100068,"x":6,"y":4,"orientation":2,"network":{"kind":"road","diagonal":true}}]);
  let mut plan=serde_json::json!({"furniture":{"destination":dest,"remove":[{"localOrdinal":1,"itemId":"40000001","expectedX":1,"expectedY":1,"expectedOrientation":"GridOrientation_Down"}],"add":[{"itemId":"40000001","destination":dest,"x":6,"y":4,"orientation":"GridOrientation_Left"}]},"network":{"destination":dest,"before":before,"after":[before[0].clone()]}});
  let bytes=serde_json::to_vec(&raw).unwrap();
  let result=biome_decoration_candidate(&bytes,&plan.to_string()).unwrap();
  let output:Value=serde_json::from_str(&result).unwrap();
  let old=&raw["World"]["GridCollection"]["Grids"];let new=&output["World"]["GridCollection"]["Grids"];
  assert_eq!(output["Player"],raw["Player"]);assert_eq!(new["43"],old["43"]);
  assert_eq!(new["42"]["Objects"]["2"],old["42"]["Objects"]["2"]);
  assert!(new["42"]["Objects"].get("1").is_none());assert!(new["42"]["Objects"].get("3").is_none());
  assert_eq!(new["42"]["Objects"]["5"]["X"],6);assert_eq!(new["42"]["NextGridObjectID"],6);
  plan["network"]["before"][1]["network"]["diagonal"]=Value::Bool(false);
  assert!(biome_decoration_candidate(&bytes,&plan.to_string()).is_err());
  plan["network"]["before"]=before;
  plan["furniture"]["add"][0]["itemId"]=Value::from("40000002");
  assert!(biome_decoration_candidate(&bytes,&plan.to_string()).is_err());
  assert_eq!(serde_json::from_slice::<Value>(&bytes).unwrap(),raw);
 }
}

#[cfg(test)]
mod complete_area_support_tests{
 use super::*;
 #[test]
 fn free_support_scene_root_can_overlap_without_changing_child_tree(){
  let layout="SceneLayouts/Village04/DefaultVillageLayout01-MeadowGrids.json";
  let data="GridData/Villages/Village04-MeadowLevel-GridData.json";
  let path="GridData/Furniture/NonIP_SetLess/CornerWallShelf01-GridData.json";
  let raw=serde_json::json!({"GameInfo":{"Version":643},"Player":{"ListInventories":{"0":{"ID":0,"CompatibleItemType":"ItemType_Furniture","CompatibleFurnitureTypes":{"List":["FurnitureItemType_Default"]},"Inventory":{"40005160":{"Amount":1},"40005161":{"Amount":1}}}}},"World":{"GridCollection":{"NextGridID":100,"Grids":{"42":{"ID":42,"GridDefaultLayoutPath":layout,"GridDataPath":data,"TessellationFactor":1,"NextGridObjectID":5,"Objects":{"1":{"ID":1,"ItemID":40005161,"X":4,"Y":4,"Orientation":"GridOrientation_Down"}}}}}}});
  let tree=serde_json::json!({"factor":2,"sourcePath":path,"objects":[{"itemId":40005161,"x":0,"y":0,"orientation":"GridOrientation_Down","child":null}]});
  let scene=serde_json::json!({"schema":"wand.preset.support-scene@1","gameVersion":"1.26.2","ownerItemId":40005160,"tree":tree});
  let rows=serde_json::json!([{"destination":{"layoutId":layout,"gridDataPath":data,"factor":1,"sizeX":196,"sizeY":100},"itemId":"40005160","x":4,"y":4,"orientation":"GridOrientation_Down","scene":scene}]);
  let input=raw.to_string();
  assert!(group_paste_candidate(input.as_bytes(),&rows.to_string()).is_err());
  let plan=serde_json::json!({"freePlacement":true,"rows":rows});
  let out:Value=serde_json::from_str(&group_paste_candidate(input.as_bytes(),&plan.to_string()).unwrap()).unwrap();
  let c=out["World"]["GridCollection"].as_object().unwrap();
  assert_eq!(subgrid_tree(c,"42","5").unwrap(),tree);
  assert_eq!(c["Grids"]["42"]["Objects"]["1"],raw["World"]["GridCollection"]["Grids"]["42"]["Objects"]["1"]);
  assert_eq!(c["NextGridID"],101);
  assert_eq!(out["Player"]["ListInventories"]["0"]["Inventory"]["40005161"]["Amount"],0);
  let mut invalid=plan.clone();invalid["rows"][0]["scene"]["tree"]["objects"][0]["x"]=999.into();
  assert!(group_paste_candidate(input.as_bytes(),&invalid.to_string()).is_err());
 }
 #[test]
 fn floating_free_scene_retains_other_plane_and_support_dependencies(){
  let layout="SceneLayouts/FloatingIslands/FloatingIsland_Atlantean/FloatingIsland_AtlanteanLayout.json";
  let data="GridData/FloatingIslands/FloatingIsland_Atlantean/FloatingIsland_AtlanteanGrid-GridData.json";
  let water="GridData/FloatingIslands/FloatingIsland_Atlantean/FloatingIsland_AtlanteanWaterGrid-GridData.json";
  let path="GridData/Furniture/NonIP_SetLess/CornerWallShelf01-GridData.json";
  let raw=serde_json::json!({"GameInfo":{"Version":643},"Player":{"ListInventories":{"0":{"ID":0,"CompatibleItemType":"ItemType_Furniture","CompatibleFurnitureTypes":{"List":["FurnitureItemType_Default"]},"Inventory":{"40005160":{"Amount":1},"40005161":{"Amount":2}}}}},"World":{"GridCollection":{"NextGridID":100,"Grids":{"42":{"ID":42,"GridDefaultLayoutPath":layout,"GridDataPath":data,"TessellationFactor":1,"NextGridObjectID":5,"Objects":{"1":{"ID":1,"ItemID":40005161,"X":4,"Y":4,"Orientation":"GridOrientation_Down"}}},"43":{"ID":43,"GridDefaultLayoutPath":layout,"GridDataPath":water,"NextGridObjectID":3,"Objects":{}}}}}});
  let tree=serde_json::json!({"factor":2,"sourcePath":path,"objects":[{"itemId":40005161,"x":0,"y":0,"orientation":"GridOrientation_Down","child":null}]});
  let scene=serde_json::json!({"schema":"wand.preset.support-scene@1","gameVersion":"1.26.2","ownerItemId":40005160,"tree":tree});
  let dest=serde_json::json!({"layoutId":layout,"gridDataPath":data,"factor":1,"sizeX":130,"sizeY":130});
  let rows=serde_json::json!([{"destination":dest,"itemId":"40005160","x":4,"y":4,"orientation":"GridOrientation_Down","scene":scene},{"destination":dest,"itemId":"40005161","x":4,"y":4,"orientation":"GridOrientation_Left"}]);
  let input=raw.to_string();
  assert!(group_paste_candidate(input.as_bytes(),&rows.to_string()).is_err());
  let mut plan=serde_json::json!({"freePlacement":true,"rows":rows});
  let out:Value=serde_json::from_str(&group_paste_candidate(input.as_bytes(),&plan.to_string()).unwrap()).unwrap();
  let c=out["World"]["GridCollection"].as_object().unwrap();
  assert_eq!(subgrid_tree(c,"42","5").unwrap(),tree);
  assert_eq!(c["Grids"]["42"]["Objects"]["6"]["X"],4);
  assert_eq!(c["Grids"]["43"],raw["World"]["GridCollection"]["Grids"]["43"]);
  assert_eq!(out["Player"]["ListInventories"]["0"]["Inventory"]["40005161"]["Amount"],0);
  plan["rows"][1]["orientation"]="GridOrientation_DownLeft".into();assert!(group_paste_candidate(input.as_bytes(),&plan.to_string()).is_err());
  plan["rows"][1]["orientation"]="GridOrientation_Down".into();plan["rows"][1]["destination"]["sizeX"]=131.into();assert!(group_paste_candidate(input.as_bytes(),&plan.to_string()).is_err());
  // The ordinary-furniture path must also reject a second forged witness.
  plan["rows"][0].as_object_mut().unwrap().remove("scene");
  assert!(group_paste_candidate(input.as_bytes(),&plan.to_string()).is_err());
  plan["rows"][1]["destination"]["sizeX"]=130.into();
  assert!(group_paste_candidate(input.as_bytes(),&plan.to_string()).is_ok());
 }
 #[test]
 fn biome_support_replacement_restores_tree_and_stock_in_one_candidate(){
  let layout="SceneLayouts/Village04/DefaultVillageLayout01-MeadowGrids.json";
  let data="GridData/Villages/Village04-MeadowLevel-GridData.json";
  let path="GridData/Furniture/NonIP_SetLess/CornerWallShelf01-GridData.json";
  let raw=serde_json::json!({"GameInfo":{"Version":643},"Player":{"ListInventories":{"0":{"ID":0,"CompatibleItemType":"ItemType_Furniture","CompatibleFurnitureTypes":{"List":["FurnitureItemType_Default"]},"Inventory":{"40005160":{"Amount":0},"40005161":{"Amount":0}}}}},"World":{"GridCollection":{"NextGridID":100,"Grids":{"42":{"ID":42,"GridDefaultLayoutPath":layout,"GridDataPath":data,"TessellationFactor":1,"NextGridObjectID":5,"Objects":{"1":{"ID":1,"ItemID":40005160,"X":1,"Y":1,"Orientation":"GridOrientation_Down","State":{"SubGrid":{"GridID":80}}}}},"80":{"ID":80,"GridDataPath":path,"TessellationFactor":2,"NextGridObjectID":2,"Objects":{"1":{"ID":1,"ItemID":40005161,"X":0,"Y":0,"Orientation":"GridOrientation_Down"}}},"43":{"ID":43,"GridDefaultLayoutPath":"SceneLayouts/Village04/A.json","GridDataPath":"GridData/A.json","NextGridObjectID":2,"Objects":{}}}}}});
  let dest=serde_json::json!({"layoutId":layout,"gridDataPath":data,"factor":1,"sizeX":16,"sizeY":16});
  let tree=serde_json::json!({"factor":2,"sourcePath":path,"objects":[{"itemId":40005161,"x":0,"y":0,"orientation":"GridOrientation_Down","child":null}]});
  let scene=serde_json::json!({"schema":"wand.preset.support-scene@1","gameVersion":"1.26.2","ownerItemId":40005160,"tree":tree});
  let plan=serde_json::json!({"furniture":{"destination":dest,"remove":[{"localOrdinal":1,"itemId":"40005160","expectedX":1,"expectedY":1,"expectedOrientation":"GridOrientation_Down","includeSupport":true}],"add":[{"destination":dest,"itemId":"40005160","x":4,"y":4,"orientation":"GridOrientation_Down","scene":scene}]},"network":{"destination":dest,"before":[],"after":[]}});
  let source=serde_json::to_vec(&raw).unwrap();
  let result=biome_decoration_candidate(&source,&plan.to_string()).unwrap();
  let result:Value=serde_json::from_str(&result).unwrap();
  let c=result["World"]["GridCollection"].as_object().unwrap();
  assert_eq!(result["Player"],raw["Player"]);assert!(c["Grids"].get("80").is_none());assert_eq!(c["NextGridID"],101);
  assert_eq!(c["Grids"]["43"],raw["World"]["GridCollection"]["Grids"]["43"]);
  assert_eq!(subgrid_tree(c,"42","5").unwrap(),tree);
  let mut bad=plan.clone();bad["furniture"]["add"][0]["scene"]["tree"]["objects"][0]["itemId"]=Value::from(40005162);
  assert!(biome_decoration_candidate(&source,&bad.to_string()).is_err());
 }
}

#[cfg(test)]
mod large_area_preset_tests{
 use super::*;
 #[test]
 fn area_replacement_exceeds_interactive_limit_and_rejects_late_invalid_placement(){
  let layout="SceneLayouts/Village04/DefaultVillageLayout01-MeadowGrids.json";
  let data="GridData/Villages/Village04-MeadowLevel-GridData.json";
  let raw=serde_json::json!({"GameInfo":{"Version":643},"Player":{"ListInventories":{"0":{"ID":0,"CompatibleItemType":"ItemType_Furniture","CompatibleFurnitureTypes":{"List":["FurnitureItemType_Default"]},"Inventory":{"40005160":{"Amount":520}}}}},"World":{"GridCollection":{"Grids":{"42":{"ID":42,"GridDefaultLayoutPath":layout,"GridDataPath":data,"TessellationFactor":1,"NextGridObjectID":1,"Objects":{}},"43":{"ID":43,"GridDefaultLayoutPath":"SceneLayouts/Village04/A.json","GridDataPath":"GridData/A.json","NextGridObjectID":2,"Objects":{}}}}}});
  let destination=serde_json::json!({"layoutId":layout,"gridDataPath":data,"factor":1,"sizeX":32,"sizeY":32});
  let add=(0..520).map(|i|serde_json::json!({"destination":destination,"itemId":"40005160","x":i%20+1,"y":i/20+1,"orientation":"GridOrientation_Down"})).collect::<Vec<_>>();
  let bytes=serde_json::to_vec(&raw).unwrap();
  assert!(plain_group_paste_candidate(&bytes,&serde_json::to_string(&add).unwrap()).is_err());
  let mut plan=serde_json::json!({"destination":destination,"remove":[],"add":add});
  let candidate=biome_furniture_candidate(&bytes,&plan.to_string()).unwrap();
  let result:Value=serde_json::from_str(&candidate).unwrap();
  assert_eq!(result["World"]["GridCollection"]["Grids"]["42"]["Objects"].as_object().unwrap().len(),520);
  assert_eq!(result["World"]["GridCollection"]["Grids"]["42"]["NextGridObjectID"],521);
  assert_eq!(result["Player"]["ListInventories"]["0"]["Inventory"]["40005160"]["Amount"],0);
  assert_eq!(result["World"]["GridCollection"]["Grids"]["43"],raw["World"]["GridCollection"]["Grids"]["43"]);
  plan["add"][519]["x"]=Value::from(32);
  assert!(biome_furniture_candidate(&bytes,&plan.to_string()).is_err());
  let remove=(1..=520).map(|i|{let obj=&result["World"]["GridCollection"]["Grids"]["42"]["Objects"][i.to_string()];(i,obj)}).collect::<Vec<_>>();
  // Native Save ordinals use lexical record order, not numeric IDs.
  let mut ids=remove;ids.sort_by_key(|(i,_)|i.to_string());
  let rows=ids.iter().enumerate().map(|(i,(_,obj))|serde_json::json!({"localOrdinal":i+1,"itemId":"40005160","expectedX":obj["X"],"expectedY":obj["Y"],"expectedOrientation":"GridOrientation_Down"})).collect::<Vec<_>>();
  let clear=serde_json::json!({"destination":destination,"remove":rows,"add":[]});
  let returned:Value=serde_json::from_str(&biome_furniture_candidate(candidate.as_bytes(),&clear.to_string()).unwrap()).unwrap();
  assert_eq!(returned["Player"],raw["Player"]);assert!(returned["World"]["GridCollection"]["Grids"]["42"]["Objects"].as_object().unwrap().is_empty());
 }
}
