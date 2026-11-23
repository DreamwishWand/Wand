/**
 * Wand final-stack guard: existing legacy modules are migration debt.
 * Forbid adding new handwritten product JS/MJS; generated WASM glue and Node
 * development tools are not product business modules.
 */
import {readdir,readFile} from 'node:fs/promises';
import {resolve,relative,join} from 'node:path';
const root=resolve(new URL('../..',import.meta.url).pathname);
const knownLegacy=new Set([
  "src/lib/acquisition/catalog-evidence.mjs",
  "src/lib/acquisition/conditional-ingredient-sell-fallback.mjs",
  "src/lib/acquisition/db00-join.mjs",
  "src/lib/acquisition/index.mjs",
  "src/lib/acquisition/ingredient-source-row-coverage.mjs",
  "src/lib/acquisition/meal-ingredient-sell-evidence.mjs",
  "src/lib/acquisition/meal-price-evidence.mjs",
  "src/lib/acquisition/native-dynamic-cache-lifecycle.mjs",
  "src/lib/acquisition/native-meal-percent-component.mjs",
  "src/lib/acquisition/native-meal-price-route.mjs",
  "src/lib/acquisition/native-meal-total-value-stage.mjs",
  "src/lib/acquisition/native-sell-formula-candidates.mjs",
  "src/lib/acquisition/native-sell-provider-plan.mjs",
  "src/lib/acquisition/native-serialized-sell-provider.mjs",
  "src/lib/acquisition/native-tag-evidence.mjs",
  "src/lib/acquisition/native-tag-locales.mjs",
  "src/lib/acquisition/planner.mjs",
  "src/lib/acquisition/private-browser-bundle.mjs",
  "src/lib/acquisition/private-cooking-star-settings.mjs",
  "src/lib/acquisition/private-dynamic-price-cache.mjs",
  "src/lib/acquisition/private-recipe-selectors.mjs",
  "src/lib/acquisition/private-shop-prices.mjs",
  "src/lib/acquisition/private-stall-price-overlap.mjs",
  "src/lib/acquisition/quest-item-bridge.mjs",
  "src/lib/acquisition/source-price-currency.mjs",
  "src/lib/acquisition/stall-catalog.mjs",
  "src/lib/acquisition/stall-save.mjs",
  "src/lib/acquisition/world-store-collection.mjs",
  "src/lib/acquisition/world-store-save.mjs",
  "src/lib/collection/catalog.mjs",
  "src/lib/collection/private-db01-names-view.mjs",
  "src/lib/collection/private-db01-names-worker-core.mjs",
  "src/lib/collection/private-db01-names.worker.mjs",
  "src/lib/collection/private-db01-release.mjs",
  "src/lib/collection/private-db01-zip.mjs",
  "src/lib/collection/private-p1g-codec.js",
  "src/lib/collection/safe-profile-json.mjs",
  "src/lib/collection/saved-collection-discovery.mjs",
  "src/lib/collection/saved-collection-presence.mjs",
  "src/lib/collection/saved-grid-furniture-references.mjs",
  "src/lib/collection/saved-list-positive-ownership.mjs",
  "src/lib/collection/saved-store-preview.mjs",
  "src/lib/collection/saved-store-worker-core.mjs",
  "src/lib/collection/saved-store.worker.mjs",
  "src/lib/collection/saved-world-db04-join-worker-core.mjs",
  "src/lib/collection/saved-world-db04-join.mjs",
  "src/lib/collection/saved-world-db04-join.worker.mjs",
  "src/lib/game-db/client.mjs",
  "src/lib/game-db/model.mjs",
  "src/lib/guide/client.mjs",
  "src/lib/guide/current-conditions.mjs",
  "src/lib/guide/event-calendar.mjs",
  "src/lib/guide/public-characters.mjs",
  "src/lib/guide/public-guide.mjs",
  "src/lib/guide/public-starpath-daily.mjs",
  "src/lib/guide/public-starpath-goals.mjs",
  "src/lib/guide/public-starpath-locales.mjs",
  "src/lib/guide/public-starpath.mjs",
  "src/lib/guide/public-targets.mjs",
  "src/lib/guide/shard-fingerprints.mjs",
  "src/lib/guide/source-composite.mjs",
  "src/lib/guide/starpath-public-media.mjs",
  "src/lib/guide/starpath-reward-extras.mjs",
  "src/lib/guide/starpath-reward-names.mjs",
  "src/lib/save/achievement-links.mjs",
  "src/lib/save/achievement-progress.mjs",
  "src/lib/save/catalog-links.mjs",
  "src/lib/save/clean-baseline.mjs",
  "src/lib/save/clean-regression.mjs",
  "src/lib/save/db00-join.mjs",
  "src/lib/save/diagnostic-view.mjs",
  "src/lib/save/duty-milestones.mjs",
  "src/lib/save/editor-handoff.mjs",
  "src/lib/save/editor-readset.mjs",
  "src/lib/save/guide-links.mjs",
  "src/lib/save/redacted-witness.mjs",
  "src/lib/save/references.mjs",
  "src/lib/save/registry.mjs",
  "src/lib/save/save-amount-preview.worker.mjs",
  "src/lib/save/save-diagnostics-worker-core.mjs",
  "src/lib/save/save-diagnostics.worker.mjs",
  "src/lib/save/save-native-p1g-audit.mjs",
  "src/lib/save/save-wasm-reference.mjs",
  "src/lib/ui/collect-window.mjs",
  "src/lib/world/catalog.mjs",
  "src/lib/world/local-snapshot.mjs",
  "src/lib/world/oblique.mjs",
  "src/lib/world/preview-views.mjs",
  "src/lib/world/world-preview.worker.mjs"
]);
async function visit(dir) {
  const rows=[];
  for(const entry of await readdir(dir,{withFileTypes:true})) {
    if(entry.name==='wasm' || entry.name==='node_modules') continue;
    const path=join(dir,entry.name);
    if(entry.isDirectory()) rows.push(...await visit(path));
    else if(entry.isFile()) rows.push(relative(root,path).split('\\').join('/'));
  }
  return rows;
}
const paths=[...await visit(join(root,'src/lib')),...await visit(join(root,'src/routes'))];
const handwritten=paths.filter(path=>/\.(?:mjs|js)$/.test(path) &&
  !/\.test\.mjs$/.test(path) && !/\.spec\.mjs$/.test(path));
