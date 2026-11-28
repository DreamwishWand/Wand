import {entityItemId} from '$lib/items/entity-item-url';
export const match=(param:string)=>entityItemId(param)!==null;
