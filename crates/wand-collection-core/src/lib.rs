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
    s.len() <= 12 && !s.is_empty() && !s.starts_with('0')
        && s.bytes().all(|b| b.is_ascii_digit())
        && s.parse::<u64>().is_ok_and(|n| n > 0 && n <= 999_999_999_999)
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
    offset: usize,
    limit: usize,
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
}

impl Default for CollectionEngine {
    fn default() -> Self {
        Self {
            index: None,
            rows: Vec::new(),
            lookup: HashMap::new(),
            state: State::default(),
        }
    }
}

impl CollectionEngine {
    fn load_index_impl(&mut self, source: &str) -> Result<(), String> {
        let index = checked_index(source)?;
        self.index = Some(index);
        self.rows.clear();
        self.lookup.clear();
        Ok(())
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
            if id == 0 || id > 999_999_999_999 || !ids.insert(id)
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
            staged.push(Item { id, family, semantic, world, universe, expansion, labels, search });
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
        let label = item.labels.get(loc).filter(|s| !s.is_empty())
            .or_else(|| item.labels.iter().find(|s| !s.is_empty()))
            .cloned().unwrap_or_else(|| format!("Item {}", item.id));
        json!({
            "itemId":item.id,
            "label": label,
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
    fn query_impl(&self, source: &str) -> Result<String, String> {
        let index = self.ready()?;
        let query: Query = serde_json::from_str(source).map_err(|_|"COLLECTION_QUERY_INVALID")?;
        if query.limit == 0 || query.limit > 200 || query.offset > MAX_ROWS
            || query.search.len() > 512
            || !["", "all", "owned", "missing", "unknown"].contains(&query.status.as_str())
        { return Err("COLLECTION_QUERY_BOUNDS".into()); }
        let loc = locale_index(&query.locale);
        let term = query.search.trim().to_lowercase();
        let mut matches: Vec<&Item> = self.rows.iter().filter(|r| {
            (term.is_empty() || r.search.contains(&term) || r.id.to_string().contains(&term))
            && (query.category.is_empty() || index.families[r.family] == query.category)
            && one_of(&query.world,&index.worlds,&r.world)
            && one_of(&query.universe,&index.universes,&r.universe)
            && one_of(&query.expansion,&index.expansions,&r.expansion)
            && (query.status.is_empty() || query.status == "all" || self.status(r.id) == query.status)
        }).collect();
        matches.sort_unstable_by(|a,b| {
            a.labels.get(loc).unwrap_or(&String::new()).to_lowercase()
                .cmp(&b.labels.get(loc).unwrap_or(&String::new()).to_lowercase())
                .then(a.id.cmp(&b.id))
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
        let result: Vec<Value> = names.iter().enumerate().map(|(i,id)| {
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
        if id == 0 || id > 999_999_999_999 { return Err("COLLECTION_ITEM_ID_INVALID".into()); }
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
        if ids.len() > 20_000 || ids.iter().any(|id|*id == 0 || *id > 999_999_999_999) {
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
