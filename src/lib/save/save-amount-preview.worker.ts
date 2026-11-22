/**
 * DB-05: typed TypeScript module Worker for the Rust/WASM Save amount engine.
 * The product engine (P1G, inventory/chest patch, validation, exact copy)
 * runs only in Rust/WASM. No JavaScript Save Writer fallback.
 * Dedicated Worker owns all original bytes; only bounded receipts or an
 * explicitly requested experimental copy reach the Svelte page.
 */
import init, { WasmAmountPreview } from './wasm/p1g-pkg/ddv_p1g_codec.js';
import wasmUrl from './wasm/p1g-pkg/ddv_p1g_codec_bg.wasm?url';
import {WorldReferenceIndex} from '../world/reference-graph.ts';
import {
  detectLocalSaveFormat,
  MAX_LOCAL_P1G_BYTES,
  MAX_LOCAL_JSON_BYTES
} from './save-diagnostics-worker-core.mjs';

const CHUNK = 1024 * 1024;
const MAX_COPY_BYTES = 32 * 1024 * 1024;
type InputFormat = 'auto' | 'json' | 'p1g';
type Target =
  | { kind: 'inventory'; inventoryId: string; itemId: string }
  | { kind: 'chest'; containerId: string; slotIndex: number; itemId: number };

export interface SaveGridItemReference {
  readonly itemId:string;
  readonly fullGridReferences:number;
  readonly diffModifiedReferences:number;
}
export interface SaveGridReferenceReport {
  readonly contract:'wand.db05.saved-grid-item-refs@2';
  readonly status:'not_observed'|'incompatible_structure'|
    'partial_inconclusive'|'observed_no_item_refs'|'saved_item_refs';
  readonly observedFullGrids:number;
  readonly observedDiffGrids:number;
  readonly invalidRecords:number;
  readonly removedObjectMarkers:number;
  readonly sampled:boolean;
  readonly entries:readonly SaveGridItemReference[];
  readonly effectivePlacedCountVerified:false;
  readonly playerPlacementVerified:false;
  readonly worldSourceMatched:false;
  readonly saveWritingAuthorized:false;
}
const nonnegative=(v:unknown,max:number):v is number=>
  typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=max;
function validateGridReport(source:unknown):SaveGridReferenceReport {
  if(!object(source)||!exact(source,[
    'contract','status','observedFullGrids','observedDiffGrids',
    'invalidRecords','removedObjectMarkers','sampled','entries',
    'effectivePlacedCountVerified',
    'playerPlacementVerified','worldSourceMatched','saveWritingAuthorized'
  ])||source.contract!=='wand.db05.saved-grid-item-refs@2'||
    !['not_observed','incompatible_structure','partial_inconclusive',
      'observed_no_item_refs','saved_item_refs'].includes(String(source.status))||
    !nonnegative(source.observedFullGrids,2048)||
    !nonnegative(source.observedDiffGrids,2048)||
    source.observedFullGrids+source.observedDiffGrids>2048||
    !nonnegative(source.invalidRecords,102048)||
    !nonnegative(source.removedObjectMarkers,100000)||
    typeof source.sampled!=='boolean'||!Array.isArray(source.entries)||
    source.entries.length>20000||
    source.effectivePlacedCountVerified!==false||
    source.playerPlacementVerified!==false||
    source.worldSourceMatched!==false||source.saveWritingAuthorized!==false)
    throw new TypeError('DB05_GRID_REPORT_INVALID');
  let prior=0n,full=0,diff=0;
  const entries:SaveGridItemReference[]=source.entries.map(row=>{
    if(!object(row)||!exact(row,[
      'itemId','fullGridReferences','diffModifiedReferences'
    ])||!validId(row.itemId)||
      !nonnegative(row.fullGridReferences,100000)||
      !nonnegative(row.diffModifiedReferences,100000)||
      (row.fullGridReferences===0&&row.diffModifiedReferences===0)||
      BigInt(row.itemId)<=prior)
      throw new TypeError('DB05_GRID_ROW_INVALID');
    prior=BigInt(row.itemId);
    full+=row.fullGridReferences;
    diff+=row.diffModifiedReferences;
    return {itemId:row.itemId,
      fullGridReferences:row.fullGridReferences,
      diffModifiedReferences:row.diffModifiedReferences};
  });
  if(full+diff>100000||
     (source.status==='saved_item_refs'&&(entries.length===0||
       source.sampled||source.invalidRecords!==0))||
     (source.status==='observed_no_item_refs'&&(entries.length!==0||
       source.sampled||source.invalidRecords!==0))||
     (source.status==='partial_inconclusive'&&
       !source.sampled&&source.invalidRecords===0)||
     (['not_observed','incompatible_structure'].includes(String(source.status))&&
       (entries.length!==0||source.observedFullGrids!==0||
        source.observedDiffGrids!==0)))
      throw new TypeError('DB05_GRID_STATUS_INVALID');
  return {
    contract:'wand.db05.saved-grid-item-refs@2',
    status:source.status as SaveGridReferenceReport['status'],
    observedFullGrids:source.observedFullGrids,
    observedDiffGrids:source.observedDiffGrids,
    invalidRecords:source.invalidRecords,
    removedObjectMarkers:source.removedObjectMarkers,
    sampled:source.sampled,entries,
    effectivePlacedCountVerified:false,playerPlacementVerified:false,
    worldSourceMatched:false,saveWritingAuthorized:false
  };
}

