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
use zeroize::Zeroize;

#[cfg(feature="wasm")]
mod mission_slot_audit;
#[cfg(any(feature="wasm",test))]
mod progression_guard;
#[cfg(feature="wasm")]
mod grid_instance_preview;
mod storage_source;
#[cfg(feature="wasm")]
mod private_storage_scope;
mod player_house_source;
#[cfg(feature="wasm")]
mod indoor_room_view;
#[cfg(feature="wasm")]
mod native_preset_backup;
mod native_tom_visual;
mod native_preset_scene;
#[cfg(feature="wasm")]
mod saved_area_flags;

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
// Clear plaintext and original ciphertext on release. This is a best-effort
// zeroization of owned Vec storage; the caller must also discard JS copies.
impl Drop for OpenedP1g{
    fn drop(&mut self){
        self.profile.zeroize();
        self.original_zip.zeroize();
        self.original_ciphertext.zeroize();
    }
}

/// Browser Worker-only read proof. Never returns raw decrypted profile,
/// user IDs, game metadata, a Writer capability, or packaged bytes.
#[cfg(feature="wasm")]
mod browser_audit{
    use super::*;
    use sha2::{Digest,Sha256};
    use wasm_bindgen::prelude::*;

    const MAX_BROWSER_CIPHERTEXT:usize=32*1024*1024;
    const MAX_CHUNK:usize=1024*1024;
    fn js_error(code:&'static str)->JsValue{JsValue::from_str(code)}

    #[wasm_bindgen]
    pub struct WasmP1gAudit{
        ciphertext:Vec<u8>,
        finalized:bool,
    }
    #[wasm_bindgen]
    impl WasmP1gAudit{
        #[wasm_bindgen(constructor)]
        pub fn new()->WasmP1gAudit{
            Self{ciphertext:Vec::new(),finalized:false}
        }
        // Call only inside the dedicated Worker. A P1G is streamed from the
        // transferred file buffer in bounded chunks; never accept a JSON DOM.
        pub fn append_chunk(&mut self,chunk:&[u8])->Result<(),JsValue>{
            if self.finalized || chunk.is_empty() || chunk.len()>MAX_CHUNK ||
               self.ciphertext.len().checked_add(chunk.len())
                   .is_none_or(|n| n>MAX_BROWSER_CIPHERTEXT){
                self.close();
                return Err(js_error("DB05_NATIVE_P1G_CHUNK_DENIED"));
            }
            self.ciphertext.extend_from_slice(chunk);
            Ok(())
        }
        // SHA-256 of validated UTF-8 original profile bytes ONLY.
        // Returned hex must be compared and discarded inside the Worker.
        pub fn finish_sha256_hex(&mut self)->Result<String,JsValue>{
            if self.finalized || self.ciphertext.len()<16 ||
               self.ciphertext.len()%16!=0{
                self.close();
                return Err(js_error("DB05_NATIVE_P1G_SOURCE_INVALID"));
            }
            let result=OpenedP1g::open(&self.ciphertext)
                .map(|opened|{
                    let digest=Sha256::digest(&opened.profile);
                    let mut hex=String::with_capacity(64);
                    const CHARS:&[u8;16]=b"0123456789abcdef";
                    for b in digest{
                        hex.push(CHARS[(b>>4) as usize] as char);
                        hex.push(CHARS[(b&15) as usize] as char);
                    }
                    hex
                })
                .map_err(|_|js_error("DB05_NATIVE_P1G_STRICT_REJECTED"));
            self.close();
            result
        }
        pub fn close(&mut self){
            self.ciphertext.zeroize();
            self.ciphertext.clear();
            self.finalized=true;
        }
    }
    impl Drop for WasmP1gAudit{
        fn drop(&mut self){self.close();}
    }
}

/// Product Collection read path: decrypt and verify using Rust, then hand the
/// validated original UTF-8 profile to the *same isolated* one-shot Worker.
/// Plaintext must never be sent to a Svelte page or persisted. No Writer API.
#[cfg(feature="wasm")]
mod browser_profile_reader {
    use super::*;
    use wasm_bindgen::prelude::*;

    const MAX_CIPHERTEXT: usize = 32 * 1024 * 1024;
    const MAX_CHUNK: usize = 1024 * 1024;
    const MAX_PROFILE: usize = 128 * 1024 * 1024;
    fn error(code: &'static str) -> JsValue { JsValue::from_str(code) }

    #[wasm_bindgen]
    pub struct WasmP1gReader {
        pending: Vec<u8>,
        opened: Option<OpenedP1g>,
        cursor: usize,
        closed: bool,
    }

    #[wasm_bindgen]
    impl WasmP1gReader {
        #[wasm_bindgen(constructor)]
        pub fn new() -> Self {
            Self { pending: Vec::new(), opened: None, cursor: 0, closed: false }
        }

        pub fn append_chunk(&mut self, chunk: &[u8]) -> Result<(), JsValue> {
            if self.closed || self.opened.is_some() || chunk.is_empty() ||
                chunk.len() > MAX_CHUNK ||
                self.pending.len().checked_add(chunk.len()).is_none_or(|n| n > MAX_CIPHERTEXT) {
                self.close();
                return Err(error("DB05_RUST_READ_INPUT_DENIED"));
            }
            self.pending.extend_from_slice(chunk);
            Ok(())
        }

        /// The exact original JSON is strictly validated in Rust, including
        /// duplicate keys, unsafe integers, CRC, ZIP envelope and root fields.
        /// Only a structurally unsupported ZIP format can use a bounded legacy
        /// read-only path; corrupted or invalid originals must fail closed.
        pub fn finish_open(&mut self) -> Result<u32, JsValue> {
            if self.closed || self.opened.is_some() ||
                self.pending.len() < 16 || self.pending.len() % 16 != 0 {
                self.close();
                return Err(error("DB05_RUST_READ_INPUT_DENIED"));
            }
            let outcome = OpenedP1g::open(&self.pending);
            self.pending.zeroize();
            self.pending.clear();
            match outcome {
                Ok(opened) if opened.profile.len() <= MAX_PROFILE => {
                    let len = opened.profile.len() as u32;
                    self.opened = Some(opened);
                    Ok(len)
                }
                Ok(_) => {
                    self.close();
                    Err(error("DB05_RUST_READ_PROFILE_TOO_LARGE"))
                }
                Err(CodecError::ZipUnsupported) => {
                    self.close();
                    Err(error("DB05_RUST_READ_UNSUPPORTED_ENVELOPE"))
                }
                Err(_) => {
                    self.close();
                    Err(error("DB05_RUST_READ_INVALID_PROFILE"))
                }
            }
        }

        /// Worker-only one-MiB transfer. No full plaintext string is created
        /// in the WASM/JS binding and no unbounded copy is exposed.
        pub fn take_profile_chunk(&mut self, maximum: u32) -> Result<Vec<u8>, JsValue> {
            if self.closed || maximum == 0 || maximum as usize > MAX_CHUNK {
                self.close();
                return Err(error("DB05_RUST_READ_CHUNK_DENIED"));
            }
            let opened = self.opened.as_ref()
                .ok_or_else(|| error("DB05_RUST_READ_NOT_OPEN"))?;
            if self.cursor >= opened.profile.len() {
                self.close();
                return Err(error("DB05_RUST_READ_EXHAUSTED"));
            }
            let end = self.cursor.saturating_add(maximum as usize).min(opened.profile.len());
            let part = opened.profile[self.cursor..end].to_vec();
            self.cursor = end;
            if end == opened.profile.len() {
                self.opened = None; // zeroizes original ciphertext, ZIP and profile
                self.closed = true;
            }
            Ok(part)
        }

        pub fn close(&mut self) {
            self.closed = true;
            self.pending.zeroize();
            self.pending.clear();
            self.opened = None;
            self.cursor = 0;
        }
    }

    impl Drop for WasmP1gReader {
        fn drop(&mut self) { self.close(); }
    }
    /// The real Steam .profile may be plaintext UTF-8 JSON. Validate in
    /// Rust without any AES/ZIP guess based on the filename. Bytes remain
    /// inside the dedicated Worker and are emitted only in bounded chunks.
    #[wasm_bindgen]
    pub struct WasmPlainProfileReader {
        pending: Vec<u8>,
        cursor: usize,
        ready: bool,
        closed: bool,
    }
    #[wasm_bindgen]
    impl WasmPlainProfileReader {
        #[wasm_bindgen(constructor)]
        pub fn new() -> Self {
            Self { pending:Vec::new(),cursor:0,ready:false,closed:false }
        }
        pub fn append_chunk(&mut self,part:&[u8])->Result<(),JsValue>{
            if self.closed || self.ready || part.is_empty() || part.len()>MAX_CHUNK ||
                self.pending.len().checked_add(part.len())
                    .is_none_or(|n| n>MAX_PROFILE){
                self.close();
                return Err(error("DB05_RUST_PLAIN_SIZE_DENIED"));
            }
            self.pending.extend_from_slice(part);
            Ok(())
        }
        pub fn finish_open(&mut self)->Result<u32,JsValue>{
            if self.closed || self.ready || self.pending.is_empty() ||
               self.pending.len()>MAX_PROFILE {
                self.close();
                return Err(error("DB05_RUST_PLAIN_INVALID"));
            }
            if validate_profile(&self.pending).is_err(){
                self.close();
                return Err(error("DB05_RUST_PLAIN_INVALID"));
            }
            self.ready=true;
            Ok(self.pending.len() as u32)
        }
        pub fn take_profile_chunk(&mut self,maximum:u32)->Result<Vec<u8>,JsValue>{
            if self.closed || !self.ready || maximum==0 ||
                maximum as usize>MAX_CHUNK ||
                self.cursor>=self.pending.len(){
                self.close();
                return Err(error("DB05_RUST_PLAIN_CHUNK_DENIED"));
            }
            let end=self.cursor.saturating_add(maximum as usize)
                .min(self.pending.len());
            let part=self.pending[self.cursor..end].to_vec();
            self.cursor=end;
            if end==self.pending.len(){self.close();}
            Ok(part)
        }
        pub fn close(&mut self){
            self.pending.zeroize();
            self.pending.clear();
            self.cursor=0;
            self.ready=false;
            self.closed=true;
        }
    }
    impl Drop for WasmPlainProfileReader{
        fn drop(&mut self){self.close();}
    }
}

/// Worker-internal existing-Amount P1G/JSON preview. The Rust memory keeps
/// original source data; neither the plaintext nor candidate archive leaves
/// this WASM module. This cannot download, export or overwrite a save.
#[cfg(feature="wasm")]
mod browser_amount_preview {
    use super::*;
    use ddv_save_patch::{
        preview_existing_quantity,preview_existing_quantity_batch,
        preview_existing_grid_coordinates,preview_existing_grid_coordinate_batch,
        preview_existing_grid_orientation,preview_existing_grid_transform,
        preview_existing_grid_mixed_batch,
        GridCoordinateEdit,GridMixedEdit,QuantityEdit,QuantityTarget
    };
    use wasm_bindgen::prelude::*;

