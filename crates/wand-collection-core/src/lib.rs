use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{BTreeMap, HashMap, HashSet};
use wasm_bindgen::prelude::*;

const INDEX_SCHEMA: &str = "wand.collection.runtime@1";
const ROW_SCHEMA: &str = "wand.collection.records@1";
const STATE_SCHEMA: &str = "wand.collection.local@1";
const MAX_WORKSPACES: usize = 5;
const MAX_ROWS: usize = 300_000;
const CATEGORY_ORDER: [&str; 29] = [
    "Furniture","Landscaping","Roads & Fences","Wallpaper & Flooring","Buildings",
    "Environment Effects","Clothing","Appearance","Touch of Magic","Photo Mode",
    "Tools","Upgrades","Characters","Companions","Critters","Mounts","Crafting",
    "Meals","Ingredients","Foraging","Fish","Gems","Timebending","Memories",
    "Board Game","Snippets","Lorekeeper Tales","Quest Puzzles","Exhibition"
];
const LOCALES: [&str; 8] = ["en", "fr", "it", "de", "es-ES", "ja", "zh-CN", "pt-BR"];
const UNKNOWN_NAME_LABELS: [&str;8] = [
    "Name unverified", "Nom non vérifié", "Nome non verificato", "Name nicht bestätigt",
    "Nombre sin verificar", "名称未確認", "名称未核实", "Nome não verificado"
];


const DB00_RELEASE_SCHEMA: &str = "wand.game-db.release@1";
const DB00_SNAPSHOT_SCHEMA: &str = "wand.game-db.snapshot@1";
// Current Steam 1.26.2 source IL2CPP ActivityItemType enum identities.
/// These are native Item subtypes, not CollectionSet/CollectionArea claims.
/// Only retag the matching public native ItemList's overly broad Activity
/// group. Do not alter user-local, historical or independently published data.
fn public_activity_subtype_family(item_id:u64, category:String)->String {
    if category!="Source Activity Items" || !(30_000_000..40_000_000).contains(&item_id) {
        return category;
    }
    let verified = match (item_id % 10_000_000)/100_000 {
        2 => Some("Source Crop"),
        3 => Some("Source Meal"),
        4 => Some("Source Seed"),
        8 => Some("Source Flower"),
        10 => Some("Source Fish"),
        11 => Some("Source Ingredient"),
        15 => Some("Source Consumable"),
        16 => Some("Source Mineral"),
        17 => Some("Source Crafting Material"),
        _ => None,
    };
    verified.unwrap_or("Source Activity Items").to_string()
}

fn intern(dictionary: &mut Vec<String>, value: String) -> usize {
    if let Some(index) = dictionary.iter().position(|entry| entry == &value) { index }
    else { let index = dictionary.len(); dictionary.push(value); index }
}
#[derive(Deserialize)]
struct Db00Source {
    id: String,
    visibility: String,
}
#[derive(Deserialize)]
struct Db00Release {
    id: String,
}
#[derive(Deserialize)]
struct Db00Target {
    platform: String,
    #[serde(rename="gameVersion")]
    game_version: Option<String>,
    #[serde(rename="buildId")]
    build_id: Option<String>,
}
#[derive(Deserialize)]
struct Db00Index {
    schema: String,
    id: String,
    count: usize,
    target: Db00Target,
    sources: Vec<Db00Source>,
    releases: Vec<Db00Release>,
    shards: Vec<ShardMeta>,
}
#[derive(Deserialize)]
struct Db00Shard {
    schema: String,
    offset: usize,
    count: usize,
    items: Vec<Db00Item>,
}
#[derive(Deserialize)]
struct Db00Item {
    id: String,
    names: HashMap<String,String>,
    #[serde(rename="nameStatus")]
    name_status: String,
    category: Option<String>,
    #[serde(rename="stateClass")]
    state_class: Option<String>,
    #[serde(rename="stateSemantic")]
    state_semantic: Option<String>,
    #[serde(default)]
    worlds: Vec<String>,
    #[serde(default)]
    universes: Vec<String>,
    #[serde(default,rename="contentIds")]
    content_ids: Vec<String>,
    #[serde(default,rename="releaseIds")]
    release_ids: Vec<String>,
    #[serde(default,rename="sourceRefs")]
    source_refs: Vec<String>,
    #[serde(default)]
    relations: Vec<String>,
}

#[derive(Clone, Deserialize)]
struct ManifestTarget {
    platform: String,
    #[serde(rename = "gameVersion")]
    game_version: String,
    #[serde(rename = "buildID")]
    build_id: String,
}

#[derive(Clone, Deserialize)]
struct ShardMeta {
    file: String,
    offset: usize,
    count: usize,
    bytes: usize,
    sha256: String,
}

#[derive(Clone, Deserialize)]
struct Index {
    #[serde(rename = "s")]
    schema: String,
    #[serde(rename = "t")]
    target: ManifestTarget,
    #[serde(rename = "f")]
    families: Vec<String>,
    #[serde(rename = "c")]
    state_classes: Vec<String>,
    #[serde(rename = "m")]
    semantics: Vec<String>,
    #[serde(rename = "w")]
    worlds: Vec<String>,
    #[serde(rename = "u")]
    universes: Vec<String>,
    #[serde(rename = "e")]
    expansions: Vec<String>,
    #[serde(rename = "wl")]
    world_labels: Vec<Vec<String>>,
    #[serde(rename = "ul")]
    universe_labels: Vec<Vec<String>>,
    #[serde(rename = "n")]
    count: usize,
    shards: Vec<ShardMeta>,
}

#[derive(Deserialize)]
struct Shard {
    #[serde(rename = "s")]
    schema: String,
    offset: usize,
    count: usize,
    #[serde(rename = "r")]
    rows: Vec<(u64, usize, usize, usize, Vec<usize>, Vec<usize>, Vec<usize>, Vec<Option<String>>)>,
}

#[derive(Clone)]
struct Item {
    id: u64,
    family: usize,
    semantic: usize,
    world: Vec<usize>,
    universe: Vec<usize>,
    expansion: Vec<usize>,
    labels: Vec<String>,
    search: String,
    name_verified: bool,
}

#[derive(Default, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
struct Entry {
    #[serde(skip_serializing_if = "Option::is_none")]
    status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    quantity: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    discovered: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    favorite: Option<bool>,
}

impl Entry {
    fn valid(&self) -> bool {
        self.status.as_ref().is_none_or(|s| s == "owned" || s == "missing")
            && self.quantity.is_none_or(|q| q <= 999_999)
    }
    fn empty(&self) -> bool {
        self.status.is_none() && self.quantity.is_none()
            && self.discovered.is_none() && self.favorite.is_none()
    }
}