interface Db04GridPathReceipt {
  contract:'wand.db05.db04-grid-path-match@2';
  status:'not_observed'|'incompatible_structure'|
    'partial_inconclusive'|'source_path_matches'|'no_exact_full_path_match';
  observedFullGrids:number;
  matchedFullGrids:number;
  notInPartialSourceFullGrids:number;
  ambiguousSourceFullGrids:number;
  malformedFullGrids:number;
  observedDiffGrids:number;
  hashUnverifiedDiffGrids:number;
  structuralCandidateDiffGrids:number;
  notInPartialSourceDiffGrids:number;
  ambiguousSourceDiffGrids:number;
  malformedDiffGrids:number;
  sampled:boolean;
  sourceCoverageComplete:false;
  sourceOriginalArchiveRechecked:false;
  saveGridNumericIdUsedAsNativeKey:false;
  diffIdentityVerified:false;
  worldCoordinatesVerified:false;
  playerPlacementVerified:false;
  nativeDefaultObjectEquivalenceVerified:false;
  saveWritingAuthorized:false;
}
function validatedDb04GridReceipt(source:unknown):Db04GridPathReceipt{
  if(!object(source)||!exact(source,[
    'contract','status','observedFullGrids','matchedFullGrids',
    'notInPartialSourceFullGrids','ambiguousSourceFullGrids',
    'malformedFullGrids','observedDiffGrids','hashUnverifiedDiffGrids',
    'structuralCandidateDiffGrids','notInPartialSourceDiffGrids',
    'ambiguousSourceDiffGrids','malformedDiffGrids',
    'sampled','sourceCoverageComplete',
    'sourceOriginalArchiveRechecked','saveGridNumericIdUsedAsNativeKey',
    'diffIdentityVerified','worldCoordinatesVerified','playerPlacementVerified',
    'nativeDefaultObjectEquivalenceVerified','saveWritingAuthorized'
  ]) || source.contract!=='wand.db05.db04-grid-path-match@2' ||
    !['not_observed','incompatible_structure','partial_inconclusive',
      'source_path_matches','diff_structural_candidates_only',
      'no_exact_full_path_match'].includes(
        String(source.status))||
    ![
      source.observedFullGrids,source.matchedFullGrids,
      source.notInPartialSourceFullGrids,source.ambiguousSourceFullGrids,
      source.malformedFullGrids,source.observedDiffGrids,
      source.hashUnverifiedDiffGrids,source.structuralCandidateDiffGrids,
      source.notInPartialSourceDiffGrids,source.ambiguousSourceDiffGrids,
      source.malformedDiffGrids
    ].every(v=>nonnegative(v,2049)) ||
    Number(source.observedFullGrids)+Number(source.observedDiffGrids)>2048 ||
    Number(source.matchedFullGrids)+
      Number(source.notInPartialSourceFullGrids)+
      Number(source.ambiguousSourceFullGrids)+
      Number(source.malformedFullGrids)<Number(source.observedFullGrids) ||
    Number(source.matchedFullGrids)+
      Number(source.notInPartialSourceFullGrids)+
      Number(source.ambiguousSourceFullGrids)+
      Number(source.malformedFullGrids)>Number(source.observedFullGrids)+1 ||
    Number(source.structuralCandidateDiffGrids)+
      Number(source.notInPartialSourceDiffGrids)+
      Number(source.ambiguousSourceDiffGrids)!==
      Number(source.hashUnverifiedDiffGrids) ||
    Number(source.hashUnverifiedDiffGrids)+
      Number(source.malformedDiffGrids)<Number(source.observedDiffGrids) ||
    Number(source.hashUnverifiedDiffGrids)+
      Number(source.malformedDiffGrids)>Number(source.observedDiffGrids)+1 ||
    typeof source.sampled!=='boolean' ||
    source.sourceCoverageComplete!==false ||
    source.sourceOriginalArchiveRechecked!==false ||
    source.saveGridNumericIdUsedAsNativeKey!==false ||
    source.diffIdentityVerified!==false ||
    source.worldCoordinatesVerified!==false ||
    source.playerPlacementVerified!==false ||
    source.nativeDefaultObjectEquivalenceVerified!==false ||
    source.saveWritingAuthorized!==false)
      throw new TypeError('DB05_DB04_GRID_RECEIPT_INVALID');
  return source as unknown as Db04GridPathReceipt;
}

