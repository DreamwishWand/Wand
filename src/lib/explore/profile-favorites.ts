import type {CollectionState} from '../collection/runtime';
/** Read exactly the active profile; never combine separate workspaces. */
export function profileFavorites(state:CollectionState){
  const workspace=state.workspaces.find(w=>w.id===state.active);
  if(!workspace)throw Error('COLLECTION_WORKSPACE_NOT_FOUND');
  const ids=new Set<number>();
  for(const [key,entry] of Object.entries(workspace.entries)){
    const id=Number(key);
    if(Number.isSafeInteger(id)&&id>0&&String(id)===key&&entry.favorite===true)ids.add(id);
  }
  return {id:workspace.id,name:workspace.name,workspaceCount:state.workspaces.length,ids};
}
