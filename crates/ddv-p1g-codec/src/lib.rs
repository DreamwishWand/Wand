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
    use ddv_save_patch::{preview_existing_quantity,preview_existing_quantity_batch,QuantityEdit,QuantityTarget};
    use wasm_bindgen::prelude::*;

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

    const MAX_DB04_WITNESS_BYTES:usize=16*1024*1024;
    /// Local-only match of saved full Grid *path pairs* against the
    /// already validated DB-04 native reference index. No numeric Save Grid
    /// identity is used as a native ID. DiffGrids require native hash
    /// evidence absent from the current source index, and are not matched.
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
             !=Some("wand.db05.db04-grid-path-witness@1"){
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
        for row in refs{
            let row=row.as_object().ok_or(CodecError::Json)?;
            if row.len()!=2{return Err(CodecError::Json);}
            let layout=row.get("layoutId").and_then(serde_json::Value::as_str)
                .ok_or(CodecError::Json)?;
            let data=row.get("gridDataPath").and_then(serde_json::Value::as_str)
                .ok_or(CodecError::Json)?;
            if !valid_path(layout,"SceneLayouts/") ||
               !valid_path(data,"GridData/"){
                return Err(CodecError::Json);
            }
            *native.entry((layout.to_owned(),data.to_owned()))
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
                    // DB-04 source grid references have no independently
                    // checked pair of native default-grid hash witnesses.
                    unverified_diff_hash+=1;
                }
            }
            if sampled||malformed_full>0||malformed_diff>0{
                "partial_inconclusive"
            }else if exact_full>0{
                "source_path_matches"
            }else{
                "no_exact_full_path_match"
            }
        };
        serde_json::to_string(&serde_json::json!({
            "contract":"wand.db05.db04-grid-path-match@1",
            "status":source_status,
            "observedFullGrids":observed_full,
            "matchedFullGrids":exact_full,
            "notInPartialSourceFullGrids":not_in_source,
            "ambiguousSourceFullGrids":ambiguous_full,
            "malformedFullGrids":malformed_full,
            "observedDiffGrids":observed_diff,
            "hashUnverifiedDiffGrids":unverified_diff_hash,
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
                    let Some(objects)=grid.get("ModifiedObjects")
                        .and_then(serde_json::Value::as_object) else {
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
            "contract":"wand.db05.saved-grid-item-refs@1",
            "status":status,
            "observedFullGrids":observed_full,
            "observedDiffGrids":observed_diff,
            "invalidRecords":invalid,
            "sampled":sampled,
            "entries":rows,
            "effectivePlacedCountVerified":false,
            "playerPlacementVerified":false,
            "worldSourceMatched":false,
            "saveWritingAuthorized":false
        })).map_err(|_|CodecError::Json)
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
        let witness=r#"{"contract":"wand.db05.db04-grid-path-witness@1",
          "gridRefs":[
            {"layoutId":"SceneLayouts/Village04/Beach.json",
             "gridDataPath":"GridData/Village04/Beach.json"},
            {"layoutId":"SceneLayouts/Other/Room.json",
             "gridDataPath":"GridData/Other/Room.json"},
            {"layoutId":"SceneLayouts/Other/Room.json",
             "gridDataPath":"GridData/Other/Room.json"}
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
        assert_eq!(r["hashUnverifiedDiffGrids"],1);
        assert_eq!(r["diffIdentityVerified"],false);
        assert_eq!(r["saveGridNumericIdUsedAsNativeKey"],false);
        assert!(!report.contains("Beach.json") &&
            !report.contains("900") && !report.contains("X"));
        assert!(browser_amount_preview::match_db04_grid_paths_json(
            sample,r#"{"contract":"wand.db05.db04-grid-path-witness@1",
              "gridRefs":[{"layoutId":"../secret",
                "gridDataPath":"GridData/Village04/Beach.json"}]}"#
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
        assert!(!report.contains("secret") && !report.contains("private"));
        assert!(!report.contains("\"X\"") && !report.contains("13"));
        let missing=br#"{"GameInfo":{"Version":643},"Player":{},"World":{}}"#;
        assert_eq!(
          serde_json::from_str::<serde_json::Value>(
            &browser_amount_preview::saved_grid_references_json(missing).unwrap()
          ).unwrap()["status"],"not_observed"
        );
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