interface Db03MissionSlotReceipt {
  contract:'wand.db05.db03-mission-slot-summary@1';
  status:'not_observed'|'incompatible_structure'|'partial_inconclusive'|
    'zero_sentinels_only'|'unresolved_in_guide_subset'|'source_mission_candidates';
  observedMissionSlots:number;
  matchedPlayableQuestReferences:number;
  unresolvedPlayableQuestReferences:number;
  zeroSentinels:number;
  malformedMissionIds:number;
  typeIssues:number;
  missingOptionalMissionIds:number;
  distinctPositiveMissionIds:number;
  sampled:boolean;
  publishedQuestDefinitions:733;
  sourceGameVersion:'1.26.2';
  indexMetadataValidated:true;
  originalGameSourceBytesRehashed:false;
  conditionCompatibilityVerified:false;
  completeQuestHistoryVerified:false;
  questProgressVerified:false;
  questCompletionVerified:false;
  entitlementVerified:false;
  saveWritingAuthorized:false;
  exportAuthorized:false;
}
function validateDb03MissionReceipt(input:unknown):Db03MissionSlotReceipt {
  if(!object(input)||!exact(input,[
    'contract','status','observedMissionSlots',
    'matchedPlayableQuestReferences','unresolvedPlayableQuestReferences',
    'zeroSentinels','malformedMissionIds','typeIssues',
    'missingOptionalMissionIds','distinctPositiveMissionIds',
    'sampled','publishedQuestDefinitions','sourceGameVersion',
    'indexMetadataValidated','originalGameSourceBytesRehashed',
    'conditionCompatibilityVerified','completeQuestHistoryVerified',
    'questProgressVerified','questCompletionVerified','entitlementVerified',
    'saveWritingAuthorized','exportAuthorized'
  ]) || input.contract!=='wand.db05.db03-mission-slot-summary@1' ||
    !['not_observed','incompatible_structure','partial_inconclusive',
      'zero_sentinels_only','unresolved_in_guide_subset',
      'source_mission_candidates'].includes(String(input.status)) ||
    ![
      input.observedMissionSlots,input.matchedPlayableQuestReferences,
      input.unresolvedPlayableQuestReferences,input.zeroSentinels,
      input.malformedMissionIds,input.distinctPositiveMissionIds
    ].every(n=>nonnegative(n,256)) ||
    !nonnegative(input.typeIssues,262656)||
    !nonnegative(input.missingOptionalMissionIds,262656)||
    Number(input.observedMissionSlots)!==
      Number(input.matchedPlayableQuestReferences)+
      Number(input.unresolvedPlayableQuestReferences)+
      Number(input.zeroSentinels)+Number(input.malformedMissionIds)||
    Number(input.distinctPositiveMissionIds)>
      Number(input.matchedPlayableQuestReferences)+
      Number(input.unresolvedPlayableQuestReferences)||
    typeof input.sampled!=='boolean'||
    input.publishedQuestDefinitions!==733||
    input.sourceGameVersion!=='1.26.2'||
    input.indexMetadataValidated!==true||
    input.originalGameSourceBytesRehashed!==false||
    input.conditionCompatibilityVerified!==false||
    input.completeQuestHistoryVerified!==false||
    input.questProgressVerified!==false||
    input.questCompletionVerified!==false||
    input.entitlementVerified!==false||
    input.saveWritingAuthorized!==false||
    input.exportAuthorized!==false)
    throw new TypeError('DB05_DB03_MISSION_RECEIPT_INVALID');
  return input as unknown as Db03MissionSlotReceipt;
}

