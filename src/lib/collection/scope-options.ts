import type {CollectionFacet} from './runtime';

/** World tabs are presentation labels only, not item membership evidence.
 * Historical IDs came from the validated v1.25 world index. Current-release
 * facets MUST supply an ID with a positive count before a tab is enabled.
 * Keepsake Sea has no verified native ID in that historical index.
 */
const PRESETS = [
  { key:"valley", historicalId:"IsDreamlightValley", labels:{"en":"Dreamlight Valley","fr":"Dreamlight Valley","it":"Dreamlight Valley","de":"Dreamlight Valley","es-ES":"Dreamlight Valley","ja":"ドリームライトバレー","zh-CN":"梦幻星谷","pt-BR":"Dreamlight Valley"} },
  { key:"eternity", historicalId:"IsEternityIsle", labels:{"en":"A Rift in Time","fr":"Île de l'Éternité","it":"Isola dell'Eternità","de":"Insel der Ewigkeit","es-ES":"Isla de la Eternidad","ja":"リフト・イン・タイム","zh-CN":"永恒岛","pt-BR":"Ilha da Eternidade"} },
  { key:"storybook", historicalId:"IsStorybookVale", labels:{"en":"Storybook Vale","fr":"Val­lon des contes","it":"Val­lata delle Fiabe","de":"Tal der Geschichten","es-ES":"Vaguada de los Cuentos","ja":"ストーリーブック・ベール","zh-CN":"故事书谷","pt-BR":"Mundo das Histórias"} },
  { key:"wishblossom", historicalId:"IsWishBlossomMountains", labels:{"en":"Wishblossom Ranch","fr":"Mon­tagnes de Florespérance","it":"Mon­ta­gne Fiordesiderio","de":"Blütenwunschberge","es-ES":"Mon­ta­ñas de Flordeseo","ja":"ウィッシュブロッサム・ランチ","zh-CN":"许愿花山谷","pt-BR":"Montanhas das Inspirações"} },
  { key:"keepsake", historicalId:null, labels:{"en":"The Keepsake Sea","ja":"思い出の海"} },
  { key:"honeyglow", historicalId:"isHoneywood", labels:{"en":"Honeyglow Woods","fr":"Bois de Lumiel","it":"Bosco Mielucente","de":"Honigschimmerwald","es-ES":"Bos­que de Luz Melífera","ja":"ハニーグローの森","zh-CN":"蜜辉森林","pt-BR":"Floresta do Mel Farto"} },
] as const;
type WorldPreset=(typeof PRESETS)[number];
export interface WorldScopeTab {
  key:string;
  id:string;
  label:string;
  available:boolean;
  total:number;
}
function matches(preset:WorldPreset,facet:CollectionFacet):boolean{
  if(preset.historicalId&&facet.id===preset.historicalId)return true;
  // A future release may introduce a new native world ID. Only recognize
  // Keepsake Sea by an explicit source-provided name, never an invented ID.
  if(preset.key==='keepsake'){
    const source=facet.id+' '+facet.label;
    return /keepsake[ _-]*sea|思い出の海/i.test(source);
  }
  return false;
}
export function worldScopeTabs(facets:readonly CollectionFacet[],locale:string):WorldScopeTab[]{
  const used=new Set<string>();
  const tabs:WorldScopeTab[]=PRESETS.map(preset=>{
    const facet=facets.find(f=>!used.has(f.id)&&matches(preset,f));
    if(facet)used.add(facet.id);
    const names=preset.labels as Readonly<Record<string,string>>;
    return {
      key:preset.key,id:facet?.id??'',
      label:facet?.label||names[locale]||names.en||preset.key,
      total:facet?.total??0,
      available:Boolean(facet&&facet.total>0)
    };
  });
  // Never hide an additional source-verified world from a later update.
  for(const facet of facets){
    if(facet.total>0&&!used.has(facet.id))
      tabs.push({key:facet.id,id:facet.id,label:facet.label,total:facet.total,available:true});
  }
  return tabs;
}
