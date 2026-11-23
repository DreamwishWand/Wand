/** Steam v1.26.2 private Condition source reader.
 * Validates exact original SHA-256 and renders only source-defined Mission
 * mentions, never evaluated prerequisites, runtime truth or player progress.
 */
export type NativeConditionOperator='AND'|'OR'|'NOT';
export interface CurrentConditionMention{
  readonly conditionId:string;
  readonly sourceName:string;
  readonly conditionWireSha256:string;
  readonly sourcePath:string;
  readonly operator:NativeConditionOperator;
  readonly kind:string;
  readonly stepId?:number;
  readonly subStepId?:number;
  readonly objectiveId?:number;
  readonly inversed?:boolean;
  readonly missionStateCode?:number;
  readonly missionState?:string;
  readonly comparisonOperatorCode?:number;
  readonly comparisonOperator?:string;
  readonly statusCode?:number;
  readonly status?:string;
  readonly omittedSourceFields?:readonly string[];
  readonly sourceStepIndex?:number;
  readonly sourceStepName?:string|null;
  readonly localizedStepDescription?:string;
  readonly localizedStepDescriptionLanguage?:string|null;
}
export interface ConditionSourceCensus{
  readonly definitionCount:number;
  readonly kindTotal:number;
  readonly sourceKinds:Readonly<Record<string,number>>;
  readonly missionStepStatusExplicitScalarLeaves:number;
  readonly commonConditionPointerLeaves:number;
  readonly distinctMissionIdsInExplicitStepReferences:number;
  readonly missionReferenceLeaves?:number;
  readonly nonStepMissionReferenceLeaves?:number;
  readonly missionReferencesByKind?:Readonly<Record<string,number>>;
}
export interface IndexedConditionMentions{
  readonly byMission:Map<string,CurrentConditionMention[]>;
  readonly census:ConditionSourceCensus;
}
export interface CurrentGuideConditions{
  readonly byMission:Map<string,CurrentConditionMention[]>;
  readonly count:number;
  readonly missionReferenceCount:number;
  readonly formatVersion:1|2;
  readonly targetVersion:'1.26.2';
  readonly sourceSha256:string;
  readonly indexSha256:string;
  readonly evaluation:'static_native_definitions_only';
}
export interface CurrentConditionMentionsWindow{
  readonly total:number;
  readonly rows:readonly CurrentConditionMention[];
}
export interface CurrentConditionStepDisplay{
  readonly id:string;
  readonly text:string;
  readonly textSource?:string|null;
}
export interface GuideSourceFile{
  readonly name:string;
  readonly size:number;
  arrayBuffer():Promise<ArrayBuffer>;
}
type Raw=Record<string,any>;
/** Owner-selected Steam 1.26.2 static Condition references for the local Guide.
 * Nothing is fetched, uploaded, published, or evaluated against player state.
 */
