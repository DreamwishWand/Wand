//! Read only the bounded native avatar fields. No defaults or private names inferred.
use serde::Serialize;
use serde_json::{Value,Map};
use std::collections::BTreeMap;

const BRANCHES:[(&str,&str);4]=[("FemaleAvatar","female"),("MaleAvatar","male"),("FemaleMermaidAvatar","femaleMermaid"),("MaleMermaidAvatar","maleMermaid")];
#[derive(Debug,Serialize)]
#[serde(rename_all="camelCase")]
pub struct SavedAvatarAppearance{
    contract:&'static str,
    save_schema:Option<i64>,
    status:&'static str,
    active_is_male:Option<bool>,
    avatars:BTreeMap<&'static str,Value>,
    save_file_modified:bool,
    render_verified:bool,
}
fn i32_value(v:&Value)->Option<Value>{v.as_i64().and_then(|v|i32::try_from(v).ok()).map(Value::from)}
fn u32_value(v:&Value)->Option<Value>{v.as_u64().and_then(|v|u32::try_from(v).ok()).map(Value::from)}
fn finite_float(v:&Value)->Option<Value>{v.as_f64().filter(|v|v.is_finite()&&v.abs()<=f32::MAX as f64).map(Value::from)}
fn scalar_fields(src:&Map<String,Value>,keys:&[&str],parse:fn(&Value)->Option<Value>,out:&mut Map<String,Value>,invalid:&mut bool){
    for key in keys{if let Some(v)=src.get(*key){if let Some(x)=parse(v){out.insert((*key).into(),x);}else{*invalid=true;}}}
}
fn color_fields(v:&Value,id:&str,extras:bool,invalid:&mut bool)->Option<Value>{
    let Some(src)=v.as_object()else{*invalid=true;return None};
    let mut out=Map::new();
    scalar_fields(src,&[id,"ColorIndex1","ColorIndex2","ColorIndex3"],i32_value,&mut out,invalid);
    if extras{scalar_fields(src,&["Opacity","Gloss"],finite_float,&mut out,invalid);}
    Some(Value::Object(out))
}
fn bounded_map(v:&Value,max:usize,signed:bool,invalid:&mut bool,mut parse:impl FnMut(&Value,&mut bool)->Option<Value>)->Option<Value>{
    let Some(src)=v.as_object()else{*invalid=true;return None};
    if src.len()>max{*invalid=true;return None}
    let mut out=Map::new();
    for(k,v)in src{
        let valid=if signed{k.parse::<i32>().is_ok_and(|x|x.to_string()==*k)}else{k.parse::<u32>().is_ok_and(|x|x.to_string()==*k)};
        if !valid{*invalid=true;continue}
        if let Some(x)=parse(v,invalid){out.insert(k.clone(),x);}else{*invalid=true;}
    }
    Some(Value::Object(out))
}
fn branch(v:&Value,invalid:&mut bool)->Option<Value>{
    let Some(src)=v.as_object()else{*invalid=true;return None};
    let mut out=Map::new();
    scalar_fields(src,&["Id"],u32_value,&mut out,invalid);
    scalar_fields(src,&["SkinColorIndex","HairColorIndex","HairHighlightColor","BodyType","Form","SprintEffectID"],i32_value,&mut out,invalid);
    for key in ["Clothes","IncompatibleClothes","FaceType","ClothingCustomization"]{
        if let Some(v)=src.get(key){
            if let Some(x)=bounded_map(v,256,key=="ClothingCustomization",invalid,|v,_|i32_value(v)){out.insert(key.into(),x);}
        }
    }
    if let Some(v)=src.get("Eyeball"){if let Some(x)=color_fields(v,"EyeballItemID",false,invalid){out.insert("Eyeball".into(),x);}}
    if let Some(v)=src.get("Makeup"){if let Some(x)=bounded_map(v,64,false,invalid,|v,b|color_fields(v,"MakeupItemID",true,b)){out.insert("Makeup".into(),x);}}
    if let Some(v)=src.get("ClothingColorSettings"){
        if let Some(x)=bounded_map(v,256,true,invalid,|v,b|{
            let Some(src)=v.as_object()else{*b=true;return None};
            let mut out=Map::new();scalar_fields(src,&["Color1","Color2","Color3"],i32_value,&mut out,b);Some(Value::Object(out))
        }){out.insert("ClothingColorSettings".into(),x);}
    }
    Some(Value::Object(out))
}
pub fn inspect_avatar_appearance(root:&Value)->SavedAvatarAppearance{
    let version=root.pointer("/GameInfo/Version").and_then(Value::as_i64);
    let mut r=SavedAvatarAppearance{contract:"wand.avatar.raw-appearance@1",save_schema:version,status:"unsupported_schema",active_is_male:None,avatars:BTreeMap::new(),save_file_modified:false,render_verified:false};
    if !matches!(version,Some(626|643)){return r}
    let Some(player)=root.get("Player").and_then(Value::as_object)else{r.status="incompatible_structure";return r};
    let mut invalid=false;
    if let Some(v)=player.get("AvatarIsMale"){r.active_is_male=v.as_bool();invalid|=r.active_is_male.is_none();}
    for(key,role)in BRANCHES{if let Some(v)=player.get(key){if let Some(x)=branch(v,&mut invalid){r.avatars.insert(role,x);}}}
    r.status=if invalid{"partial_inconclusive"}else if r.avatars.is_empty()&&r.active_is_male.is_none(){"not_observed"}else{"observed"};
    r
}
#[cfg(test)]
mod tests{
 use super::*;use serde_json::json;
 #[test]fn four_native_branches_preserve_explicit_values(){
  let v=json!({"GameInfo":{"Version":643},"Player":{"Name":"PRIVATE","AvatarIsMale":false,"FemaleAvatar":{"BodyType":0,"Clothes":{"0":0,"19":50000001},"Eyeball":{"EyeballItemID":70000010,"ColorIndex2":-1},"Makeup":{"0":{"MakeupItemID":140000001,"Opacity":0.5}},"ClothingColorSettings":{"50000001":{"Color1":2}}},"MaleAvatar":{},"FemaleMermaidAvatar":{"Form":1},"MaleMermaidAvatar":{"SkinColorIndex":4}}});
  let old=v.clone();let out=serde_json::to_value(inspect_avatar_appearance(&v)).unwrap();
  assert_eq!(out["status"],"observed");assert_eq!(out["activeIsMale"],false);
  assert_eq!(out["avatars"]["female"]["BodyType"],0);assert_eq!(out["avatars"]["female"]["Clothes"]["19"],50000001);
  assert_eq!(out["avatars"]["female"]["Eyeball"]["ColorIndex2"],-1);assert!(out["avatars"]["female"].get("HairColorIndex").is_none());
  assert_eq!(out["avatars"]["femaleMermaid"]["Form"],1);assert_eq!(out["avatars"]["maleMermaid"]["SkinColorIndex"],4);
  assert!(!out.to_string().contains("PRIVATE"));assert_eq!(v,old);
 }
 #[test]fn absent_malformed_unsupported_fail_closed(){
  for(v,status)in[(json!({"GameInfo":{"Version":626},"Player":{}}),"not_observed"),(json!({"GameInfo":{"Version":643},"Player":{"AvatarIsMale":"false","MaleAvatar":{"Clothes":{"01":4},"BodyType":true}}}),"partial_inconclusive"),(json!({"GameInfo":{"Version":644},"Player":{"AvatarIsMale":true}}),"unsupported_schema")]{
   let r=inspect_avatar_appearance(&v);assert_eq!(r.status,status);assert_eq!(r.active_is_male,None);
  }
 }
}
