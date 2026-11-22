import test from 'node:test';
import assert from 'node:assert/strict';
import {launcherServices} from '../src/lib/ui/services.ts';

test('shell launcher exposes seven unique, non-placeholder destinations',()=>{
  assert.equal(launcherServices.length,7);
  assert.equal(new Set(launcherServices.map(service=>service.key)).size,7);
  assert.equal(launcherServices.find(service=>service.key==='community')?.name,'Community Help Center');
  assert.deepEqual(launcherServices.filter(service=>service.href).map(service=>service.key),['collection','guide']);
  for(const service of launcherServices){
    assert.ok(service.name&&service.icon);
    if(service.href) assert.match(service.href,/^\/[a-z]+\/$/);
    else assert.equal(service.href,null);
  }
});
