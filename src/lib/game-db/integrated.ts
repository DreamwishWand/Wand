/**
 * DB-00: one typed, cross-service Item ID reference API. This layer owns
 * integration and provenance, never DB-01..05 native extraction algorithms.
 * Published current facts and different-version history remain separate.
 */
import { loadCurrentGameDatabase } from './client.ts';
import { loadCollectionRuntime } from '../collection/catalog.mjs';
import { canonicalId, validateSnapshot, legacyItem, SNAPSHOT_SCHEMA } from './model.mjs';

export const SHARED_DB_CONTRACT = 'wand.game-db.shared@1' as const;
export const FACT_OVERLAY_SCHEMA = 'wand.game-db.fact-overlay@1' as const;

const SHA = /^[a-f0-9]{64}$/;
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;
const HISTORICAL_TARGET = Object.freeze({
  platform:'Nintendo Switch', gameVersion:'1.25.0',
  buildId:'52BD625D9B4E0053'
});

const VERIFIED_OVERLAYS = new WeakSet<object>();
const VERIFIED_BRAND: unique symbol = Symbol('verified-db00-overlay');
export type DbStream = 'DB-01' | 'DB-02' | 'DB-03' | 'DB-04' | 'DB-05' | 'SRC-04';
export type FactKey = 'category' | 'subcategory' | 'worlds' | 'universes' |
  'dlc' | 'acquisition' | 'starpaths' | 'events' | 'media' |
  'worldRegions' | 'saveReferences';
export type FactState = 'verified' | 'not_applicable' | 'unverified' | 'not_covered';
export type DbLocale = 'en'|'fr'|'it'|'de'|'es-ES'|'ja'|'zh-CN'|'pt-BR';

export interface DbTarget {
  readonly platform:string;
  readonly gameVersion:string|null;
  readonly buildId:string|null;
  readonly sourceSha256:string;
}
export interface DbMedia {
  readonly path:string;
  readonly sha256:string;
}
export interface FactValueMap {
  readonly category:string;
  readonly subcategory:string;
  readonly worlds:readonly string[];
  readonly universes:readonly string[];
  readonly dlc:readonly string[];
  readonly acquisition:readonly string[];
  readonly starpaths:readonly string[];
  readonly events:readonly string[];
  readonly media:DbMedia;
  readonly worldRegions:readonly string[];
  readonly saveReferences:readonly string[];
}
export interface FactProvenance {
  readonly stream:DbStream | 'DB-00';
  readonly target:DbTarget;
  readonly sourceId:string;
  readonly sourceSha256:string;
  /** What part of the original dataset was checked for this exact fact. */
  readonly scope:string;
  readonly verification:'current_exact_source';
}
export type FieldFact<K extends FactKey> =
  | Readonly<{state:'verified'; value:FactValueMap[K]; provenance:FactProvenance}>
  | Readonly<{state:'not_applicable'; value:null; provenance:FactProvenance}>
  | Readonly<{state:'unverified'|'not_covered'; value:null; provenance:null}>;
export type ItemFactFields = Readonly<{[K in FactKey]:FieldFact<K>}>;

export interface HistoricalCandidate<K extends 'worlds'|'universes'|'dlc'|'category'> {
  readonly state:'historical_candidate';
  readonly value:FactValueMap[K];
  readonly platform:'Nintendo Switch';
  readonly gameVersion:'1.25.0';
  readonly buildId:'52BD625D9B4E0053';
  readonly sourceId:'legacy-collection-switch-1250';
  readonly currentVersionVerified:false;
}
export interface ItemHistorical {
  readonly category:HistoricalCandidate<'category'>|null;
  readonly worlds:HistoricalCandidate<'worlds'>|null;
  readonly universes:HistoricalCandidate<'universes'>|null;
  readonly dlc:HistoricalCandidate<'dlc'>|null;
}
export interface SharedDbItem {
  readonly id:string;
  readonly names:Readonly<Partial<Record<DbLocale,string>>>;
  readonly nameStatus:'verified'|'unverified';
  /** Display-only provisional category from current published DB, NOT verified semantics. */
  readonly currentCategoryLabel:string|null;
  readonly nativeCategory:string|null;
  readonly facts:ItemFactFields;
  readonly historical:ItemHistorical;
}
export interface FieldCoverage {
  readonly verified:number;
  readonly notApplicable:number;
  readonly unverified:number;
  readonly notCovered:number;
  /** Current Item IDs with nonempty historical candidates, never current proof. */
  readonly historicalCandidates:number;
  readonly total:number;
}
export interface SharedDbCoverage {
  readonly snapshot:string;
  readonly target:DbTarget;
  readonly itemTotal:number;
  readonly nameVerified:number;
  readonly nameUnverified:number;
  readonly fields:Readonly<Record<FactKey,FieldCoverage>>;
}

