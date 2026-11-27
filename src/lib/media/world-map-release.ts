import {parsePublishedWorldMapParts,type PublishedWorldMap} from './public-world-map-parts.ts';

export type PublishedMapRelease=Readonly<{gameVersion:string;maps:readonly PublishedWorldMap[]}>;
export function readWorldMapRelease(doc:unknown,gameVersion:string):PublishedMapRelease|null{
  if(doc!==null&&typeof doc==='object'&&'state' in doc&&doc.state==='unpublished')return null;
  return parsePublishedWorldMapParts(doc,gameVersion);
}
let release:Promise<PublishedMapRelease|null>|null=null;
export function loadWorldMapRelease(gameVersion:string):Promise<PublishedMapRelease|null>{
  if(gameVersion!=='1.26.2')return Promise.resolve(null);
  if(!release)release=import('../../../data/ddv/media/world-map-parts-steam-1.26.2.json',{with:{type:'json'}})
    .then(({default:doc})=>readWorldMapRelease(doc,gameVersion))
    .catch(error=>{release=null;throw error;});
  return release;
}