    #[wasm_bindgen]
    pub fn inspect_native_preset_backup(backup:&str)->Result<String,JsValue>{
        native_preset_backup::inspect_backup(backup).map_err(|_|fail("DB05_NATIVE_DETAIL_UNAVAILABLE"))
    }
    #[wasm_bindgen]
    pub fn convert_native_decoration_to_scene(backup:&str)->Result<String,JsValue>{
        native_preset_scene::convert(backup).map_err(|_|fail("DB05_NATIVE_SCENE_UNSUPPORTED"))
    }
    const MAX_WORKER_CIPHERTEXT:usize=32*1024*1024;
    const CHUNK:usize=1024*1024;
    fn fail(code:&'static str)->JsValue{JsValue::from_str(code)}
    /// Parse a strictly bounded TS->Rust edit plan. The plan contains only
    /// targets and expected/new amounts, never raw private profile fields.
    fn parse_batch_plan(plan:&str)->Result<Vec<QuantityEdit>,JsValue>{
        if plan.len()>8192 || plan.is_empty() ||
           ddv_save_patch::validate_json_without_edit(plan).is_err() {
            return Err(fail("DB05_BATCH_PLAN_INVALID"));
        }
        let plan:serde_json::Value=serde_json::from_str(plan)
            .map_err(|_|fail("DB05_BATCH_PLAN_INVALID"))?;
        let root=plan.as_object().ok_or(fail("DB05_BATCH_PLAN_INVALID"))?;
        if root.len()!=1{return Err(fail("DB05_BATCH_PLAN_INVALID"));}
        let rows=root.get("edits").and_then(serde_json::Value::as_array)
            .ok_or(fail("DB05_BATCH_PLAN_INVALID"))?;
        if rows.is_empty() || rows.len()>16 {
            return Err(fail("DB05_BATCH_COUNT_INVALID"));
        }
        let mut out=Vec::with_capacity(rows.len());
        for row in rows {
            let obj=row.as_object().ok_or(fail("DB05_BATCH_ROW_INVALID"))?;
            if obj.len()!=3 {return Err(fail("DB05_BATCH_ROW_INVALID"));}
            let old=obj.get("expected").and_then(serde_json::Value::as_u64)
                .ok_or(fail("DB05_BATCH_AMOUNT_INVALID"))?;
            let next=obj.get("replacement").and_then(serde_json::Value::as_u64)
                .ok_or(fail("DB05_BATCH_AMOUNT_INVALID"))?;
            if old==0 || next==0 || old>u32::MAX as u64 ||
               next>u32::MAX as u64 || old==next {
                return Err(fail("DB05_BATCH_AMOUNT_INVALID"));
            }
            let target=obj.get("target").and_then(serde_json::Value::as_object)
                .ok_or(fail("DB05_BATCH_TARGET_INVALID"))?;
            let target_kind=target.get("kind").and_then(serde_json::Value::as_str)
                .ok_or(fail("DB05_BATCH_TARGET_INVALID"))?;
            let id=|name:&str|->Result<String,JsValue>{
                let value=target.get(name).and_then(serde_json::Value::as_str)
                    .ok_or(fail("DB05_BATCH_TARGET_INVALID"))?;
                if value.is_empty() || value.len()>20 ||
                   !value.bytes().all(|b|b.is_ascii_digit()) ||
                   value.parse::<u64>().ok().is_none_or(|n|n==0){
                    return Err(fail("DB05_BATCH_TARGET_INVALID"));
                }
                Ok(value.to_owned())
            };
            let target=match target_kind {
                "inventory" if target.len()==3=>QuantityTarget::Inventory{
                    inventory_id:id("inventoryId")?,
                    item_id:id("itemId")?
                },
                "chest" if target.len()==4=>{
                    let index=target.get("slotIndex")
                        .and_then(serde_json::Value::as_u64)
                        .ok_or(fail("DB05_BATCH_TARGET_INVALID"))?;
                    let item=target.get("itemId")
                        .and_then(serde_json::Value::as_u64)
                        .ok_or(fail("DB05_BATCH_TARGET_INVALID"))?;
                    if index>1_000_000 || item==0 || item>u32::MAX as u64 {
                        return Err(fail("DB05_BATCH_TARGET_INVALID"));
                    }
                    QuantityTarget::ChestSlot{
                        container_id:id("containerId")?,
                        slot_index:index as usize,item_id:item
                    }
                },
                _=>return Err(fail("DB05_BATCH_TARGET_INVALID"))
            };
            out.push(QuantityEdit{target,expected:old,replacement:next});
        }
        Ok(out)
    }

    struct GridCoordinatePlan {
        ordinal:usize,
        item_id:u64,
        kind:String,
        expected:(i32,i32),
        replacement:(i32,i32)
    }
    fn parse_grid_coordinate_plan(plan:&str)->Result<GridCoordinatePlan,JsValue>{
        if plan.len()>512 || plan.is_empty(){
            return Err(fail("DB05_GRID_EDIT_PLAN_INVALID"));
        }
        let raw:serde_json::Value=serde_json::from_str(plan)
            .map_err(|_|fail("DB05_GRID_EDIT_PLAN_INVALID"))?;
        let obj=raw.as_object().ok_or(fail("DB05_GRID_EDIT_PLAN_INVALID"))?;
        if obj.len()!=7 || ![
            "localOrdinal","itemId","recordKind","expectedX","expectedY",
            "replacementX","replacementY"
        ].iter().all(|k|obj.contains_key(*k)){
            return Err(fail("DB05_GRID_EDIT_PLAN_INVALID"));
        }
        let ord=obj["localOrdinal"].as_u64()
            .filter(|v|*v>0&&*v<=20000)
            .ok_or(fail("DB05_GRID_EDIT_PLAN_INVALID"))? as usize;
        let str_id=obj["itemId"].as_str()
            .ok_or(fail("DB05_GRID_EDIT_PLAN_INVALID"))?;
        if str_id.is_empty()||str_id.len()>16||str_id.starts_with('0')||
           !str_id.bytes().all(|b|b.is_ascii_digit()){
            return Err(fail("DB05_GRID_EDIT_PLAN_INVALID"));
        }
        let item=str_id.parse::<u64>()
            .ok().filter(|v|*v>0&&*v<=9_007_199_254_740_991)
            .ok_or(fail("DB05_GRID_EDIT_PLAN_INVALID"))?;
        let kind=obj["recordKind"].as_str()
            .filter(|k|matches!(*k,"full"|"diff_modified"))
            .ok_or(fail("DB05_GRID_EDIT_PLAN_INVALID"))?.to_owned();
        let int=|key:&str|->Result<i32,JsValue>{
            i32::try_from(obj[key].as_i64().ok_or(
                fail("DB05_GRID_EDIT_PLAN_INVALID")
            )?).map_err(|_|fail("DB05_GRID_EDIT_PLAN_INVALID"))
        };
        let expected=(int("expectedX")?,int("expectedY")?);
        let replacement=(int("replacementX")?,int("replacementY")?);
        if expected==replacement{
            return Err(fail("DB05_GRID_EDIT_NO_CHANGE"));
        }
        Ok(GridCoordinatePlan{ordinal:ord,item_id:item,kind,
            expected,replacement})
    }

    fn parse_grid_coordinate_batch_plan(
        plan:&str
    )->Result<Vec<GridCoordinatePlan>,JsValue>{
        if plan.len()>8192||plan.is_empty()||
           ddv_save_patch::validate_json_without_edit(plan).is_err(){
            return Err(fail("DB05_GRID_BATCH_PLAN_INVALID"));
        }
        let source:serde_json::Value=serde_json::from_str(plan)
            .map_err(|_|fail("DB05_GRID_BATCH_PLAN_INVALID"))?;
        let obj=source.as_object().ok_or(fail("DB05_GRID_BATCH_PLAN_INVALID"))?;
        if obj.len()!=1{
            return Err(fail("DB05_GRID_BATCH_PLAN_INVALID"));
        }
        let rows=obj.get("edits").and_then(serde_json::Value::as_array)
            .ok_or(fail("DB05_GRID_BATCH_PLAN_INVALID"))?;
        if rows.is_empty()||rows.len()>16{
            return Err(fail("DB05_GRID_BATCH_COUNT_INVALID"));
        }
        let mut out=Vec::with_capacity(rows.len());
        let mut ordinals=std::collections::HashSet::new();
        for row in rows{
            let serialized=serde_json::to_string(row)
                .map_err(|_|fail("DB05_GRID_BATCH_PLAN_INVALID"))?;
            let edit=parse_grid_coordinate_plan(&serialized)?;
            if !ordinals.insert(edit.ordinal){
                return Err(fail("DB05_GRID_BATCH_DUPLICATE_ORDINAL"));
            }
            out.push(edit);
        }
        Ok(out)
    }

    struct GridOrientationPlan{
        ordinal:usize,item_id:u64,kind:String,
        expected:(i32,i32),
        expected_orientation:String,replacement_orientation:String,
    }
    fn parse_grid_orientation_plan(plan:&str)->Result<GridOrientationPlan,JsValue>{
        if plan.len()>512||plan.is_empty()||
           ddv_save_patch::validate_json_without_edit(plan).is_err(){
            return Err(fail("DB05_ORIENTATION_PLAN_INVALID"));
        }
        let raw:serde_json::Value=serde_json::from_str(plan)
            .map_err(|_|fail("DB05_ORIENTATION_PLAN_INVALID"))?;
        let obj=raw.as_object().ok_or(fail("DB05_ORIENTATION_PLAN_INVALID"))?;
        if obj.len()!=7||![
            "localOrdinal","itemId","recordKind","expectedX","expectedY",
            "expectedOrientation","replacementOrientation"
        ].iter().all(|key|obj.contains_key(*key)){
            return Err(fail("DB05_ORIENTATION_PLAN_INVALID"));
        }
        let ordinal=obj["localOrdinal"].as_u64()
            .filter(|n|*n>0&&*n<=20000)
            .ok_or(fail("DB05_ORIENTATION_PLAN_INVALID"))? as usize;
        let id=obj["itemId"].as_str()
            .ok_or(fail("DB05_ORIENTATION_PLAN_INVALID"))?;
        if id.len()>16||id.is_empty()||id.starts_with('0')||
           !id.bytes().all(|b|b.is_ascii_digit()){
            return Err(fail("DB05_ORIENTATION_PLAN_INVALID"));
        }
        let item_id=id.parse::<u64>().ok()
            .filter(|n|*n>0&&*n<=9_007_199_254_740_991)
            .ok_or(fail("DB05_ORIENTATION_PLAN_INVALID"))?;
        let kind=obj["recordKind"].as_str()
            .filter(|s|matches!(*s,"full"|"diff_modified"))
            .ok_or(fail("DB05_ORIENTATION_PLAN_INVALID"))?.to_owned();
        let bound=|name:&str|->Result<i32,JsValue>{
            let v=obj[name].as_i64()
                .ok_or(fail("DB05_ORIENTATION_PLAN_INVALID"))?;
            i32::try_from(v).map_err(|_|fail("DB05_ORIENTATION_PLAN_INVALID"))
        };
        let expected=(bound("expectedX")?,bound("expectedY")?);
        let original=obj["expectedOrientation"].as_str()
            .ok_or(fail("DB05_ORIENTATION_PLAN_INVALID"))?;
        let replacement=obj["replacementOrientation"].as_str()
            .ok_or(fail("DB05_ORIENTATION_PLAN_INVALID"))?;
        if original==replacement||
           !ddv_save_patch::OBSERVED_CARDINAL_ORIENTATIONS.contains(&original)||
           !ddv_save_patch::OBSERVED_CARDINAL_ORIENTATIONS.contains(&replacement){
            return Err(fail("DB05_ORIENTATION_NOT_CONFIRMED"));
        }
        Ok(GridOrientationPlan{
            ordinal,item_id,kind,expected,
            expected_orientation:original.to_owned(),
            replacement_orientation:replacement.to_owned()
        })
    }

    /// Only combines the already proven seven-field position and seven-field
    /// cardinal orientation plans. No raw Save grid or object keys are accepted.
    fn parse_grid_transform_plan(
        plan:&str
    )->Result<(GridCoordinatePlan,GridOrientationPlan),JsValue>{
        if plan.len()>768||plan.is_empty()||
           ddv_save_patch::validate_json_without_edit(plan).is_err(){
            return Err(fail("DB05_GRID_TRANSFORM_PLAN_INVALID"));
        }
        let raw:serde_json::Value=serde_json::from_str(plan)
            .map_err(|_|fail("DB05_GRID_TRANSFORM_PLAN_INVALID"))?;
        let map=raw.as_object().ok_or(fail("DB05_GRID_TRANSFORM_PLAN_INVALID"))?;
        if map.len()!=9||![
            "localOrdinal","itemId","recordKind","expectedX","expectedY",
            "replacementX","replacementY","expectedOrientation",
            "replacementOrientation"
        ].iter().all(|k|map.contains_key(*k)){
            return Err(fail("DB05_GRID_TRANSFORM_PLAN_INVALID"));
        }
        let coord=serde_json::json!({
            "localOrdinal":map["localOrdinal"],"itemId":map["itemId"],
            "recordKind":map["recordKind"],"expectedX":map["expectedX"],
            "expectedY":map["expectedY"],"replacementX":map["replacementX"],
            "replacementY":map["replacementY"]
        });
        let orient=serde_json::json!({
            "localOrdinal":map["localOrdinal"],"itemId":map["itemId"],
            "recordKind":map["recordKind"],"expectedX":map["expectedX"],
            "expectedY":map["expectedY"],
            "expectedOrientation":map["expectedOrientation"],
            "replacementOrientation":map["replacementOrientation"]
        });
        let c=parse_grid_coordinate_plan(
            &serde_json::to_string(&coord)
                .map_err(|_|fail("DB05_GRID_TRANSFORM_PLAN_INVALID"))?
        )?;
        let o=parse_grid_orientation_plan(
            &serde_json::to_string(&orient)
                .map_err(|_|fail("DB05_GRID_TRANSFORM_PLAN_INVALID"))?
        )?;
        Ok((c,o))
    }

    struct GridMixedPlan{
        ordinal:usize,item_id:u64,kind:String,expected:(i32,i32),
        position:Option<(i32,i32)>,
        orientation:Option<(String,String)>
    }
    fn parse_grid_mixed_batch_plan(
        plan:&str
    )->Result<Vec<GridMixedPlan>,JsValue>{
        if plan.len()>ddv_save_patch::MAX_GRID_MIXED_EDITS*768+64||plan.is_empty()||
           ddv_save_patch::validate_json_without_edit(plan).is_err(){
            return Err(fail("DB05_GRID_MIXED_BATCH_INVALID"));
        }
        let root:serde_json::Value=serde_json::from_str(plan)
            .map_err(|_|fail("DB05_GRID_MIXED_BATCH_INVALID"))?;
        let map=root.as_object().ok_or(fail("DB05_GRID_MIXED_BATCH_INVALID"))?;
        if map.len()!=1{
            return Err(fail("DB05_GRID_MIXED_BATCH_INVALID"));
        }
        let rows=map.get("edits").and_then(serde_json::Value::as_array)
            .ok_or(fail("DB05_GRID_MIXED_BATCH_INVALID"))?;
        if rows.is_empty()||rows.len()>ddv_save_patch::MAX_GRID_MIXED_EDITS{
            return Err(fail("DB05_GRID_MIXED_BATCH_COUNT_INVALID"));
        }
        let mut out=Vec::with_capacity(rows.len());
        let mut ordinals=std::collections::HashSet::new();
        for row in rows{
            let r=row.as_object().ok_or(fail("DB05_GRID_MIXED_ROW_INVALID"))?;
            if r.len()!=9||![
                "localOrdinal","itemId","recordKind","expectedX","expectedY",
                "replacementX","replacementY","expectedOrientation",
                "replacementOrientation"
            ].iter().all(|key|r.contains_key(*key)){
                return Err(fail("DB05_GRID_MIXED_ROW_INVALID"));
            }
            let x=r["replacementX"].as_i64();
            let y=r["replacementY"].as_i64();
            let before=r["expectedOrientation"].as_str();
            let after=r["replacementOrientation"].as_str();
            if x.is_some()!=y.is_some()||before.is_some()!=after.is_some()||
               (x.is_none()&&(!r["replacementX"].is_null()||
                              !r["replacementY"].is_null()))||
               (before.is_none()&&(!r["expectedOrientation"].is_null()||
                                    !r["replacementOrientation"].is_null()))||
               (x.is_none()&&before.is_none()){
                return Err(fail("DB05_GRID_MIXED_ROW_INVALID"));
            }
            let shared=serde_json::json!({
                "localOrdinal":r["localOrdinal"],
                "itemId":r["itemId"],"recordKind":r["recordKind"],
                "expectedX":r["expectedX"],"expectedY":r["expectedY"]
            });
            let (ordinal,item_id,kind,expected,position,orientation)=
                if before.zip(after).is_some_and(|(a,b)|!ddv_save_patch::OBSERVED_CARDINAL_ORIENTATIONS.contains(&a)||!ddv_save_patch::OBSERVED_CARDINAL_ORIENTATIONS.contains(&b)){
                    let (a,b)=(before.ok_or(fail("DB05_GRID_MIXED_ROW_INVALID"))?,after.ok_or(fail("DB05_GRID_MIXED_ROW_INVALID"))?);
                    if a==b||!ddv_save_patch::EXPERIMENTAL_EIGHT_WAY_ORIENTATIONS.contains(&a)||!ddv_save_patch::EXPERIMENTAL_EIGHT_WAY_ORIENTATIONS.contains(&b){return Err(fail("DB05_ORIENTATION_NOT_CONFIRMED"));}
                    let mut part=shared;
                    part["expectedOrientation"]="GridOrientation_Up".into();
                    part["replacementOrientation"]="GridOrientation_Right".into();
                    let p=parse_grid_orientation_plan(&part.to_string())?;
                    if p.kind!="full"||p.item_id/100_000!=400{return Err(fail("DB05_ORIENTATION_NOT_CONFIRMED"));}
                    let position=if x.is_some(){
                        let mut coords=part;
                        let m=coords.as_object_mut().ok_or(fail("DB05_GRID_MIXED_ROW_INVALID"))?;
                        m.remove("expectedOrientation");m.remove("replacementOrientation");
                        coords["replacementX"]=r["replacementX"].clone();coords["replacementY"]=r["replacementY"].clone();
                        Some(parse_grid_coordinate_plan(&coords.to_string())?.replacement)
                    }else{None};
                    (p.ordinal,p.item_id,p.kind,p.expected,position,Some((a.to_owned(),b.to_owned())))
                }else if x.is_some()&&before.is_some(){
                    let parsed=parse_grid_transform_plan(
                        &serde_json::to_string(row)
                            .map_err(|_|fail("DB05_GRID_MIXED_ROW_INVALID"))?
                    )?;
                    (parsed.0.ordinal,parsed.0.item_id,parsed.0.kind,
                     parsed.0.expected,Some(parsed.0.replacement),
                     Some((parsed.1.expected_orientation,
                           parsed.1.replacement_orientation)))
                }else if x.is_some(){
                    let mut part=shared;
                    part["replacementX"]=r["replacementX"].clone();
                    part["replacementY"]=r["replacementY"].clone();
                    let p=parse_grid_coordinate_plan(
                        &serde_json::to_string(&part)
                            .map_err(|_|fail("DB05_GRID_MIXED_ROW_INVALID"))?
                    )?;
                    (p.ordinal,p.item_id,p.kind,p.expected,Some(p.replacement),None)
                }else{
                    let mut part=shared;
                    part["expectedOrientation"]=r["expectedOrientation"].clone();
                    part["replacementOrientation"]=r["replacementOrientation"].clone();
                    let p=parse_grid_orientation_plan(
                        &serde_json::to_string(&part)
                            .map_err(|_|fail("DB05_GRID_MIXED_ROW_INVALID"))?
                    )?;
                    (p.ordinal,p.item_id,p.kind,p.expected,None,
                     Some((p.expected_orientation,p.replacement_orientation)))
                };
            if !ordinals.insert(ordinal){
                return Err(fail("DB05_GRID_MIXED_DUPLICATE_ORDINAL"));
            }
            out.push(GridMixedPlan{ordinal,item_id,kind,expected,position,
                orientation});
        }
        Ok(out)
    }

    const MAX_DB04_WITNESS_BYTES:usize=16*1024*1024;
    /// Full Grids: exact source path pairs. DiffGrids: only potential
    /// references through a native layout path + DefaultLayoutGridID pair.
    /// A native candidate is NOT identity proof: original default-grid and
    /// data hashes are unavailable in the current DB-04 reference graph.
    /// Saved Grid dictionary IDs are NEVER treated as native grid IDs.
    pub(super) fn match_db04_grid_paths_json(
        profile:&[u8],witness:&str
    )->Result<String,CodecError>{
        use std::collections::HashMap;
        if witness.len()>MAX_DB04_WITNESS_BYTES || witness.is_empty(){
            return Err(CodecError::Bounds);
        }
        let source:serde_json::Value=serde_json::from_str(witness)
            .map_err(|_|CodecError::Json)?;
        let source=source.as_object().ok_or(CodecError::Json)?;
        if source.len()!=2 ||
           source.get("contract").and_then(serde_json::Value::as_str)
             !=Some("wand.db05.db04-grid-path-witness@2"){
            return Err(CodecError::Json);
        }
        let refs=source.get("gridRefs").and_then(serde_json::Value::as_array)
            .ok_or(CodecError::Json)?;
        if refs.len()>20000{return Err(CodecError::Bounds);}
        let valid_path=|value:&str,prefix:&str|{
            value.len()<=512 && value.len()>prefix.len()+5 &&
            value.starts_with(prefix) && value.ends_with(".json") &&
            !value.contains("..")&&!value.contains('\\') &&
            !value.chars().any(char::is_control)
        };
        let mut native=HashMap::<(String,String),u32>::new();
        let mut diff_native=HashMap::<(String,u32),u32>::new();
        for row in refs{
            let row=row.as_object().ok_or(CodecError::Json)?;
            if row.len()!=3{return Err(CodecError::Json);}
            let layout=row.get("layoutId").and_then(serde_json::Value::as_str)
                .ok_or(CodecError::Json)?;
            let data=row.get("gridDataPath").and_then(serde_json::Value::as_str)
                .ok_or(CodecError::Json)?;
            let native_id=row.get("nativeGridId")
                .and_then(serde_json::Value::as_u64)
                .filter(|id|*id<=u32::MAX as u64)
                .ok_or(CodecError::Json)? as u32;
            if !valid_path(layout,"SceneLayouts/") ||
               !valid_path(data,"GridData/"){
                return Err(CodecError::Json);
            }
            *native.entry((layout.to_owned(),data.to_owned()))
                .or_default()+=1;
            *diff_native.entry((layout.to_owned(),native_id))
                .or_default()+=1;
        }
        let root:serde_json::Value=serde_json::from_slice(profile)
            .map_err(|_|CodecError::Json)?;
        let world=root.get("World").and_then(serde_json::Value::as_object)
            .ok_or(CodecError::RequiredRoot)?;
        let coll=world.get("GridCollection");
        let mut observed_full=0usize;
        let mut exact_full=0usize;
        let mut not_in_source=0usize;
        let mut ambiguous_full=0usize;
        let mut malformed_full=0usize;
        let mut observed_diff=0usize;
        let mut unverified_diff_hash=0usize;
        let mut malformed_diff=0usize;
        let mut diff_candidates=0usize;
        let mut diff_not_in_source=0usize;
        let mut diff_ambiguous=0usize;
        let mut sampled=false;
        let source_status=if coll.is_none(){
            "not_observed"
        }else if !coll.is_some_and(serde_json::Value::is_object){
            "incompatible_structure"
        }else{
            let coll=coll.and_then(serde_json::Value::as_object)
                .ok_or(CodecError::Json)?;
            let full=coll.get("Grids").and_then(serde_json::Value::as_object);
            let diff=coll.get("DiffGrids").and_then(serde_json::Value::as_object);
            if coll.get("Grids").is_some() && full.is_none(){
                malformed_full+=1;
            }
            if coll.get("DiffGrids").is_some() && diff.is_none(){
                malformed_diff+=1;
            }
            let mut visited=0usize;
            if let Some(full)=full{
                for (key,record) in full{
                    if visited>=MAX_GRID_SCAN{sampled=true;break;}
                    visited+=1;
                    observed_full+=1;
                    let id=key.parse::<u64>().ok()
                        .filter(|id|id.to_string()==*key);
                    let Some(obj)=record.as_object() else {
                        malformed_full+=1;continue;
                    };
                    if id.is_none()||obj.get("ID").is_some_and(|v|
                        v.as_u64()!=id) {
                        malformed_full+=1;continue;
                    }
                    let layout=obj.get("GridDefaultLayoutPath")
                        .and_then(serde_json::Value::as_str);
                    let data=obj.get("GridDataPath")
                        .and_then(serde_json::Value::as_str);
                    let (Some(layout),Some(data))=(layout,data) else {
                        malformed_full+=1;continue;
                    };
                    if !valid_path(layout,"SceneLayouts/")||
                        !valid_path(data,"GridData/"){
                        malformed_full+=1;continue;
                    }
                    match native.get(&(layout.to_owned(),data.to_owned()))
                        .copied().unwrap_or(0){
                        0=>not_in_source+=1,
                        1=>exact_full+=1,
                        _=>ambiguous_full+=1
                    }
                }
            }
            if let Some(diff)=diff{
                for (key,record) in diff{
                    if visited>=MAX_GRID_SCAN{sampled=true;break;}
                    visited+=1;
                    observed_diff+=1;
                    let id=key.parse::<u64>().ok()
                        .filter(|id|id.to_string()==*key);
                    let Some(obj)=record.as_object() else {
                        malformed_diff+=1;continue;
                    };
                    if id.is_none()||obj.get("ID").is_some_and(|v|
                        v.as_u64()!=id) ||
                        full.is_some_and(|grids|grids.contains_key(key)){
                        malformed_diff+=1;continue;
                    }
                    let layout=obj.get("GridDefaultLayoutPath")
                        .and_then(serde_json::Value::as_str);
                    let native_grid=obj.get("DefaultLayoutGridID")
                        .and_then(serde_json::Value::as_u64);
                    let kind=obj.get("GridDefaultLayoutType")
                        .and_then(serde_json::Value::as_str);
                    let hash=obj.get("DefaultGridHashCode")
                        .and_then(serde_json::Value::as_i64);
                    let data_hash=obj.get("DefaultGridDataHashCode")
                        .and_then(serde_json::Value::as_i64);
                    let hash_ok=|v:Option<i64>|v.is_some_and(|v|
                        v>=i32::MIN as i64&&v<=i32::MAX as i64);
                    if !layout.is_some_and(|v|valid_path(v,"SceneLayouts/"))||
                        !native_grid.is_some_and(|v|v<=u32::MAX as u64) ||
                        !kind.is_some_and(|v|matches!(v,
                            "Meta.GridCollection, Meta"|
                            "Meta.DefaultRealmData, Meta"|
                            "Meta.DefaultOffGridBuildingData, Meta")) ||
                        !hash_ok(hash)||!hash_ok(data_hash){
                        malformed_diff+=1;continue;
                    }
                    // The source's derived gridRefId (layout + nativeGridId)
                    // only narrows the candidate set. A saved Grid ID is
                    // never compared. Two native hash witnesses remain absent.
                    unverified_diff_hash+=1;
                    match diff_native.get(&(layout.unwrap().to_owned(),
                        native_grid.unwrap() as u32)).copied().unwrap_or(0){
                        0=>diff_not_in_source+=1,
                        1=>diff_candidates+=1,
                        _=>diff_ambiguous+=1
                    }
                }
            }
            if sampled||malformed_full>0||malformed_diff>0{
                "partial_inconclusive"
            }else if exact_full>0{
                "source_path_matches"
            }else if diff_candidates>0{
                "diff_structural_candidates_only"
            }else{
                "no_exact_full_path_match"
            }
        };
        serde_json::to_string(&serde_json::json!({
            "contract":"wand.db05.db04-grid-path-match@2",
            "status":source_status,
            "observedFullGrids":observed_full,
            "matchedFullGrids":exact_full,
            "notInPartialSourceFullGrids":not_in_source,
            "ambiguousSourceFullGrids":ambiguous_full,
            "malformedFullGrids":malformed_full,
            "observedDiffGrids":observed_diff,
            "hashUnverifiedDiffGrids":unverified_diff_hash,
            "structuralCandidateDiffGrids":diff_candidates,
            "notInPartialSourceDiffGrids":diff_not_in_source,
            "ambiguousSourceDiffGrids":diff_ambiguous,
            "malformedDiffGrids":malformed_diff,
            "sampled":sampled,
            "sourceCoverageComplete":false,
            "sourceOriginalArchiveRechecked":false,
            "saveGridNumericIdUsedAsNativeKey":false,
            "diffIdentityVerified":false,
            "worldCoordinatesVerified":false,
            "playerPlacementVerified":false,
            "nativeDefaultObjectEquivalenceVerified":false,
            "saveWritingAuthorized":false
        })).map_err(|_|CodecError::Json)
    }

    const MAX_GRID_SCAN:usize=2048;
    const MAX_GRID_OBJECT_SCAN:usize=100_000;
    const MAX_GRID_ITEM_IDS:usize=20_000;
    /// Save-only GridObject ItemID references. These are NOT full placed
    /// counts: DiffGrids overlay defaults, and source objects may be absent.
    /// Keep player-specific grid IDs, coordinates and state inside WASM.
    pub(super) fn saved_grid_references_json(source:&[u8])->Result<String,CodecError>{
        use std::collections::{BTreeMap,HashSet};
        let root:serde_json::Value=serde_json::from_slice(source)
            .map_err(|_|CodecError::Json)?;
        let world=root.get("World").and_then(serde_json::Value::as_object)
            .ok_or(CodecError::RequiredRoot)?;
        let collection=world.get("GridCollection");
        let mut observed_full=0usize;
        let mut observed_diff=0usize;
        let mut invalid=0usize;
        let mut removed_markers=0usize;
        let mut sampled=false;
        let mut inspected=0usize;
        let mut by_item=BTreeMap::<u64,(u32,u32)>::new();
        fn scan_objects(
            objects:&serde_json::Map<String,serde_json::Value>,
            is_diff:bool,removed:&HashSet<String>,
            by_item:&mut BTreeMap<u64,(u32,u32)>,
            inspected:&mut usize,sampled:&mut bool,invalid:&mut usize
        ){
            for (key,object) in objects {
                if *inspected>=MAX_GRID_OBJECT_SCAN{*sampled=true;break;}
                *inspected+=1;
                let parsed=key.parse::<u64>().ok()
                    .filter(|id|id.to_string()==*key);
                let Some(fields)=object.as_object() else {*invalid+=1;continue;};
                let Some(id)=parsed else {*invalid+=1;continue;};
                if fields.get("ID").is_some_and(|v|v.as_u64()!=Some(id)){
                    *invalid+=1;continue;
                }
                if removed.contains(key){continue;}
                let Some(item_id)=fields.get("ItemID")
                    .and_then(serde_json::Value::as_u64)
                    .filter(|v|*v>0) else {*invalid+=1;continue;};
                if !by_item.contains_key(&item_id) &&
                    by_item.len()>=MAX_GRID_ITEM_IDS{
                    *sampled=true;break;
                }
                let counter=by_item.entry(item_id).or_insert((0,0));
                if is_diff{counter.1+=1;}else{counter.0+=1;}
            }
        }
        let status=match collection {
            None=>"not_observed",
            Some(value) if !value.is_object()=>"incompatible_structure",
            Some(value)=>{
                let grids=value.as_object().expect("checked object");
                let full=grids.get("Grids").and_then(serde_json::Value::as_object);
                let diff=grids.get("DiffGrids").and_then(serde_json::Value::as_object);
                if grids.get("Grids").is_some()&&full.is_none(){invalid+=1;}
                if grids.get("DiffGrids").is_some()&&diff.is_none(){invalid+=1;}
                let empty=serde_json::Map::new();
                let full=full.unwrap_or(&empty);
                let diff=diff.unwrap_or(&empty);
                let mut seen=0usize;
                for (key,value) in full{
                    if seen>=MAX_GRID_SCAN{sampled=true;break;}
                    seen+=1;
                    let parsed=key.parse::<u64>().ok()
                        .filter(|id|id.to_string()==*key);
                    let Some(grid)=value.as_object() else {invalid+=1;continue;};
                    let Some(grid_id)=parsed else {invalid+=1;continue;};
                    if grid.get("ID").is_some_and(|v|v.as_u64()!=Some(grid_id)){
                        invalid+=1;continue;
                    }
                    let Some(objects)=grid.get("Objects")
                        .and_then(serde_json::Value::as_object) else {
                        invalid+=1;continue;
                    };
                    observed_full+=1;
                    scan_objects(objects,false,&HashSet::new(),
                        &mut by_item,&mut inspected,&mut sampled,&mut invalid);
                }
                for (key,value) in diff{
                    if seen>=MAX_GRID_SCAN{sampled=true;break;}
                    seen+=1;
                    let parsed=key.parse::<u64>().ok()
                        .filter(|id|id.to_string()==*key);
                    let Some(grid)=value.as_object() else {invalid+=1;continue;};
                    let Some(grid_id)=parsed else {invalid+=1;continue;};
                    if full.contains_key(key) ||
                        grid.get("ID").is_some_and(|v|v.as_u64()!=Some(grid_id)){
                        invalid+=1;continue;
                    }
                    // A valid DiffGrid can contain only removals, with no
                    // ModifiedObjects. Missing is not a broken Save.
                    let Some(objects)=grid.get("ModifiedObjects")
                        .map_or(Some(&empty),serde_json::Value::as_object) else {
                        invalid+=1;continue;
                    };
                    let mut removed=HashSet::new();
                    if let Some(list)=grid.get("RemovedObjects"){
                        let Some(list)=list.as_array() else {invalid+=1;continue;};
                        if list.iter().any(|v|v.as_u64().is_none()){
                            invalid+=1;continue;
                        }
                        removed.extend(list.iter().filter_map(|v|v.as_u64())
                            .map(|v|v.to_string()));
                    }
                    if removed_markers+removed.len()>MAX_GRID_OBJECT_SCAN{
                        sampled=true;break;
                    }
                    removed_markers+=removed.len();
                    observed_diff+=1;
                    scan_objects(objects,true,&removed,
                        &mut by_item,&mut inspected,&mut sampled,&mut invalid);
                }
                if sampled||invalid>0{"partial_inconclusive"}
                else if by_item.is_empty(){"observed_no_item_refs"}
                else {"saved_item_refs"}
            }
        };
        let rows=by_item.into_iter().map(|(item_id,(full,diff))|
            serde_json::json!({
                "itemId":item_id.to_string(),
                "fullGridReferences":full,
                "diffModifiedReferences":diff
            })).collect::<Vec<_>>();
        serde_json::to_string(&serde_json::json!({
            "contract":"wand.db05.saved-grid-item-refs@2",
            "status":status,
            "observedFullGrids":observed_full,
            "observedDiffGrids":observed_diff,
            "invalidRecords":invalid,
            "removedObjectMarkers":removed_markers,
            "sampled":sampled,
            "entries":rows,
            "effectivePlacedCountVerified":false,
            "playerPlacementVerified":false,
            "worldSourceMatched":false,
            "saveWritingAuthorized":false
        })).map_err(|_|CodecError::Json)
    }

    /// Exact saved ordinary-furniture stock, including retained zero entries.
    /// This is separate from the generic positive editable-slot projection:
    /// route zero is a valid native Catalog inventory. No marker, raw route,
    /// player identity or state is emitted. Variation canonicalization is
    /// not inferred; clients must present these as exact saved item counts.
    pub(super) fn furniture_catalog_stock_json(source:&[u8])->Result<String,CodecError>{
        let root:serde_json::Value=serde_json::from_slice(source).map_err(|_|CodecError::Json)?;
        let route=root.get("Player").and_then(|v|v.get("ListInventories")).and_then(|v|v.get("0")).and_then(|v|v.as_object()).ok_or(CodecError::Json)?;
        if route.get("ID").and_then(|v|v.as_u64())!=Some(0)||route.get("CompatibleItemType").and_then(|v|v.as_str())!=Some("ItemType_Furniture")||
           route.keys().any(|k|k.starts_with("Compatible")&&!matches!(k.as_str(),"CompatibleItemType"|"CompatibleFurnitureTypes")){
            return Err(CodecError::Json);
        }
        let restriction=route.get("CompatibleFurnitureTypes").and_then(|v|v.as_object()).ok_or(CodecError::Json)?;
        let types=restriction.get("List").and_then(|v|v.as_array()).ok_or(CodecError::Json)?;
        let mut distinct=std::collections::HashSet::new();
        if restriction.len()!=1||types.len()>16{return Err(CodecError::Json);}
        for value in types{
            let s=value.as_str().ok_or(CodecError::Json)?;
            if !matches!(s,"FurnitureItemType_Default"|"FurnitureItemType_GroundAlteration"|"FurnitureItemType_Door"|"FurnitureItemType_Request"|"FurnitureItemType_Blocker"|"FurnitureItemType_Fence"|"FurnitureItemType_AncientMachine"|"FurnitureItemType_SnippetTrap")||!distinct.insert(s){return Err(CodecError::Json);}
        }
        if !distinct.contains("FurnitureItemType_Default"){return Err(CodecError::Json);}
        let items=route.get("Inventory").and_then(|v|v.as_object()).ok_or(CodecError::Json)?;
        let mut rows=Vec::new();
        for (key,value) in items{
            let Ok(id)=key.parse::<u32>()else{continue;};
            if id/100_000!=400{continue;}
            if id.to_string()!=*key{return Err(CodecError::Json);}
            let amount=value.get("Amount").and_then(|v|v.as_u64()).filter(|n|*n<=i32::MAX as u64).ok_or(CodecError::Json)?;
            if rows.len()>=20000{return Err(CodecError::Bounds);}
            rows.push(serde_json::json!({"itemId":id,"amount":amount}));
        }
        serde_json::to_string(&serde_json::json!({"contract":"wand.db05.furniture-catalog-stock@1","rows":rows,"exactStoredCounts":true,"canonicalVariationVerified":false,"writerAuthorized":false})).map_err(|_|CodecError::Json)
    }

    const MAX_EDITABLE_ROWS:usize=20000;
    /// Extraction is strictly read-only. Missing/custom player fields are
    /// valid: user-modified saves need not contain every game's section.
    pub(super) fn slot_index_json(source:&[u8])->Result<String,CodecError>{
        let root:serde_json::Value=serde_json::from_slice(source)
            .map_err(|_|CodecError::Json)?;
        let player=root.get("Player").and_then(serde_json::Value::as_object)
            .ok_or(CodecError::RequiredRoot)?;
        let mut slots=Vec::<serde_json::Value>::new();
        let valid_id=|s:&str|s.len()<=20 && !s.is_empty() &&
            s.bytes().all(|c|c.is_ascii_digit()) &&
            s.parse::<u64>().ok().is_some_and(|v|v>0);
        if let Some(groups)=player.get("ListInventories")
            .and_then(serde_json::Value::as_object){
            for (inventory_id,container) in groups {
                if !valid_id(inventory_id){continue;}
                let Some(items)=container.get("Inventory")
                    .and_then(serde_json::Value::as_object) else {continue;};
                for (item_id,slot) in items {
                    if !valid_id(item_id){continue;}
                    let Some(amount)=slot.get("Amount")
                        .and_then(serde_json::Value::as_u64) else {continue;};
                    if amount==0||amount>u32::MAX as u64 {continue;}
                    if slots.len()>=MAX_EDITABLE_ROWS{return Err(CodecError::Bounds);}
                    slots.push(serde_json::json!({
                        "kind":"inventory","inventoryId":inventory_id,
                        "itemId":item_id,"amount":amount
                    }));
                }
            }
        }
        if let Some(groups)=player.get("ContainerInventories")
            .and_then(serde_json::Value::as_object){
            for (container_id,container) in groups {
                if !valid_id(container_id){continue;}
                let Some(items)=container.get("Inventory")
                    .and_then(serde_json::Value::as_array) else {continue;};
                for (slot_index,slot) in items.iter().enumerate() {
                    if slot_index>1_000_000{break;}
                    let Some(item_id)=slot.get("ItemID")
                        .and_then(serde_json::Value::as_u64) else {continue;};
                    let Some(amount)=slot.get("Amount")
                        .and_then(serde_json::Value::as_u64) else {continue;};
                    if item_id==0||item_id>u32::MAX as u64||
                       amount==0||amount>u32::MAX as u64{continue;}
                    if slots.len()>=MAX_EDITABLE_ROWS{return Err(CodecError::Bounds);}
                    slots.push(serde_json::json!({
                        "kind":"chest","containerId":container_id,
                        "slotIndex":slot_index,"itemId":item_id,"amount":amount
                    }));
                }
            }
        }
        serde_json::to_string(&serde_json::json!({
            "contract":"wand.db05.editable-slots@1",
            "rows":slots,
            "completeForExistingPositiveU32Amounts":true,
            "writerAuthorized":false
        })).map_err(|_|CodecError::Json)
    }

    #[derive(Clone,Copy)]
    enum InputKind{PlainJson,EncryptedP1g}
    #[wasm_bindgen]
    pub struct WasmAmountPreview {
        kind:InputKind,
        pending:Vec<u8>,
        p1g:Option<OpenedP1g>,
        ready:bool,
        closed:bool,
        copy_buffer:Vec<u8>,
        copy_position:usize,
        copy_prepared:bool,
    }

    #[wasm_bindgen]
    impl WasmAmountPreview {
        #[wasm_bindgen(constructor)]
        pub fn new(input_kind:&str)->Result<WasmAmountPreview,JsValue>{
            let kind=match input_kind{
                "json"=>InputKind::PlainJson,
                "p1g"=>InputKind::EncryptedP1g,
                _=>return Err(fail("DB05_PREVIEW_FORMAT_INVALID"))
            };
            Ok(Self{kind,pending:Vec::new(),p1g:None,ready:false,closed:false,
                copy_buffer:Vec::new(),copy_position:0,copy_prepared:false})
        }
        pub fn append_chunk(&mut self,chunk:&[u8])->Result<(),JsValue>{
            let limit=match self.kind{
                InputKind::PlainJson=>LIMIT,
                InputKind::EncryptedP1g=>MAX_WORKER_CIPHERTEXT
            };
            if self.ready||self.closed||chunk.is_empty()||chunk.len()>CHUNK||
               self.pending.len().checked_add(chunk.len()).is_none_or(|n|n>limit){
                self.close();return Err(fail("DB05_PREVIEW_CHUNK_INVALID"));
            }
            self.pending.extend_from_slice(chunk);
            Ok(())
        }
        /// Only successful, structurally valid originals may be previewed.
        pub fn finish_open(&mut self)->Result<(),JsValue>{
            if self.closed||self.ready{
                self.close();return Err(fail("DB05_PREVIEW_ALREADY_FINISHED"));
            }
            let ok=match self.kind{
                InputKind::PlainJson=>validate_profile(&self.pending),
                InputKind::EncryptedP1g=>{
                    match OpenedP1g::open(&self.pending){
                        Ok(opened)=>{self.p1g=Some(opened);Ok(())},
                        Err(e)=>Err(e)
                    }
                }
            };
            if ok.is_err(){
                self.close();return Err(fail("DB05_PREVIEW_OPEN_REJECTED"));
            }
            if matches!(self.kind,InputKind::EncryptedP1g){
                self.pending.zeroize();self.pending.clear();
            }
            self.ready=true;
            Ok(())
        }
        /// Read-only, bounded projection of existing positive editable
        /// Inventory/Chest Amount rows. Raw JSON, quest progress, world
        /// coordinates and player identifiers never leave this Rust Worker.
        /// This is not a catalog lookup, ownership proof or editing permission.
        /// Read-only save GridObject references for optional DB-04 annotation;
        /// no grid IDs, coordinates or private object fields leave the Worker.
        /// DB-03 comparison uses the public Guide's independently published
        /// static quest index; outputs are aggregate-only and never authorize
        /// quest progress changes or a Save Writer.
        pub fn match_db03_mission_slots(&self,index:&str)->Result<String,JsValue>{
            if !self.ready || self.closed{
                return Err(fail("DB05_MISSION_SLOT_SESSION_NOT_OPEN"));
            }
            let profile=match self.kind{
                InputKind::PlainJson=>self.pending.as_slice(),
                InputKind::EncryptedP1g=>self.p1g.as_ref()
                    .ok_or(fail("DB05_MISSION_SLOT_SESSION_NOT_OPEN"))?
                    .profile.as_slice()
            };
            mission_slot_audit::match_mission_slots_json(profile,index)
                .map_err(|_|fail("DB05_MISSION_SLOT_AUDIT_INVALID"))
        }
        /// Source path pairing only. Source graph must first be verified
        /// by the existing DB-04 WorldReferenceIndex in this Worker.
        pub fn match_db04_grid_paths(&self,witness:&str)->Result<String,JsValue>{
            if !self.ready || self.closed {
                return Err(fail("DB05_GRID_SOURCE_SESSION_NOT_OPEN"));
            }
            let profile=match self.kind {
                InputKind::PlainJson=>self.pending.as_slice(),
                InputKind::EncryptedP1g=>self.p1g.as_ref()
                    .ok_or(fail("DB05_GRID_SOURCE_SESSION_NOT_OPEN"))?
                    .profile.as_slice()
            };
            match_db04_grid_paths_json(profile,witness)
                .map_err(|_|fail("DB05_GRID_SOURCE_MATCH_INVALID"))
        }
        /// Read-only DB-04 source file dimensions and possible original Grid
        /// references for each ephemeral saved object ordinal. This is NOT
        /// identity proof, source/save coordinate conversion or Writer grant.
        pub fn match_db04_terrain_session(&self,witness:&str)->Result<String,JsValue>{
            if !self.ready||self.closed{return Err(fail("DB05_GRID_OBJECT_SOURCE_SESSION_NOT_OPEN"));}
            let profile=match self.kind{
                InputKind::PlainJson=>self.pending.as_slice(),
                InputKind::EncryptedP1g=>self.p1g.as_ref().ok_or(fail("DB05_GRID_OBJECT_SOURCE_SESSION_NOT_OPEN"))?.profile.as_slice()
            };
            grid_instance_preview::saved_db04_terrain_session_json(profile,witness)
                .map_err(|_|fail("DB05_GRID_TERRAIN_SESSION_INVALID"))
        }
        pub fn match_db04_grid_object_sources(
            &self,witness:&str
        )->Result<String,JsValue>{
            if !self.ready||self.closed{
                return Err(fail("DB05_GRID_OBJECT_SOURCE_SESSION_NOT_OPEN"));
            }
            let profile=match self.kind{
                InputKind::PlainJson=>self.pending.as_slice(),
                InputKind::EncryptedP1g=>self.p1g.as_ref()
                    .ok_or(fail("DB05_GRID_OBJECT_SOURCE_SESSION_NOT_OPEN"))?
                    .profile.as_slice()
            };
            grid_instance_preview::saved_db04_object_source_context_json(
                profile,witness
            ).map_err(|_|fail("DB05_GRID_OBJECT_SOURCE_CONTEXT_INVALID"))
        }
        /// User-invoked local preview of individual saved GridObject positions.
        /// Item IDs and native X/Y/Orientation are returned to this browser's
        /// Svelte UI only. Real Save IDs, object IDs, source paths, private
        /// states and any write permission are never returned.
        pub fn list_saved_grid_instances(&self)->Result<String,JsValue>{
            if !self.ready || self.closed{
                return Err(fail("DB05_GRID_INSTANCE_SESSION_NOT_OPEN"));
            }
            let profile=match self.kind{
                InputKind::PlainJson=>self.pending.as_slice(),
                InputKind::EncryptedP1g=>self.p1g.as_ref()
                    .ok_or(fail("DB05_GRID_INSTANCE_SESSION_NOT_OPEN"))?
                    .profile.as_slice()
            };
            grid_instance_preview::saved_grid_instances_json(profile)
                .map_err(|_|fail("DB05_GRID_INSTANCE_READ_INVALID"))
        }
        pub fn list_saved_area_flags(&self)->Result<String,JsValue>{
            if !self.ready||self.closed{return Err(fail("DB05_AREA_FLAGS_SESSION_NOT_OPEN"));}
            let profile=match self.kind{
                InputKind::PlainJson=>self.pending.as_slice(),
                InputKind::EncryptedP1g=>self.p1g.as_ref().ok_or(fail("DB05_AREA_FLAGS_SESSION_NOT_OPEN"))?.profile.as_slice()
            };
            super::saved_area_flags::saved_area_flags(profile).map_err(|_|fail("DB05_AREA_FLAGS_INVALID"))
        }
        pub fn list_saved_grid_item_references(&self)->Result<String,JsValue>{
            if !self.ready || self.closed {
                return Err(fail("DB05_GRID_INDEX_NOT_OPEN"));
            }
            let source=match self.kind {
                InputKind::PlainJson=>self.pending.as_slice(),
                InputKind::EncryptedP1g=>self.p1g.as_ref()
                    .ok_or(fail("DB05_GRID_INDEX_NOT_OPEN"))?.profile.as_slice()
            };
            saved_grid_references_json(source)
                .map_err(|_|fail("DB05_GRID_INDEX_INVALID"))
        }
        pub fn preview_indoor_finish(&self,plan:&str)->Result<String,JsValue>{
            if !self.ready||self.closed||self.copy_prepared{return Err(fail("DB05_INDOOR_NOT_OPEN"));}
            let source=match self.kind{
                InputKind::PlainJson=>self.pending.as_slice(),
                InputKind::EncryptedP1g=>self.p1g.as_ref().ok_or(fail("DB05_INDOOR_NOT_OPEN"))?.profile.as_slice()
            };
            let mut draft=indoor_room_view::finish_candidate(source,plan).map_err(|_|fail("DB05_ROOM_FINISH_REJECTED"))?;
            let result=(||->Result<String,JsValue>{
                let invalid=||fail("DB05_ROOM_FINISH_REOPEN");
                if !draft.changed||!draft.untouched_bytes_preserved||draft.export_authorized||draft.writer_authorized{return Err(invalid());}
                validate_profile(draft.patched_json.as_bytes()).map_err(|_|invalid())?;
                if matches!(self.kind,InputKind::EncryptedP1g){
                    let opened=self.p1g.as_ref().ok_or_else(invalid)?;
                    let mut archive=rezip_profile(&opened.original_zip,&opened.layout,draft.patched_json.as_bytes()).map_err(|_|invalid())?;
                    let encrypted=ecb_encrypt(&archive);archive.zeroize();
                    let mut encrypted=encrypted.map_err(|_|invalid())?;
                    let verified=OpenedP1g::open(&encrypted).is_ok_and(|r|r.profile==draft.patched_json.as_bytes());
                    encrypted.zeroize();if !verified{return Err(invalid());}
                }
                Ok(serde_json::json!({"contract":"wand.db05.room-finish-preview@1","changed":true,"reopenVerified":true,"untouchedBytesPreserved":true,"inventoryUnchanged":true,"currentBuildRuntimeVerified":false,"exportAuthorized":false}).to_string())
            })();
            draft.patched_json.zeroize();result
        }
        pub fn prepare_indoor_finish_experimental_copy(&mut self,plan:&str,allow_experimental_copy:bool)->Result<u32,JsValue>{
            if !allow_experimental_copy{return Err(fail("DB05_EXPERIMENTAL_COPY_NOT_ALLOWED"));}
            if !self.ready||self.closed||self.copy_prepared{return Err(fail("DB05_INDOOR_NOT_OPEN"));}
            let source=match self.kind{
                InputKind::PlainJson=>self.pending.as_slice(),
                InputKind::EncryptedP1g=>self.p1g.as_ref().ok_or(fail("DB05_INDOOR_NOT_OPEN"))?.profile.as_slice()
            };
            let mut draft=indoor_room_view::finish_candidate(source,plan).map_err(|_|fail("DB05_ROOM_FINISH_REJECTED"))?;
            if !draft.changed||!draft.untouched_bytes_preserved||draft.export_authorized||draft.writer_authorized{
                draft.patched_json.zeroize();return Err(fail("DB05_ROOM_FINISH_REOPEN"));
            }
            self.prepare_copy_from_patched(draft.patched_json,true)
        }
        pub fn prepare_indoor_room_rename_experimental_copy(&mut self,plan:&str,allow_experimental_copy:bool)->Result<u32,JsValue>{
            let invalid=||fail("DB05_ROOM_RENAME_INVALID");
            if !allow_experimental_copy||!self.ready||self.closed||self.copy_prepared||plan.len()>4096{return Err(invalid());}
            let source=match self.kind{InputKind::PlainJson=>self.pending.as_slice(),InputKind::EncryptedP1g=>self.p1g.as_ref().ok_or_else(invalid)?.profile.as_slice()};
            let mut draft=indoor_room_view::rename_candidate(source,plan).map_err(|_|invalid())?;
            if !draft.changed||!draft.untouched_bytes_preserved||draft.export_authorized||draft.writer_authorized{draft.patched_json.zeroize();return Err(invalid());}
            self.prepare_copy_from_patched(draft.patched_json,true)
        }
        pub fn prepare_indoor_room_resize_experimental_copy(&mut self,plan:&str,allow_experimental_copy:bool)->Result<u32,JsValue>{
            let invalid=||fail("DB05_ROOM_RESIZE_INVALID");
            if !allow_experimental_copy||!self.ready||self.closed||self.copy_prepared||plan.len()>4096{return Err(invalid());}
            let source=match self.kind{InputKind::PlainJson=>self.pending.as_slice(),InputKind::EncryptedP1g=>self.p1g.as_ref().ok_or_else(invalid)?.profile.as_slice()};
            let mut draft=indoor_room_view::resize_candidate(source,plan).map_err(|_|invalid())?;
            if !draft.changed||!draft.untouched_bytes_preserved||draft.export_authorized||draft.writer_authorized{draft.patched_json.zeroize();return Err(invalid());}
            self.prepare_copy_from_patched(draft.patched_json,true)
        }
        pub fn prepare_indoor_append_floor_experimental_copy(&mut self,plan:&str,allow_experimental_copy:bool)->Result<u32,JsValue>{
            let invalid=||fail("DB05_APPEND_FLOOR_INVALID");
            if !allow_experimental_copy||!self.ready||self.closed||self.copy_prepared||plan.len()>4096{return Err(invalid());}
            let source=match self.kind{InputKind::PlainJson=>self.pending.as_slice(),InputKind::EncryptedP1g=>self.p1g.as_ref().ok_or_else(invalid)?.profile.as_slice()};
            let mut draft=indoor_room_view::append_floor_candidate(source,plan).map_err(|_|invalid())?;
            if !draft.changed||!draft.untouched_bytes_preserved||draft.export_authorized||draft.writer_authorized{draft.patched_json.zeroize();return Err(invalid());}
            self.prepare_copy_from_patched(draft.patched_json,true)
        }
        pub fn prepare_indoor_add_room_experimental_copy(&mut self,plan:&str,allow_experimental_copy:bool)->Result<u32,JsValue>{
            let invalid=||fail("DB05_ADD_ROOM_INVALID");
            if !allow_experimental_copy||!self.ready||self.closed||self.copy_prepared||plan.len()>4096{return Err(invalid());}
            let source=match self.kind{InputKind::PlainJson=>self.pending.as_slice(),InputKind::EncryptedP1g=>self.p1g.as_ref().ok_or_else(invalid)?.profile.as_slice()};
            let mut draft=indoor_room_view::add_room_candidate(source,plan).map_err(|_|invalid())?;
            if !draft.changed||!draft.untouched_bytes_preserved||draft.export_authorized||draft.writer_authorized{draft.patched_json.zeroize();return Err(invalid());}
            self.prepare_copy_from_patched(draft.patched_json,true)
        }
        pub fn prepare_indoor_remove_room_experimental_copy(&mut self,plan:&str,allow_experimental_copy:bool)->Result<u32,JsValue>{
            let invalid=||fail("DB05_REMOVE_ROOM_INVALID");
            if !allow_experimental_copy||!self.ready||self.closed||self.copy_prepared||plan.len()>4096{return Err(invalid());}
            let source=match self.kind{InputKind::PlainJson=>self.pending.as_slice(),InputKind::EncryptedP1g=>self.p1g.as_ref().ok_or_else(invalid)?.profile.as_slice()};
            let mut draft=indoor_room_view::remove_room_candidate(source,plan).map_err(|_|invalid())?;
            if !draft.changed||!draft.untouched_bytes_preserved||draft.export_authorized||draft.writer_authorized{draft.patched_json.zeroize();return Err(invalid());}
            self.prepare_copy_from_patched(draft.patched_json,true)
        }
        pub fn prepare_indoor_furniture_experimental_copy(&mut self,plan:&str,allow_experimental_copy:bool)->Result<u32,JsValue>{
            let invalid=||fail("DB05_INDOOR_FURNITURE_INVALID");
            if !allow_experimental_copy||!self.ready||self.closed||self.copy_prepared||plan.len()>32768{return Err(invalid());}
            let source=match self.kind{InputKind::PlainJson=>self.pending.as_slice(),InputKind::EncryptedP1g=>self.p1g.as_ref().ok_or_else(invalid)?.profile.as_slice()};
            let draft=indoor_room_view::furniture_candidate(source,plan).map_err(|_|invalid())?;
            self.prepare_copy_from_patched(draft.patched_json,true)
        }
        pub fn prepare_room_project_experimental_copy(&mut self,plan:&str,allow_experimental_copy:bool)->Result<u32,JsValue>{
            let invalid=||fail("DB05_ROOM_PROJECT_INVALID");
            if !allow_experimental_copy||!self.ready||self.closed||self.copy_prepared||plan.len()>128*1024{return Err(invalid());}
            let source=match self.kind{InputKind::PlainJson=>self.pending.as_slice(),InputKind::EncryptedP1g=>self.p1g.as_ref().ok_or_else(invalid)?.profile.as_slice()};
            let patched=indoor_room_view::room_project_candidate(source,plan).map_err(|_|invalid())?;
            self.prepare_copy_from_patched(patched,true)
        }
        pub fn export_private_storage_contents(&self,scope:&str)->Result<String,JsValue>{
            let invalid=||fail("DB05_STORAGE_BACKUP_INVALID");
            if !self.ready||self.closed{return Err(invalid());}
            let source=match self.kind{InputKind::PlainJson=>self.pending.as_slice(),InputKind::EncryptedP1g=>self.p1g.as_ref().ok_or_else(invalid)?.profile.as_slice()};
            let grids=crate::private_storage_scope::resolve(source,scope).map_err(|_|invalid())?;
            ddv_save_patch::storage_backup::export_scoped(std::str::from_utf8(source).map_err(|_|invalid())?,grids.as_ref()).map_err(|_|invalid())
        }
        pub fn prepare_private_decoration_copy(&mut self,kind:&str,plan:&str,backup:&str,scope:&str,allow_experimental_copy:bool)->Result<u32,JsValue>{
            let invalid=||fail("DB05_PRIVATE_DECORATION_INVALID");
            if !allow_experimental_copy||!self.ready||self.closed||self.copy_prepared||plan.len()>4*1024*1024||backup.len()>4*1024*1024{return Err(invalid());}
            let source=match self.kind{InputKind::PlainJson=>self.pending.as_slice(),InputKind::EncryptedP1g=>self.p1g.as_ref().ok_or_else(invalid)?.profile.as_slice()};
            let scope_value:serde_json::Value=serde_json::from_str(scope).map_err(|_|invalid())?;
            let scope_kind=scope_value["kind"].as_str().ok_or_else(invalid)?;
            if !matches!((kind,scope_kind),("indoor-room-project-export","room"|"floor"|"building")|("biome-furniture-export"|"island-furniture-export"|"island-decoration-export","outdoor")|("island-decoration-export","region-poses")){return Err(invalid());}
            let grid_scope=if scope_kind=="region-poses"{
                let areas=scope_value["areas"].as_array().ok_or_else(invalid)?;
                serde_json::json!({"kind":"outdoor","destinations":areas.iter().map(|a|a["destination"].clone()).collect::<Vec<_>>()}).to_string()
            }else{scope.to_owned()};
            let grids=crate::private_storage_scope::resolve(source,&grid_scope).map_err(|_|invalid())?;
            let draft=zeroize::Zeroizing::new(if plan=="null"{std::str::from_utf8(source).map_err(|_|invalid())?.to_owned()}else{match kind{
              "indoor-room-project-export"=>indoor_room_view::room_project_candidate(source,plan),
              "biome-furniture-export"=>grid_instance_preview::biome_furniture_candidate(source,plan),
              "island-furniture-export"=>grid_instance_preview::island_furniture_candidate(source,plan),
              "island-decoration-export"=>grid_instance_preview::island_decoration_candidate(source,plan),
              _=>return Err(invalid())
            }.map_err(|_|invalid())?});
            let after=crate::private_storage_scope::resolve(draft.as_bytes(),scope).map_err(|_|invalid())?;
            if grids!=crate::private_storage_scope::resolve(draft.as_bytes(),&grid_scope).map_err(|_|invalid())?{return Err(invalid());}
            let patched=ddv_save_patch::storage_backup::restore_scoped_mode(&draft,backup,after.as_ref(),plan!="null",true).map_err(|_|invalid())?;
            self.prepare_copy_from_patched(patched,true)
        }
        pub fn prepare_private_storage_contents_copy(&mut self,backup:&str,scope:&str,allow_experimental_copy:bool)->Result<u32,JsValue>{
            let invalid=||fail("DB05_STORAGE_RESTORE_INVALID");
            if !allow_experimental_copy||!self.ready||self.closed||self.copy_prepared{return Err(invalid());}
            let source=match self.kind{InputKind::PlainJson=>self.pending.as_slice(),InputKind::EncryptedP1g=>self.p1g.as_ref().ok_or_else(invalid)?.profile.as_slice()};
            let grids=crate::private_storage_scope::resolve(source,scope).map_err(|_|invalid())?;
            let patched=ddv_save_patch::storage_backup::restore_scoped(std::str::from_utf8(source).map_err(|_|invalid())?,backup,grids.as_ref()).map_err(|_|invalid())?;
            self.prepare_copy_from_patched(patched,true)
        }
        pub fn list_indoor_rooms(&self)->Result<String,JsValue>{
            if !self.ready||self.closed{return Err(fail("DB05_INDOOR_NOT_OPEN"));}
            let source=match self.kind{
                InputKind::PlainJson=>self.pending.as_slice(),
                InputKind::EncryptedP1g=>self.p1g.as_ref().ok_or(fail("DB05_INDOOR_NOT_OPEN"))?.profile.as_slice()
            };
            indoor_room_view::project(source).map_err(|_|fail("DB05_INDOOR_UNAVAILABLE"))
        }
        pub fn list_native_presets(&self)->Result<String,JsValue>{
            if !self.ready||self.closed{return Err(fail("DB05_PRESET_NOT_OPEN"));}
            let source=match self.kind{InputKind::PlainJson=>self.pending.as_slice(),InputKind::EncryptedP1g=>self.p1g.as_ref().ok_or(fail("DB05_PRESET_NOT_OPEN"))?.profile.as_slice()};
            native_preset_backup::list(source).map_err(|_|fail("DB05_PRESET_UNAVAILABLE"))
        }
        pub fn export_native_preset_backup(&self,ordinal:u32)->Result<String,JsValue>{
            if !self.ready||self.closed{return Err(fail("DB05_PRESET_NOT_OPEN"));}
            let source=match self.kind{InputKind::PlainJson=>self.pending.as_slice(),InputKind::EncryptedP1g=>self.p1g.as_ref().ok_or(fail("DB05_PRESET_NOT_OPEN"))?.profile.as_slice()};
            native_preset_backup::export(source,ordinal as usize).map_err(|_|fail("DB05_PRESET_UNAVAILABLE"))
        }
        pub fn prepare_native_decoration_experimental_copy(&mut self,backup:&str,allow_experimental_copy:bool)->Result<u32,JsValue>{
            let invalid=||fail("DB05_NATIVE_DECORATION_REJECTED");
            if !allow_experimental_copy||!self.ready||self.closed||self.copy_prepared{return Err(invalid());}
            let original=match self.kind{InputKind::PlainJson=>self.pending.as_slice(),InputKind::EncryptedP1g=>self.p1g.as_ref().ok_or_else(invalid)?.profile.as_slice()};
            let patched=native_preset_backup::decoration_restore_candidate(original,backup).map_err(|_|invalid())?;
            self.prepare_copy_from_patched(patched,true)
        }
        pub fn prepare_native_decoration_replace_experimental_copy(&mut self,backup:&str,slot:u32,allow_experimental_copy:bool)->Result<u32,JsValue>{
            let invalid=||fail("DB05_NATIVE_DECORATION_REPLACE_REJECTED");
            if !allow_experimental_copy||!self.ready||self.closed||self.copy_prepared{return Err(invalid());}
            let original=match self.kind{InputKind::PlainJson=>self.pending.as_slice(),InputKind::EncryptedP1g=>self.p1g.as_ref().ok_or_else(invalid)?.profile.as_slice()};
            let patched=native_preset_backup::decoration_replace_candidate(original,backup,slot as usize).map_err(|_|invalid())?;
            self.prepare_copy_from_patched(patched,true)
        }
        pub fn prepare_tom_restore_experimental_copy(&mut self,backup:&str,allow_experimental_copy:bool)->Result<u32,JsValue>{
            let invalid=||fail("DB05_TOM_TEST_COPY_REJECTED");
            if !allow_experimental_copy||!self.ready||self.closed||self.copy_prepared{return Err(invalid());}
            let original=match self.kind{InputKind::PlainJson=>self.pending.as_slice(),InputKind::EncryptedP1g=>self.p1g.as_ref().ok_or_else(invalid)?.profile.as_slice()};
            let patched=native_preset_backup::tom_test_candidate(original,backup).map_err(|_|invalid())?;
            self.prepare_copy_from_patched(patched,true)
        }
        pub fn rehearse_tom_restore(&self,backup:&str)->Result<String,JsValue>{
            let invalid=||fail("DB05_TOM_REHEARSAL_REJECTED");
            if !self.ready||self.closed||self.copy_prepared{return Err(invalid());}
            let original=match self.kind{InputKind::PlainJson=>self.pending.as_slice(),InputKind::EncryptedP1g=>self.p1g.as_ref().ok_or_else(invalid)?.profile.as_slice()};
            let mut patched=native_preset_backup::tom_restore_rehearsal(original,backup).map_err(|_|invalid())?;
            let result=(||->Result<String,JsValue>{
                validate_profile(patched.as_bytes()).map_err(|_|invalid())?;
                if matches!(self.kind,InputKind::EncryptedP1g){
                    let opened=self.p1g.as_ref().ok_or_else(invalid)?;
                    let mut archive=rezip_profile(&opened.original_zip,&opened.layout,patched.as_bytes()).map_err(|_|invalid())?;
                    let encrypted=ecb_encrypt(&archive);archive.zeroize();
                    let mut encrypted=encrypted.map_err(|_|invalid())?;
                    let verified=OpenedP1g::open(&encrypted).is_ok_and(|r|r.profile==patched.as_bytes());
                    encrypted.zeroize();if !verified{return Err(invalid());}
                }
                Ok(serde_json::json!({"contract":"wand.native-preset-rehearsal@1","kind":"tom","freshAllocation":true,"reopenVerified":true,"capacityVerified":false,"ownershipVerified":false,"runtimeVerified":false,"writerAuthorized":false}).to_string())
            })();
            patched.zeroize();result
        }
        pub fn review_native_preset_restore(&self,backup:&str)->Result<String,JsValue>{
            if !self.ready||self.closed{return Err(fail("DB05_PRESET_NOT_OPEN"));}
            let source=match self.kind{InputKind::PlainJson=>self.pending.as_slice(),InputKind::EncryptedP1g=>self.p1g.as_ref().ok_or(fail("DB05_PRESET_NOT_OPEN"))?.profile.as_slice()};
            native_preset_backup::review(source,backup).map_err(|_|fail("DB05_PRESET_REVIEW_REJECTED"))
        }
        pub fn list_detached_player_houses(&self)->Result<String,JsValue>{
            if !self.ready||self.closed{return Err(fail("DB05_HOUSE_NOT_OPEN"));}
            let source=match self.kind{InputKind::PlainJson=>self.pending.as_slice(),InputKind::EncryptedP1g=>self.p1g.as_ref().ok_or(fail("DB05_HOUSE_NOT_OPEN"))?.profile.as_slice()};
            grid_instance_preview::detached_player_houses_json(source).map_err(|_|fail("DB05_HOUSE_UNAVAILABLE"))
        }
        pub fn list_furniture_catalog_stock(&self)->Result<String,JsValue>{
            if !self.ready||self.closed{return Err(fail("DB05_FURNITURE_STOCK_NOT_OPEN"));}
            let source=match self.kind{
                InputKind::PlainJson=>self.pending.as_slice(),
                InputKind::EncryptedP1g=>self.p1g.as_ref().ok_or(fail("DB05_FURNITURE_STOCK_NOT_OPEN"))?.profile.as_slice()
            };
            furniture_catalog_stock_json(source).map_err(|_|fail("DB05_FURNITURE_CATALOG_UNAVAILABLE"))
        }
        pub fn list_existing_slots(&self)->Result<String,JsValue>{
            if !self.ready || self.closed {
                return Err(fail("DB05_SLOT_INDEX_NOT_OPEN"));
            }
            let source=match self.kind {
                InputKind::PlainJson=>self.pending.as_slice(),
                InputKind::EncryptedP1g=>self.p1g.as_ref()
                    .ok_or(fail("DB05_SLOT_INDEX_NOT_OPEN"))?.profile.as_slice()
            };
            slot_index_json(source).map_err(|_|fail("DB05_SLOT_INDEX_INVALID"))
        }
        /// Preview only: the same strict JSON patch/repack/reopen as the
        /// explicit copy path. WASM remains the owner of the candidate bytes.
        pub fn preview_grid_coordinates(&mut self,plan:&str)->Result<String,JsValue>{
            self.prepare_grid_coordinate_copy(plan)?;
            Ok(r#"{"contract":"wand.db05.grid-coordinate-preview@1","changed":true,
              "lexicalBytesPreserved":true,"reopenVerified":true,
              "writerAuthorized":false,"exportAuthorized":false}"#.to_owned())
        }
        /// Explicit local COPY preparation. The UI supplies only an ephemeral
        /// ordinal and original Item ID/X/Y; real grid/object IDs never leave
        /// Rust, and stale/ambiguous selections are rejected.
        pub fn prepare_grid_coordinate_copy(&mut self,plan:&str)->Result<u32,JsValue>{
            if !self.ready||self.closed||self.copy_prepared{
                return Err(fail("DB05_GRID_EDIT_SESSION_INVALID"));
            }
            let p=parse_grid_coordinate_plan(plan)?;
            let original=match self.kind{
                InputKind::PlainJson=>self.pending.as_slice(),
                InputKind::EncryptedP1g=>self.p1g.as_ref()
                    .ok_or(fail("DB05_GRID_EDIT_SESSION_INVALID"))?
                    .profile.as_slice()
            };
            let target=grid_instance_preview::resolve_grid_coordinate_target(
                original,p.ordinal,p.item_id,p.expected,&p.kind
            ).map_err(|_|fail("DB05_GRID_EDIT_STALE_OR_AMBIGUOUS"))?;
            let json=std::str::from_utf8(original)
                .map_err(|_|fail("DB05_GRID_EDIT_INVALID_UTF8"))?;
            grid_instance_preview::validate_exclusive_grid_moves(original,&[(&target,p.replacement)])
                .map_err(|_|fail("DB05_GRID_EXCLUSIVE_ANCHOR_CONFLICT_OR_UNRESOLVED"))?;
            let draft=preview_existing_grid_coordinates(
                json,target,p.expected,p.replacement
            ).map_err(|_|fail("DB05_GRID_EDIT_STALE_OR_INVALID"))?;
            if !draft.changed||!draft.untouched_bytes_preserved||
               draft.writer_authorized||draft.export_authorized{
                return Err(fail("DB05_GRID_EDIT_NOOP_OR_UNAUTHORIZED"));
            }
            self.prepare_copy_from_patched(draft.patched_json,true)
        }

        /// All-or-nothing 1..=16 Grid object moves, with native IDs resolved
        /// only inside Rust; no Save identity is sent to the UI.
        pub fn preview_grid_coordinate_batch(
            &mut self,plan:&str
        )->Result<String,JsValue>{
            let changed=parse_grid_coordinate_batch_plan(plan)?.len();
            self.prepare_grid_coordinate_batch_copy(plan)?;
            Ok(format!(concat!(
                r#"{{"contract":"wand.db05.grid-coordinate-batch-preview@1","#,
                r#""changedCount":{},"lexicalBytesPreserved":true,"#,
                r#""reopenVerified":true,"writerAuthorized":false,"#,
                r#""exportAuthorized":false}}"#
            ),changed))
        }

        /// Experimental copy only. Any stale or duplicate item/coordinate
        /// aborts the whole batch before building the P1G or JSON copy.
        pub fn prepare_grid_coordinate_batch_copy(
            &mut self,plan:&str
        )->Result<u32,JsValue>{
            if !self.ready||self.closed||self.copy_prepared{
                return Err(fail("DB05_GRID_BATCH_SESSION_INVALID"));
            }
            let choices=parse_grid_coordinate_batch_plan(plan)?;
            let original=match self.kind{
                InputKind::PlainJson=>self.pending.as_slice(),
                InputKind::EncryptedP1g=>self.p1g.as_ref()
                    .ok_or(fail("DB05_GRID_BATCH_SESSION_INVALID"))?
                    .profile.as_slice()
            };
            let selections=choices.iter().map(|p|
                (p.ordinal,p.item_id,p.expected,p.kind.clone())
            ).collect::<Vec<_>>();
            let targets=grid_instance_preview::resolve_grid_coordinate_targets(
                original,&selections
            ).map_err(|_|fail("DB05_GRID_BATCH_STALE_OR_AMBIGUOUS"))?;
            let json=std::str::from_utf8(original)
                .map_err(|_|fail("DB05_GRID_BATCH_UTF8_INVALID"))?;
            let edits=choices.iter().zip(targets).map(|(p,target)|
                GridCoordinateEdit{target,expected:p.expected,
                    replacement:p.replacement}
            ).collect::<Vec<_>>();
            let moves=edits.iter().map(|e|(&e.target,e.replacement)).collect::<Vec<_>>();
            grid_instance_preview::validate_exclusive_grid_moves(original,&moves)
                .map_err(|_|fail("DB05_GRID_EXCLUSIVE_ANCHOR_CONFLICT_OR_UNRESOLVED"))?;
            let draft=preview_existing_grid_coordinate_batch(json,&edits)
                .map_err(|_|fail("DB05_GRID_BATCH_STALE_OR_INVALID"))?;
            if !draft.changed||!draft.untouched_bytes_preserved||
               draft.writer_authorized||draft.export_authorized{
                return Err(fail("DB05_GRID_BATCH_UNAUTHORIZED"));
            }
            self.prepare_copy_from_patched(draft.patched_json,true)
        }

        /// Exact-string native cardinal rotation preview. An independent
        /// JSON/P1G reopen is performed before reporting success. Preview
        /// never exposes the rebuilt candidate bytes to TypeScript.
        pub fn preview_grid_orientation(&mut self,plan:&str)->Result<String,JsValue>{
            self.prepare_grid_orientation_copy(plan)?;
            Ok(r#"{"contract":"wand.db05.grid-orientation-preview@1",
              "changed":true,"lexicalBytesPreserved":true,
              "reopenVerified":true,"writerAuthorized":false,
              "exportAuthorized":false,"placementLegalityVerified":false}"#
                .to_owned())
        }
        /// Experimental local COPY only. Native Grid/Object IDs remain
        /// private inside Rust; the caller cannot submit them as a target.
        pub fn prepare_grid_orientation_copy(&mut self,plan:&str)->Result<u32,JsValue>{
            if !self.ready||self.closed||self.copy_prepared{
                return Err(fail("DB05_ORIENTATION_SESSION_INVALID"));
            }
            let p=parse_grid_orientation_plan(plan)?;
            let original=match self.kind{
                InputKind::PlainJson=>self.pending.as_slice(),
                InputKind::EncryptedP1g=>self.p1g.as_ref()
                    .ok_or(fail("DB05_ORIENTATION_SESSION_INVALID"))?
                    .profile.as_slice()
            };
            let target=grid_instance_preview::resolve_grid_orientation_target(
                original,p.ordinal,p.item_id,p.expected,&p.kind,
                &p.expected_orientation
            ).map_err(|_|fail("DB05_ORIENTATION_STALE_OR_AMBIGUOUS"))?;
            let json=std::str::from_utf8(original)
                .map_err(|_|fail("DB05_ORIENTATION_SOURCE_INVALID"))?;
            let draft=preview_existing_grid_orientation(
                json,target,&p.expected_orientation,&p.replacement_orientation
            ).map_err(|_|fail("DB05_ORIENTATION_STALE_OR_INVALID"))?;
            if !draft.changed||!draft.untouched_bytes_preserved||
               draft.writer_authorized||draft.export_authorized{
                return Err(fail("DB05_ORIENTATION_UNAUTHORIZED"));
            }
            self.prepare_copy_from_patched(draft.patched_json,true)
        }

        /// Simultaneous X/Y + cardinal orientation edit on exactly one
        /// existing object. Neither input nor receipt carries private Grid IDs.
        pub fn preview_grid_transform(&mut self,plan:&str)->Result<String,JsValue>{
            self.prepare_grid_transform_copy(plan)?;
            Ok(r#"{"contract":"wand.db05.grid-transform-preview@1",
              "changed":true,"lexicalBytesPreserved":true,
              "reopenVerified":true,"writerAuthorized":false,
              "exportAuthorized":false,"placementLegalityVerified":false}"#
                .to_owned())
        }

