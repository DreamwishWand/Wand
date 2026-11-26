/** Shared publication-byte contract, without auth/transport side effects.
 * A server must invoke the same validation with its own trusted catalog.
 * Never accept metadata, hashes or counts asserted by an uploading client.
 */
import {validateShareablePreset,createPresetShareCatalog} from './preset-public.ts';
import {presetHeader,type PresetKind,type PresetSchema} from './preset-session-format.ts';
import {presetItems} from './preset-items.ts';
import {compactPresetFile,readPresetText,PRESET_MAX_BYTES} from './preset-file.ts';
type Catalog=ReturnType<typeof createPresetShareCatalog>;
type ContentType='application/json'|'application/gzip';
export interface PublicPresetReceipt{
 schemaVersion:2;schema:PresetSchema;kind:PresetKind;gameVersion:'1.26.2';byteSize:number;contentType:ContentType;
 checksumSha256:string;distinctObjectTypes:number;totalObjects:number;
}
async function checksum(file:Blob){
 const h=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());
 return [...new Uint8Array(h)].map(n=>n.toString(16).padStart(2,'0')).join('');
}
async function contentType(file:Blob):Promise<ContentType>{
 const b=new Uint8Array(await file.slice(0,2).arrayBuffer());
 return b[0]===31&&b[1]===139?'application/gzip':'application/json';
}
async function receipt(file:Blob,raw:string):Promise<PublicPresetReceipt>{
 const header=presetHeader(raw),counts=presetItems(raw);
 if(header.domain!=='wand'||header.privateBackup||!counts)throw Error('PRESET_PUBLIC_CONTENT');
 return {schemaVersion:2,schema:header.schema,kind:header.kind,gameVersion:'1.26.2',byteSize:file.size,contentType:await contentType(file),
  checksumSha256:await checksum(file),distinctObjectTypes:counts.size,totalObjects:[...counts.values()].reduce((a,b)=>a+b,0)};
}
export async function preparePublicPreset(file:Blob,name:string,catalog:Catalog,maxBytes=PRESET_MAX_BYTES){
 const raw=validateShareablePreset(await readPresetText(file),catalog);
 const packed=await compactPresetFile(raw,name);if(!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>PRESET_MAX_BYTES||packed.size>maxBytes)throw Error('PRESET_PUBLIC_SIZE');
 return {file:packed,receipt:await receipt(packed,raw)};
}
/** Verify retrieved bytes before adding them to the local library. No
 * remote response can select an editor operation or write to a Save. */
export async function verifyPublicPreset(file:Blob,expected:PublicPresetReceipt,catalog:Catalog):Promise<string>{
 if(!expected||expected.schemaVersion!==2||expected.gameVersion!=='1.26.2'||file.size!==expected.byteSize||file.size>PRESET_MAX_BYTES||!(/^[0-9a-f]{64}$/).test(expected.checksumSha256))throw Error('PRESET_PUBLIC_RECEIPT');
 // Check exact bytes before decompression. Recompute every public field
 // instead of trusting declared content type, item counts or facet.
 if(await checksum(file)!==expected.checksumSha256)throw Error('PRESET_PUBLIC_CHECKSUM');
 const raw=validateShareablePreset(await readPresetText(file),catalog),actual=await receipt(file,raw);
 for(const key of Object.keys(actual) as (keyof PublicPresetReceipt)[])if(actual[key]!==expected[key])throw Error('PRESET_PUBLIC_RECEIPT');
 return raw;
}