export const GUIDE_CONDITION_SCHEMA = 'wand.db03.condition-native-index@1' as const;
export const GUIDE_CONDITION_MANIFEST_SCHEMA = 'wand.db03.condition-native-index-manifest@1' as const;
export const GUIDE_CONDITION_SOURCE_SHA = '9eb5e7800a2485b1dfb3e148a7bcff5d6c6b6ed72797ed2331a902ab44188f4c' as const;
export const GUIDE_CONDITION_INDEX_SHA = 'd1b43f2f62746c2b8aa9a0d4f8a8a7d35467e498e8b27bf815ea0659d71e7b69' as const;
export const GUIDE_CONDITION_PROBE_SHA = '07fd8ebb1c528f852a0e00ce54cf4964f93931b9155bc9e2aab1bd857986d00a' as const;
export const GUIDE_CONDITION_INDEX_BYTES = 3888435 as const;
export const GUIDE_CONDITION_V2_SCHEMA = 'wand.db03.condition-native-index@2' as const;
export const GUIDE_CONDITION_V2_MANIFEST_SCHEMA = 'wand.db03.condition-native-index-manifest@2' as const;
export const GUIDE_CONDITION_INDEX_V2_SHA = 'aa04c61c973874881443a370a50009f5ad6156d9e1b83ec4553045561c41b08f' as const;
export const GUIDE_CONDITION_INDEX_V2_BYTES = 4093730 as const;
export const GUIDE_CONDITION_V2_MISSION_REFERENCES = 4960 as const;
const MISSION_REFERENCE_TAGS:Readonly<Record<string,number>> = Object.freeze({
  MissionAvailable:250, MissionCompleted:255, MissionOngoing:260, MissionStatus:270,
  MissionStepCompleted:280, MissionStepStatus:285, MissionObjectiveCompleted:290,
  MissionObjectiveStatus:295, MissionObjectiveSkipped:297, MissionObjectiveProgression:300
});
const STEP_REFERENCE_KINDS:ReadonlySet<string> = new Set([
  'MissionStepCompleted','MissionStepStatus','MissionObjectiveCompleted',
  'MissionObjectiveStatus','MissionObjectiveSkipped','MissionObjectiveProgression'
]);
export const GUIDE_CONDITION_SOURCE_BYTES = 571341 as const;
export const GUIDE_CONDITION_NATIVE_COUNT = 5440 as const;
export const GUIDE_CONDITION_MAX_FILE_BYTES = 6 * 1024 * 1024;
const MISSION_SOURCE_SHA = 'f13958b52234f4cda92f0dd0bfff50be8a7f6625c8478785e2a077a5c7933d24';
const BASE_SEARCH_SHA = '26c29bc0df15161602d75578c9842c5b7cca56caee0d6dd1031180949cceb30d';
const CONDITION_FILE = 'ddv_Data/StreamingAssets/itemlist/Condition.json';
const ID = /^[1-9][0-9]{0,15}$/;
const HASH = /^[a-f0-9]{64}$/;
const OWN=(object:Raw,key:string):boolean=>Object.prototype.hasOwnProperty.call(object,key);
const isObject=(x:unknown):x is Raw=>x!==null&&typeof x==='object'&&!Array.isArray(x);
function requireValid(value:unknown,code:string):asserts value{
  if (!value) throw new TypeError('Guide Condition: ' + code);
}
function provenance(source:unknown):boolean{
  return isObject(source) && source.file === CONDITION_FILE &&
    source.sha256 === GUIDE_CONDITION_SOURCE_SHA &&
    source.bytes === GUIDE_CONDITION_SOURCE_BYTES &&
    source.formatProbeSha256 === GUIDE_CONDITION_PROBE_SHA;
}
function target(value:unknown):boolean{
  return isObject(value) && value.gameVersion === '1.26.2' && value.platform === 'Steam';
}

/** Preserve exact branch, source location and current predicate. No implication
 * that a Condition is used as a quest prerequisite or that its state is true.
 * The standalone function is testable with synthetic records; full provenance
 * is enforced by importCurrentGuideConditions before any result is displayed.
 */