export interface LocalGridInstance{
  readonly localOrdinal:number;
  readonly itemId:string;
  readonly recordKind:'full'|'diff_modified';
  readonly x:number|null;
  readonly y:number|null;
  readonly orientation:string|null;
  readonly coordinatesObserved:boolean;
}
export interface GridInstancePreview{
  readonly contract:'wand.db05.grid-instance-preview@1';
  readonly status:'not_observed'|'incompatible_structure'|
    'partial_inconclusive'|'observed_no_item_refs'|'saved_object_instances';
  readonly observedFullGrids:number;
  readonly observedDiffGrids:number;
  readonly scannedObjectRecords:number;
  readonly notItemReferences:number;
  readonly invalidRecords:number;
  readonly removedObjectMarkers:number;
  readonly rowsMissingCoordinates:number;
  readonly sampled:boolean;
  readonly rows:readonly LocalGridInstance[];
  readonly sourceGridIdentityVerified:false;
  readonly effectivePlacementVerified:false;
  readonly legalPlacementVerified:false;
  readonly stableInstanceIdentityVerified:false;
  readonly saveWritingAuthorized:false;
}
const signed32=(v:unknown):v is number=>
  typeof v==='number'&&Number.isInteger(v)&&
  v>=-2147483648&&v<=2147483647;
function validateGridInstancePreview(source:unknown):GridInstancePreview{
  if(!object(source)||!exact(source,[
    'contract','status','observedFullGrids','observedDiffGrids',
    'scannedObjectRecords','notItemReferences','invalidRecords',
    'removedObjectMarkers','rowsMissingCoordinates','sampled','rows',
    'sourceGridIdentityVerified','effectivePlacementVerified',
    'legalPlacementVerified','stableInstanceIdentityVerified',
    'saveWritingAuthorized'
  ])||source.contract!=='wand.db05.grid-instance-preview@1'||
    !['not_observed','incompatible_structure','partial_inconclusive',
      'observed_no_item_refs','saved_object_instances'].includes(
      String(source.status))||
    !nonnegative(source.observedFullGrids,2048)||
    !nonnegative(source.observedDiffGrids,2048)||
    Number(source.observedFullGrids)+Number(source.observedDiffGrids)>2048||
    !nonnegative(source.scannedObjectRecords,100000)||
    !nonnegative(source.notItemReferences,100000)||
    !nonnegative(source.invalidRecords,102050)||
    !nonnegative(source.removedObjectMarkers,100000)||
    !nonnegative(source.rowsMissingCoordinates,20000)||
    typeof source.sampled!=='boolean'||!Array.isArray(source.rows)||
    source.rows.length>20000||
    Number(source.rowsMissingCoordinates)>source.rows.length||
    Number(source.notItemReferences)+source.rows.length>
      Number(source.scannedObjectRecords)||
    source.sourceGridIdentityVerified!==false||
    source.effectivePlacementVerified!==false||
    source.legalPlacementVerified!==false||
    source.stableInstanceIdentityVerified!==false||
    source.saveWritingAuthorized!==false)
    throw new TypeError('DB05_GRID_INSTANCE_RECEIPT_INVALID');
  let missing=0;
  const rows:LocalGridInstance[]=source.rows.map((value,i)=>{
    if(!object(value)||!exact(value,[
      'localOrdinal','itemId','recordKind','x','y',
      'orientation','coordinatesObserved'
    ])||value.localOrdinal!==i+1||
      !validId(value.itemId)||
      !['full','diff_modified'].includes(String(value.recordKind))||
      (value.coordinatesObserved
        ? (!signed32(value.x)||!signed32(value.y))
        : (value.x!==null||value.y!==null))||
      typeof value.coordinatesObserved!=='boolean'||
      (value.orientation!==null &&
        (typeof value.orientation!=='string'||
          !/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(value.orientation))))
      throw new TypeError('DB05_GRID_INSTANCE_ROW_INVALID');
    if(value.coordinatesObserved===false)missing++;
    return value as unknown as LocalGridInstance;
  });
  if(missing!==source.rowsMissingCoordinates||
    (source.status==='saved_object_instances'&&
      (rows.length===0||source.sampled||source.invalidRecords!==0))||
    (source.status==='observed_no_item_refs'&&
      (rows.length!==0||source.sampled||source.invalidRecords!==0))||
    (source.status==='partial_inconclusive'&&
      !source.sampled&&source.invalidRecords===0)||
    (['not_observed','incompatible_structure'].includes(String(source.status))&&
      (rows.length!==0||source.observedFullGrids!==0||
        source.observedDiffGrids!==0)))
    throw new TypeError('DB05_GRID_INSTANCE_STATUS_INVALID');
  return {...source,rows} as unknown as GridInstancePreview;
}