export type OverlayVerifiedFact = {
  [K in FactKey]: Readonly<{
    field:K;
    state:'verified';
    value:FactValueMap[K];
    /** A verified empty array needs this explicit source conclusion. */
    emptyVerified?:true;
  }>
}[FactKey];
export type OverlayNotApplicable = Readonly<{
  field:FactKey;
  state:'not_applicable';
  /** Positive proof that this item cannot have such a relationship. */
  absenceVerified:true;
}>;
export type OverlayFact = OverlayVerifiedFact | OverlayNotApplicable;
export interface OverlayRow {
  readonly itemId:string;
  readonly facts:readonly OverlayFact[];
}
export interface FactOverlay {
  readonly schema:typeof FACT_OVERLAY_SCHEMA;
  readonly id:string;
  readonly stream:DbStream;
  readonly target:DbTarget;
  readonly sourceId:string;
  readonly sourceSha256:string;
  readonly scope:string;
  readonly rows:readonly OverlayRow[];
}
export type VerifiedFactOverlay = FactOverlay & Readonly<{[VERIFIED_BRAND]:true}>;
export type HistoricalSource = Readonly<{
  index:{
    t:{platform:string;gameVersion:string;buildID:string};
    f:readonly string[]; w:readonly string[];u:readonly string[];e:readonly string[];
    c:readonly string[];m:readonly string[];[name:string]:unknown
  };
  rows:readonly unknown[];
}>;