export function indexStaticConditionMentions(records:unknown,{extended=false}:{extended?:boolean}={}):IndexedConditionMentions{
  requireValid(Array.isArray(records) && records.length > 0 && records.length <= 10000,
    'invalid Condition source census');
  const seen=new Set<string>();
  const byMission=new Map<string,CurrentConditionMention[]>();
  const kindCounts=new Map<string,number>();
  let total = 0, explicitStepLeaves = 0, commonPointers = 0;
  let missionReferenceLeaves = 0, nonStepMissionReferenceLeaves = 0;
  const missionReferencesByKind=new Map<string,number>();
  const referencedMissions=new Set<string>();
  const pushMention=(missionId:string,row:CurrentConditionMention):void=>{
    if (!byMission.has(missionId)) byMission.set(missionId, []);
    byMission.get(missionId)!.push(row);
    // Only original MissionStepStatus references participate in the v1 census.
  };
  const walk=(tree:Raw,original:Raw,path:string,depth:number):void=>{
    requireValid(depth <= 16 && isObject(tree) &&
      ['AND', 'OR', 'NOT'].includes(tree.operator) && typeof tree.operatorExplicit === 'boolean' &&
      HASH.test(tree.sourceTreeWireSha256) && Array.isArray(tree.children) &&
      tree.children.length <= 256, 'invalid source condition tree');
    for (const [i, leaf] of tree.children.entries()) {
      requireValid(isObject(leaf) && leaf.ordinal === i &&
        typeof leaf.kind === 'string' && leaf.kind.length > 0 && leaf.kind.length <= 100 &&
        Number.isSafeInteger(leaf.sourceTag) && leaf.sourceTag > 0 &&
        HASH.test(leaf.payloadSha256), 'invalid native Condition leaf');
      total++;
      requireValid(total <= 20000, 'Condition leaf count limit');
      kindCounts.set(leaf.kind, (kindCounts.get(leaf.kind) || 0) + 1);
      const branch = `${path}.children[${i}]`;
      if (leaf.kind === 'SubConditions') {
        requireValid(leaf.sourceTag === 10 && isObject(leaf.nested), 'invalid SubConditions source tag');
        walk(leaf.nested, original, branch + '.nested', depth + 1);
      } else {
        requireValid(!OWN(leaf, 'nested'), 'unexpected nested source payload');
      }
      if (leaf.kind === 'CommonConditions') {
        requireValid(leaf.sourceTag === 5, 'invalid common-condition tag');
        if (OWN(leaf, 'commonConditionId')) {
          requireValid(typeof leaf.commonConditionId === 'string' && ID.test(leaf.commonConditionId),
            'invalid common-condition reference');
          commonPointers++;
        }
      }
      if (extended && Object.hasOwn(MISSION_REFERENCE_TAGS, leaf.kind) &&
          leaf.kind !== 'MissionStepStatus') {
        requireValid(leaf.sourceTag === MISSION_REFERENCE_TAGS[leaf.kind] &&
          typeof leaf.missionId === 'string' && ID.test(leaf.missionId),
          'invalid v2 source-typed mission ID/kind');
        for (const prop of ['stepId','subStepId','objectiveId']) {
          if (OWN(leaf,prop)) requireValid(Number.isSafeInteger(leaf[prop]) && leaf[prop] >= 0,
            'invalid v2 native step/substep/objective ID');
        }
        if (OWN(leaf,'stepId') && STEP_REFERENCE_KINDS.has(leaf.kind)) {
          requireValid(leaf.nativeStepIdVerified === true, 'unverified current Mission step ID');
        }
        if (OWN(leaf,'inversed')) requireValid(typeof leaf.inversed === 'boolean',
          'invalid source inversed flag');
        if (OWN(leaf,'missionStateCode')) requireValid(leaf.kind === 'MissionStatus' &&
          Number.isSafeInteger(leaf.missionStateCode) && typeof leaf.missionState === 'string',
          'invalid source mission state code');
        if (OWN(leaf,'comparisonOperatorCode')) requireValid(leaf.kind === 'MissionStatus' &&
          Number.isSafeInteger(leaf.comparisonOperatorCode) &&
          typeof leaf.comparisonOperator === 'string', 'invalid source mission comparison');
        missionReferenceLeaves++;
        nonStepMissionReferenceLeaves++;
        missionReferencesByKind.set(leaf.kind,(missionReferencesByKind.get(leaf.kind)||0)+1);
        pushMention(leaf.missionId, {
          conditionId:original.id,sourceName:original.sourceName,
          conditionWireSha256:original.nativeWireSha256,
          sourcePath:branch,operator:tree.operator,kind:leaf.kind,
          ...(OWN(leaf,'stepId') ? {stepId:leaf.stepId} : {}),
          ...(OWN(leaf,'subStepId') ? {subStepId:leaf.subStepId} : {}),
          ...(OWN(leaf,'objectiveId') ? {objectiveId:leaf.objectiveId} : {}),
          ...(OWN(leaf,'inversed') ? {inversed:leaf.inversed} : {}),
          ...(OWN(leaf,'missionStateCode') ? {missionStateCode:leaf.missionStateCode,
            missionState:leaf.missionState} : {}),
          ...(OWN(leaf,'comparisonOperatorCode') ? {comparisonOperatorCode:leaf.comparisonOperatorCode,
            comparisonOperator:leaf.comparisonOperator} : {})
        });
        continue;
      }
      if (leaf.kind !== 'MissionStepStatus') continue;
      requireValid(leaf.sourceTag === 285 &&
        ['source_explicit_fields_only','opaque_unexpected_wire_shape'].includes(leaf.scalarInterpretation),
        'invalid MissionStepStatus source tag/interpretation');
      if (leaf.scalarInterpretation === 'opaque_unexpected_wire_shape') continue;
      requireValid(Array.isArray(leaf.omittedSourceFields) &&
        leaf.omittedSourceFields.every(x => ['missionId','stepId','statusCode'].includes(x)),
        'invalid omitted source fields');
      for (const field of ['missionId','stepId','statusCode']) {
        requireValid(leaf.omittedSourceFields.includes(field) !== OWN(leaf, field),
          'optional source field inference mismatch');
      }
      if (OWN(leaf, 'stepId')) requireValid(Number.isSafeInteger(leaf.stepId) && leaf.stepId >= 0,
        'invalid source step ID');
      if (OWN(leaf, 'statusCode')) requireValid(Number.isSafeInteger(leaf.statusCode) && leaf.statusCode >= 0 &&
        typeof leaf.sourceStatusName === 'string' && leaf.sourceStatusName.length <= 80,
        'invalid source status code');
      if (OWN(leaf, 'missionId')) requireValid(typeof leaf.missionId === 'string' && ID.test(leaf.missionId),
        'invalid source mission ID');
      explicitStepLeaves++;
      if (!OWN(leaf, 'missionId')) continue;
      referencedMissions.add(leaf.missionId);
      if (extended) {
        if (OWN(leaf,'stepId')) requireValid(leaf.nativeStepIdVerified === true,
          'unverified original MissionStepStatus native step');
        missionReferenceLeaves++;
        missionReferencesByKind.set(leaf.kind,(missionReferencesByKind.get(leaf.kind)||0)+1);
      }
      pushMention(leaf.missionId, {
        conditionId: original.id, sourceName: original.sourceName,
        conditionWireSha256: original.nativeWireSha256,
        sourcePath: branch, operator: tree.operator, kind: 'MissionStepStatus',
        ...(OWN(leaf, 'stepId') ? {stepId: leaf.stepId} : {}),
        ...(OWN(leaf, 'statusCode') ? {statusCode: leaf.statusCode, status: leaf.sourceStatusName} : {}),
        omittedSourceFields: leaf.omittedSourceFields
      });
    }
  };
  for (const row of records) {
    requireValid(isObject(row) && typeof row.id === 'string' && ID.test(row.id) &&
      !seen.has(row.id) && Number.isSafeInteger(row.nativeFrameIndex) && row.nativeFrameIndex >= 0 &&
      typeof row.sourceName === 'string' && row.sourceName.length > 0 && row.sourceName.length <= 1024 &&
      HASH.test(row.nativeWireSha256), 'invalid or duplicate source Condition');
    seen.add(row.id);
    walk(row.conditions, row, 'conditions', 0);
  }
  return {byMission, census: {
    ...(extended ? {
      missionReferenceLeaves, nonStepMissionReferenceLeaves,
      missionReferencesByKind:Object.fromEntries([...missionReferencesByKind.entries()]
        .sort(([a],[b])=>a.localeCompare(b)))
    } : {}),
    definitionCount: seen.size,
    kindTotal: total,
    sourceKinds: Object.fromEntries([...kindCounts.entries()].sort(([a],[b]) => a.localeCompare(b))),
    missionStepStatusExplicitScalarLeaves: explicitStepLeaves,
    commonConditionPointerLeaves: commonPointers,
    distinctMissionIdsInExplicitStepReferences: referencedMissions.size
  }};
}