interface PreviewReceipt {
  contract: 'wand.db05.amount-preview@1';
  changed: boolean;
  lexicalBytesPreserved: true;
  reopenVerified: boolean;
  writerAuthorized: false;
  exportAuthorized: false;
}
interface BatchPreviewReceipt {
  contract: 'wand.db05.batch-preview@1';
  changedCount: number;
  lexicalBytesPreserved: true;
  reopenVerified: true;
  writerAuthorized: false;
  exportAuthorized: false;
}
interface CopyReceipt {
  contract: 'wand.db05.experimental-copy@1';
  copyBytes: number;
  originalUnchanged: true;
  productionWriterAuthorized: false;
  independentReopenVerified: true;
  experimentalCopyOnly: true;
}
type Reply =
  | { kind: 'error' }
  | { kind: 'result'; receipt: PreviewReceipt | BatchPreviewReceipt }
  | { kind: 'copy'; bytes: Uint8Array; receipt: CopyReceipt }
  | { kind: 'slots'; rows: SaveEditableSlot[];
      grid:SaveGridReferenceReport;
      contract:'wand.db05.editable-slots@1'; complete:true; writerAuthorized:false }
  | {kind:'db04';receipt:Db04GridPathReceipt}
  | {kind:'db03';receipt:Db03MissionSlotReceipt}
  | {kind:'grid-instances';receipt:GridInstancePreview};

