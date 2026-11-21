import rules from '../../../data/ddv/save/catalog-link-rules.v1.json' with { type: 'json' };

export const SAVE_CROSS_CATALOG_CONTRACT = 'wand.db05.db01-db04-readonly-link@1';
export const SAVE_CROSS_CATALOG_AUDIT_CONTRACT = 'wand.db05.db01-db04-redacted-audit@1';
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const validId = value => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
const KEY = /^[1-9][0-9]*$/;
const MAX_REFERENCES_PER_FAMILY = 256;
const MAX_DISTINCT_ITEM_LOOKUPS = 128;
const MAX_INDEX_BRANCH = 512;
const MAX_NODE_VISITS = 16384;

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
freeze(rules);

/**
 * Inspect public *templates* only. Never build a path containing private
 * map keys, names, item instances or underlying save values.
 */
function collect(root, family, cap) {
  const tokens = family.path.slice(1).split('/');
  const values = [];
  let sampled = false, typeIssues = 0, visits = 0, absent = 0;
  function descend(node, index) {
    if (visits >= MAX_NODE_VISITS) { sampled = true; return; }
    if (values.length >= cap) { sampled = true; return; }
    visits++;
    if (index === tokens.length) { values.push(node); return; }
    const token = tokens[index];
    if (/^\{[A-Za-z][A-Za-z0-9]*\}$/.test(token)) {
      if (!isRecord(node)) { typeIssues++; return; }
      const keys = Object.keys(node);
      if (keys.length > MAX_INDEX_BRANCH) sampled = true;
      for (const key of keys.slice(0, MAX_INDEX_BRANCH)) {
        if (values.length >= cap || visits >= MAX_NODE_VISITS) { sampled = true; break; }
        if (index === tokens.length - 1 && family.extraction === 'canonical_map_key') {
          values.push(key);
        } else descend(node[key], index + 1);
      }
      return;
    }
    if (token.endsWith('[]')) {
      if (!isRecord(node)) { typeIssues++; return; }
      const name = token.slice(0, -2);
      if (!has(node, name)) { absent++; return; }
      if (!Array.isArray(node[name])) { typeIssues++; return; }
      const rows = node[name];
      if (rows.length > MAX_INDEX_BRANCH) sampled = true;
      for (const row of rows.slice(0, MAX_INDEX_BRANCH)) {
        if (values.length >= cap || visits >= MAX_NODE_VISITS) { sampled = true; break; }
        descend(row, index + 1);
      }
      return;
    }
    if (!isRecord(node)) { typeIssues++; return; }
    if (!has(node, token)) { absent++; return; }
    descend(node[token], index + 1);
  }
  descend(root, 0);
  return { values, sampled, typeIssues, absent };
}
function normalizeReference(family, value) {
  if (family.extraction === 'canonical_map_key') {
    if (typeof value !== 'string' || !KEY.test(value) ||
        !Number.isSafeInteger(Number(value)) || String(Number(value)) !== value)
      return { type: 'malformed' };
    return { type: 'id', value: Number(value) };
  }
  if (family.extraction === 'integer_value') {
    // 0 is sometimes an empty item/scene sentinel; it never means an owned item.
    if (value === 0) return { type: 'zero_sentinel' };
    if (!validId(value)) return { type: 'malformed' };
    return { type: 'id', value };
  }
  if (family.extraction === 'exact_source_path') {
    if (typeof value !== 'string' || !value.trim()) return { type: 'malformed' };
    // No path normalization: a fuzzy path hit is not native source evidence.
    return { type: 'path', value };
  }
  return { type: 'malformed' };
}
function validateConsumers(db01, db04) {
  if (!isRecord(db01) || !isRecord(db01.source) ||
      db01.source.privateOnly !== true ||
      typeof db01.source.gameVersion !== 'string' ||
      !/^[0-9]+\.[0-9]+\.[0-9]+$/.test(db01.source.gameVersion) ||
      typeof db01.source.nativeSourceManifestSha256 !== 'string' ||
      !/^[0-9a-f]{64}$/.test(db01.source.nativeSourceManifestSha256) ||
      typeof db01.getItem !== 'function') {
    throw new TypeError('DB05_PRIVATE_DB01_CLIENT_REQUIRED');
  }
  if (!isRecord(db04) || !isRecord(db04.manifest) ||
      db04.manifest.schema !== 'wand.db04.world@1' ||
      db04.manifest.status !== 'partial_game_native_evidence' ||
      typeof db04.manifest.gameVersion !== 'string' ||
      !/^[0-9]+\.[0-9]+\.[0-9]+$/.test(db04.manifest.gameVersion) ||
      !(db04.objects instanceof Map) || !(db04.scenes instanceof Map) ||
      !(db04.grids instanceof Map)) {
    throw new TypeError('DB05_PARTIAL_DB04_CATALOG_REQUIRED');
  }
}
function validRoot(save) {
  return isRecord(save) && isRecord(save.GameInfo) &&
    isRecord(save.Player) && isRecord(save.World);
}
function resolveWorld(db04, type, value) {
  const key = String(value);
  return type === 'scene' ? db04.scenes.get(key) ?? null :
    type === 'grid_source' ? db04.grids.get(value) ?? null : null;
}
function snapshotSummary(family, observation) {
  return {
    id: family.id, catalog: family.catalog, path: family.path,
    observed: observation.values.length, matched: 0,
    db01Matches: 0, db04Matches: 0, bothCatalogsMatch: 0,
    unclassifiedDefinitions: 0, unresolvedInPartialCatalog: 0,
    notLookedUp: 0, zeroSentinels: 0, malformed: 0,
    typeIssues: observation.typeIssues, sampled: observation.sampled,
    status: 'not_observed', catalogCoverageComplete: false,
    sourceAndSaveJointlyVerified: false, writerAuthorized: false
  };
}
function classify(summary) {
  summary.status = summary.malformed || summary.typeIssues ? 'observed_type_issue' :
    summary.sampled || summary.notLookedUp ? 'sampled_inconclusive' :
    !summary.observed ? 'not_observed' :
    summary.unresolvedInPartialCatalog ? 'partial_catalog_unresolved' :
    summary.zeroSentinels && summary.zeroSentinels === summary.observed ?
      'zero_sentinels_only' : 'catalog_id_candidates';
  return Object.freeze(summary);
}