/** File names are exact, to avoid accidentally pairing unrelated JSON files. */
async function readSelectedJson(file:GuideSourceFile,expectedName:string,maxSize:number):Promise<{sha:string;json:Raw}>{
  requireValid(file?.name === expectedName && Number.isSafeInteger(file.size) &&
    file.size > 0 && file.size <= maxSize && typeof file.arrayBuffer === 'function',
    `invalid selected ${expectedName}`);
  const raw = await file.arrayBuffer();
  requireValid(raw.byteLength === file.size, 'selected file changed during read');
  requireValid(!!globalThis.crypto?.subtle, 'SHA-256 not available');
  const sha = Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', raw)))
    .map(byte => byte.toString(16).padStart(2,'0')).join('');
  const json = JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
  return {sha, json};
}

/** Accept only the already source-hash-pinned 1.26.1 Mission/locale bridge.
 * Independent Condition data is never relabelled as old Mission information.
 */
export function assertGuideConditionBridge(bridge:unknown):void{
  requireValid(isObject(bridge) && bridge.baselineVersion === '1.26.1' &&
    bridge.targetVersion === '1.26.2' &&
    bridge.originalSearchIndexSha256 === BASE_SEARCH_SHA &&
    Array.isArray(bridge.compatibleFamilies) && bridge.compatibleFamilies.includes('Mission.json') &&
    bridge.compatibleFamilies.includes('LocDB (8 payloads)') &&
    bridge.conditionDefinitionsEquivalent === false &&
    bridge.localePayloadsEqual === 8,
    'current Condition registry requires the exact verified Mission/locale bridge');
}