interface PublicRow {
  id:string;
  names:Record<string,string>;
  nameStatus:'verified'|'unverified';
  category:string|null;
  subcategory?:string|null;
  stateClass?:string|null;
  stateSemantic?:string|null;
  releaseIds:readonly string[];
  relations:readonly string[];
  nativeCategory?:string|null;
  worlds:readonly string[];
  universes:readonly string[];
  contentIds:readonly string[];
  media?:DbMedia|null;
  sourceRefs:readonly string[];
}
export interface PublicSnapshot {
  readonly schema:typeof SNAPSHOT_SCHEMA;
  readonly id:string;
  readonly target:DbTarget;
  readonly coverage:Readonly<{
    complete:boolean;
    scope:string;
    semanticCategoriesVerified?:boolean;
    categories:readonly string[];
    [key:string]:unknown
  }>;
  readonly sources:readonly {id:string;sha256:string;visibility:string}[];
  readonly releases:readonly unknown[];
  readonly publishable:boolean;
  readonly items:readonly PublicRow[];
}
const FIELDS = Object.freeze([
  'category','subcategory','worlds','universes','dlc','acquisition',
  'starpaths','events','media','worldRegions','saveReferences'
] as const satisfies readonly FactKey[]);
const OWNER:Readonly<Record<FactKey,DbStream>> = Object.freeze({
  category:'DB-01',subcategory:'DB-01',
  worlds:'DB-01',universes:'DB-01',dlc:'DB-01',
  acquisition:'DB-02',starpaths:'DB-03',events:'DB-03',
  media:'SRC-04',worldRegions:'DB-04',saveReferences:'DB-05'
});
const ARRAY_KEYS = new Set<FactKey>([
  'worlds','universes','dlc','acquisition','starpaths','events','worldRegions','saveReferences'
]);
const BASE_KEYS = new Set<FactKey>([
  'category','subcategory','worlds','universes','dlc','media'
]);
function check(ok:unknown,what:string):asserts ok {
  if(!ok)throw new TypeError('DB00_SHARED_'+what);
}
function object(v:unknown):v is Record<string,unknown> {
  return v!==null && typeof v==='object' && !Array.isArray(v);
}
function stringToken(v:unknown):v is string {
  return typeof v==='string' && TOKEN.test(v);
}
function sameTarget(a:DbTarget,b:DbTarget):boolean {
  return a.platform===b.platform && a.gameVersion===b.gameVersion &&
    a.buildId===b.buildId && a.sourceSha256===b.sourceSha256;
}
function checkTarget(raw:unknown):asserts raw is DbTarget {
  check(object(raw) && typeof raw.platform==='string' && raw.platform.length>0 &&
    (raw.gameVersion===null || typeof raw.gameVersion==='string' && raw.gameVersion.length>0) &&
    (raw.buildId===null || typeof raw.buildId==='string' && raw.buildId.length>0) &&
    typeof raw.sourceSha256==='string' && SHA.test(raw.sourceSha256),
    'INVALID_TARGET');
}
function copyValue<T extends string|readonly string[]|DbMedia>(value:T):T {
  if(typeof value==='object' && value!==null) {
    if(Array.isArray(value))return Object.freeze([...value]) as unknown as T;
    return Object.freeze({...value}) as unknown as T;
  }
  return value;
}
function checkValue(field:FactKey,v:unknown,emptyVerified:boolean):void {
  if(ARRAY_KEYS.has(field)) {
    check(Array.isArray(v) && v.every(stringToken) &&
      new Set(v).size===v.length && (v.length>0||emptyVerified),
      'VERIFIED_ARRAY_REQUIRES_SOURCE_EVIDENCE');
  } else if(field==='media') {
    check(object(v) && Object.keys(v).sort().join(',')==='path,sha256' &&
      typeof v.sha256==='string' && SHA.test(v.sha256) &&
      typeof v.path==='string' &&
      /^ddv\/item-images\/[a-zA-Z0-9_.\/-]+\.webp$/.test(v.path) &&
      !v.path.includes('..'), 'UNSAFE_MEDIA');
  } else {
    check(typeof v==='string' && v.trim().length>0 && v.length<=256,
      'VERIFIED_CATEGORY_VALUE_INVALID');
  }
}
function sourceRecord(stream:DbStream|'DB-00',target:DbTarget,
  sourceId:string,sourceSha256:string,scope:string):FactProvenance {
  return Object.freeze({
    stream,target,sourceId,sourceSha256,scope,
    verification:'current_exact_source' as const
  });
}
function missing<K extends FactKey>(state:'unverified'|'not_covered'):FieldFact<K> {
  return {state,value:null,provenance:null};
}
function observed<K extends FactKey>(value:FactValueMap[K],source:FactProvenance):FieldFact<K> {
  return {state:'verified',value:copyValue(value),provenance:source};
}
function legacyCandidate<K extends 'worlds'|'universes'|'dlc'|'category'>(
  value:FactValueMap[K]):HistoricalCandidate<K> {
  return Object.freeze({
    state:'historical_candidate',value:copyValue(value),
    platform:HISTORICAL_TARGET.platform,gameVersion:HISTORICAL_TARGET.gameVersion,
    buildId:HISTORICAL_TARGET.buildId,
    sourceId:'legacy-collection-switch-1250',
    currentVersionVerified:false
  }) as HistoricalCandidate<K>;
}

export class SharedGameDatabase {
  readonly contract=SHARED_DB_CONTRACT;
  readonly snapshotId:string;
  readonly target:DbTarget;
  readonly itemCount:number;
  private readonly records:Map<string,PublicRow>;
  private readonly historical:Map<string,ItemHistorical>;
  private readonly current:Map<string,Map<FactKey,FieldFact<FactKey>>>;
  private readonly source:FactProvenance;
  private readonly semanticCategoryVerified:boolean;
  private readonly usedOverlays:Set<string>;
  private readonly trustedSources:Map<DbStream,ReadonlySet<string>>;