const additions=handwritten.filter(path=>!knownLegacy.has(path));
if(additions.length) {
  console.error('ARCHITECTURE_VIOLATION: new handwritten product JS/MJS is forbidden.');
  console.error('Use Rust/WASM for Save and computational domain logic; TypeScript for UI and Worker/API orchestration.');
  for(const path of additions) console.error('  '+path);
  process.exitCode=1;
} else {
  console.log('Existing migration debt: '+handwritten.length+'/'+knownLegacy.size+
    ' JS/MJS modules; no new handwritten production JS added.');
}


// The new DB-05 encrypted-file reader must run Rust in a TypeScript Worker.
// This does not claim that the rest of the existing JS migration debt is gone.
const readSource=async path=>readFile(join(root,path),'utf8');
const [diagWorker,diagCore,diagRoute,p1gRust]=await Promise.all([
  readSource('src/lib/save/save-diagnostics.worker.ts'),
  readSource('src/lib/save/save-diagnostics-worker-core.mjs'),
  readSource('src/routes/save/diagnostics/+page.svelte'),
  readSource('src/lib/save/p1g-read.ts')
]);
const rustOnlyChecks=[
  [diagWorker.includes("from './p1g-read.ts'")&&
    diagWorker.includes('decodeP1gRustOnly'),
   'Save Diagnostics Worker must import Rust-only P1G decoder'],
  [diagWorker.includes('inspectLocalSaveDiagnosticsBytes(')&&
    diagWorker.includes('decodeP1gRustOnly)'),
   'Save Diagnostics must inject strict Rust decoder'],
  [!diagWorker.includes('private-p1g-codec')&&
   !diagWorker.includes('decodeP1gPackagedProfile'),
   'Save Diagnostics Worker must not use legacy JS codec'],
  [diagRoute.includes('save-diagnostics.worker.ts'),
   'Save Diagnostics UI must launch typed Worker'],
  [diagCore.includes('decodeEncryptedProfile(bytes)'),
   'Diagnostic core must use injected Worker decoder'],
  [p1gRust.includes('export async function decodeP1gRustOnly')&&
   p1gRust.includes('return decodeP1gRustFirst(source, false)')&&
   p1gRust.includes('if (!allowLegacyUnsupportedEnvelope)')&&
   p1gRust.indexOf('if (!allowLegacyUnsupportedEnvelope)')<
    p1gRust.indexOf("await import('../collection/private-p1g-codec.js')"),
   'Strict Rust-only policy must reject unsupported ZIP before JS import']
];
for(const [ok,reason] of rustOnlyChecks){
  if(!ok){console.error('ARCHITECTURE_VIOLATION: '+reason);process.exitCode=1;}
}
if(!rustOnlyChecks.some(([ok])=>!ok))
  console.log('Save Diagnostics: typed Worker + Rust-only P1G, no JS fallback.');
