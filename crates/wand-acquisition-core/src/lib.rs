//! DB-02 source-derived recipe basket, Rust-owned and deterministic.
//! Input originates from the independently SHA-verified owner-local SRC-02
//! r5 bundle. This planner never sees/opens a save and never asserts live
//! shop stock, price, player ownership, unlock status or eligibility.
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::{BTreeMap, BTreeSet};

const SAFE: u64 = 9_007_199_254_740_991;
const MAX_BATCHES: u64 = 1_000_000;
const MAX_RECIPES: usize = 8_192;
const MAX_OPERATIONS: usize = 10_000;
const MAX_DEPTH: u32 = 24;
const MAX_REQUEST_BYTES: usize = 16 * 1024 * 1024;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Ingredient {
    kind: String,
    quantity: u64,
    #[serde(default)]
    item_id: Option<u64>,
    #[serde(default)]
    tag_id: Option<u64>,
    #[serde(default)]
    tag_ids: Option<Vec<u64>>,
    #[serde(default)]
    item_ids: Option<Vec<u64>>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Recipe {
    recipe_id: u64,
    result_item_id: u64,
    #[serde(rename = "type")]
    recipe_type: String,
    #[serde(default)]
    result_quantity: Option<u64>,
    #[serde(default)]
    condition_digest: Option<String>,
    ingredients: Vec<Ingredient>,
}

fn one() -> u64 { 1 }
fn default_depth() -> u32 { 12 }
fn default_expand() -> bool { true }

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Goal {
    recipe_id: u64,
    #[serde(default = "one")]
    batches: u64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Member {
    item_id: u64,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Options {
    #[serde(default)]
    inventory: BTreeMap<String, u64>,
    #[serde(default)]
    recipe_choices: BTreeMap<String, u64>,
    #[serde(default)]
    ingredient_choices: BTreeMap<String, u64>,
    #[serde(default = "default_expand")]
    expand_single_recipe: bool,
    #[serde(default = "default_depth")]
    max_depth: u32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Request {
    schema: String,
    source: Value,
    goals: Vec<Goal>,
    recipes: Vec<Recipe>,
    #[serde(default)]
    selector_candidates: BTreeMap<String, Vec<Member>>,
    #[serde(default)]
    acquisition_paths: BTreeMap<String, Vec<Value>>,
    #[serde(default)]
    possible_stalls: BTreeMap<String, Vec<Value>>,
    #[serde(default)]
    ingredient_membership_scope: String,
    #[serde(default)]
    options: Options,
}

#[derive(Debug, Default)]
struct Need {
    quantity: u64,
    reasons: Vec<String>,
    recipe_candidate_ids: Vec<u64>,
}

fn checked(a: u64, b: u64) -> Result<u64, String> {
    a.checked_add(b).filter(|n| *n <= SAFE)
        .ok_or_else(|| "DB02_MATERIAL_QUANTITY_OVERFLOW".into())
}
fn multiply(a: u64, b: u64) -> Result<u64, String> {
    a.checked_mul(b).filter(|n| *n <= SAFE)
        .ok_or_else(|| "DB02_MATERIAL_QUANTITY_OVERFLOW".into())
}
fn valid_id(id: u64) -> Result<(), String> {
    if id == 0 || id > SAFE { Err("DB02_INVALID_SOURCE_ID".into()) } else { Ok(()) }
}
fn key_id(value: &str) -> Result<u64, String> {
    if value.is_empty() || value.starts_with('0') ||
        !value.bytes().all(|b| b.is_ascii_digit())
    { return Err("DB02_NON_CANONICAL_ITEM_KEY".into()); }
    let id: u64 = value.parse().map_err(|_| "DB02_INVALID_ITEM_KEY")?;
    valid_id(id)?;
    Ok(id)
}
fn quantities(map: &BTreeMap<String,u64>, positive: bool)
    -> Result<BTreeMap<u64,u64>, String>
{
    let mut parsed = BTreeMap::new();
    for (key, value) in map {
        let id=key_id(key)?;
        if *value > SAFE || (positive && *value == 0) {
            return Err("DB02_INVALID_QUANTITY".into());
        }
        parsed.insert(id,*value);
    }
    Ok(parsed)
}
fn source_key(source: &Value) -> Result<(), String> {
    let obj=source.as_object().ok_or("DB02_SOURCE_INVALID")?;
    let platform=obj.get("platform").and_then(Value::as_str)
        .ok_or("DB02_SOURCE_PLATFORM_REQUIRED")?;
    let game_version=obj.get("gameVersion").and_then(Value::as_str)
        .ok_or("DB02_SOURCE_VERSION_REQUIRED")?;
    if platform!="Steam" || game_version!="1.26.2" ||
        obj.keys().any(|key| key!="platform" && key!="gameVersion")
    { return Err("DB02_UNSUPPORTED_SOURCE_VERSION".into()); }
    Ok(())
}
fn validate_recipe(recipe: &Recipe) -> Result<(), String> {
    valid_id(recipe.recipe_id)?;
    valid_id(recipe.result_item_id)?;
    if !matches!(recipe.recipe_type.as_str(),"crafting"|"cooking") ||
        recipe.ingredients.is_empty() || recipe.ingredients.len()>128
    { return Err("DB02_INVALID_SOURCE_RECIPE".into()); }
    if recipe.result_quantity.is_some_and(|n|n==0||n>SAFE) {
        return Err("DB02_INVALID_SOURCE_YIELD".into());
    }
    for part in &recipe.ingredients {
        if part.quantity==0 || part.quantity>SAFE {
            return Err("DB02_INVALID_SOURCE_INGREDIENT_QUANTITY".into());
        }
        match part.kind.as_str() {
            "item" => valid_id(part.item_id.ok_or("DB02_ITEM_INGREDIENT_ID_MISSING")?)?,
            "anyTag" => valid_id(part.tag_id.ok_or("DB02_TAG_ID_MISSING")?)?,
            "tagAlternatives" => {
                let ids=part.tag_ids.as_ref().ok_or("DB02_TAG_IDS_MISSING")?;
                if ids.is_empty()||ids.len()>128 {return Err("DB02_TAG_IDS_INVALID".into());}
                for id in ids {valid_id(*id)?;}
            }
            "itemAlternatives" => {
                let ids=part.item_ids.as_ref().ok_or("DB02_ITEM_IDS_MISSING")?;
                if ids.is_empty()||ids.len()>128 {return Err("DB02_ITEM_IDS_INVALID".into());}
                for id in ids {valid_id(*id)?;}
            }
            _ => return Err("DB02_UNKNOWN_INGREDIENT_KIND".into())
        }
    }
    Ok(())
}

struct Planner {
    source: Value,
    recipes: BTreeMap<u64, Recipe>,
    made_by: BTreeMap<u64, Vec<u64>>,
    selector_candidates: BTreeMap<u64, Vec<u64>>,
    acquisition_paths: BTreeMap<u64, Vec<Value>>,
    possible_stalls: BTreeMap<u64, Vec<Value>>,
    membership: bool,
    inventory_left: BTreeMap<u64,u64>,
    recipe_choices: BTreeMap<u64,u64>,
    ingredient_choices: BTreeMap<(u64,usize),u64>,
    expand_single: bool,
    max_depth: u32,
    used_choices: BTreeSet<(u64,usize)>,
    inventory_used: BTreeMap<u64,u64>,
    surplus: BTreeMap<u64,u64>,
    needs: BTreeMap<u64,Need>,
    steps: Vec<Value>,
    selectors: Vec<Value>,
    selections: Vec<Value>,
    blockers: Vec<Value>,
    operations: usize
}
impl Planner {
    fn from(request: Request) -> Result<(Self,Vec<(u64,u64)>),String> {
        if request.schema!="wand.db02.recipe-basket-request@1" {
            return Err("DB02_REQUEST_SCHEMA_INVALID".into());
        }
        source_key(&request.source)?;
        if request.goals.is_empty() || request.goals.len()>200 {
            return Err("DB02_BASKET_GOAL_COUNT".into());
        }
        if request.recipes.is_empty() || request.recipes.len()>MAX_RECIPES {
            return Err("DB02_RECIPE_CATALOG_LIMIT".into());
        }
        if request.options.max_depth>MAX_DEPTH {return Err("DB02_MAX_DEPTH_INVALID".into());}
        if !matches!(request.ingredient_membership_scope.as_str(),
            "three_observed_cooking_native_classes"|"not_supplied")
        {return Err("DB02_MEMBERSHIP_SCOPE_INVALID".into());}
        let mut goal_counts=BTreeMap::new();
        for goal in request.goals {
            valid_id(goal.recipe_id)?;
            if goal.batches==0||goal.batches>MAX_BATCHES {
                return Err("DB02_BATCH_LIMIT".into());
            }
            let existing=*goal_counts.get(&goal.recipe_id).unwrap_or(&0);
            let count=checked(existing,goal.batches)?;
            if count>MAX_BATCHES{return Err("DB02_COMBINED_BATCH_LIMIT".into());}
            goal_counts.insert(goal.recipe_id,count);
        }
        let mut recipes=BTreeMap::new();
        let mut made_by:BTreeMap<u64,Vec<u64>>=BTreeMap::new();
        for recipe in request.recipes {
            validate_recipe(&recipe)?;
            if made_by.entry(recipe.result_item_id).or_default().len()>MAX_RECIPES {
                return Err("DB02_RECIPE_INDEX_LIMIT".into());
            }
            let id=recipe.recipe_id;
            if recipes.insert(id,recipe.clone()).is_some() {
                return Err("DB02_DUPLICATE_RECIPE".into());
            }
            if recipe.recipe_type=="crafting" {
                made_by.entry(recipe.result_item_id).or_default().push(id);
            }
        }
        for ids in made_by.values_mut() {ids.sort_unstable();ids.dedup();}
        for id in goal_counts.keys() {
            if !recipes.contains_key(id){return Err("DB02_UNKNOWN_SOURCE_RECIPE".into());}
        }
        let mut selectors=BTreeMap::new();
        if request.selector_candidates.len()>4096 {return Err("DB02_SELECTOR_LIMIT".into());}
        for (key,members) in request.selector_candidates {
            let id=key_id(&key)?;
            if members.len()>4096 {return Err("DB02_SELECTOR_CANDIDATE_LIMIT".into());}
            let mut ids=BTreeSet::new();
            for member in members {valid_id(member.item_id)?;ids.insert(member.item_id);}
            selectors.insert(id,ids.into_iter().collect());
        }
        let mut ingredient_choices=BTreeMap::new();
        for (key,id) in request.options.ingredient_choices {
            let (recipe,slot)=key.split_once(':').ok_or("DB02_CHOICE_KEY_INVALID")?;
            let recipe_id=key_id(recipe)?;
            if slot.is_empty()||(slot.starts_with('0')&&slot!="0") ||
                !slot.bytes().all(|b| b.is_ascii_digit()) {
                return Err("DB02_CHOICE_KEY_INVALID".into());
            }
            let index:usize=slot.parse().map_err(|_|"DB02_CHOICE_KEY_INVALID")?;
            if index>127 {return Err("DB02_CHOICE_INDEX_LIMIT".into());}
            valid_id(id)?;
            ingredient_choices.insert((recipe_id,index),id);
        }
        let mut paths=BTreeMap::new();
        let mut stalls=BTreeMap::new();
        for (src,target) in [(request.acquisition_paths,&mut paths),
                              (request.possible_stalls,&mut stalls)] {
            if src.len()>20_000 {return Err("DB02_EVIDENCE_INDEX_LIMIT".into());}
            for (key,rows) in src {
                let id=key_id(&key)?;
                if rows.len()>4096{return Err("DB02_EVIDENCE_ROWS_LIMIT".into());}
                target.insert(id,rows);
            }
        }
        Ok((Self {
            source:request.source,
            recipes,made_by,selector_candidates:selectors,
            acquisition_paths:paths,possible_stalls:stalls,
            membership:request.ingredient_membership_scope==
                "three_observed_cooking_native_classes",
            inventory_left:quantities(&request.options.inventory,false)?,
            recipe_choices:quantities(&request.options.recipe_choices,true)?,
            ingredient_choices,expand_single:request.options.expand_single_recipe,
            max_depth:request.options.max_depth,
            used_choices:BTreeSet::new(), inventory_used:BTreeMap::new(),
            surplus:BTreeMap::new(),needs:BTreeMap::new(),
            steps:Vec::new(),selectors:Vec::new(),selections:Vec::new(),
            blockers:Vec::new(),operations:0,
        },goal_counts.into_iter().collect()))
    }

    fn consume(&mut self,id:u64,required:u64)->Result<u64,String>{
        let current=*self.inventory_left.get(&id).unwrap_or(&0);
        let used=current.min(required);
        if used!=0{
            self.inventory_left.insert(id,current-used);
            let previous=*self.inventory_used.get(&id).unwrap_or(&0);
            self.inventory_used.insert(id,checked(previous,used)?);
        }
        let rest=required-used;
        let created=*self.surplus.get(&id).unwrap_or(&0);
        let spent=created.min(rest);
        if spent!=0{self.surplus.insert(id,created-spent);}
        Ok(rest-spent)
    }
    fn missing(&mut self,id:u64,count:u64,reason:&str,candidates:&[u64])
        ->Result<(),String>
    {
        let entry=self.needs.entry(id).or_default();
        entry.quantity=checked(entry.quantity,count)?;
        if !entry.reasons.iter().any(|v|v==reason) {
            entry.reasons.push(reason.to_owned());
        }
        entry.recipe_candidate_ids.extend_from_slice(candidates);
        entry.recipe_candidate_ids.sort_unstable();
        entry.recipe_candidate_ids.dedup();
        Ok(())
    }

    fn need_item(&mut self,id:u64,required:u64,stack:&[u64],depth:u32)
        ->Result<(),String>
    {
        if required==0{return Ok(());}
        let count=self.consume(id,required)?;
        if count==0{return Ok(());}
        let candidates=self.made_by.get(&id).cloned().unwrap_or_default();
        let choice=self.recipe_choices.get(&id).copied();
        let selected=if let Some(explicit)=choice{
            if !candidates.contains(&explicit){
                return Err("DB02_INVALID_SELECTED_RECIPE".into());
            }
            Some(explicit)
        }else if candidates.len()==1 && self.expand_single{
            candidates.first().copied()
        }else{None};
        let selected=match selected {
            Some(id)=>id,
            None=>{
                let reason=if candidates.is_empty(){"no_crafting_recipe"}
                  else {"recipe_choice_required"};
                self.missing(id,count,reason,&candidates)?;
                if !candidates.is_empty(){
                    self.blockers.push(json!({"itemId":id,"quantity":count,
                        "reason":reason,"recipeCandidateIds":candidates}));
                }
                return Ok(());
            }
        };
        if stack.contains(&id) {
            self.missing(id,count,"cyclic_recipe_chain",&[selected])?;
            let chain:Vec<u64>=stack.iter().copied().chain(std::iter::once(id)).collect();
            self.blockers.push(json!({"itemId":id,"quantity":count,
                "reason":"cyclic_recipe_chain","itemChain":chain}));
            return Ok(());
        }
        if depth>=self.max_depth {
            self.missing(id,count,"maximum_depth_reached",&[selected])?;
            self.blockers.push(json!({"itemId":id,"quantity":count,
                "reason":"maximum_depth_reached"}));
            return Ok(());
        }
        let recipe=self.recipes.get(&selected).ok_or("DB02_RECIPE_NOT_IN_CLOSURE")?
            .clone();
        let yield_count=match recipe.result_quantity{
            Some(n) if n>0 && n<=SAFE => n,
            _=>{
                self.missing(id,count,"unknown_crafting_yield",&[selected])?;
                self.blockers.push(json!({"itemId":id,"quantity":count,
                    "reason":"unknown_crafting_yield"}));
                return Ok(());
            }
        };
        let nested=count/yield_count + u64::from(count%yield_count!=0);
        if nested>MAX_BATCHES{return Err("DB02_NESTED_BATCH_LIMIT".into());}
        let created=multiply(nested,yield_count)?;
        let mut nested_stack=stack.to_vec();
        nested_stack.push(id);
        self.run_recipe(&recipe,nested,&nested_stack,depth+1)?;
        let remainder=created-count;
        if remainder!=0{
            let previous=*self.surplus.get(&id).unwrap_or(&0);
            self.surplus.insert(id,checked(previous,remainder)?);
        }
        Ok(())
    }

    fn selector_members(&self,selector_ids:&[u64])->Vec<(u64,Vec<u64>)>{
        if !self.membership{return Vec::new();}
        let mut union:BTreeMap<u64,BTreeSet<u64>>=BTreeMap::new();
        for selector in selector_ids {
            if let Some(members)=self.selector_candidates.get(selector){
                for item_id in members{
                    union.entry(*item_id).or_default().insert(*selector);
                }
            }
        }
        union.into_iter().map(|(id,matches)|
            (id,matches.into_iter().collect())).collect()
    }

    fn run_recipe(&mut self,recipe:&Recipe,batches:u64,stack:&[u64],depth:u32)
        ->Result<(),String>
    {
        self.operations+=1;
        if self.operations>MAX_OPERATIONS {
            return Err("DB02_PLAN_TOO_LARGE".into());
        }
        for (index,part) in recipe.ingredients.iter().enumerate() {
            let total=multiply(part.quantity,batches)?;
            match part.kind.as_str() {
                "item"=>{
                    let id=part.item_id.ok_or("DB02_MISSING_ITEM_ID")?;
                    self.need_item(id,total,stack,depth)?;
                },
                "anyTag"|"tagAlternatives"|"itemAlternatives"=>{
                    let selectors=match part.kind.as_str() {
                        "anyTag"=>vec![part.tag_id.ok_or("DB02_MISSING_TAG")?],
                        "tagAlternatives"=>part.tag_ids.clone().unwrap_or_default(),
                        _=>Vec::new()
                    };
                    let alternatives=part.item_ids.clone().unwrap_or_default();
                    let candidates=if part.kind=="itemAlternatives" {
                        let ids:BTreeSet<u64>=alternatives.iter().copied().collect();
                        ids.into_iter().map(|id|(id,Vec::new())).collect()
                    }else{self.selector_members(&selectors)};
                    let key=(recipe.recipe_id,index);
                    if let Some(pick)=self.ingredient_choices.get(&key).copied(){
                        self.used_choices.insert(key);
                        let matched=candidates.iter().find(|(id,_)|*id==pick)
                            .ok_or("DB02_INVALID_SELECTED_INGREDIENT")?.1.clone();
                        self.need_item(pick,total,stack,depth)?;
                        self.selections.push(json!({
                            "recipeId":recipe.recipe_id,"ingredientIndex":index,
                            "itemId":pick,"quantity":total,
                            "matchedSelectorIds":matched,"availabilityVerified":false
                        }));
                    }else{
                        let candidate_ids:Vec<u64>=candidates.iter().map(|(id,_)|*id).collect();
                        let resolution=if part.kind=="itemAlternatives"{
                            "explicit_item_alternative_choice_required"
                        }else if !self.membership{
                            "tag_item_membership_not_verified"
                        }else if !candidate_ids.is_empty(){
                            "partial_source_candidates_selection_required"
                        }else{
                            "not_found_in_partial_native_cooking_index"
                        };
                        let mut value=json!({
                            "recipeId":recipe.recipe_id,"ingredientIndex":index,
                            "kind":part.kind,"quantity":total,
                            "candidateItemIds":candidate_ids,"resolution":resolution,
                            "membershipCoverage":if self.membership{
                                "three_observed_cooking_native_classes"
                            }else{"not_supplied"},
                            "availabilityVerified":false
                        });
                        if part.kind=="anyTag"{
                            value["tagId"]=json!(selectors[0]);
                        }else if part.kind=="tagAlternatives"{
                            value["tagIds"]=json!(selectors);
                        }else{
                            value["itemIds"]=json!(alternatives);
                        }
                        self.selectors.push(value);
                    }
                },
                _=>return Err("DB02_UNSUPPORTED_INGREDIENT".into())
            }
        }
        self.steps.push(json!({
            "recipeId":recipe.recipe_id,"resultItemId":recipe.result_item_id,
            "type":recipe.recipe_type,"batches":batches,
            "resultQuantityPerBatch":recipe.result_quantity,
            "plannedOutputQuantity":recipe.result_quantity
                .map(|n|multiply(n,batches)).transpose()?,
            "conditionDigest":recipe.condition_digest,
            "eligibilityEvaluated":false
        }));
        Ok(())
    }

    fn finish(mut self,goals:Vec<(u64,u64)>)->Result<Value,String>{
        let mut normalized=Vec::new();
        for (id,batches) in goals{
            let recipe=self.recipes.get(&id).ok_or("DB02_UNKNOWN_GOAL")?.clone();
            normalized.push(json!({
                "recipeId":id,"resultItemId":recipe.result_item_id,
                "batches":batches,
                "outputQuantity":recipe.result_quantity
                    .map(|n|multiply(n,batches)).transpose()?
            }));
            self.run_recipe(&recipe,batches,&[recipe.result_item_id],0)?;
        }
        if self.used_choices.len()!=self.ingredient_choices.len(){
            return Err("DB02_UNUSED_INGREDIENT_CHOICE".into());
        }
        let required=self.needs.into_iter().map(|(item_id,need)|json!({
            "itemId":item_id,"quantity":need.quantity,"reasons":need.reasons,
            "recipeCandidateIds":need.recipe_candidate_ids,
            "acquisitionPaths":self.acquisition_paths.get(&item_id).cloned().unwrap_or_default(),
            "possibleStalls":self.possible_stalls.get(&item_id).cloned().unwrap_or_default(),
            "acquisitionAvailabilityVerified":false
        })).collect::<Vec<_>>();
        let rows=|map:BTreeMap<u64,u64>|map.into_iter().map(
            |(item_id,quantity)|json!({"itemId":item_id,"quantity":quantity})
        ).collect::<Vec<_>>();
        let resolved=self.blockers.is_empty()&&self.selectors.is_empty();
        Ok(json!({
            "schema":"wand.db02.material-basket@1",
            "source":self.source,"goals":normalized,
            "status":if resolved {"static_material_quantities_resolved"}
                else {"requires_explicit_choices"},
            "materialsFullySpecified":resolved,
            "recipeEligibilityEvaluated":false,
            "acquisitionAvailabilityVerified":false,
            "steps":self.steps,
            "unresolvedSelectors":self.selectors,
            "selectorSelections":self.selections,
            "blockers":self.blockers,
            "requiredMaterials":required,
            "inventoryUsed":rows(self.inventory_used),
            "remainingInventory":rows(self.inventory_left),
            "producedSurplus":rows(self.surplus)
        }))
    }
}

/// Pure native/Rust API. Caller must have authenticated its private game
/// source first. Never make real-time availability assertions from this report.
pub fn plan_recipe_basket_json(input:&str)->Result<String,String>{
    if input.len()>MAX_REQUEST_BYTES{return Err("DB02_PLAN_REQUEST_TOO_LARGE".into());}
    let request:Request=serde_json::from_str(input)
        .map_err(|_|"DB02_PLAN_REQUEST_JSON_INVALID".to_owned())?;
    let (state,goals)=Planner::from(request)?;
    let report=state.finish(goals)?;
    serde_json::to_string(&report).map_err(|_|"DB02_RESULT_JSON_FAILED".into())
}

#[cfg(feature="wasm")]
#[wasm_bindgen::prelude::wasm_bindgen]
pub fn plan_recipe_basket_wasm(input:&str)->Result<String,wasm_bindgen::JsValue>{
    plan_recipe_basket_json(input)
        .map_err(|code|wasm_bindgen::JsValue::from_str(&code))
}


#[cfg(test)]
mod tests{
    use super::*;
    fn fixture()->Value{
        json!({
            "schema":"wand.db02.recipe-basket-request@1",
            "source":{"platform":"Steam","gameVersion":"1.26.2"},
            "goals":[{"recipeId":11,"batches":1},{"recipeId":12,"batches":2}],
            "recipes":[
                {"recipeId":11,"resultItemId":101,"type":"crafting",
                 "resultQuantity":1,"conditionDigest":null,
                 "ingredients":[{"kind":"item","itemId":201,"quantity":3},
                                {"kind":"item","itemId":202,"quantity":1}]},
                {"recipeId":12,"resultItemId":102,"type":"crafting",
                 "resultQuantity":1,"conditionDigest":null,
                 "ingredients":[{"kind":"item","itemId":201,"quantity":2},
                                {"kind":"item","itemId":203,"quantity":2}]},
                {"recipeId":13,"resultItemId":201,"type":"crafting",
                 "resultQuantity":4,"conditionDigest":null,
                 "ingredients":[{"kind":"item","itemId":301,"quantity":2}]}
            ],
            "ingredientMembershipScope":"not_supplied",
            "acquisitionPaths":{"301":[{"pathId":"mining:1","type":"mining"}]},
            "options":{}
        })
    }
    fn run(req:Value)->Value{
        serde_json::from_str(&plan_recipe_basket_json(&req.to_string()).unwrap()).unwrap()
    }
    #[test]
    fn pools_nested_recipe_materials_and_shared_production_surplus(){
        let result=run(fixture());
        assert_eq!(result["schema"],"wand.db02.material-basket@1");
        assert_eq!(result["materialsFullySpecified"],true);
        assert_eq!(result["requiredMaterials"].as_array().unwrap().len(),3);
        assert_eq!(result["requiredMaterials"][0]["itemId"],202);
        assert_eq!(result["requiredMaterials"][0]["quantity"],1);
        assert_eq!(result["requiredMaterials"][1]["itemId"],203);
        assert_eq!(result["requiredMaterials"][1]["quantity"],4);
        assert_eq!(result["requiredMaterials"][2]["itemId"],301);
        assert_eq!(result["requiredMaterials"][2]["quantity"],4);
        assert_eq!(result["requiredMaterials"][2]["acquisitionPaths"][0]["type"],"mining");
        assert_eq!(result["steps"].as_array().unwrap().iter()
            .map(|step|step["recipeId"].as_u64().unwrap()).collect::<Vec<_>>(),
            vec![13,11,13,12]);
        assert_eq!(result["producedSurplus"][0]["quantity"],1);
        assert_eq!(result["acquisitionAvailabilityVerified"],false);
        assert_eq!(result["recipeEligibilityEvaluated"],false);
    }
    #[test]
    fn pooled_stock_and_non_mutating_conservative_cooking_yield(){
        let mut req=fixture();
        req["options"]=json!({"inventory":{"202":5,"203":1,"301":3,"777":2}});
        let result=run(req);
        assert_eq!(result["requiredMaterials"][0]["itemId"],203);
        assert_eq!(result["requiredMaterials"][0]["quantity"],3);
        assert_eq!(result["requiredMaterials"][1]["itemId"],301);
        assert_eq!(result["requiredMaterials"][1]["quantity"],1);
        assert_eq!(result["remainingInventory"].as_array().unwrap()
            .iter().find(|x|x["itemId"]==777).unwrap()["quantity"],2);
        let mut req=fixture();
        req["goals"]=json!([{"recipeId":11,"batches":3}]);
        req["recipes"][0]["type"]=json!("cooking");
        req["recipes"][0]["resultQuantity"]=Value::Null;
        let meal=run(req);
        assert_eq!(meal["goals"][0]["outputQuantity"],Value::Null);
        assert_eq!(meal["steps"].as_array().unwrap().last().unwrap()
            ["plannedOutputQuantity"],Value::Null);
    }
    #[test]
    fn explicit_item_alternative_choice_and_unspecified_selector(){
        let mut req=fixture();
        req["recipes"][0]["ingredients"]=json!([
            {"kind":"itemAlternatives","itemIds":[302,301],"quantity":2}
        ]);
        req["goals"]=json!([{"recipeId":11,"batches":2}]);
        let unresolved=run(req.clone());
        assert_eq!(unresolved["materialsFullySpecified"],false);
        assert_eq!(unresolved["unresolvedSelectors"][0]["candidateItemIds"],
            json!([301,302]));
        req["options"]=json!({"ingredientChoices":{"11:0":301}});
        let chosen=run(req);
        assert_eq!(chosen["materialsFullySpecified"],true);
        assert_eq!(chosen["requiredMaterials"][0]["itemId"],301);
        assert_eq!(chosen["requiredMaterials"][0]["quantity"],4);
        assert_eq!(chosen["selectorSelections"][0]["availabilityVerified"],false);
    }
    #[test]
    fn ambiguous_craft_cycle_and_bounds_fail_closed(){
        let mut req=fixture();
        req["recipes"].as_array_mut().unwrap().push(json!({
          "recipeId":14,"resultItemId":201,"type":"crafting",
          "resultQuantity":1,"ingredients":[{"kind":"item","itemId":301,"quantity":1}]
        }));
        let choice=run(req.clone());
        assert_eq!(choice["blockers"][0]["reason"],"recipe_choice_required");
        req["options"]=json!({"recipeChoices":{"201":13}});
        let chosen=run(req.clone());
        assert_eq!(chosen["materialsFullySpecified"],true);
        req["options"]=json!({"recipeChoices":{"201":999}});
        assert!(plan_recipe_basket_json(&req.to_string()).is_err());
        req["options"]=json!({"maxDepth":25});
        assert!(plan_recipe_basket_json(&req.to_string()).is_err());
        req["options"]=json!({"inventory":{"0301":2}});
        assert!(plan_recipe_basket_json(&req.to_string()).is_err());
        req["options"]=json!({});
        req["goals"]=json!([{"recipeId":11,"batches":1_000_001}]);
        assert!(plan_recipe_basket_json(&req.to_string()).is_err());
    }
}
