import test from 'node:test';
import assert from 'node:assert/strict';
import {get} from 'svelte/store';
import {rememberPreset,sessionPresets,removeSessionPreset} from '../src/lib/presets/preset-session.ts';
import {compactPresetFile} from '../src/lib/presets/preset-file.ts';
test('compressed file stays one entry when reopened, with decoded size accounted',async()=>{
 const raw=JSON.stringify({schema:'wand.preset.scene@1',gameVersion:'1.26.2',factor:1,anchor:'corner',items:[{itemId:40000001,dx:0,dy:0,orientation:2}]});
 const file=await compactPresetFile(raw,'test.json');
 const [a,b]=await Promise.all([rememberPreset(file),rememberPreset(file)]);
 assert.equal(a.id,b.id);assert.equal(await a.file.text(),raw);
 assert.equal((await rememberPreset(a.file)).id,a.id);
 assert.equal(get(sessionPresets).length,1);
 removeSessionPreset(a.id);const c=await rememberPreset(file);assert.notEqual(c.id,a.id);removeSessionPreset(c.id);
});
