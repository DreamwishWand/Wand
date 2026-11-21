/**
 * DB-05 decoded ProfileWorld.Stores -> DB-02 read-only provenance bridge.
 * Source: Steam v1.26.1 IL2CPP StoreInfo, StoreDisplay, DisplayInfo,
 * DisplaySlot and ItemAmount. The private Codec owns whole-save decoding.
 * This module never decodes/serializes a save, proves stock, or sets prices.
 */
import { inspectDecodedSave } from '../save/registry.mjs';

export const WORLD_STORE_SAVE_CONTRACT = 'wand.db02.world-store-save-evidence@1';
const POS = value => Number.isSafeInteger(value) && value > 0 && value <= 2147483647;
const I32 = value => Number.isSafeInteger(value) && value >= -2147483648 && value <= 2147483647;
const obj = value => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const has = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const optional = (value, key) => has(value, key) ? value[key] : null;
const block = code => { throw new TypeError(code); };
const countLimit = (value, max, code) => Array.isArray(value) && value.length <= max || block(code);
const intField = (value, code, allowZero = false) =>
  value === null ? null : ((POS(value) || (allowZero && value === 0)) ? value : block(code));

function readSlot(row, storeIndex, displayIndex, slotIndex) {
  if (!obj(row)) block('WORLD_STORE_INVALID_DISPLAY_SLOT');
  const item = optional(row, 'Item');
  if (item !== null && !obj(item)) block('WORLD_STORE_INVALID_ITEM_AMOUNT');
  const itemId = item === null ? null : intField(optional(item, 'Id'), 'WORLD_STORE_INVALID_ITEM_ID', true);
  const amount = item === null ? null : optional(item, 'Amount');
  if (amount !== null && (!I32(amount) || amount < -1)) block('WORLD_STORE_INVALID_ITEM_AMOUNT');
  const currencyId = intField(optional(row, 'CurrencyId'), 'WORLD_STORE_INVALID_CURRENCY', true);
  const available = optional(row, 'IsAvailable');
  if (available !== null && typeof available !== 'boolean') block('WORLD_STORE_INVALID_AVAILABILITY_FLAG');
  return Object.freeze({storeIndex,displayIndex,slotIndex,
    itemId:itemId || null,serializedAmount:amount,
    serializedInfiniteSentinel:amount === -1,
    currencyId:currencyId || null,
    serializedIsAvailable:available,
    // A saved flag is not a verified live offer, current quantity, or entitlement.
    liveAvailabilityVerified:false,stockVerified:false,salePrice:null,
    priceVerified:false,playerEligibilityVerified:false});
}

function readStore(row, index, db) {
  if (!obj(row)) block('WORLD_STORE_INVALID_STORE_INFO');
  const buildingItemId = intField(optional(row, 'BuildingItemID'), 'WORLD_STORE_INVALID_BUILDING_ID', true);
  const displays = optional(row, 'Displays');
  if (displays !== null) countLimit(displays,256,'WORLD_STORE_INVALID_DISPLAYS');
  const displayRows = [];
  const slots = [];
  for (const [displayIndex, display] of (displays ?? []).entries()) {
    if (!obj(display)) block('WORLD_STORE_INVALID_STORE_DISPLAY');
    const displayItemId = intField(optional(display, 'DisplayItemID'), 'WORLD_STORE_INVALID_DISPLAY_ID', true);
    const info = optional(display, 'DisplayInfo');
    if (info !== null && !obj(info)) block('WORLD_STORE_INVALID_DISPLAY_INFO');
    const nativeSlots = info === null ? null : optional(info, 'Slots');
    if (nativeSlots !== null) countLimit(nativeSlots,256,'WORLD_STORE_INVALID_DISPLAY_SLOTS');
    const blockSlots = Object.freeze((nativeSlots ?? []).map((slot,slotIndex) => {
      const parsed = readSlot(slot,index,displayIndex,slotIndex);
      slots.push(parsed);
      if (slots.length > 8192) block('WORLD_STORE_TOO_MANY_SLOTS');
      return parsed;
    }));
    displayRows.push(Object.freeze({displayIndex,displayItemId:displayItemId || null,
      slotCount:blockSlots.length,slots:blockSlots,
      // DisplayItemID is a display definition, not a merchandise Item ID.
      displayItemIsMerchandise:false}));
  }
  const exactStall = buildingItemId && typeof db?.getStallStaticCatalog === 'function'
    ? db.getStallStaticCatalog(buildingItemId) : null;
  return Object.freeze({storeIndex:index,buildingItemId:buildingItemId || null,
    displays:Object.freeze(displayRows),slots:Object.freeze(slots),displayCount:displayRows.length,
    savedSlotCount:slots.length,
    exactStaticStallIdMatch:exactStall?.stallId ?? null,
    // StoreInfo and StallBuildingItemData are distinct types; ID match alone
    // does not establish correspondence of display/slot/stock semantics.
    staticSlotMappingVerified:false,staticStallIdentityVerified:false,
    currentInventoryVerified:false,salePricesVerified:false});
}

/**
 * Accept only an already-decoded private Save root. DB-05's structural check is
 * required; it does not itself attest the strict Codec or native version.
 * Absence of World.Stores means "not_observed", not "no stores in game".
 */
export function inspectDecodedWorldStores(db, decodedSave) {
  const assessment = inspectDecodedSave(decodedSave,null);
  if (!assessment.rootShapeValid) block('WORLD_STORE_INVALID_DB05_ROOT');
  if (!db || typeof db.getStallStaticCatalog !== 'function')
    block('WORLD_STORE_ACQUISITION_CATALOG_REQUIRED');
  const world = decodedSave.World;
  if (!obj(world)) block('WORLD_STORE_INVALID_WORLD');
  const present = has(world,'Stores');
  const rows = present ? world.Stores : null;
  if (present) countLimit(rows,256,'WORLD_STORE_INVALID_STORES');
  const stores = Object.freeze((rows ?? []).map((row,index)=>readStore(row,index,db)));
  return Object.freeze({contract:WORLD_STORE_SAVE_CONTRACT,
    profilePath:'/World/Stores',sourceNativeType:'StoreInfo',
    sourceEvidence:'steam-1.26.1-IL2CPP-and-DB05-native-observed-paths',
    fieldObserved:present,
    status:present ? 'observed_decoded_structure' : 'not_observed',
    storeCount:stores.length,
    serializedSlotCount:stores.reduce((n,row)=>n+row.savedSlotCount,0),
    stores,
    strictCodecVerified:false,nativeBuildCompatibilityVerified:false,
    staticSlotMappingVerified:false,liveInventoryVerified:false,
    salePricesVerified:false,saveWriterAuthorized:false,publishable:false});
}