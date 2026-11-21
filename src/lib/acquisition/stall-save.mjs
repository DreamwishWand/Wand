/**
 * Source-typed, read-only submessage decoder for Definitions.Activities.StallData.
 * Steam v1.26.1 IL2CPP field map; does NOT locate or decode a whole save.
 * The caller must extract StallData using a separately verified, private Codec.
 * Snapshot fields are observations, not live shop inventory or verified prices.
 */
export const STALL_SAVE_EVIDENCE_CONTRACT = 'wand.db02.stall-save-evidence@1';
const MAX_BYTES = 128 * 1024;
const MAX_SLOTS = 512;
const positive = n => Number.isSafeInteger(n) && n > 0;
const immutable = Object.freeze;

function varint(bytes, start, end) {
  let value = 0n;
  for (let i = 0, p = start; i < 10 && p < end; i++, p++) {
    const byte = bytes[p];
    if (i === 9 && byte > 1) throw new TypeError('STALL_SAVE_VARINT_OVERFLOW');
    value |= BigInt(byte & 127) << BigInt(7 * i);
    if (!(byte & 128)) {
      if (i > 0 && byte === 0) throw new TypeError('STALL_SAVE_NONCANONICAL_VARINT');
      return [value, p + 1];
    }
  }
  throw new TypeError('STALL_SAVE_TRUNCATED_VARINT');
}

function scan(bytes, start, end, schema, maxFields = 2000) {
  const result = new Map();
  let pos = start;
  let fields = 0;
  while (pos < end) {
    if (++fields > maxFields) throw new TypeError('STALL_SAVE_FIELD_LIMIT');
    const [tag, next] = varint(bytes, pos, end);
    pos = next;
    const num = Number(tag >> 3n), kind = Number(tag & 7n);
    if (!Number.isSafeInteger(num) || num < 1 || num > 536870911 || ![0,1,2,5].includes(kind))
      throw new TypeError('STALL_SAVE_INVALID_WIRE_TAG');
    let val;
    if (kind === 0) {
      [val,pos] = varint(bytes,pos,end);
    } else if (kind === 2) {
      const [size,p] = varint(bytes,pos,end);
      if (size > BigInt(end - p)) throw new TypeError('STALL_SAVE_TRUNCATED_FIELD');
      pos = p + Number(size);
      val = [p,pos];
    } else {
      const size = kind === 1 ? 8 : 4;
      if (end - pos < size) throw new TypeError('STALL_SAVE_TRUNCATED_FIELD');
      val = [pos,pos + size];
      pos += size;
    }
    const expected = schema[num];
    if (!expected) continue; // unknown fields cannot be silently reserialized
    if (kind !== expected.kind) throw new TypeError('STALL_SAVE_FIELD_WIRE_MISMATCH');
    const existing = result.get(num);
    if (existing && !expected.repeated) throw new TypeError('STALL_SAVE_DUPLICATE_SCALAR');
    if (!existing) result.set(num, []);
    result.get(num).push(val);
  }
  if (pos !== end) throw new TypeError('STALL_SAVE_INCOMPLETE_MESSAGE');
  return result;
}
const fields = (input, schema) => scan(input.bytes, input.start, input.end, schema);
const sub = (bytes, range) => ({bytes,start:range[0],end:range[1]});
const int32 = raw => Number(BigInt.asIntN(32,raw));
const uint = raw => { if (raw > 2147483647n) throw new TypeError('STALL_SAVE_INVALID_INT32'); return Number(raw); };
const scalar = (map,id,convert) => map.has(id) ? convert(map.get(id)[0]) : null;
const int32Field = value => int32(value);
const unsignedField = value => uint(value);
const first = value => value[0];

