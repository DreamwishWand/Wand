/**
 * Offline-only stall catalogue built from a verified SRC-02 native bundle.
 * Never a prediction of live ShopData slots, sales, stock, prices or unlock state.
 */
export const STATIC_STALL_CATALOG_CONTRACT = 'wand.db02.static-stall-catalog@1';
const positive = x => Number.isSafeInteger(x) && x > 0;
const zeroOrNull = x => x == null || (Number.isSafeInteger(x) && x >= 0);
const immutable = value => Object.freeze(value);

function amountRow(row) {
  if (!row || !positive(row.itemId) || !zeroOrNull(row.amount))
    throw new TypeError('INVALID_STATIC_STALL_COST');
  return immutable({ itemId: row.itemId, amount: row.amount ?? null,
    amountVerified: row.amount != null });
}

function costSchedule(stall) {
  if (stall.unlockCosts != null && !Array.isArray(stall.unlockCosts))
    throw new TypeError('INVALID_STATIC_STALL_UNLOCK_COSTS');
  if (stall.upgrades != null && !Array.isArray(stall.upgrades))
    throw new TypeError('INVALID_STATIC_STALL_UPGRADES');
  const unlockCosts = immutable((stall.unlockCosts ?? []).map(amountRow));
  const upgrades = immutable((stall.upgrades ?? []).map(row => {
    if (!row || !zeroOrNull(row.level) || !zeroOrNull(row.requiredPlayerLevel) ||
        (row.cost != null && !positive(row.cost.itemId)))
      throw new TypeError('INVALID_STATIC_STALL_UPGRADE');
    return immutable({level: row.level ?? null,
      requiredPlayerLevel: row.requiredPlayerLevel ?? null,
      benefitType: row.benefitType ?? null,
      benefitDigest: row.benefitDigest ?? null,
      cost: row.cost == null ? null : amountRow(row.cost),
      // A missing amount is not a zero-price / free upgrade.
      costAmountVerified: row.cost?.amount != null});
  }));
  if (!zeroOrNull(stall.unlockAtLevel) ||
      (stall.unlockWithItemId != null && !positive(stall.unlockWithItemId)))
    throw new TypeError('INVALID_STATIC_STALL_UNLOCK_GATE');
  return immutable({ unlockWithItemId: stall.unlockWithItemId ?? null,
    unlockAtLevel: stall.unlockAtLevel ?? null,
    unlockCosts, upgrades,
    unlockSatisfied: 'unknown', upgradesPurchased: 'unknown',
    costsAreBuildingNotSalePrices: true });
}

function buildSlot(slotIndex, table) {
  if (!Array.isArray(table?.groups)) throw new TypeError('INVALID_STATIC_STALL_LOOT_GROUPS');
  const items = new Map();
  let hasDynamicTypeFilters = false;
  let hasConditions = false;
  const groupIndexes = new Set();
  for (const group of table.groups) {
    if (!Number.isSafeInteger(group.index) || group.index < 0 || groupIndexes.has(group.index) ||
        !Array.isArray(group.candidates)) throw new TypeError('INVALID_STATIC_STALL_LOOT_GROUP');
    groupIndexes.add(group.index);
    hasDynamicTypeFilters ||= Boolean(group.hasDynamicTypeFilters);
    hasConditions ||= Boolean(group.eligibilityDigest);
    for (const candidate of group.candidates) {
      if (!positive(candidate.itemId)) throw new TypeError('INVALID_STATIC_STALL_CANDIDATE');
      const condition = Boolean(group.eligibilityDigest || candidate.conditionDigest);
      hasConditions ||= condition;
      const item = items.get(candidate.itemId) ?? { itemId: candidate.itemId,
        groupIndexes: new Set(), hasCondition: false };
      item.groupIndexes.add(group.index);
      item.hasCondition ||= condition;
      items.set(item.itemId, item);
    }
  }
  const candidates = immutable([...items.values()]
    .sort((a,b)=>a.itemId-b.itemId)
    .map(item=>immutable({itemId:item.itemId,
      candidateGroupIndexes:immutable([...item.groupIndexes].sort((a,b)=>a-b)),
      hasCondition:item.hasCondition,
      status:'static_candidate_not_verified_for_sale'})));
  return immutable({slotIndex,lootTableId:table.lootTableId,
    candidateCount:candidates.length,candidates,
    hasDynamicTypeFilters,hasConditionalFilter:hasConditions,
    // A dynamic source can produce items outside the enumerated candidates.
    enumeratedCandidatesExhaustive:false,
    currentSlotItemId:null,
    currentSlotStock:null,
    currentSalePrice:null,
    sourceStatus:'static_loot_table_candidates_only'});
}

