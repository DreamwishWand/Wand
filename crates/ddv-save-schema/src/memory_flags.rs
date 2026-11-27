//! Exact native MapField<int,int> at /Player/MemoryShards. No interpretation,
//! no ownership mutation, no raw save or unrelated fields cross the Worker.
use serde::Serialize;
use serde_json::Value;
use std::collections::BTreeMap;
use crate::inspect_collection_discovery;

const MAX_ROWS:usize=4096;
const MAX_BYTES:usize=128*1024*1024;

#[derive(Debug,Serialize)]
#[serde(rename_all="camelCase")]
pub struct MemoryFlags {
    contract:&'static str,
    save_schema:Option<i64>,
    status:&'static str,
    entries:BTreeMap<i32,i32>,
    piece_bit_mapping_verified:bool,
    save_file_modified:bool,
}

pub fn inspect_memory_flags(root:&Value)->MemoryFlags {
    let version=root.pointer("/GameInfo/Version").and_then(Value::as_i64);
    let mut result=MemoryFlags{contract:"wand.memory.raw-flags@1",save_schema:version,
        status:"unsupported_schema",entries:BTreeMap::new(),piece_bit_mapping_verified:false,save_file_modified:false};
    if !matches!(version,Some(626|643)){return result;}
    let Some(raw)=root.pointer("/Player/MemoryShards") else {result.status="not_observed";return result;};
    let Some(map)=raw.as_object() else {result.status="incompatible_structure";return result;};
    if map.len()>MAX_ROWS{result.status="incompatible_structure";return result;}
    let mut invalid=false;
    for (key,value) in map {
        let id=key.parse::<i32>().ok().filter(|x|*x>0&&x.to_string()==*key);
        let flags=value.as_i64().and_then(|x|i32::try_from(x).ok());
        match (id,flags){
            (Some(id),Some(flags))=>{result.entries.insert(id,flags);},
            _=>invalid=true
        }
    }
    result.status=if invalid{"partial_inconclusive"}else if map.is_empty(){"observed_empty"}else{"observed"};
    result
}
/// Reuse a single strict-decoded JSON traversal for both projections.
#[cfg_attr(feature="wasm",wasm_bindgen::prelude::wasm_bindgen)]
pub fn probe_collection_read_projections_json(decoded_json:&str)->String{
    const ERROR:&str=r#"{"error":"SAVE_COLLECTION_READ_PROJECTIONS_INVALID"}"#;
    if decoded_json.len()>MAX_BYTES{return ERROR.to_owned();}
    let Ok(root)=serde_json::from_str::<Value>(decoded_json) else{return ERROR.to_owned();};
    serde_json::json!({"discovery":inspect_collection_discovery(&root),
        "memoryFlags":inspect_memory_flags(&root),"avatarAppearance":crate::avatar_appearance::inspect_avatar_appearance(&root)}).to_string()
}
#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn raw_flags_preserved_without_inventing_absent_entries(){
        let doc=json!({"GameInfo":{"Version":643},"Player":{"MemoryShards":{"130000001":1,"130000002":0,"130000003":-1,"130000004":1024,"0130000005":1,"130000006":true,"130000007":2147483648i64},"Private":"never-export"}});
        let before=doc.clone();
        let p=inspect_memory_flags(&doc);
        assert_eq!(p.status,"partial_inconclusive");
        assert_eq!(p.entries,BTreeMap::from([(130000001,1),(130000002,0),(130000003,-1),(130000004,1024)]));
        assert_eq!(doc,before);
        let output=probe_collection_read_projections_json(&doc.to_string());
        assert!(!output.contains("never-export"));
        assert!(!p.piece_bit_mapping_verified&&!p.save_file_modified);
    }
    #[test]
    fn missing_and_unsupported_are_not_zero(){
        for (doc,status) in [
            (json!({"GameInfo":{"Version":643},"Player":{}}),"not_observed"),
            (json!({"GameInfo":{"Version":626},"Player":{"MemoryShards":{}}}),"observed_empty"),
            (json!({"GameInfo":{"Version":643},"Player":{"MemoryShards":[]}}),"incompatible_structure"),
            (json!({"GameInfo":{"Version":644},"Player":{"MemoryShards":{"1":1}}}),"unsupported_schema")
        ]{
            let p=inspect_memory_flags(&doc);assert_eq!(p.status,status);assert!(p.entries.is_empty());
        }
    }
}