  constructor(snapshot:PublicSnapshot,historical?:HistoricalSource,
    /** Independently verified ORIGINAL game-source digests, not copied from overlay. */
    sourcePins:Readonly<Partial<Record<DbStream,readonly string[]>>>={}
  ) {
    // Existing DB-00 validator is authoritative for the full release graph.
    validateSnapshot(snapshot);
    check(snapshot.schema===SNAPSHOT_SCHEMA && snapshot.publishable===true,
      'PUBLISHED_SNAPSHOT_REQUIRED');
    this.snapshotId=snapshot.id;
    this.target=Object.freeze({...snapshot.target});
    this.records=new Map(snapshot.items.map(item=>[canonicalId(item.id),item]));
    this.itemCount=this.records.size;
    this.semanticCategoryVerified=snapshot.coverage.semanticCategoriesVerified===true;
    const first=snapshot.sources[0];
    check(first && snapshot.sources.every(s=>s.visibility==='public_reference'),
      'PUBLIC_PROVENANCE_REQUIRED');
    this.source=sourceRecord('DB-00',this.target,first.id,first.sha256,snapshot.coverage.scope);
    this.historical=new Map();
    this.current=new Map();
    this.usedOverlays=new Set();
    this.trustedSources=new Map();
    for(const [stream,hashes] of Object.entries(sourcePins)) {
      check(Object.values(OWNER).includes(stream as DbStream) &&
        Array.isArray(hashes) && hashes.length>0 &&
        hashes.every(hash=>typeof hash==='string' && SHA.test(hash)),
        'INDEPENDENT_ORIGINAL_SOURCE_PIN_INVALID');
      this.trustedSources.set(stream as DbStream,new Set(hashes));
    }
    if(historical)this.attachHistorical(historical);
  }

  /**
   * Record verified *historical* evidence separately. Never replace current
   * source facts or change the current source's verification status.
   */
  attachHistorical(legacy:HistoricalSource):void {
    const idx=legacy?.index;
    check(idx?.t?.platform===HISTORICAL_TARGET.platform &&
      idx.t.gameVersion===HISTORICAL_TARGET.gameVersion &&
      idx.t.buildID===HISTORICAL_TARGET.buildId &&
      Array.isArray(legacy.rows), 'HISTORY_VERSION_MISMATCH');
    const seen=new Set<string>();
    const candidates=new Map<string,ItemHistorical>();
    for(const row of legacy.rows) {
      const old=legacyItem(idx,row) as PublicRow;
      check(!seen.has(old.id),'DUPLICATE_HISTORICAL_ITEM');
      seen.add(old.id);
      if(!this.records.has(old.id))continue;
      candidates.set(old.id,Object.freeze({
        category:old.category ? legacyCandidate<'category'>(old.category) : null,
        worlds:old.worlds.length ? legacyCandidate<'worlds'>(old.worlds) : null,
        universes:old.universes.length ? legacyCandidate<'universes'>(old.universes) : null,
        dlc:old.contentIds.length ? legacyCandidate<'dlc'>(old.contentIds) : null
      }));
    }
    this.historical.clear();
    for(const [id,fact] of candidates)this.historical.set(id,fact);
  }