/// Trusted save decoder adapter may supply only ID/status pairs whose
/// Collection semantics it verified. Raw save map keys are not this contract.
const SAVE_STATUS_IMPORT_SCHEMA: &str = "wand.collection.mapped-save-status@1";
const MAX_SAVE_STATUS_ITEMS: usize = 20_000;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct MappedSaveStatusRow {
    item_id: u64,
    status: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct MappedSaveStatusImport {
    schema: String,
    entries: Vec<MappedSaveStatusRow>,
}

/// Separate from owned/missing: native CollectionSet boolean values encode
/// discovery history, not actual inventory ownership.
const SAVE_DISCOVERY_IMPORT_SCHEMA: &str = "wand.collection.mapped-save-discovery@1";
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct MappedSaveDiscoveryRow {
    item_id: u64,
    discovered: bool,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct MappedSaveDiscoveryImport {
    schema: String,
    entries: Vec<MappedSaveDiscoveryRow>,
}

#[derive(Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
struct Workspace {
    id: String,
    name: String,
    entries: BTreeMap<String, Entry>,
}

#[derive(Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
struct State {
    schema: String,
    active: String,
    workspaces: Vec<Workspace>,
}

impl Default for State {
    fn default() -> Self {
        Self {
            schema: STATE_SCHEMA.into(),
            active: "local-1".into(),
            workspaces: vec![Workspace {
                id: "local-1".into(),
                name: "My Collection".into(),
                entries: BTreeMap::new(),
            }],
        }
    }
}

fn valid_workspace_id(s: &str) -> bool {
    !s.is_empty() && s.len() <= 80
        && s.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_')
}
fn valid_item_id(s: &str) -> bool {
    s.len() <= 16 && !s.is_empty() && !s.starts_with('0')
        && s.bytes().all(|b| b.is_ascii_digit())
        && s.parse::<u64>().is_ok_and(|n| n > 0 && n <= 9_007_199_254_740_991)
}
fn valid_state(s: &State) -> Result<(), String> {
    if s.schema != STATE_SCHEMA || s.workspaces.is_empty() || s.workspaces.len() > MAX_WORKSPACES {
        return Err("COLLECTION_BACKUP_SCHEMA".into());
    }
    let mut ids = HashSet::new();
    for w in &s.workspaces {
        if !valid_workspace_id(&w.id) || !ids.insert(w.id.clone())
            || w.name.trim().is_empty() || w.name.len() > 80
        {
            return Err("COLLECTION_WORKSPACE_INVALID".into());
        }
        if w.entries.len() > MAX_ROWS {
            return Err("COLLECTION_ENTRIES_LIMIT".into());
        }
        for (id, entry) in &w.entries {
            if !valid_item_id(id) || !entry.valid() {
                return Err("COLLECTION_ENTRY_INVALID".into());
            }
        }
    }
    if !ids.contains(&s.active) {
        return Err("COLLECTION_ACTIVE_WORKSPACE_INVALID".into());
    }
    Ok(())
}
fn parse_state(source: &str) -> Result<State, String> {
    if source.len() > 10_000_000 {
        return Err("COLLECTION_BACKUP_TOO_LARGE".into());
    }
    let state: State = serde_json::from_str(source).map_err(|_| "COLLECTION_BACKUP_INVALID")?;
    valid_state(&state)?;
    Ok(state)
}
fn locale_index(locale: &str) -> usize {
    LOCALES.iter().position(|l| *l == locale).unwrap_or(0)
}
fn display(text: &str) -> String {
    text.replace("<nobr>", "").replace("</nobr>", "")
        .replace(&['\u{200b}', '\u{200c}', '\u{200d}', '\u{feff}'][..], "")
        .trim().to_string()
}
fn one_of(needle: &str, values: &[String], indices: &[usize]) -> bool {
    needle.is_empty() || indices.iter().any(|&i| values.get(i).is_some_and(|v| v == needle))
}
fn output<T: Serialize>(value: &T) -> Result<String, String> {
    serde_json::to_string(value).map_err(|_| "COLLECTION_SERIALIZATION_FAILED".into())
}
#[derive(Default, Deserialize)]
#[serde(default, deny_unknown_fields)]
struct Query {
    locale: String,
    search: String,
    category: String,
    world: String,
    universe: String,
    expansion: String,
    status: String,
    #[serde(rename="favoriteOnly")]
    favorite_only: bool,
    offset: usize,
    limit: usize,
    #[serde(rename="nameStatus")]
    name_status: String,
}
fn checked_index(source: &str) -> Result<Index, String> {
    let index: Index = serde_json::from_str(source).map_err(|_| "COLLECTION_INDEX_JSON")?;
    if index.schema != INDEX_SCHEMA || index.target.platform != "Nintendo Switch"
        || index.target.game_version != "1.25.0" || index.target.build_id != "52BD625D9B4E0053"
        || index.count == 0 || index.count > MAX_ROWS || index.shards.is_empty()
        || index.families.is_empty() || index.semantics.is_empty()
        || index.world_labels.len() != index.worlds.len()
        || index.universe_labels.len() != index.universes.len()
        || index.world_labels.iter().any(|l| l.len() != 8)
        || index.universe_labels.iter().any(|l| l.len() != 8)
    {
        return Err("COLLECTION_INDEX_UNSUPPORTED".into());
    }
    let mut offset = 0usize;
    for s in &index.shards {
        if s.offset != offset || s.count == 0 || s.count > 10000 || s.bytes == 0
            || s.sha256.len() != 64
            || !s.sha256.bytes().all(|b| b.is_ascii_hexdigit())
            || !s.file.starts_with("records-") || !s.file.ends_with(".json")
            || s.file.bytes().any(|b| !(b.is_ascii_alphanumeric() || b == b'-' || b == b'.'))
        {
            return Err("COLLECTION_INDEX_SHARD_INVALID".into());
        }
        offset = offset.checked_add(s.count).ok_or("COLLECTION_INDEX_OVERFLOW")?;
    }
    if offset != index.count {
        return Err("COLLECTION_INDEX_COUNT_MISMATCH".into());
    }
    Ok(index)
}

#[wasm_bindgen]
pub struct CollectionEngine {
    index: Option<Index>,
    rows: Vec<Item>,
    lookup: HashMap<u64, usize>,
    state: State,
    db00_mode: bool,
    db00_sources: HashSet<String>,
    db00_releases: HashSet<String>,
    db00_relations: Vec<(u64,u64)>,
    owner_local_complete: bool,
    public_native_itemlist: bool,
    public_complete_collection: bool,
}

impl Default for CollectionEngine {
    fn default() -> Self {
        Self {
            index: None,
            rows: Vec::new(),
            lookup: HashMap::new(),
            state: State::default(),
            db00_mode: false,
            db00_sources: HashSet::new(),
            db00_releases: HashSet::new(),
            db00_relations: Vec::new(),
            owner_local_complete: false,
            public_native_itemlist: false,
            public_complete_collection: false,
        }
    }
}

impl CollectionEngine {
    fn load_index_impl(&mut self, source: &str) -> Result<(), String> {
        let index = checked_index(source)?;
        self.index = Some(index);
        self.rows.clear();
        self.lookup.clear();
        self.db00_mode = false;
        self.owner_local_complete = false;
        self.public_native_itemlist = false;
        self.public_complete_collection = false;
        self.db00_sources.clear();
        self.db00_releases.clear();
        self.db00_relations.clear();
        Ok(())
    }
    fn load_db00_index_impl(&mut self, source: &str) -> Result<(),String> {
        self.load_db00_index_visibility_impl(source,"public_reference")
    }
    // A user-selected, SHA-pinned private catalog is never fetched from the
    // public active pointer and is never written into IndexedDB.
    fn load_owner_local_db00_index_impl(&mut self, source: &str) -> Result<(),String> {
        self.load_db00_index_visibility_impl(source,"private")
    }
    fn load_db00_index_visibility_impl(&mut self, source: &str, visibility: &str) -> Result<(),String> {
        let published: Db00Index = serde_json::from_str(source).map_err(|_|"COLLECTION_DB00_INDEX_JSON")?;
        if published.schema != DB00_RELEASE_SCHEMA || published.id.is_empty()
            || published.count == 0 || published.count > MAX_ROWS
            || published.target.platform.is_empty() || published.sources.is_empty()
            || published.sources.iter().any(|entry|entry.visibility!=visibility || entry.id.is_empty())
        { return Err("COLLECTION_DB00_PUBLISHABLE_INDEX_REQUIRED".into()); }
        if visibility=="private"
            && ( (published.id!="db01-steam-1-26-2-owner-local-verified"
                && published.id!="db01-steam-1-26-2-owner-local-complete")
                || published.target.platform!="Steam"
                || published.target.game_version.as_deref()!=Some("1.26.2")
                || published.count>13_202 || published.sources.len()!=1
                || published.sources[0].id!="private-db01-v1262")
        { return Err("COLLECTION_LOCAL_DB01_TARGET_REQUIRED".into()); }
        let sources:HashSet<String> = published.sources.iter().map(|entry|entry.id.clone()).collect();
        let releases:HashSet<String> = published.releases.iter().map(|entry|entry.id.clone()).collect();
        if sources.len()!=published.sources.len() || releases.len()!=published.releases.len()
            || published.shards.is_empty()
        { return Err("COLLECTION_DB00_INDEX_DUPLICATE".into()); }
        let mut count = 0usize;
        for shard in &published.shards {
            if shard.offset != count || shard.count == 0 || shard.count > 10000
                || shard.bytes == 0 || shard.sha256.len() != 64
                || !shard.sha256.bytes().all(|b| b.is_ascii_hexdigit())
                || !shard.file.starts_with("items-") || !shard.file.ends_with(".json")
                || shard.file.bytes().any(|b|!(b.is_ascii_alphanumeric() || b==b'-' || b==b'.'))
            { return Err("COLLECTION_DB00_INDEX_SHARDS".into()); }
            count = count.checked_add(shard.count).ok_or("COLLECTION_DB00_INDEX_OVERFLOW")?;
        }
        if count != published.count {return Err("COLLECTION_DB00_INDEX_COUNT".into());}
        let public_native_itemlist=visibility=="public_reference"
            && published.id=="steam-1.26.2-native-itemlist-v1"
            && published.target.platform=="Steam"
            && published.target.game_version.as_deref()==Some("1.26.2")
            && published.count==13_202
            && published.sources.len()==1
            && published.sources[0].id=="public-steam-1262-normalized";
        let public_complete_collection=visibility=="public_reference"
            && published.id.starts_with("steam-") && published.id.ends_with("-collection-source-v3")
            && published.target.platform=="Steam"
            && published.sources.len()==1
            && published.sources[0].id=="db01-complete-source";
        self.index = Some(Index {
            schema: DB00_RELEASE_SCHEMA.into(),
            target: ManifestTarget {
                platform: published.target.platform,
                game_version: published.target.game_version.unwrap_or_else(||"unknown".into()),
                build_id: published.target.build_id.unwrap_or_else(||"unknown".into()),
            },
            families: vec!["Unclassified".into()],
            state_classes: vec!["READ_ONLY".into()],
            semantics: vec!["UNLOCK_OR_AVAILABILITY".into()],
            worlds: Vec::new(), universes: Vec::new(), expansions: Vec::new(),
            world_labels: Vec::new(), universe_labels: Vec::new(),
            count:published.count, shards:published.shards,
        });
        self.rows.clear();
        self.lookup.clear();
        self.db00_mode=true;
        self.owner_local_complete=visibility=="private"
            && published.id=="db01-steam-1-26-2-owner-local-complete";
        self.public_native_itemlist=public_native_itemlist;
        self.public_complete_collection=public_complete_collection;
        self.db00_sources=sources;
        self.db00_releases=releases;
        self.db00_relations.clear();
        Ok(())
    }
    fn append_db00_shard_impl(&mut self, source: &str) -> Result<(),String> {
        if !self.db00_mode {return Err("COLLECTION_DB00_INDEX_REQUIRED".into());}
        let index=self.index.as_ref().ok_or("COLLECTION_DB00_INDEX_REQUIRED")?;
        let meta=index.shards.iter().find(|shard|shard.offset==self.rows.len())
            .ok_or("COLLECTION_DB00_SHARD_ORDER")?;
        if source.as_bytes().len()!=meta.bytes {return Err("COLLECTION_DB00_SHARD_BYTES".into());}
        let shard:Db00Shard=serde_json::from_str(source).map_err(|_|"COLLECTION_DB00_SHARD_JSON")?;
        if shard.schema!=DB00_SNAPSHOT_SCHEMA || shard.offset!=meta.offset
            || shard.count!=meta.count || shard.items.len()!=meta.count
        {return Err("COLLECTION_DB00_SHARD_CONTRACT".into());}
        // Stage the dictionary too: a rejected row must not leave phantom
        // categories, semantics, world/universe or expansion IDs behind.
        let mut staged_index=index.clone();
        let mut staged=Vec::with_capacity(shard.items.len());
        let mut staged_relations=Vec::new();
        let mut ids=HashSet::new();
        let owner_local=self.db00_sources.contains("private-db01-v1262");
        for row in shard.items {
            if !valid_item_id(&row.id) {return Err("COLLECTION_DB00_ITEM_ID".into());}
            let name_verified=row.name_status=="verified";
            if self.public_native_itemlist {
                let complete=row.names.len()==LOCALES.len()
                    && LOCALES.iter().all(|locale|row.names.get(*locale)
                        .is_some_and(|name|!name.trim().is_empty() && name.len()<=512));
                if !((name_verified && complete)
                    || (row.name_status=="unverified" && row.names.is_empty())) {
                    return Err("COLLECTION_DB00_NATIVE_NAMES_INVALID".into());
                }
            }
            if self.public_complete_collection {
                let valid_labels=row.names.values().all(|v|!v.trim().is_empty()&&v.len()<=512);
                if !valid_labels || !(name_verified && row.names.len()==LOCALES.len()
                    || row.name_status=="unverified" && row.names.len()<LOCALES.len()) {
                    return Err("COLLECTION_DB01_COMPLETE_NAMES_INVALID".into());
                }
            }
            if owner_local {
                // A verified name requires every locale. Only the SHA-pinned
                // complete owner-local release may contain *unnamed* source IDs.
                let fully_named=row.names.len()==LOCALES.len()
                    && LOCALES.iter().all(|locale| row.names.get(*locale)
                        .is_some_and(|name| !name.trim().is_empty() && name.len()<=512));
                if !((name_verified && fully_named)
                    || (self.owner_local_complete && row.name_status=="unverified"
                        && row.names.is_empty())) {
                    return Err("COLLECTION_LOCAL_DB01_NAMES_REQUIRED".into());
                }
            }
            let id=row.id.parse::<u64>().map_err(|_|"COLLECTION_DB00_ITEM_ID")?;
            if !ids.insert(id) || self.lookup.contains_key(&id)
                || (!owner_local && !self.public_native_itemlist && !self.public_complete_collection && !name_verified)
                || row.names.keys().any(|l|!LOCALES.contains(&l.as_str()))
                || row.source_refs.is_empty()
                || row.source_refs.iter().any(|r|!self.db00_sources.contains(r))
                || row.release_ids.iter().any(|r|!self.db00_releases.contains(r))
            {return Err("COLLECTION_DB00_ITEM_UNVERIFIED".into());}
            for related in row.relations {
                if !valid_item_id(&related) {return Err("COLLECTION_DB00_RELATION_ID".into());}
                staged_relations.push((id,related.parse::<u64>().map_err(|_|"COLLECTION_DB00_RELATION_ID")?));
            }
            let published_category=row.category.unwrap_or_else(||"Unclassified".into());
            let display_category=if self.public_native_itemlist {
                public_activity_subtype_family(id,published_category)
            } else {
                published_category
            };
            let family=intern(&mut staged_index.families,display_category);
            let semantic=intern(&mut staged_index.semantics,row.state_semantic.unwrap_or_else(||"UNLOCK_OR_AVAILABILITY".into()));
            intern(&mut staged_index.state_classes,row.state_class.unwrap_or_else(||"READ_ONLY".into()));
            let world:Vec<usize>=row.worlds.into_iter().map(|v|intern(&mut staged_index.worlds,v)).collect();
            let universe:Vec<usize>=row.universes.into_iter().map(|v|intern(&mut staged_index.universes,v)).collect();
            let expansion:Vec<usize>=row.content_ids.into_iter().map(|v|intern(&mut staged_index.expansions,v)).collect();
            let labels:Vec<String>=LOCALES.iter().map(|lang|display(row.names.get(*lang).map(|s|s.as_str()).unwrap_or(""))).collect();
            let search=labels.join(" ").to_lowercase();
            staged.push(Item {id,family,semantic,world,universe,expansion,labels,search,name_verified});
        }
        staged_index.world_labels=staged_index.worlds.iter().map(|label|vec![label.clone();8]).collect();
        staged_index.universe_labels=staged_index.universes.iter().map(|label|vec![label.clone();8]).collect();
        // No shared Collection state is touched until every item is valid.
        self.index=Some(staged_index);
        for item in staged {
            self.lookup.insert(item.id,self.rows.len());
            self.rows.push(item);
        }
        self.db00_relations.extend(staged_relations);
        Ok(())
    }
    fn finish_db00_impl(&self)->Result<(),String>{
        if !self.db00_mode {return Err("COLLECTION_DB00_INDEX_REQUIRED".into());}
        self.ready()?;
        if self.db00_relations.iter().any(|(_,to)|!self.lookup.contains_key(to))
        {return Err("COLLECTION_DB00_DANGLING_RELATION".into());}
        Ok(())
    }
    fn metadata_impl(&self)->Result<String,String>{
        let index=self.ready()?;
        output(&json!({
            "version": if self.db00_mode && index.target.game_version=="unknown" {
                None
            } else {
                Some(index.target.game_version.as_str())
            },
            "platform":index.target.platform,
            "expansions":index.expansions,
            "worlds":index.worlds,
            "universes":index.universes,
            "worldLabels":index.world_labels,
            "universeLabels":index.universe_labels
        }))
    }
    fn append_shard_impl(&mut self, source: &str) -> Result<(), String> {
        let index = self.index.as_ref().ok_or("COLLECTION_INDEX_REQUIRED")?;
        let meta = index.shards.iter().find(|s| s.offset == self.rows.len())
            .ok_or("COLLECTION_SHARD_ORDER")?;
        if source.len() != meta.bytes {
            return Err("COLLECTION_SHARD_SIZE_MISMATCH".into());
        }
        let shard: Shard = serde_json::from_str(source).map_err(|_| "COLLECTION_SHARD_JSON")?;
        if shard.schema != ROW_SCHEMA || shard.offset != meta.offset
            || shard.count != meta.count || shard.rows.len() != meta.count
        {
            return Err("COLLECTION_SHARD_SCHEMA".into());
        }
        let mut staged = Vec::with_capacity(shard.rows.len());
        let mut ids = HashSet::new();
        for (id, family, class, semantic, world, universe, expansion, labels) in shard.rows {
            if id == 0 || id > 9_007_199_254_740_991 || !ids.insert(id)
                || self.lookup.contains_key(&id) || family >= index.families.len()
                || class >= index.state_classes.len() || semantic >= index.semantics.len()
                || labels.len() != 8 || world.iter().any(|&v| v >= index.worlds.len())
                || universe.iter().any(|&v| v >= index.universes.len())
                || expansion.iter().any(|&v| v >= index.expansions.len())
            {
                return Err("COLLECTION_SHARD_RECORD".into());
            }
            let labels: Vec<String> = labels.iter().map(|label| display(label.as_deref().unwrap_or(""))).collect();
            let search = labels.join(" ").to_lowercase();
            staged.push(Item { id, family, semantic, world, universe, expansion, labels, search, name_verified:true });
        }
        for item in staged {
            self.lookup.insert(item.id, self.rows.len());
            self.rows.push(item);
        }
        Ok(())
    }
    fn ready(&self) -> Result<&Index, String> {
        let index = self.index.as_ref().ok_or("COLLECTION_INDEX_REQUIRED")?;
        if self.rows.len() != index.count {
            return Err("COLLECTION_CATALOG_INCOMPLETE".into());
        }
        Ok(index)
    }
    fn workspace(&self) -> &Workspace {
        self.state.workspaces.iter().find(|w| w.id == self.state.active)
            .expect("validated active workspace")
    }
    fn entry(&self, id: u64) -> Option<&Entry> {
        self.workspace().entries.get(&id.to_string())
    }
    fn status(&self, id: u64) -> &str {
        self.entry(id).and_then(|e| e.status.as_deref()).unwrap_or("unknown")
    }
    fn item_json(&self, index: &Index, item: &Item, loc: usize) -> Value {
        let entry = self.entry(item.id);
        let label = if !item.name_verified && !self.public_complete_collection {
            UNKNOWN_NAME_LABELS[loc].to_string()
        } else {
            item.labels.get(loc).filter(|s| !s.is_empty())
                .or_else(|| item.labels.iter().find(|s| !s.is_empty()))
                .cloned().unwrap_or_else(|| if self.public_complete_collection {UNKNOWN_NAME_LABELS[loc].to_string()} else {format!("Item {}", item.id)})
        };
        json!({
            "itemId":item.id,
            "label": label,
            "nameVerified":item.name_verified,
            "family":index.families[item.family],
            "stateSemantic": index.semantics[item.semantic],
            "worlds":item.world.iter().map(|&i| index.worlds[i].as_str()).collect::<Vec<_>>(),
            "universes":item.universe.iter().map(|&i| index.universes[i].as_str()).collect::<Vec<_>>(),
            "expansions":item.expansion.iter().map(|&i| index.expansions[i].as_str()).collect::<Vec<_>>(),
            "status": self.status(item.id),
            "quantity":entry.and_then(|e|e.quantity),
            "discovered":entry.and_then(|e|e.discovered),
            "favorite":entry.and_then(|e|e.favorite),
        })
    }
    // Both paging and full-filter writes use the same predicate. In particular,
    // limit/offset only affect display, never the set that a bulk action changes.
    fn matching_rows<'a>(&'a self, index: &Index, query: &Query) -> Result<Vec<&'a Item>, String> {
        if query.search.len() > 512
            || !["", "all", "owned", "missing", "unknown"].contains(&query.status.as_str())
            || !["", "all", "verified", "unverified"].contains(&query.name_status.as_str())
        { return Err("COLLECTION_QUERY_BOUNDS".into()); }
        let term = query.search.trim().to_lowercase();
        Ok(self.rows.iter().filter(|r| {
            (term.is_empty() || r.search.contains(&term) || r.id.to_string().contains(&term))
            && (query.category.is_empty() || index.families[r.family] == query.category)
            && one_of(&query.world,&index.worlds,&r.world)
            && one_of(&query.universe,&index.universes,&r.universe)
            && one_of(&query.expansion,&index.expansions,&r.expansion)
            && (query.status.is_empty() || query.status == "all" || self.status(r.id) == query.status)
            && (!query.favorite_only || self.entry(r.id).is_some_and(|e| e.favorite == Some(true)))
            && (query.name_status.is_empty() || query.name_status=="all"
                || (query.name_status=="verified" && r.name_verified)
                || (query.name_status=="unverified" && !r.name_verified))
        }).collect())
    }
    fn query_impl(&self, source: &str) -> Result<String, String> {
        let index = self.ready()?;
        let query: Query = serde_json::from_str(source).map_err(|_|"COLLECTION_QUERY_INVALID")?;
        if query.limit == 0 || query.limit > 200 || query.offset > MAX_ROWS
        { return Err("COLLECTION_QUERY_BOUNDS".into()); }
        let loc = locale_index(&query.locale);
        let mut matches = self.matching_rows(index, &query)?;
        matches.sort_unstable_by(|a,b| {
            b.name_verified.cmp(&a.name_verified).then(
            a.labels.get(loc).unwrap_or(&String::new()).to_lowercase()
                .cmp(&b.labels.get(loc).unwrap_or(&String::new()).to_lowercase())
                .then(a.id.cmp(&b.id)))
        });
        let total = matches.len();
        let page = matches.into_iter().skip(query.offset).take(query.limit)
            .map(|r|self.item_json(index,r,loc)).collect::<Vec<_>>();
        output(&json!({"total":total,"items":page,"hasMore":query.offset.saturating_add(query.limit)<total}))
    }
    fn facets_impl(&self, mode: &str, locale: &str) -> Result<String, String> {
        let index = self.ready()?;
        let loc = locale_index(locale);
        let names: Vec<String> = match mode {
            "category" => {
                let mut ordered: Vec<String> = CATEGORY_ORDER.iter().map(|v|v.to_string()).collect();
                for name in &index.families {
                    if !ordered.contains(name) {ordered.push(name.clone());}
                }
                ordered
            }
            "world" => index.worlds.clone(),
            "universe" => index.universes.clone(),
            _ => return Err("COLLECTION_MODE_INVALID".into())
        };
        let mut totals = vec![0usize; names.len()];
        let mut owned = vec![0usize; names.len()];
        for item in &self.rows {
            let ids: Vec<usize> = match mode {
                "category" => vec![names.iter().position(|name|name==&index.families[item.family])
                    .ok_or("COLLECTION_FAMILY_UNKNOWN")?],
                "world" => item.world.clone(),
                _ => item.universe.clone(),
            };
            for id in ids {
                totals[id] += 1;
                if self.status(item.id) == "owned" { owned[id] += 1; }
            }
        }
        // CATEGORY_ORDER is only a stable sort preference. Do not expose
        // scaffolding families with zero source Item IDs as editable cards:
        // the complete Steam 1.26.2 ItemList has four raw source families,
        // further split by its verified IL2CPP native subtypes.
        let result: Vec<Value> = names.iter().enumerate()
            .filter(|(i,_)| mode!="category" || totals[*i]>0)
            .map(|(i,id)| {
            let label = match mode {
                "world" => index.world_labels.get(i).and_then(|n| n.get(loc)).cloned().unwrap_or(id.clone()),
                "universe" => index.universe_labels.get(i).and_then(|n| n.get(loc)).cloned().unwrap_or(id.clone()),
                _ => id.clone()
            };
            json!({"id":id,"label":label,"total":totals[i],"owned":owned[i]})
        }).collect();
        output(&result)
    }
    fn progress_impl(&self) -> Result<String, String> {
        self.ready()?;
        let (mut owned, mut missing, mut unknown, mut discovered) = (0,0,0,0);
        for item in &self.rows {
            match self.status(item.id) {
                "owned" => owned += 1,
                "missing" => missing += 1,
                _ => unknown += 1,
            }
            if self.entry(item.id).and_then(|e|e.discovered)==Some(true) { discovered += 1; }
        }
        output(&json!({"owned":owned,"missing":missing,"unknown":unknown,"discovered":discovered,"total":self.rows.len()}))
    }
    fn with_state<F>(&mut self, mutate: F) -> Result<(), String>
        where F:FnOnce(&mut State)->Result<(), String>
    {
        let mut candidate = self.state.clone();
        mutate(&mut candidate)?;
        valid_state(&candidate)?;
        self.state = candidate;
        Ok(())
    }
    fn set_entry_impl(&mut self, id: u64, change: &str) -> Result<(), String> {
        if id == 0 || id > 9_007_199_254_740_991 { return Err("COLLECTION_ITEM_ID_INVALID".into()); }
        let update: Value = serde_json::from_str(change).map_err(|_|"COLLECTION_CHANGE_INVALID")?;
        let m = update.as_object().ok_or("COLLECTION_CHANGE_INVALID")?;
        if m.keys().any(|k| !["status","quantity","discovered","favorite"].contains(&k.as_str())) {
            return Err("COLLECTION_CHANGE_FIELD".into());
        }
        self.with_state(|state| {
            let w = state.workspaces.iter_mut().find(|w|w.id==state.active)
                .ok_or("COLLECTION_WORKSPACE_NOT_FOUND")?;
            let key = id.to_string();
            let mut e = w.entries.get(&key).cloned().unwrap_or_default();
            for (k,v) in m {
                match k.as_str() {
                    "status" => e.status = if v.is_null() {None} else {Some(v.as_str().ok_or("COLLECTION_STATUS_INVALID")?.to_string())},
                    "quantity" => e.quantity = if v.is_null() {None} else {Some(v.as_u64().and_then(|x|u32::try_from(x).ok()).ok_or("COLLECTION_QUANTITY_INVALID")?)},
                    "discovered" => e.discovered = if v.is_null() {None} else {Some(v.as_bool().ok_or("COLLECTION_DISCOVERED_INVALID")?)},
                    "favorite" => e.favorite = if v.is_null() {None} else {Some(v.as_bool().ok_or("COLLECTION_FAVORITE_INVALID")?)},
                    _ => return Err("COLLECTION_CHANGE_FIELD".into())
                }
            }
            if e.empty() { w.entries.remove(&key); } else { w.entries.insert(key,e); }
            Ok(())
        })
    }
    fn bulk_impl(&mut self, ids_json: &str, status: &str) -> Result<(), String> {
        if !["owned","missing","unknown"].contains(&status) {return Err("COLLECTION_BULK_STATUS".into());}
        let ids: Vec<u64> = serde_json::from_str(ids_json).map_err(|_|"COLLECTION_BULK_IDS")?;
        if ids.len() > 20_000 || ids.iter().any(|id|*id == 0 || *id > 9_007_199_254_740_991) {
            return Err("COLLECTION_BULK_INVALID".into());
        }
        self.with_state(|state| {
            let w = state.workspaces.iter_mut().find(|w|w.id==state.active)
                .ok_or("COLLECTION_WORKSPACE_NOT_FOUND")?;
            for id in ids {
                let key = id.to_string();
                let mut e = w.entries.get(&key).cloned().unwrap_or_default();
                e.status = if status == "unknown" {None} else {Some(status.to_string())};
                if e.empty() { w.entries.remove(&key); } else {w.entries.insert(key,e);}
            }
            Ok(())
        })
    }
    fn bulk_matching_impl(&mut self, source: &str, status: &str) -> Result<usize, String> {
        // Compute all matching IDs before modifying state: applying a status
        // filter must not cause the remaining matched rows to disappear mid-write.
        let index = self.ready()?;
        let query: Query = serde_json::from_str(source).map_err(|_|"COLLECTION_QUERY_INVALID")?;
        let ids: Vec<u64> = self.matching_rows(index, &query)?
            .into_iter().map(|item| item.id).collect();
        let count = ids.len();
        self.bulk_impl(&output(&ids)?, status)?;
        Ok(count)
    }
    /// Apply precisely mapped status fields from a verified save adapter.
    /// Unobserved IDs are never interpreted as missing; all omitted IDs and
    /// manually recorded favorites, quantities, and discoveries stay intact.
    /// Every row is validated before atomically replacing overlapping statuses
    /// in the active workspace. No personal save bytes/values are stored.
    fn apply_mapped_save_statuses_impl(&mut self, source: &str) -> Result<usize, String> {
        let _ = self.ready()?;
        if source.len() > 1_500_000 {
            return Err("COLLECTION_SAVE_IMPORT_TOO_LARGE".into());
        }
        let patch: MappedSaveStatusImport = serde_json::from_str(source)
            .map_err(|_| "COLLECTION_SAVE_IMPORT_INVALID")?;
        if patch.schema != SAVE_STATUS_IMPORT_SCHEMA || patch.entries.len() > MAX_SAVE_STATUS_ITEMS {
            return Err("COLLECTION_SAVE_IMPORT_CONTRACT".into());
        }
        let mut seen = HashSet::new();
        for row in &patch.entries {
            if row.item_id == 0 || row.item_id > 9_007_199_254_740_991
                || !self.lookup.contains_key(&row.item_id)
                || !["owned", "missing", "unknown"].contains(&row.status.as_str())
                || !seen.insert(row.item_id)
            {
                return Err("COLLECTION_SAVE_IMPORT_ENTRY_INVALID".into());
            }
        }
        let changed = patch.entries.len();
        self.with_state(|state| {
            let w = state.workspaces.iter_mut().find(|w|w.id == state.active)
                .ok_or("COLLECTION_WORKSPACE_NOT_FOUND")?;
            for row in patch.entries {
                let key = row.item_id.to_string();
                let mut entry = w.entries.get(&key).cloned().unwrap_or_default();
                entry.status = if row.status == "unknown" { None } else { Some(row.status) };
                if entry.empty() { w.entries.remove(&key); }
                else { w.entries.insert(key, entry); }
            }
            Ok(())
        })?;
        Ok(changed)
    }
    /// Apply save-backed discovery only for exact catalog item IDs.
    /// Does not infer ownership, treat omitted IDs as missing, or change
    /// quantities/favorites. Unknown catalog IDs are harmlessly skipped to
    /// support the current partial native item database. The complete
    /// changeset is validated before one atomic workspace mutation.
    fn apply_mapped_save_discovery_impl(&mut self, source: &str) -> Result<usize, String> {
        let _ = self.ready()?;
        if source.len() > 1_500_000 {
            return Err("COLLECTION_DISCOVERY_IMPORT_TOO_LARGE".into());
        }
        let patch: MappedSaveDiscoveryImport = serde_json::from_str(source)
            .map_err(|_| "COLLECTION_DISCOVERY_IMPORT_INVALID")?;
        if patch.schema != SAVE_DISCOVERY_IMPORT_SCHEMA || patch.entries.len() > MAX_SAVE_STATUS_ITEMS {
            return Err("COLLECTION_DISCOVERY_IMPORT_CONTRACT".into());
        }
        let mut seen = HashSet::new();
        for row in &patch.entries {
            if row.item_id == 0 || row.item_id > 9_007_199_254_740_991
                || !seen.insert(row.item_id)
            {
                return Err("COLLECTION_DISCOVERY_IMPORT_ENTRY_INVALID".into());
            }
        }
        let applicable: Vec<MappedSaveDiscoveryRow> = patch.entries.into_iter()
            .filter(|row| self.lookup.contains_key(&row.item_id)).collect();
        let count=applicable.len();
        if count == 0 {return Ok(0);}
        self.with_state(|state| {
            let w = state.workspaces.iter_mut().find(|w|w.id == state.active)
                .ok_or("COLLECTION_WORKSPACE_NOT_FOUND")?;
            for row in applicable {
                let key = row.item_id.to_string();
                let mut entry = w.entries.get(&key).cloned().unwrap_or_default();
                entry.discovered = Some(row.discovered);
                w.entries.insert(key, entry);
            }
            Ok(())
        })?;
        Ok(count)
    }
    fn workspace_impl(&mut self, action: &str, id: &str, name: &str) -> Result<(), String> {
        self.with_state(|state| {
            match action {
                "select" => {
                    if !state.workspaces.iter().any(|w|w.id == id) { return Err("COLLECTION_WORKSPACE_UNKNOWN".into()); }
                    state.active=id.to_string();
                }
                "add" => {
                    if !valid_workspace_id(id) || state.workspaces.len()>=MAX_WORKSPACES
                        || state.workspaces.iter().any(|w|w.id==id)
                    {return Err("COLLECTION_WORKSPACE_LIMIT".into());}
                    state.workspaces.push(Workspace{id:id.into(),name:name.trim().into(),entries:BTreeMap::new()});
                    state.active=id.into();
                }
                "rename" => {
                    let w=state.workspaces.iter_mut().find(|w|w.id==id).ok_or("COLLECTION_WORKSPACE_UNKNOWN")?;
                    w.name=name.trim().into();
                }
                "delete" => {
                    if state.workspaces.len()==1 {return Err("COLLECTION_LAST_WORKSPACE".into());}
                    let n=state.workspaces.len();
                    state.workspaces.retain(|w|w.id!=id);
                    if n==state.workspaces.len(){return Err("COLLECTION_WORKSPACE_UNKNOWN".into());}
                    if state.active==id {state.active=state.workspaces[0].id.clone();}
                }
                _ => return Err("COLLECTION_WORKSPACE_ACTION".into())
            }
            Ok(())
        })
    }
}