export async function importCurrentGuideConditions(indexFile:GuideSourceFile,manifestFile:GuideSourceFile,verifiedBridge:unknown):Promise<CurrentGuideConditions>{
  assertGuideConditionBridge(verifiedBridge);
  const isV2 = indexFile?.name === 'condition-native-index-v2.json';
  const indexName = isV2 ? 'condition-native-index-v2.json' : 'condition-native-index.json';
  const manifestName = isV2 ? 'condition-native-index-manifest-v2.json' :
    'condition-native-index-manifest.json';
  const [indexRaw, manifestRaw] = await Promise.all([
    readSelectedJson(indexFile, indexName, GUIDE_CONDITION_MAX_FILE_BYTES),
    readSelectedJson(manifestFile, manifestName, 128 * 1024)
  ]);
  const data = indexRaw.json, manifest = manifestRaw.json;
  requireValid(indexRaw.sha === (isV2 ? GUIDE_CONDITION_INDEX_V2_SHA : GUIDE_CONDITION_INDEX_SHA) &&
    indexFile.size === (isV2 ? GUIDE_CONDITION_INDEX_V2_BYTES : GUIDE_CONDITION_INDEX_BYTES),
    'original private Condition index fingerprint mismatch');
  requireValid(isObject(data) && data.schema === (isV2 ? GUIDE_CONDITION_V2_SCHEMA : GUIDE_CONDITION_SCHEMA) &&
    target(data.target) && provenance(data.source) &&
    data.evaluation === 'static_native_definitions_only' &&
    Array.isArray(data.records) && data.records.length === GUIDE_CONDITION_NATIVE_COUNT,
    'invalid current Condition definition source');
  requireValid(isObject(manifest) && manifest.schema === (isV2 ? GUIDE_CONDITION_V2_MANIFEST_SCHEMA : GUIDE_CONDITION_MANIFEST_SCHEMA) &&
    target(manifest.target) && provenance(manifest.source) &&
    manifest.privateIndexSha256 === indexRaw.sha &&
    manifest.privateIndexBytes === indexFile.size &&
    manifest.conditionFileCoverageComplete === true &&
    manifest.otherGuideFamiliesCoverageComplete === false &&
    manifest.dataPolicy === 'owner_private_not_for_public_distribution' &&
    manifest.limits?.predicatesEvaluated === false &&
    manifest.limits?.runtimeOrSaveStateVerified === false &&
    manifest.limits?.currentStarPathOrLiveEventVerified === false,
    'invalid or mixed-build private Condition manifest');
  if (isV2) {
    const missionSource = data.missionSource;
    requireValid(isObject(missionSource) &&
      missionSource.file === 'ddv_Data/StreamingAssets/itemlist/Mission.json' &&
      missionSource.sha256 === MISSION_SOURCE_SHA &&
      missionSource.bytes === 4373535 && missionSource.records === 1030 &&
      isObject(manifest.missionSource) &&
      Object.entries(missionSource).every(([key,value])=>manifest.missionSource[key] === value) &&
      manifest.limits?.missionReferenceDirection === 'STATIC_SOURCE_MENTION_NOT_PREREQUISITE' &&
      manifest.limits?.missionPredicateTruthEvaluated === false,
      'unverified source Mission join provenance');
  }
  const lookup = indexStaticConditionMentions(data.records, {extended:isV2});
  requireValid(isObject(manifest.counts), 'missing Condition source census');
  for (const [key,value] of Object.entries(lookup.census)) {
    requireValid(((key === 'sourceKinds' || key === 'missionReferencesByKind')
        ? isObject(manifest.counts[key]) &&
          Object.keys(value).length === Object.keys(manifest.counts[key]).length &&
          Object.entries(value).every(([kind,count]) => manifest.counts[key][kind] === count)
        : value === manifest.counts[key]),
      `original Condition source census mismatch: ${key}`);
  }
  if (isV2) requireValid(
    lookup.census.missionReferenceLeaves === GUIDE_CONDITION_V2_MISSION_REFERENCES &&
    lookup.census.nonStepMissionReferenceLeaves === 1858 &&
    Object.keys(lookup.census.missionReferencesByKind??{}).length === 9,
    'unexpected current mission reference census');
  requireValid(lookup.census.definitionCount === GUIDE_CONDITION_NATIVE_COUNT &&
    lookup.census.kindTotal === 9861 &&
    lookup.census.missionStepStatusExplicitScalarLeaves === 3102 &&
    lookup.census.commonConditionPointerLeaves === 275 &&
    lookup.census.distinctMissionIdsInExplicitStepReferences === 421,
    'unexpected current Condition source definition census');
  return {byMission: lookup.byMission, count: lookup.census.definitionCount,
    missionReferenceCount:isV2 ? lookup.census.missionReferenceLeaves! :
      lookup.census.missionStepStatusExplicitScalarLeaves,
    formatVersion:isV2 ? 2 : 1,
    targetVersion:'1.26.2',sourceSha256:GUIDE_CONDITION_SOURCE_SHA,
    indexSha256: indexRaw.sha, evaluation: 'static_native_definitions_only'};
}

