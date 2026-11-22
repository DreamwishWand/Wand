//! Rust-first synthetic P1G codec lab. No production Save Editor export.
//! Only single-entry profile ZIP with no descriptor or ZIP64 is supported.
//! Never log decoded save contents or output bytes.
use aes::Aes256;
use aes::cipher::{BlockDecrypt,BlockEncrypt,KeyInit};
use aes::cipher::generic_array::GenericArray;
use crc32fast::hash as crc32;
use ddv_save_patch::validate_json_without_edit;
use flate2::{read::DeflateDecoder,write::DeflateEncoder,Compression};
use std::io::{Read,Write};

const KEY: &[u8;32]=b"b5qhh8saJ8UlDJUzTZXd2Tg6mbo8W8n5";
const LIMIT:usize=128*1024*1024;
const PROFILE:&[u8]=b"profile";
const LOCAL:u32=0x04034b50;
const CENTRAL:u32=0x02014b50;
const EOCD:u32=0x06054b50;

#[derive(Debug,Clone,Copy,PartialEq,Eq)]
pub enum CodecError {
    Bounds,Padding,ZipStructure,ZipUnsupported,ZipIntegrity,
    Utf8,Json,RequiredRoot,Patch,ReopenMismatch,
}
fn le16(b:&[u8],p:usize)->Result<u16,CodecError>{
    let x=b.get(p..p.checked_add(2).ok_or(CodecError::Bounds)?).ok_or(CodecError::Bounds)?;
    Ok(u16::from_le_bytes([x[0],x[1]]))
}
fn le32(b:&[u8],p:usize)->Result<u32,CodecError>{
    let x=b.get(p..p.checked_add(4).ok_or(CodecError::Bounds)?).ok_or(CodecError::Bounds)?;
    Ok(u32::from_le_bytes([x[0],x[1],x[2],x[3]]))
}
fn set32(b:&mut [u8],p:usize,v:u32)->Result<(),CodecError>{
    b.get_mut(p..p.checked_add(4).ok_or(CodecError::Bounds)?)
     .ok_or(CodecError::Bounds)?.copy_from_slice(&v.to_le_bytes());
    Ok(())
}
fn plus(a:usize,b:usize)->Result<usize,CodecError>{
    a.checked_add(b).ok_or(CodecError::Bounds)
}
fn ecb_decrypt(ciphertext:&[u8])->Result<Vec<u8>,CodecError>{
    if ciphertext.len()<16||ciphertext.len()>LIMIT||ciphertext.len()%16!=0{
        return Err(CodecError::Bounds);
    }
    let aes=Aes256::new(GenericArray::from_slice(KEY));
    let mut bytes=ciphertext.to_vec();
    for block in bytes.chunks_exact_mut(16){
        aes.decrypt_block(GenericArray::from_mut_slice(block));
    }
    let pad=*bytes.last().ok_or(CodecError::Padding)? as usize;
    if !(1..=16).contains(&pad)||pad>bytes.len()||
        !bytes[bytes.len()-pad..].iter().all(|b|*b as usize==pad){
        return Err(CodecError::Padding);
    }
    bytes.truncate(bytes.len()-pad);
    Ok(bytes)
}
fn ecb_encrypt(plain:&[u8])->Result<Vec<u8>,CodecError>{
    let pad=16-plain.len()%16;
    if plain.len()==0||plus(plain.len(),pad)?>LIMIT{return Err(CodecError::Bounds);}
    let mut bytes=plain.to_vec();
    bytes.resize(plain.len()+pad,pad as u8);
    let aes=Aes256::new(GenericArray::from_slice(KEY));
    for block in bytes.chunks_exact_mut(16){
        aes.encrypt_block(GenericArray::from_mut_slice(block));
    }
    Ok(bytes)
}
#[derive(Clone,Debug)]
struct Layout{
    method:u16,
    data_start:usize,
    data_end:usize,
    central:usize,
    eocd:usize,
}
fn zip_layout(zip:&[u8])->Result<Layout,CodecError>{
    if zip.len()<22{return Err(CodecError::ZipStructure);}
    let lower=zip.len().saturating_sub(22+65535);
    let mut found=None;
    for p in (lower..=zip.len()-22).rev(){
        if le32(zip,p)?==EOCD&&plus(p,plus(22,le16(zip,p+20)? as usize)?)?==zip.len(){
            found=Some(p);break;
        }
    }
    let e=found.ok_or(CodecError::ZipStructure)?;
    if le16(zip,e+4)?!=0||le16(zip,e+6)?!=0||
       le16(zip,e+8)?!=1||le16(zip,e+10)?!=1{return Err(CodecError::ZipUnsupported);}
    let c=le32(zip,e+16)? as usize;
    let central_len=le32(zip,e+12)? as usize;
    if plus(c,central_len)?!=e||le32(zip,c)?!=CENTRAL{
        return Err(CodecError::ZipStructure);
    }
    let flags=le16(zip,c+8)?;
    let method=le16(zip,c+10)?;
    if flags & !0x0800!=0||!matches!(method,0|8)||le16(zip,c+34)?!=0{
        return Err(CodecError::ZipUnsupported);
    }
    let compressed=le32(zip,c+20)? as usize;
    let raw_size=le32(zip,c+24)? as usize;
    if raw_size>LIMIT||compressed>LIMIT{return Err(CodecError::Bounds);}
    let n=le16(zip,c+28)? as usize;
    let x=le16(zip,c+30)? as usize;
    let cm=le16(zip,c+32)? as usize;
    let name_start=plus(c,46)?;
    let name_end=plus(name_start,n)?;
    let central_end=plus(name_end,plus(x,cm)?)?;
    if central_end!=e||zip.get(name_start..name_end)!=Some(PROFILE)||
       le32(zip,c+42)?!=0{return Err(CodecError::ZipStructure);}
    if le32(zip,0)?!=LOCAL||le16(zip,6)?!=flags||le16(zip,8)?!=method||
       le32(zip,14)?!=le32(zip,c+16)?||
       le32(zip,18)?!=le32(zip,c+20)?||
       le32(zip,22)?!=le32(zip,c+24)?{
       return Err(CodecError::ZipStructure);
    }
    let local_n=le16(zip,26)? as usize;
    let local_x=le16(zip,28)? as usize;
    let data_start=plus(30,plus(local_n,local_x)?)?;
    let data_end=plus(data_start,compressed)?;
    if zip.get(30..plus(30,local_n)?)!=Some(PROFILE)||data_end!=c{
       return Err(CodecError::ZipStructure);
    }
    Ok(Layout{method,data_start,data_end,central:c,eocd:e})
}
fn raw_profile(zip:&[u8],l:&Layout)->Result<Vec<u8>,CodecError>{
    let compressed=zip.get(l.data_start..l.data_end).ok_or(CodecError::ZipStructure)?;
    if l.method==0{return Ok(compressed.to_vec());}
    let mut d=DeflateDecoder::new(compressed).take(LIMIT as u64+1);
    let mut out=Vec::new();
    d.read_to_end(&mut out).map_err(|_|CodecError::ZipIntegrity)?;
    if out.len()>LIMIT{return Err(CodecError::Bounds);}
    Ok(out)
}
fn validate_profile(bytes:&[u8])->Result<(),CodecError>{
    let txt=std::str::from_utf8(bytes).map_err(|_|CodecError::Utf8)?;
    validate_json_without_edit(txt).map_err(|_|CodecError::Json)?;
    let root:serde_json::Value=serde_json::from_str(txt).map_err(|_|CodecError::Json)?;
    let info=root.get("GameInfo").and_then(serde_json::Value::as_object)
        .ok_or(CodecError::RequiredRoot)?;
    let version=info.get("Version").ok_or(CodecError::RequiredRoot)?;
    let version_ok=version.as_u64().is_some()||
        version.as_str().is_some_and(|s|!s.is_empty()&&s.len()<=20&&
            s.bytes().all(|b|b.is_ascii_digit())&&s.parse::<u64>().is_ok());
    if !version_ok||!root.get("Player").is_some_and(serde_json::Value::is_object)||
       !root.get("World").is_some_and(serde_json::Value::is_object){
       return Err(CodecError::RequiredRoot);
    }
    Ok(())
}
/// Only for local native/Worker memory; never send plaintext through a UI.
pub struct OpenedP1g{
    original_ciphertext:Vec<u8>,
    original_zip:Vec<u8>,
    profile:Vec<u8>,
    layout:Layout,
}
impl OpenedP1g{
    pub fn open(ciphertext:&[u8])->Result<Self,CodecError>{
        let zip=ecb_decrypt(ciphertext)?;
        let layout=zip_layout(&zip)?;
        let profile=raw_profile(&zip,&layout)?;
        if profile.len()!=le32(&zip,layout.central+24)? as usize||
           crc32(&profile)!=le32(&zip,layout.central+16)?{
            return Err(CodecError::ZipIntegrity);
        }
        validate_profile(&profile)?;
        Ok(Self{original_ciphertext:ciphertext.to_vec(),original_zip:zip,profile,layout})
    }
    /// A no-op always returns the exact original ciphertext, never recompressed.
    pub fn exact_noop_bytes(&self)->&[u8]{&self.original_ciphertext}
    pub fn profile_byte_len(&self)->usize{self.profile.len()}
}
fn rezip_profile(old:&[u8],layout:&Layout,new_profile:&[u8])->Result<Vec<u8>,CodecError>{
    let compressed=if layout.method==0{new_profile.to_vec()}else{
        let mut z=DeflateEncoder::new(Vec::new(),Compression::default());
        z.write_all(new_profile).map_err(|_|CodecError::ZipIntegrity)?;
        z.finish().map_err(|_|CodecError::ZipIntegrity)?
    };
    let compressed_len=u32::try_from(compressed.len()).map_err(|_|CodecError::Bounds)?;
    let raw_len=u32::try_from(new_profile.len()).map_err(|_|CodecError::Bounds)?;
    let new_c=plus(layout.data_start,compressed.len())?;
    let central_offset=u32::try_from(new_c).map_err(|_|CodecError::Bounds)?;
    let total=plus(new_c,old.len()-layout.central)?;
    if total>LIMIT{return Err(CodecError::Bounds);}
    let mut out=Vec::with_capacity(total);
    out.extend_from_slice(&old[..layout.data_start]);
    out.extend_from_slice(&compressed);
    out.extend_from_slice(&old[layout.central..]);
    let e=plus(new_c,layout.eocd-layout.central)?;
    for (start,a,b,c) in [(0,14,18,22),(new_c,16,20,24)]{
        set32(&mut out,start+a,crc32(new_profile))?;
        set32(&mut out,start+b,compressed_len)?;
        set32(&mut out,start+c,raw_len)?;
    }
    set32(&mut out,e+16,central_offset)?;
    Ok(out)
}
/// Experimental native-only repack, excluded from browser feature builds.
#[cfg(all(feature="native-p1g-lab",not(target_arch="wasm32")))]
pub mod native_lab{
    use super::*;
    use ddv_save_patch::{preview_existing_quantity,QuantityTarget};
    pub struct Draft{
        packaged:Vec<u8>,
        changed:bool,
    }
    impl Draft{
        pub fn candidate_bytes(&self)->&[u8]{&self.packaged}
        pub fn changed(&self)->bool{self.changed}
        pub fn export_authorized(&self)->bool{false}
    }
    pub fn preview_amount(source:&[u8],target:QuantityTarget,expected:u64,new:u64)
        ->Result<Draft,CodecError>{
        let opened=OpenedP1g::open(source)?;
        let json=std::str::from_utf8(&opened.profile).map_err(|_|CodecError::Utf8)?;
        let patched=preview_existing_quantity(json,target,expected,new).map_err(|_|CodecError::Patch)?;
        if !patched.changed{
            return Ok(Draft{packaged:source.to_vec(),changed:false});
        }
        validate_profile(patched.patched_json.as_bytes())?;
        let zip=rezip_profile(&opened.original_zip,&opened.layout,patched.patched_json.as_bytes())?;
        let ciphertext=ecb_encrypt(&zip)?;
        let reopened=OpenedP1g::open(&ciphertext)?;
        if reopened.profile!=patched.patched_json.as_bytes(){
            return Err(CodecError::ReopenMismatch);
        }
        Ok(Draft{packaged:ciphertext,changed:true})
    }
}