  /** Attach a previously hashed and independently pinned current-source pack. */
  attachOverlay(overlay:VerifiedFactOverlay):void {
    check(object(overlay) && VERIFIED_OVERLAYS.has(overlay), 'UNVERIFIED_OVERLAY_BYTES');
    check(overlay?.schema===FACT_OVERLAY_SCHEMA && stringToken(overlay.id) &&
      !this.usedOverlays.has(overlay.id),'INVALID_OR_REUSED_OVERLAY');
    checkTarget(overlay.target);
    check(sameTarget(overlay.target,this.target),'CURRENT_SOURCE_TARGET_MISMATCH');
    check(this.trustedSources.get(overlay.stream)?.has(overlay.sourceSha256),
      'INDEPENDENT_ORIGINAL_SOURCE_SHA_PIN_REQUIRED');
    check(Object.values(OWNER).includes(overlay.stream) &&
      stringToken(overlay.sourceId) && SHA.test(overlay.sourceSha256) &&
      typeof overlay.scope==='string' && overlay.scope.trim().length>0 &&
      overlay.scope.length<=300 && Array.isArray(overlay.rows) &&
      overlay.rows.length<=this.itemCount, 'INVALID_OVERLAY_LEDGER');
    const provenance=sourceRecord(overlay.stream, this.target,
      overlay.sourceId,overlay.sourceSha256,overlay.scope);
    // Stage all facts; a partial failure must not change the active registry.
    const pending=new Map<string,Map<FactKey,FieldFact<FactKey>>>();
    for(const row of overlay.rows) {
      const id=canonicalId(row.itemId);
      check(this.records.has(id) && Array.isArray(row.facts) &&
        row.facts.length>0 && !pending.has(id), 'OVERLAY_ID_NOT_COVERED_OR_DUPLICATE');
      const perItem=new Map<FactKey,FieldFact<FactKey>>();
      for(const fact of row.facts) {
        check(object(fact) && FIELDS.includes(fact.field as FactKey) &&
          OWNER[fact.field as FactKey]===overlay.stream &&
          !perItem.has(fact.field as FactKey),'FIELD_OWNER_OR_DUPLICATE');
        const key=fact.field as FactKey;
        let value:FieldFact<FactKey>;
        if(fact.state==='verified') {
          checkValue(key,fact.value,fact.emptyVerified===true);
          value=observed(fact.value as FactValueMap[FactKey],provenance);
        } else {
          check(fact.state==='not_applicable' && fact.absenceVerified===true,
            'ABSENCE_MUST_BE_VERIFIED');
          value={state:'not_applicable',value:null,provenance};
        }
        const existing=this.current.get(id)?.get(key);
        check(!existing || existing.state===value.state &&
          JSON.stringify(existing.value)===JSON.stringify(value.value) &&
          existing.provenance?.sourceSha256===value.provenance?.sourceSha256,
          'CONFLICTING_CURRENT_EVIDENCE');
        perItem.set(key,Object.freeze(value));
      }
      pending.set(id,perItem);
    }
    for(const [id,fields] of pending) {
      const next=new Map(this.current.get(id)??[]);
      for(const [field,value] of fields)next.set(field,value);
      this.current.set(id,next);
    }
    this.usedOverlays.add(overlay.id);
  }

  async attachVerifiedOverlay(bytes:Uint8Array|ArrayBuffer,pinnedSha256:string):Promise<void> {
    this.attachOverlay(await verifyFactOverlay(bytes,pinnedSha256));
  }

  getItem(value:string|number):SharedDbItem|null {
    const id=canonicalId(value);
    const item=this.records.get(id);
    if(!item)return null;
    const supplied=this.current.get(id);
    const fields={} as Record<FactKey,FieldFact<FactKey>>;
    for(const field of FIELDS) {
      const source=supplied?.get(field) as FieldFact<typeof field>|undefined;
      if(source){fields[field]=source;continue;}
      // A released [] does NOT assert 'no worlds/universes/DLC'; it is
      // unverified until the owning stream attests exact current source.
      let base:unknown=null;
      if(field==='category' && this.semanticCategoryVerified)base=item.category;
      if(field==='subcategory' && this.semanticCategoryVerified)base=item.subcategory;
      if(field==='worlds')base=item.worlds;
      if(field==='universes')base=item.universes;
      if(field==='dlc')base=item.contentIds;
      if(field==='media')base=item.media;
      if(base!==null && base!==undefined &&
        (!Array.isArray(base)||base.length>0)) {
        fields[field]=observed(base as FactValueMap[typeof field],this.source);
      } else {
        fields[field]=missing(BASE_KEYS.has(field)?'unverified':'not_covered');
      }
    }
    const fallback:ItemHistorical=Object.freeze({
      category:null,worlds:null,universes:null,dlc:null
    });
    return Object.freeze({
      id, names:Object.freeze({...item.names}) as Partial<Record<DbLocale,string>>,
      nameStatus:item.nameStatus,
      currentCategoryLabel:item.category??null,
      nativeCategory:item.nativeCategory??null,
      facts:Object.freeze(fields) as ItemFactFields,
      historical:this.historical.get(id)??fallback
    });
  }

