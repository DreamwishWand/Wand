//! Local native template reader. Only exact Steam source hashes are accepted.
use crate::CodecError;
use serde_json::{Value,Map,json};
use sha2::{Sha256,Digest};
const BAD:CodecError=CodecError::Json;
#[derive(Clone,Copy)]
enum Wire<'a>{Int(u64),Bytes(&'a[u8])}
type Fields<'a>=Vec<(u64,Wire<'a>)>;
fn varint(bytes:&mut &[u8])->Result<u64,CodecError>{
 let mut n=0u64;
 for i in 0..10{let (&b,rest)=bytes.split_first().ok_or(BAD)?;*bytes=rest;
  if i==9&&b>1{return Err(BAD);}n|=u64::from(b&127)<<(7*i);if b<128{return Ok(n);}}
 Err(BAD)
}
fn fields<'a>(mut b:&'a[u8],allowed:&[(u64,u64)])->Result<Fields<'a>,CodecError>{
 let mut out=Vec::new();
 while !b.is_empty(){let tag=varint(&mut b)?;let (n,w)=(tag>>3,tag&7);if !allowed.contains(&(n,w))||out.len()>=2048{return Err(BAD);}
 let v=match w{0=>Wire::Int(varint(&mut b)?),2=>{let l=usize::try_from(varint(&mut b)?).map_err(|_|BAD)?;if l>b.len(){return Err(BAD);}let (a,r)=b.split_at(l);b=r;Wire::Bytes(a)},_=>return Err(BAD)};
 out.push((n,v));}
 Ok(out)
}
fn one<'a>(f:&Fields<'a>,n:u64)->Result<Option<Wire<'a>>,CodecError>{let mut a=f.iter().filter(|(k,_)|*k==n).map(|(_,v)|*v);let v=a.next();if a.next().is_some(){return Err(BAD);}Ok(v)}
fn int(f:&Fields,n:u64)->Result<u32,CodecError>{match one(f,n)?{None=>Ok(0),Some(Wire::Int(n))=>u32::try_from(n).map_err(|_|BAD),_=>Err(BAD)}}
fn signed(f:&Fields,n:u64)->Result<i32,CodecError>{match one(f,n)?{None=>Ok(0),Some(Wire::Int(v)) if v<=u32::MAX as u64||v>=u64::MAX-i32::MAX as u64=>Ok(v as i32),_=>Err(BAD)}}
fn bytes<'a>(v:Wire<'a>)->Result<&'a[u8],CodecError>{if let Wire::Bytes(b)=v{Ok(b)}else{Err(BAD)}}
fn required<'a>(f:&Fields<'a>,n:u64)->Result<&'a[u8],CodecError>{bytes(one(f,n)?.ok_or(BAD)?)}
fn string(f:&Fields,n:u64)->Result<String,CodecError>{match one(f,n)?{None=>Ok(String::new()),Some(v)=>Ok(std::str::from_utf8(bytes(v)?).map_err(|_|BAD)?.to_owned())}}
fn map<'a>(f:&Fields<'a>,n:u64,scalar:bool,decode:impl Fn(Wire<'a>)->Result<Value,CodecError>)->Result<Value,CodecError>{
 let mut out=Map::new();for (_,v) in f.iter().filter(|(k,_)|*k==n){
 let a=fields(bytes(*v)?,&[(1,0),(2,if scalar{0}else{2})])?;
 let k=int(&a,1)?.to_string();let val=decode(one(&a,2)?.ok_or(BAD)?)?;
 if out.insert(k,val).is_some(){return Err(BAD);}}
 Ok(Value::Object(out))
}
fn scalar(v:Wire)->Result<Value,CodecError>{if let Wire::Int(n)=v{Ok(json!(u32::try_from(n).map_err(|_|BAD)?))}else{Err(BAD)}}
fn room(v:Wire)->Result<Value,CodecError>{
 let f=fields(bytes(v)?,&[(1,2),(2,0),(3,2),(4,2),(5,0),(6,2),(8,0)])?;
 Ok(json!({"Name":string(&f,1)?,"FloorGridID":int(&f,2)?,"WallGridIDs":map(&f,3,true,scalar)?,
 "RoomPrefabAddress":string(&f,4)?,"Flooring":int(&f,5)?,"Wallpapers":map(&f,6,true,scalar)?,"Ceiling":int(&f,8)?}))
}
fn object(v:Wire)->Result<Value,CodecError>{
 const T:[&str;16]=["Up","UpUpRight","UpRight","UpRightRight","Right","DownRightRight","DownRight","DownDownRight","Down","DownDownLeft","DownLeft","DownLeftLeft","Left","UpLeftLeft","UpLeft","UpUpLeft"];
 let f=fields(bytes(v)?,&[(1,0),(2,0),(3,0),(4,0),(5,0),(6,2)])?;
 let turn=T.get(int(&f,5)? as usize).ok_or(BAD)?;
 let mut row=json!({"ID":int(&f,1)?,"ItemID":int(&f,2)?,"X":signed(&f,3)?,"Y":signed(&f,4)?,"Orientation":format!("GridOrientation_{}",turn)});
 if let Some(state)=one(&f,6)?{
  let s=fields(bytes(state)?,&[(1,2)])?;
  let sub=fields(required(&s,1)?,&[(1,0)])?;
  row["State"]=json!({"SubGrid":{"GridID":int(&sub,1)?,"DesignID":null}});
 }
 Ok(row)
}
fn grid(v:Wire)->Result<Value,CodecError>{
 let f=fields(bytes(v)?,&[(1,0),(2,2),(3,2),(4,0),(5,2),(6,0)])?;
 Ok(json!({"ID":int(&f,1)?,"GridDataPath":string(&f,2)?,"GridDefaultLayoutPath":string(&f,3)?,"TessellationFactor":int(&f,4)?,
 "Objects":map(&f,5,false,object)?,"NextGridObjectID":int(&f,6)?}))
}
fn decode(raw:&[u8],layout:&str)->Result<Value,CodecError>{
 let root=fields(raw,&[(1,2),(2,2)])?;
 let h=fields(required(&root,1)?,&[(1,2)])?;
 let mut floors=Vec::new();for (_,v) in h{let f=fields(bytes(v)?,&[(1,2)])?;floors.push(json!({"Rooms":map(&f,1,false,room)?}));}
 let c=fields(required(&root,2)?,&[(1,2),(3,0)])?;
 let grids=map(&c,1,false,grid)?;
 let count=grids.as_object().ok_or(BAD)?.values().map(|g|g["Objects"].as_object().map_or(0,|m|m.values().filter(|o|o.get("State").is_some()).count())).sum::<usize>();
 Ok(json!({"layoutPath":layout,"floors":floors,"grids":grids,"sourceNextGridID":int(&c,3)?,"stateFree":count==0,"stateFields":if count==0{json!({})}else{json!({"1":count})}}))
}
pub(super) fn verified_template(item:u64,hex:&str)->Result<Value,CodecError>{
 if hex.is_empty()||hex.len()>16384||hex.len()%2!=0||!hex.bytes().all(|b|b.is_ascii_hexdigit()){return Err(BAD);}
 let raw=(0..hex.len()).step_by(2).map(|i|u8::from_str_radix(&hex[i..i+2],16).map_err(|_|BAD)).collect::<Result<Vec<_>,_>>()?;
 let hash=format!("{:x}",Sha256::digest(&raw));
 let manifest:Value=serde_json::from_str(include_str!("../../../src/lib/world/player-house-source.json")).map_err(|_|BAD)?;
 let rows=manifest["templates"].as_array().ok_or(BAD)?;
 let mut matches=rows.iter().filter(|r|r["sha256"].as_str()==Some(hash.as_str())&&r["itemIds"].as_array().is_some_and(|a|a.iter().any(|v|v.as_u64()==Some(item))));
 let found=matches.next().ok_or(BAD)?;if matches.next().is_some(){return Err(BAD);}
 decode(&raw,found["layoutPath"].as_str().ok_or(BAD)?)
}
#[cfg(test)]
mod tests{
 use super::*;
 #[test]fn unverified_template_rejects_even_valid_wire(){assert!(verified_template(20500001,"0a001200").is_err());assert!(verified_template(20500001,"éé").is_err());}
 #[test]fn native_support_state_only(){
  let row=object(Wire::Bytes(&[0x10,0x01,0x32,0x04,0x0a,0x02,0x08,0x05])).unwrap();
  assert_eq!(row["State"]["SubGrid"]["GridID"],5);
  assert!(object(Wire::Bytes(&[0x32,0x02,0x5a,0x00])).is_err());
  assert!(object(Wire::Bytes(&[0x32,0x04,0x0a,0x02,0x10,0x01])).is_err());
 }
 #[test]fn bounded_wire(){assert!(fields(&[0x08,0x80],&[(1,0)]).is_err());assert!(fields(&[0x12,0xff],&[(2,2)]).is_err());assert!(fields(&[0x08,0x01],&[(2,0)]).is_err());}
}