interface IsolatedScope {
  onmessage: ((event: MessageEvent<unknown>) => Promise<void>) | null;
  postMessage: (message: Reply, transfer?: Transferable[]) => void;
  close: () => void;
}
const isolated = self as unknown as IsolatedScope;
const object = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);
const uint32 = (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v > 0 && v <= 0xffffffff;
const validId = (v: unknown): v is string =>
  typeof v === 'string' && /^[0-9]{1,20}$/.test(v) &&
  BigInt(v) > 0n && BigInt(v) <= 18446744073709551615n;
const exact = (v: unknown, keys: readonly string[]): boolean =>
  object(v) && Object.keys(v).sort().join(',') === keys.slice().sort().join(',');

function validateTarget(raw: unknown): Target {
  if (!object(raw)) throw new TypeError('DB05_TARGET_INVALID');
  if (raw.kind === 'inventory') {
    if (!exact(raw, ['kind', 'inventoryId', 'itemId']) ||
        !validId(raw.inventoryId) || !validId(raw.itemId))
      throw new TypeError('DB05_INVENTORY_TARGET_INVALID');
    return { kind: 'inventory', inventoryId: raw.inventoryId, itemId: raw.itemId };
  }
  if (raw.kind === 'chest') {
    if (!exact(raw, ['kind', 'containerId', 'slotIndex', 'itemId']) ||
        !validId(raw.containerId) || !uint32(raw.itemId) ||
        typeof raw.slotIndex !== 'number' ||
        !Number.isInteger(raw.slotIndex) ||
        raw.slotIndex < 0 || raw.slotIndex > 1_000_000)
      throw new TypeError('DB05_CHEST_TARGET_INVALID');
    return { kind: 'chest', containerId: raw.containerId,
      slotIndex: raw.slotIndex, itemId: raw.itemId };
  }
  throw new TypeError('DB05_TARGET_KIND_INVALID');
}


export type SaveEditableSlot =
  | { kind:'inventory'; inventoryId:string; itemId:string; amount:number }
  | { kind:'chest'; containerId:string; slotIndex:number; itemId:number; amount:number };

function validateSlotRows(source:unknown):SaveEditableSlot[]{
  if (!object(source) || !exact(source, [
    'contract','rows','completeForExistingPositiveU32Amounts','writerAuthorized'
  ]) || source.contract!=='wand.db05.editable-slots@1' ||
      source.completeForExistingPositiveU32Amounts!==true ||
      source.writerAuthorized!==false ||
      !Array.isArray(source.rows)||source.rows.length>20000)
    throw new TypeError('DB05_SLOT_INDEX_RESPONSE_INVALID');
  const seen=new Set<string>();
  return source.rows.map((row:unknown)=>{
    if (!object(row)||!uint32(row.amount))
      throw new TypeError('DB05_SLOT_INDEX_ROW_INVALID');
    let value:SaveEditableSlot;
    if (row.kind==='inventory' &&
        exact(row,['kind','inventoryId','itemId','amount']) &&
        validId(row.inventoryId)&&validId(row.itemId))
      value={kind:'inventory',inventoryId:row.inventoryId,
        itemId:row.itemId,amount:row.amount};
    else if(row.kind==='chest' &&
      exact(row,['kind','containerId','slotIndex','itemId','amount']) &&
      validId(row.containerId)&&uint32(row.itemId) &&
      typeof row.slotIndex==='number'&&Number.isInteger(row.slotIndex) &&
      row.slotIndex>=0&&row.slotIndex<=1_000_000)
      value={kind:'chest',containerId:row.containerId,
        slotIndex:row.slotIndex,itemId:row.itemId,amount:row.amount};
    else throw new TypeError('DB05_SLOT_INDEX_ROW_INVALID');
    const key=value.kind==='inventory'
      ? 'i/'+value.inventoryId+'/'+value.itemId
      : 'c/'+value.containerId+'/'+value.slotIndex;
    if(seen.has(key))throw new TypeError('DB05_SLOT_INDEX_DUPLICATE');
    seen.add(key);
    return value;
  });
}

interface BatchEdit { target: Target; expected: number; replacement: number }
function validateBatchEdits(raw: unknown): BatchEdit[] {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 16)
    throw new TypeError('DB05_BATCH_COUNT_INVALID');
  const seen = new Set<string>();
  return raw.map((value: unknown) => {
    if (!exact(value, ['target', 'expected', 'replacement']) || !object(value) ||
        !uint32(value.expected) || !uint32(value.replacement) ||
        value.expected === value.replacement)
      throw new TypeError('DB05_BATCH_AMOUNT_INVALID');
    const target = validateTarget(value.target);
    const key = JSON.stringify(target);
    if (seen.has(key)) throw new TypeError('DB05_BATCH_TARGET_DUPLICATED');
    seen.add(key);
    return {target, expected:value.expected, replacement:value.replacement};
  });
}

