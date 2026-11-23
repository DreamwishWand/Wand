import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeGuideArchivedStarpaths,guideNativeTitle,guideArchiveTitle} from '../src/lib/guide/starpath-calendar-archive.ts';
import {guideTimelineWindow,guideTimelineRows} from '../src/lib/guide/event-timeline.ts';

test('archive preserves game-original dates, exact UTC and eight native titles',()=>{
  const rows=mergeGuideArchivedStarpaths([]);
  assert.equal(rows.length,9);
  const villains=rows.find(row=>row.id==='archive-starpath-Halloween2022');
  assert.equal(villains.startUtc,'2022-10-19T13:00:00Z');
  assert.equal(villains.taskEndUtcExclusive,'2022-11-22T13:00:00Z');
  assert.equal(villains.endUtcExclusive,'2022-11-29T13:00:00Z');
  assert.equal(villains.sourceUrl,null);
  assert.equal(guideArchiveTitle(villains,'ja'),'「ヴィランズ」スターパス');
  for(const code of ['en','ja','de','fr','it','es-ES','zh-CN','pt-BR']){
    assert.ok(guideNativeTitle('Seafaring2026',code));
    for(const row of rows)assert.ok(guideArchiveTitle(row,code));
  }
  assert.equal(new Set(mergeGuideArchivedStarpaths(rows).map(row=>row.id)).size,rows.length);
  assert.equal(mergeGuideArchivedStarpaths(rows).length,rows.length);
});
test('native date-only exchange windows are separate; unknown hours stay unknown',()=>{
  const rows=mergeGuideArchivedStarpaths([]);
  const parks=rows.find(row=>row.id==='archive-starpath-Parks2022');
  assert.equal(parks.startDay,'2023-04-05');
  assert.equal(parks.taskEndDayInclusive,'2023-05-17');
  assert.equal(parks.endDayInclusive,'2023-05-24');
  assert.equal(parks.officialEndUtc,null);
  const range=guideTimelineWindow(Date.parse('2023-05-15T12:00:00Z'),5,0,'UTC');
  const segments=guideTimelineRows([parks],range)[0].segments;
  assert.deepEqual(segments.map(s=>s.phase),['historic','exchange']);
  assert.ok(Math.abs(segments[0].left+segments[0].width-segments[1].left)<1e-8);
  const centennial=rows.find(row=>row.id==='archive-starpath-D1002022');
  assert.equal(centennial.taskEndDayInclusive,undefined);
});