  /** Counters are computed over ALL current catalog IDs, never over matched history. */
  coverage():SharedDbCoverage {
    const fields={} as Record<FactKey,FieldCoverage>;
    for(const key of FIELDS) {
      const stats={verified:0,notApplicable:0,unverified:0,
        notCovered:0,historicalCandidates:0,total:this.itemCount};
      for(const id of this.records.keys()) {
        const row=this.getItem(id);
        if(!row)continue;
        const state=row.facts[key].state;
        if(state==='verified')stats.verified++;
        else if(state==='not_applicable')stats.notApplicable++;
        else if(state==='unverified')stats.unverified++;
        else stats.notCovered++;
        if((key==='category'||key==='worlds'||key==='universes'||key==='dlc') &&
          row.historical[key]!==null)stats.historicalCandidates++;
      }
      check(stats.verified+stats.notApplicable+stats.unverified+stats.notCovered===this.itemCount,
        'COVERAGE_INVARIANT');
      fields[key]=Object.freeze(stats);
    }
    let nameVerified=0;
    for(const row of this.records.values())if(row.nameStatus==='verified')nameVerified++;
    return Object.freeze({
      snapshot:this.snapshotId,target:this.target,itemTotal:this.itemCount,
      nameVerified,nameUnverified:this.itemCount-nameVerified,
      fields:Object.freeze(fields)
    });
  }
}

/**
 * Source bytes must be pinned *independently* of the incoming payload. JSON
 * strings or typed overlays without a trusted hash are NOT accepted as proof.
 * The output is private to its caller until a separately authorized publisher
 * verifies release compatibility and visibility for each fact.
 */
function deepFreezeVerifiedPayload(raw:unknown,depth=0):void {
  check(depth<=32,'OVERLAY_STRUCTURE_TOO_DEEP');
  if(!object(raw) && !Array.isArray(raw))return;
  for(const value of Object.values(raw))deepFreezeVerifiedPayload(value,depth+1);
  Object.freeze(raw);
}

export async function verifyFactOverlay(
  raw:Uint8Array|ArrayBuffer,expectedSha256:string
):Promise<VerifiedFactOverlay> {
  check(typeof expectedSha256==='string' && SHA.test(expectedSha256) &&
    globalThis.crypto?.subtle, 'INDEPENDENT_SHA_PIN_REQUIRED');
  const bytes=raw instanceof ArrayBuffer ? new Uint8Array(raw) : raw;
  check(bytes instanceof Uint8Array && bytes.byteLength>0 && bytes.byteLength<=16*1024*1024,
    'OVERLAY_BYTES_INVALID');
  const digest=await crypto.subtle.digest('SHA-256',new Uint8Array(bytes));
  const actual=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
  check(actual===expectedSha256,'OVERLAY_SHA_MISMATCH');
  const parsed:unknown=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  check(object(parsed) && parsed.schema===FACT_OVERLAY_SCHEMA &&
    typeof parsed.id==='string' && stringToken(parsed.id) &&
    Array.isArray(parsed.rows),'INVALID_OVERLAY_FORMAT');
  checkTarget(parsed.target);
  deepFreezeVerifiedPayload(parsed);
  const verified = parsed as unknown as VerifiedFactOverlay;
  VERIFIED_OVERLAYS.add(verified);
  return verified;
}

/**
 * Single application-level entrypoint. Uses the already-published SHA-pinned
 * release and, optionally, the immutable Switch history (candidate-only).
 * Other services consume this object; no individual private ZIP is required.
 */
export async function openSharedGameDatabase(
  base='',fetchImpl:typeof globalThis.fetch=globalThis.fetch,
  options:Readonly<{includeHistoricalCandidates?:boolean;
    verifiedOriginalSourcePins?:Readonly<Partial<Record<DbStream,readonly string[]>>>}>={}
):Promise<SharedGameDatabase> {
  const active=await loadCurrentGameDatabase(base,fetchImpl);
  check(active?.kind==='db_snapshot','CURRENT_PUBLISHED_SNAPSHOT_REQUIRED');
  const historical=options.includeHistoricalCandidates
    ? await loadCollectionRuntime(base,fetchImpl) : undefined;
  return new SharedGameDatabase(active as PublicSnapshot,historical as HistoricalSource|undefined,
    options.verifiedOriginalSourcePins);
}