let started = false;
isolated.onmessage = async ({ data }: MessageEvent<unknown>): Promise<void> => {
  if (started) return;
  started = true;
  const input = object(data) ? data : null;
  const bytes = input?.bytes;
  const graph = input?.graph;
  let response: Reply = { kind: 'error' };
  let rust: WasmAmountPreview | null = null;
  let exported: Uint8Array | null = null;
  try {
    const compareDb04=input?.command === 'inspect-db04-grid-paths';
    const compareDb03=input?.command === 'inspect-db03-mission-slots';
    const listing=input?.command === 'inspect-existing-slots';
    const instances=input?.command === 'inspect-grid-instances';
    const exporting = input?.command === 'export-existing-amount-copy' ||
      input?.command === 'export-batch-amount-copy';
    const batch = input?.command === 'preview-batch-amounts' ||
      input?.command === 'export-batch-amount-copy';
    const expectedKeys = compareDb04
      ? ['command','format','bytes','graph']
      : compareDb03 ? ['command','format','bytes','base']
      : listing||instances ? ['command','format','bytes'] : batch
      ? (exporting
        ? ['command', 'format', 'bytes', 'edits', 'allowExperimentalCopy']
        : ['command', 'format', 'bytes', 'edits'])
      : (exporting
        ? ['command', 'format', 'bytes', 'target', 'expected', 'replacement',
           'allowExperimentalCopy']
        : ['command', 'format', 'bytes', 'target', 'expected', 'replacement']);
    if (!input || !exact(input, expectedKeys) ||
        !['preview-existing-amount', 'export-existing-amount-copy',
          'preview-batch-amounts', 'export-batch-amount-copy',
          'inspect-existing-slots','inspect-db04-grid-paths',
          'inspect-db03-mission-slots','inspect-grid-instances'].includes(
          String(input.command)) ||
        (exporting && input.allowExperimentalCopy !== true) ||
        !['auto', 'json', 'p1g'].includes(String(input.format)) ||
        !(bytes instanceof Uint8Array) ||
        (compareDb04 && (!(graph instanceof Uint8Array) ||
          graph.byteLength<1||graph.byteLength>64*1024*1024)) ||
        (compareDb03 && (typeof input.base!=='string' ||
          !(input.base===''||
            /^\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(input.base)))) ||
        (!batch && !listing && !instances && !compareDb04 && !compareDb03 &&
          (!uint32(input.expected) || !uint32(input.replacement))))
      throw new TypeError('DB05_WORKER_COMMAND_INVALID');

    const edits = batch ? validateBatchEdits(input.edits) : null;
    const plan = edits === null ? null : JSON.stringify({edits});
    const target = (batch||listing||instances||compareDb04||compareDb03)
      ? null : validateTarget(input.target);
    const requestedFormat = input.format as InputFormat;
    const format: Exclude<InputFormat, 'auto'> =
      requestedFormat === 'auto' ? detectLocalSaveFormat(bytes) : requestedFormat;
    if (format === 'p1g'
      ? (bytes.byteLength < 16 ||
         bytes.byteLength > MAX_LOCAL_P1G_BYTES ||
         bytes.byteLength % 16 !== 0)
      : (bytes.byteLength < 1 || bytes.byteLength > MAX_LOCAL_JSON_BYTES))
      throw new TypeError('DB05_WORKER_SIZE_INVALID');

    await init(wasmUrl);
    rust = new WasmAmountPreview(format);
    for (let i = 0; i < bytes.byteLength; i += CHUNK)
      rust.append_chunk(bytes.subarray(i, i + CHUNK));
    rust.finish_open();

    if(instances){
      response={kind:'grid-instances',receipt:validateGridInstancePreview(
        JSON.parse(rust.list_saved_grid_instances()))};
    }else if(compareDb03){
      // Request ONLY the same-origin static, public Guide catalogue. The Save,
      // private Mission IDs and quantities never enter a URL or fetch body.
      const url=`${input.base}/guide/public/quest-index.json`;
      const catalogue=await fetch(url,{cache:'no-store',credentials:'same-origin'});
      if(!catalogue.ok||new URL(catalogue.url).origin!==self.location.origin)
        throw new TypeError('DB05_DB03_PUBLIC_GUIDE_UNAVAILABLE');
      const contentLength=Number(catalogue.headers.get('content-length')??0);
      if(!Number.isSafeInteger(contentLength)||contentLength>2*1024*1024)
        throw new TypeError('DB05_DB03_INDEX_TOO_LARGE');
      const indexBytes=new Uint8Array(await catalogue.arrayBuffer());
      if(indexBytes.byteLength<1||indexBytes.byteLength>2*1024*1024)
        throw new TypeError('DB05_DB03_INDEX_TOO_LARGE');
      const indexJson=new TextDecoder('utf-8',{fatal:true}).decode(indexBytes);
      response={kind:'db03',receipt:validateDb03MissionReceipt(
        JSON.parse(rust.match_db03_mission_slots(indexJson)))};
    }else if(compareDb04){
      // This is a caller-supplied *local* DB-04 native source graph. Use the
      // existing DB-04 index to check all structural references before Rust
      // performs the game-specific path comparison. No native/private source
      // or Save grid paths leave this isolated Worker.
      const graphJson=new TextDecoder('utf-8',{fatal:true}).decode(graph as Uint8Array);
      const source=new WorldReferenceIndex(JSON.parse(graphJson));
      const verified=source.toDb00WorldRelationsSidecar();
      const witness=JSON.stringify({
        contract:'wand.db05.db04-grid-path-witness@2',
        gridRefs:verified.gridRefs.map(ref=>({
          layoutId:ref.layoutId,gridDataPath:ref.gridDataPath,
          nativeGridId:ref.nativeGridId
        }))
      });
      const receipt=validatedDb04GridReceipt(
        JSON.parse(rust.match_db04_grid_paths(witness)));
      response={kind:'db04',receipt};
    }else if(listing){
      const extracted:unknown=JSON.parse(rust.list_existing_slots());
      const grid=validateGridReport(
        JSON.parse(rust.list_saved_grid_item_references()));
      response={
        kind:'slots', contract:'wand.db05.editable-slots@1',
        rows:validateSlotRows(extracted),grid,
        complete:true,writerAuthorized:false
      };
    }else if (exporting) {
      const length = plan !== null
        ? rust.prepare_batch_copy(plan)
        : target?.kind === 'inventory'
          ? rust.prepare_inventory_copy(
            target.inventoryId, target.itemId, input.expected as number, input.replacement as number)
          : rust.prepare_chest_copy(
            target!.containerId, target!.slotIndex, target!.itemId,
            input.expected as number, input.replacement as number);
      if (!Number.isSafeInteger(length) ||
          length < 1 || length > MAX_COPY_BYTES)
        throw new TypeError('DB05_COPY_SIZE_INVALID');

      exported = new Uint8Array(length);
      for (let i = 0; i < length; i += CHUNK) {
        const part: Uint8Array = rust.take_copy_chunk(Math.min(CHUNK, length - i));
        if (!(part instanceof Uint8Array) ||
            part.byteLength !== Math.min(CHUNK, length - i))
          throw new TypeError('DB05_COPY_CHUNK_INVALID');
        exported.set(part, i);
        part.fill(0);
      }
      response = {
        kind: 'copy', bytes: exported,
        receipt: {
          contract: 'wand.db05.experimental-copy@1',
          copyBytes: length, originalUnchanged: true,
          productionWriterAuthorized: false,
          independentReopenVerified: true,
          experimentalCopyOnly: true
        }
      };
    } else {
      const raw = plan !== null
        ? rust.preview_batch(plan)
        : target?.kind === 'inventory'
          ? rust.preview_inventory(
            target.inventoryId, target.itemId, input.expected as number, input.replacement as number)
          : rust.preview_chest(
            target!.containerId, target!.slotIndex, target!.itemId,
            input.expected as number, input.replacement as number);
      const candidate: unknown = JSON.parse(raw);
      if (batch) {
        if (!object(candidate) || !exact(candidate, [
          'contract','changedCount','lexicalBytesPreserved','reopenVerified',
          'writerAuthorized','exportAuthorized'
        ]) || candidate.contract !== 'wand.db05.batch-preview@1' ||
            candidate.changedCount !== edits?.length ||
            candidate.lexicalBytesPreserved !== true ||
            candidate.reopenVerified !== true ||
            candidate.writerAuthorized !== false ||
            candidate.exportAuthorized !== false)
          throw new TypeError('DB05_BATCH_UNTRUSTED_RECEIPT');
        response = {
          kind:'result',
          receipt:{
            contract:'wand.db05.batch-preview@1',
            changedCount:edits!.length,
            lexicalBytesPreserved:true,
            reopenVerified:true,
            writerAuthorized:false,
            exportAuthorized:false
          }
        };
      } else {
      if (!exact(candidate, [
        'contract', 'changed', 'lexicalBytesPreserved', 'reopenVerified',
        'writerAuthorized', 'exportAuthorized'
      ]) || !object(candidate) ||
          candidate.contract !== 'wand.db05.amount-preview@1' ||
          typeof candidate.changed !== 'boolean' ||
          candidate.lexicalBytesPreserved !== true ||
          typeof candidate.reopenVerified !== 'boolean' ||
          candidate.writerAuthorized !== false ||
          candidate.exportAuthorized !== false)
        throw new TypeError('DB05_UNTRUSTED_RUST_RECEIPT');
      response = {
        kind: 'result',
        receipt: {
          contract: 'wand.db05.amount-preview@1',
          changed: candidate.changed,
          lexicalBytesPreserved: true,
          reopenVerified: candidate.reopenVerified,
          writerAuthorized: false,
          exportAuthorized: false
        }
      };
      }
    }
  } catch {
    // Never forward private source fields, Rust errors, IDs, or save contents.
  } finally {
    rust?.close();
    rust?.free();
    if (bytes instanceof Uint8Array && bytes.byteLength) bytes.fill(0);
    if (graph instanceof Uint8Array && graph.byteLength) graph.fill(0);
  }

  if (response.kind === 'copy') {
    // Explicit user action permits transferred edited bytes; never clone.
    isolated.postMessage(response, [response.bytes.buffer as ArrayBuffer]);
  } else {
    if (exported instanceof Uint8Array && exported.byteLength) exported.fill(0);
    isolated.postMessage(response);
  }
  isolated.close();
};
