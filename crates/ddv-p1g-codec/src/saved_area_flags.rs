use crate::CodecError;
use serde_json::{Value,json};
use std::collections::BTreeMap;

// Read only the explicit stored flags. Missing / malformed / duplicate
// villages never become either unlocked or locked. Not a runtime predicate.
pub(super) fn saved_area_flags(profile:&[u8])->Result<String,CodecError>{
    let root:Value=serde_json::from_slice(profile).map_err(|_|CodecError::Json)?;
    let villages=root.get("World").and_then(|w|w.get("Villages")).and_then(Value::as_array).ok_or(CodecError::RequiredRoot)?;
    if villages.len()>256{return Err(CodecError::Bounds);}
    let mut scenes:BTreeMap<u32,Option<BTreeMap<u32,Option<bool>>>>=BTreeMap::new();
    for v in villages{
        let Some(scene)=v.get("SceneItemId").and_then(Value::as_u64).and_then(|id|u32::try_from(id).ok()) else{continue;};
        if scenes.contains_key(&scene){scenes.insert(scene,None);continue;}
        let Some(areas)=v.get("Areas").and_then(Value::as_object) else{scenes.insert(scene,None);continue;};
        if areas.len()>1024{return Err(CodecError::Bounds);}
        let mut result=BTreeMap::new();
        for (k,a) in areas{
            let Ok(id)=k.parse::<u32>() else{continue;};
            if id.to_string()!=*k{continue;}
            result.insert(id,a.get("Unlocked").and_then(Value::as_bool));
        }
        scenes.insert(scene,Some(result));
    }
    serde_json::to_string(&json!({"schema":"wand.db05.saved-area-flags@1","runtimeLockPredicateVerified":false,"scenes":scenes})).map_err(|_|CodecError::Json)
}
#[cfg(test)]
mod tests{
 use super::*;
 #[test]
 fn explicit_flags_only(){
    let raw=br#"{"World":{"Villages":[{"SceneItemId":1540000000,"Areas":{"0":{"Unlocked":true},"1":{"Unlocked":false},"2":{},"3":{"Unlocked":"false"},"04":{"Unlocked":true}}},{"SceneItemId":1540000101,"Areas":{"8":{"Unlocked":false}}}]}}"#;
    let r:Value=serde_json::from_str(&saved_area_flags(raw).unwrap()).unwrap();
    assert_eq!(r["scenes"]["1540000000"],json!({"0":true,"1":false,"2":null,"3":null}));
    assert_eq!(r["scenes"]["1540000101"],json!({"8":false}));
    assert_eq!(r["runtimeLockPredicateVerified"],false);
 }
 #[test]
 fn ambiguous_village_is_unknown(){
    let raw=br#"{"World":{"Villages":[{"SceneItemId":1540000000,"Areas":{"0":{"Unlocked":true}}},{"SceneItemId":1540000000,"Areas":{"0":{"Unlocked":false}}}]}}"#;
    let r:Value=serde_json::from_str(&saved_area_flags(raw).unwrap()).unwrap();
    assert!(r["scenes"]["1540000000"].is_null());
    assert!(saved_area_flags(br#"{"World":{}}"#).is_err());
 }
}