/** Bound return size for interactive UI; never fill absent source step/status. */
export function currentConditionMentionsForQuest(conditions:Pick<CurrentGuideConditions,'evaluation'|'byMission'>|null|undefined,questId:string,limit:number=40):CurrentConditionMentionsWindow{
  requireValid(conditions?.evaluation === 'static_native_definitions_only' &&
    typeof questId === 'string' && ID.test(questId) &&
    Number.isSafeInteger(limit) && limit > 0 && limit <= 100,
    'invalid current Condition reference query');
  const rows = conditions.byMission.get(questId) || [];
  return {total: rows.length, rows: rows.slice(0, limit)};
}

/** Enrich Condition mentions only from an already SHA-verified original quest
 * detail record. Never treat an array index or fabricated fallback as a native
 * step ID. Duplicate native step IDs are ambiguous and not linked.
 */
export function withVerifiedConditionStepDetails(detail:unknown,stepRows:readonly CurrentConditionStepDisplay[],mentions:readonly CurrentConditionMention[],questId:string):readonly CurrentConditionMention[]{
  requireValid(Array.isArray(mentions) && mentions.length <= 100 &&
    typeof questId === 'string' && ID.test(questId), 'invalid Condition step lookup');
  if (!isObject(detail) || detail.id !== questId || detail.recordKind !== 'mission' ||
      detail.source?.file !== 'ddv_Data/StreamingAssets/itemlist/Mission.json' ||
      detail.source?.sha256 !== MISSION_SOURCE_SHA ||
      !Array.isArray(detail.structured?.stepsDetailed) ||
      !Array.isArray(stepRows) || stepRows.length !== detail.structured.stepsDetailed.length) {
    return mentions;
  }
  const stepIndex=new Map<number,Pick<CurrentConditionMention,'sourceStepIndex'|'sourceStepName'|'localizedStepDescription'|'localizedStepDescriptionLanguage'>>();
  const ambiguous=new Set<number>();
  for (const [i, original] of detail.structured.stepsDetailed.entries()) {
    const id = original?.stepId;
    if (!Number.isSafeInteger(id) || id < 0 || stepRows[i]?.id !== String(id)) continue;
    if (stepIndex.has(id)) {
      ambiguous.add(id);
      continue;
    }
    stepIndex.set(id, {
      sourceStepIndex: i,
      sourceStepName: typeof original.stepName === 'string' ? original.stepName.slice(0,256) : null,
      localizedStepDescription: typeof stepRows[i].text === 'string' ? stepRows[i].text : '',
      localizedStepDescriptionLanguage: stepRows[i].textSource ?? null
    });
  }
  return mentions.map(mention => {
    if (!Number.isSafeInteger(mention?.stepId) || ambiguous.has(mention.stepId)) return mention;
    const resolved = stepIndex.get(mention.stepId);
    return resolved ? {...mention,...resolved} : mention;
  });
}