function timestamp(input) {
  const m = fields(input,{1:{kind:0},2:{kind:0}});
  const seconds = scalar(m,1,v=>BigInt.asIntN(64,v).toString());
  const nanos = scalar(m,2,int32Field);
  if (nanos !== null && (nanos < -999999999 || nanos > 999999999))
    throw new TypeError('STALL_SAVE_INVALID_NANOSECONDS');
  return immutable({seconds,nanos});
}
function itemAmount(input) {
  const m = fields(input,{1:{kind:0},2:{kind:0}});
  const id = scalar(m,1,unsignedField);
  const amount = scalar(m,2,int32Field);
  // Native ItemAmount.Infinite == -1. Retain it without claiming infinite stock.
  if (amount != null && amount < -1) throw new TypeError('STALL_SAVE_INVALID_AMOUNT');
  return immutable({itemId:id === 0 ? null : id,serializedAmount:amount,
    serializedInfiniteSentinel:amount === -1});
}
function slot(input) {
  const m = fields(input,{1:{kind:0},2:{kind:2},3:{kind:0},4:{kind:2}});
  const slotId = scalar(m,1,unsignedField);
  const item = m.has(2) ? itemAmount(sub(input.bytes,first(m.get(2)))) : null;
  const maxAmount = scalar(m,3,int32Field);
  if (maxAmount !== null && maxAmount < -1) throw new TypeError('STALL_SAVE_INVALID_MAX_AMOUNT');
  const regen = m.has(4) ? timestamp(sub(input.bytes,first(m.get(4)))) : null;
  return immutable({slotId,itemId:item?.itemId??null,
    serializedItemAmount:item?.serializedAmount??null,
    serializedInfiniteSentinel:item?.serializedInfiniteSentinel??false,
    serializedMaxAmount:maxAmount,serializedRegenDuration:regen,
    // These fields are not verified current stock/remaining time/retail price.
    stockVerified:false,offerPrice:null,priceVerified:false});
}
function shop(input) {
  const m = fields(input,{1:{kind:2},2:{kind:0},3:{kind:2,repeated:true},4:{kind:0}});
  const data = m.get(3)??[];
  if (data.length>MAX_SLOTS) throw new TypeError('STALL_SAVE_TOO_MANY_SLOTS');
  const slots = immutable(data.map(range=>slot(sub(input.bytes,range))));
  const seen = new Set();
  for (const s of slots) {
    if (s.slotId === null) continue;
    if (seen.has(s.slotId)) throw new TypeError('STALL_SAVE_DUPLICATE_SLOT_ID');
    seen.add(s.slotId);
  }
  return immutable({lastRefreshTimestamp:m.has(1)?timestamp(sub(input.bytes,first(m.get(1)))):null,
    serializedRefreshCount:scalar(m,2,unsignedField),
    // Seed is parsed but intentionally excluded from user-visible output.
    slotCount:slots.length,slots,
    liveAvailabilityVerified:false,retailPricesVerified:false,
    playerEntitlementVerified:false});
}

/** @param {Uint8Array} bytes The *StallData submessage*, not a whole save file. */
export function decodeStallDataEvidence(bytes) {
  if (!(bytes instanceof Uint8Array) || !bytes.length || bytes.length > MAX_BYTES)
    throw new TypeError('STALL_SAVE_INVALID_BYTES');
  const m = fields({bytes,start:0,end:bytes.length},
    {1:{kind:2},2:{kind:2},3:{kind:0}});
  const savedShop = m.has(2)?shop(sub(bytes,first(m.get(2)))):null;
  return immutable({contract:STALL_SAVE_EVIDENCE_CONTRACT,
    sourceType:'Definitions.Activities.StallData',
    nativeFieldMapEvidence:'Steam v1.26.1 IL2CPP',
    compatibilityWithOtherGameVersions:'not_proven',
    shopDataPresent:savedShop!==null,
    shop:savedShop,
    savedStateOnly:true,liveInventoryVerified:false,
    salePricesVerified:false,writable:false,publishable:false});
}

/**
 * Cross-check an externally located StallData message against the exact static
 * stall definition. SlotId is never assumed to match the source slot order.
 * This function cannot verify a player's save identity or save codec.
 */
export function inspectSavedStallShop(db, stallId, bytes) {
  if (!positive(stallId) || !db || typeof db.getStallStaticCatalog !== 'function')
    throw new TypeError('STALL_SAVE_CATALOG_REQUIRED');
  const staticStall = db.getStallStaticCatalog(stallId);
  if (!staticStall) throw new TypeError('STALL_SAVE_UNKNOWN_STALL_ID');
  const decoded = decodeStallDataEvidence(bytes);
  const slots = immutable((decoded.shop?.slots??[]).map(s=>{
    const catalogSlot = s.slotId === null ? null : (staticStall.slots[s.slotId]??null);
    const enumeratedMatch = Boolean(catalogSlot && s.itemId !== null &&
      catalogSlot.candidates.some(c=>c.itemId===s.itemId));
    return immutable({...s,staticSlotIdReference:s.slotId,
      sourceSlotMappingVerified:false,
      staticCandidateListed:enumeratedMatch,
      candidateRelationStatus:s.itemId===null?'empty_or_unresolved':
        enumeratedMatch?'listed_static_candidate':'not_listed_not_proof_invalid',
      // Missing candidate is inconclusive due to dynamic/conditional slot pools.
      availableForPurchaseVerified:false});
  }));
  return immutable({contract:STALL_SAVE_EVIDENCE_CONTRACT,
    stallId,staticCatalogContract:staticStall.contract,
    staticSource:staticStall.source,
    decoded:immutable({shopDataPresent:decoded.shopDataPresent,
      serializedRefreshCount:decoded.shop?.serializedRefreshCount??null,
      lastRefreshTimestamp:decoded.shop?.lastRefreshTimestamp??null}),
    slots,slotCount:slots.length,saveCodecVerified:false,
    sourceSlotMappingVerified:false,liveInventoryVerified:false,
    salePricesVerified:false,playerEntitlementVerified:false,
    writable:false,publishable:false});
}