        /// Only an explicit experimental COPY can transfer rebuilt P1G bytes.
        /// The original profile is never changed; any stale original field
        /// rejects all three token edits before repacking.
        pub fn prepare_grid_transform_copy(&mut self,plan:&str)->Result<u32,JsValue>{
            if !self.ready||self.closed||self.copy_prepared{
                return Err(fail("DB05_GRID_TRANSFORM_SESSION_INVALID"));
            }
            let (p,o)=parse_grid_transform_plan(plan)?;
            let original=match self.kind{
                InputKind::PlainJson=>self.pending.as_slice(),
                InputKind::EncryptedP1g=>self.p1g.as_ref()
                    .ok_or(fail("DB05_GRID_TRANSFORM_SESSION_INVALID"))?
                    .profile.as_slice()
            };
            let target=grid_instance_preview::resolve_grid_orientation_target(
                original,p.ordinal,p.item_id,p.expected,&p.kind,
                &o.expected_orientation
            ).map_err(|_|fail("DB05_GRID_TRANSFORM_STALE_OR_AMBIGUOUS"))?;
            let json=std::str::from_utf8(original)
                .map_err(|_|fail("DB05_GRID_TRANSFORM_UTF8_INVALID"))?;
            grid_instance_preview::validate_exclusive_grid_moves(original,&[(&target,p.replacement)])
                .map_err(|_|fail("DB05_GRID_EXCLUSIVE_ANCHOR_CONFLICT_OR_UNRESOLVED"))?;
            let draft=preview_existing_grid_transform(
                json,target,p.expected,p.replacement,
                &o.expected_orientation,&o.replacement_orientation
            ).map_err(|_|fail("DB05_GRID_TRANSFORM_STALE_OR_INVALID"))?;
            if !draft.changed||!draft.untouched_bytes_preserved||
               draft.writer_authorized||draft.export_authorized{
                return Err(fail("DB05_GRID_TRANSFORM_UNAUTHORIZED"));
            }
            self.prepare_copy_from_patched(draft.patched_json,true)
        }