#[wasm_bindgen]
impl CollectionEngine {
    #[wasm_bindgen(constructor)]
    pub fn new() -> CollectionEngine {CollectionEngine::default()}
    pub fn load_index(&mut self, source: &str) -> Result<(), JsValue> {
        self.load_index_impl(source).map_err(|e|JsValue::from_str(&e))
    }
    pub fn load_db00_index(&mut self, source: &str) -> Result<(), JsValue> {
        self.load_db00_index_impl(source).map_err(|e|JsValue::from_str(&e))
    }
    pub fn load_owner_local_db00_index(&mut self, source: &str) -> Result<(), JsValue> {
        self.load_owner_local_db00_index_impl(source).map_err(|e|JsValue::from_str(&e))
    }
    pub fn append_db00_shard(&mut self, source: &str) -> Result<(), JsValue> {
        self.append_db00_shard_impl(source).map_err(|e|JsValue::from_str(&e))
    }
    pub fn finish_db00(&self) -> Result<(), JsValue> {
        self.finish_db00_impl().map_err(|e|JsValue::from_str(&e))
    }
    pub fn metadata_json(&self) -> Result<String,JsValue> {
        self.metadata_impl().map_err(|e|JsValue::from_str(&e))
    }
    pub fn append_shard(&mut self, source: &str) -> Result<(), JsValue> {
        self.append_shard_impl(source).map_err(|e|JsValue::from_str(&e))
    }
    pub fn query_page(&self, query: &str) -> Result<String, JsValue> {
        self.query_impl(query).map_err(|e|JsValue::from_str(&e))
    }
    pub fn facets(&self, mode: &str, locale: &str) -> Result<String, JsValue> {
        self.facets_impl(mode,locale).map_err(|e|JsValue::from_str(&e))
    }
    pub fn progress(&self) -> Result<String, JsValue> {
        self.progress_impl().map_err(|e|JsValue::from_str(&e))
    }
    pub fn item(&self, id: u64, locale: &str) -> Result<String, JsValue> {
        let index = self.ready().map_err(|e|JsValue::from_str(&e))?;
        let offset=self.lookup.get(&id).ok_or(JsValue::from_str("COLLECTION_ITEM_MISSING"))?;
        output(&self.item_json(index,&self.rows[*offset],locale_index(locale))).map_err(|e|JsValue::from_str(&e))
    }
    pub fn load_state(&mut self, source: &str) -> Result<(), JsValue> {
        self.state=parse_state(source).map_err(|e|JsValue::from_str(&e))?;
        Ok(())
    }
    pub fn state_json(&self) -> String {
        serde_json::to_string(&self.state).expect("validated state")
    }
    pub fn set_entry(&mut self, id: u64, changes: &str) -> Result<(), JsValue> {
        self.set_entry_impl(id,changes).map_err(|e|JsValue::from_str(&e))
    }
    pub fn set_bulk(&mut self, ids: &str, status: &str) -> Result<(), JsValue> {
        self.bulk_impl(ids,status).map_err(|e|JsValue::from_str(&e))
    }
    pub fn bulk_matching(&mut self, query: &str, status: &str) -> Result<usize, JsValue> {
        self.bulk_matching_impl(query,status).map_err(|e|JsValue::from_str(&e))
    }
    pub fn apply_mapped_save_statuses(&mut self, source: &str) -> Result<usize, JsValue> {
        self.apply_mapped_save_statuses_impl(source).map_err(|e|JsValue::from_str(&e))
    }
    pub fn apply_mapped_save_discovery(&mut self, source: &str) -> Result<usize, JsValue> {
        self.apply_mapped_save_discovery_impl(source).map_err(|e|JsValue::from_str(&e))
    }
    pub fn workspace_action(&mut self, action: &str, id: &str, name: &str) -> Result<(), JsValue> {
        self.workspace_impl(action,id,name).map_err(|e|JsValue::from_str(&e))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn published_catalog_loads_and_queries_all_12552_records() {
        let root=std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../static/ddv/collection/v1.25");
        let manifest=std::fs::read_to_string(root.join("index.json")).unwrap();
        let mut core=CollectionEngine::default();
        core.load_index_impl(&manifest).unwrap();
        let files:Vec<String>=core.index.as_ref().unwrap().shards.iter().map(|s|s.file.clone()).collect();
        for file in files {
            let bytes=std::fs::read_to_string(root.join(file)).unwrap();
            core.append_shard_impl(&bytes).unwrap();
        }
        assert_eq!(core.ready().unwrap().count,12552);
        let result=core.query_impl(r#"{"locale":"ja","search":"40005160","limit":72}"#).unwrap();
        let value:Value=serde_json::from_str(&result).unwrap();
        assert_eq!(value["total"],1);
    }
    #[test]
    fn db00_publishable_release_switch_and_old_state_survive() {
        let item=json!({
            "id":"700000001","names":{"en":"Test Chair","ja":"テストのいす"},
            "nameStatus":"verified","category":"Furniture","subcategory":null,
            "stateClass":"TRACKED","stateSemantic":"OWNERSHIP_AND_DISCOVERY",
            "worlds":["IsDreamlightValley"],"universes":["Mickey"],
            "contentIds":["Expansion03"],"releaseIds":["expansion-3"],
            "relations":[],"sourceRefs":["approved-reference"]
        });
        let shard=json!({"schema":DB00_SNAPSHOT_SCHEMA,"offset":0,"count":1,"items":[item]}).to_string();
        let index=json!({
            "schema":DB00_RELEASE_SCHEMA,"id":"approved-snapshot",
            "count":1,"target":{"platform":"Steam","gameVersion":"1.26.2","buildId":null},
            "sources":[{"id":"approved-reference","visibility":"public_reference"}],
            "releases":[{"id":"expansion-3"}],
            "shards":[{"file":"items-000.json","offset":0,"count":1,"bytes":shard.len(),
                "sha256":"a".repeat(64)}]
        }).to_string();
        let mut engine=CollectionEngine::default();
        engine.load_state(r#"{"schema":"wand.collection.local@1","active":"local-1","workspaces":[{"id":"local-1","name":"Kept","entries":{"700000001":{"status":"owned","favorite":true},"999999999":{"quantity":12}}}]}"#).unwrap();
        engine.load_db00_index_impl(&index).unwrap();
        engine.append_db00_shard_impl(&shard).unwrap();
        engine.finish_db00_impl().unwrap();
        let filtered:Value=serde_json::from_str(&engine.query_impl(r#"{"locale":"ja","search":"テスト","category":"Furniture","world":"IsDreamlightValley","expansion":"Expansion03","limit":40}"#).unwrap()).unwrap();
        assert_eq!(filtered["total"],1);
        assert_eq!(filtered["items"][0]["label"],"テストのいす");
        assert_eq!(filtered["items"][0]["status"],"owned");
        assert_eq!(engine.state.workspaces[0].entries["999999999"].quantity,Some(12));
        let meta:Value=serde_json::from_str(&engine.metadata_impl().unwrap()).unwrap();
        assert_eq!(meta["version"],"1.26.2");
        assert_eq!(meta["worlds"][0],"IsDreamlightValley");
    }
    #[test]
    fn db00_private_or_unverified_sources_are_never_loaded() {
        let base=json!({
            "schema":DB00_RELEASE_SCHEMA,"id":"published",
            "count":1,"target":{"platform":"Steam","gameVersion":null,"buildId":null},
            "sources":[{"id":"private","visibility":"private"}],"releases":[],
            "shards":[{"file":"items-000.json","offset":0,"count":1,"bytes":400,"sha256":"a".repeat(64)}]
        });
        let mut engine=CollectionEngine::default();
        assert!(engine.load_db00_index_impl(&base.to_string()).is_err());
        let mut public=base.clone();
        public["sources"][0]["visibility"]=json!("public_reference");
        engine.load_db00_index_impl(&public.to_string()).unwrap();
        let shard=json!({"schema":DB00_SNAPSHOT_SCHEMA,"offset":0,"count":1,"items":[{
            "id":"1","names":{},"nameStatus":"unverified","category":"Furniture",
            "sourceRefs":["private"],"releaseIds":[],"relations":[]
        }]}).to_string();
        assert!(engine.append_db00_shard_impl(&shard).is_err());
        assert_eq!(engine.rows.len(),0);
    }
    #[test]
    fn rejected_db00_shard_is_atomic_and_versionless_release_stays_unknown() {
        let first=json!({
            "id":"101","names":{"en":"Source One"},"nameStatus":"verified",
            "category":"NewFamily","stateClass":"TRACKED",
            "stateSemantic":"OWNERSHIP_AND_DISCOVERY",
            "worlds":["FirstWorld"],"universes":["FirstUniverse"],
            "contentIds":["FirstExpansion"],"releaseIds":[],
            "relations":[],"sourceRefs":["public-source"]
        });
        let mut second=first.clone();
        second["id"]=json!("102");
        second["sourceRefs"]=json!(["private-source"]);
        let invalid=json!({"schema":DB00_SNAPSHOT_SCHEMA,"offset":0,"count":2,
            "items":[first.clone(),second.clone()]}).to_string();
        second["sourceRefs"]=json!(["public-source"]);
        let mut valid=json!({"schema":DB00_SNAPSHOT_SCHEMA,"offset":0,"count":2,
            "items":[first,second]}).to_string();
        // Only the source reference changes. Preserve the original pinned
        // byte length with valid JSON whitespace to exercise retry semantics.
        while valid.len()<invalid.len() {valid.push(' ');}
        assert_eq!(valid.len(),invalid.len());
        let index=json!({
            "schema":DB00_RELEASE_SCHEMA,"id":"versionless-release","count":2,
            "target":{"platform":"Steam","gameVersion":null,"buildId":null},
            "sources":[{"id":"public-source","visibility":"public_reference"}],
            "releases":[],
            "shards":[{"file":"items-000.json","offset":0,"count":2,
                "bytes":invalid.len(),"sha256":"a".repeat(64)}]
        }).to_string();
        let mut engine=CollectionEngine::default();
        engine.load_db00_index_impl(&index).unwrap();
        let before=engine.index.as_ref().unwrap().clone();
        assert!(engine.append_db00_shard_impl(&invalid).is_err());
        assert!(engine.rows.is_empty());
        assert!(engine.lookup.is_empty());
        assert!(engine.db00_relations.is_empty());
        let after=engine.index.as_ref().unwrap();
        assert_eq!(after.families,before.families);
        assert_eq!(after.semantics,before.semantics);
        assert_eq!(after.state_classes,before.state_classes);
        assert_eq!(after.worlds,before.worlds);
        assert_eq!(after.universes,before.universes);
        assert_eq!(after.expansions,before.expansions);
        assert_eq!(after.world_labels,before.world_labels);
        assert_eq!(after.universe_labels,before.universe_labels);
        engine.append_db00_shard_impl(&valid).unwrap();
        engine.finish_db00_impl().unwrap();
        let metadata:Value=serde_json::from_str(&engine.metadata_impl().unwrap()).unwrap();
        assert!(metadata["version"].is_null());
        assert_eq!(metadata["platform"],"Steam");
        let result:Value=serde_json::from_str(&engine.query_impl(
            r#"{"locale":"en","category":"NewFamily","limit":10}"#
        ).unwrap()).unwrap();
        assert_eq!(result["total"],2);
    }
    #[test]
    fn owner_local_db01_names_are_isolated_from_public_release_ingest() {
        let names=json!({
            "en":"Current Shoe","fr":"Chaussure actuelle","it":"Scarpa attuale",
            "de":"Aktueller Schuh","es-ES":"Zapato actual","ja":"現在の靴",
            "zh-CN":"目前的鞋","pt-BR":"Sapato atual"
        });
        let source=json!({
            "id":"40005160","names":names,"nameStatus":"verified",
            "category":"Furniture","stateClass":"READ_ONLY",
            "stateSemantic":"UNLOCK_OR_AVAILABILITY",
            "worlds":[],"universes":[],"contentIds":[],"releaseIds":[],
            "relations":[],"sourceRefs":["private-db01-v1262"]
        });
        let shard=json!({"schema":DB00_SNAPSHOT_SCHEMA,"offset":0,"count":1,
            "items":[source]}).to_string();
        let index=json!({
            "schema":DB00_RELEASE_SCHEMA,
            "id":"db01-steam-1-26-2-owner-local-verified","count":1,
            "target":{"platform":"Steam","gameVersion":"1.26.2","buildId":null},
            "sources":[{"id":"private-db01-v1262","visibility":"private"}],
            "releases":[],
            "shards":[{"file":"items-000.json","offset":0,"count":1,
                "bytes":shard.len(),"sha256":"a".repeat(64)}]
        }).to_string();
        let mut public=CollectionEngine::default();
        assert!(public.load_db00_index_impl(&index).is_err());
        let mut local=CollectionEngine::default();
        local.load_owner_local_db00_index_impl(&index).unwrap();
        local.append_db00_shard_impl(&shard).unwrap();
        local.finish_db00_impl().unwrap();
        let meta:Value=serde_json::from_str(&local.metadata_impl().unwrap()).unwrap();
        assert_eq!(meta["version"],"1.26.2");
        assert_eq!(meta["platform"],"Steam");
        let result:Value=serde_json::from_str(&local.query_impl(
            r#"{"locale":"ja","category":"Furniture","search":"現在の靴","limit":12}"#
        ).unwrap()).unwrap();
        assert_eq!(result["total"],1);
        assert_eq!(result["items"][0]["label"],"現在の靴");
        let mut bad_item:Value=serde_json::from_str(&shard).unwrap();
        bad_item["items"][0]["names"].as_object_mut().unwrap().remove("ja");
        let bad_shard=bad_item.to_string();
        let mut bad_index:Value=serde_json::from_str(&index).unwrap();
        bad_index["shards"][0]["bytes"]=json!(bad_shard.len());
        let mut rejected=CollectionEngine::default();
        rejected.load_owner_local_db00_index_impl(&bad_index.to_string()).unwrap();
        assert_eq!(rejected.append_db00_shard_impl(&bad_shard),
            Err("COLLECTION_LOCAL_DB01_NAMES_REQUIRED".into()));
        assert!(rejected.rows.is_empty());
    }
    #[test]
    fn complete_owner_local_release_keeps_unnamed_ids_without_inventing_names() {
        let verified=json!({
            "id":"100001","nameStatus":"verified",
            "names":{"en":"Sample","fr":"Exemple","it":"Esempio","de":"Beispiel",
                "es-ES":"Ejemplo","ja":"サンプル","zh-CN":"样本","pt-BR":"Exemplo BR"},
            "category":"Furniture","sourceRefs":["private-db01-v1262"]
        });
        let unnamed=json!({
            "id":"100002","nameStatus":"unverified","names":{},
            "category":"Furniture","sourceRefs":["private-db01-v1262"]
        });
        let payload=json!({"schema":DB00_SNAPSHOT_SCHEMA,"offset":0,"count":2,
            "items":[verified,unnamed]}).to_string();
        let mut index=json!({
            "schema":DB00_RELEASE_SCHEMA,"id":"db01-steam-1-26-2-owner-local-complete",
            "count":2,"target":{"platform":"Steam","gameVersion":"1.26.2","buildId":null},
            "sources":[{"id":"private-db01-v1262","visibility":"private"}],
            "releases":[],"shards":[{"file":"items-000.json","offset":0,
                "count":2,"bytes":payload.len(),"sha256":"a".repeat(64)}]
        });
        let mut public=CollectionEngine::default();
        assert!(public.load_db00_index_impl(&index.to_string()).is_err());
        let mut engine=CollectionEngine::default();
        engine.load_owner_local_db00_index_impl(&index.to_string()).unwrap();
        engine.append_db00_shard_impl(&payload).unwrap();
        engine.finish_db00_impl().unwrap();
        let all:Value=serde_json::from_str(&engine.query_impl(
            r#"{"locale":"ja","limit":10}"#).unwrap()).unwrap();
        assert_eq!(all["total"],2);
        assert_eq!(all["items"][0]["label"],"サンプル");
        assert_eq!(all["items"][0]["nameVerified"],true);
        assert_eq!(all["items"][1]["label"],"名称未確認");
        assert_eq!(all["items"][1]["nameVerified"],false);
        let unnamed_filter:Value=serde_json::from_str(&engine.query_impl(
            r#"{"locale":"ja","nameStatus":"unverified","limit":10}"#).unwrap()).unwrap();
        assert_eq!(unnamed_filter["total"],1);
        assert_eq!(unnamed_filter["items"][0]["itemId"],100002);
        let source_id:Value=serde_json::from_str(&engine.query_impl(
            r#"{"locale":"en","search":"100002","limit":10}"#).unwrap()).unwrap();
        assert_eq!(source_id["total"],1);
        // The old 11,492-row local bundle remains strict: no unnamed records.
        index["id"]=json!("db01-steam-1-26-2-owner-local-verified");
        let mut previous=CollectionEngine::default();
        previous.load_owner_local_db00_index_impl(&index.to_string()).unwrap();
        assert_eq!(previous.append_db00_shard_impl(&payload),
            Err("COLLECTION_LOCAL_DB01_NAMES_REQUIRED".into()));
    }
    #[test]
    fn collection_facets_never_expose_zero_item_scaffold_categories() {
        let make = |id: &str, category: &str| json!({
            "id":id,"names":{"en":"Original","ja":"原本"},"nameStatus":"verified",
            "category":category,"sourceRefs":["public-source"],"releaseIds":[],"relations":[]
        });
        let shard=json!({"schema":DB00_SNAPSHOT_SCHEMA,"offset":0,"count":2,"items":[
            make("101","Source Meal"),make("102","Source Ingredient")
        ]}).to_string();
        let index=json!({
            "schema":DB00_RELEASE_SCHEMA,"id":"native-nonempty-facets","count":2,
            "target":{"platform":"Steam","gameVersion":"1.26.2","buildId":null},
            "sources":[{"id":"public-source","visibility":"public_reference"}],
            "releases":[],"shards":[{"file":"items-000.json","offset":0,"count":2,
                "bytes":shard.len(),"sha256":"a".repeat(64)}]
        }).to_string();
        let mut engine=CollectionEngine::default();
        engine.load_db00_index_impl(&index).unwrap();
        engine.append_db00_shard_impl(&shard).unwrap();
        engine.finish_db00_impl().unwrap();
        let categories:Value=serde_json::from_str(
            &engine.facets_impl("category","ja").unwrap()).unwrap();
        let rows=categories.as_array().unwrap();
        assert_eq!(rows.len(),2);
        assert!(rows.iter().all(|row|row["total"].as_u64().unwrap()>0));
        assert!(rows.iter().any(|row|row["id"]=="Source Meal"&&row["total"]==1));
        assert!(rows.iter().any(|row|row["id"]=="Source Ingredient"&&row["total"]==1));
        assert!(!rows.iter().any(|row|row["id"]=="Meals"||row["id"]=="Ingredients"));
    }
    #[test]
    fn filtered_bulk_changes_all_matching_rows_beyond_visible_page() {
        let make = |id: &str, name: &str, category: &str| json!({
            "id":id,"names":{"en":name,"ja":name},"nameStatus":"verified",
            "category":category,"sourceRefs":["public-source"],
            "releaseIds":[],"relations":[]
        });
        let shard=json!({"schema":DB00_SNAPSHOT_SCHEMA,"offset":0,"count":4,"items":[
            make("101","First Chair","Furniture"),
            make("102","Second Chair","Furniture"),
            make("103","Other Chair","Clothing"),
            make("104","Third Chair","Furniture")
        ]}).to_string();
        let index=json!({
            "schema":DB00_RELEASE_SCHEMA,"id":"test-filtered-bulk","count":4,
            "target":{"platform":"Steam","gameVersion":"1.26.2","buildId":null},
            "sources":[{"id":"public-source","visibility":"public_reference"}],
            "releases":[],"shards":[{"file":"items-000.json","offset":0,"count":4,
                "bytes":shard.len(),"sha256":"a".repeat(64)}]
        }).to_string();
        let mut engine=CollectionEngine::default();
        engine.load_db00_index_impl(&index).unwrap();
        engine.append_db00_shard_impl(&shard).unwrap();
        engine.finish_db00_impl().unwrap();
        engine.set_entry_impl(101,r#"{"status":"missing","favorite":true}"#).unwrap();
        engine.set_entry_impl(102,r#"{"status":"missing","quantity":3}"#).unwrap();
        engine.set_entry_impl(103,r#"{"status":"missing"}"#).unwrap();
        let matching=r#"{"locale":"en","search":"Chair","category":"Furniture","status":"missing","offset":1,"limit":1}"#;
        let first_page:Value=serde_json::from_str(&engine.query_impl(matching).unwrap()).unwrap();
        assert_eq!(first_page["total"],2);
        assert_eq!(first_page["items"].as_array().unwrap().len(),1);
        assert_eq!(engine.bulk_matching_impl(matching,"owned").unwrap(),2);
        let entries=&engine.state.workspaces[0].entries;
        assert_eq!(entries["101"].status.as_deref(),Some("owned"));
        assert_eq!(entries["101"].favorite,Some(true));
        assert_eq!(entries["102"].status.as_deref(),Some("owned"));
        assert_eq!(entries["102"].quantity,Some(3));
        assert_eq!(entries["103"].status.as_deref(),Some("missing"));
        assert!(!entries.contains_key("104"));
        assert_eq!(engine.bulk_matching_impl(matching,"owned").unwrap(),0);
        // Favorites are a separate local annotation, never inferred from
        // owned status. Paging and bulk operations share this same Rust filter.
        let favorites=r#"{"locale":"en","favoriteOnly":true,"limit":10}"#;
        let favorite_page:Value=serde_json::from_str(&engine.query_impl(favorites).unwrap()).unwrap();
        assert_eq!(favorite_page["total"],1);
        assert_eq!(favorite_page["items"][0]["itemId"],101);
        let favorite_paged:Value=serde_json::from_str(
            &engine.query_impl(r#"{"locale":"en","favoriteOnly":true,"offset":1,"limit":10}"#).unwrap()).unwrap();
        assert_eq!(favorite_paged["total"],1);
        assert_eq!(favorite_paged["items"].as_array().unwrap().len(),0);
        assert_eq!(engine.bulk_matching_impl(favorites,"missing").unwrap(),1);
        assert_eq!(engine.state.workspaces[0].entries["101"].status.as_deref(),Some("missing"));
        assert_eq!(engine.state.workspaces[0].entries["101"].favorite,Some(true));
        assert_eq!(engine.state.workspaces[0].entries["102"].status.as_deref(),Some("owned"));
        let before=engine.state.clone();
        assert!(engine.bulk_matching_impl(matching,"invalid").is_err());
        assert!(engine.bulk_matching_impl(r#"{"status":"invalid"}"#,"missing").is_err());
        assert!(engine.state==before);
    }
    #[test]
    fn verified_save_statuses_override_manual_on_matching_ids_only() {
        // Synthetic DB-00 fixture: tests replacement rules, not game save
        // meaning, which must be verified by a separate native decoder.
        let make = |id: &str| json!({
            "id":id,"names":{"en":"Synthetic"},"nameStatus":"verified",
            "category":"Furniture","sourceRefs":["public"],"releaseIds":[],"relations":[]
        });
        let shard=json!({"schema":DB00_SNAPSHOT_SCHEMA,"offset":0,"count":3,
            "items":[make("101"),make("102"),make("103")]}).to_string();
        let index=json!({
            "schema":DB00_RELEASE_SCHEMA,"id":"synthetic-save-priority","count":3,
            "target":{"platform":"Steam","gameVersion":"1.26.2","buildId":null},
            "sources":[{"id":"public","visibility":"public_reference"}],"releases":[],
            "shards":[{"file":"items-000.json","offset":0,"count":3,
                "bytes":shard.len(),"sha256":"a".repeat(64)}]
        }).to_string();
        let mut engine=CollectionEngine::default();
        engine.load_db00_index_impl(&index).unwrap();
        engine.append_db00_shard_impl(&shard).unwrap();
        engine.finish_db00_impl().unwrap();

        // Manual mode works without any save.
        engine.set_entry_impl(101,r#"{"status":"owned","favorite":true,"quantity":7}"#).unwrap();
        engine.set_entry_impl(102,r#"{"status":"missing","discovered":true}"#).unwrap();
        engine.set_entry_impl(103,r#"{"status":"owned","favorite":true}"#).unwrap();
        engine.workspace_impl("add","local-2","Other manual workspace").unwrap();
        engine.set_entry_impl(101,r#"{"status":"missing","favorite":true}"#).unwrap();
        engine.workspace_impl("select","local-1","").unwrap();

        // A verified, mapped save row takes precedence. No inference from
        // omitted 103: its manually marked status remains "owned".
        let patch=json!({"schema":SAVE_STATUS_IMPORT_SCHEMA,"entries":[
            {"itemId":101,"status":"missing"},
            {"itemId":102,"status":"owned"}
        ]}).to_string();
        assert_eq!(engine.apply_mapped_save_statuses_impl(&patch),Ok(2));
        let main=&engine.state.workspaces[0].entries;
        assert_eq!(main["101"].status.as_deref(),Some("missing"));
        assert_eq!(main["101"].quantity,Some(7));
        assert_eq!(main["101"].favorite,Some(true));
        assert_eq!(main["102"].status.as_deref(),Some("owned"));
        assert_eq!(main["102"].discovered,Some(true));
        assert_eq!(main["103"].status.as_deref(),Some("owned"));
        assert_eq!(engine.state.workspaces[1].entries["101"].status.as_deref(),Some("missing"));

        // Explicitly mapped unknown clears prior manual status; unrelated
        // favorite remains and the item is still manually editable.
        let clear=json!({"schema":SAVE_STATUS_IMPORT_SCHEMA,"entries":[
            {"itemId":101,"status":"unknown"}
        ]}).to_string();
        assert_eq!(engine.apply_mapped_save_statuses_impl(&clear),Ok(1));
        assert_eq!(engine.state.workspaces[0].entries["101"].status,None);
        engine.set_entry_impl(101,r#"{"status":"owned"}"#).unwrap();
        assert_eq!(engine.state.workspaces[0].entries["101"].status.as_deref(),Some("owned"));

        let before=engine.state.clone();
        for value in [
            json!({"schema":"unverified","entries":[{"itemId":101,"status":"missing"}]}),
            json!({"schema":SAVE_STATUS_IMPORT_SCHEMA,"entries":[{"itemId":99999,"status":"owned"}]}),
            json!({"schema":SAVE_STATUS_IMPORT_SCHEMA,"entries":[{"itemId":101,"status":"owned"},{"itemId":101,"status":"missing"}]}),
            json!({"schema":SAVE_STATUS_IMPORT_SCHEMA,"entries":[{"itemId":102,"status":"unlocked"}]}),
            json!({"schema":SAVE_STATUS_IMPORT_SCHEMA,"entries":[{"itemId":101,"status":"owned","secret":"extra"}]})
        ] {
            assert!(engine.apply_mapped_save_statuses_impl(&value.to_string()).is_err());
            assert!(engine.state==before);
        }
    }
    #[test]
    fn save_discovery_overwrites_manual_discovery_without_changing_ownership() {
        let root=std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../static/ddv/collection/v1.25");
        let manifest=std::fs::read_to_string(root.join("index.json")).unwrap();
        let mut core=CollectionEngine::default();
        core.load_index_impl(&manifest).unwrap();
        let files:Vec<String>=core.index.as_ref().unwrap().shards.iter()
            .map(|s|s.file.clone()).collect();
        for file in files {
            let bytes=std::fs::read_to_string(root.join(file)).unwrap();
            core.append_shard_impl(&bytes).unwrap();
        }
        let first=core.rows[0].id;
        let second=core.rows[1].id;
        core.set_entry_impl(first,r#"{"status":"owned","quantity":4,"favorite":true,"discovered":false}"#).unwrap();
        core.set_entry_impl(second,r#"{"status":"missing","discovered":true}"#).unwrap();
        core.workspace_impl("add","local-2","Second").unwrap();
        core.set_entry_impl(first,r#"{"discovered":false}"#).unwrap();
        core.workspace_impl("select","local-1","").unwrap();
        let input=json!({"schema":SAVE_DISCOVERY_IMPORT_SCHEMA,"entries":[
            {"itemId":first,"discovered":true},
            {"itemId":second,"discovered":false},
            {"itemId":900000000000001u64,"discovered":true}
        ]}).to_string();
        assert_eq!(core.apply_mapped_save_discovery_impl(&input),Ok(2));
        let entry=&core.state.workspaces[0].entries[&first.to_string()];
        assert_eq!(entry.discovered,Some(true));
        assert_eq!(entry.status.as_deref(),Some("owned"));
        assert_eq!(entry.quantity,Some(4));
        assert_eq!(entry.favorite,Some(true));
        assert_eq!(core.state.workspaces[0].entries[&second.to_string()].discovered,Some(false));
        assert_eq!(core.state.workspaces[0].entries[&second.to_string()].status.as_deref(),Some("missing"));
        assert_eq!(core.state.workspaces[1].entries[&first.to_string()].discovered,Some(false));
        // Users can edit without save and after save import; loading a later
        // save supersedes that manual discovery change again.
        core.set_entry_impl(first,r#"{"discovered":false}"#).unwrap();
        assert_eq!(core.state.workspaces[0].entries[&first.to_string()].discovered,Some(false));
        core.apply_mapped_save_discovery_impl(&input).unwrap();
        assert_eq!(core.state.workspaces[0].entries[&first.to_string()].discovered,Some(true));
        let before=core.state.clone();
        for raw in [
            json!({"schema":SAVE_DISCOVERY_IMPORT_SCHEMA,"entries":[{"itemId":first,"discovered":true},{"itemId":first,"discovered":false}]}),
            json!({"schema":SAVE_DISCOVERY_IMPORT_SCHEMA,"entries":[{"itemId":first,"discovered":"yes"}]}),
            json!({"schema":"unsupported","entries":[{"itemId":first,"discovered":false}]}),
            json!({"schema":SAVE_DISCOVERY_IMPORT_SCHEMA,"entries":[{"itemId":0,"discovered":false}]}),
            json!({"schema":SAVE_DISCOVERY_IMPORT_SCHEMA,"entries":[{"itemId":first,"discovered":false,"private":"secret"}]})
        ] {
            assert!(core.apply_mapped_save_discovery_impl(&raw.to_string()).is_err());
            assert!(core.state == before);
        }
    }
    #[test]
    fn source_native_activity_subtypes_are_visible_without_touching_other_releases() {
        let cases=[
            (30_200_000,"Source Crop"),
            (30_300_000,"Source Meal"),
            (30_400_000,"Source Seed"),
            (30_800_000,"Source Flower"),
            (31_000_000,"Source Fish"),
            (31_100_000,"Source Ingredient"),
            (31_500_000,"Source Consumable"),
            (31_600_000,"Source Mineral"),
            (31_700_000,"Source Crafting Material"),
            (31_200_000,"Source Activity Items"),
        ];
        for (id,expected) in cases {
            assert_eq!(public_activity_subtype_family(id,"Source Activity Items".into()),expected);
            assert_eq!(public_activity_subtype_family(id,"Other".into()),"Other");
        }
        assert_eq!(public_activity_subtype_family(40_200_000,"Source Activity Items".into()),
            "Source Activity Items");
    }
    #[test]
    fn canonical_categories_preserve_all_29_entries() {
        assert_eq!(CATEGORY_ORDER.len(),29);
        assert_eq!(CATEGORY_ORDER.iter().collect::<HashSet<_>>().len(),29);
    }
    #[test]
    fn legacy_state_round_trip_retains_unknown_ids_and_fields() {
        let input = r#"{"schema":"wand.collection.local@1","active":"local-1","workspaces":[{"id":"local-1","name":"My Collection","entries":{"101":{"status":"owned","quantity":7,"favorite":true},"99999999":{"discovered":false}}}]}"#;
        let state=parse_state(input).unwrap();
        let text=output(&state).unwrap();
        assert!(parse_state(&text).unwrap()==state);
        assert!(text.contains("99999999"));
    }
    #[test]
    fn workspace_and_bulk_changes_are_atomic() {
        let mut engine=CollectionEngine::default();
        engine.set_entry_impl(101,r#"{"status":"owned","quantity":4,"favorite":true}"#).unwrap();
        engine.workspace_impl("add","local-2","Second").unwrap();
        engine.bulk_impl("[101,102]","missing").unwrap();
        assert_eq!(engine.state.workspaces[0].entries["101"].quantity,Some(4));
        assert_eq!(engine.state.workspaces[0].entries["101"].status.as_deref(),Some("owned"));
        assert_eq!(engine.state.workspaces[1].entries["101"].status.as_deref(),Some("missing"));
        assert!(engine.bulk_impl("[0,102]","owned").is_err());
        assert_eq!(engine.state.workspaces[1].entries["102"].status.as_deref(),Some("missing"));
        engine.bulk_impl("[101]","unknown").unwrap();
        assert!(engine.state.workspaces[1].entries.get("101").is_none());
    }
    #[test]
    fn unsafe_old_backups_are_rejected() {
        assert!(parse_state(r#"{"schema":"wand.collection.local@1","active":"local-1","workspaces":[{"id":"local-1","name":"ok","entries":{"3":{"quantity":1000000}}}]}"#).is_err());
        assert!(parse_state(r#"{"schema":"wand.collection.local@1","active":"missing","workspaces":[{"id":"local-1","name":"ok","entries":{}}]}"#).is_err());
    }
    #[test]
    fn invalid_changes_do_not_mutate() {
        let mut engine=CollectionEngine::default();
        let baseline=engine.state.clone();
        assert!(engine.set_entry_impl(1,r#"{"quantity":-1}"#).is_err());
        assert!(engine.set_entry_impl(1,r#"{"status":"deleted"}"#).is_err());
        assert!(engine.state==baseline);
    }
}