/** Accept already verified/validated private input; never publish the data. */
export function createStaticStallCatalogIndex({manifest,stallSources=[],lootTables=[]}) {
  if (manifest?.schema !== 'wand.src02@1' || !manifest.platform || !manifest.gameVersion ||
      !Array.isArray(stallSources) || !Array.isArray(lootTables))
    throw new TypeError('SRC02_STALL_SOURCES_REQUIRED');
  const lootById = new Map();
  for (const row of lootTables) {
    if (!positive(row.lootTableId) || lootById.has(row.lootTableId))
      throw new TypeError('INVALID_OR_DUPLICATE_STALL_LOOT_TABLE');
    lootById.set(row.lootTableId,row);
  }
  const byId = new Map();
  const byKey = new Map();
  const entries = [];
  for (const stall of stallSources) {
    if (!positive(stall.stallId) || byId.has(stall.stallId) ||
        typeof stall.shopDataKey !== 'string' || !stall.shopDataKey ||
        typeof stall.nameKey !== 'string' || !stall.nameKey ||
        stall.inventoryStatus !== 'static_loot_candidates_only' ||
        !Array.isArray(stall.slotLootTableIds) || !stall.slotLootTableIds.length)
      throw new TypeError('INVALID_STATIC_STALL_SOURCE');
    const slots = immutable(stall.slotLootTableIds.map((id,index)=>{
      const table = lootById.get(id);
      if (!table) throw new TypeError(`Unresolved stall loot table ${id}`);
      return buildSlot(index,table);
    }));
    const candidateItemIds = immutable([...new Set(slots.flatMap(s=>s.candidates.map(x=>x.itemId)))].sort((a,b)=>a-b));
    const hasDynamicTypeFilters = slots.some(x=>x.hasDynamicTypeFilters);
    const hasConditionalFilter = slots.some(x=>x.hasConditionalFilter);
    const record = immutable({
      contract: STATIC_STALL_CATALOG_CONTRACT,
      stallId:stall.stallId,nameKey:stall.nameKey,shopDataKey:stall.shopDataKey,
      source:immutable({kind:'game_native',file:'itemlist/Building.json',
        definitionId:stall.stallId,platform:manifest.platform,gameVersion:manifest.gameVersion}),
      slotCount:slots.length,slots,candidateItemIds,
      distinctCandidateCount:candidateItemIds.length,
      slotsWithDynamicTypeFilters:slots.filter(x=>x.hasDynamicTypeFilters).length,
      hasDynamicTypeFilters,hasConditionalFilter,
      buildingCosts:costSchedule(stall),
      currentInventoryVerified:false,currentSalePricesVerified:false,
      playerUnlockEvaluated:false,
      completeShopCatalogVerified:false,
      status:'static_candidates_not_live_inventory',publishable:false,
    });
    entries.push(record);
    byId.set(record.stallId, record);
    if (!byKey.has(record.shopDataKey)) byKey.set(record.shopDataKey,[]);
    byKey.get(record.shopDataKey).push(record);
  }
  entries.sort((a,b)=>a.stallId-b.stallId);
  for (const [key,rows] of byKey) byKey.set(key,immutable(rows.sort((a,b)=>a.stallId-b.stallId)));
  const all=immutable(entries);
  const empty=immutable([]);
  return immutable({
    contract:STATIC_STALL_CATALOG_CONTRACT,
    source:immutable({platform:manifest.platform,gameVersion:manifest.gameVersion}),
    catalogCount:all.length,
    getStallStaticCatalog:id=>positive(id)?(byId.get(id)??null):null,
    getStallsByShopDataKey:key=>typeof key==='string'?(byKey.get(key)??empty):empty,
    listStallStaticCatalogs:()=>all,
  });
}