import projection from './character-house-exteriors.json' with {type:'json'};
const ids:ReadonlySet<number>=new Set(projection.itemIds);
export const characterHouseExterior=(id:number):boolean=>ids.has(id);
