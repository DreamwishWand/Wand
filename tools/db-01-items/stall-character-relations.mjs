/** Build-only source-backed stall relations. Original universe tags are
 * immutable; a separate browsing association may fill an unresolved stall.
 * Staff, unlock conditions and visual themes are distinct concepts.
 */
import {existsSync,readFileSync} from 'node:fs';
import {join} from 'node:path';

const check=(ok,code)=>{if(!ok)throw Error('DB01_STALL_SOURCE_'+code)};
const namedStalls=new Map([
  ['Remy_Kitchen',[10000018,2000500004]],
  ['Kristoff_Stall',[10000070,2000500005]],
  ['Eric_Stall',[10000052,2000500014]],
  ['Mulan_Stall',[10000115,2000500061]],
  ['Tiana_Stall',[10000125,2000500037]]
]);
const uniq=a=>[...new Set(a)].sort((a,b)=>a-b);
export function loadStallCharacterRelations(project,source,byId){
  const version=source.target.gameVersion;
  check(/^\d+\.\d+\.\d+$/.test(version),'VERSION');
  const root=join(project,'data/ddv/item-master');
  const paths=[join(root,'stall-character-source-steam-'+version+'.json'),
    join(root,'stall-character-source-steam-1.26.2.json')];
  const result=new Map();
  const path=paths.find(p=>existsSync(p));
  if(!path)return result;
  const d=JSON.parse(readFileSync(path,'utf8'));
  check(d.schema==='wand.db01.stall-character-source@1'&&d.target.platform==='Steam'&&
    d.fieldContract.nativeClass==='StallBuildingItemData'&&d.fieldContract.employeeField===7&&
    d.fieldContract.unlockField===11&&d.fieldContract.characterTagField===12&&
    Object.keys(d.sourceFiles).length===3,'SCHEMA');
  const matches=['Building','Character','Tag'].every(k=>
    typeof d.sourceFiles[k]==='string'&&d.sourceFiles[k]===source.sourceFilesSha256[k]);
  // Unchanged originals can reuse the relation projection on later updates.
  // Changed originals must be re-extracted, never silently reused.
  if(!matches){check(d.target.gameVersion!==version,'SOURCE_SHA');return result;}
  const buildings=[...byId.values()].filter(r=>r.nativeCategory==='Building');
  const stalls=buildings.filter(r=>r.itemType.subtypeCode===1);
  check(buildings.length===d.coverage.buildingDefinitions&&
    stalls.length===d.coverage.stallDefinitions&&d.rows.length===stalls.length,'CENSUS');
  let prev=0,employeeLinked=0,unlockLinked=0,characterLinked=0;
  for(const [i,employees,unlock] of d.rows){
    const row=byId.get(i);
    check(Number.isSafeInteger(i)&&i>prev&&row?.nativeCategory==='Building'&&
      row.itemType.subtypeCode===1&&row.sourceClass==='StallBuildingItemData'&&
      Array.isArray(employees)&&employees.every(c=>c===0||byId.get(c)?.nativeCategory==='Character')&&
      (unlock===null||Number.isSafeInteger(unlock)&&byId.has(unlock)),'ROW_'+i);
    prev=i;
    const staff=employees.filter(c=>c!==0);
    const unlockCharacter=byId.get(unlock)?.nativeCategory==='Character'?unlock:null;
    const characters=uniq([...staff,...(unlockCharacter===null?[]:[unlockCharacter])]);
    if(staff.length)employeeLinked++;
    if(unlockCharacter!==null)unlockLinked++;
    if(characters.length)characterLinked++;
    const directTags=c=>uniq((byId.get(c)?.tags??[])
      .filter(t=>t.sourceField===12&&t.id>=2000500000&&t.id<2000600000&&byId.get(t.id)?.nativeCategory==='Tag')
      .map(t=>t.id));
    const associations=characters.map(c=>({characterItemId:c,
      employee:staff.includes(c),unlockCondition:unlockCharacter===c,
      universeTagIds:directTags(c)}));
    // Only explicitly named character-specific families, with a matching
    // positive source employee and direct character universe tag. Generic
    // Goofy stalls, all event stalls, and unlock-only relations are not themes.
    const stem=row.nativeKey.replace(/^(?:Expansion0[1-4]|Mini01)!/,'');
    const named=namedStalls.get(stem);
    const candidate=named&&staff.length===1&&staff[0]===named[0]&&
      directTags(named[0]).length===1&&directTags(named[0])[0]===named[1]
      ?{characterItemId:named[0],universeTagId:named[1],kind:'named_stall_character_association'}:null;
    result.set(i,{employees,unlock,associations,
      relatedUniverseTagIds:uniq(associations.flatMap(a=>a.universeTagIds)),
      candidate,applied:!!candidate&&!row.universeTagIds.length});
  }
  check(result.size===stalls.length&&employeeLinked===d.coverage.employeeLinked&&
    unlockLinked===d.coverage.unlockLinked&&characterLinked===d.coverage.characterLinked,'RELATION_CENSUS');
  if(version==='1.26.2')check([...result.values()].filter(r=>r.candidate).length===20,'NAMED_CENSUS');
  console.log('DB01_STALL_UNIVERSE '+JSON.stringify({stalls:result.size,employeeLinked,
    unlockLinked,characterLinked,namedCandidates:[...result.values()].filter(r=>r.candidate).length,
    applied:[...result.values()].filter(r=>r.applied).length}));
  return result;
}
