import {nativeActionBlocked,sourceEditRestrictions} from './native-edit-restrictions.ts';
import type {DesignCatalogItem} from './design-layout.ts';
export function buildingDesignEligible(itemId:number,definition:unknown,free=false){
 if(!Number.isSafeInteger(itemId)||Math.floor(itemId/10_000_000)!==2||![0,1,2,3,5].includes(Math.floor((itemId%10_000_000)/100_000))||!definition||typeof definition!=='object')return false;
 const d=definition as {nativeType?:unknown;footprint?:unknown};
 return d.nativeType==='Building'&&!!d.footprint&&(free||!nativeActionBlocked(sourceEditRestrictions(d),'select'));
}
export function designCatalogCategory(item:DesignCatalogItem){return item.nativeType==='Building'?'building':item.layer;}
export const buildingDesignWords={
 ja:'建物・家',en:'Buildings & houses',fr:'Bâtiments et maisons',it:'Edifici e case',de:'Gebäude und Häuser','es-ES':'Edificios y casas','zh-CN':'建筑与房屋','pt-BR':'Edifícios e casas'
} as const;