        /// Local structural rehearsal only. Never prepare or return copy bytes.
        pub fn preview_plain_grid_structure(&self,plan:&str)->Result<String,JsValue>{
            if !self.ready||self.closed||self.copy_prepared||plan.len()>4096{
                return Err(fail("DB05_GRID_STRUCTURE_SESSION_INVALID"));
            }
            let invalid=||fail("DB05_GRID_STRUCTURE_PLAN_INVALID");
            let value:serde_json::Value=serde_json::from_str(plan).map_err(|_|invalid())?;
            let o=value.as_object().ok_or_else(invalid)?;
            if o.len()!=7||o.keys().any(|k|!matches!(k.as_str(),"localOrdinal"|"itemId"|"expectedX"|"expectedY"|"action"|"x"|"y")){
                return Err(invalid());
            }
            let ordinal=o.get("localOrdinal").and_then(|v|v.as_u64()).and_then(|v|usize::try_from(v).ok()).ok_or_else(invalid)?;
            let item=o.get("itemId").and_then(|v|v.as_str()).and_then(|v|v.parse::<u64>().ok()).ok_or_else(invalid)?;
            let int=|key:&str|o.get(key).and_then(|v|v.as_i64()).and_then(|v|i32::try_from(v).ok()).ok_or_else(invalid);
            let expected=(int("expectedX")?,int("expectedY")?);
            let action=match o.get("action").and_then(|v|v.as_str()){
                Some("duplicate")=>ddv_save_patch::PlainGridStructureAction::Duplicate{x:int("x")?,y:int("y")?},
                Some("remove") if o.get("x").is_some_and(|v|v.is_null())&&o.get("y").is_some_and(|v|v.is_null())=>ddv_save_patch::PlainGridStructureAction::Remove,
                _=>return Err(invalid())
            };
            let original=match self.kind{
                InputKind::PlainJson=>self.pending.as_slice(),
                InputKind::EncryptedP1g=>self.p1g.as_ref().ok_or(fail("DB05_GRID_STRUCTURE_SESSION_INVALID"))?.profile.as_slice()
            };
            let target=grid_instance_preview::resolve_grid_mixed_targets(original,&[(ordinal,item,expected,"full".to_owned(),None)])
                .map_err(|_|fail("DB05_GRID_STRUCTURE_STALE"))?.pop().ok_or_else(invalid)?;
            if matches!(action,ddv_save_patch::PlainGridStructureAction::Remove){
                let dependencies=grid_instance_preview::grid_identity_dependencies(original,&target)
                    .map_err(|_|fail("DB05_GRID_STRUCTURE_DEPENDENCIES_UNRESOLVED"))?;
                if dependencies.blocking()>0{return Err(fail("DB05_GRID_STRUCTURE_DEPENDENCY_BLOCKED"));}
            }
            let json=std::str::from_utf8(original).map_err(|_|invalid())?;
            let mut draft=ddv_save_patch::preview_plain_grid_structure(json,&target,expected,action)
                .map_err(|_|fail("DB05_GRID_STRUCTURE_UNSUPPORTED"))?;
            let valid=validate_profile(draft.patched_json.as_bytes()).is_ok()&&draft.changed&&draft.untouched_bytes_preserved&&!draft.writer_authorized&&!draft.export_authorized;
            draft.patched_json.zeroize();
            if !valid{return Err(fail("DB05_GRID_STRUCTURE_INVALID_DRAFT"));}
            Ok(r#"{"contract":"wand.db05.grid-structure-preview@1","changed":true,"lexicalBytesPreserved":true,"structureValidated":true,"exportAuthorized":false,"runtimeReferencesVerified":false}"#.to_owned())
        }

        /// Private transfer rehearsal. Never returns native IDs, draft bytes,
        /// or export authority. Source and destination are independently resolved.
        fn grid_transfer_candidate(&self,plan:&str)->Result<ddv_save_patch::GridCoordinateDraft,JsValue>{
            if !self.ready||self.closed||self.copy_prepared||plan.len()>8192{
                return Err(fail("DB05_GRID_TRANSFER_SESSION_INVALID"));
            }
            let invalid=||fail("DB05_GRID_TRANSFER_PLAN_INVALID");
            let v:serde_json::Value=serde_json::from_str(plan).map_err(|_|invalid())?;
            let o=v.as_object().ok_or_else(invalid)?;
            if o.contains_key("freePlacement"){
                if o.get("freePlacement").and_then(|v|v.as_bool())!=Some(true)||o.contains_key("crossWorld"){return Err(invalid());}
                let mut row=o.clone();row.remove("freePlacement");
                let original=match self.kind{
                    InputKind::PlainJson=>self.pending.as_slice(),
                    InputKind::EncryptedP1g=>self.p1g.as_ref().ok_or(fail("DB05_GRID_TRANSFER_SESSION_INVALID"))?.profile.as_slice()
                };
                let group=serde_json::json!({"freePlacement":true,"rows":[row]});
                let mut patched_json=grid_instance_preview::group_cut_candidate(original,&group.to_string())
                    .map_err(|_|fail("DB05_GRID_TRANSFER_UNSUPPORTED"))?;
                if validate_profile(patched_json.as_bytes()).is_err(){patched_json.zeroize();return Err(fail("DB05_GRID_TRANSFER_INVALID_DRAFT"));}
                return Ok(ddv_save_patch::GridCoordinateDraft{patched_json,changed:true,untouched_bytes_preserved:true,writer_authorized:false,export_authorized:false});
            }
            let world_change=match o.get("crossWorld"){None=>None,Some(v)=>Some(v.as_str().filter(|s|matches!(*s,"move"|"duplicate")).ok_or_else(invalid)?)};
            if o.len()!=9+usize::from(world_change.is_some())||o.keys().any(|k|!matches!(k.as_str(),"localOrdinal"|"itemId"|"expectedX"|"expectedY"|"expectedOrientation"|"destination"|"x"|"y"|"orientation"|"crossWorld")){return Err(invalid());}
            let ordinal=o.get("localOrdinal").and_then(|v|v.as_u64()).and_then(|v|usize::try_from(v).ok()).ok_or_else(invalid)?;
            let item=o.get("itemId").and_then(|v|v.as_str()).and_then(|v|v.parse::<u64>().ok()).ok_or_else(invalid)?;
            let int=|key:&str|o.get(key).and_then(|v|v.as_i64()).and_then(|v|i32::try_from(v).ok()).ok_or_else(invalid);
            let text=|key:&str|o.get(key).and_then(|v|v.as_str()).ok_or_else(invalid);
            let expected=(int("expectedX")?,int("expectedY")?);
            let original=match self.kind{
                InputKind::PlainJson=>self.pending.as_slice(),
                InputKind::EncryptedP1g=>self.p1g.as_ref().ok_or(fail("DB05_GRID_TRANSFER_SESSION_INVALID"))?.profile.as_slice()
            };
            let house=item/100_000==205;
            let building=matches!(item/100_000,200..=203);
            if world_change.is_some()&&!building&&!house{return Err(invalid());}
            let character_copy=world_change==Some("duplicate")&&grid_instance_preview::character_house_exterior(item);
            let target=if house||character_copy{
                grid_instance_preview::resolve_grid_coordinate_target(original,ordinal,item,expected,"full")
                    .map_err(|_|fail("DB05_GRID_TRANSFER_STALE"))?
            }else{
                grid_instance_preview::resolve_grid_mixed_targets(original,&[(ordinal,item,expected,"full".to_owned(),Some(text("expectedOrientation")?.to_owned()))])
                    .map_err(|_|fail("DB05_GRID_TRANSFER_STALE"))?.pop().ok_or_else(invalid)?
            };
            let dependencies=grid_instance_preview::grid_identity_dependencies(original,&target)
                .map_err(|_|fail("DB05_GRID_TRANSFER_DEPENDENCIES_UNRESOLVED"))?;
            if if character_copy{dependencies.active+dependencies.related+dependencies.unknown>0}else{dependencies.blocking()>0||((house||building||item/100_000==402)&&dependencies.historical>0)}{return Err(fail("DB05_GRID_TRANSFER_DEPENDENCY_BLOCKED"));}
            let dest=grid_instance_preview::resolve_plain_grid_destination(original,o.get("destination").ok_or_else(invalid)?)
                .map_err(|_|fail("DB05_GRID_TRANSFER_DESTINATION_UNRESOLVED"))?;
            let json=std::str::from_utf8(original).map_err(|_|invalid())?;
            let landscape=item/100_000==402;
            let mut draft=if grid_instance_preview::character_house_exterior(item){
                if text("expectedOrientation")?!=text("orientation")?{return Err(invalid());}
                if world_change!=Some("duplicate"){grid_instance_preview::character_house_move_candidate(original,&target,expected,&dest,(int("x")?,int("y")?),text("orientation")?,world_change.is_some())}else{grid_instance_preview::character_house_copy_candidate(original,&target,expected,&dest,(int("x")?,int("y")?),text("expectedOrientation")?,text("orientation")?,true)}
                    .map_err(|_|fail("DB05_GRID_TRANSFER_UNSUPPORTED"))?
            }else{if house||building||landscape{
                let root:serde_json::Value=serde_json::from_slice(original).map_err(|_|invalid())?;
                let (source_scope,dest_scope)=if house{
                    let from=grid_instance_preview::house_exterior_identity(&root,&target.grid_id).map_err(|_|invalid())?;
                    let to=grid_instance_preview::house_exterior_identity(&root,&dest.grid_id).map_err(|_|invalid())?;
                    if to.1!=dest.layout_path||from.2!=to.2||to.2!=u64::from(dest.tessellation){return Err(invalid());}
                    (from.0,to.0)
                }else{(grid_instance_preview::player_house_grid_scope(&root,&target.grid_id).map_err(|_|invalid())?,
                     grid_instance_preview::player_house_grid_scope(&root,&dest.grid_id).map_err(|_|invalid())?)};
                if root["GameInfo"]["Version"].as_u64()!=Some(643)||text("expectedOrientation")?!=text("orientation")?||(source_scope!=dest_scope)!=world_change.is_some(){return Err(invalid());}
                if world_change.is_some()&&!house&&!grid_instance_preview::cross_world_building_state(item,root["World"]["GridCollection"]["Grids"][&target.grid_id]["Objects"][&target.object_id].get("State")){return Err(invalid());}
                let source_size=grid_instance_preview::building_transform_grid_size(&root,&target.grid_id).map_err(|_|invalid())?;
                let dest_size=grid_instance_preview::building_transform_grid_size(&root,&dest.grid_id).map_err(|_|invalid())?;
                if expected.0<0||expected.1<0||expected.0 as u64>=source_size.0||expected.1 as u64>=source_size.1||
                   dest_size!=(u64::from(dest.size.0)*u64::from(dest.tessellation),u64::from(dest.size.1)*u64::from(dest.tessellation)){return Err(invalid());}
                if let Some(mode)=world_change{if house{ddv_save_patch::preview_player_house_world_change(json,&target,expected,&dest,(int("x")?,int("y")?),text("orientation")?,mode=="duplicate")}else{ddv_save_patch::preview_checked_building_world_change(json,&target,expected,&dest,(int("x")?,int("y")?),text("orientation")?,mode=="duplicate")}}else if house{ddv_save_patch::preview_player_house_transfer(json,&target,expected,&dest,(int("x")?,int("y")?),text("orientation")?)}else if building{ddv_save_patch::preview_checked_building_transfer(json,&target,expected,&dest,(int("x")?,int("y")?),text("orientation")?)}else{ddv_save_patch::preview_plain_grid_transfer(json,&target,expected,&dest,(int("x")?,int("y")?),text("orientation")?)}
            }else{ddv_save_patch::preview_plain_grid_transfer(json,&target,expected,&dest,(int("x")?,int("y")?),text("orientation")?)}
                .map_err(|_|fail("DB05_GRID_TRANSFER_UNSUPPORTED"))?};
            if !draft.changed||!draft.untouched_bytes_preserved||draft.writer_authorized||draft.export_authorized||validate_profile(draft.patched_json.as_bytes()).is_err(){
                draft.patched_json.zeroize();return Err(fail("DB05_GRID_TRANSFER_INVALID_DRAFT"));
            }
            Ok(draft)
        }
        pub fn preview_plain_grid_transfer(&self,plan:&str)->Result<String,JsValue>{
            let mut draft=self.grid_transfer_candidate(plan)?;
            draft.patched_json.zeroize();
            Ok(r#"{"contract":"wand.db05.grid-transfer-preview@1","changed":true,"lexicalBytesPreserved":true,"structureValidated":true,"exportAuthorized":false,"runtimeReferencesVerified":false}"#.to_owned())
        }
        pub fn inspect_scene_network(&self,plan:&str)->Result<String,JsValue>{
            if !self.ready||self.closed{return Err(fail("DB05_SCENE_NETWORK_NOT_OPEN"));}
            let source=match self.kind{InputKind::PlainJson=>self.pending.as_slice(),InputKind::EncryptedP1g=>self.p1g.as_ref().ok_or(fail("DB05_SCENE_NETWORK_NOT_OPEN"))?.profile.as_slice()};
            grid_instance_preview::inspect_scene_network(source,plan).map_err(|_|fail("DB05_SCENE_NETWORK_INVALID"))
        }
        pub fn inspect_subgrid(&self,ordinal:u32,item:u32,x:i32,y:i32)->Result<String,JsValue>{
            if !self.ready||self.closed{return Err(fail("DB05_SUBGRID_NOT_OPEN"));}
            let source=match self.kind{InputKind::PlainJson=>self.pending.as_slice(),InputKind::EncryptedP1g=>self.p1g.as_ref().ok_or(fail("DB05_SUBGRID_NOT_OPEN"))?.profile.as_slice()};
            grid_instance_preview::inspect_subgrid_json(source,ordinal as usize,u64::from(item),(x,y)).map_err(|_|fail("DB05_SUBGRID_UNRESOLVED"))
        }
        pub fn prepare_support_child_experimental_copy(&mut self,plan:&str,allow_experimental_copy:bool)->Result<u32,JsValue>{
            let invalid=||fail("DB05_SUPPORT_CHILD_EDIT_INVALID");
            // Up to 32 exact source witnesses, including nested support paths.
            if !allow_experimental_copy||!self.ready||self.closed||self.copy_prepared||plan.len()>32768{return Err(invalid());}
            let v:serde_json::Value=serde_json::from_str(plan).map_err(|_|invalid())?;
            let source=match self.kind{InputKind::PlainJson=>self.pending.as_slice(),InputKind::EncryptedP1g=>self.p1g.as_ref().ok_or_else(invalid)?.profile.as_slice()};
            let draft=grid_instance_preview::support_child_candidate(source,&v).map_err(|_|invalid())?;
            self.prepare_copy_from_patched(draft.patched_json,true)
        }
        pub fn prepare_support_parent_experimental_copy(&mut self,plan:&str,allow_experimental_copy:bool)->Result<u32,JsValue>{
            let invalid=||fail("DB05_SUPPORT_PARENT_MOVE_INVALID");
            if !allow_experimental_copy||!self.ready||self.closed||self.copy_prepared||plan.len()>32768{return Err(invalid());}
            let v:serde_json::Value=serde_json::from_str(plan).map_err(|_|invalid())?;
            if v.get("createScene").and_then(serde_json::Value::as_bool)==Some(true){
                let o=v.as_object().filter(|o|o.len()==7&&o.keys().all(|k|matches!(k.as_str(),"createScene"|"itemId"|"x"|"y"|"orientation"|"destination"|"scene"))).ok_or_else(invalid)?;
                let item=o.get("itemId").and_then(|v|v.as_u64()).ok_or_else(invalid)?;
                let int=|k:&str|o.get(k).and_then(|v|v.as_i64()).and_then(|n|i32::try_from(n).ok()).ok_or_else(invalid);
                let source=match self.kind{InputKind::PlainJson=>self.pending.as_slice(),InputKind::EncryptedP1g=>self.p1g.as_ref().ok_or_else(invalid)?.profile.as_slice()};
                let draft=grid_instance_preview::support_scene_place_candidate(source,item,(int("x")?,int("y")?),o.get("destination").ok_or_else(invalid)?,o.get("orientation").and_then(|v|v.as_str()).ok_or_else(invalid)?,o.get("scene").ok_or_else(invalid)?).map_err(|_|invalid())?;
                return self.prepare_copy_from_patched(draft.patched_json,true);
            }
            let o=v.as_object().filter(|o|(7..=13).contains(&o.len())&&o.keys().all(|k|matches!(k.as_str(),"localOrdinal"|"itemId"|"expectedX"|"expectedY"|"x"|"y"|"destination"|"expectedOrientation"|"orientation"|"source"|"duplicate"|"scene"|"freePlacement"))).ok_or_else(invalid)?;
            let duplicate=match o.get("duplicate"){None=>false,Some(v)=>v.as_bool().filter(|b|*b).ok_or_else(invalid)?};
            let ordinal=o.get("localOrdinal").and_then(|v|v.as_u64()).and_then(|n|usize::try_from(n).ok()).ok_or_else(invalid)?;
            let item=o.get("itemId").and_then(|v|v.as_u64()).ok_or_else(invalid)?;
            let int=|k:&str|o.get(k).and_then(|v|v.as_i64()).and_then(|n|i32::try_from(n).ok()).ok_or_else(invalid);
            let source=match self.kind{InputKind::PlainJson=>self.pending.as_slice(),InputKind::EncryptedP1g=>self.p1g.as_ref().ok_or_else(invalid)?.profile.as_slice()};
            let turn=match (o.get("expectedOrientation"),o.get("orientation")){(None,None)=>None,(Some(a),Some(b))=>Some((a.as_str().ok_or_else(invalid)?,b.as_str().ok_or_else(invalid)?)),_=>return Err(invalid())};
            let expected=(int("expectedX")?,int("expectedY")?);let replacement=(int("x")?,int("y")?);let destination=o.get("destination").ok_or_else(invalid)?;
            let free=match o.get("freePlacement"){None=>false,Some(v)=>v.as_bool().filter(|b|*b).ok_or_else(invalid)?};
            let draft=if free{grid_instance_preview::free_support_parent_candidate(source,ordinal,item,expected,replacement,destination,turn,o.get("source"),duplicate,o.get("scene"))}else if let Some(scene)=o.get("scene"){
                if !duplicate{return Err(invalid());}
                grid_instance_preview::support_parent_scene_candidate(source,ordinal,item,expected,replacement,destination,turn,o.get("source"),scene)
            }else{
                let operation=if duplicate{grid_instance_preview::support_parent_duplicate_candidate}else{grid_instance_preview::support_parent_move_candidate};
                operation(source,ordinal,item,expected,replacement,destination,turn,o.get("source"))
            }.map_err(|_|invalid())?;
            self.prepare_copy_from_patched(draft.patched_json,true)
        }
        pub fn prepare_fence_erase_experimental_copy(&mut self,plan:&str,allow_experimental_copy:bool)->Result<u32,JsValue>{
            let invalid=||fail("DB05_FENCE_ERASE_INVALID");
            if !allow_experimental_copy||!self.ready||self.closed||self.copy_prepared||plan.len()>32768{return Err(invalid());}
            let v:serde_json::Value=serde_json::from_str(plan).map_err(|_|invalid())?;
            let o=v.as_object().filter(|o|(5..=7).contains(&o.len())&&o.keys().all(|k|matches!(k.as_str(),"destination"|"nodes"|"base"|"seed"|"erase"|"replacement"|"diagonal"))).ok_or_else(invalid)?;
            let diagonal=match o.get("diagonal"){None=>false,Some(v)=>v.as_bool().ok_or_else(invalid)?};
            use ddv_save_patch::fence_erase::FenceMutation;
            let action=match (o.get("erase").and_then(|v|v.as_bool()),o.get("replacement")){
                (Some(true),None)=>FenceMutation::Erase,
                (Some(false),None)=>FenceMutation::Connect,
                (Some(false),Some(v))=>FenceMutation::Replace(v.as_u64().and_then(|n|u32::try_from(n).ok()).ok_or_else(invalid)?),
                _=>return Err(invalid())
            };
            let base=o.get("base").and_then(|v|v.as_u64()).and_then(|n|u32::try_from(n).ok()).filter(|n|ddv_save_patch::fence_topology::supported_family(*n)).ok_or_else(invalid)?;
            let point=|v:&serde_json::Value|->Result<(i32,i32),JsValue>{
                let pair=v.as_array().filter(|a|a.len()==2).ok_or_else(invalid)?;
                let int=|i:usize|pair[i].as_i64().and_then(|n|i32::try_from(n).ok()).ok_or_else(invalid);
                Ok((int(0)?,int(1)?))
            };
            let seed=point(o.get("seed").ok_or_else(invalid)?)?;
            let nodes=o.get("nodes").and_then(|v|v.as_array()).filter(|a|!a.is_empty()&&a.len()<=ddv_save_patch::fence_topology::MAX_FENCE_NODES).ok_or_else(invalid)?;
            let xy=nodes.iter().map(point).collect::<Result<Vec<_>,_>>()?;
            let original=match self.kind{InputKind::PlainJson=>self.pending.as_slice(),InputKind::EncryptedP1g=>self.p1g.as_ref().ok_or_else(invalid)?.profile.as_slice()};
            let root:serde_json::Value=serde_json::from_slice(original).map_err(|_|invalid())?;
            if root.get("GameInfo").and_then(|v|v.get("Version")).and_then(|v|v.as_u64())!=Some(643){return Err(invalid());}
            let dest=grid_instance_preview::resolve_plain_grid_destination(original,o.get("destination").ok_or_else(invalid)?).map_err(|_|invalid())?;
            let mut result=ddv_save_patch::fence_erase::preview_fence_mutation_mode(std::str::from_utf8(original).map_err(|_|invalid())?,&dest,base,seed,&xy,action,diagonal).map_err(|_|invalid())?;
            let ids:Vec<_>=result.removed.iter().chain(result.allocated.iter()).map(|(id,_)|id.clone()).collect();
            let refs=match grid_instance_preview::grid_identity_dependencies_for_ids(original,&dest.grid_id,&ids){
                Ok(r)=>r,Err(_)=>{result.draft.patched_json.zeroize();return Err(invalid());}
            };
            if refs.blocking()>0||refs.historical>0{result.draft.patched_json.zeroize();return Err(fail("DB05_FENCE_DEPENDENCY_BLOCKED"));}
            self.prepare_copy_from_patched(result.draft.patched_json,true)
        }
        pub fn prepare_isolated_fence_experimental_copy(&mut self,plan:&str,allow_experimental_copy:bool)->Result<u32,JsValue>{
            let invalid=||fail("DB05_FENCE_PLAN_INVALID");
            if !allow_experimental_copy||!self.ready||self.closed||self.copy_prepared||plan.len()>32768{return Err(invalid());}
            let v:serde_json::Value=serde_json::from_str(plan).map_err(|_|invalid())?;
            let o=v.as_object().filter(|o|(o.len()==3||o.len()==4)&&o.keys().all(|k|matches!(k.as_str(),"destination"|"nodes"|"base"|"diagonal"))).ok_or_else(invalid)?;
            let diagonal=match o.get("diagonal"){None=>false,Some(v)=>v.as_bool().ok_or_else(invalid)?};
            let base=o.get("base").and_then(|v|v.as_u64()).and_then(|n|u32::try_from(n).ok()).filter(|n|ddv_save_patch::fence_topology::supported_family(*n)).ok_or_else(invalid)?;
            let nodes=o.get("nodes").and_then(|v|v.as_array()).filter(|a|!a.is_empty()&&a.len()<=ddv_save_patch::fence_topology::MAX_FENCE_NODES).ok_or_else(invalid)?;
            let mut xy=Vec::new();for n in nodes{
                let pair=n.as_array().filter(|a|a.len()==2).ok_or_else(invalid)?;
                let int=|i:usize|pair[i].as_i64().and_then(|n|i32::try_from(n).ok()).ok_or_else(invalid);
                xy.push((int(0)?,int(1)?));
            }
            let original=match self.kind{InputKind::PlainJson=>self.pending.as_slice(),InputKind::EncryptedP1g=>self.p1g.as_ref().ok_or_else(invalid)?.profile.as_slice()};
            let root:serde_json::Value=serde_json::from_slice(original).map_err(|_|invalid())?;
            if root.get("GameInfo").and_then(|v|v.get("Version")).and_then(|v|v.as_u64())!=Some(643){return Err(invalid());}
            let dest=grid_instance_preview::resolve_plain_grid_destination(original,o.get("destination").ok_or_else(invalid)?).map_err(|_|invalid())?;
            let edges=if diagonal{
                let q=dest.tessellation as i32;
                if xy.len()<2||xy.iter().any(|&(x,y)|x<0||y<0||x>131072||y>131072){return Err(invalid());}
                let dx=xy[1].0-xy[0].0;let dy=xy[1].1-xy[0].1;
                if dx.abs()!=q||dy.abs()!=q||xy.windows(2).any(|p|p[1].0-p[0].0!=dx||p[1].1-p[0].1!=dy){return Err(invalid());}
                xy.windows(2).map(|p|(p[0],p[1])).collect()
            }else{ddv_save_patch::fence_topology::cardinal_fence_graph(&xy,dest.tessellation).map_err(|_|invalid())?};
            let parts=ddv_save_patch::fence_topology::compile_fence(base,dest.tessellation,diagonal,&xy,&edges).map_err(|_|invalid())?;
            let next=root.get("World").and_then(|v|v.get("GridCollection")).and_then(|v|v.get("Grids")).and_then(|v|v.get(&dest.grid_id)).and_then(|v|v.get("NextGridObjectID")).and_then(|v|v.as_u64()).ok_or_else(invalid)?;
            let ids=(0..parts.len()).map(|offset|next.checked_add(offset as u64).map(|n|n.to_string()).ok_or_else(invalid)).collect::<Result<Vec<_>,_>>()?;
            let refs=grid_instance_preview::grid_identity_dependencies_for_ids(original,&dest.grid_id,&ids).map_err(|_|invalid())?;
            if refs.blocking()>0||refs.historical>0{return Err(fail("DB05_FENCE_DEPENDENCY_BLOCKED"));}
            let draft=ddv_save_patch::preview_isolated_fence(std::str::from_utf8(original).map_err(|_|invalid())?,&dest,base,diagonal,&xy,&edges).map_err(|_|invalid())?;
            self.prepare_copy_from_patched(draft.patched_json,true)
        }
        pub fn prepare_cardinal_road_experimental_copy(&mut self,plan:&str,allow_experimental_copy:bool)->Result<u32,JsValue>{
            let invalid=||fail("DB05_ROAD_PLAN_INVALID");
            if !allow_experimental_copy||!self.ready||self.closed||self.copy_prepared||plan.len()>16384{return Err(invalid());}
            let v:serde_json::Value=serde_json::from_str(plan).map_err(|_|invalid())?;
            let o=v.as_object().filter(|o|(4..=7).contains(&o.len())&&o.keys().all(|k|matches!(k.as_str(),"destination"|"cells"|"erase"|"itemId"|"seed"|"diagonal"|"replacement"))).ok_or_else(invalid)?;
            let diagonal=match o.get("diagonal"){None=>false,Some(v)=>v.as_bool().ok_or_else(invalid)?};
            let replacement=match o.get("replacement"){None=>None,Some(v)=>Some(v.as_u64().filter(|n|n/100_000==401).ok_or_else(invalid)?)};
            let item=o.get("itemId").and_then(|v|v.as_u64()).filter(|n|n/100_000==401).ok_or_else(invalid)?;
            let erase=o.get("erase").and_then(|v|v.as_bool()).ok_or_else(invalid)?;
            let cells=o.get("cells").and_then(|v|v.as_array()).filter(|a|!a.is_empty()&&a.len()<=ddv_save_patch::MAX_CARDINAL_ROAD_CELLS).ok_or_else(invalid)?;
            let mut xy=Vec::new();
            for c in cells{
                let pair=c.as_array().filter(|a|a.len()==2).ok_or_else(invalid)?;
                let int=|i:usize|pair[i].as_i64().and_then(|n|i32::try_from(n).ok()).ok_or_else(invalid);
                xy.push((int(0)?,int(1)?));
            }
            let original=match self.kind{InputKind::PlainJson=>self.pending.as_slice(),InputKind::EncryptedP1g=>self.p1g.as_ref().ok_or_else(invalid)?.profile.as_slice()};
            let root:serde_json::Value=serde_json::from_slice(original).map_err(|_|invalid())?;
            if root.get("GameInfo").and_then(|v|v.get("Version")).and_then(|v|v.as_u64())!=Some(643){return Err(invalid());}
            let dest=grid_instance_preview::resolve_plain_grid_destination(original,o.get("destination").ok_or_else(invalid)?).map_err(|_|invalid())?;
            let grid=root.get("World").and_then(|v|v.get("GridCollection")).and_then(|v|v.get("Grids")).and_then(|v|v.get(&dest.grid_id)).ok_or_else(invalid)?;
            let next=grid.get("NextGridObjectID").and_then(|v|v.as_u64()).ok_or_else(invalid)?;
            let objects=grid.get("Objects").and_then(|v|v.as_object()).ok_or_else(invalid)?;
            if let Some(seed)=o.get("seed"){
                let seed=seed.as_array().filter(|a|a.len()==2).ok_or_else(invalid)?;
                let sx=seed[0].as_i64().and_then(|n|i32::try_from(n).ok()).ok_or_else(invalid)?;
                let sy=seed[1].as_i64().and_then(|n|i32::try_from(n).ok()).ok_or_else(invalid)?;
            let mut seeds=objects.values().filter(|v|v.get("ItemID").and_then(|v|v.as_u64())==Some(item)&&v.get("X").and_then(|v|v.as_i64())==Some(i64::from(sx))&&v.get("Y").and_then(|v|v.as_i64())==Some(i64::from(sy)));
            let seed=seeds.next().ok_or_else(invalid)?;
            let pitch=2*dest.tessellation as i32;
            if seeds.next().is_some()||sx<0||sy<0||sx%pitch!=0||sy%pitch!=0||seed.get("Orientation").and_then(|v|v.as_str())!=Some("GridOrientation_Down")||ddv_save_patch::road_mode(seed).is_none()||seed.as_object().is_none_or(|o|o.keys().any(|k|!matches!(k.as_str(),"ID"|"ItemID"|"X"|"Y"|"Orientation"|"State"))){return Err(invalid());}
            }else if erase||replacement.is_some(){return Err(invalid());}
            let mut ids=Vec::new();
            if erase||replacement.is_some(){
                let objects=grid.get("Objects").and_then(|v|v.as_object()).ok_or_else(invalid)?;
                for (id,v) in objects{
                    if v.get("ItemID").and_then(|v|v.as_u64())==Some(item)&&xy.iter().any(|&(x,y)|v.get("X").and_then(|v|v.as_i64())==Some(i64::from(x))&&v.get("Y").and_then(|v|v.as_i64())==Some(i64::from(y))){ids.push(id.clone());}
                }
            }else{for offset in 0..xy.len(){ids.push(next.checked_add(offset as u64).ok_or_else(invalid)?.to_string());}}
            if ids.len()!=xy.len(){return Err(invalid());}
            if replacement.is_some(){for offset in 0..xy.len(){ids.push(next.checked_add(offset as u64).ok_or_else(invalid)?.to_string());}}
            let refs=grid_instance_preview::grid_identity_dependencies_for_ids(original,&dest.grid_id,&ids).map_err(|_|invalid())?;
            if refs.blocking()>0||!erase&&refs.historical>0{return Err(fail("DB05_ROAD_DEPENDENCY_BLOCKED"));}
            let draft=ddv_save_patch::preview_road_mutation(std::str::from_utf8(original).map_err(|_|invalid())?,&dest,item,&xy,erase,diagonal,replacement).map_err(|_|invalid())?;
            self.prepare_copy_from_patched(draft.patched_json,true)
        }
        pub fn prepare_grid_transfer_experimental_copy(&mut self,plan:&str,allow_experimental_copy:bool)->Result<u32,JsValue>{
            if !allow_experimental_copy{return Err(fail("DB05_EXPERIMENTAL_COPY_NOT_ALLOWED"));}
            let draft=self.grid_transfer_candidate(plan)?;
            self.prepare_copy_from_patched(draft.patched_json,true)
        }

        /// Experimental 1..=16 mixed Grid edits. The same independent
        /// P1G reopen is required for validation and explicit copy export.
        pub fn preview_grid_mixed_batch(&mut self,plan:&str)
            ->Result<String,JsValue>{
            let count=parse_grid_mixed_batch_plan(plan)?.len();
            self.prepare_grid_mixed_batch_copy(plan)?;
            Ok(format!(concat!(
                r#"{{"contract":"wand.db05.grid-mixed-batch-preview@1","#,
                r#""changedCount":{},"lexicalBytesPreserved":true,"#,
                r#""reopenVerified":true,"writerAuthorized":false,"#,
                r#""exportAuthorized":false,"placementLegalityVerified":false}}"#
            ),count))
        }
        pub fn prepare_grid_mixed_batch_copy(&mut self,plan:&str)
            ->Result<u32,JsValue>{
            if !self.ready||self.closed||self.copy_prepared{
                return Err(fail("DB05_GRID_MIXED_SESSION_INVALID"));
            }
            let plans=parse_grid_mixed_batch_plan(plan)?;
            let original=match self.kind{
                InputKind::PlainJson=>self.pending.as_slice(),
                InputKind::EncryptedP1g=>self.p1g.as_ref()
                    .ok_or(fail("DB05_GRID_MIXED_SESSION_INVALID"))?
                    .profile.as_slice()
            };
            let selectors=plans.iter().map(|p|(
                p.ordinal,p.item_id,p.expected,p.kind.clone(),
                p.orientation.as_ref().map(|v|v.0.clone())
            )).collect::<Vec<_>>();
            let targets=grid_instance_preview::resolve_grid_transform_targets(
                original,&selectors
            ).map_err(|_|fail("DB05_GRID_MIXED_STALE_OR_AMBIGUOUS"))?;
            let json=std::str::from_utf8(original)
                .map_err(|_|fail("DB05_GRID_MIXED_INVALID_UTF8"))?;
            let edits=plans.iter().zip(targets).map(|(p,target)|
                GridMixedEdit{
                    target,expected:p.expected,position:p.position,
                    orientation:p.orientation.clone()
                }
            ).collect::<Vec<_>>();
            grid_instance_preview::validate_oblique_grid_edits(original,&edits)
                .map_err(|_|fail("DB05_GRID_OBLIQUE_UNSUPPORTED"))?;
            let moves=edits.iter().filter_map(|e|e.position.map(|xy|(&e.target,xy))).collect::<Vec<_>>();
            grid_instance_preview::validate_exclusive_grid_moves(original,&moves)
                .map_err(|_|fail("DB05_GRID_EXCLUSIVE_ANCHOR_CONFLICT_OR_UNRESOLVED"))?;
            let draft=preview_existing_grid_mixed_batch(json,&edits)
                .map_err(|_|fail("DB05_GRID_MIXED_STALE_OR_INVALID"))?;
            if !draft.changed||!draft.untouched_bytes_preserved||
               draft.writer_authorized||draft.export_authorized{
                return Err(fail("DB05_GRID_MIXED_UNAUTHORIZED"));
            }
            self.prepare_copy_from_patched(draft.patched_json,true)
        }

        /// Experimental combined amount + Grid transaction. Both plans
        /// are optimistic-checked against the SAME immutable original source.
        /// Save bytes and private native object identities never leave WASM.
        pub fn preview_grid_and_quantity_batch(
            &mut self,grid_plan:&str,quantity_plan:&str
        )->Result<String,JsValue>{
            let grid_count=parse_grid_mixed_batch_plan(grid_plan)?.len();
            let amount_count=parse_batch_plan(quantity_plan)?.len();
            self.prepare_grid_and_quantity_batch_copy(grid_plan,quantity_plan)?;
            Ok(format!(concat!(
                r#"{{"contract":"wand.db05.grid-quantity-preview@1","#,
                r#""gridChangedCount":{},"amountChangedCount":{},"#,
                r#""lexicalBytesPreserved":true,"reopenVerified":true,"#,
                r#""writerAuthorized":false,"exportAuthorized":false,"#,
                r#""placementLegalityVerified":false}}"#
            ),grid_count,amount_count))
        }
        pub fn prepare_grid_and_quantity_batch_copy(
            &mut self,grid_plan:&str,quantity_plan:&str
        )->Result<u32,JsValue>{
            if !self.ready||self.closed||self.copy_prepared||
               self.copy_position!=0{
                return Err(fail("DB05_GRID_QUANTITY_SESSION_INVALID"));
            }
            let grid_plans=parse_grid_mixed_batch_plan(grid_plan)?;
            let quantity_edits=parse_batch_plan(quantity_plan)?;
            let original=match self.kind{
                InputKind::PlainJson=>self.pending.as_slice(),
                InputKind::EncryptedP1g=>self.p1g.as_ref()
                    .ok_or(fail("DB05_GRID_QUANTITY_SESSION_INVALID"))?
                    .profile.as_slice()
            };
            let source=std::str::from_utf8(original)
                .map_err(|_|fail("DB05_GRID_QUANTITY_SOURCE_INVALID"))?;
            // Quantity targets are checked on the immutable original, not
            // merely on an intermediate candidate produced by Grid edits.
            let mut amount_check=preview_existing_quantity_batch(
                source,&quantity_edits
            ).map_err(|_|fail("DB05_GRID_QUANTITY_AMOUNT_STALE"))?;
            let valid_amounts=amount_check.changed_count==quantity_edits.len()&&
                amount_check.untouched_bytes_preserved&&
                !amount_check.writer_authorized&&!amount_check.export_authorized;
            amount_check.patched_json.zeroize();
            if !valid_amounts{
                return Err(fail("DB05_GRID_QUANTITY_AMOUNT_INVALID"));
            }
            let selectors=grid_plans.iter().map(|p|(
                p.ordinal,p.item_id,p.expected,p.kind.clone(),
                p.orientation.as_ref().map(|v|v.0.clone())
            )).collect::<Vec<_>>();
            let targets=grid_instance_preview::resolve_grid_transform_targets(
                original,&selectors
            ).map_err(|_|fail("DB05_GRID_QUANTITY_GRID_STALE"))?;
            let edits=grid_plans.iter().zip(targets).map(|(p,target)|
                GridMixedEdit{
                    target,expected:p.expected,position:p.position,
                    orientation:p.orientation.clone()
                }
            ).collect::<Vec<_>>();
            grid_instance_preview::validate_oblique_grid_edits(original,&edits)
                .map_err(|_|fail("DB05_GRID_OBLIQUE_UNSUPPORTED"))?;
            let moves=edits.iter().filter_map(|e|e.position.map(|xy|(&e.target,xy))).collect::<Vec<_>>();
            grid_instance_preview::validate_exclusive_grid_moves(original,&moves)
                .map_err(|_|fail("DB05_GRID_EXCLUSIVE_ANCHOR_CONFLICT_OR_UNRESOLVED"))?;
            let mut grid_draft=preview_existing_grid_mixed_batch(source,&edits)
                .map_err(|_|fail("DB05_GRID_QUANTITY_GRID_INVALID"))?;
            if !grid_draft.changed||!grid_draft.untouched_bytes_preserved||
               grid_draft.writer_authorized||grid_draft.export_authorized{
                grid_draft.patched_json.zeroize();
                return Err(fail("DB05_GRID_QUANTITY_GRID_UNAUTHORIZED"));
            }
            // Separate known JSON paths: GridObject coordinates/orientation
            // versus Inventory/Chest Amount. A second optimistic check after
            // Grid editing guarantees that no quantity field was touched.
            let amount_draft=preview_existing_quantity_batch(
                &grid_draft.patched_json,&quantity_edits
            );
            grid_draft.patched_json.zeroize();
            let amount_draft=amount_draft
                .map_err(|_|fail("DB05_GRID_QUANTITY_SOURCE_OVERLAP"))?;
            if amount_draft.changed_count!=quantity_edits.len()||
               !amount_draft.untouched_bytes_preserved||
               amount_draft.writer_authorized||amount_draft.export_authorized{
                return Err(fail("DB05_GRID_QUANTITY_UNAUTHORIZED"));
            }
            self.prepare_copy_from_patched(amount_draft.patched_json,true)
        }

        /// Local stock and placement candidate. The candidate is independently
        /// reopened and zeroized without setting the export/copy buffer.
        /// Source structural guards are shared with the existing preview.
        fn furniture_stock_candidate(&self,plan:&str,destination:&str)->Result<(ddv_save_patch::GridCoordinateDraft,u32,u32),JsValue>{
            use ddv_save_patch::{FurnitureStockAction,preview_furniture_stock_transaction};
            if !self.ready||self.closed||self.copy_prepared||plan.len()>4096||destination.len()>4096{
                return Err(fail("DB05_FURNITURE_STOCK_SESSION_INVALID"));
            }
            let invalid=||fail("DB05_FURNITURE_STOCK_PLAN_INVALID");
            let value:serde_json::Value=serde_json::from_str(plan).map_err(|_|invalid())?;
            let o=value.as_object().ok_or_else(invalid)?;
            let free=match o.get("freePlacement"){None=>false,Some(serde_json::Value::Bool(true))=>true,_=>return Err(invalid())};
            let item=o.get("itemId").and_then(|v|v.as_str()).and_then(|v|v.parse::<u64>().ok()).ok_or_else(invalid)?;
            let int=|key:&str|o.get(key).and_then(|v|v.as_i64()).and_then(|v|i32::try_from(v).ok()).ok_or_else(invalid);
            let action=o.get("action").and_then(|v|v.as_str()).ok_or_else(invalid)?;
            let original=match self.kind{
                InputKind::PlainJson=>self.pending.as_slice(),
                InputKind::EncryptedP1g=>self.p1g.as_ref().ok_or(fail("DB05_FURNITURE_STOCK_SESSION_INVALID"))?.profile.as_slice()
            };
            let root:serde_json::Value=serde_json::from_slice(original).map_err(|_|invalid())?;
            let stock=root.get("Player").and_then(|v|v.get("ListInventories")).and_then(|v|v.get("0")).and_then(|v|v.get("Inventory")).and_then(|v|v.get(item.to_string().as_str())).and_then(|v|v.get("Amount")).and_then(|v|v.as_u64()).and_then(|v|u32::try_from(v).ok()).ok_or(fail("DB05_FURNITURE_STOCK_UNAVAILABLE"))?;
            let json=std::str::from_utf8(original).map_err(|_|invalid())?;
            let oblique=|s:&str|ddv_save_patch::EXPERIMENTAL_EIGHT_WAY_ORIENTATIONS.contains(&s)&&!ddv_save_patch::OBSERVED_CARDINAL_ORIENTATIONS.contains(&s);
            let check_destination=|d:&ddv_save_patch::PlainGridDestination,orientation:&str|->Result<(),JsValue>{
                if grid_instance_preview::is_underwater_grid(&root["World"]["GridCollection"]["Grids"][&d.grid_id]){
                    if !free{return Err(invalid());}
                    grid_instance_preview::validate_underwater_stock_destination(&root,d,item,orientation).map_err(|_|invalid())?;
                }else if free{
                    if root["GameInfo"]["Version"].as_u64()!=Some(643){return Err(invalid());}
                    let (_,layout,factor,sx,sy)=grid_instance_preview::house_exterior_identity(&root,&d.grid_id).map_err(|_|invalid())?;
                    if layout!=d.layout_path||factor!=u64::from(d.tessellation)||sx!=u64::from(d.size.0)||sy!=u64::from(d.size.1){return Err(invalid());}
                }
                let next=root["World"]["GridCollection"]["Grids"][&d.grid_id]["NextGridObjectID"].as_u64().filter(|n|*n>0&&*n<u32::MAX as u64).ok_or_else(invalid)?.to_string();
                let refs=grid_instance_preview::grid_identity_dependencies_for_ids(original,&d.grid_id,&[next]).map_err(|_|invalid())?;
                if refs.blocking()>0||refs.historical>0{return Err(invalid());}
                if oblique(orientation){
                    if root["GameInfo"]["Version"].as_u64()!=Some(643)||item/100_000!=400||d.tessellation!=1{return Err(invalid());}
                    grid_instance_preview::player_house_grid_scope(&root,&d.grid_id).map_err(|_|invalid())?;
                }
                Ok(())
            };
            let mut draft=if action=="place"{
                if o.len()!=5+usize::from(free)||o.keys().any(|k|!matches!(k.as_str(),"action"|"itemId"|"x"|"y"|"orientation"|"freePlacement")){return Err(invalid());}
                let dest:serde_json::Value=serde_json::from_str(destination).map_err(|_|invalid())?;
                let dest=grid_instance_preview::resolve_plain_grid_destination(original,&dest).map_err(|_|fail("DB05_FURNITURE_STOCK_DESTINATION"))?;
                let orientation=o.get("orientation").and_then(|v|v.as_str()).ok_or_else(invalid)?;
                check_destination(&dest,orientation)?;
                if crate::storage_source::is_storage(item){
                    if root["GameInfo"]["Version"].as_u64()!=Some(643){return Err(invalid());}
                    let (_,layout,factor,sx,sy)=grid_instance_preview::house_exterior_identity(&root,&dest.grid_id).map_err(|_|invalid())?;
                    if layout!=dest.layout_path||factor!=u64::from(dest.tessellation)||sx!=u64::from(dest.size.0)||sy!=u64::from(dest.size.1){return Err(invalid());}
                    let next=root["World"]["GridCollection"]["Grids"][&dest.grid_id]["NextGridObjectID"].as_u64().ok_or_else(invalid)?.to_string();
                    let refs=grid_instance_preview::grid_identity_dependencies_for_ids(original,&dest.grid_id,&[next]).map_err(|_|invalid())?;
                    if refs.blocking()>0||refs.historical>0{return Err(invalid());}
                    let (template,capacity)=crate::storage_source::placement_storage_template(&root,item).ok_or_else(invalid)?;
                    ddv_save_patch::preview_initial_storage(json,&dest,item,(int("x")?,int("y")?),orientation,stock,template,capacity,false,free)
                }else{preview_furniture_stock_transaction(json,stock,FurnitureStockAction::Place{destination:&dest,item_id:item,xy:(int("x")?,int("y")?),orientation})}
            }else{
                // Reuse the original-source structural rehearsal, including
                // dependency blocking when the removal guard is available.
                if o.len()!=7+usize::from(free)+usize::from(o.contains_key("replacementOrientation"))||o.keys().any(|k|!matches!(k.as_str(),"action"|"itemId"|"localOrdinal"|"expectedX"|"expectedY"|"x"|"y"|"freePlacement"|"replacementOrientation"))||o.contains_key("replacementOrientation")&&(!free||action!="duplicate")||free&&!matches!(action,"duplicate"|"remove"){return Err(invalid());}
                let ordinal=o.get("localOrdinal").and_then(|v|v.as_u64()).and_then(|v|usize::try_from(v).ok()).ok_or_else(invalid)?;
                let expected=(int("expectedX")?,int("expectedY")?);
                let target=grid_instance_preview::resolve_grid_mixed_targets(original,&[(ordinal,item,expected,"full".to_owned(),None)])
                    .map_err(|_|fail("DB05_FURNITURE_STOCK_STALE"))?.pop().ok_or_else(invalid)?;
                let obj=&root["World"]["GridCollection"]["Grids"][&target.grid_id]["Objects"][&target.object_id];
                let orientation=obj["Orientation"].as_str().ok_or_else(invalid)?;
                let underwater=grid_instance_preview::is_underwater_grid(&root["World"]["GridCollection"]["Grids"][&target.grid_id]);
                if underwater{
                    if !free||!grid_instance_preview::underwater_plain_item(&root,item)||!ddv_save_patch::OBSERVED_CARDINAL_ORIENTATIONS.contains(&orientation)||!obj.get("State").is_none_or(serde_json::Value::is_null){return Err(invalid());}
                    let (sx,sy)=grid_instance_preview::underwater_transform_identity(&root,&target.grid_id).map_err(|_|invalid())?;
                    if expected.0<0||expected.1<0||expected.0 as u64>=sx||expected.1 as u64>=sy{return Err(invalid());}
                    if action=="remove"&&(!o["x"].is_null()||!o["y"].is_null()){return Err(invalid());}
                    let refs=grid_instance_preview::grid_identity_dependencies(original,&target).map_err(|_|invalid())?;
                    if refs.blocking()>0||action=="remove"&&refs.historical>0{return Err(invalid());}
                    let mut guard=ddv_save_patch::preview_plain_grid_structure(json,&target,expected,ddv_save_patch::PlainGridStructureAction::Remove).map_err(|_|invalid())?;
                    guard.patched_json.zeroize();
                }else if oblique(orientation){
                    let check=ddv_save_patch::GridMixedEdit{target:target.clone(),expected,position:None,orientation:None};
                    grid_instance_preview::validate_oblique_grid_edits(original,&[check]).map_err(|_|invalid())?;
                    if action=="remove"&&(!o["x"].is_null()||!o["y"].is_null()){return Err(invalid());}
                    if !matches!(action,"duplicate"|"remove"){return Err(invalid());}
                    // Verify source record without allocating or publishing a removal.
                    let mut guard=ddv_save_patch::preview_plain_grid_structure(json,&target,expected,ddv_save_patch::PlainGridStructureAction::Remove).map_err(|_|invalid())?;
                    guard.patched_json.zeroize();
                }else{let mut legacy=value.clone();let map=legacy.as_object_mut().ok_or_else(invalid)?;map.remove("freePlacement");map.remove("replacementOrientation");self.preview_plain_grid_structure(&legacy.to_string())?;}
                match action{
                    "remove"=>preview_furniture_stock_transaction(json,stock,FurnitureStockAction::Pickup{target:&target,expected}),
                    "duplicate"=>{
                        let witness:serde_json::Value=serde_json::from_str(destination).map_err(|_|invalid())?;
                        let dest=grid_instance_preview::resolve_plain_grid_destination(original,&witness).map_err(|_|fail("DB05_FURNITURE_STOCK_DESTINATION"))?;
                        // Copy creates a new ordinary object at the independently resolved destination. The source identity remains unchanged.
                        let dest_underwater=grid_instance_preview::is_underwater_grid(&root["World"]["GridCollection"]["Grids"][&dest.grid_id]);
                        if (underwater||dest_underwater)&&(!underwater||!dest_underwater||target.grid_id!=dest.grid_id){return Err(invalid());}
                        if free&&!underwater{
                            let (_,_,factor,sx,sy)=grid_instance_preview::house_exterior_identity(&root,&target.grid_id).map_err(|_|invalid())?;
                            if expected.0<0||expected.1<0||expected.0 as u64>=sx*factor||expected.1 as u64>=sy*factor||grid_instance_preview::grid_identity_dependencies(original,&target).map_err(|_|invalid())?.blocking()>0{return Err(invalid());}
                        }
                        let orientation=match o.get("replacementOrientation"){None=>orientation,Some(v)=>v.as_str().filter(|s|ddv_save_patch::EXPERIMENTAL_EIGHT_WAY_ORIENTATIONS.contains(s)).ok_or_else(invalid)?};
                        check_destination(&dest,orientation)?;
                        preview_furniture_stock_transaction(json,stock,FurnitureStockAction::Place{destination:&dest,item_id:item,xy:(int("x")?,int("y")?),orientation})
                    },
                    _=>return Err(invalid())
                }
            }.map_err(|_|fail("DB05_FURNITURE_STOCK_REJECTED"))?;
            let remaining=if action=="remove"{stock.checked_add(1)}else{stock.checked_sub(1)};
            if !draft.changed||!draft.untouched_bytes_preserved||draft.writer_authorized||draft.export_authorized||remaining.is_none(){
                draft.patched_json.zeroize();return Err(invalid());
            }
            Ok((draft,stock,remaining.unwrap()))
        }

        /// Group pickup is one local experimental transaction; no partial
        /// stock edits or object removals reach the UI.
        pub fn prepare_group_pickup_experimental_copy(&mut self,plan:&str,allow_experimental_copy:bool)->Result<u32,JsValue>{
            let invalid=||fail("DB05_GROUP_PICKUP_INVALID");
            if !allow_experimental_copy||!self.ready||self.closed||self.copy_prepared{return Err(invalid());}
            let original=match self.kind{
                InputKind::PlainJson=>self.pending.as_slice(),
                InputKind::EncryptedP1g=>self.p1g.as_ref().ok_or_else(invalid)?.profile.as_slice()
            };
            let draft=grid_instance_preview::group_pickup_candidate(original,plan).map_err(|_|invalid())?;
            self.prepare_copy_from_patched(draft,true)
        }

        pub fn prepare_biome_furniture_experimental_copy(&mut self,plan:&str,allow_experimental_copy:bool)->Result<u32,JsValue>{
            let invalid=||fail("DB05_BIOME_FURNITURE_INVALID");
            if !allow_experimental_copy||!self.ready||self.closed||self.copy_prepared{return Err(invalid());}
            let original=match self.kind{
                InputKind::PlainJson=>self.pending.as_slice(),
                InputKind::EncryptedP1g=>self.p1g.as_ref().ok_or_else(invalid)?.profile.as_slice()
            };
            let draft=grid_instance_preview::biome_furniture_candidate(original,plan).map_err(|_|invalid())?;
            self.prepare_copy_from_patched(draft,true)
        }

        pub fn prepare_island_furniture_experimental_copy(&mut self,plan:&str,allow_experimental_copy:bool)->Result<u32,JsValue>{
            let invalid=||fail("DB05_ISLAND_FURNITURE_INVALID");
            if !allow_experimental_copy||!self.ready||self.closed||self.copy_prepared{return Err(invalid());}
            let original=match self.kind{
                InputKind::PlainJson=>self.pending.as_slice(),
                InputKind::EncryptedP1g=>self.p1g.as_ref().ok_or_else(invalid)?.profile.as_slice()
            };
            let draft=grid_instance_preview::island_furniture_candidate(original,plan).map_err(|_|invalid())?;
            self.prepare_copy_from_patched(draft,true)
        }

        pub fn prepare_island_decoration_experimental_copy(&mut self,plan:&str,allow_experimental_copy:bool)->Result<u32,JsValue>{
            let invalid=||fail("DB05_ISLAND_DECORATION_INVALID");
            if !allow_experimental_copy||!self.ready||self.closed||self.copy_prepared{return Err(invalid());}
            let original=match self.kind{
                InputKind::PlainJson=>self.pending.as_slice(),
                InputKind::EncryptedP1g=>self.p1g.as_ref().ok_or_else(invalid)?.profile.as_slice()
            };
            let draft=grid_instance_preview::island_decoration_candidate(original,plan).map_err(|_|invalid())?;
            self.prepare_copy_from_patched(draft,true)
        }

        pub fn prepare_biome_network_experimental_copy(&mut self,plan:&str,allow_experimental_copy:bool)->Result<u32,JsValue>{
            let invalid=||fail("DB05_BIOME_NETWORK_INVALID");
            if !allow_experimental_copy||!self.ready||self.closed||self.copy_prepared{return Err(invalid());}
            let original=match self.kind{
                InputKind::PlainJson=>self.pending.as_slice(),
                InputKind::EncryptedP1g=>self.p1g.as_ref().ok_or_else(invalid)?.profile.as_slice()
            };
            let draft=grid_instance_preview::biome_network_candidate(original,plan).map_err(|_|invalid())?;
            self.prepare_copy_from_patched(draft,true)
        }

        pub fn prepare_biome_decoration_experimental_copy(&mut self,plan:&str,allow_experimental_copy:bool)->Result<u32,JsValue>{
            let invalid=||fail("DB05_BIOME_DECORATION_INVALID");
            if !allow_experimental_copy||!self.ready||self.closed||self.copy_prepared{return Err(invalid());}
            let original=match self.kind{
                InputKind::PlainJson=>self.pending.as_slice(),
                InputKind::EncryptedP1g=>self.p1g.as_ref().ok_or_else(invalid)?.profile.as_slice()
            };
            let draft=grid_instance_preview::biome_decoration_candidate(original,plan).map_err(|_|invalid())?;
            self.prepare_copy_from_patched(draft,true)
        }

        pub fn inspect_area_landscape(&self,witness:&str)->Result<String,JsValue>{
            let invalid=||fail("DB05_AREA_LANDSCAPE_INVALID");
            if !self.ready||self.closed{return Err(invalid());}
            let source=match self.kind{InputKind::PlainJson=>self.pending.as_slice(),InputKind::EncryptedP1g=>self.p1g.as_ref().ok_or_else(invalid)?.profile.as_slice()};
            grid_instance_preview::inspect_area_landscape(source,witness).map_err(|_|invalid())
        }
        pub fn inspect_area_network(&self,witness:&str)->Result<String,JsValue>{
            if !self.ready||self.closed{return Err(fail("DB05_AREA_NETWORK_NOT_OPEN"));}
            let source=match self.kind{InputKind::PlainJson=>self.pending.as_slice(),InputKind::EncryptedP1g=>self.p1g.as_ref().ok_or(fail("DB05_AREA_NETWORK_NOT_OPEN"))?.profile.as_slice()};
            grid_instance_preview::inspect_area_network(source,witness).map_err(|_|fail("DB05_AREA_NETWORK_INVALID"))
        }
        pub fn prepare_group_cut_experimental_copy(&mut self,plan:&str,allow_experimental_copy:bool)->Result<u32,JsValue>{
            let invalid=||fail("DB05_GROUP_CUT_INVALID");
            if !allow_experimental_copy||!self.ready||self.closed||self.copy_prepared{return Err(invalid());}
            let original=match self.kind{
                InputKind::PlainJson=>self.pending.as_slice(),
                InputKind::EncryptedP1g=>self.p1g.as_ref().ok_or_else(invalid)?.profile.as_slice()
            };
            let draft=grid_instance_preview::group_cut_candidate(original,plan).map_err(|_|invalid())?;
            self.prepare_copy_from_patched(draft,true)
        }

        pub fn prepare_group_paste_experimental_copy(&mut self,plan:&str,allow_experimental_copy:bool)->Result<u32,JsValue>{
            let invalid=||fail("DB05_GROUP_PASTE_INVALID");
            if !allow_experimental_copy||!self.ready||self.closed||self.copy_prepared{return Err(invalid());}
            let original=match self.kind{
                InputKind::PlainJson=>self.pending.as_slice(),
                InputKind::EncryptedP1g=>self.p1g.as_ref().ok_or_else(invalid)?.profile.as_slice()
            };
            let draft=grid_instance_preview::group_paste_candidate(original,plan).map_err(|_|invalid())?;
            self.prepare_copy_from_patched(draft,true)
        }

        pub fn prepare_landscape_experimental_copy(&mut self,plan:&str,destination:&str,allow_experimental_copy:bool)->Result<u32,JsValue>{
            let invalid=||fail("DB05_LANDSCAPE_INVALID");
            if !allow_experimental_copy||!self.ready||self.closed||self.copy_prepared{return Err(invalid());}
            let original=match self.kind{InputKind::PlainJson=>self.pending.as_slice(),InputKind::EncryptedP1g=>self.p1g.as_ref().ok_or_else(invalid)?.profile.as_slice()};
            let draft=grid_instance_preview::landscape_candidate(original,plan,destination).map_err(|_|invalid())?;
            self.prepare_copy_from_patched(draft,true)
        }
        pub fn prepare_furniture_stock_experimental_copy(&mut self,plan:&str,destination:&str,allow_experimental_copy:bool)->Result<u32,JsValue>{
            if !allow_experimental_copy{return Err(fail("DB05_EXPERIMENTAL_COPY_NOT_ALLOWED"));}
            let (draft,_,_)=self.furniture_stock_candidate(plan,destination)?;
            self.prepare_copy_from_patched(draft.patched_json,true)
        }

        pub fn preview_furniture_stock_structure(&self,plan:&str,destination:&str)->Result<String,JsValue>{
            let (mut draft,stock,remaining)=self.furniture_stock_candidate(plan,destination)?;
            let invalid=||fail("DB05_FURNITURE_STOCK_PLAN_INVALID");
            let result=(||->Result<String,JsValue>{
                if !draft.changed||!draft.untouched_bytes_preserved||draft.writer_authorized||draft.export_authorized{return Err(invalid());}
                validate_profile(draft.patched_json.as_bytes()).map_err(|_|invalid())?;
                if matches!(self.kind,InputKind::EncryptedP1g){
                    let opened=self.p1g.as_ref().ok_or_else(invalid)?;
                    let mut archive=rezip_profile(&opened.original_zip,&opened.layout,draft.patched_json.as_bytes()).map_err(|_|invalid())?;
                    let encrypted=ecb_encrypt(&archive);archive.zeroize();
                    let mut encrypted=encrypted.map_err(|_|invalid())?;
                    let verified=OpenedP1g::open(&encrypted).is_ok_and(|reopened|reopened.profile==draft.patched_json.as_bytes());
                    encrypted.zeroize();
                    if !verified{return Err(fail("DB05_FURNITURE_STOCK_REOPEN"));}
                }
                Ok(serde_json::json!({"contract":"wand.db05.furniture-stock-preview@1","changed":true,"lexicalBytesPreserved":true,"structureValidated":true,"reopenVerified":true,"stockBefore":stock,"stockAfter":remaining,"exportAuthorized":false,"runtimeReferencesVerified":false}).to_string())
            })();
            draft.patched_json.zeroize();result
        }

        pub fn preview_inventory(
            &mut self,inventory_id:&str,item_id:&str,expected:u32,replacement:u32
        )->Result<String,JsValue>{
            self.preview(QuantityTarget::Inventory{
                inventory_id:inventory_id.to_owned(),item_id:item_id.to_owned()
            },expected,replacement)
        }
        pub fn preview_chest(
            &mut self,container_id:&str,slot_index:u32,item_id:u32,
            expected:u32,replacement:u32
        )->Result<String,JsValue>{
            self.preview(QuantityTarget::ChestSlot{
                container_id:container_id.to_owned(),slot_index:slot_index as usize,
                item_id:item_id as u64
            },expected,replacement)
        }
        /// Explicit experimental COPY preparation. This does not overwrite
        /// original bytes or authorize any production Save Writer.
        pub fn prepare_inventory_copy(
            &mut self,inventory_id:&str,item_id:&str,expected:u32,replacement:u32
        )->Result<u32,JsValue>{
            self.prepare_copy(QuantityTarget::Inventory{
                inventory_id:inventory_id.to_owned(),item_id:item_id.to_owned()
            },expected,replacement)
        }
        pub fn prepare_chest_copy(
            &mut self,container_id:&str,slot_index:u32,item_id:u32,
            expected:u32,replacement:u32
        )->Result<u32,JsValue>{
            self.prepare_copy(QuantityTarget::ChestSlot{
                container_id:container_id.to_owned(),slot_index:slot_index as usize,
                item_id:item_id as u64
            },expected,replacement)
        }
        /// All-or-nothing multi-edit preview. Reopens the fully patched P1G
        /// internally; no source text, amounts or edited bytes leave WASM.
        pub fn preview_batch(&mut self,plan:&str)->Result<String,JsValue>{
            let changed=parse_batch_plan(plan)?.len();
            self.prepare_batch_copy(plan)?;
            Ok(format!(concat!(
                r#"{{"contract":"wand.db05.batch-preview@1","changedCount":{},"#,
                r#""lexicalBytesPreserved":true,"reopenVerified":true,"#,
                r#""writerAuthorized":false,"exportAuthorized":false}}"#
            ),changed))
        }
        /// Explicit user-authorized experimental copy, never original overwrite.
        /// Each operation is checked against the same immutable save source.
        pub fn prepare_batch_copy(&mut self,plan:&str)->Result<u32,JsValue>{
            if !self.ready || self.closed || self.copy_prepared {
                return Err(fail("DB05_BATCH_SESSION_INVALID"));
            }
            let edits=parse_batch_plan(plan)?;
            let original=match self.kind{
                InputKind::PlainJson=>self.pending.as_slice(),
                InputKind::EncryptedP1g=>self.p1g.as_ref()
                    .ok_or(fail("DB05_BATCH_SESSION_INVALID"))?.profile.as_slice()
            };
            let text=std::str::from_utf8(original)
                .map_err(|_|fail("DB05_BATCH_SOURCE_INVALID"))?;
            let draft=preview_existing_quantity_batch(text,&edits)
                .map_err(|_|fail("DB05_BATCH_STALE_OR_INVALID"))?;
            if draft.changed_count!=edits.len(){
                return Err(fail("DB05_BATCH_NOOP_REJECTED"));
            }
            self.prepare_copy_from_patched(draft.patched_json,true)
        }

        /// At most 1 MiB is copied out of WASM per call. The Worker is
        /// required to transfer the assembled result only on explicit export.
        pub fn take_copy_chunk(&mut self,maximum:u32)->Result<Vec<u8>,JsValue>{
            if !self.ready || self.closed || !self.copy_prepared ||
               maximum==0 || maximum as usize>CHUNK ||
               self.copy_position>=self.copy_buffer.len(){
                return Err(fail("DB05_COPY_NOT_PREPARED"));
            }
            let end=self.copy_position
                .saturating_add(maximum as usize).min(self.copy_buffer.len());
            let next=self.copy_buffer[self.copy_position..end].to_vec();
            self.copy_position=end;
            if self.copy_position==self.copy_buffer.len(){
                self.copy_buffer.zeroize();
                self.copy_buffer.clear();
                self.copy_prepared=false;
            }
            Ok(next)
        }
        pub fn close(&mut self){
            self.closed=true;
            self.ready=false;
            self.pending.zeroize();
            self.pending.clear();
            self.p1g=None;
            self.copy_buffer.zeroize();
            self.copy_buffer.clear();
            self.copy_position=0;
            self.copy_prepared=false;
        }
    }
    impl WasmAmountPreview{
        fn prepare_copy(
            &mut self,target:QuantityTarget,expected:u32,replacement:u32
        )->Result<u32,JsValue>{
            if !self.ready||self.closed||self.copy_prepared||self.copy_position!=0 {
                return Err(fail("DB05_COPY_SESSION_INVALID"));
            }
            let source=match self.kind{
                InputKind::PlainJson=>self.pending.as_slice(),
                InputKind::EncryptedP1g=>self.p1g.as_ref()
                    .ok_or(fail("DB05_COPY_SESSION_INVALID"))?.profile.as_slice()
            };
            let json=std::str::from_utf8(source)
                .map_err(|_|fail("DB05_COPY_INVALID_SOURCE"))?;
            let draft=preview_existing_quantity(json,target,
                expected as u64,replacement as u64)
                .map_err(|_|fail("DB05_COPY_STALE_OR_INVALID_AMOUNT"))?;
            self.prepare_copy_from_patched(draft.patched_json,draft.changed)
        }
        fn prepare_copy_from_patched(
            &mut self,mut patched_json:String,changed:bool
        )->Result<u32,JsValue>{
            const MAX_EXPERIMENTAL_COPY:usize=32*1024*1024;
            if !self.ready||self.closed||self.copy_prepared||self.copy_position!=0 {
                patched_json.zeroize();
                return Err(fail("DB05_COPY_SESSION_INVALID"));
            }
            let outcome=(||->Result<Vec<u8>,JsValue>{
                if !changed{return Err(fail("DB05_COPY_NO_CHANGE"));}
                validate_profile(patched_json.as_bytes())
                    .map_err(|_|fail("DB05_COPY_INVALID_RESULT"))?;
                let original=match self.kind{
                    InputKind::PlainJson=>self.pending.as_slice(),
                    InputKind::EncryptedP1g=>self.p1g.as_ref()
                        .ok_or(fail("DB05_COPY_SESSION_INVALID"))?.profile.as_slice()
                };
                super::progression_guard::preserve_progression(original,patched_json.as_bytes())
                    .map_err(|_|fail("DB05_COPY_PROGRESSION_DEPENDENCY_BLOCKED"))?;
                let copy=match self.kind{
                    InputKind::PlainJson=>patched_json.as_bytes().to_vec(),
                    InputKind::EncryptedP1g=>{
                        let opened=self.p1g.as_ref()
                            .ok_or(fail("DB05_COPY_SESSION_INVALID"))?;
                        let mut archive=rezip_profile(&opened.original_zip,&opened.layout,
                            patched_json.as_bytes())
                            .map_err(|_|fail("DB05_COPY_ZIP_FAILED"))?;
                        let encrypted=ecb_encrypt(&archive);
                        archive.zeroize();
                        let mut encrypted=encrypted
                            .map_err(|_|fail("DB05_COPY_ENCRYPT_FAILED"))?;
                        let verified=OpenedP1g::open(&encrypted)
                            .is_ok_and(|reopened|reopened.profile==
                                patched_json.as_bytes());
                        if !verified{
                            encrypted.zeroize();
                            return Err(fail("DB05_COPY_INDEPENDENT_REOPEN_FAILED"));
                        }
                        encrypted
                    }
                };
                if copy.is_empty() || copy.len()>MAX_EXPERIMENTAL_COPY{
                    let mut copy=copy;copy.zeroize();
                    return Err(fail("DB05_COPY_SIZE_DENIED"));
                }
                Ok(copy)
            })();
            patched_json.zeroize();
            let copy=outcome?;
            let len=copy.len() as u32;
            self.copy_buffer=copy;
            self.copy_position=0;
            self.copy_prepared=true;
            Ok(len)
        }

        fn preview(&mut self,target:QuantityTarget,old:u32,new:u32)
            ->Result<String,JsValue>{
            if self.closed||!self.ready{return Err(fail("DB05_PREVIEW_SESSION_CLOSED"));}
            let profile=match self.kind{
                InputKind::PlainJson=>self.pending.as_slice(),
                InputKind::EncryptedP1g=>self.p1g.as_ref()
                    .ok_or(fail("DB05_PREVIEW_SESSION_CLOSED"))?.profile.as_slice()
            };
            let json=std::str::from_utf8(profile)
                .map_err(|_|fail("DB05_PREVIEW_PROFILE_UTF8_INVALID"))?;
            let mut draft=preview_existing_quantity(json,target,old as u64,new as u64)
                .map_err(|_|fail("DB05_PREVIEW_QUANTITY_REJECTED"))?;
            let result=(||->Result<String,JsValue>{
                let changed=draft.changed;
                validate_profile(draft.patched_json.as_bytes())
                    .map_err(|_|fail("DB05_PREVIEW_PATCH_VALIDATION_FAILED"))?;
                let reopen_verified=if changed &&
                    matches!(self.kind,InputKind::EncryptedP1g){
                    let opened=self.p1g.as_ref()
                        .ok_or(fail("DB05_PREVIEW_SESSION_CLOSED"))?;
                    let mut zip=rezip_profile(&opened.original_zip,&opened.layout,
                        draft.patched_json.as_bytes())
                        .map_err(|_|fail("DB05_PREVIEW_REPACK_FAILED"))?;
                    let encrypted=ecb_encrypt(&zip);
                    zip.zeroize();
                    let mut encrypted=encrypted
                        .map_err(|_|fail("DB05_PREVIEW_REPACK_FAILED"))?;
                    let reopened=OpenedP1g::open(&encrypted);
                    encrypted.zeroize();
                    let reopened=reopened
                        .map_err(|_|fail("DB05_PREVIEW_REOPEN_FAILED"))?;
                    if reopened.profile!=draft.patched_json.as_bytes(){
                        return Err(fail("DB05_PREVIEW_REOPEN_MISMATCH"));
                    }
                    true
                }else{
                    matches!(self.kind,InputKind::EncryptedP1g)
                };
                // Return booleans only. Private paths, values, source digest and
                // candidate P1G/JSON are NOT included in this receipt.
                Ok(format!(concat!(
                    r#"{{"contract":"wand.db05.amount-preview@1","changed":{},"lexicalBytesPreserved":true,"#,
                    r#""reopenVerified":{},"writerAuthorized":false,"exportAuthorized":false}}"#
                ),changed,reopen_verified))
            })();
            draft.patched_json.zeroize();
            result
        }
    }
    impl Drop for WasmAmountPreview{
        fn drop(&mut self){self.close();}
    }
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
    #[cfg(feature="wasm")]
    #[test]
    fn saved_full_grid_paths_require_unique_native_db04_pairs_not_grid_ids(){
        let sample=br#"{"GameInfo":{"Version":643},"Player":{},
          "World":{"GridCollection":{"Grids":{
            "900":{"ID":900,"GridDefaultLayoutPath":
              "SceneLayouts/Village04/Beach.json",
              "GridDataPath":"GridData/Village04/Beach.json",
              "Objects":{"1":{"ItemID":40000100,"X":77}}},
            "901":{"ID":901,"GridDefaultLayoutPath":
              "SceneLayouts/Unavailable/Room.json",
              "GridDataPath":"GridData/Unavailable/Room.json","Objects":{}},
            "902":{"ID":902,"GridDefaultLayoutPath":
              "SceneLayouts/Other/Room.json",
              "GridDataPath":"GridData/Other/Room.json","Objects":{}}
          },"DiffGrids":{"1001":{"ID":1001,"GridDefaultLayoutPath":
            "SceneLayouts/Village04/Beach.json",
            "GridDefaultLayoutType":"Meta.GridCollection, Meta",
            "DefaultLayoutGridID":7,"DefaultGridHashCode":31,
            "DefaultGridDataHashCode":-12,"ModifiedObjects":{}}}
          }}}"#;
        let witness=r#"{"contract":"wand.db05.db04-grid-path-witness@2",
          "gridRefs":[
            {"layoutId":"SceneLayouts/Village04/Beach.json",
             "gridDataPath":"GridData/Village04/Beach.json","nativeGridId":7},
            {"layoutId":"SceneLayouts/Other/Room.json",
             "gridDataPath":"GridData/Other/Room.json","nativeGridId":3},
            {"layoutId":"SceneLayouts/Other/Room.json",
             "gridDataPath":"GridData/Other/Room.json","nativeGridId":4}
          ]}"#;
        let report=browser_amount_preview::match_db04_grid_paths_json(
            sample,witness).unwrap();
        let r:serde_json::Value=serde_json::from_str(&report).unwrap();
        assert_eq!(r["status"],"source_path_matches");
        assert_eq!(r["observedFullGrids"],3);
        assert_eq!(r["matchedFullGrids"],1);
        assert_eq!(r["notInPartialSourceFullGrids"],1);
        assert_eq!(r["ambiguousSourceFullGrids"],1);
        assert_eq!(r["observedDiffGrids"],1);
        assert_eq!(r["contract"],"wand.db05.db04-grid-path-match@2");
        assert_eq!(r["hashUnverifiedDiffGrids"],1);
        assert_eq!(r["structuralCandidateDiffGrids"],1);
        assert_eq!(r["notInPartialSourceDiffGrids"],0);
        assert_eq!(r["ambiguousSourceDiffGrids"],0);
        assert_eq!(r["diffIdentityVerified"],false);
        assert_eq!(r["saveGridNumericIdUsedAsNativeKey"],false);
        assert!(!report.contains("Beach.json") &&
            !report.contains("900") && !report.contains("X"));
        // Extra source-only evidence can narrow the DiffGrid *candidate*
        // without proving either native default hash or effective placement.
        let diff_only=br#"{"GameInfo":{"Version":643},"Player":{},
          "World":{"GridCollection":{"DiffGrids":{
            "1001":{"ID":1001,"GridDefaultLayoutPath":
             "SceneLayouts/Village04/Beach.json",
             "GridDefaultLayoutType":"Meta.GridCollection, Meta",
             "DefaultLayoutGridID":7,"DefaultGridHashCode":999,
             "DefaultGridDataHashCode":-999},
            "1002":{"ID":1002,"GridDefaultLayoutPath":
             "SceneLayouts/Unavailable/Room.json",
             "GridDefaultLayoutType":"Meta.GridCollection, Meta",
             "DefaultLayoutGridID":7,"DefaultGridHashCode":1,
             "DefaultGridDataHashCode":2},
            "1003":{"ID":1003,"GridDefaultLayoutPath":
             "SceneLayouts/Other/Room.json",
             "GridDefaultLayoutType":"Meta.GridCollection, Meta",
             "DefaultLayoutGridID":3,"DefaultGridHashCode":1,
             "DefaultGridDataHashCode":2}
          }}}}"#;
        let narrowed=browser_amount_preview::match_db04_grid_paths_json(
            diff_only,witness).unwrap();
        let v:serde_json::Value=serde_json::from_str(&narrowed).unwrap();
        assert_eq!(v["status"],"diff_structural_candidates_only");
        assert_eq!(v["observedDiffGrids"],3);
        assert_eq!(v["structuralCandidateDiffGrids"],2);
        assert_eq!(v["notInPartialSourceDiffGrids"],1);
        assert_eq!(v["hashUnverifiedDiffGrids"],3);
        assert_eq!(v["diffIdentityVerified"],false);
        assert!(!narrowed.contains("999")&&!narrowed.contains("1001"));
        assert!(browser_amount_preview::match_db04_grid_paths_json(
            sample,r#"{"contract":"wand.db05.db04-grid-path-witness@2",
              "gridRefs":[{"layoutId":"../secret",
                "gridDataPath":"GridData/Village04/Beach.json",
                "nativeGridId":7}]}"#
        ).is_err());
    }

    #[cfg(feature="wasm")]
    #[test]
    fn read_only_grid_reference_projection_hides_ids_and_diff_removals(){
        let root=br#"{"GameInfo":{"Version":643},"Player":{},
            "World":{"GridCollection":{"Grids":{"13":{"ID":13,"Objects":{
              "5":{"ID":5,"ItemID":40000001,"X":64,"State":{"Name":"secret"}},
              "6":{"ID":6,"ItemID":10000001}
            }}},"DiffGrids":{"14":{"ID":14,"RemovedObjects":[7],
              "ModifiedObjects":{
                "7":{"ID":7,"ItemID":40000001,"X":50},
                "8":{"ID":8,"ItemID":40000001,"Storage":{"Owner":"private"}}
              }}}}}}"#;
        let report=browser_amount_preview::saved_grid_references_json(root).unwrap();
        let json:serde_json::Value=serde_json::from_str(&report).unwrap();
        assert_eq!(json["status"],"saved_item_refs");
        assert_eq!(json["entries"].as_array().unwrap().len(),2);
        assert_eq!(json["entries"][1]["itemId"],"40000001");
        assert_eq!(json["entries"][1]["fullGridReferences"],1);
        assert_eq!(json["entries"][1]["diffModifiedReferences"],1);
        assert_eq!(json["contract"],"wand.db05.saved-grid-item-refs@2");
        assert_eq!(json["removedObjectMarkers"],1);
        assert!(!report.contains("secret") && !report.contains("private"));
        assert!(!report.contains("\"X\"") && !report.contains("13"));
        let missing=br#"{"GameInfo":{"Version":643},"Player":{},"World":{}}"#;
        assert_eq!(
          serde_json::from_str::<serde_json::Value>(
            &browser_amount_preview::saved_grid_references_json(missing).unwrap()
          ).unwrap()["status"],"not_observed"
        );
        // A player-modified Save can have a deletion-only DiffGrid. It is
        // not a reason to mark the field shape broken or assert an Item ID.
        let removal_only=br#"{"GameInfo":{"Version":643},"Player":{},
          "World":{"GridCollection":{"DiffGrids":{"17":{
            "RemovedObjects":[1,1,2],
            "OtherSaveField":"preserve-in-original"
          }}}}}"#;
        let report=browser_amount_preview::saved_grid_references_json(
            removal_only).unwrap();
        let v:serde_json::Value=serde_json::from_str(&report).unwrap();
        assert_eq!(v["status"],"observed_no_item_refs");
        assert_eq!(v["observedDiffGrids"],1);
        assert_eq!(v["removedObjectMarkers"],2);
        assert_eq!(v["entries"].as_array().unwrap().len(),0);
        assert!(!report.contains("preserve-in-original"));
        let malformed=br#"{"GameInfo":{"Version":643},"Player":{},
          "World":{"GridCollection":{"Grids":{"3":{"Objects":{
            "2":{"ItemID":40000001}}}},"DiffGrids":{"5":{
            "ModifiedObjects":{"8":{"ItemID":40000001}},
            "RemovedObjects":{"8":true}}}}}}"#;
        let result=browser_amount_preview::saved_grid_references_json(malformed).unwrap();
        let value:serde_json::Value=serde_json::from_str(&result).unwrap();
        assert_eq!(value["status"],"partial_inconclusive");
        assert_eq!(value["entries"].as_array().unwrap().len(),1);
    }

    #[cfg(feature="wasm")]
    #[test]
    fn furniture_catalog_stock_reads_zero_route_and_retained_zero_without_private_values(){
        let raw=br#"{"Player":{"ListInventories":{"0":{"ID":0,"CompatibleItemType":"ItemType_Furniture","CompatibleFurnitureTypes":{"List":["FurnitureItemType_Default","FurnitureItemType_Fence"]},"Inventory":{"40000001":{"Amount":2,"Marker":"private marker"},"40000002":{"Amount":0},"40700001":{"Amount":8}}},"1":{"Inventory":{"40000001":{"Amount":100}}}}},"World":{}}"#;
        let projection=browser_amount_preview::furniture_catalog_stock_json(raw).unwrap();
        let report:serde_json::Value=serde_json::from_str(&projection).unwrap();
        assert_eq!(report["rows"],serde_json::json!([{"itemId":40000001,"amount":2},{"itemId":40000002,"amount":0}]));
        assert!(!projection.contains("private marker"));
        assert_eq!(report["canonicalVariationVerified"],false);
        assert_eq!(report["writerAuthorized"],false);
        let invalid=std::str::from_utf8(raw).unwrap().replace("FurnitureItemType_Default","FurnitureItemType_Door");
        assert!(browser_amount_preview::furniture_catalog_stock_json(invalid.as_bytes()).is_err());
    }
    #[cfg(feature="wasm")]
    #[test]
    fn editable_slot_index_selects_only_positive_known_shape_and_ignores_unknown_fields(){
        // Missing quests and arbitrary unmodeled fields are harmless.
        let raw=br#"{"GameInfo":{"Version":643},"Player":{
          "ListInventories":{"100":{"Inventory":{
            "40000001":{"Amount":1,"Color":"secret"},
            "40000002":{"Amount":250,"Unknown":1.50},
            "40000003":{"Amount":0},
            "40000004":{"Amount":4294967296}
          }}},
          "ContainerInventories":{"202":{"Inventory":[
            {"ItemID":0,"Amount":0},
            {"ItemID":440,"Amount":99,"Unrelated":"private"},
            {"ItemID":441,"Amount":0}
          ]}},
          "PrivateName":"never project"
        },"World":{},"OtherFutureField":{"DontChange":true}}"#;
        let projection=browser_amount_preview::slot_index_json(raw).unwrap();
        let report:serde_json::Value=serde_json::from_str(&projection).unwrap();
        let rows=report["rows"].as_array().unwrap();
        assert_eq!(rows.len(),3);
        assert_eq!(rows[0]["amount"],1);
        assert_eq!(rows[1]["amount"],250);
        assert_eq!(rows[2]["itemId"],440);
        assert_eq!(rows[2]["slotIndex"],1);
        assert!(!projection.contains("never project"));
        assert!(!projection.contains("secret"));
        assert!(!projection.contains("DontChange"));
        assert_eq!(report["writerAuthorized"],false);
    }
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