import test from 'node:test';import assert from 'node:assert/strict';
import {testSaveExportEnabled} from '../src/lib/world/test-save-export.ts';
test('experimental copy UI and worker require an explicit test origin and path',()=>{
 for(const url of ['https://dreamwishwand.github.io/Wand/world/','https://dreamwishwand.github.io/Wand/_app/immutable/workers/abc.js','http://127.0.0.1:4178/Wand/world/'])assert.equal(testSaveExportEnabled(new URL(url)),true);
 for(const url of ['https://dreamwishwand.com/Wand/world/','https://dreamwishwand.github.io/other/','https://dreamwishwand.github.io.evil.example/Wand/','https://dreamwishwand.github.io/Wand-other/','https://localhost.example/Wand/','http://dreamwishwand.github.io/Wand/'])assert.equal(testSaveExportEnabled(new URL(url)),false);
 assert.equal(testSaveExportEnabled(null),false);
});
