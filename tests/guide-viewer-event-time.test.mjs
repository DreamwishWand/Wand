import test from 'node:test';
import assert from 'node:assert/strict';
import {viewerEventDateTime} from '../src/lib/guide/viewer-event-time.ts';

test('confirmed source timestamps display in the viewer timezone, not server/JST time',()=>{
  const original='2026-12-01T14:00:00Z';
  assert.match(viewerEventDateTime(original,'Asia/Tokyo'),/2026\/12\/01.*23:00.*GMT\+9/);
  assert.match(viewerEventDateTime(original,'America/Los_Angeles'),/2026\/12\/01.*06:00.*GMT-8/);
  assert.match(viewerEventDateTime(original,'Europe/Paris'),/2026\/12\/01.*15:00.*GMT\+1/);
  assert.match(viewerEventDateTime(original,'UTC'),/2026\/12\/01.*14:00.*GMT/);
});
test('zone-offset daylight-saving transition is derived from each instant',()=>{
  assert.match(viewerEventDateTime('2026-07-01T14:00:00Z','America/Los_Angeles'),/07\/01.*07:00.*GMT-7/);
  assert.match(viewerEventDateTime('2026-01-01T14:00:00Z','America/Los_Angeles'),/01\/01.*06:00.*GMT-8/);
  assert.throws(()=>viewerEventDateTime('2026-12-01'),/invalid original UTC boundary/);
  assert.throws(()=>viewerEventDateTime('2026-02-30T14:00:00Z'),/invalid original UTC boundary/);
  assert.throws(()=>viewerEventDateTime('2026-12-01T14:00:00Z','Unknown/Timezone'),RangeError);
});
