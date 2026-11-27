use flate2::read::GzDecoder;
use serde_json::Value;
use sha2::{Digest,Sha256};
use std::{fs,io::Read,path::PathBuf};
fn main(){
 let manifest=PathBuf::from(std::env::var_os("CARGO_MANIFEST_DIR").unwrap());
 let root=manifest.join("../..");
 let catalog=root.join("static/ddv/item-master-releases.json");
 let attributes=root.join("data/ddv/item-master/source-attributes-steam-1.26.2.json.gz");
 println!("cargo:rerun-if-changed={}",catalog.display());
 println!("cargo:rerun-if-changed={}",attributes.display());
 let versions:Value=serde_json::from_slice(&fs::read(catalog).expect("public version catalog")).unwrap();
 let release=versions["releases"].as_array().unwrap().iter().find(|r|r["gameVersion"]=="1.26.2").unwrap();
 let complete=&release["complete"];
 let bytes=fs::read(attributes).expect("pinned public source attributes");
 assert_eq!(format!("{:x}",Sha256::digest(&bytes)),complete["attributesSha256"].as_str().unwrap());
 let mut raw=Vec::new();GzDecoder::new(bytes.as_slice()).take(128*1024*1024).read_to_end(&mut raw).unwrap();
 let source:Value=serde_json::from_slice(&raw).unwrap();
 assert_eq!(source["schema"],"wand.item-master.source-attributes@1");
 assert_eq!(source["gameVersion"],"1.26.2");
 assert_eq!(source["release"],complete["release"]);
 assert_eq!(source["masterArchiveSha256"],complete["archiveSha256"]);
 let mut rows=std::collections::BTreeMap::<u64,Value>::new();
 for pair in source["items"].as_array().unwrap(){
  let id=pair[0].as_u64().unwrap();
  if id/100_000==400{if let Some(c)=pair[1].get("Container"){assert!(rows.insert(id,c.clone()).is_none());}}
 }
 assert!(!rows.is_empty());
 fs::write(PathBuf::from(std::env::var_os("OUT_DIR").unwrap()).join("storage-source.json"),serde_json::to_vec(&rows).unwrap()).unwrap();
}