#[cfg(test)]
mod tests{
    use super::*;
    fn profile()->&'static str{
        r#"{"GameInfo":{"Version":643},"Player":{"ListInventories":{"100":{"Inventory":{"550":{"Amount":7,"Unknown":1.00}}}},"ContainerInventories":{"202":{"Inventory":[{"ItemID":0,"Amount":0},{"ItemID":440,"Amount":2}]}}},"World":{},"Extra":"\u3042"}"#
    }
    fn zip(profile:&[u8],method:u16)->Vec<u8>{
        let deflated=if method==0{profile.to_vec()}else{
            let mut d=DeflateEncoder::new(Vec::new(),Compression::default());
            d.write_all(profile).unwrap();d.finish().unwrap()
        };
        let mut local=vec![0u8;30];
        set32(&mut local,0,LOCAL).unwrap();
        local[4..6].copy_from_slice(&20u16.to_le_bytes());
        local[8..10].copy_from_slice(&method.to_le_bytes());
        set32(&mut local,14,crc32(profile)).unwrap();
        set32(&mut local,18,deflated.len() as u32).unwrap();
        set32(&mut local,22,profile.len() as u32).unwrap();
        local[26..28].copy_from_slice(&7u16.to_le_bytes());
        local[28..30].copy_from_slice(&2u16.to_le_bytes());
        local.extend_from_slice(PROFILE);
        local.extend_from_slice(b"\x01\x02");
        local.extend_from_slice(&deflated);
        let offset=local.len() as u32;
        let mut central=vec![0u8;46];
        set32(&mut central,0,CENTRAL).unwrap();
        central[4..6].copy_from_slice(&20u16.to_le_bytes());
        central[6..8].copy_from_slice(&20u16.to_le_bytes());
        central[10..12].copy_from_slice(&method.to_le_bytes());
        set32(&mut central,16,crc32(profile)).unwrap();
        set32(&mut central,20,deflated.len() as u32).unwrap();
        set32(&mut central,24,profile.len() as u32).unwrap();
        central[28..30].copy_from_slice(&7u16.to_le_bytes());
        central[32..34].copy_from_slice(&3u16.to_le_bytes());
        central.extend_from_slice(PROFILE);
        central.extend_from_slice(b"hey");
        let clen=central.len() as u32;
        local.extend_from_slice(&central);
        let mut end=vec![0u8;22];
        set32(&mut end,0,EOCD).unwrap();
        end[8..10].copy_from_slice(&1u16.to_le_bytes());
        end[10..12].copy_from_slice(&1u16.to_le_bytes());
        set32(&mut end,12,clen).unwrap();
        set32(&mut end,16,offset).unwrap();
        local.extend_from_slice(&end);
        local
    }
    fn encrypted(method:u16)->Vec<u8>{ecb_encrypt(&zip(profile().as_bytes(),method)).unwrap()}
    #[test]
    fn opens_raw_deflate_and_store_with_original_exact_ciphertext(){
        for method in [0,8]{
            let source=encrypted(method);
            let o=OpenedP1g::open(&source).unwrap();
            assert_eq!(o.exact_noop_bytes(),source);
            assert_eq!(o.profile,profile().as_bytes());
            assert_eq!(o.layout.method,method);
        }
    }
    #[test]
    fn invalid_crypto_crc_or_multifile_fails_closed(){
        assert!(OpenedP1g::open(&[0u8;16]).is_err());
        let mut data=zip(profile().as_bytes(),8);
        let e=data.len()-22;
        data[e+8..e+10].copy_from_slice(&2u16.to_le_bytes());
        assert!(OpenedP1g::open(&ecb_encrypt(&data).unwrap()).is_err());
        let mut data=zip(profile().as_bytes(),8);
        let c=le32(&data,data.len()-22+16).unwrap() as usize;
        set32(&mut data,c+16,0).unwrap();
        assert!(OpenedP1g::open(&ecb_encrypt(&data).unwrap()).is_err());
    }
    #[test]
    #[cfg(all(feature="native-p1g-lab",not(target_arch="wasm32")))]
    fn synthetic_amount_repack_reopens_with_unknown_bytes_preserved(){
        use ddv_save_patch::QuantityTarget;
        for method in [0,8]{
            let original=encrypted(method);
            let target=QuantityTarget::Inventory{inventory_id:"100".into(),item_id:"550".into()};
            let no=native_lab::preview_amount(&original,target.clone(),7,7).unwrap();
            assert!(!no.changed());
            assert_eq!(no.candidate_bytes(),original);
            let edit=native_lab::preview_amount(&original,target,7,12).unwrap();
            let reopened=OpenedP1g::open(edit.candidate_bytes()).unwrap();
            assert_eq!(reopened.profile,profile().replacen(r#""Amount":7"#,r#""Amount":12"#,1).as_bytes());
            assert!(!edit.export_authorized());
            assert_eq!(reopened.original_zip[30..39],*b"profile\x01\x02");
            assert_eq!(reopened.original_zip[reopened.layout.central+53..reopened.layout.eocd],*b"hey");
            let chest=native_lab::preview_amount(&original,
                QuantityTarget::ChestSlot{container_id:"202".into(),slot_index:1,item_id:440},2,3).unwrap();
            assert_eq!(OpenedP1g::open(chest.candidate_bytes()).unwrap().profile,
                profile().replacen(r#""Amount":2"#,r#""Amount":3"#,1).as_bytes());
        }
    }
}