/**
 * Connect pre-existing *private* DB-01 byte-SHA-verified lazy ID buckets to
 * pre-existing *partial* DB-04 native worlds. Neither database is copied.
 *
 * Versions are diagnostics, NOT save-schema gates. Cross-version match is
 * never asserted even if individual IDs happen to be equal.
 */
export function createSaveSourceCatalogBridge(db01, db04) {
  validateConsumers(db01, db04);
  const source = Object.freeze({
    itemCatalogGameVersion: db01.source.gameVersion,
    worldCatalogGameVersion: db04.manifest.gameVersion,
    sourceVersionLabelsEqual: db01.source.gameVersion === db04.manifest.gameVersion,
    sourceAndSaveJointlyVerified: false, crossCatalogProvenanceVerified: false,
    catalogCoverageComplete: false, gameExecutableAttested: false,
    writerAuthorized: false, ownershipVerified: false, exportAuthorized: false
  });
  const memo = new Map();
  async function lookupItemPrivate(id) {
    if (memo.has(id)) return memo.get(id);
    const lookup = (async () => {
      let result;
      try { result = await db01.getItem(id); }
      catch { throw new TypeError('DB05_PRIVATE_DB01_LOOKUP_FAILED'); }
      if (result !== null && (!isRecord(result) || result.itemId !== id ||
          !['item','definition_unclassified'].includes(result.catalogDomain)))
        throw new TypeError('DB05_DB01_ITEM_ID_MISMATCH');
      return result;
    })();
    memo.set(id, lookup);
    try { return await lookup; }
    catch (error) { memo.delete(id); throw error; }
  }
  /** Explicit caller-side lookup; raw item ID is never included in bulk audit. */
  async function lookupItem(id) {
    if (!validId(id)) throw new TypeError('DB05_EXACT_POSITIVE_ITEM_ID_REQUIRED');
    const item = await lookupItemPrivate(id);
    const worldObject = db04.objects.get(String(id)) ?? null;
    if (worldObject !== null &&
        (!isRecord(worldObject) || worldObject.itemId !== id))
      throw new TypeError('DB05_DB04_OBJECT_ID_MISMATCH');
    return Object.freeze({
      itemId: id, db01Item: item, db04WorldObject: worldObject,
      classification: item && worldObject ? 'both_partial_catalogs_candidate' :
        item ? 'db01_id_candidate' :
        worldObject ? 'db04_world_object_candidate' : 'unresolved_in_partial_catalogs',
      nativeDefinitionClass: item?.catalogDomain ?? null,
      sourceVersionLabelsEqual: source.sourceVersionLabelsEqual,
      sourceAndSaveJointlyVerified: false, crossCatalogProvenanceVerified: false,
      ownershipVerified: false, writerAuthorized: false, exportAuthorized: false
    });
  }
  /**
   * Redacted aggregates: no map keys, actual IDs, save fields outside the
   * explicit rule list, item names or native grid source paths are emitted.
   */
  async function auditSave(decoded, options = {}) {
    const cap = options.maxPerFamily ?? MAX_REFERENCES_PER_FAMILY;
    const maxIds = options.maxDistinctItemLookups ?? MAX_DISTINCT_ITEM_LOOKUPS;
    if (!Number.isSafeInteger(cap) || cap < 1 || cap > MAX_REFERENCES_PER_FAMILY ||
        !Number.isSafeInteger(maxIds) || maxIds < 1 || maxIds > MAX_DISTINCT_ITEM_LOOKUPS)
      throw new TypeError('DB05_CATALOG_AUDIT_LIMIT_INVALID');
    if (!validRoot(decoded)) throw new TypeError('DB05_SAVE_ROOT_STRUCTURE_INVALID');
    const observations = rules.families.map(rule => collect(decoded, rule, cap));
    const ids = new Set();
    for (let i = 0; i < rules.families.length; i++) {
      if (rules.families[i].catalog !== 'item') continue;
      for (const raw of observations[i].values) {
        const entry = normalizeReference(rules.families[i], raw);
        if (entry.type === 'id') ids.add(entry.value);
      }
    }
    const listedIds = [...ids];
    const eligible = listedIds.slice(0, maxIds);
    const permitted = new Set(eligible);
    const found = new Map();
    // SHA-checked private client loads at most one bucket per ID, cached by
    // its own implementation. Small batches bound simultaneous file loads.
    for (let i=0;i<eligible.length;i+=8) {
      const batch=eligible.slice(i,i+8);
      const resolved = await Promise.all(batch.map(id=>lookupItemPrivate(id)));
      for (let j=0;j<batch.length;j++) found.set(batch[j],resolved[j]);
    }
    const summaries = [];
    for (let i=0;i<rules.families.length;i++) {
      const family=rules.families[i], observation=observations[i];
      const summary=snapshotSummary(family,observation);
      for (const raw of observation.values) {
        const x=normalizeReference(family,raw);
        if (x.type==='malformed') { summary.malformed++; continue; }
        if (x.type==='zero_sentinel') { summary.zeroSentinels++; continue; }
        if (family.catalog==='item') {
          if (!permitted.has(x.value)) { summary.notLookedUp++; summary.sampled=true; continue; }
          const item=found.get(x.value), worldObject=db04.objects.get(String(x.value)) ?? null;
          if (worldObject!==null &&
              (!isRecord(worldObject) || worldObject.itemId!==x.value))
            throw new TypeError('DB05_DB04_OBJECT_ID_MISMATCH');
          if (item) {
            summary.db01Matches++;
            if (item.catalogDomain==='definition_unclassified')
              summary.unclassifiedDefinitions++;
          }
          if (worldObject) summary.db04Matches++;
          if (item && worldObject) summary.bothCatalogsMatch++;
          if (item || worldObject) summary.matched++;
          else summary.unresolvedInPartialCatalog++;
        } else {
          if (resolveWorld(db04,family.catalog,x.value)) {
            summary.matched++;
            summary.db04Matches++;
          } else summary.unresolvedInPartialCatalog++;
        }
      }
      summaries.push(classify(summary));
    }
    const unresolved=summaries.some(x=>x.status==='partial_catalog_unresolved');
    const badTypes=summaries.some(x=>x.status==='observed_type_issue');
    const incomplete=summaries.some(x=>x.status==='sampled_inconclusive' ||
      x.status==='not_observed' || x.status==='zero_sentinels_only');
    const status=badTypes?'observed_type_issue':unresolved?'partial_catalog_unresolved':
      incomplete?'inconclusive':'catalog_id_candidates';
    return Object.freeze({
      contract: SAVE_CROSS_CATALOG_AUDIT_CONTRACT, status,
      families: Object.freeze(summaries),
      examinedFamilies: rules.families.length,
      distinctItemIdsExamined: eligible.length,
      distinctItemIdsUnexamined: listedIds.length-eligible.length,
      source,
      sourceMismatchObserved: !source.sourceVersionLabelsEqual,
      compatibilityBasis: 'exact_item_id_and_exact_native_source_path_only',
      allExistingItemsVerified: false, sourceAndSaveJointlyVerified: false,
      catalogCoverageComplete: false, worldPositionVerified: false,
      placementPermissionVerified: false, ownershipVerified: false,
      writerAuthorized: false, exportAuthorized: false
    });
  }
  return Object.freeze({
    contract: SAVE_CROSS_CATALOG_CONTRACT, source,
    lookupItem, auditSave
  });
}
export function getSaveCatalogLinkRules() { return rules; }
