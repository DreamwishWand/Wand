//! Current Steam 1.26.2 native field projection. Exact dump.cs SHA256
//! 0ebf1de44c236a59703a5f09aa702f2acf2369e77b9f399ea792db58a0270d08.
//! Never interpret 3D positions as a flat image or expose account provenance.
use serde_json::{json,Value};
use std::collections::BTreeSet;
fn item(v:&Value,sub:u32)->Option<u32>{
 let n=u32::try_from(v.as_u64()?).ok()?;
 (n/10_000_000==10&&(n/100_000)%100==sub&&n>0).then_some(n)
}
fn color(v:&Value)->Option<&str>{
 let s=v.as_str()?;
 (matches!(s.len(),7|9)&&s.starts_with('#')&&s[1..].bytes().all(|b|b.is_ascii_hexdigit())).then_some(s)
}
fn valid_color(v:Option<&Value>)->bool{v.is_none_or(|v|v.as_str()==Some("")||color(v).is_some())}
fn number(v:&Value)->bool{v.as_f64().is_some_and(|n|n.is_finite()&&n.abs()<=f32::MAX as f64)}
fn vec3(v:&Value)->bool{
 v.is_null()||v.as_object().is_some_and(|m|m.iter().all(|(k,v)|matches!(k.as_str(),"X"|"Y"|"Z")&&number(v)))
}
pub(super) fn source(v:&Value)->Option<u32>{
 match (v.as_u64(),v.as_str()){
  (Some(0),_)|(_,Some("Unknown"|"DesignSource_Unknown"))=>Some(0),
  (Some(1),_)|(_,Some("Player"|"DesignSource_Player"))=>Some(1),
  (Some(2),_)|(_,Some("Boutique"|"DesignSource_Boutique"))=>Some(2),
  _=>None
 }
}
pub(super) struct Visual{pub detail:Value,pub refs:BTreeSet<(u32,u32)>,pub complete:bool}
pub(super) fn inspect(p:&Value)->Visual{
 let mut complete=p.as_object().is_some_and(|m|m.keys().all(|k|matches!(k.as_str(),"Id"|"Item"|"BaseColor"|"Decals"|"Textures"|"Platform"|"PlatformAccountId"|"CreatorDisplayName"|"EditedBy"|"Source")));
 let mut refs=BTreeSet::new();let mut decals=Vec::new();let mut textures=Vec::new();
 if !valid_color(p.get("BaseColor")){complete=false;}
 let base_color=color(&p["BaseColor"]);
 let mut decal_count=None;let mut texture_count=None;
 match p.get("Decals"){
  Some(Value::Array(rows)) if rows.len()<=1024=>{
   decal_count=Some(rows.len());
   for (i,row) in rows.iter().enumerate(){
    let valid=row.as_object().is_some_and(|m|m.iter().all(|(k,v)|match k.as_str(){
     "DecalItem"=>item(v,0).is_some(),"Color"=>valid_color(Some(v)),"Position"|"Rotation"=>vec3(v),
     "Roll"|"Size"|"Glossiness"=>number(v),"Flipped"|"Cutout"|"SeeThrough"|"UVSpace"|"Repeat"|"Metalness"=>v.is_boolean(),_=>false
    }));
    if !valid{complete=false;}
    let Some(id)=item(&row["DecalItem"],0) else{complete=false;continue;};refs.insert((id,0));
    decals.push(json!({"layer":i+1,"itemId":id,"color":color(&row["Color"]),"uvSpace":row["UVSpace"].as_bool(),"repeat":row["Repeat"].as_bool(),"flipped":row["Flipped"].as_bool()}));
   }
  }
  _=>complete=false
 }
 match p.get("Textures"){
  Some(Value::Null)=>texture_count=Some(0),
  Some(Value::Object(m))=>{
   if m.keys().any(|k|!matches!(k.as_str(),"TextureA"|"TextureB")){complete=false;}
   let mut count=0;
   for (i,key) in ["TextureA","TextureB"].iter().enumerate(){
    let Some(row)=m.get(*key) else{continue;};if row.is_null(){continue;}
    let valid=row.as_object().is_some_and(|m|m.iter().all(|(k,v)|match k.as_str(){
     "TextureItem"=>item(v,1).is_some(),"Color1"|"Color2"|"Color3"=>valid_color(Some(v)),
     "Glossiness"|"Rotation"|"Size"=>number(v),"Metalness"=>v.is_boolean(),_=>false
    }));
    if !valid{complete=false;}
    let Some(id)=item(&row["TextureItem"],1) else{complete=false;continue;};count+=1;refs.insert((id,1));
    textures.push(json!({"layer":i+1,"itemId":id,"colors":[color(&row["Color1"]),color(&row["Color2"]),color(&row["Color3"])]}));
   }
   texture_count=Some(count);
  }
  _=>complete=false
 }
 Visual{detail:json!({"baseColor":base_color,"decals":decals,"textures":textures,"decalCount":decal_count,"textureCount":texture_count,"source":source(&p["Source"]),"complete":complete,"renderedAppearanceVerified":false}),refs,complete}
}
#[cfg(test)]
mod tests{
 use super::*;
 #[test]fn projects_current_texture_slots_not_array(){
  let p=json!({"Id":4,"Item":40000001,"BaseColor":"#ff9933","Decals":[{"DecalItem":100000775,"Color":"#123456","Position":{"X":1.0,"Y":0.0,"Z":-1.0},"UVSpace":true}],"Textures":{"TextureA":{"TextureItem":100100001,"Color1":"#abcdef"},"TextureB":null},"PlatformAccountId":"PRIVATE","Source":"Boutique"});
  let v=inspect(&p);assert!(v.complete);assert_eq!(v.detail["textureCount"],1);assert_eq!(v.detail["decalCount"],1);assert_eq!(v.detail["source"],2);assert_eq!(v.refs.len(),2);assert!(!v.detail.to_string().contains("PRIVATE"));
  let mut p=p;p["Textures"]=json!([]);assert!(!inspect(&p).complete);
 }
}
