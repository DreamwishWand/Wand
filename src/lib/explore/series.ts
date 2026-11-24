import type {ExploreItem} from './model.ts';
import {compareItems,familyOf} from './browse.ts';
export interface ReleaseGroup{key:string;label:string;kind:'shop'|'season';ids:readonly number[]}
export interface SeriesShelf{
  key:string;kind:'shop'|'set'|'theme'|'season'|'style'|'unclassified';
  names?:Readonly<Record<string,string|null>>;label?:string;styleKeys?:readonly string[];
  items:ExploreItem[];
}
// Only explicit, audited English naming patterns, constrained to the original Set ID.
// These are editorial design groups, not claims about simultaneous release dates.
const THEMES:Readonly<Record<number,readonly {key:string;ja:string;en:string;pattern:RegExp}[]>>={
  2040000158:[{key:'gaming',ja:'ゲーミング',en:'Gaming',pattern:/^(?:Gamer |Dreamlight Gaming )/i}],
  2040000278:[{key:'night-thorn',ja:'夜のトゲ・ゲームルーム',en:'Night Thorn arcade',pattern:/^Night Thorn /i}],
  2040000330:[{key:'alpine',ja:'アルプス風',en:'Alpine',pattern:/\bAlpine\b/i},{key:'equestrian',ja:'乗馬・牧場',en:'Equestrian',pattern:/\b(?:Tack Rack|Saddle Rack|Horse Stall|Hitching Post|Wagon Wheel)\b/i}],
  2040000246:[{key:'books',ja:'本・物語',en:'Books & storybooks',pattern:/\b(?:Bookish|Storybook)\b/i},{key:'party',ja:'パーティー',en:'Party',pattern:/\b(?:Party|Disco)\b/i}],
  2040000385:[{key:'shipyard',ja:'海賊・造船所',en:'Pirates & shipyards',pattern:/\b(?:Shipyard|Pirate Ship|Shipwreck|Bell Buoy|Treasure Map)\b/i}],
  2040000390:[{key:'woodland',ja:'森のパッチワーク',en:'Woodland',pattern:/\b(?:Woodland|Honeyleaf)\b/i}],
  2040000361:[{key:'meadow',ja:'平和の草原・ジオラマ',en:'Peaceful Meadow',pattern:/\bPeaceful Meadow\b/i},{key:'topiary',ja:'トピアリー',en:'Topiary',pattern:/\bTopiary\b/i}],
  2040000402:[{key:'observatory',ja:'天文台・星空',en:'Observatory',pattern:/\b(?:Observatory|Armillary Sphere|Stargazer)\b/i}],
  2040000235:[{key:'concert',ja:'コンサート',en:'Concert',pattern:/\b(?:Rock Concert|Rock Drum|Stage Fireworks)\b/i}],
  2040000377:[{key:'stadium',ja:'古代のスタジアム',en:'Ancient Stadium',pattern:/\bAncient Stadium\b/i}],
  2040000298:[{key:'anniversary',ja:'ディズニーランド70周年',en:'Disneyland 70th anniversary',pattern:/\bDisneyland 70th Anniversary\b/i}],
  2040000076:[{key:'nautical',ja:'航海・船舶',en:'Nautical',pattern:/\b(?:Nautical-Themed|Helm Bookshelf|Ship Coffee Table)\b/i}]
};
const coherent=new Set([2040000081,2040000103,2040000104,2040000105,2040000107,2040000108,2040000278]);
const styles=(i:ExploreItem)=>[...new Set(i.tags.filter(([k])=>k==='furnitureStyle').map(([,v])=>v))].sort();
const name=(i:ExploreItem)=>i.names.en??'';
export function seriesShelves(items:readonly ExploreItem[],releases:readonly ReleaseGroup[]=[]):SeriesShelf[]{
  const byId=new Map(items.map(i=>[i.itemId,i]));
  const used=new Set<number>(),groups=new Map<string,SeriesShelf>();
  const put=(s:Omit<SeriesShelf,'items'>,i:ExploreItem)=>{
    const g=groups.get(s.key)??{...s,items:[]};g.items.push(i);groups.set(s.key,g);used.add(i.itemId);
  };
  // Prefer the smallest exact native configured bundle when offers overlap
  // (e.g. deluxe bundle vs its individual component bundles).
  const shops=releases.filter(r=>r.kind==='shop').map(r=>({...r,matched:[...new Set(r.ids)].map(id=>byId.get(id)).filter((i):i is ExploreItem=>!!i)}))
    .filter(r=>r.matched.length>=2).sort((a,b)=>a.ids.length-b.ids.length||a.key.localeCompare(b.key));
  for(const r of shops){const remaining=r.matched.filter(i=>!used.has(i.itemId));if(remaining.length<2)continue;
    for(const i of remaining)put({key:r.key,kind:'shop',label:r.label},i);
  }
  const sets=new Map<number,ExploreItem[]>();
  for(const i of items)if(i.sourceSetItemId!=null){const a=sets.get(i.sourceSetItemId)??[];a.push(i);sets.set(i.sourceSetItemId,a);}
  for(const [id,list] of sets){
    const definition=list.find(i=>i.sourceSetNames?.en)?.sourceSetNames;
    // Do not treat large unnamed or Miscellaneous containers as coherent.
    // A named small set is useful, unless audited to be mixed.
    if(coherent.has(id)||(id!==2040000076&&!THEMES[id]&&list.length>=2&&list.length<=32&&definition?.en)){
      const theme=THEMES[id]?.[0];
      for(const i of list)if(!used.has(i.itemId))put({key:'set:'+id,kind:'set',names:definition??(theme?{ja:theme.ja,en:theme.en}:undefined)},i);
      continue;
    }
    for(const i of list)if(!used.has(i.itemId)){
      const theme=THEMES[id]?.find(t=>t.pattern.test(name(i)));
      if(theme)put({key:'theme:'+id+':'+theme.key,kind:'theme',names:{ja:theme.ja,en:theme.en}},i);
    }
  }
  // A whole Star Path is not necessarily a single design. Keep matching
  // residual rewards together only within the same original style signature.
  for(const r of releases.filter(r=>r.kind==='season')){
    const buckets=new Map<string,ExploreItem[]>();
    for(const id of new Set(r.ids)){const i=byId.get(id);if(!i||used.has(id))continue;
      const s=styles(i).join('|');if(!s)continue;const list=buckets.get(s)??[];list.push(i);buckets.set(s,list);}
    for(const [s,list] of buckets)if(list.length>=2)for(const i of list)put({key:r.key+':'+s,kind:'season',label:r.label,styleKeys:s.split('|')},i);
  }
  for(const i of items)if(!used.has(i.itemId)){
    const s=styles(i);
    // Full original style signature, not the first tag or a fabricated theme.
    // Items without a reliable relation remain visible as unclassified.
    if(s.length)put({key:'style:'+s.join('|'),kind:'style',styleKeys:s},i);
    else put({key:'unclassified:'+familyOf(i),kind:'unclassified',label:familyOf(i)},i);
  }
  const rank={shop:0,set:1,theme:2,season:3,style:4,unclassified:5};
  return [...groups.values()].sort((a,b)=>rank[a.kind]-rank[b.kind]||a.key.localeCompare(b.key)).map(g=>({...g,items:g.items.sort(compareItems)}));
}
export interface DesignTile{key:string;items:ExploreItem[]}
const COLOR=/^(?:black|white|blue|red|green|pink|purple|yellow|orange|gray|grey|brown|beige|tan|pale gray|pale grey|dark wood|medium wood|pale wood|light wood|wooden|gold|silver) /i;
function colorKeys(i:ExploreItem){return [...new Set(i.tags.filter(([k])=>k==='color').map(([,v])=>v))].sort().join('|');}
function nativeColorStem(i:ExploreItem,prefix:string):string|null{
  if(!i.nativeKey||!i.footprintSignature)return null;
  const tokens=i.nativeKey.replace(/([a-z0-9])([A-Z])/g,'$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const words=prefix.toLowerCase().trim().split(/\s+/);
  // Only an explicit identical color token sequence in the source key
  // establishes an independent alternative to a shared prefab.
  const positions=tokens.flatMap((_,idx)=>words.every((w,j)=>tokens[idx+j]===w)?[idx]:[]);
  if(positions.length!==1||tokens.length<=words.length)return null;
  const idx=positions[0];
  return [...tokens.slice(0,idx),...tokens.slice(idx+words.length)].join('_')+':'+i.footprintSignature;
}
function designKeys(i:ExploreItem):string[]{
  const n=name(i),prefix=n.match(COLOR)?.[0],base=n.replace(COLOR,'').trim(),colors=colorKeys(i);
  if(!i.sourceSetItemId||!prefix||!base||!colors)return [];
  const shared=[i.sourceSetItemId,i.nativeCategory,i.subtype,base.toLowerCase(),
    JSON.stringify(i.tags.filter(([k])=>k!=='color').map(([k,v])=>k+':'+v).sort())].join(':');
  const keys:string[]=[];
  if(i.prefabGuid)keys.push('prefab:'+i.prefabGuid+':'+shared);
  const stem=nativeColorStem(i,prefix);
  if(stem)keys.push('native:'+stem+':'+shared);
  return keys;
}
export function designTiles(items:readonly ExploreItem[]):DesignTile[]{
  const candidates=new Map<string,ExploreItem[]>();
  for(const i of items)for(const k of designKeys(i)){const a=candidates.get(k)??[];a.push(i);candidates.set(k,a);}
  const out:DesignTile[]=[],seen=new Set<number>();
  for(const i of items){
    if(seen.has(i.itemId))continue;
    let variants=[i],chosen='item:'+i.itemId;
    for(const k of designKeys(i)){
      const a=(candidates.get(k)??[]).filter(v=>!seen.has(v.itemId));
      if(a.length>variants.length&&new Set(a.map(colorKeys)).size===a.length){variants=a;chosen='design:'+k;}
    }
    for(const v of variants)seen.add(v.itemId);
    out.push({key:chosen,items:variants});
  }
  return out;
}

/** A series determines adjacency only. No separate visual shelf or row break. */
export function orderedSeriesDesigns(groups:readonly SeriesShelf[]):DesignTile[]{
  return groups.flatMap(group=>designTiles(group.items).map(tile=>({
    ...tile,key:group.key+':'+tile.key
  })));
}
