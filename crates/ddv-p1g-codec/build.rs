use flate2::read::ZlibDecoder;
use serde_json::Value;
use sha2::{Digest,Sha256};
use std::{fs,io::Read,path::PathBuf};
fn decode64(s:&str)->Vec<u8>{
 let mut out=Vec::with_capacity(s.len()*3/4);
 assert_eq!(s.len()%4,0);
 let digit=|b:u8|match b{b'A'..=b'Z'=>b-b'A',b'a'..=b'z'=>b-b'a'+26,b'0'..=b'9'=>b-b'0'+52,b'+'=>62,b'/'=>63,b'='=>0,_=>panic!("invalid base64")};
 for (i,c) in s.as_bytes().chunks_exact(4).enumerate(){
  let pad=if c[2]==b'='{assert_eq!(c[3],b'=');2}else if c[3]==b'='{1}else{0};
  assert!(c[0]!=b'='&&c[1]!=b'='&&(pad==0||(i+1)*4==s.len()));
  let n=(u32::from(digit(c[0]))<<18)|(u32::from(digit(c[1]))<<12)|(u32::from(digit(c[2]))<<6)|u32::from(digit(c[3]));
  out.push((n>>16) as u8);if pad<2{out.push((n>>8) as u8);}if pad==0{out.push(n as u8);}
 }
 out
}
fn main(){
 let manifest=PathBuf::from(std::env::var_os("CARGO_MANIFEST_DIR").unwrap());
 let root=manifest.join("../..");
 // Reuse the pinned public DB03 objective reverse index. Only direct/alternative
 // candidate membership is compiled, never completion or mandatory status.
 let quests=root.join("static/guide/public/quest-target-reverse-1.26.2.json");
 println!("cargo:rerun-if-changed={}",quests.display());
 let quest_bytes=fs::read(quests).expect("public quest objective source");
 assert_eq!(format!("{:x}",Sha256::digest(&quest_bytes)),"967f1bc885a13ba5bdc99c4e965e1288b9227170f888e0ac85d944799cff6d20");
 let quest_source:Value=serde_json::from_slice(&quest_bytes).unwrap();
 assert_eq!(quest_source["schema"],"wand.db03.public-quest-target-reverse@1");
 let mut quest_items=std::collections::BTreeMap::<u64,std::collections::BTreeSet<u64>>::new();
 for (id,rows) in quest_source["items"].as_object().unwrap(){
  let item=id.parse::<u64>().unwrap();
  for row in rows.as_array().unwrap(){quest_items.entry(item).or_default().insert(row[0].as_str().unwrap().parse::<u64>().unwrap());}
 }
 assert_eq!(quest_items.len(),2551);
 fs::write(PathBuf::from(std::env::var_os("OUT_DIR").unwrap()).join("quest-target-items.json"),serde_json::to_vec(&quest_items).unwrap()).unwrap();
 let catalog=root.join("static/ddv/item-master-releases.json");
 let attributes=root.join("data/ddv/item-master/reviewed-structure-steam-1.26.2.json");
 println!("cargo:rerun-if-changed={}",catalog.display());
 println!("cargo:rerun-if-changed={}",attributes.display());
 let versions:Value=serde_json::from_slice(&fs::read(catalog).expect("public version catalog")).unwrap();
 let release=versions["releases"].as_array().unwrap().iter().find(|r|r["gameVersion"]=="1.26.2").unwrap();
 let bytes=fs::read(attributes).expect("pinned public reviewed structure");
 assert_eq!(format!("{:x}",Sha256::digest(&bytes)),release["complete"]["reviewedStructure"]["reviewed-structure"].as_str().unwrap());
 let source:Value=serde_json::from_slice(&bytes).unwrap();
 assert_eq!(source["schema"],"wand.item-master.reviewed-structure-groups@1");
 assert_eq!(source["gameVersion"],"1.26.2");
 // Reuse the SHA-verified DB01 field census. Only class-400 items with
 // GridAreaData and no reviewed interaction/special-state definition qualify.
 // A new unrecognized Furniture field is conservatively treated as special.
 let fields=source["fields"].as_object().unwrap();
 // Native ActivityItem membership from the existing pinned DB01 source.
 // GridAreaData is present for all 4050 ActivityItem definitions in 1.26.2.
 // This proves category membership, not safe pickup or state conversion.
 let activity=&fields["ActivityItem.GridAreaData"];
 assert_eq!(activity["category"],"ActivityItem");
 let mut raw=Vec::new();
 ZlibDecoder::new(decode64(activity["packed"].as_str().unwrap()).as_slice()).take(32*1024*1024).read_to_end(&mut raw).unwrap();
 let decoded:Value=serde_json::from_slice(&raw).unwrap();
 let pairs=decoded.as_array().unwrap();assert_eq!(pairs.len() as u64,activity["count"].as_u64().unwrap());
 let mut activity_ids=Vec::with_capacity(pairs.len());let mut id=0u64;
 for pair in pairs{id=id.checked_add(pair[0].as_u64().filter(|n|*n>0).unwrap()).unwrap();activity_ids.push(id);}
 fs::write(PathBuf::from(std::env::var_os("OUT_DIR").unwrap()).join("activity-item-source.json"),serde_json::to_vec(&activity_ids).unwrap()).unwrap();

 let mut geometry=std::collections::BTreeSet::<u64>::new();
 let mut special=std::collections::BTreeSet::<u64>::new();let mut support_extra=std::collections::BTreeSet::<u64>::new();
 for (key,entry) in fields{
  if !key.starts_with("Furniture."){continue;}
  assert_eq!(entry["category"],"Furniture");
  if matches!(key.as_str(),"Furniture.CatalogVisibilityConditions"|"Furniture.PriceOverride"|"Furniture.GridEditRestriction"|"Furniture.CollectionVisibility"){continue;}
  let mut raw=Vec::new();
  ZlibDecoder::new(decode64(entry["packed"].as_str().unwrap()).as_slice()).take(32*1024*1024).read_to_end(&mut raw).unwrap();
  let decoded:Value=serde_json::from_slice(&raw).unwrap();
  let pairs=decoded.as_array().unwrap();assert_eq!(pairs.len() as u64,entry["count"].as_u64().unwrap());
  let mut id=0u64;
  for pair in pairs{
   id=id.checked_add(pair[0].as_u64().filter(|n|*n>0).unwrap()).unwrap();
   if id/100_000!=400{continue;}
   if key=="Furniture.GridAreaData"{geometry.insert(id);}else{special.insert(id);if key!="Furniture.SubGrid"{support_extra.insert(id);}}
  }
 }
 assert!(geometry.len()>1000&&special.len()>100);
 let plain=geometry.difference(&special).copied().collect::<Vec<_>>();
 assert!(plain.len()>1000&&!plain.contains(&40000047));
 println!("cargo:warning=Source-backed plain furniture candidates: {}",plain.len());
 let out=PathBuf::from(std::env::var_os("OUT_DIR").unwrap());
 fs::write(out.join("plain-furniture-source.json"),serde_json::to_vec(&plain).unwrap()).unwrap();
 let entry=&source["fields"]["Furniture.Container"];
 assert_eq!(entry["category"],"Furniture");assert_eq!(entry["field"],"Container");assert_eq!(entry["declaredType"],"ContainerInteraction");
 let mut raw=Vec::new();ZlibDecoder::new(decode64(entry["packed"].as_str().unwrap()).as_slice()).take(32*1024*1024).read_to_end(&mut raw).unwrap();
 let decoded:Value=serde_json::from_slice(&raw).unwrap();
 let pairs=decoded.as_array().unwrap();assert_eq!(pairs.len() as u64,entry["count"].as_u64().unwrap());
 let mut rows=std::collections::BTreeMap::<u64,Value>::new();let mut id=0u64;
 for pair in pairs{
  let delta=pair[0].as_u64().filter(|n|*n>0).unwrap();id=id.checked_add(delta).unwrap();
  assert!(pair[1].is_object());if id/100_000==400{assert!(rows.insert(id,pair[1].clone()).is_none());}
 }
 assert_eq!(rows[&40000047]["DefaultContainerInventoryData"],"Furniture_16Slot");
 println!("cargo:warning=Verified storage ContainerInteraction rows: {}",rows.len());
 fs::write(PathBuf::from(std::env::var_os("OUT_DIR").unwrap()).join("storage-source.json"),serde_json::to_vec(&rows).unwrap()).unwrap();
 // Exact owner/path binding from the same pinned DB01 reviewed source.
 // Landscaping SubGrid definitions and other interaction kinds are excluded.
 let entry=&source["fields"]["Furniture.SubGrid"];
 assert_eq!(entry["category"],"Furniture");assert_eq!(entry["declaredType"],"SubGridInteraction");
 let mut raw=Vec::new();ZlibDecoder::new(decode64(entry["packed"].as_str().unwrap()).as_slice()).take(32*1024*1024).read_to_end(&mut raw).unwrap();
 let decoded:Value=serde_json::from_slice(&raw).unwrap();
 let pairs=decoded.as_array().unwrap();assert_eq!(pairs.len() as u64,entry["count"].as_u64().unwrap());
 let mut owners=std::collections::BTreeMap::<u64,String>::new();let mut id=0u64;
 for pair in pairs{
  id=id.checked_add(pair[0].as_u64().filter(|n|*n>0).unwrap()).unwrap();
  let m=pair[1].as_object().unwrap();
  if id/100_000!=400||!geometry.contains(&id)||m.len()!=1{continue;}
  let Some(path)=m.get("SubGridDataPath").and_then(Value::as_str)else{continue;};
  if path.starts_with("GridData/Furniture/")&&path.ends_with(".json")&&!path.contains("..")&&!path.contains('\\'){assert!(owners.insert(id,path.to_owned()).is_none());}
 }
 println!("cargo:warning=Verified support SubGridInteraction rows: {}",owners.len());
 fs::write(out.join("support-source.json"),serde_json::to_vec(&owners).unwrap()).unwrap();
 let init=owners.keys().filter(|id|!support_extra.contains(id)).copied().collect::<Vec<_>>();
 fs::write(out.join("support-initial-source.json"),serde_json::to_vec(&init).unwrap()).unwrap();
}
